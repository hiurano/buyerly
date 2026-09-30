#!/usr/bin/env bash
set -euo pipefail

CRON_FILE="/etc/cron.d/buyerly-backup"
APP_DIR="${APP_DIR:-/opt/buyerly}"
ENV_FILE="${BUYERLY_ENV_FILE:-${APP_DIR}/.env}"
CRON_PATH="${CRON_PATH:-/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin}"

echo "[INFO] Setting up Buyerly automated daily backup cron job..."

if [[ $EUID -eq 0 ]]; then
    LOG_FILE="${LOG_FILE:-/var/log/buyerly-backup.log}"
else
    # /var/log is not writable for a normal user: cron would drop every line.
    LOG_FILE="${LOG_FILE:-${HOME}/.local/state/buyerly/backup.log}"
fi
mkdir -p "$(dirname "${LOG_FILE}")"
touch "${LOG_FILE}"
chmod 0600 "${LOG_FILE}"

# Check the settings the way cron will see them: an empty environment plus the
# explicit .env path. Refuse to install a job that would fail every night or
# quietly back up without the encryption/off-site that .env asks for.
echo "[INFO] Checking backup settings in a cron-like environment..."
if ! env -i PATH="${CRON_PATH}" HOME="${HOME}" BUYERLY_ENV_FILE="${ENV_FILE}" \
        bash "${APP_DIR}/scripts/backup_db.sh" --check-config; then
    echo "[ERROR] Fix the settings above in ${ENV_FILE}; the cron job was not installed." >&2
    exit 1
fi

backup_cmd="cd $(printf '%q' "${APP_DIR}") && BUYERLY_ENV_FILE=$(printf '%q' "${ENV_FILE}") bash scripts/backup_db.sh >> $(printf '%q' "${LOG_FILE}") 2>&1"
# cron reads the schedule in the system timezone, not UTC.
schedule_note="03:00 server time ($(date +%Z), see timedatectl)"

if [[ $EUID -ne 0 ]]; then
    echo "[WARNING] Not running as root. Attempting to install to user crontab..."
    (crontab -l 2>/dev/null | grep -v 'backup_db.sh' || true; echo "0 3 * * * ${backup_cmd}") | crontab -
    echo "[SUCCESS] Daily backup job added to user crontab (runs daily at ${schedule_note}). Log: ${LOG_FILE}"
    exit 0
fi

cat <<EOF > "${CRON_FILE}"
# Buyerly daily automated database backup and off-site sync.
# Runs daily at 03:00 in the server's timezone. Settings come from
# ${ENV_FILE}; check them with: sudo bash ${APP_DIR}/scripts/backup_db.sh --check-config
SHELL=/bin/bash
PATH=${CRON_PATH}

0 3 * * * root ${backup_cmd}
EOF

chmod 0644 "${CRON_FILE}"
echo "[SUCCESS] Daily backup cron installed at ${CRON_FILE} (runs daily at ${schedule_note}). Log: ${LOG_FILE}"
