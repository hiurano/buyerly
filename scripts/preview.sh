#!/usr/bin/env bash
# A local preview of the current branch: its own database, API and Vite, on
# its own port, beside every other checkout's preview and the main dev stack.
#
#   scripts/preview.sh up      start (or update) this checkout's preview, print its URL
#   scripts/preview.sh url     print the URL again
#   scripts/preview.sh logs    follow the API and Vite logs
#   scripts/preview.sh down    stop it and delete its local data
#   scripts/preview.sh list    every preview running on this computer
#
# The page is http://<branch>.localhost:<port>: a host of its own, so its login
# cookie never replaces the one of localhost:5173 or of another preview.
# Sign in with "Log in with password": dev / buyerly-dev. Everything is local
# test data from compose.dev.yaml and scripts/dev_seed.py; nothing reaches
# production or Meta.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "${root}"

if ! command -v docker >/dev/null 2>&1 && [ -n "${LOCALAPPDATA:-}" ]; then
  PATH="${PATH}:$(cygpath -u "${LOCALAPPDATA}" 2>/dev/null || echo "${LOCALAPPDATA}")/Programs/DockerDesktop/resources/bin"
fi
command -v docker >/dev/null 2>&1 || { echo "preview: docker is not installed or not running" >&2; exit 1; }

branch="$(git branch --show-current)"
slug="$(printf '%s' "${branch:-detached}" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' | cut -c1-40 | sed -E 's/-+$//')"
project="buyerly-pv-${slug}"
state="${root}/.preview.env"

port_taken() {
  docker ps --format '{{.Ports}}' | grep -q "127.0.0.1:$1->" && return 0
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && return 0
  return 1
}

pick_ports() {
  if [ -f "${state}" ]; then
    # shellcheck disable=SC1090
    . "${state}"
    if [ "${PREVIEW_PROJECT:-}" = "${project}" ]; then
      return
    fi
  fi
  local web=5180
  while port_taken "${web}" || port_taken "$((web + 3000))"; do
    web=$((web + 1))
    [ "${web}" -lt 5280 ] || { echo "preview: no free port between 5180 and 5279" >&2; exit 1; }
  done
  PREVIEW_PROJECT="${project}"
  PREVIEW_WEB_PORT="${web}"
  PREVIEW_API_PORT="$((web + 3000))"
  printf 'PREVIEW_PROJECT=%s\nPREVIEW_WEB_PORT=%s\nPREVIEW_API_PORT=%s\n' \
    "${PREVIEW_PROJECT}" "${PREVIEW_WEB_PORT}" "${PREVIEW_API_PORT}" >"${state}"
}

compose() {
  BUYERLY_WEB_PORT="${PREVIEW_WEB_PORT}" \
  BUYERLY_API_PORT="${PREVIEW_API_PORT}" \
  BUYERLY_WEB_HOST="${slug}.localhost" \
    docker compose -p "${PREVIEW_PROJECT}" -f compose.dev.yaml "$@"
}

url() {
  echo "http://${slug}.localhost:${PREVIEW_WEB_PORT}/${PREVIEW_WORKSPACE:-dev}"
}

wait_until_ready() {
  local deadline=$((SECONDS + 600))
  printf 'preview: waiting for the API and Vite'
  until curl -fsS "http://127.0.0.1:${PREVIEW_API_PORT}/health/ready" >/dev/null 2>&1 \
     && curl -fsS "http://127.0.0.1:${PREVIEW_WEB_PORT}/" >/dev/null 2>&1; do
    if [ "${SECONDS}" -ge "${deadline}" ]; then
      echo
      echo "preview: not ready after 10 minutes; see scripts/preview.sh logs" >&2
      exit 1
    fi
    printf '.'
    sleep 3
  done
  echo
}

case "${1:-up}" in
  up)
    pick_ports
    compose up -d --build
    wait_until_ready
    echo "preview: $(url)  (dev / buyerly-dev)"
    ;;
  url)
    pick_ports
    url
    ;;
  logs)
    pick_ports
    compose logs -f --tail 50 api web
    ;;
  down)
    pick_ports
    compose down -v
    rm -f "${state}"
    ;;
  list)
    docker compose ls --all --filter "name=buyerly-pv-"
    ;;
  *)
    sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
