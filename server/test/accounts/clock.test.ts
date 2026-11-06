import { describe, expect, it } from 'vitest';
import { knownTimezone, localToday, periodDates, previousPeriodDates } from '../../src/graphql/areas/accounts/clock.ts';

// An ad account's clock (core/timezones.py, resolve_account_period_dates of
// services/analytics_store.py; tests/test_timezones.py,
// tests/test_analytics_fact_store.py). The day boundary is in worker/day-boundary.test.ts.

const NOW = new Date('2026-08-29T03:00:00Z');

describe('the account clock', () => {
  it('knows the legacy names Meta still reports, and no zone it cannot resolve', () => {
    expect(knownTimezone('US/Hawaii')).toBe(true);
    expect(localToday('US/Hawaii', new Date('2026-08-18T09:59:00Z'))).toBe('2026-08-17');
    expect(localToday('US/Hawaii', new Date('2026-08-18T10:00:00Z'))).toBe('2026-08-18');
    expect(knownTimezone('')).toBe(false);
    expect(knownTimezone(null)).toBe(false);
    expect(knownTimezone('Mars/Olympus_Mons')).toBe(false);
  });

  it('reads the period in the account’s own days, not UTC’s', () => {
    // 03:00 UTC is still the 28th in New York and already the 29th in Berlin.
    expect(periodDates('America/New_York', 'today', NOW)).toEqual(['2026-08-28']);
    expect(periodDates('America/New_York', 'yesterday', NOW)).toEqual(['2026-08-27']);
    expect(periodDates('America/New_York', 'last_3d', NOW)).toEqual(['2026-08-28', '2026-08-27', '2026-08-26']);
    expect(periodDates('Europe/Berlin', 'today', NOW)).toEqual(['2026-08-29']);
    expect(periodDates('Europe/Berlin', 'last_7d', NOW)).toHaveLength(7);
  });

  it('compares with the equal window just before, and not with a day still open', () => {
    expect(previousPeriodDates('Europe/Berlin', 'last_3d', NOW)).toEqual(['2026-08-26', '2026-08-25', '2026-08-24']);
    expect(previousPeriodDates('Europe/Berlin', 'yesterday', NOW)).toEqual(['2026-08-27']);
    expect(previousPeriodDates('Europe/Berlin', 'today', NOW)).toEqual([]);
  });
});
