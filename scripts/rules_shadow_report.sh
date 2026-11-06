#!/usr/bin/env bash
# Read-only report on the rules engine's shadow run (#611 stage 4).
#
# Run on the production server (ops-drill.yml, drill "rules-shadow-report"):
# whether worker-ts owns rules_shadow, how many Python captures wait, and the
# per-day match statistics from Redis. Prints counts and mismatching field
# names only, never account names, ids, rule names or amounts.
set -euo pipefail

WORKER_TS="${WORKER_TS_CONTAINER:-buyerly-worker-ts}"
WORKER="${WORKER_CONTAINER:-buyerly-worker}"
DAYS="${RULES_SHADOW_REPORT_DAYS:-14}"
[[ "${DAYS}" =~ ^[0-9]+$ ]] || { echo "RULES_SHADOW_REPORT_DAYS must be a number"; exit 1; }

echo "Rules shadow report, $(date -u +%Y-%m-%dT%H:%MZ)"
echo
echo "== TS_WORKER_JOBS in the TypeScript worker (rules_shadow listed: the comparison runs)"
docker exec "${WORKER_TS}" printenv TS_WORKER_JOBS 2>/dev/null || echo "(worker-ts not running)"
echo
echo "== Captures waiting in RULES_SHADOW_DIR (the Python worker writes, worker-ts deletes)"
docker exec "${WORKER}" sh -c 'd="${RULES_SHADOW_DIR:-}"; if [ -z "$d" ]; then echo "(RULES_SHADOW_DIR not set)"; else ls "$d" 2>/dev/null | grep -c "\.json\.gz$" || true; fi'
echo
docker exec "${WORKER_TS}" node server/dist/rules/shadow-report.js --days "${DAYS}" --mismatches 0
echo
echo "== Mismatching fields among the kept mismatches (count field)"
docker exec "${WORKER_TS}" node -e '
const { Redis } = require("ioredis");
const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
redis.lrange("buyerly:rules-shadow:mismatches", 0, -1).then((items) => {
  const counts = {};
  for (const raw of items) for (const d of JSON.parse(raw).differences) counts[`${d.kind} ${d.field}`] = (counts[`${d.kind} ${d.field}`] || 0) + 1;
  for (const [key, n] of Object.entries(counts).sort()) console.log(`${n} ${key}`);
  if (!items.length) console.log("(none)");
}).finally(() => redis.disconnect());
'
echo
echo "== Daily summaries and mismatch warnings in the worker-ts log (last 7 days)"
docker logs --since 168h "${WORKER_TS}" 2>&1 | grep -c '"Rules shadow daily summary"' || true
docker logs --since 168h "${WORKER_TS}" 2>&1 | grep -c 'Rules shadow: the TypeScript engine decided differently' || true
