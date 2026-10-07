#!/usr/bin/env bash
# Stuck-worker drill (#199): freeze the worker and prove the operator hears
# about it, then unfreeze it and prove recovery is reported too.
#
#   sudo bash scripts/drill_worker_stall.sh
#
# PRODUCTION EFFECT: `docker pause buyerly-worker` stops rule checks, rule
# actions and Inbox deliveries for about 8-10 minutes (6 min until the stall
# threshold plus up to 2 watchdog minutes). The worker is always unpaused on
# exit, also on failure or Ctrl-C. Nothing is restarted or deleted. Every
# workspace with an active ad account gets two Inbox notifications:
# "Rules are not being checked" and "Rules are being checked again".
#
# Checks: /health/worker turns 503 while the worker is frozen, the API's
# watchdog writes WORKER_STALLED, and after unpausing /health/worker is 200
# again and WORKER_RECOVERED is written.
set -euo pipefail

WORKER_CONTAINER="${WORKER_CONTAINER:-buyerly-worker}"
API_CONTAINER="${API_CONTAINER:-buyerly-api}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-buyerly-db}"
STALL_TIMEOUT_SECONDS="${STALL_TIMEOUT_SECONDS:-600}"
RECOVERY_TIMEOUT_SECONDS="${RECOVERY_TIMEOUT_SECONDS:-300}"
POLL_SECONDS=15

for container in "${WORKER_CONTAINER}" "${API_CONTAINER}" "${POSTGRES_CONTAINER}"; do
    state=$(docker inspect -f '{{.State.Status}}' "${container}" 2>/dev/null || true)
    if [[ "${state}" != "running" ]]; then
        echo "[ERROR] Container '${container}' is not running (state: '${state:-missing}')."
        exit 1
    fi
done

worker_health() {
    # Prints "<http code> <status> <lag seconds>" from inside the API container.
    docker exec "${API_CONTAINER}" python -c '
import json, urllib.request, urllib.error
try:
    response = urllib.request.urlopen("http://127.0.0.1:8080/health/worker", timeout=5)
    code, body = response.status, response.read()
except urllib.error.HTTPError as error:
    code, body = error.code, error.read()
data = json.loads(body or b"{}")
print(code, data.get("status"), data.get("lag_seconds"))
' 2>/dev/null || echo "000 unreachable -"
}

events_since() {
    docker exec "${POSTGRES_CONTAINER}" psql --username=buyerly --dbname=buyerly --no-psqlrc \
        --tuples-only --no-align --command="SELECT count(*) FROM audit_events
            WHERE actor_id = 'worker_watchdog' AND event_type = '$1' AND created_at >= to_timestamp($2)"
}

read -r code status lag <<< "$(worker_health)"
if [[ "${code}" != "200" || "${status}" != "ok" ]]; then
    echo "[ERROR] The worker must be healthy before the drill (/health/worker: ${code} ${status}, lag ${lag} s)."
    exit 1
fi

unpause() {
    if [[ "$(docker inspect -f '{{.State.Paused}}' "${WORKER_CONTAINER}" 2>/dev/null)" == "true" ]]; then
        docker unpause "${WORKER_CONTAINER}" >/dev/null && echo "[INFO] ${WORKER_CONTAINER} unpaused."
    fi
}
trap unpause EXIT

started=$(date +%s)
echo "Buyerly stuck-worker drill"
echo "  Before:   /health/worker ${code} ${status}, last cycle ${lag} s ago"
docker pause "${WORKER_CONTAINER}" >/dev/null
echo "  $(date -u +%H:%M:%S) UTC  ${WORKER_CONTAINER} paused; waiting for the stall to be detected..."

failures=0
detected=""
deadline=$(( started + STALL_TIMEOUT_SECONDS ))
while (( $(date +%s) < deadline )); do
    read -r code status lag <<< "$(worker_health)"
    if [[ "${code}" == "503" && "$(events_since WORKER_STALLED "${started}")" -gt 0 ]]; then
        detected=$(( $(date +%s) - started ))
        break
    fi
    sleep "${POLL_SECONDS}"
done
if [[ -n "${detected}" ]]; then
    echo "  [OK]   stall detected after ${detected} s: /health/worker 503 (lag ${lag} s), WORKER_STALLED in Inbox ($(events_since WORKER_STALLED "${started}") workspace(s))"
else
    echo "  [FAIL] no stall signal within ${STALL_TIMEOUT_SECONDS} s (last /health/worker: ${code} ${status}, lag ${lag} s)"
    failures=$(( failures + 1 ))
fi

unpause
unpaused=$(date +%s)
recovered=""
deadline=$(( unpaused + RECOVERY_TIMEOUT_SECONDS ))
while (( $(date +%s) < deadline )); do
    read -r code status lag <<< "$(worker_health)"
    if [[ "${code}" == "200" && "${status}" == "ok" && "$(events_since WORKER_RECOVERED "${started}")" -gt 0 ]]; then
        recovered=$(( $(date +%s) - unpaused ))
        break
    fi
    sleep "${POLL_SECONDS}"
done
if [[ -n "${recovered}" ]]; then
    echo "  [OK]   recovery reported ${recovered} s after unpausing: /health/worker 200 (lag ${lag} s), WORKER_RECOVERED in Inbox"
else
    echo "  [FAIL] no recovery signal within ${RECOVERY_TIMEOUT_SECONDS} s (last /health/worker: ${code} ${status}, lag ${lag} s)"
    failures=$(( failures + 1 ))
fi

echo
echo "Drill took $(( $(date +%s) - started )) s; rules were not checked for $(( unpaused - started )) s."
if (( failures > 0 )); then
    echo "[FAIL] ${failures} check(s) failed."
    exit 1
fi
echo "[SUCCESS] A stuck worker is detected and reported, and so is its recovery."
