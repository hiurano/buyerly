import { describe, expect, it } from 'vitest';
import { todayFromFacts, type SummaryFact } from '../../src/graphql/areas/accounts/summary.ts';
import { pyFloat, pyRound } from '../../src/python-numbers.ts';

// The accounts list's figures: round(x, n) (ties to even on the exact binary
// value) and the "today" rows of get_workspace_summary_report — .5 cases,
// accounts in far-apart and aliased time zones, currencies, empty and partial
// days. Proved equal to Python's in CI before Python was removed (#611).

type Json = Record<string, unknown>;
interface TodayCase { now: string; accounts: Json[]; facts: SummaryFact[] }

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

describe('accounts list figures', () => {
  it("computes today's rows for synced and unsynced accounts alike", () => {
    const cases = todayCases(generator(611));
    let synced = 0;
    let total = 0;
    for (const { now, accounts, facts } of cases) {
      synced += Object.keys(withoutGeneratedAt(todayFromFacts(accounts as never, facts, new Date(now)))).length;
      total += accounts.length;
    }
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
