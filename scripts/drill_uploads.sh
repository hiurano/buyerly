#!/usr/bin/env bash
# Uploads round trip (#199): archive the buyerly-uploads volume (avatars,
# workspace logos) read-only, restore the archive into a throwaway volume and
# compare every file by SHA-256.
#
#   sudo bash scripts/drill_uploads.sh
#
# The live volume is mounted read-only and never written. Both helper
# containers run the API's image without network. The throwaway volume and
# the archive are removed at the end, whatever the result.
#
# This proves the archive/restore procedure only: backup_db.sh does not copy
# uploads, so there is no scheduled uploads backup to restore yet.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-buyerly-uploads}"
API_CONTAINER="${API_CONTAINER:-buyerly-api}"
DRILL_VOLUME="buyerly-uploads-drill"

if [[ "${DRILL_VOLUME}" == "${UPLOADS_VOLUME}" ]]; then
    echo "[FATAL] The drill volume must not be the live uploads volume."
    exit 1
fi
if ! docker volume inspect "${UPLOADS_VOLUME}" >/dev/null 2>&1; then
    echo "[ERROR] Volume ${UPLOADS_VOLUME} does not exist."
    exit 1
fi
if docker volume inspect "${DRILL_VOLUME}" >/dev/null 2>&1; then
    echo "[ERROR] Volume ${DRILL_VOLUME} already exists (a previous drill?). Remove it with: docker volume rm ${DRILL_VOLUME}"
    exit 1
fi
image=$(docker inspect --format '{{.Config.Image}}' "${API_CONTAINER}")

work_dir=$(umask 077; mktemp -d "${APP_DIR}/.uploads_drill.XXXXXX")
cleanup() {
    docker volume rm -f "${DRILL_VOLUME}" >/dev/null 2>&1 || true
    rm -rf -- "${work_dir}"
}
trap cleanup EXIT

helper() {
    docker run --rm --network none --user 0 --entrypoint sh "$@"
}
manifest='find . -type f -print0 | sort -z | xargs -0 -r sha256sum'

started=$(date +%s)
echo "Buyerly uploads drill"
echo "  Source:   volume ${UPLOADS_VOLUME} (read-only)"
echo "  Sandbox:  volume ${DRILL_VOLUME}, removed afterwards"
echo

helper -v "${UPLOADS_VOLUME}:/src:ro" -v "${work_dir}:/out" "${image}" -c \
    "cd /src && ${manifest} > /out/source.sha256 && tar -czf /out/uploads.tar.gz ."
files=$(wc -l < "${work_dir}/source.sha256")
archive_size=$(numfmt --to=iec "$(stat -c %s "${work_dir}/uploads.tar.gz")")
echo "  [OK]   archive: ${files} file(s), ${archive_size}B compressed"

docker volume create "${DRILL_VOLUME}" >/dev/null
helper -v "${DRILL_VOLUME}:/dst" -v "${work_dir}:/out:ro" "${image}" -c \
    "tar -xzf /out/uploads.tar.gz -C /dst"
helper -v "${DRILL_VOLUME}:/dst:ro" -v "${work_dir}:/out" "${image}" -c \
    "cd /dst && ${manifest} > /out/restored.sha256"

if ! cmp -s "${work_dir}/source.sha256" "${work_dir}/restored.sha256"; then
    echo "  [FAIL] restore: restored files differ from the live volume:"
    diff <(awk '{print $2}' "${work_dir}/source.sha256") <(awk '{print $2}' "${work_dir}/restored.sha256") \
        | head -n 20 | sed 's/^/         /' || true
    echo
    echo "[FAIL] Uploads drill failed."
    exit 1
fi
echo "  [OK]   restore: all ${files} file(s) have the same path and SHA-256"
if [[ "${files}" -eq 0 ]]; then
    echo "  [NOTE] the live volume is empty, so this only proves the procedure"
fi
echo
echo "[SUCCESS] Uploads archive and restore round trip ($(( $(date +%s) - started )) s)."
echo "Not covered: no scheduled backup copies uploads; see DEPLOYMENT.md."
