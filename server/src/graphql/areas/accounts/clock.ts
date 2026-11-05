import { strip } from './text.ts';

// An ad account's local calendar (core/timezones.py resolve_account_clock,
// services/analytics_store.py resolve_account_period_dates): fact dates are
// the account's own days.

// Backward-compatible names Meta still returns, stored canonically.
const META_TIMEZONE_ALIASES: Record<string, string> = {
  'US/Hawaii': 'Pacific/Honolulu',
  HST: 'Pacific/Honolulu',
  'US/Alaska': 'America/Anchorage',
  'US/Aleutian': 'America/Adak',
  'US/Arizona': 'America/Phoenix',
  'US/Central': 'America/Chicago',
  'US/East-Indiana': 'America/Indiana/Indianapolis',
  'US/Eastern': 'America/New_York',
  'US/Indiana-Starke': 'America/Indiana/Knox',
  'US/Michigan': 'America/Detroit',
  'US/Mountain': 'America/Denver',
  'US/Pacific': 'America/Los_Angeles',
  'US/Samoa': 'Pacific/Pago_Pago',
  'Canada/Atlantic': 'America/Halifax',
  'Canada/Central': 'America/Winnipeg',
  'Canada/Eastern': 'America/Toronto',
  'Canada/Mountain': 'America/Edmonton',
  'Canada/Newfoundland': 'America/St_Johns',
  'Canada/Pacific': 'America/Vancouver',
  'Canada/Saskatchewan': 'America/Regina',
  'Canada/Yukon': 'America/Whitehorse',
  'Brazil/Acre': 'America/Rio_Branco',
  'Brazil/East': 'America/Sao_Paulo',
  'Brazil/West': 'America/Manaus',
  'Chile/Continental': 'America/Santiago',
  'Mexico/General': 'America/Mexico_City',
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Europe/Kiev': 'Europe/Kyiv',
};

const formats = new Map<string, Intl.DateTimeFormat | null>();

// The account's day formatter; null for no zone or one the system doesn't
// know, which reads the UTC day, as Python does without a clock.
function dayFormat(timezoneName: string | null | undefined): Intl.DateTimeFormat | null {
  const configured = strip(timezoneName ?? '');
  if (!configured) return null;
  const canonical = META_TIMEZONE_ALIASES[configured] ?? configured;
  if (!formats.has(canonical)) {
    let format: Intl.DateTimeFormat | null;
    try {
      format = new Intl.DateTimeFormat('en-CA', { timeZone: canonical, year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      format = null;
    }
    formats.set(canonical, format);
  }
  return formats.get(canonical) ?? null;
}

function localToday(timezoneName: string | null | undefined, now: Date): string {
  const format = dayFormat(timezoneName);
  if (!format) return now.toISOString().slice(0, 10);
  const parts = Object.fromEntries(format.formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function daysBefore(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

const PERIOD_LENGTHS: Record<string, number> = { today: 1, yesterday: 1, last_3d: 3, last_7d: 7 };
const COMPARABLE_PERIOD_LENGTHS: Record<string, number> = { yesterday: 1, last_3d: 3, last_7d: 7 };
const PERIODS_INCLUDING_TODAY = new Set(['today', 'last_3d', 'last_7d']);

export const TODAY_NOT_COMPARABLE =
  'Today is still open and the fact store keeps whole-day totals, so it cannot ' +
  'be compared with an equal part of an earlier day.';

// The local dates of the reporting period, today first.
export function periodDates(timezoneName: string | null | undefined, period: string, now: Date): string[] {
  const today = localToday(timezoneName, now);
  if (period === 'yesterday') return [daysBefore(today, 1)];
  const length = PERIOD_LENGTHS[period] ?? 1;
  return Array.from({ length }, (_, offset) => daysBefore(today, offset));
}

// The equal-length window just before; none for today, which is still open.
export function previousPeriodDates(timezoneName: string | null | undefined, period: string, now: Date): string[] {
  const length = COMPARABLE_PERIOD_LENGTHS[period];
  if (length === undefined) return [];
  const oldest = periodDates(timezoneName, period, now).reduce((a, b) => (b < a ? b : a));
  return Array.from({ length }, (_, offset) => daysBefore(oldest, offset + 1));
}

export interface Comparison {
  requested: boolean;
  available: boolean;
  dates: string[];
  reason: string;
  current_includes_open_day: boolean;
}

export function comparisonMeta(requested: boolean, previousDates: string[], period: string): Comparison {
  const available = requested && previousDates.length > 0;
  return {
    requested,
    available,
    dates: available ? [...previousDates] : [],
    reason: requested && !previousDates.length ? TODAY_NOT_COMPARABLE : '',
    current_includes_open_day: PERIODS_INCLUDING_TODAY.has(period),
  };
}
