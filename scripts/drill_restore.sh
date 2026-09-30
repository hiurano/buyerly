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

echo "=================================================="
echo " 🛡 Buyerly Automated PostgreSQL Restore Drill"
echo " Container:      ${POSTGRES_CONTAINER}"
echo " Ephemeral DB:   ${DRILL_DB}"
echo "=================================================="

# The database holds the sandbox; the API container runs the release's checks.
for container in "${POSTGRES_CONTAINER}" "${API_CONTAINER}"; do
    state=$(docker inspect -f '{{.State.Status}}' "${container}" 2>/dev/null || true)
    if [[ "${state}" != "running" ]]; then
        echo "[ERROR] Container '${container}' is not running (state: '${state:-missing}')."
        exit 1
    fi
done

# Locate backup file if not explicitly provided
if [[ -z "${BACKUP_FILE}" ]]; then
    BACKUP_FILE=$(ls -t "${BACKUP_DIR}"/buyerly_postgres_*.sql* 2>/dev/null | head -n 1 || true)
    if [[ -z "${BACKUP_FILE}" ]]; then
        echo "[ERROR] No backup file found for restore drill."
        exit 1
    fi
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
    echo "[ERROR] Specified backup file does not exist: ${BACKUP_FILE}"
    exit 1
fi

echo "[INFO] Using backup file: ${BACKUP_FILE}"

cleanup() {
    echo "[INFO] Cleaning up ephemeral test database '${DRILL_DB}'..."
    docker exec "${POSTGRES_CONTAINER}" psql \
        --username="${POSTGRES_USER}" \
        --dbname="postgres" \
        --command="DROP DATABASE IF EXISTS ${DRILL_DB} WITH (FORCE);" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[INFO] Creating ephemeral sandbox database '${DRILL_DB}'..."
docker exec "${POSTGRES_CONTAINER}" psql \
    --username="${POSTGRES_USER}" \
    --dbname="postgres" \
    --command="DROP DATABASE IF EXISTS ${DRILL_DB} WITH (FORCE);"
docker exec "${POSTGRES_CONTAINER}" psql \
    --username="${POSTGRES_USER}" \
    --dbname="postgres" \
    --command="CREATE DATABASE ${DRILL_DB};"

echo "[INFO] Stage 1/5 archive: restoring into the sandbox database..."
if ! POSTGRES_CONTAINER="${POSTGRES_CONTAINER}" \
    POSTGRES_DB="${DRILL_DB}" \
    POSTGRES_USER="${POSTGRES_USER}" \
    bash "${SCRIPT_DIR}/restore_db.sh" --file "${BACKUP_FILE}" --target-container "${POSTGRES_CONTAINER}" --target-db "${DRILL_DB}" --target-user "${POSTGRES_USER}" --yes; then
    echo "  [FAIL] archive: the backup did not decrypt, unpack or apply."
    echo "[FAIL] Restore drill failed at the archive stage."
    exit 1
fi
echo "  [OK]   archive: decrypted, unpacked, complete dump applied in one transaction"

echo "[INFO] Stages 2-5 in ${API_CONTAINER} with the release's migrations and models:"
if ! docker exec "${API_CONTAINER}" python -m database.restore_check --database "${DRILL_DB}"; then
    echo "[FAIL] Restore drill failed: the backup unpacks, but this release cannot run on the restored database."
    exit 1
fi

echo "=================================================="
echo " [SUCCESS] The backup restores into a database this release can run on:"
echo " archive, schema version, schema contract, data and application read passed."
echo "=================================================="
