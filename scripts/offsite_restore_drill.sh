#!/usr/bin/env bash
# Disaster-recovery rehearsal from the off-site copy (#213).
#
# Runs the real recovery path end to end without touching production:
# downloads the newest backup from S3 into an empty directory (no local
# backups involved), restores it with restore_db.sh into a throwaway
# PostgreSQL container that has no network, and compares the result with the
# live database. With --negative it also checks that a wrong key, rejected
# credentials, a missing bucket and a damaged archive all fail loudly and
# leave the target database as it was.
#
#   sudo bash scripts/offsite_restore_drill.sh [--negative]
#
# Prints counts, revisions and timings only; no secrets, no row contents.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LIVE_DB_CONTAINER="${POSTGRES_CONTAINER:-buyerly-db}"
API_CONTAINER="${API_CONTAINER:-buyerly-api}"
DRILL_CONTAINER="buyerly-restore-drill"
DRILL_DB="buyerly_restore_drill"
RUN_NEGATIVE=false

case "${1:-}" in
    "") ;;
    --negative) RUN_NEGATIVE=true ;;
    *)
        echo "Usage: $0 [--negative]"
        exit 1
        ;;
esac

# shellcheck source=scripts/backup_env.sh
source "${SCRIPT_DIR}/backup_env.sh"
load_backup_env
missing_s3=$(missing_offsite_keys)
[[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]] || missing_s3="${missing_s3} BACKUP_ENCRYPTION_KEY"
if [[ -n "${missing_s3// /}" ]]; then
    echo "[ERROR] The drill restores the real off-site copy; these settings are empty: ${missing_s3}"
    exit 1
fi

live_sql() {
    docker exec "${LIVE_DB_CONTAINER}" psql --username=buyerly --dbname=buyerly \
        --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="$1"
}
drill_sql() {
    docker exec "${DRILL_CONTAINER}" psql --username=buyerly --dbname="${DRILL_DB}" \
        --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="$1"
}

failures=0
check() {
    # check <description> <condition result: ok|anything else>
    if [[ "$2" == "ok" ]]; then
        echo "  [OK]   $1"
    else
        echo "  [FAIL] $1"
        failures=$((failures + 1))
    fi
}

if docker inspect "${DRILL_CONTAINER}" >/dev/null 2>&1; then
    echo "[ERROR] Container ${DRILL_CONTAINER} already exists (a previous drill?). Remove it with: docker rm -f ${DRILL_CONTAINER}"
    exit 1
fi

# A clean recovery location: an empty backup directory on disk (not /tmp,
# which may be RAM-backed), removed together with the container on exit.
work_dir=$(umask 077; mktemp -d "${APP_DIR}/.offsite_drill.XXXXXX")
cleanup() {
    docker rm -f "${DRILL_CONTAINER}" >/dev/null 2>&1 || true
    rm -rf -- "${work_dir}"
    echo "[INFO] Drill environment removed (container ${DRILL_CONTAINER}, ${work_dir})."
}
trap cleanup EXIT

started=$(date +%s)
code_version=$(git -C "${APP_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)
image=$(docker inspect --format '{{.Config.Image}}' "${LIVE_DB_CONTAINER}")
echo "[INFO] Code ${code_version}; starting throwaway ${image} without network as ${DRILL_CONTAINER}..."
docker run --detach --name "${DRILL_CONTAINER}" --network none --memory 256m \
    --env POSTGRES_USER=buyerly \
    --env POSTGRES_DB="${DRILL_DB}" \
    --env POSTGRES_PASSWORD="$(od -An -tx1 -N16 /dev/urandom | tr -d ' \n')" \
    "${image}" >/dev/null
for _ in $(seq 1 60); do
    # The image's init script restarts the server once; wait for the final one.
    if docker exec "${DRILL_CONTAINER}" pg_isready -U buyerly -d "${DRILL_DB}" -h 127.0.0.1 >/dev/null 2>&1; then
        break
    fi
    sleep 1
done
docker exec "${DRILL_CONTAINER}" pg_isready -U buyerly -d "${DRILL_DB}" -h 127.0.0.1 >/dev/null

restore_into_drill() {
    BACKUP_DIR="${work_dir}/backups" bash "${SCRIPT_DIR}/restore_db.sh" "$@" \
        --target-container "${DRILL_CONTAINER}" --target-db "${DRILL_DB}" --target-user buyerly --yes
}

echo "[INFO] Downloading the newest off-site backup into an empty directory and restoring it..."
mkdir -p "${work_dir}/backups"
restore_started=$(date +%s)
restore_log="${work_dir}/restore.log"
if ! restore_into_drill --download-latest-offsite > "${restore_log}" 2>&1; then
    cat "${restore_log}"
    echo "[FAIL] Restore from the off-site copy failed."
    exit 1
fi
restore_seconds=$(( $(date +%s) - restore_started ))
grep -E '^\[(INFO|SUCCESS)\]|Source file' "${restore_log}" | sed 's/^/  /'
source_name=$(sed -n 's/^ Source file: *//p' "${restore_log}" | xargs -r basename)

echo
echo "=== Results ==="
echo "Backup restored: ${source_name}"
[[ "${source_name}" =~ ^buyerly_postgres_([0-9]{8})_([0-9]{6})\.sql\.gz\.enc$ ]] && encrypted=ok || encrypted=no
check "the newest off-site object is an encrypted .sql.gz.enc" "${encrypted}"
if [[ "${source_name}" =~ ^buyerly_postgres_([0-9]{4})([0-9]{2})([0-9]{2})_([0-9]{2})([0-9]{2})([0-9]{2}) ]]; then
    m=("${BASH_REMATCH[@]}")
    # Backup names use the server's local time, like `date` below.
    backup_epoch=$(date -d "${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}" +%s)
    age_minutes=$(( ($(date +%s) - backup_epoch) / 60 ))
    echo "Backup taken:   ${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]} server time, ${age_minutes} min before this drill"
fi
echo "Restore took:   ${restore_seconds} s (download, verification and apply)"

live_rev=$(live_sql "SELECT version_num FROM alembic_version")
drill_rev=$(drill_sql "SELECT version_num FROM alembic_version")
echo "Alembic:        live ${live_rev}, restored ${drill_rev}"
[[ -n "${drill_rev}" && "${drill_rev}" == "${live_rev}" ]] && r=ok || r=no
check "restored schema is at the live Alembic revision" "${r}"

tables_sql="SELECT string_agg(table_name, ',' ORDER BY table_name) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
[[ "$(drill_sql "${tables_sql}")" == "$(live_sql "${tables_sql}")" ]] && r=ok || r=no
check "same set of tables as the live database" "${r}"

fk_sql="SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace"
live_fk=$(live_sql "${fk_sql}")
drill_fk=$(drill_sql "${fk_sql}")
# Constraints are recreated after the data is loaded, so every restored row
# already satisfied each foreign key; equal counts mean none was dropped.
[[ "${drill_fk}" == "${live_fk}" ]] && r=ok || r=no
check "all ${live_fk} foreign keys restored and valid (restored: ${drill_fk})" "${r}"

echo "Row counts (restored / live now; live may have grown since the backup):"
for table in users workspaces workspace_members meta_connections accounts rule_presets rule_groups audit_events analytics_entity_daily_facts; do
    printf '  %-30s %8s / %s\n' "${table}" "$(drill_sql "SELECT count(*) FROM ${table}")" "$(live_sql "SELECT count(*) FROM ${table}")"
done
[[ "$(drill_sql "SELECT count(*) FROM users")" -gt 0 ]] && r=ok || r=no
check "restored database has users" "${r}"
echo "Newest restored audit event: $(drill_sql "SELECT coalesce(max(created_at)::text, 'none') FROM audit_events")"

# Meta tokens are encrypted with META_TOKEN_ENCRYPTION_KEY, which lives in
# .env, not in the backup. Decrypt every restored token with the running
# app's key to prove the restored data is usable; only counts are printed.
token_counts=$(drill_sql "
    SELECT access_token_encrypted FROM meta_connections WHERE coalesce(access_token_encrypted, '') <> ''
    UNION ALL
    SELECT access_token_encrypted FROM accounts WHERE coalesce(access_token_encrypted, '') <> ''" \
    | docker exec -i "${API_CONTAINER}" python -c '
import sys
from core.meta_tokens import MetaTokenError, decrypt_meta_token
ok = bad = 0
for line in sys.stdin:
    if not line.strip():
        continue
    try:
        decrypt_meta_token(line.strip())
        ok += 1
    except MetaTokenError:
        bad += 1
print(ok, bad)
')
read -r tokens_ok tokens_bad <<< "${token_counts}"
echo "Meta tokens:    ${tokens_ok} decrypt with the app's key, ${tokens_bad} do not"
[[ "${tokens_bad}" == "0" ]] && r=ok || r=no
check "every restored Meta token is readable by the app" "${r}"

if [[ "${RUN_NEGATIVE}" == "true" ]]; then
    echo
    echo "=== Failure cases (each must fail and leave the restored database unchanged) ==="
    fingerprint_sql="SELECT (SELECT count(*) FROM users) || '/' || (SELECT count(*) FROM audit_events) || '/' || (SELECT version_num FROM alembic_version)"
    before=$(drill_sql "${fingerprint_sql}")
    expect_failure() {
        # expect_failure <description> <expected output pattern> <command...>
        local description="$1" pattern="$2" output status
        shift 2
        set +e
        output=$("$@" 2>&1)
        status=$?
        set -e
        if [[ ${status} -ne 0 ]] && grep -qE -- "${pattern}" <<< "${output}" \
                && [[ "$(drill_sql "${fingerprint_sql}")" == "${before}" ]]; then
            check "${description}: exit ${status}, database unchanged" ok
        else
            check "${description}: exit ${status}, expected /${pattern}/" no
            sed 's/^/      /' <<< "${output}" | tail -n 5
        fi
    }
    # Each case runs in a subshell so the broken setting does not leak; an
    # exported non-empty value wins over .env inside restore_db.sh.
    wrong_key() { ( export BACKUP_ENCRYPTION_KEY=wrong-drill-key; restore_into_drill --download-latest-offsite ); }
    wrong_secret() { ( export S3_SECRET_ACCESS_KEY=wrong-drill-secret; restore_into_drill --download-latest-offsite ); }
    missing_bucket() { ( export S3_BUCKET="${S3_BUCKET}-missing-drill"; restore_into_drill --download-latest-offsite ); }
    expect_failure "wrong encryption key" "Target database was not changed" wrong_key
    expect_failure "rejected credentials" "HTTP 40[13]" wrong_secret
    expect_failure "missing bucket" "HTTP 40[34]|NoSuchBucket" missing_bucket
    mkdir -p "${work_dir}/damaged"
    python3 "${SCRIPT_DIR}/offsite_sync.py" --download-latest --dest-dir "${work_dir}/damaged" >/dev/null
    damaged=$(find "${work_dir}/damaged" -name 'buyerly_postgres_*' | head -n 1)
    truncate -s "$(( $(stat -c %s "${damaged}") / 2 ))" "${damaged}"
    expect_failure "damaged (truncated) archive" "Target database was not changed" \
        restore_into_drill --file "${damaged}"
fi

echo
total_seconds=$(( $(date +%s) - started ))
echo "Drill took ${total_seconds} s in total on code ${code_version}."
if (( failures > 0 )); then
    echo "[FAIL] ${failures} check(s) failed."
    exit 1
fi
echo "[SUCCESS] The off-site backup restores into a working database."
