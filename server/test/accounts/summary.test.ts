import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { latestAccountMetricsById, todayFromFacts, type SummaryFact } from '../../src/graphql/areas/accounts/summary.ts';
import { pyFloat, pyRound } from '../../src/python-numbers.ts';

// The accounts list's figures must come out of the TypeScript port exactly as
// Python computes them: round(x, n) (ties to even on the exact binary value),
// _latest_account_metrics_by_id over saved summaries with odd stored values,
// and the "today" rows of get_workspace_summary_report — .5 cases, accounts
// in far-apart and aliased time zones, currencies, empty and partial days.
// Every case goes to both, through summary_parity.py. Python runs in CI (the
// server job installs requirements.txt); set PYTHON to the interpreter elsewhere.

const REPO = join(import.meta.dirname, '../../..');
const PYTHON = process.env.PYTHON ?? 'python3';

type Json = Record<string, unknown>;
interface TodayCase { now: string; accounts: Json[]; facts: SummaryFact[] }
interface Cases { round: [number, number][]; latest: Json[]; today: TodayCase[] }

// What summary_parity.py's plain() writes for values JSON can't hold.
function plain(value: unknown): unknown {
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'nan';
    if (!Number.isFinite(value)) return value > 0 ? 'inf' : '-inf';
    return Object.is(value, -0) ? '-0' : value;
  }
  if (Array.isArray(value)) return value.map(plain);
  if (value instanceof Map) return plain(Object.fromEntries(value));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
  return value;
}

function pythonAnswers(cases: Cases): Json | null {
  const run = spawnSync(PYTHON, [join(import.meta.dirname, 'summary_parity.py')], {
    cwd: REPO,
    input: JSON.stringify(cases),
    env: { ...process.env, PYTHONPATH: REPO },
    maxBuffer: 256 * 1024 * 1024,
  });
  if (run.error || run.status !== 0) {
    if (process.env.CI) throw new Error(`Python failed: ${run.error?.message ?? run.stderr.toString()}`);
    return null;
  }
  return JSON.parse(run.stdout.toString()) as Json;
}

function generator(seed: number) {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
  const int = (max: number) => Math.floor(next() * max);
  return { next, pick, int };
}

// Exact ties in binary (k/8), decimal ".5" that lands either side of the tie
// (2.675, 1.005), negatives and zero signs, and the extremes of a double.
const TIES = [
  0.125, 0.375, 0.625, 0.875, 1.125, 2.5, 0.5, 1.5, 3.5, 2.675, 1.005, 1.015, 1.115, 0.005, 0.015, 0.025, 0.045, 0.285,
  8.345, 123456.785, 4503599627370495.5, -0.125, -0.375, -2.675, -0.005, -0.001, 0, 1e-10, 5e-324, 1e21, 1.7976931348623157e308, 0.1 + 0.2, 1 / 3,
];

function roundCases(random: ReturnType<typeof generator>): [number, number][] {
  const cases: [number, number][] = [];
  for (const value of TIES) for (const digits of [0, 1, 2, 3]) cases.push([value, digits]);
  for (let index = 0; index < 4000; index += 1) {
    const value = random.pick([
      () => random.int(100_000) / 8 + random.pick([0, 0.0625]),
      () => random.int(10_000_000) / 1000,
      () => (random.int(2_000_000) + 0.5) / 100,
      () => random.next() * 10 ** random.int(9),
      () => (random.int(5000) * 0.01) / random.pick([1, 3, 7]),
    ])();
    cases.push([random.next() < 0.1 ? -value : value, random.pick([1, 2, 2, 2])]);
  }
  return cases;
}

const STORED = [0, 1, 2.5, 0.125, 2.675, 1.005, 12.345, -3, 1e9, '7', ' 7.5 ', '1_000', '1e3', 'nan', 'abc', '', null, true, false, [], {}, [1]];
// int(float('inf')) raises OverflowError, which Python doesn't catch: only the float fields get them.
const STORED_FLOATS = [...STORED, 'inf', '-inf', '-0.001'];
const INT_KEYS = new Set(['impressions', 'reach', 'clicks', 'unique_clicks', 'link_clicks', 'outbound_clicks', 'landing_page_views', 'leads', 'registrations', 'purchases']);

function latestCases(random: ReturnType<typeof generator>): Json[] {
  const keys = [
    'spend', 'impressions', 'reach', 'frequency', 'cpm', 'clicks', 'unique_clicks', 'link_clicks', 'outbound_clicks',
    'landing_page_views', 'leads', 'registrations', 'purchases', 'cost_per_lead', 'cost_per_registration',
    'cost_per_purchase', 'cpc', 'ctr', 'ctr_link', 'cpc_link', 'cost_per_landing_page_view', 'purchase_roas',
  ];
  const summaries: Json[] = [
    {},
    { accounts: 'x' },
    { generated_at: '2026-11-06T10:00:00Z', snapshot: { saved_at: '2026-11-06T10:00:01.5Z' }, accounts: [null, 'x', { account_id: '' }, { account_id: '  ' }] },
    { generated_at: null, snapshot: [], accounts: [{ account_id: 'act_1' }, { account_id: ' act_1 ', spend: 3 }] },
  ];
  for (let index = 0; index < 300; index += 1) {
    const rows = Array.from({ length: 1 + random.int(4) }, (_, row) => {
      const result: Json = { account_id: random.pick([`act_${row}`, ` act_${row}`, row, `act_${row}\n`]) };
      if (random.next() < 0.8) result.data_status = random.pick(['synced', 'blocked', 'error', 'stale', '', null, 1]);
      if (random.next() < 0.5) result.data_status_label = random.pick(['Loaded', '', null, 0]);
      for (const key of keys) {
        const roll = random.next();
        if (roll < 0.15) continue;
        result[key] = roll < 0.5 ? random.pick(INT_KEYS.has(key) ? STORED : STORED_FLOATS) : roll < 0.75 ? random.int(100_000) / 8 : random.next() * 1000;
      }
      return result;
    });
    summaries.push({ generated_at: random.pick(['2026-11-06T10:00:00Z', '', 0]), snapshot: { saved_at: '2026-11-06T10:00:02Z' }, accounts: rows });
  }
  return summaries;
}

const ZONES = [
  'UTC', 'America/Los_Angeles', 'America/New_York', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Kolkata',
  'Asia/Kathmandu', 'Australia/Lord_Howe', 'Europe/Moscow', 'US/Hawaii', 'US/Pacific', 'Not/AZone', '',
];
const CURRENCIES = ['USD', 'usd', 'EUR', 'UAH', '', null, 'UNKNOWN', 'US$'];
const NOWS = ['2026-11-06T12:00:00Z', '2026-11-06T23:59:59.999Z', '2026-11-07T00:00:00Z', '2026-03-08T10:30:00Z', '2026-01-01T00:00:00Z', '2026-06-30T13:45:00.250Z'];

const dayOffset = (iso: string, offset: number): string => {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

function todayCases(random: ReturnType<typeof generator>): TodayCase[] {
  const cases: TodayCase[] = [];
  for (let index = 0; index < 400; index += 1) {
    const now = random.pick(NOWS);
    const accounts = Array.from({ length: 1 + random.int(5) }, (_, number) => ({
      account_id: `act_${number}`,
      name: random.pick([`Account ${number}`, 'Shop | UA', '']),
      custom_name: random.pick(['', null, 'Mine']),
      note: random.pick(['', null]),
      timezone_name: random.pick(ZONES),
      currency: random.pick(CURRENCIES),
      account_status: random.pick([1, 1, 2, 101, 3]),
      is_active: random.next() < 0.85,
      status_label: random.pick(['Active (ACTIVE)', null]),
      rules_enabled: random.next() < 0.5,
    }));
    const facts: SummaryFact[] = [];
    for (const account of accounts) {
      // Yesterday, today and tomorrow in UTC: each zone keeps only its own today.
      for (const offset of [-1, 0, 1]) {
        if (random.next() < 0.35) continue;
        const partial = random.next() < 0.3;
        const impressions = partial ? random.pick([0, 1, 3]) : random.int(200_000);
        const clicks = Math.min(impressions, random.int(5000));
        facts.push({
          account_id: account.account_id,
          date: dayOffset(now, offset),
          spend: random.pick([0, 0.125, 0.375, 2.675, 1.005, 0.1, 0.2, 0.005, random.int(100_000) / 8, random.int(1_000_000) / 100, random.next() * 500]),
          impressions,
          reach: Math.min(impressions, random.int(150_000)),
          clicks,
          unique_clicks: Math.min(clicks, random.int(4000)),
          link_clicks: Math.min(clicks, random.int(3000)),
          outbound_clicks: random.int(500),
          landing_page_views: random.int(800),
          leads: random.pick([0, 0, 1, 3, 8, 40]),
          registrations: random.pick([0, 1, 7]),
          purchases: random.pick([0, 0, 2]),
        });
      }
    }
    cases.push({ now, accounts, facts });
  }
  return cases;
}

const withoutGeneratedAt = (rows: Map<string, Json>): Json =>
  Object.fromEntries([...rows].map(([id, row]) => [id, Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'generated_at'))]));

describe('accounts list figures match Python', () => {
  const random = generator(611);
  const cases: Cases = { round: roundCases(random), latest: latestCases(random), today: todayCases(random) };
  const python = pythonAnswers(cases);

  function mismatches(name: keyof Cases, port: (item: never) => unknown): unknown[] {
    const expected = python![name] as unknown[];
    const found: unknown[] = [];
    (cases[name] as unknown[]).forEach((item, index) => {
      const actual = plain(port(item as never));
      if (JSON.stringify(actual) !== JSON.stringify(expected[index])) found.push({ case: item, python: expected[index], port: actual });
    });
    return found.slice(0, 3);
  }

  it.skipIf(!python)('rounds as round(x, n)', () => {
    expect(mismatches('round', ([value, digits]: [number, number]) => pyRound(value, digits))).toEqual([]);
  });

  it.skipIf(!python)('reads saved summaries as _latest_account_metrics_by_id', () => {
    expect(mismatches('latest', (summary: Json) => latestAccountMetricsById(summary))).toEqual([]);
  });

  it.skipIf(!python)("computes today's rows as get_workspace_summary_report", () => {
    expect(mismatches('today', ({ now, accounts, facts }: TodayCase) =>
      withoutGeneratedAt(todayFromFacts(accounts as never, facts, new Date(now))))).toEqual([]);
    // The cases reach synced and unsynced accounts alike.
    const synced = (python!.today as Json[]).reduce((count: number, rows) => count + Object.keys(rows).length, 0);
    const total = cases.today.reduce((count, item) => count + item.accounts.length, 0);
    expect(synced).toBeGreaterThan(total / 4);
    expect(synced).toBeLessThan(total);
  });

  it('rounds ties to even on the exact binary value', () => {
    expect([0.125, 0.375, 2.675, 1.005, 2.5, -0.125, -0.001].map((value) => pyRound(value, 2))).toEqual([0.12, 0.38, 2.67, 1, 2.5, -0.12, -0]);
    expect([0.5, 1.5, 2.5].map((value) => pyRound(value, 0))).toEqual([0, 2, 2]);
    expect(pyRound(0.125, 2)).not.toBe(Number((0.125).toFixed(2)));
  });

  it('reads numbers as float() does', () => {
    expect([' 7.5 ', '1_000', '1e3', '.5', '5.', 'inf', '-Infinity', 'abc', '1__0', '_1', null, [], true].map(pyFloat))
      .toEqual([7.5, 1000, 1000, 0.5, 5, Infinity, -Infinity, undefined, undefined, undefined, undefined, undefined, 1]);
  });
});
