#!/usr/bin/env bash
# Backs up the database and, when UPLOADS_DIR is set, the uploaded files:
# checked, encrypted when BACKUP_ENCRYPTION_KEY is set, rotated on disk and
# copied to S3.
#
# Two callers. deploy.sh runs it on the host before every release and reaches
# the database through its container (`docker exec`). The backup service in
# docker-compose.yml runs it every night inside the app image: there
# BACKUP_DB_ACCESS=network, pg_dump connects to PGHOST over the Compose
# network, and the uploads volume is mounted read-only at UPLOADS_DIR.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/opt/buyerly/backups}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-buyerly-db}"
# container: `docker exec` into POSTGRES_CONTAINER; network: libpq PG* settings.
BACKUP_DB_ACCESS="${BACKUP_DB_ACCESS:-container}"
UPLOADS_DIR="${UPLOADS_DIR:-}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
KEEP_BACKUPS="${KEEP_BACKUPS:-30}"
# In the backup directory, which the host and the backup service share, so a
# deploy and a nightly run never dump at the same time.
BACKUP_LOCK_FILE="${BACKUP_LOCK_FILE:-${BACKUP_DIR}/.backup.lock}"
# Touched only after a run that did everything it was set up to do, off-site
# copies included; the backup service's healthcheck reads its age.
BACKUP_STATUS_FILE="${BACKUP_STATUS_FILE:-}"

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
if [[ "${BACKUP_DB_ACCESS}" != "container" && "${BACKUP_DB_ACCESS}" != "network" ]]; then
    config_errors+=("BACKUP_DB_ACCESS must be container or network")
fi
if [[ -n "${UPLOADS_DIR}" && ! -d "${UPLOADS_DIR}" ]]; then
    config_errors+=("UPLOADS_DIR=${UPLOADS_DIR} is not a directory")
fi

# Names and modes only: key values must never reach the log.
encryption_mode="off (BACKUP_ENCRYPTION_KEY is empty, dumps are plaintext)"
[[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]] && encryption_mode="on"
offsite_mode="off (S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are empty)"
[[ "${offsite_enabled}" == "true" ]] && offsite_mode="on, retention ${OFFSITE_RETENTION_DAYS} days"
uploads_mode="off"
[[ -n "${UPLOADS_DIR}" ]] && uploads_mode="from ${UPLOADS_DIR}"
echo "[INFO] Backup settings from ${BACKUP_ENV_SOURCE:-the environment}: encryption ${encryption_mode}; off-site ${offsite_mode}; uploads ${uploads_mode}."

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

# Dumps stay on disk and are plaintext without BACKUP_ENCRYPTION_KEY.
umask 077
mkdir -p "${BACKUP_DIR}"

# Concurrency lock to prevent race conditions
exec 9>"${BACKUP_LOCK_FILE}"
if ! flock -n 9; then
    echo "[WARNING] Another backup process is currently running. Skipping."
    exit 0
fi

# We hold the lock, so any unfinished file is from a run that was killed
# before its trap could fire (SIGKILL, power loss).
rm -f -- "${BACKUP_DIR}"/.incomplete_buyerly_*

# The host goes through the database container; the backup service connects
# over the network with PGHOST and PGPASSWORD from docker-compose.yml.
db_command() {
    if [[ "${BACKUP_DB_ACCESS}" == "network" ]]; then
        "$@"
    else
        docker exec "${POSTGRES_CONTAINER}" "$@"
    fi
}

if [[ "${BACKUP_DB_ACCESS}" == "network" ]]; then
    # The nightly run has nothing to skip to: a database it cannot reach is a
    # failed backup, and the service's healthcheck must say so.
    if ! pg_isready --quiet --username=buyerly --dbname=buyerly; then
        echo "[ERROR] PostgreSQL at ${PGHOST:-the default host} does not accept connections; no backup was made." >&2
        exit 1
    fi
else
    postgres_state=$(docker inspect -f '{{.State.Status}}' "${POSTGRES_CONTAINER}" 2>/dev/null || true)
    if [[ "${postgres_state}" != "running" ]]; then
        echo "[INFO] PostgreSQL container '${POSTGRES_CONTAINER}' is not running (state: '${postgres_state:-missing}'). Skipping backup."
        exit 0
    fi
fi

archive_suffix=""
[[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]] && archive_suffix=".enc"
target_name="buyerly_postgres_${TIMESTAMP}.sql.gz${archive_suffix}"
target_file="${BACKUP_DIR}/${target_name}"
uploads_name="buyerly_uploads_${TIMESTAMP}.tar.gz${archive_suffix}"
uploads_file="${BACKUP_DIR}/${uploads_name}"
# Every archive is written under a name that restore and rotation never
# match, checked, and only then renamed into place (same directory, so the
# rename is atomic). An archive cut short by a pg_dump, tar, gzip, openssl or
# disk error is removed instead of looking like the newest good backup.
partial_file="${BACKUP_DIR}/.incomplete_${target_name}"
uploads_partial="${BACKUP_DIR}/.incomplete_${uploads_name}"
trap 'rm -f -- "${partial_file}" "${uploads_partial}"' EXIT

dump_database() {
    db_command pg_dump \
        --username=buyerly \
        --dbname=buyerly \
        --clean \
        --if-exists \
        --no-owner \
        --no-privileges
}

# gzip, then encryption when a key is set; decode_archive reverses it the way
# restore_db.sh and restore_uploads.sh do.
encode_archive() {
    if [[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
        gzip -c | openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -pass "env:BACKUP_ENCRYPTION_KEY"
    else
        gzip -c
    fi
}

decode_archive() {
    if [[ "$1" == *.enc ]]; then
        openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -pass "env:BACKUP_ENCRYPTION_KEY" -in "$1" | gzip -dc
    else
        gzip -dc "$1"
    fi
}

# Reads the archive back and checks pg_dump's end-of-dump trailer, so a
# truncated dump is caught even when the gzip and encryption layers around it
# are intact.
archive_is_complete() {
    decode_archive "$1" | tail -c 4096 | grep -qx -- '-- PostgreSQL database dump complete'
}

rotate_local() {
    ls -tp "${BACKUP_DIR}"/$1 2>/dev/null \
        | grep -v '/$' \
        | tail -n +$((KEEP_BACKUPS + 1)) \
        | xargs -r rm -f --
}

echo "[INFO] Creating PostgreSQL backup: ${target_file}"
if ! dump_database | encode_archive > "${partial_file}"; then
    echo "[ERROR] pg_dump, gzip or encryption failed; no backup was published." >&2
    exit 1
fi
if ! archive_is_complete "${partial_file}"; then
    echo "[ERROR] The new archive does not read back as a complete pg_dump; no backup was published." >&2
    exit 1
fi
mv -f -- "${partial_file}" "${target_file}"
test -s "${target_file}"
backup_completed_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
if db_command psql \
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
rotate_local "buyerly_postgres_*.sql.gz*"

# Avatars and workspace logos: a tar of the whole volume, listed back in full
# before it is published.
uploads_result="off"
if [[ -n "${UPLOADS_DIR}" ]]; then
    echo "[INFO] Archiving uploads: ${uploads_file}"
    if tar -C "${UPLOADS_DIR}" -cf - . | encode_archive > "${uploads_partial}" \
            && decode_archive "${uploads_partial}" | tar -tf - >/dev/null; then
        mv -f -- "${uploads_partial}" "${uploads_file}"
        uploads_result="archived"
        rotate_local "buyerly_uploads_*.tar.gz*"
    else
        echo "[ERROR] The uploads archive could not be written or read back; it was not published." >&2
        uploads_result="FAILED"
    fi
fi

offsite_result="off"
uploads_offsite_result="off"
if [[ "${offsite_enabled}" == "true" ]]; then
    echo "[INFO] Triggering off-site S3 backup sync..."
    if "${SCRIPT_DIR}/offsite_sync.sh" --upload "${target_file}" --prune --retention-days "${OFFSITE_RETENTION_DAYS}"; then
        echo "[SUCCESS] Off-site S3 backup sync completed."
        offsite_result="uploaded"
    else
        echo "[WARNING] Off-site S3 sync failed, but local backup is verified and intact."
        offsite_result="FAILED"
    fi
    if [[ "${uploads_result}" == "archived" ]]; then
        if "${SCRIPT_DIR}/offsite_sync.sh" --kind uploads --upload "${uploads_file}" --prune --retention-days "${OFFSITE_RETENTION_DAYS}"; then
            uploads_offsite_result="uploaded"
        else
            echo "[WARNING] Off-site sync of the uploads archive failed; the local archive is intact."
            uploads_offsite_result="FAILED"
        fi
    fi
fi

echo "[SUCCESS] Database backup created and verified: ${target_file} (off-site: ${offsite_result})"
if [[ "${uploads_result}" == "archived" ]]; then
    echo "[SUCCESS] Uploads archived and verified: ${uploads_file} (off-site: ${uploads_offsite_result})"
fi
if [[ "${uploads_result}" == "FAILED" ]]; then
    exit 1
fi
if [[ -n "${BACKUP_STATUS_FILE}" && "${offsite_result}" != "FAILED" && "${uploads_offsite_result}" != "FAILED" ]]; then
    touch -- "${BACKUP_STATUS_FILE}"
fi
