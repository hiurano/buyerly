# shellcheck shell=bash
# Backup settings shared by backup_db.sh and restore_db.sh. Sourced, not run.
#
# cron and deploy.sh start these scripts with a bare environment: Compose
# passes .env to the containers, not to host scripts. Without this loader a
# key that exists only in .env was silently ignored, so an operator who filled
# in BACKUP_ENCRYPTION_KEY and S3_* got plaintext, local-only dumps.
#
# .env is parsed, never sourced: only the keys below are read, and a value is
# taken as text, so `$(...)` or backticks in the file are not executed.

BACKUP_ENV_KEYS=(
    BACKUP_ENCRYPTION_KEY
    S3_ENDPOINT_URL
    S3_BUCKET
    S3_ACCESS_KEY_ID
    S3_SECRET_ACCESS_KEY
    S3_REGION
    OFFSITE_RETENTION_DAYS
)
OFFSITE_REQUIRED_KEYS=(S3_ENDPOINT_URL S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY)

# Strip the dotenv quoting that python-dotenv (the app's reader) accepts for
# these simple values: surrounding quotes, or an unquoted value with an
# inline ` # comment`.
_backup_env_value() {
    local value="$1"
    value="${value%$'\r'}"
    value="${value#"${value%%[![:space:]]*}"}"
    if [[ "${value}" =~ ^\"(.*)\"[[:space:]]*(#.*)?$ || "${value}" =~ ^\'(.*)\'[[:space:]]*(#.*)?$ ]]; then
        value="${BASH_REMATCH[1]}"
    else
        value="${value%%[[:space:]]#*}"
        value="${value%"${value##*[![:space:]]}"}"
    fi
    printf '%s' "${value}"
}

# Exports every backup key that is empty in the environment but set in .env.
# A non-empty exported value wins, as it does for docker compose.
load_backup_env() {
    BACKUP_ENV_SOURCE="${BUYERLY_ENV_FILE:-$(cd "${SCRIPT_DIR}/.." && pwd)/.env}"
    if [[ ! -f "${BACKUP_ENV_SOURCE}" ]]; then
        if [[ -n "${BUYERLY_ENV_FILE:-}" ]]; then
            echo "[ERROR] BUYERLY_ENV_FILE=${BUYERLY_ENV_FILE} does not exist." >&2
            return 1
        fi
        echo "[INFO] No ${BACKUP_ENV_SOURCE}; backup settings come from the environment only."
        BACKUP_ENV_SOURCE=""
        return 0
    fi
    if [[ ! -r "${BACKUP_ENV_SOURCE}" ]]; then
        echo "[ERROR] Cannot read ${BACKUP_ENV_SOURCE}; run as the user that owns it (root on the VPS)." >&2
        return 1
    fi

    local key line wanted
    local -A from_file=()
    while IFS= read -r line || [[ -n "${line}" ]]; do
        [[ "${line}" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]] || continue
        key="${BASH_REMATCH[2]}"
        for wanted in "${BACKUP_ENV_KEYS[@]}"; do
            if [[ "${key}" == "${wanted}" ]]; then
                # Later lines win, like the app's reader and deploy.sh.
                from_file["${key}"]="$(_backup_env_value "${BASH_REMATCH[3]}")"
            fi
        done
    done < "${BACKUP_ENV_SOURCE}"

    for key in "${!from_file[@]}"; do
        if [[ -z "${!key:-}" && -n "${from_file[${key}]}" ]]; then
            export "${key}=${from_file[${key}]}"
        fi
    done
}

# Prints which S3 keys an offsite operation still needs; empty when complete.
missing_offsite_keys() {
    local key missing=()
    for key in "${OFFSITE_REQUIRED_KEYS[@]}"; do
        [[ -n "${!key:-}" ]] || missing+=("${key}")
    done
    echo "${missing[*]}"
}
