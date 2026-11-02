#!/usr/bin/env bash
# The backup service (docker-compose.yml): backup_db.sh with the database and
# the uploads every day at BACKUP_HOUR_UTC, inside the app image. Nothing on
# the host schedules it, so a new server needs no cron and no setup step.
#
# A container that starts more than a day after the last complete run (a new
# server, a long outage) backs up at once instead of waiting for the night.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_HOUR_UTC="${BACKUP_HOUR_UTC:-3}"
: "${BACKUP_STATUS_FILE:?the backup service needs BACKUP_STATUS_FILE}"

if [[ ! "${BACKUP_HOUR_UTC}" =~ ^([01]?[0-9]|2[0-3])$ ]]; then
    echo "[ERROR] BACKUP_HOUR_UTC must be an hour from 0 to 23." >&2
    exit 1
fi

run_backup() {
    if ! bash "${SCRIPT_DIR}/backup_db.sh"; then
        echo "[ERROR] The backup failed; the next attempt is at ${BACKUP_HOUR_UTC}:00 UTC." >&2
    fi
}

stop() {
    exit 0
}
trap stop TERM INT

last_success=$(stat -c %Y "${BACKUP_STATUS_FILE}" 2>/dev/null || echo 0)
if (( $(date +%s) - last_success > 86400 )); then
    run_backup
fi

while true; do
    now=$(date -u +%s)
    next=$(date -u -d "today ${BACKUP_HOUR_UTC}:00" +%s)
    (( next > now )) || next=$(date -u -d "tomorrow ${BACKUP_HOUR_UTC}:00" +%s)
    echo "[INFO] Next backup at $(date -u -d "@${next}" '+%Y-%m-%d %H:%M UTC')."
    # In the background, so `docker compose stop` ends the wait at once.
    sleep $((next - now)) &
    wait $!
    run_backup
done
