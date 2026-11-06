import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { pyRound } from '../python-numbers.ts';

// A fake Meta Graph API for local development and branch previews (#611,
// stage 5; port of scripts/fake_meta.py, same invented world, same numbers,
// same state file). compose.dev.yaml runs it as the `fake-meta` service and
// points the MetaClient at it (META_GRAPH_BASE_URL), so a local stack has ad
// accounts, campaigns, ad sets and ads with numbers, and rules can stop,
// start and rebudget them, all without Meta or a real token.
//
// It answers the calls the MetaClient makes, the way the Marketing API does:
//
//   GET  /<version>/act_<id>                       ad account info
//   GET  /<version>/act_<id>/campaigns|adsets|ads  inventory, cursor pages
//   GET  /<version>/act_<id>/insights              level=account|campaign|adset|ad,
//                                                  date_preset or time_range
//   GET  /<version>/<entity id>                    live state of one entity
//   POST /<version>/<entity id>                    status=PAUSED|ACTIVE or
//                                                  daily_budget=<minor units>
//
// The world is invented and fixed (buildWorld); every ad has its own CPM, CTR
// and conversion rates. Each day an ad spends its share of the budget, spread
// evenly over the ad account's local day, so today's numbers grow while you
// watch and a finished day stays the same. Spend only accrues while the ad,
// its ad set and its campaign are all ACTIVE, at the budget in force at the
// time: a rule that pauses an ad set at 14:00 freezes its spend there. Counts
// are whole numbers derived from spend, so they only ever grow during a day,
// and a campaign's numbers are the sums of its ads.
//
// Status and budget changes are kept with their time in a JSON file
// (FAKE_META_STATE, default /data/fake-meta.json), so they survive a restart.
// Any access token is accepted.
//
//   node server/dist/scripts/fake-meta.js        (FAKE_META_PORT, default 8090)

export const PAGE_SIZE = 25;
const DAY_SECONDS = 24 * 60 * 60;
// How long the world has been delivering, which is what date_preset=maximum covers.
export const LIFETIME_DAYS = 30;

// ---------------------------------------------------------------------------
// Python's random.Random(seed), so the world is the one the Python fake has.

class PythonRandom {
  private readonly state = new Uint32Array(624);
  private index = 624;

  constructor(seed: number) {
    this.initGenrand(19650218);
    // init_by_array([seed]); the seed fits in 32 bits.
    const key = [seed >>> 0];
    let i = 1;
    let j = 0;
    for (let k = Math.max(624, key.length); k > 0; k -= 1) {
      const prev = this.state[i - 1] ^ (this.state[i - 1] >>> 30);
      this.state[i] = (this.state[i] ^ Math.imul(prev, 1664525)) + key[j] + j;
      i += 1;
      j += 1;
      if (i >= 624) {
        this.state[0] = this.state[623];
        i = 1;
      }
      if (j >= key.length) j = 0;
    }
    for (let k = 623; k > 0; k -= 1) {
      const prev = this.state[i - 1] ^ (this.state[i - 1] >>> 30);
      this.state[i] = (this.state[i] ^ Math.imul(prev, 1566083941)) - i;
      i += 1;
      if (i >= 624) {
        this.state[0] = this.state[623];
        i = 1;
      }
    }
    this.state[0] = 0x80000000;
  }

  private initGenrand(seed: number): void {
    this.state[0] = seed;
    for (let i = 1; i < 624; i += 1) {
      this.state[i] = Math.imul(1812433253, this.state[i - 1] ^ (this.state[i - 1] >>> 30)) + i;
    }
  }

  private next32(): number {
    if (this.index >= 624) {
      const s = this.state;
      for (let k = 0; k < 624; k += 1) {
        const y = (s[k] & 0x80000000) | (s[(k + 1) % 624] & 0x7fffffff);
        s[k] = s[(k + 397) % 624] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      this.index = 0;
    }
    let y = this.state[this.index];
    this.index += 1;
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  random(): number {
    const a = this.next32() >>> 5;
    const b = this.next32() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  }

  uniform(low: number, high: number): number {
    return low + (high - low) * this.random();
  }
}

// ---------------------------------------------------------------------------
// The world

export interface Ad {
  id: string;
  name: string;
  adsetId: string;
  status: string;
  // Share of the ad set's budget this ad spends on a full day.
  share: number;
  cpm: number;
  ctr: number;
  linkRatio: number;
  lpvRatio: number;
  leadRate: number;
  registrationRate: number;
  purchaseRate: number;
  frequency: number;
}

export interface AdSet {
  id: string;
  name: string;
  campaignId: string;
  status: string;
  // Minor units of the account currency; null when the campaign holds it.
  dailyBudget: number | null;
  // Share of the campaign budget (campaign budget optimization only).
  share: number;
  ads: string[];
}

export interface Campaign {
  id: string;
  name: string;
  accountId: string;
  status: string;
  dailyBudget: number | null;
  adsets: string[];
}

export interface Account {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  campaigns: string[];
}

export class World {
  readonly accounts = new Map<string, Account>();
  readonly campaigns = new Map<string, Campaign>();
  readonly adsets = new Map<string, AdSet>();
  readonly ads = new Map<string, Ad>();

  accountOf(entityId: string): string | null {
    let id = entityId;
    const ad = this.ads.get(id);
    if (ad) id = ad.adsetId;
    const adset = this.adsets.get(id);
    if (adset) id = adset.campaignId;
    return this.campaigns.get(id)?.accountId ?? null;
  }

  entity(entityId: string): Campaign | AdSet | Ad | undefined {
    return this.campaigns.get(entityId) ?? this.adsets.get(entityId) ?? this.ads.get(entityId);
  }
}

type AdSetSpec = [name: string, status: string, budget: number | null, quality: number, ads: string[]];
type CampaignSpec = [name: string, status: string, budget: number | null, adsets: AdSetSpec[]];
type AccountSpec = [id: string, name: string, currency: string, timezone: string, goal: string, campaigns: CampaignSpec[]];

// goal decides which conversions the ads bring: leads, registrations or purchases.
// quality scales CTR and conversion rates: 1.0 is a normal ad set.
const WORLD_SPEC: AccountSpec[] = [
  ['act_1000000000000001', 'NL · Lead gen', 'EUR', 'Europe/Amsterdam', 'leads', [
    ['NL | Leads | Broad', 'ACTIVE', null, [
      ['Broad 25-54', 'ACTIVE', 15000, 1.0, ['Video · Testimonial', 'Static · Offer']],
      ['Broad 35-65+', 'ACTIVE', 12000, 0.8, ['Video · Testimonial', 'Carousel · Steps']],
      ['Broad · Women', 'PAUSED', 8000, 1.1, ['Static · Offer']],
    ]],
    ['NL | Leads | Interests', 'ACTIVE', 30000, [
      ['Finance interests', 'ACTIVE', null, 1.2, ['Video · Explainer', 'Static · Calculator']],
      ['Lookalike 1%', 'ACTIVE', null, 0.6, ['Video · Explainer', 'Static · Calculator']],
    ]],
    ['NL | Leads | Retargeting', 'PAUSED', null, [
      ['Site visitors 30d', 'ACTIVE', 5000, 1.5, ['Static · Reminder']],
    ]],
  ]],
  ['act_1000000000000002', 'US · Sweepstakes', 'USD', 'America/New_York', 'registrations', [
    ['US | Reg | Broad', 'ACTIVE', null, [
      ['Broad 18-65+', 'ACTIVE', 20000, 1.0, ['UGC · Unboxing', 'Static · Prize', 'Video · Spin']],
      ['Broad · Mobile', 'ACTIVE', 10000, 0.4, ['UGC · Unboxing', 'Static · Prize']],
    ]],
    ['US | Reg | Lookalike', 'ACTIVE', null, [
      ['LAL 2% registrations', 'ACTIVE', 15000, 1.3, ['Video · Spin', 'Static · Prize']],
    ]],
  ]],
  ['act_1000000000000003', 'DE · E-commerce', 'EUR', 'Europe/Berlin', 'purchases', [
    ['DE | Sales | Advantage+', 'ACTIVE', 40000, [
      ['Advantage+ audience', 'ACTIVE', null, 1.0, ['Carousel · Bestsellers', 'Video · Product', 'Static · Sale']],
    ]],
    ['DE | Sales | Catalog', 'ACTIVE', null, [
      ['Catalog · Viewed 14d', 'ACTIVE', 12000, 1.4, ['Dynamic · Catalog']],
      ['Catalog · Broad', 'PAUSED', 9000, 0.7, ['Dynamic · Catalog']],
    ]],
  ]],
];

// (lead rate, registration rate, purchase rate) per landing page view
const GOAL_RATES: Record<string, [number, number, number]> = {
  leads: [0.09, 0.012, 0.0],
  registrations: [0.03, 0.11, 0.004],
  purchases: [0.0, 0.025, 0.035],
};

export function buildWorld(): World {
  const world = new World();
  const rng = new PythonRandom(20261011);
  let counter = 0;
  const nextId = (prefix: string): string => {
    counter += 1;
    return `${prefix}${String(counter).padStart(6, '0')}`;
  };

  for (const [accountId, accountName, currency, timezone, goal, campaigns] of WORLD_SPEC) {
    const account: Account = { id: accountId, name: accountName, currency, timezone, campaigns: [] };
    world.accounts.set(accountId, account);
    const [leadRate, regRate, purchaseRate] = GOAL_RATES[goal];
    for (const [campaignName, campaignStatus, campaignBudget, adsets] of campaigns) {
      const campaign: Campaign = {
        id: nextId('1202000000'),
        name: campaignName,
        accountId,
        status: campaignStatus,
        dailyBudget: campaignBudget,
        adsets: [],
      };
      world.campaigns.set(campaign.id, campaign);
      account.campaigns.push(campaign.id);
      for (const [adsetName, adsetStatus, adsetBudget, quality, adNames] of adsets) {
        const adset: AdSet = {
          id: nextId('1202100000'),
          name: adsetName,
          campaignId: campaign.id,
          status: adsetStatus,
          dailyBudget: adsetBudget,
          share: 1.0 / adsets.length,
          ads: [],
        };
        world.adsets.set(adset.id, adset);
        campaign.adsets.push(adset.id);
        const weights = adNames.map(() => rng.uniform(0.5, 1.5));
        const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
        adNames.forEach((adName, position) => {
          // Object literal members evaluate in order, as the Python keyword arguments do.
          const ad: Ad = {
            id: nextId('1202200000'),
            name: adName,
            adsetId: adset.id,
            status: rng.random() > 0.12 ? 'ACTIVE' : 'PAUSED',
            share: (weights[position] / weightSum) * rng.uniform(0.75, 1.0),
            cpm: rng.uniform(6.0, 22.0),
            ctr: rng.uniform(0.006, 0.028) * quality,
            linkRatio: rng.uniform(0.55, 0.85),
            lpvRatio: rng.uniform(0.6, 0.9),
            leadRate: leadRate * quality * rng.uniform(0.6, 1.4),
            registrationRate: regRate * quality * rng.uniform(0.6, 1.4),
            purchaseRate: purchaseRate * quality * rng.uniform(0.6, 1.4),
            frequency: rng.uniform(1.1, 1.8),
          };
          world.ads.set(ad.id, ad);
          adset.ads.push(ad.id);
        });
      }
    }
  }
  return world;
}

export const WORLD = buildWorld();

// ---------------------------------------------------------------------------
// Changes made through the API, with their time

type Change = [at: number, field: string, value: string | number];

// Status and budget changes per entity, oldest first, persisted to disk.
export class History {
  events: Record<string, Change[]> = {};

  constructor(readonly file: string) {
    try {
      const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) this.events = raw as Record<string, Change[]>;
    } catch {
      this.events = {};
    }
  }

  record(entityId: string, field: string, value: string | number, at: number): void {
    (this.events[entityId] ??= []).push([at, field, value]);
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.events));
    } catch {
      // The state is a convenience; the fake Meta keeps answering from memory.
    }
  }

  valueAt(entityId: string, field: string, initial: string | number, at: number): string | number {
    let value = initial;
    for (const [when, name, newValue] of this.events[entityId] ?? []) {
      if (when > at) break;
      if (name === field) value = newValue;
    }
    return value;
  }

  changeTimes(entityIds: string[], start: number, end: number): number[] {
    const times: number[] = [];
    for (const entityId of entityIds) {
      for (const [when] of this.events[entityId] ?? []) if (start < when && when < end) times.push(when);
    }
    return times.sort((a, b) => a - b);
  }
}

// ---------------------------------------------------------------------------
// Days and time zones. A day is "YYYY-MM-DD", as the Marketing API writes it.

export function addDays(day: string, count: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
}

const zoneFormats = new Map<string, Intl.DateTimeFormat>();
function zoneParts(timezone: string, at: number): Record<string, number> {
  let format = zoneFormats.get(timezone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    zoneFormats.set(timezone, format);
  }
  const parts: Record<string, number> = {};
  for (const part of format.formatToParts(new Date(at * 1000))) if (part.type !== 'literal') parts[part.type] = Number(part.value);
  return parts;
}

// The local calendar day in `timezone` at unix time `at`.
export function localDay(timezone: string, at: number): string {
  const { year, month, day } = zoneParts(timezone, Math.floor(at));
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Unix time of 00:00 of `day` in `timezone`.
export function dayStart(day: string, timezone: string): number {
  const [year, month, date] = day.split('-').map(Number);
  const wall = Date.UTC(year, month - 1, date) / 1000;
  const offsetAt = (at: number): number => {
    const p = zoneParts(timezone, at);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000 - at;
  };
  let guess = wall - offsetAt(wall);
  guess = wall - offsetAt(guess);
  return guess;
}

// ---------------------------------------------------------------------------
// Metrics

// The same ad has better and worse days; fixed for each date.
export function dayFactor(adId: string, day: string): number {
  const digest = createHash('sha256').update(`${adId}:${day}`).digest();
  return 0.7 + 0.6 * (digest[0] / 255);
}

export interface Metrics {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  unique_clicks: number;
  link_clicks: number;
  outbound_clicks: number;
  landing_page_views: number;
  leads: number;
  registrations: number;
  purchases: number;
}

const SUMMED = [
  'spend', 'impressions', 'reach', 'clicks', 'unique_clicks', 'link_clicks',
  'outbound_clicks', 'landing_page_views', 'leads', 'registrations', 'purchases',
] as const;

export class FakeMeta {
  constructor(
    readonly world: World,
    readonly history: History,
  ) {}

  statusAt(entityId: string, at: number): string {
    return String(this.history.valueAt(entityId, 'status', this.world.entity(entityId)!.status, at));
  }

  budgetAt(entityId: string, at: number): number | null {
    const entity = this.world.campaigns.get(entityId) ?? this.world.adsets.get(entityId);
    if (!entity || entity.dailyBudget === null) return null;
    return Math.trunc(Number(this.history.valueAt(entityId, 'daily_budget', entity.dailyBudget, at)));
  }

  // Spend per second (major units) the ad runs at when everything is on.
  adFullDayRate(ad: Ad, at: number): number {
    const adset = this.world.adsets.get(ad.adsetId)!;
    const campaign = this.world.campaigns.get(adset.campaignId)!;
    let adsetDaily: number;
    if (adset.dailyBudget !== null) adsetDaily = (this.budgetAt(adset.id, at) || 0) / 100;
    else adsetDaily = ((this.budgetAt(campaign.id, at) || 0) / 100) * adset.share;
    return (adsetDaily * ad.share) / DAY_SECONDS;
  }

  // What the ad spent on its account's local `day`, up to `now`.
  adSpend(ad: Ad, day: string, now: number): number {
    const adset = this.world.adsets.get(ad.adsetId)!;
    const campaign = this.world.campaigns.get(adset.campaignId)!;
    const timezone = this.world.accounts.get(campaign.accountId)!.timezone;
    const start = dayStart(day, timezone);
    const end = Math.min(dayStart(addDays(day, 1), timezone), now);
    if (end <= start) return 0;
    const chain = [ad.id, adset.id, campaign.id];
    const cuts = [start, ...this.history.changeTimes(chain, start, end), end];
    let spent = 0;
    for (let index = 0; index + 1 < cuts.length; index += 1) {
      const [left, right] = [cuts[index], cuts[index + 1]];
      const middle = (left + right) / 2;
      if (chain.every((entityId) => this.statusAt(entityId, middle) === 'ACTIVE')) {
        spent += this.adFullDayRate(ad, middle) * (right - left);
      }
    }
    return spent * dayFactor(ad.id, day);
  }

  adMetrics(ad: Ad, day: string, now: number): Metrics {
    const spend = pyRound(this.adSpend(ad, day, now), 2);
    const impressions = Math.floor((spend / ad.cpm) * 1000);
    const clicks = Math.floor(impressions * ad.ctr);
    const linkClicks = Math.floor(clicks * ad.linkRatio);
    const landingPageViews = Math.floor(linkClicks * ad.lpvRatio);
    return {
      spend,
      impressions,
      reach: Math.floor(impressions / ad.frequency),
      clicks,
      unique_clicks: Math.floor(clicks * 0.92),
      link_clicks: linkClicks,
      outbound_clicks: Math.floor(linkClicks * 0.95),
      landing_page_views: landingPageViews,
      leads: Math.floor(landingPageViews * ad.leadRate),
      registrations: Math.floor(landingPageViews * ad.registrationRate),
      purchases: Math.floor(landingPageViews * ad.purchaseRate),
    };
  }

  total(adIds: string[], days: string[], now: number): Metrics {
    const sums = Object.fromEntries(SUMMED.map((key) => [key, 0])) as unknown as Metrics;
    for (const adId of adIds) {
      for (const day of days) {
        const metrics = this.adMetrics(this.world.ads.get(adId)!, day, now);
        for (const key of SUMMED) sums[key] += metrics[key];
      }
    }
    sums.spend = pyRound(sums.spend, 2);
    return sums;
  }

  // ---------------------------------------------------------------------
  // Graph API answers

  effectiveStatus(entityId: string, now: number): string {
    const ad = this.world.ads.get(entityId);
    if (ad) {
      const own = this.statusAt(ad.id, now);
      if (own !== 'ACTIVE') return own;
      const parent = this.effectiveStatus(ad.adsetId, now);
      return parent === 'PAUSED' ? 'ADSET_PAUSED' : parent === 'CAMPAIGN_PAUSED' ? 'CAMPAIGN_PAUSED' : parent;
    }
    const adset = this.world.adsets.get(entityId);
    if (adset) {
      const own = this.statusAt(adset.id, now);
      if (own !== 'ACTIVE') return own;
      return this.statusAt(adset.campaignId, now) !== 'ACTIVE' ? 'CAMPAIGN_PAUSED' : 'ACTIVE';
    }
    return this.statusAt(entityId, now);
  }

  entityFields(entityId: string, now: number): Record<string, string> {
    const accountId = this.world.accountOf(entityId) ?? '';
    const entity = this.world.entity(entityId)!;
    const row: Record<string, string> = {
      id: entityId,
      account_id: accountId.replace(/^act_/, ''),
      name: entity.name,
      status: this.statusAt(entityId, now),
      effective_status: this.effectiveStatus(entityId, now),
    };
    const budget = this.budgetAt(entityId, now);
    if (budget !== null) row.daily_budget = String(budget);
    const adset = this.world.adsets.get(entityId);
    if (adset) row.campaign_id = adset.campaignId;
    const ad = this.world.ads.get(entityId);
    if (ad) {
      row.adset_id = ad.adsetId;
      row.campaign_id = this.world.adsets.get(ad.adsetId)!.campaignId;
    }
    return row;
  }

  reportDays(account: Account, params: Record<string, string>, now: number): string[] {
    if (params.time_range) {
      const window = JSON.parse(params.time_range) as { since: string; until: string };
      const since = parseDay(window.since);
      const until = parseDay(window.until);
      const count = Math.round((Date.parse(until) - Date.parse(since)) / 86_400_000) + 1;
      return Array.from({ length: Math.max(count, 0) }, (_, n) => addDays(since, n));
    }
    const today = localDay(account.timezone, now);
    const preset = params.date_preset || 'last_30d';
    if (preset === 'today') return [today];
    if (preset === 'yesterday') return [addDays(today, -1)];
    // Meta's lifetime: every day up to now, today included. The invented world
    // has been running for LIFETIME_DAYS.
    if (preset === 'maximum') return Array.from({ length: LIFETIME_DAYS }, (_, n) => addDays(today, n - LIFETIME_DAYS + 1));
    const last = /^last_(\d+)d$/.exec(preset);
    // Meta's last_Nd ends yesterday.
    if (last) return Array.from({ length: Number(last[1]) }, (_, n) => addDays(today, n - Number(last[1])));
    throw new Error(`unsupported date_preset ${preset}`);
  }

  insights(account: Account, params: Record<string, string>, now: number): Record<string, unknown>[] {
    const level = params.level || 'account';
    const days = this.reportDays(account, params, now);
    if (days.length === 0) throw new Error('empty time_range');
    const period = { date_start: days[0], date_stop: days[days.length - 1] };
    const { campaigns, adsets } = this.world;
    const accountAds = account.campaigns.flatMap((campaignId) =>
      campaigns.get(campaignId)!.adsets.flatMap((adsetId) => adsets.get(adsetId)!.ads),
    );
    const groups: [Record<string, string>, string[]][] = [];
    if (level === 'account') groups.push([{ account_id: account.id.replace(/^act_/, ''), account_name: account.name }, accountAds]);
    for (const campaignId of account.campaigns) {
      const campaign = campaigns.get(campaignId)!;
      const campaignAds = campaign.adsets.flatMap((adsetId) => adsets.get(adsetId)!.ads);
      if (level === 'campaign') groups.push([{ campaign_id: campaign.id, campaign_name: campaign.name }, campaignAds]);
      for (const adsetId of campaign.adsets) {
        const adset = adsets.get(adsetId)!;
        const ids = { campaign_id: campaign.id, adset_id: adset.id, adset_name: adset.name };
        if (level === 'adset') groups.push([ids, [...adset.ads]]);
        if (level === 'ad') {
          for (const adId of adset.ads) groups.push([{ ...ids, ad_id: adId, ad_name: this.world.ads.get(adId)!.name }, [adId]]);
        }
      }
    }
    const rows: Record<string, unknown>[] = [];
    for (const [ids, adIds] of groups) {
      const sums = this.total(adIds, days, now);
      if (sums.spend === 0 && sums.impressions === 0) continue; // Meta leaves out what did not deliver
      rows.push({ ...ids, ...insightRow(sums), ...period });
    }
    return rows;
  }
}

// A date as the Marketing API writes it, or an error (Python's date.fromisoformat).
function parseDay(text: string): string {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) {
    throw new Error(`Invalid isoformat string: ${String(text)}`);
  }
  return text;
}

// Metrics the way the Marketing API writes them: strings, actions lists.
export function insightRow(sums: Metrics): Record<string, unknown> {
  const { spend, impressions, clicks } = sums;
  const actions: [string, number][] = [
    ['link_click', sums.link_clicks],
    ['landing_page_view', sums.landing_page_views],
    ['lead', sums.leads],
    ['complete_registration', sums.registrations],
    ['purchase', sums.purchases],
  ];
  const row: Record<string, unknown> = {
    spend: spend.toFixed(2),
    impressions: String(impressions),
    reach: String(sums.reach),
    frequency: sums.reach ? (impressions / sums.reach).toFixed(6) : '0',
    cpm: impressions ? ((spend / impressions) * 1000).toFixed(6) : '0',
    clicks: String(clicks),
    unique_clicks: String(sums.unique_clicks),
    inline_link_clicks: String(sums.link_clicks),
    cpc: clicks ? (spend / clicks).toFixed(6) : '0',
    ctr: impressions ? ((clicks / impressions) * 100).toFixed(6) : '0',
    actions: actions.filter(([, value]) => value).map(([name, value]) => ({ action_type: name, value: String(value) })),
    cost_per_action_type: actions.filter(([, value]) => value).map(([name, value]) => ({ action_type: name, value: (spend / value).toFixed(6) })),
  };
  if (sums.outbound_clicks) row.outbound_clicks = [{ action_type: 'outbound_click', value: String(sums.outbound_clicks) }];
  return row;
}

// ---------------------------------------------------------------------------
// The HTTP app

export interface FakeMetaOptions {
  statePath?: string;
  // Unix seconds; the clock of the world. Tests set it.
  now?: () => number;
}

const graphError = (code: number, message: string, status = 400) => ({
  status,
  body: { error: { message, type: 'OAuthException', code } },
});

export function buildFakeMetaApp(options: FakeMetaOptions = {}): { app: FastifyInstance; fake: FakeMeta } {
  const statePath = options.statePath ?? process.env.FAKE_META_STATE ?? '/data/fake-meta.json';
  const clock = options.now ?? ((): number => Date.now() / 1000);
  const fake = new FakeMeta(WORLD, new History(statePath));
  const app = Fastify({ logger: false });

  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  const send = (reply: { code(status: number): unknown }, answer: { status: number; body: unknown }) => {
    reply.code(answer.status);
    return answer.body;
  };
  const pageOf = (rows: unknown[], params: Record<string, string>, request: FastifyRequest) => {
    const start = Number.parseInt(params.after || '0', 10) || 0;
    const body: Record<string, unknown> = { data: rows.slice(start, start + PAGE_SIZE) };
    if (start + PAGE_SIZE < rows.length) {
      const after = String(start + PAGE_SIZE);
      const next = new URL(`${request.protocol}://${request.headers.host ?? 'fake-meta'}${request.url}`);
      next.searchParams.set('after', after);
      body.paging = { cursors: { before: String(start), after }, next: next.toString() };
    }
    return body;
  };

  app.get('/health', async () => ({ ok: true, accounts: [...WORLD.accounts.keys()].sort() }));

  app.get<{ Params: { version: string; objectId: string } }>('/:version/:objectId', async (request, reply) => {
    const now = clock();
    const { objectId } = request.params;
    const account = WORLD.accounts.get(objectId);
    if (account) {
      return {
        id: account.id,
        name: account.name,
        timezone_name: account.timezone,
        currency: account.currency,
        account_status: 1,
        disable_reason: 0,
      };
    }
    if (WORLD.accountOf(objectId)) return fake.entityFields(objectId, now);
    return send(reply, graphError(100, `Unsupported get request. Object with ID '${objectId}' does not exist`));
  });

  app.get<{ Params: { version: string; accountId: string; edge: string } }>('/:version/:accountId/:edge', async (request, reply) => {
    const now = clock();
    const params = request.query as Record<string, string>;
    const { accountId, edge } = request.params;
    const account = WORLD.accounts.get(accountId);
    if (!account) return send(reply, graphError(100, `Unsupported get request. Object with ID '${accountId}' does not exist`));
    if (edge === 'insights') {
      let rows: Record<string, unknown>[];
      try {
        rows = fake.insights(account, params, now);
      } catch (error) {
        return send(reply, graphError(100, `Invalid parameter: ${(error as Error).message}`));
      }
      return pageOf(rows, params, request);
    }
    const campaignIds = account.campaigns;
    const adsetIds = campaignIds.flatMap((id) => WORLD.campaigns.get(id)!.adsets);
    const ids: Record<string, string[]> = {
      campaigns: campaignIds,
      adsets: adsetIds,
      ads: adsetIds.flatMap((id) => WORLD.adsets.get(id)!.ads),
    };
    if (!Object.hasOwn(ids, edge)) return send(reply, graphError(100, `Unknown edge ${edge}`));
    return pageOf(ids[edge].map((id) => fake.entityFields(id, now)), params, request);
  });

  app.post<{ Params: { version: string; objectId: string } }>('/:version/:objectId', async (request, reply) => {
    const now = clock();
    const { objectId } = request.params;
    if (!WORLD.accountOf(objectId)) {
      return send(reply, graphError(100, `Unsupported post request. Object with ID '${objectId}' does not exist`));
    }
    const body = request.body && typeof request.body === 'object' ? (request.body as Record<string, string>) : {};
    const form: Record<string, unknown> = { ...body, ...(request.query as Record<string, string>) };
    if ('status' in form) {
      const status = String(form.status).toUpperCase();
      if (status !== 'ACTIVE' && status !== 'PAUSED') return send(reply, graphError(100, 'Invalid parameter: status'));
      fake.history.record(objectId, 'status', status, now);
    }
    if ('daily_budget' in form) {
      if (fake.budgetAt(objectId, now) === null) return send(reply, graphError(100, 'This object has no daily budget of its own'));
      const text = String(form.daily_budget);
      if (!/^\s*[+-]?\d+\s*$/.test(text)) return send(reply, graphError(100, 'Invalid parameter: daily_budget'));
      const budget = Number.parseInt(text, 10);
      if (budget <= 0) return send(reply, graphError(100, 'Invalid parameter: daily_budget'));
      fake.history.record(objectId, 'daily_budget', budget, now);
    }
    return { success: true };
  });

  return { app, fake };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { app } = buildFakeMetaApp();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => void app.close().then(() => process.exit(0)));
  }
  await app.listen({ port: Number(process.env.FAKE_META_PORT ?? 8090), host: '0.0.0.0' });
}
