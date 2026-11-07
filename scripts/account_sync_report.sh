#!/usr/bin/env bash
# Read-only report on what the account sync wrote, hour by hour (#611 stage 4).
#
# Run on the production server (ops-drill.yml, drill "account-sync-report")
# to see the facts are fresh and well formed. Prints
# counts only, never account names, ids or amounts. The session is read-only
# (default_transaction_read_only), so nothing here can write.
set -euo pipefail

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-buyerly-db}"
POSTGRES_USER="${POSTGRES_USER:-buyerly}"
POSTGRES_DB="${POSTGRES_DB:-buyerly}"
HOURS="${ACCOUNT_SYNC_REPORT_HOURS:-12}"
[[ "${HOURS}" =~ ^[0-9]+$ ]] || { echo "ACCOUNT_SYNC_REPORT_HOURS must be a number"; exit 1; }

query() {
    echo
    echo "== $1"
    docker exec -e PGOPTIONS='-c default_transaction_read_only=on' "${POSTGRES_CONTAINER}" \
        psql --username="${POSTGRES_USER}" --dbname="${POSTGRES_DB}" --no-psqlrc --quiet \
        --set=ON_ERROR_STOP=1 --pset=footer=off --command="$2"
}

echo "Account sync report, last ${HOURS} hours, $(date -u +%Y-%m-%dT%H:%MZ)"
docker exec "${POSTGRES_CONTAINER}" true


query "Fact writes per hour: rows, accounts, levels, rows not rounded to cents" "
SELECT date_trunc('hour', updated_at) AS hour,
       count(*) AS rows,
       count(DISTINCT account_id) AS accounts,
       count(*) FILTER (WHERE entity_level = 'account') AS account_rows,
       count(*) FILTER (WHERE entity_level = 'campaign') AS campaign_rows,
       count(*) FILTER (WHERE entity_level = 'adset') AS adset_rows,
       count(*) FILTER (WHERE entity_level = 'ad') AS ad_rows,
       count(DISTINCT date) AS dates,
       count(*) FILTER (WHERE spend::numeric <> round(spend::numeric, 2)
                          OR cpm::numeric <> round(cpm::numeric, 2)
                          OR ctr::numeric <> round(ctr::numeric, 2)
                          OR daily_budget::numeric <> round(daily_budget::numeric, 2)) AS unrounded
FROM analytics_entity_daily_facts
WHERE updated_at > now() - make_interval(hours => ${HOURS})
GROUP BY 1 ORDER BY 1"

query "Writes per hour by how many days back the fact's date is (0 = account-local today)" "
SELECT date_trunc('hour', f.updated_at) AS hour,
       (now() AT TIME ZONE 'UTC')::date - f.date::date AS days_back_utc,
       count(*) AS rows
FROM analytics_entity_daily_facts f
WHERE f.updated_at > now() - make_interval(hours => ${HOURS})
GROUP BY 1, 2 ORDER BY 1, 2"

query "Facts dated after the account's local today, or in another currency than the account (should be 0)" "
SELECT count(*) FILTER (WHERE f.date > to_char(now() AT TIME ZONE coalesce(nullif(a.timezone_name, ''), 'UTC'), 'YYYY-MM-DD')) AS future_dated,
       count(*) FILTER (WHERE f.currency <> a.currency AND a.currency <> 'UNKNOWN') AS other_currency
FROM analytics_entity_daily_facts f
JOIN accounts a ON a.account_id = f.account_id AND a.workspace_id = f.workspace_id
WHERE f.updated_at > now() - make_interval(hours => ${HOURS})
  AND EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = coalesce(nullif(a.timezone_name, ''), 'UTC'))"

query "Active accounts by age of their newest fact write" "
SELECT CASE WHEN last IS NULL THEN 'never'
            WHEN last > now() - interval '15 minutes' THEN '< 15 min'
            WHEN last > now() - interval '1 hour' THEN '15-60 min'
            ELSE '> 1 hour' END AS newest_fact,
       count(*) AS accounts
FROM (SELECT a.id, max(f.updated_at) AS last
      FROM accounts a LEFT JOIN analytics_entity_daily_facts f ON f.account_id = a.account_id
      WHERE a.is_active GROUP BY a.id) t
GROUP BY 1 ORDER BY 1"

query "Sync schedule: account states checked per hour" "
SELECT date_trunc('hour', to_timestamp(last_checked_at)) AS hour, count(*) AS states
FROM automation_schedule_states
WHERE state_key LIKE 'account:%' AND to_timestamp(last_checked_at) > now() - make_interval(hours => ${HOURS})
GROUP BY 1 ORDER BY 1"

query "Account health now" "
SELECT status, cause, count(*) AS accounts, max(consecutive_failures) AS max_failures,
       count(*) FILTER (WHERE last_checked_at > now() - interval '30 minutes') AS checked_last_30_min
FROM account_health GROUP BY 1, 2 ORDER BY 1, 2"

query "Health checks per hour (last_checked_at of the rows)" "
SELECT date_trunc('hour', last_checked_at) AS hour, count(*) AS rows
FROM account_health WHERE last_checked_at > now() - make_interval(hours => ${HOURS})
GROUP BY 1 ORDER BY 1"

query "Account sync events per hour" "
SELECT date_trunc('hour', created_at) AS hour, event_type, status, count(*) AS events
FROM audit_events
WHERE created_at > now() - make_interval(hours => ${HOURS})
  AND event_type IN ('ACCOUNT_HEALTH_ALERT', 'ACCOUNT_HEALTH_RECOVERED', 'TOKEN_EXPIRED', 'ACCOUNT_ISSUE')
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3"

echo
echo "Report done"
