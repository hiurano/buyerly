#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/opt/buyerly/backups}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-buyerly-db}"
POSTGRES_DB="${POSTGRES_DB:-buyerly}"
POSTGRES_USER="${POSTGRES_USER:-buyerly}"

FILE_PATH=""
USE_LATEST_LOCAL=false
DOWNLOAD_LATEST_OFFSITE=false
CONFIRM_YES=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --file)
            FILE_PATH="$2"
            shift 2
            ;;
        --latest-local)
            USE_LATEST_LOCAL=true
            shift
            ;;
        --download-latest-offsite)
            DOWNLOAD_LATEST_OFFSITE=true
            shift
            ;;
        --target-container)
            POSTGRES_CONTAINER="$2"
            shift 2
            ;;
        --target-db)
            POSTGRES_DB="$2"
            shift 2
            ;;
        --target-user)
            POSTGRES_USER="$2"
            shift 2
            ;;
        --yes|--non-interactive|-y)
            CONFIRM_YES=true
            shift
            ;;
        *)
            echo "Unknown argument: $1"
            echo "Usage: $0 [--file <path> | --latest-local | --download-latest-offsite] [--yes]"
            exit 1
            ;;
    esac
done

if [[ "${DOWNLOAD_LATEST_OFFSITE}" == "true" ]]; then
    mkdir -p "${BACKUP_DIR}"
    echo "[INFO] Downloading the latest backup from off-site S3 storage..."
    latest_download="${BACKUP_DIR}/latest_offsite_restore.sql.gz.enc"
    python3 "${SCRIPT_DIR}/offsite_sync.py" --download-latest --dest "${latest_download}"
    FILE_PATH="${latest_download}"
elif [[ "${USE_LATEST_LOCAL}" == "true" || -z "${FILE_PATH}" ]]; then
    if [[ -z "${FILE_PATH}" && "${USE_LATEST_LOCAL}" != "true" ]]; then
        echo "[INFO] No backup file specified, searching for newest local backup..."
    fi
    latest_found=$(ls -t "${BACKUP_DIR}"/buyerly_postgres_*.sql* 2>/dev/null | head -n 1 || true)
    if [[ -z "${latest_found}" ]]; then
        echo "[ERROR] No backup files found in ${BACKUP_DIR}."
        exit 1
    fi
    FILE_PATH="${latest_found}"
fi

if [[ ! -f "${FILE_PATH}" ]]; then
    echo "[ERROR] Backup file not found: ${FILE_PATH}"
    exit 1
fi

echo "=================================================="
echo " Buyerly PostgreSQL Database Restoration"
echo " Source file:      ${FILE_PATH}"
echo " Target container: ${POSTGRES_CONTAINER}"
echo " Target database:  ${POSTGRES_DB}"
echo " Target user:      ${POSTGRES_USER}"
echo "=================================================="


# The archive is decoded and checked in full before the target database is
# touched: a truncated file, a corrupted gzip stream or a wrong key must fail
# while the old data is still intact. Streaming straight into psql would
# apply the first part of the dump before the error at the end is noticed.
# The decoded dump goes next to the archive (disk), not to /tmp, which may be
# RAM-backed on a small box.
RESTORE_WORK_DIR="${RESTORE_WORK_DIR:-$(dirname "${FILE_PATH}")}"
umask 077
work_dir=$(mktemp -d "${RESTORE_WORK_DIR}/.buyerly_restore.XXXXXX")
trap 'rm -rf -- "${work_dir}"' EXIT

if [[ "${FILE_PATH}" =~ \.enc$ ]]; then
    if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
        echo "[ERROR] BACKUP_ENCRYPTION_KEY environment variable is required to decrypt ${FILE_PATH}."
        exit 1
    fi
    echo "[INFO] Decrypting and verifying encrypted archive..."
    if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -pass "env:BACKUP_ENCRYPTION_KEY" \
            -in "${FILE_PATH}" -out "${work_dir}/dump.sql.gz" \
            || ! gzip -dc "${work_dir}/dump.sql.gz" > "${work_dir}/dump.sql"; then
        echo "[ERROR] Cannot decrypt or decompress ${FILE_PATH} (wrong key or damaged archive). Target database was not changed."
        exit 1
    fi
    rm -f -- "${work_dir}/dump.sql.gz"
    dump_file="${work_dir}/dump.sql"
elif [[ "${FILE_PATH}" =~ \.gz$ ]]; then
    echo "[INFO] Decompressing and verifying gzipped archive..."
    if ! gzip -dc "${FILE_PATH}" > "${work_dir}/dump.sql"; then
        echo "[ERROR] Cannot decompress ${FILE_PATH} (damaged archive). Target database was not changed."
        exit 1
    fi
    dump_file="${work_dir}/dump.sql"
else
    dump_file="${FILE_PATH}"
fi

# pg_dump writes this trailer only after the whole dump was produced, so its
# absence means the dump itself was cut short even if the archive is valid.
if ! tail -c 4096 "${dump_file}" | grep -qx -- '-- PostgreSQL database dump complete'; then
    echo "[ERROR] ${FILE_PATH} is not a complete pg_dump (end-of-dump marker missing). Target database was not changed."
    exit 1
fi
echo "[INFO] Archive verified: complete pg_dump."

if [[ "${CONFIRM_YES}" != "true" ]]; then
    read -r -p "WARNING: Restoring will overwrite existing data in '${POSTGRES_DB}'. Continue? [y/N]: " answer
    if [[ "${answer}" != [yY] && "${answer}" != [yY][eE][sS] ]]; then
        echo "[INFO] Database restore cancelled by user."
        exit 0
    fi
fi

postgres_state=$(docker inspect -f '{{.State.Status}}' "${POSTGRES_CONTAINER}" 2>/dev/null || true)
if [[ "${postgres_state}" != "running" ]]; then
    echo "[ERROR] PostgreSQL container '${POSTGRES_CONTAINER}' is not running (state: '${postgres_state:-missing}')."
    exit 1
fi

# One transaction: an SQL error part-way through (disk full, incompatible
# schema, lock conflict) rolls everything back, so the target keeps its old
# data instead of being left half-dropped.
echo "[INFO] Applying dump in a single transaction..."
if ! docker exec -i "${POSTGRES_CONTAINER}" psql \
        --username="${POSTGRES_USER}" \
        --dbname="${POSTGRES_DB}" \
        --no-psqlrc \
        --set=ON_ERROR_STOP=1 \
        --single-transaction \
        --quiet < "${dump_file}"; then
    echo "[ERROR] Restore failed and was rolled back. Target database '${POSTGRES_DB}' keeps its previous data."
    exit 1
fi

echo "[SUCCESS] PostgreSQL database '${POSTGRES_DB}' restored successfully from ${FILE_PATH}."
