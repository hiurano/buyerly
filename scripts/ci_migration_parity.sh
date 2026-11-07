#!/usr/bin/env bash
# TypeORM's migrations against Alembic's last revision (#611 stage 5), on the
# CI job's Postgres, where buyerly_schema is already migrated by Alembic:
#   1. an empty database migrated by `node server/dist/migrate.js` has exactly
#      the schema (and rows) Alembic builds;
#   2. on a copy of the Alembic database the baseline only records itself as
#      applied: the schema stays byte for byte the same, and a second run has
#      nothing pending.
# The dumps land in $OUT for the job's artifact.
set -euo pipefail

PGURL_BASE=${PGURL_BASE:-postgresql://buyerly:buyerly_secret@127.0.0.1:5432}
OUT=${OUT:-/tmp/migration-parity}
mkdir -p "${OUT}"

pg() { docker run --rm --network host postgres:16-alpine "$@"; }
psql_admin() { pg psql "${PGURL_BASE}/postgres" -v ON_ERROR_STOP=1 -qAtc "$1"; }
# pg_dump 16.10+ prints \restrict lines with a random key; they and the
# session SETs are not schema.
dump() {
  pg pg_dump "${PGURL_BASE}/$1" --no-owner --no-privileges \
    --exclude-table=alembic_version --exclude-table=migrations "${@:2}" \
    | grep -Ev '^\\(un)?restrict ' | grep -Ev '^-- Dumped (from|by) '
}
migrate() { DATABASE_URL="${PGURL_BASE}/$1" node server/dist/migrate.js; }

dump buyerly_schema --schema-only > "${OUT}/alembic.sql"

psql_admin 'DROP DATABASE IF EXISTS buyerly_typeorm'
psql_admin 'CREATE DATABASE buyerly_typeorm'
migrate buyerly_typeorm
dump buyerly_typeorm --schema-only > "${OUT}/typeorm.sql"
if ! diff -u "${OUT}/alembic.sql" "${OUT}/typeorm.sql" > "${OUT}/schema.diff"; then
  echo "::error title=Migrations::An empty database migrated by TypeORM differs from Alembic's schema"
  head -100 "${OUT}/schema.diff"
  exit 1
fi
echo "Empty database: TypeORM schema equals Alembic's ($(wc -l < "${OUT}/alembic.sql") lines)."

psql_admin 'DROP DATABASE IF EXISTS buyerly_stamp'
psql_admin 'CREATE DATABASE buyerly_stamp TEMPLATE buyerly_schema'
migrate buyerly_stamp | tee "${OUT}/stamp.log"
grep -q 'Applied migrations: Baseline1762473600000' "${OUT}/stamp.log"
dump buyerly_stamp --schema-only > "${OUT}/stamped.sql"
if ! diff -u "${OUT}/alembic.sql" "${OUT}/stamped.sql"; then
  echo "::error title=Migrations::The baseline changed an Alembic-migrated database"
  exit 1
fi
migrate buyerly_stamp | tee "${OUT}/stamp-again.log"
grep -q 'No pending migrations' "${OUT}/stamp-again.log"
echo "Alembic database: baseline recorded as applied, schema unchanged, nothing pending on a second run."

# Rows: both databases hold the same data (the app_settings row, its time aside).
for db in buyerly_typeorm buyerly_stamp; do
  dump "${db}" --data-only --exclude-table-data=app_settings > "${OUT}/${db}-data.sql"
  pg psql "${PGURL_BASE}/${db}" -qAtc 'SELECT row_to_json(s)::jsonb - '"'"'id'"'"' - '"'"'updated_at'"'"' FROM app_settings s' > "${OUT}/${db}-settings.json"
done
diff -u "${OUT}/buyerly_typeorm-data.sql" "${OUT}/buyerly_stamp-data.sql"
diff -u "${OUT}/buyerly_typeorm-settings.json" "${OUT}/buyerly_stamp-settings.json"
echo "Rows: equal."
psql_admin 'DROP DATABASE buyerly_typeorm'
psql_admin 'DROP DATABASE buyerly_stamp'
