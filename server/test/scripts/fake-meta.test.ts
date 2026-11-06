import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIFETIME_DAYS, FakeMeta, History, WORLD, addDays, buildFakeMetaApp, dayStart, localDay } from '../../src/scripts/fake-meta.ts';

// The local fake Meta (src/scripts/fake-meta.ts) behaves like the Graph API:
// today grows and never shrinks, a paused entity stops spending, a budget
// change changes the pace, a campaign is the sum of its ads. Ported from
// tests/test_fake_meta.py, plus golden numbers taken from the Python fake
// (scripts/fake_meta.py) so the two invent the same world.

const NL = 'act_1000000000000001';
const TIMEZONE = WORLD.accounts.get(NL)!.timezone;
const DAY = '2026-10-07';
const at = (hour: number, day = DAY): number => dayStart(day, TIMEZONE) + hour * 3600;
const freshHistory = (): History => new History(join(mkdtempSync(join(tmpdir(), 'fake-meta-')), 'state.json'));

function firstRunningAd() {
  for (const ad of WORLD.ads.values()) {
    const adset = WORLD.adsets.get(ad.adsetId)!;
    const campaign = WORLD.campaigns.get(adset.campaignId)!;
    if (campaign.accountId === NL && adset.dailyBudget !== null && ad.status === 'ACTIVE' && adset.status === 'ACTIVE' && campaign.status === 'ACTIVE') {
      return ad;
    }
  }
  throw new Error('the NL account has no running ad with an ad set budget');
}

describe('the fake Meta world', () => {
  it('is the Python fake: the same ads and the same numbers', () => {
    const golden = JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures/fake-meta-golden.json'), 'utf8')) as {
      now: number;
      ads: Record<string, [number, number, number, number, number, string]>;
      insights: Record<string, unknown[]>;
    };
    for (const [id, [share, cpm, ctr, leadRate, frequency, status]] of Object.entries(golden.ads)) {
      const ad = WORLD.ads.get(id)!;
      expect([ad.share, ad.cpm, ad.ctr, ad.leadRate, ad.frequency, ad.status]).toEqual([share, cpm, ctr, leadRate, frequency, status]);
    }
    const fake = new FakeMeta(WORLD, freshHistory());
    for (const [key, rows] of Object.entries(golden.insights)) {
      const [accountId, level, preset] = key.split('|');
      expect(fake.insights(WORLD.accounts.get(accountId)!, { level, date_preset: preset }, golden.now), key).toEqual(rows);
    }
  });

  it('keeps today growing through the day and a finished day the same', () => {
    const fake = new FakeMeta(WORLD, freshHistory());
    const ad = firstRunningAd();
    const [morning, noon, evening] = [6, 12, 20].map((hour) => fake.adMetrics(ad, DAY, at(hour)));
    for (const key of Object.keys(morning) as (keyof typeof morning)[]) {
      expect(morning[key], key).toBeLessThanOrEqual(noon[key]);
      expect(noon[key], key).toBeLessThanOrEqual(evening[key]);
    }
    expect(evening.spend).toBeGreaterThan(morning.spend);
    expect(fake.adMetrics(ad, DAY, at(30))).toEqual(fake.adMetrics(ad, DAY, at(50)));
  });

  it('freezes spend on pause and continues on resume', () => {
    const history = freshHistory();
    const fake = new FakeMeta(WORLD, history);
    const ad = firstRunningAd();
    const untouched = fake.adSpend(ad, DAY, at(24));
    history.record(ad.adsetId, 'status', 'PAUSED', at(12));
    expect(fake.adSpend(ad, DAY, at(18))).toBeCloseTo(fake.adSpend(ad, DAY, at(12)), 9);
    history.record(ad.adsetId, 'status', 'ACTIVE', at(18));
    expect(fake.adSpend(ad, DAY, at(24))).toBeCloseTo(untouched * 0.75, 6);
  });

  it('stops the ads of a paused campaign', () => {
    const history = freshHistory();
    const fake = new FakeMeta(WORLD, history);
    const ad = firstRunningAd();
    history.record(WORLD.adsets.get(ad.adsetId)!.campaignId, 'status', 'PAUSED', at(0));
    expect(fake.adSpend(ad, DAY, at(24))).toBe(0);
  });

  it('changes the pace with the budget', () => {
    const history = freshHistory();
    const fake = new FakeMeta(WORLD, history);
    const ad = firstRunningAd();
    const adset = WORLD.adsets.get(ad.adsetId)!;
    const untouched = fake.adSpend(ad, DAY, at(24));
    history.record(adset.id, 'daily_budget', adset.dailyBudget! * 2, at(12));
    expect(fake.adSpend(ad, DAY, at(24))).toBeCloseTo(untouched * 1.5, 6);
  });

  it('follows Meta for periods', () => {
    const fake = new FakeMeta(WORLD, freshHistory());
    const account = WORLD.accounts.get(NL)!;
    const now = at(15);
    expect(fake.reportDays(account, { date_preset: 'last_7d' }, now)).toEqual(Array.from({ length: 7 }, (_, n) => addDays(DAY, n - 7)));
    const lifetime = fake.reportDays(account, { date_preset: 'maximum' }, now);
    expect(lifetime).toHaveLength(LIFETIME_DAYS);
    expect(lifetime.at(-1)).toBe(DAY); // Meta's lifetime includes today
    expect(fake.reportDays(account, { time_range: JSON.stringify({ since: '2026-10-01', until: '2026-10-03' }) }, now)).toHaveLength(3);
  });

  it('finds local midnight across a daylight saving change', () => {
    expect(localDay('Europe/Amsterdam', Date.parse('2026-10-07T22:30:00Z') / 1000)).toBe('2026-10-08');
    expect(dayStart('2026-10-25', 'Europe/Amsterdam')).toBe(Date.parse('2026-10-24T22:00:00Z') / 1000);
    expect(dayStart('2026-10-26', 'Europe/Amsterdam')).toBe(Date.parse('2026-10-25T23:00:00Z') / 1000);
  });
});

describe('the fake Meta over HTTP', () => {
  it('answers like Meta, keeps changes in the state file and refuses what Meta refuses', async () => {
    const statePath = join(mkdtempSync(join(tmpdir(), 'fake-meta-')), 'state.json');
    const { app } = buildFakeMetaApp({ statePath, now: () => at(15) });
    const adset = WORLD.adsets.get(firstRunningAd().adsetId)!;

    expect((await app.inject('/health')).json()).toMatchObject({ ok: true });
    expect((await app.inject(`/v26.0/${NL}`)).json()).toMatchObject({ currency: 'EUR', timezone_name: 'Europe/Amsterdam' });

    const form = { 'content-type': 'application/x-www-form-urlencoded' };
    const get = async (url: string) => (await app.inject(url)).json<Record<string, any>>(); // eslint-disable-line @typescript-eslint/no-explicit-any
    const post = (payload: string) => app.inject({ method: 'POST', url: `/v26.0/${adset.id}`, headers: form, payload });
    expect((await post('status=paused')).json()).toEqual({ success: true });
    expect((await app.inject(`/v26.0/${adset.id}`)).json()).toMatchObject({ status: 'PAUSED', effective_status: 'PAUSED' });
    expect((await get(`/v26.0/${adset.ads[0]}`)).effective_status).toBe('ADSET_PAUSED');
    await post('daily_budget=32100');
    expect((await get(`/v26.0/${adset.id}`)).daily_budget).toBe('32100');
    const saved = JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, unknown[][]>;
    expect(saved[adset.id].map((event) => event[1])).toEqual(['status', 'daily_budget']);

    const unknown = await app.inject('/v26.0/act_404');
    expect(unknown.statusCode).toBe(400);
    expect((unknown.json<{ error: { code: number } }>()).error.code).toBe(100);
    expect((await post('status=DELETED')).statusCode).toBe(400);
    expect((await post('daily_budget=0')).statusCode).toBe(400);
    expect((await app.inject(`/v26.0/${NL}/insights?date_preset=bogus`)).statusCode).toBe(400);
    await app.close();
  });
});
