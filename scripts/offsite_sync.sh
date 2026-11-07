#!/usr/bin/env bash
# Off-site backup copies in S3: runs server/src/scripts/offsite-sync.ts
# (#611 stage 5; it replaced scripts/offsite_sync.py, same flags and output).
#
# Inside the app image (the backup service) Node and the built script are
# there, so it runs directly. On the host (deploy.sh, restore_db.sh,
# restore_uploads.sh, the restore drill) it runs in the app image instead:
# OFFSITE_SYNC_IMAGE, or the image buyerly-api runs. The S3_* settings are
# passed through and a --dest-dir/--dest/--upload path is mounted at the same
# path, so the caller sees the files where it asked for them.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(dirname "${SCRIPT_DIR}")"
SCRIPT="${OFFSITE_SYNC_JS:-${APP_ROOT}/server/dist/scripts/offsite-sync.js}"

if command -v node >/dev/null 2>&1 && [[ -f "${SCRIPT}" ]]; then
    exec node "${SCRIPT}" "$@"
fi

image="${OFFSITE_SYNC_IMAGE:-}"
if [[ -z "${image}" ]]; then
    image=$(docker inspect --format '{{.Config.Image}}' buyerly-api 2>/dev/null || true)
fi
if [[ -z "${image}" ]]; then
    echo "[ERROR] Off-site sync needs Node or the app image: buyerly-api is not there; set OFFSITE_SYNC_IMAGE." >&2
    exit 1
fi

args=() mounts=()
absolute() { [[ "$1" == /* ]] && printf '%s' "$1" || printf '%s/%s' "${PWD}" "$1"; }
while (( $# )); do
    case "$1" in
        --dest-dir|--dest|--upload)
            (( $# >= 2 )) || { echo "[ERROR] $1 needs a path." >&2; exit 2; }
            path=$(absolute "$2")
            if [[ "$1" == --dest-dir ]]; then dir="${path}"; else dir=$(dirname "${path}"); fi
            mkdir -p "${dir}"
            mounts+=(-v "${dir}:${dir}")
            args+=("$1" "${path}")
            shift 2
            ;;
        *) args+=("$1"); shift ;;
    esac
done

exec docker run --rm --network host --user "$(id -u):$(id -g)" \
    -e S3_ENDPOINT_URL -e S3_BUCKET -e S3_ACCESS_KEY_ID -e S3_SECRET_ACCESS_KEY -e S3_REGION \
    ${mounts[@]+"${mounts[@]}"} \
    "${image}" node server/dist/scripts/offsite-sync.js ${args[@]+"${args[@]}"}
