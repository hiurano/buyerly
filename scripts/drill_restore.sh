#!/usr/bin/env bash
# Restores a local backup into a throwaway database next to production and
# checks, stage by stage, that the running release could work on it (#204):
#
#   1. archive      restore_db.sh decrypts and unpacks it, finds pg_dump's end
#                   marker and applies it in one transaction;
#   2-5.            python -m database.restore_check in the API container:
#                   schema version (policy in that module), schema contract,
#                   data (foreign keys, users, workspaces), application read.
#
#   bash scripts/drill_restore.sh [backup file]
#
# Prints one line per stage; restore_db.sh's own log is shown only if it fails.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/opt/buyerly/backups}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-buyerly-db}"
API_CONTAINER="${API_CONTAINER:-buyerly-api}"
POSTGRES_USER="${POSTGRES_USER:-buyerly}"
DRILL_DB="${DRILL_DB:-buyerly_restore_drill}"
BACKUP_FILE="${1:-}"

# Fail-Safe Gate: Never allow running drill against production database
if [[ "${DRILL_DB}" == "buyerly" ]]; then
    echo "[FATAL] drill_restore.sh is strictly forbidden from using production database name 'buyerly'."
    exit 1
fi

# The database holds the sandbox; the API container runs the release's checks.
for container in "${POSTGRES_CONTAINER}" "${API_CONTAINER}"; do
    state=$(docker inspect -f '{{.State.Status}}' "${container}" 2>/dev/null || true)
    if [[ "${state}" != "running" ]]; then
        echo "[ERROR] Container '${container}' is not running (state: '${state:-missing}')."
        exit 1
    fi
done

if [[ -z "${BACKUP_FILE}" ]]; then
    BACKUP_FILE=$(ls -t "${BACKUP_DIR}"/buyerly_postgres_*.sql* 2>/dev/null | head -n 1 || true)
    if [[ -z "${BACKUP_FILE}" ]]; then
        echo "[ERROR] No backup file found in ${BACKUP_DIR}."
        exit 1
    fi
fi
if [[ ! -f "${BACKUP_FILE}" ]]; then
    echo "[ERROR] Backup file does not exist: ${BACKUP_FILE}"
    exit 1
fi

admin_sql() {
    docker exec "${POSTGRES_CONTAINER}" psql --username="${POSTGRES_USER}" --dbname=postgres \
        --no-psqlrc --quiet --set=ON_ERROR_STOP=1 --command="$1" >/dev/null 2>&1
}

work_dir=$(umask 077; mktemp -d)
cleanup() {
    admin_sql "DROP DATABASE IF EXISTS ${DRILL_DB} WITH (FORCE);" || true
    rm -rf -- "${work_dir}"
}
trap cleanup EXIT

started=$(date +%s)
backup_name=$(basename "${BACKUP_FILE}")
backup_size=$(numfmt --to=iec "$(stat -c %s "${BACKUP_FILE}")" | sed -E 's/([0-9])([KMGT])?$/\1 \2B/')
backup_age=""
if [[ "${backup_name}" =~ ^buyerly_postgres_([0-9]{4})([0-9]{2})([0-9]{2})_([0-9]{2})([0-9]{2})([0-9]{2}) ]]; then
    m=("${BASH_REMATCH[@]}")
    # Backup names use the server's local time, like `date` here.
    if taken=$(date -d "${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}" +%s 2>/dev/null); then
        minutes=$(( (started - taken) / 60 ))
        if (( minutes < 60 )); then
            backup_age=", taken ${minutes} min ago"
        else
            backup_age=", taken $(( minutes / 60 )) h $(( minutes % 60 )) min ago"
        fi
    fi
fi

echo "Buyerly restore drill"
echo "  Backup:   ${backup_name} (${backup_size}${backup_age})"
echo "  Sandbox:  database ${DRILL_DB} in ${POSTGRES_CONTAINER}, removed afterwards"
echo "  Checks:   the release running in ${API_CONTAINER}"
echo

if ! admin_sql "DROP DATABASE IF EXISTS ${DRILL_DB} WITH (FORCE);" \
        || ! admin_sql "CREATE DATABASE ${DRILL_DB};"; then
    echo "[ERROR] Cannot create the sandbox database ${DRILL_DB}."
    exit 1
fi

restore_log="${work_dir}/restore.log"
if ! POSTGRES_CONTAINER="${POSTGRES_CONTAINER}" POSTGRES_DB="${DRILL_DB}" POSTGRES_USER="${POSTGRES_USER}" \
        bash "${SCRIPT_DIR}/restore_db.sh" --file "${BACKUP_FILE}" --target-container "${POSTGRES_CONTAINER}" \
        --target-db "${DRILL_DB}" --target-user "${POSTGRES_USER}" --yes > "${restore_log}" 2>&1; then
    echo "  [FAIL] archive: the backup did not decrypt, unpack or apply:"
    sed 's/^/         /' "${restore_log}"
    echo
    echo "[FAIL] Restore drill failed at the archive stage."
    exit 1
fi
echo "  [OK]   archive: decrypted, unpacked, complete dump applied in one transaction"

if ! docker exec "${API_CONTAINER}" python -m database.restore_check --database "${DRILL_DB}"; then
    echo
    echo "[FAIL] Restore drill failed: the backup unpacks, but this release cannot run on the restored database."
    exit 1
fi


# Row counts for the record (#199): restored copy next to the live database.
# Informational only; live may have grown since the backup was taken.
count_rows() {
    docker exec "${POSTGRES_CONTAINER}" psql --username="${POSTGRES_USER}" --dbname="$1" \
        --no-psqlrc --tuples-only --no-align --command="SELECT count(*) FROM $2" 2>/dev/null || echo "?"
}
echo
echo "  Rows (restored / live now):"
for table in users workspaces workspace_members meta_connections accounts rule_presets audit_events analytics_entity_daily_facts; do
    printf '    %-30s %8s / %s\n' "${table}" "$(count_rows "${DRILL_DB}" "${table}")" "$(count_rows buyerly "${table}")"
done

echo
echo "[SUCCESS] The backup restores into a database this release can run on ($(( $(date +%s) - started )) s)."
