#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/opt/buyerly/backups}"
DATA_DIR="${DATA_DIR:-/opt/buyerly/data}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-buyerly-db}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
KEEP_BACKUPS="${KEEP_BACKUPS:-30}"
BACKUP_LOCK_FILE="${BACKUP_LOCK_FILE:-/tmp/buyerly-backup.lock}"

CHECK_CONFIG_ONLY=false
case "${1:-}" in
    "") ;;
    --check-config) CHECK_CONFIG_ONLY=true ;;
    *)
        echo "Usage: $0 [--check-config]"
        exit 1
        ;;
esac

# shellcheck source=scripts/backup_env.sh
source "${SCRIPT_DIR}/backup_env.sh"
load_backup_env
OFFSITE_RETENTION_DAYS="${OFFSITE_RETENTION_DAYS:-60}"

# Offsite is on as soon as S3 credentials are filled in (.env.example ships
# the endpoint and bucket, not the keys). From then on a missing piece is an
# error: the old code quietly skipped the upload, and a nightly job that
# looks fine but never leaves the box is worse than one that fails.
offsite_enabled=false
config_errors=()
if [[ -n "${S3_ACCESS_KEY_ID:-}" || -n "${S3_SECRET_ACCESS_KEY:-}" ]]; then
    offsite_enabled=true
    missing_s3=$(missing_offsite_keys)
    if [[ -n "${missing_s3}" ]]; then
        config_errors+=("off-site upload is configured, but these are empty: ${missing_s3}")
    fi
    if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
        config_errors+=("off-site upload needs BACKUP_ENCRYPTION_KEY; plaintext dumps are not sent off the server")
    fi
fi
if [[ ! "${OFFSITE_RETENTION_DAYS}" =~ ^[1-9][0-9]*$ ]]; then
    config_errors+=("OFFSITE_RETENTION_DAYS must be a positive whole number of days")
fi

# Names and modes only: key values must never reach the cron log.
encryption_mode="off (BACKUP_ENCRYPTION_KEY is empty, dumps are plaintext)"
[[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]] && encryption_mode="on"
offsite_mode="off (S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are empty)"
[[ "${offsite_enabled}" == "true" ]] && offsite_mode="on, retention ${OFFSITE_RETENTION_DAYS} days"
echo "[INFO] Backup settings from ${BACKUP_ENV_SOURCE:-the environment}: encryption ${encryption_mode}; off-site ${offsite_mode}."

if (( ${#config_errors[@]} > 0 )); then
    for error in "${config_errors[@]}"; do
        echo "[ERROR] ${error}." >&2
    done
    echo "[ERROR] Backup settings are incomplete; no backup was made." >&2
    exit 1
fi
if [[ "${CHECK_CONFIG_ONLY}" == "true" ]]; then
    echo "[SUCCESS] Backup settings are consistent."
    exit 0
fi

# Concurrency lock to prevent race conditions
exec 9>"${BACKUP_LOCK_FILE}"
if ! flock -n 9; then
    echo "[WARNING] Another backup process is currently running. Skipping."
    exit 0
fi

# Dumps stay on disk and are plaintext without BACKUP_ENCRYPTION_KEY.
umask 077
mkdir -p "${BACKUP_DIR}"
# We hold the lock, so any unfinished file is from a run that was killed
# before its trap could fire (SIGKILL, power loss).
rm -f -- "${BACKUP_DIR}"/.incomplete_buyerly_postgres_*

postgres_state=$(docker inspect -f '{{.State.Status}}' "${POSTGRES_CONTAINER}" 2>/dev/null || true)
if [[ "${postgres_state}" != "running" ]]; then
    echo "[INFO] PostgreSQL container '${POSTGRES_CONTAINER}' is not running (state: '${postgres_state:-missing}'). Skipping backup."
    exit 0
fi

target_name="buyerly_postgres_${TIMESTAMP}.sql.gz"
[[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]] && target_name="${target_name}.enc"
target_file="${BACKUP_DIR}/${target_name}"
# The dump is written under a name that restore --latest-local and rotation
# never match, checked, and only then renamed into place (same directory, so
# the rename is atomic). A dump cut short by a pg_dump, gzip, openssl or disk
# error is removed instead of looking like the newest good backup.
partial_file="${BACKUP_DIR}/.incomplete_${target_name}"
trap 'rm -f -- "${partial_file}"' EXIT

dump_database() {
    docker exec "${POSTGRES_CONTAINER}" pg_dump \
        --username=buyerly \
        --dbname=buyerly \
        --clean \
        --if-exists \
        --no-owner \
        --no-privileges
}

# Reads the archive back the way restore_db.sh does and checks pg_dump's
# end-of-dump trailer, so a truncated dump is caught even when the gzip and
# encryption layers around it are intact.
archive_is_complete() {
    if [[ "$1" == *.enc ]]; then
        openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -pass "env:BACKUP_ENCRYPTION_KEY" -in "$1" | gzip -dc
    else
        gzip -dc "$1"
    fi | tail -c 4096 | grep -qx -- '-- PostgreSQL database dump complete'
}

echo "[INFO] Creating PostgreSQL backup: ${target_file}"
if [[ "${target_name}" == *.enc ]]; then
    if ! dump_database | gzip -c \
            | openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -pass "env:BACKUP_ENCRYPTION_KEY" > "${partial_file}"; then
        echo "[ERROR] pg_dump, gzip or encryption failed; no backup was published." >&2
        exit 1
    fi
elif ! dump_database | gzip -c > "${partial_file}"; then
    echo "[ERROR] pg_dump or gzip failed; no backup was published." >&2
    exit 1
fi
if ! archive_is_complete "${partial_file}"; then
    echo "[ERROR] The new archive does not read back as a complete pg_dump; no backup was published." >&2
    exit 1
fi
mv -f -- "${partial_file}" "${target_file}"
test -s "${target_file}"
backup_completed_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
if docker exec "${POSTGRES_CONTAINER}" psql \
        --username=buyerly \
        --dbname=buyerly \
        --set=ON_ERROR_STOP=1 \
        --command="INSERT INTO automation_runtime_states (state_key, payload, updated_at) VALUES ('monitoring', jsonb_build_object('last_backup_at', '${backup_completed_at}'), NOW()) ON CONFLICT (state_key) DO UPDATE SET payload = COALESCE(automation_runtime_states.payload, '{}'::jsonb) || EXCLUDED.payload, updated_at = NOW();"; then
    echo "[INFO] Published verified backup timestamp to runtime health state."
else
    # A verified dump must remain usable even when the pre-migration schema
    # cannot yet accept optional reliability telemetry. The next successful
    # backup republishes the timestamp after migrations have caught up.
    echo "[WARNING] Backup is valid, but runtime timestamp publication failed."
fi

# Local backup rotation
pattern="buyerly_postgres_*.sql.gz*"
ls -tp "${BACKUP_DIR}"/${pattern} 2>/dev/null \
    | grep -v '/$' \
    | tail -n +$((KEEP_BACKUPS + 1)) \
    | xargs -r rm -f --

offsite_result="off"
if [[ "${offsite_enabled}" == "true" ]]; then
    echo "[INFO] Triggering off-site S3 backup sync..."
    if python3 "${SCRIPT_DIR}/offsite_sync.py" --upload "${target_file}" --prune --retention-days "${OFFSITE_RETENTION_DAYS}"; then
        echo "[SUCCESS] Off-site S3 backup sync completed."
        offsite_result="uploaded"
    else
        echo "[WARNING] Off-site S3 sync failed, but local backup is verified and intact."
        offsite_result="FAILED"
    fi
fi

echo "[SUCCESS] Database backup created and verified: ${target_file} (off-site: ${offsite_result})"
