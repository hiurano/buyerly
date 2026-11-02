#!/usr/bin/env bash
# Restores the uploads volume (avatars, workspace logos) from an archive made
# by backup_db.sh. The volume's contents are replaced by the archive's.
#
#   bash scripts/restore_uploads.sh --download-latest-offsite --yes
#   bash scripts/restore_uploads.sh --file backups/buyerly_uploads_<ts>.tar.gz.enc
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/opt/buyerly/backups}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-buyerly-uploads}"
# Any image with sh and tar does; the API's own is already on the server.
RESTORE_IMAGE="${RESTORE_IMAGE:-}"

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

# shellcheck source=scripts/backup_env.sh
source "${SCRIPT_DIR}/backup_env.sh"
load_backup_env

cleanup_paths=()
trap 'rm -rf -- "${cleanup_paths[@]}"' EXIT

if [[ "${DOWNLOAD_LATEST_OFFSITE}" == "true" ]]; then
    missing_s3=$(missing_offsite_keys)
    if [[ -n "${missing_s3}" ]]; then
        echo "[ERROR] Off-site download needs these settings, which are empty: ${missing_s3}."
        exit 1
    fi
    mkdir -p "${BACKUP_DIR}"
    echo "[INFO] Downloading the latest uploads archive from off-site S3 storage..."
    download_dir=$(umask 077; mktemp -d "${BACKUP_DIR}/.offsite_download.XXXXXX")
    cleanup_paths+=("${download_dir}")
    if ! python3 "${SCRIPT_DIR}/offsite_sync.py" --kind uploads --download-latest --dest-dir "${download_dir}"; then
        echo "[ERROR] Off-site download failed."
        exit 1
    fi
    shopt -s nullglob
    downloaded=("${download_dir}"/buyerly_uploads_*)
    shopt -u nullglob
    if (( ${#downloaded[@]} != 1 )); then
        echo "[ERROR] Off-site download did not produce exactly one uploads archive."
        exit 1
    fi
    FILE_PATH="${downloaded[0]}"
elif [[ "${USE_LATEST_LOCAL}" == "true" || -z "${FILE_PATH}" ]]; then
    FILE_PATH=$(ls -t "${BACKUP_DIR}"/buyerly_uploads_*.tar.gz* 2>/dev/null | head -n 1 || true)
    if [[ -z "${FILE_PATH}" ]]; then
        echo "[ERROR] No uploads archives found in ${BACKUP_DIR}."
        exit 1
    fi
fi

if [[ ! -f "${FILE_PATH}" ]]; then
    echo "[ERROR] Uploads archive not found: ${FILE_PATH}"
    exit 1
fi

echo "=================================================="
echo " Buyerly uploads restoration"
echo " Source file:   ${FILE_PATH}"
echo " Target volume: ${UPLOADS_VOLUME}"
echo "=================================================="

# Decoded and listed in full before the volume is touched: a truncated file
# or a wrong key fails while the old files are still there.
umask 077
work_dir=$(mktemp -d "$(dirname "${FILE_PATH}")/.buyerly_restore.XXXXXX")
cleanup_paths+=("${work_dir}")
tar_file="${work_dir}/uploads.tar"
if [[ "${FILE_PATH}" =~ \.enc$ ]]; then
    if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
        echo "[ERROR] BACKUP_ENCRYPTION_KEY (environment or ${BACKUP_ENV_SOURCE:-.env}) is required to decrypt ${FILE_PATH}."
        exit 1
    fi
    if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -pass "env:BACKUP_ENCRYPTION_KEY" -in "${FILE_PATH}" \
            | gzip -dc > "${tar_file}"; then
        echo "[ERROR] Cannot decrypt or decompress ${FILE_PATH} (wrong key or damaged archive). Uploads were not changed."
        exit 1
    fi
elif ! gzip -dc "${FILE_PATH}" > "${tar_file}"; then
    echo "[ERROR] Cannot decompress ${FILE_PATH} (damaged archive). Uploads were not changed."
    exit 1
fi
if ! listing=$(tar -tf "${tar_file}"); then
    echo "[ERROR] ${FILE_PATH} is not a complete tar archive. Uploads were not changed."
    exit 1
fi
files=$(grep -cv '/$' <<<"${listing}" || true)
echo "[INFO] Archive verified: ${files} file(s)."

if [[ "${CONFIRM_YES}" != "true" ]]; then
    read -r -p "WARNING: Restoring replaces every file in volume '${UPLOADS_VOLUME}'. Continue? [y/N]: " answer
    if [[ "${answer}" != [yY] && "${answer}" != [yY][eE][sS] ]]; then
        echo "[INFO] Uploads restore cancelled by user."
        exit 0
    fi
fi

if [[ -z "${RESTORE_IMAGE}" ]]; then
    RESTORE_IMAGE=$(docker inspect --format '{{.Config.Image}}' buyerly-api 2>/dev/null || true)
fi
if [[ -z "${RESTORE_IMAGE}" ]]; then
    echo "[ERROR] No image to restore with: buyerly-api is not there; set RESTORE_IMAGE."
    exit 1
fi

if ! docker run --rm -i --network none --user 0 --entrypoint sh \
        -v "${UPLOADS_VOLUME}:/uploads" "${RESTORE_IMAGE}" \
        -c 'find /uploads -mindepth 1 -delete && tar -xf - -C /uploads' < "${tar_file}"; then
    echo "[ERROR] Extracting into ${UPLOADS_VOLUME} failed; the volume may be partly restored. Run this again."
    exit 1
fi

echo "[SUCCESS] Uploads volume '${UPLOADS_VOLUME}' restored from ${FILE_PATH} (${files} file(s))."
