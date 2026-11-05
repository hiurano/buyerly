// A timestamptz column as Python's api/deps.py _utc_iso writes it:
// datetime.isoformat() in UTC with "Z", microseconds only when there are any.
// Formatted by Postgres, which keeps the microseconds a JS Date would drop.
export function isoUtc(column: string): string {
  return `CASE WHEN ${column} IS NULL THEN NULL ELSE
    to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
    || CASE WHEN extract(microseconds FROM ${column})::bigint % 1000000 = 0 THEN ''
            ELSE to_char(${column} AT TIME ZONE 'UTC', '.US') END
    || 'Z' END`;
}

// Postgres' unique_violation: a concurrent write took the name first.
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  while (current && typeof current === 'object') {
    if ((current as { code?: string }).code === '23505') return true;
    current = (current as { driverError?: unknown }).driverError;
  }
  return false;
}
