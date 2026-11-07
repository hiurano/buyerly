import { parseArgs } from 'node:util';
import Fastify, { type FastifyInstance } from 'fastify';
import type { DataSource } from 'typeorm';
import { readConfig } from '../config.ts';
import { createBuyerlyDataSource, databaseOver } from '../database.ts';
import { AccountEntity, AppSettingsEntity, UserEntity, WorkspaceEntity, WorkspaceMemberEntity } from '../entities/index.ts';
import { EXAMPLE_PRESETS } from '../graphql/areas/rules/examples.ts';
import { RouteError } from '../graphql/errors.ts';
import { useMetaClient } from '../meta/app-client.ts';
import { MetaClient, type Priority } from '../meta/client.ts';
import { classifyMetaTokenError } from '../meta/errors.ts';
import type { Json } from '../meta/python.ts';
import { undoAuditEvent } from '../meta/undo.ts';
import { pyRound } from '../python-numbers.ts';
import { AccountSync } from '../worker/account-sync.ts';
import { RuleCycle } from '../worker/rule-cycle.ts';

// Replay simulated buyer days through the real worker, rule engine and undo
// (#611 stage 5; port of scripts/rule_simulator.py with the same flags,
// scenarios, output and exit codes).
//
// The ad accounts are invented: every ad set spends at its own pace and earns
// clicks, leads and registrations at fixed spend points. The worker (account
// sync and rule cycle), the rule engine, the stop confirmation, the audit
// trail (Inbox), the undo and the MetaClient's retries are Buyerly's own,
// running against the disposable test database. Rule writes and undo reads go
// through the real MetaClient into a fake Meta endpoint (a `fetch`) that can
// answer 429, 5xx, time out before or after applying the change, or refuse an
// expired token.
//
// Each run reports, per ad set and per day:
//
// - the cent at which a buyer following the cheat sheet perfectly stops it, at
//   which Buyerly stopped it, and at which a buyer checking Ads Manager every N
//   minutes would have;
// - the delay from the moment the condition really held to the STOP in Inbox;
// - extra actions (Buyerly stopped what the sheet keeps), early ones (stopped
//   before the sheet would), missed ones, and double writes to Meta;
// - after an undo: whether Meta is back, a repeated undo writes nothing and the
//   rule leaves the ad set alone for the rest of the day.
//
// The default rules are a Netherlands lead-gen buyer's cheat sheet, the
// ready-made examples every workspace gets (graphql/areas/rules/examples.ts):
//
// - $3.00 and no link click: dead;
// - $3.50 and one link click: dead;
// - $4.00 and no lead: dead;
// - $7.00, no registration and fewer than two leads: hard stop;
// - $12.00: the ceiling, whatever happened.
//
// Run it against the local disposable database only (the same guard as the
// tests), after `npm run build`:
//
//   TEST_DATABASE_URL=postgresql+asyncpg://buyerly:...@localhost:5432/buyerly_test \
//   TEST_DATABASE_DISPOSABLE=buyerly_test \
//   node server/dist/scripts/rule-simulator.js --scenario all
//
// test/scripts/rule-simulator.test.ts runs the same scenarios and pins the
// numbers; docs/PILOT_SIMULATION.md explains them.

const TIMEZONE = 'Europe/Amsterdam';
const ACCOUNT_ID = 'act_simulated_nl';
const LAUNCH_HOUR = 9;
const TOKEN_KEY = 'CKOJW1eA4PLOe59rNqizKftdfj0lN17_CIFSpe7ihLw=';

// (name, conditions) in the order a buyer reads the cheat sheet.
type Condition = [metric: string, operator: string, value: number];
export const CHEAT_SHEET_RULES: Array<[string, Condition[]]> = EXAMPLE_PRESETS.map((preset) => [
  preset.name,
  preset.conditions.map((condition): Condition => [condition.metric, condition.operator, Number(condition.value)]),
]);

const OPERATORS: Record<string, (value: number, target: number) => boolean> = {
  gte: (value, target) => value >= target,
  lte: (value, target) => value <= target,
  eq: (value, target) => value === target,
};

const MANUAL_CHECK_MINUTES = [15, 30, 60] as const;

type Counts = { clicks: number; link_clicks: number; leads: number; registrations: number };

export class SimulatedAdSet {
  readonly dailyBudget: number;
  readonly clicksAt: number[];
  readonly leadsAt: number[];
  readonly registrationsAt: number[];
  status = 'ACTIVE';
  spentCents = 0;
  history: number[] = [0];

  constructor(
    readonly adsetId: string,
    readonly name: string,
    readonly story: string,
    readonly centsPerMinute: number,
    options: { dailyBudget?: number; clicksAt?: number[]; leadsAt?: number[]; registrationsAt?: number[] } = {},
  ) {
    this.dailyBudget = options.dailyBudget ?? 30.0;
    this.clicksAt = options.clicksAt ?? [];
    this.leadsAt = options.leadsAt ?? [];
    this.registrationsAt = options.registrationsAt ?? [];
  }

  get dollarsPerMinute(): number {
    return this.centsPerMinute / 100;
  }

  // Spend after `minutes` if nobody ever paused it.
  trajectory(minutes: number): number {
    const cents = Math.min(Math.trunc(this.dailyBudget * 100), Math.trunc(Math.max(0, minutes) * this.centsPerMinute));
    return cents / 100;
  }

  // One more minute of delivery.
  advance(): void {
    if (this.status === 'ACTIVE') this.spentCents = Math.min(Math.trunc(this.dailyBudget * 100), this.spentCents + this.centsPerMinute);
    this.history.push(this.spentCents);
  }

  spendAtMinute(minute: number): number {
    return this.history[Math.max(0, Math.min(minute, this.history.length - 1))] / 100;
  }

  countsAt(spend: number): Counts {
    // The simulated clicks are clicks on the ad's link; Meta's all-clicks
    // count includes them, so both read the same here.
    const reached = (points: number[]) => points.filter((point) => point <= spend + 1e-9).length;
    const linkClicks = reached(this.clicksAt);
    return { clicks: linkClicks, link_clicks: linkClicks, leads: reached(this.leadsAt), registrations: reached(this.registrationsAt) };
  }

  static sheetRule(metrics: Record<string, number>): string | null {
    for (const [name, conditions] of CHEAT_SHEET_RULES) {
      if (conditions.every(([metric, op, value]) => OPERATORS[op](metrics[metric], value))) return name;
    }
    return null;
  }

  // The first cent at which a buyer following the sheet turns it off.
  cheatSheetStop(): [number | null, string | null] {
    const cents = Math.round(this.dailyBudget * 100);
    for (let cent = 0; cent <= cents; cent += 1) {
      const spend = cent / 100;
      const rule = SimulatedAdSet.sheetRule({ spend, ...this.countsAt(spend) });
      if (rule) return [spend, rule];
    }
    return [null, null];
  }

  // Spend when a buyer checking Ads Manager every `every` minutes stops it.
  manualStop(every: number, spendLag: number, eventLag: number, minutes: number): number | null {
    for (let check = every; check <= minutes; check += every) {
      const seen = { spend: this.trajectory(check - spendLag), ...this.countsAt(this.trajectory(check - eventLag)) };
      if (SimulatedAdSet.sheetRule(seen)) return this.trajectory(check);
    }
    return null;
  }
}

const adset = (id: string, name: string, story: string, cents: number, options: ConstructorParameters<typeof SimulatedAdSet>[4] = {}) =>
  new SimulatedAdSet(id, name, story, cents, options);

// A launch of lead-gen ad sets with the behaviours the sheet is written for.
export const netherlandsDay = (): SimulatedAdSet[] => [
  adset('nl_dead_fast', 'NL · dead creative, fast', 'never gets a click, spends fast', 10),
  adset('nl_dead_slow', 'NL · dead creative, slow', 'never gets a click, spends slowly', 2),
  adset('nl_one_click', 'NL · one click', 'a single click at $1.20, nothing else', 5, { clicksAt: [1.2] }),
  adset('nl_clicks_no_lead', 'NL · clicks, no lead', 'clicks but never a lead', 5, { clicksAt: [0.6, 1.4, 2.1, 2.9, 3.8, 5.0] }),
  adset('nl_late_lead', 'NL · lead at $4.40', 'the lead lands just after the $4 cut', 5, { clicksAt: [0.5, 1.5, 2.5, 3.3], leadsAt: [4.4], registrationsAt: [6.1] }),
  adset('nl_lead_no_reg', 'NL · one lead, no registration', 'a lead at $2.60, no registration', 6, { clicksAt: [0.7, 1.6, 2.2], leadsAt: [2.6] }),
  adset('nl_two_leads', 'NL · two leads, no registration', 'two leads, so it runs to the ceiling', 6, { clicksAt: [0.5, 1.2, 2.0, 3.1], leadsAt: [2.4, 5.8] }),
  adset('nl_winner', 'NL · converts', 'leads and a registration early', 8, { clicksAt: [0.3, 0.9, 1.5, 2.2], leadsAt: [1.9, 3.7, 6.5], registrationsAt: [4.2] }),
];

// Bigger budgets: the same sheet with ad sets burning 15-24 dollars an hour.
export const fastDay = (): SimulatedAdSet[] => [
  adset('fast_dead', 'Fast · dead creative', 'no click at $0.40 a minute', 40),
  adset('fast_one_click', 'Fast · one click', 'one click at $1.00', 30, { clicksAt: [1.0] }),
  adset('fast_no_lead', 'Fast · clicks, no lead', 'clicks, never a lead', 25, { clicksAt: [0.4, 0.9, 1.7, 2.6, 3.3] }),
  adset('fast_hard_stop', 'Fast · one lead, no registration', 'a lead at $2.00 and nothing more', 35, { clicksAt: [0.5, 1.1, 1.8], leadsAt: [2.0] }),
  adset('fast_winner', 'Fast · converts', 'leads at $1.50 and $3.00, registration at $3.50', 30, { clicksAt: [0.4, 0.8, 1.3], leadsAt: [1.5, 3.0], registrationsAt: [3.5] }),
];

// Leads that land close to a threshold, read with the conversion lag.
export const lateEventsDay = (): SimulatedAdSet[] => [
  adset('late_lead_380', 'Late · lead at $3.80', 'the lead lands 20 cents before the $4 cut', 5, { clicksAt: [0.5, 1.4, 2.6], leadsAt: [3.8] }),
  adset('late_lead_395', 'Late · lead at $3.95', 'the lead lands 5 cents before the $4 cut', 5, { clicksAt: [0.6, 1.5, 2.4], leadsAt: [3.95], registrationsAt: [5.2] }),
  adset('late_click_290', 'Late · first click at $2.90', 'the first click just before the $3 cut', 5, { clicksAt: [2.9, 3.4], leadsAt: [3.6] }),
  adset('late_dead', 'Late · dead creative', 'no click at all', 5),
];

// Ad sets launched at 22:30 whose cheat-sheet cut falls after midnight.
export const eveningLaunch = (): SimulatedAdSet[] => [
  adset('eve_dead_fast', 'Evening · dead, fast', 'no click, crosses $3 before midnight', 5),
  adset('eve_dead_slow', 'Evening · dead, slow', 'no click, $2.70 at midnight', 3),
  adset('eve_no_lead', 'Evening · clicks, no lead', 'clicks but no lead, $3.60 at midnight', 4, { clicksAt: [0.6, 1.5, 2.4, 3.1] }),
  adset('eve_winner', 'Evening · converts', 'two leads and a registration before midnight', 5, { dailyBudget: 10.0, clicksAt: [0.4, 1.0, 1.6], leadsAt: [1.8, 3.3], registrationsAt: [4.0] }),
];

export interface Scenario {
  name: string;
  title: string;
  adsets: () => SimulatedAdSet[];
  spendLag: number;
  eventLag: number;
  confirmationMinutes: number;
  hours: number;
  // Faults the fake Meta answers to the rule's writes, in order, then success.
  writeFaults: string[];
  // The token expires right before the first rule write.
  tokenExpiresOnFirstWrite: boolean;
  // (ad set, minutes after its STOP) the buyer presses Undo, then again.
  undo: [string, number] | null;
  undoWriteFaults: string[];
  // Launch this many minutes before the account's midnight instead of at
  // 09:00, so the run crosses into the next day (#384).
  minutesBeforeMidnight: number | null;
  // The window every cheat-sheet condition reads: `today` restarts at the
  // account's midnight, `lifetime` (Meta's maximum) counts since launch.
  timeWindow: string;
}

const scenario = (name: string, title: string, adsets: () => SimulatedAdSet[], options: Partial<Scenario> = {}): Scenario => ({
  name, title, adsets, spendLag: 5, eventLag: 5, confirmationMinutes: 5, hours: 10, writeFaults: [], tokenExpiresOnFirstWrite: false,
  undo: null, undoWriteFaults: [], minutesBeforeMidnight: null, timeWindow: 'today', ...options,
});

export const SCENARIOS: Record<string, Scenario> = Object.fromEntries(
  [
    scenario('nl_day', 'NL lead-gen launch, cheat sheet', netherlandsDay, { hours: 6 }),
    scenario('fast_day', 'Fast spenders, same sheet', fastDay, { hours: 3 }),
    scenario('fast_day_confirm2', 'Fast spenders, stop confirmation 2 min', fastDay, { confirmationMinutes: 2, hours: 3 }),
    scenario('late_events', 'Leads reported 15 min after the spend', lateEventsDay, { eventLag: 15, hours: 4 }),
    scenario('undo', 'NL launch, the buyer undoes the first stop', netherlandsDay, { undo: ['nl_dead_fast', 10], hours: 6 }),
    scenario('meta_429', 'Meta answers 429 to the first write', netherlandsDay, { writeFaults: ['429'], hours: 4 }),
    scenario('meta_503', 'Meta answers 503 three times', netherlandsDay, { writeFaults: ['503', '503', '503'], hours: 4 }),
    scenario('timeout_before', 'The first write times out before Meta applies it', netherlandsDay, { writeFaults: ['timeout_before'], hours: 4 }),
    scenario('timeout_after', 'The first write times out after Meta applied it', netherlandsDay, { writeFaults: ['timeout_after'], hours: 4 }),
    scenario('timeout_after_all', 'Applied, then every retry times out', netherlandsDay, { writeFaults: ['timeout_after', 'timeout_before', 'timeout_before'], hours: 4 }),
    scenario('token_expired', 'The token expires before the first write', netherlandsDay, { tokenExpiresOnFirstWrite: true, hours: 4 }),
    scenario('undo_timeout_after', 'Undo applied in Meta, every retry times out', netherlandsDay, {
      undo: ['nl_dead_fast', 10], undoWriteFaults: ['timeout_after', 'timeout_before', 'timeout_before'], hours: 4,
    }),
    scenario('midnight_today', 'Launched 22:30, sheet read with today', eveningLaunch, { minutesBeforeMidnight: 90, hours: 3 }),
    scenario('midnight_lifetime', 'Launched 22:30, sheet read with lifetime', eveningLaunch, { minutesBeforeMidnight: 90, hours: 3, timeWindow: 'lifetime' }),
  ].map((item) => [item.name, item]),
);

const EXPIRED = { code: 190, error_subcode: 463, message: 'Error validating access token: Session has expired.' };

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Meta's ad set node: GET reads the state, POST changes it.
export class FakeMeta {
  faults: string[] = [];
  tokenExpired = false;
  expireTokenOnFirstWrite = false;
  posts: Array<{ minute: number; adset: string; status: string | undefined }> = [];
  // (ad set, new status) every time Meta's state really changed.
  changes: Array<[string, string]> = [];
  minute = 0;

  constructor(readonly adsets: Map<string, SimulatedAdSet>) {}

  readonly fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? 'GET';
    const adsetId = url.pathname.replace(/\/+$/, '').split('/').at(-1) ?? '';
    const node = this.adsets.get(adsetId);
    if (!node) return jsonResponse(400, { error: { code: 100, message: 'Unsupported request' } });
    let status: string | undefined;
    if (method === 'POST') {
      if (this.expireTokenOnFirstWrite && this.posts.length === 0) this.tokenExpired = true;
      status = new URLSearchParams(String(init?.body ?? '')).get('status') ?? undefined;
      this.posts.push({ minute: this.minute, adset: adsetId, status });
    }
    if (this.tokenExpired) {
      return jsonResponse(400, { error: { ...EXPIRED, type: 'OAuthException' } });
    }
    if (method === 'GET') {
      return jsonResponse(200, {
        id: adsetId, account_id: ACCOUNT_ID.slice(4), name: node.name, status: node.status, effective_status: node.status,
        daily_budget: String(Math.trunc(node.dailyBudget * 100)),
      });
    }
    const fault = this.faults.shift() ?? '';
    if (fault === '429') return jsonResponse(429, { error: { code: 17, message: 'User request limit reached' } });
    if (fault === '503') return jsonResponse(503, { error: { code: 2, message: 'Service temporarily unavailable' } });
    const timeout = (when: string) => Object.assign(new TypeError('fetch failed'), { cause: new Error(`simulated timeout ${when} the write`) });
    if (fault === 'timeout_before') throw timeout('before');
    if ((status === 'ACTIVE' || status === 'PAUSED') && node.status !== status) {
      node.status = status;
      this.changes.push([adsetId, status]);
    }
    if (fault === 'timeout_after') throw timeout('after');
    return jsonResponse(200, { success: true });
  };
}

// Serves the simulated account; writes and state reads go over the fake fetch.
class SimulatedMetaClient extends MetaClient {
  minute = 0;
  readonly requestedPresets: string[] = [];
  private readonly adsets: Map<string, SimulatedAdSet>;

  constructor(
    adsets: SimulatedAdSet[],
    private readonly fake: FakeMeta,
    private readonly scenario: Scenario,
    readonly backoff: { seconds: number },
  ) {
    super({
      graphVersion: 'v26.0',
      baseUrl: 'http://fake-meta.invalid',
      appSecret: '',
      fetch: fake.fetch as typeof fetch,
      sleep: async (seconds) => {
        backoff.seconds += seconds;
      },
      // Jitter in the middle: the backoff is exactly 2 s, 4 s.
      random: () => 0.5,
    });
    this.adsets = new Map(adsets.map((item) => [item.adsetId, item]));
  }

  private checkToken(): void {
    if (this.fake.tokenExpired) throw classifyMetaTokenError(EXPIRED);
  }

  private row(node: SimulatedAdSet, datePreset: string): Json {
    let spend = node.spendAtMinute(this.minute - this.scenario.spendLag);
    let counts: Counts = node.countsAt(node.spendAtMinute(this.minute - this.scenario.eventLag));
    const midnight = this.scenario.minutesBeforeMidnight;
    if (datePreset === 'today' && midnight !== null && this.minute >= midnight) {
      // The account's new day: Meta's today starts again from zero, while
      // `maximum` keeps everything since launch.
      const atMidnight = node.spendAtMinute(midnight);
      const before = node.countsAt(atMidnight);
      spend = pyRound(Math.max(0, spend - atMidnight), 2);
      counts = Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Math.max(0, value - before[key as keyof Counts])])) as Counts;
    }
    return {
      adset_id: node.adsetId,
      adset_name: node.name,
      campaign_id: 'nl_campaign',
      status: node.status,
      effective_status: node.status,
      daily_budget: node.dailyBudget,
      spend,
      impressions: counts.clicks * 60 + Math.trunc(spend * 40),
      purchases: 0,
      ...counts,
    };
  }

  override async getAccountInfo(accountId: string): Promise<Json> {
    this.checkToken();
    return { id: accountId, name: 'Simulated NL', timezone_name: TIMEZONE, currency: 'USD', account_status: 1, status_label: 'Active (ACTIVE)' };
  }

  override async getAdsetsInsights(_accountId: string, _token: string, datePreset = 'today', _currency = 'UNKNOWN', _priority: Priority = 'normal'): Promise<Json[]> {
    this.checkToken();
    this.requestedPresets.push(datePreset);
    if (datePreset !== 'today' && datePreset !== 'maximum') return [];
    return [...this.adsets.values()].map((node) => this.row(node, datePreset));
  }

  override async getHierarchicalInsights(): Promise<Json[]> {
    this.checkToken();
    return [];
  }

  override async getAdsInsights(): Promise<Json[]> {
    return [];
  }

  override async getCampaignsInventory(): Promise<Json[]> {
    return [{ campaign_id: 'nl_campaign', campaign_name: 'NL leads', status: 'ACTIVE', effective_status: 'ACTIVE' }];
  }
}

// The same guard as the Python tests' (tests/test_db_helper.py): the local
// disposable database only, because the simulator drops its schema.
export function testDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const refused = 'Test database refused: use the local buyerly_test database and set TEST_DATABASE_DISPOSABLE=buyerly_test';
  const value = env.TEST_DATABASE_URL ?? '';
  let url: URL;
  try {
    url = new URL(value.replace(/^postgresql\+asyncpg:/, 'postgresql:'));
  } catch {
    throw new Error(refused);
  }
  const allowed =
    /^postgres(ql(\+asyncpg)?)?:\/\//.test(value) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
    (url.port === '' || url.port === '5432') &&
    decodeURIComponent(url.username) === 'buyerly' &&
    url.pathname === '/buyerly_test' &&
    url.search === '' &&
    env.TEST_DATABASE_DISPOSABLE === 'buyerly_test';
  if (!allowed) throw new Error(refused);
  return url.href;
}

async function seed(db: DataSource, options: { confirmationMinutes: number; repeatMinutes: number; timeWindow: string }): Promise<{ user: UserEntity; workspaceId: number }> {
  return db.transaction(async (tx) => {
    const user = await tx.getRepository(UserEntity).save(
      tx.getRepository(UserEntity).create({
        username: 'simulator', fullName: 'Simulator', role: 'admin', isApproved: true, email: null, telegramId: 'simulator',
        authToken: null, activeWorkspaceId: null, emailVerifiedAt: null, unconfirmedEmail: null, title: '',
      }),
    );
    const workspace = await tx.getRepository(WorkspaceEntity).save(
      tx.getRepository(WorkspaceEntity).create({ name: 'Simulator', slug: 'simulator', badgeText: 'S', badgeColor: '#3B82F6', ownerUserId: user.id }),
    );
    await tx.getRepository(WorkspaceMemberEntity).save({ workspaceId: workspace.id, userId: user.id, role: 'owner', joinedAt: new Date() });
    await tx.getRepository(UserEntity).update({ id: user.id }, { activeWorkspaceId: workspace.id });
    user.activeWorkspaceId = workspace.id;
    const rules = CHEAT_SHEET_RULES.map(([name, conditions], index) => ({
      preset_id: index + 1,
      workspace_id: workspace.id,
      name,
      action: 'turn_off',
      level: 'adset',
      conditions: conditions.map(([metric, operator, value]) => ({ metric, operator, value, time_window: options.timeWindow })),
      logic: 'and',
      check_interval: 5,
      cooldown_minutes: options.repeatMinutes,
      budget_change_percent: 0.0,
      budget_max_daily: 0.0,
    }));
    await tx.getRepository(AccountEntity).save(
      tx.getRepository(AccountEntity).create({
        accountId: ACCOUNT_ID, name: 'Simulated NL', accessToken: 'simulated', accessTokenEncrypted: null, metaConnectionId: null,
        ownerUserId: user.id, workspaceId: workspace.id, timezoneName: TIMEZONE, currency: 'USD', activeRules: JSON.stringify(rules),
        rulesEnabled: true, isActive: true, leadUserId: null, targetCostPerResult: null,
      }),
    );
    await tx.getRepository(AppSettingsEntity).save(
      tx.getRepository(AppSettingsEntity).create({ stopConfirmationMinutes: options.confirmationMinutes, criticalRuleIntervalMinutes: 2 }),
    );
    return { user, workspaceId: workspace.id };
  });
}

// Epoch seconds of a wall-clock hour in a time zone.
function zonedEpoch(zone: string, year: number, month: number, day: number, hour: number): number {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  const offset = (at: number): number => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(at)).map((part) => [part.type, Number(part.value)]));
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(at / 1000) * 1000;
  };
  const guess = Date.UTC(year, month - 1, day, hour);
  return (guess - offset(guess - offset(guess))) / 1000;
}

// 09:00 of the account's real current day, or late on the evening before it.
// Undo holds compare the database's own `created_at` (wall clock) with the
// account's day, so the simulated day must be the real one; a run that
// crosses midnight ends in it.
function launchTimestamp(minutesBeforeMidnight: number | null): number {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [year, month, day] = today.split('-').map(Number);
  if (minutesBeforeMidnight !== null) return zonedEpoch(TIMEZONE, year, month, day, 0) - minutesBeforeMidnight * 60;
  return zonedEpoch(TIMEZONE, year, month, day, LAUNCH_HOUR);
}

export interface Row {
  adset: string;
  adset_id: string;
  story: string;
  dollars_per_minute: number;
  sheet_stop: number | null;
  sheet_rule: string | null;
  buyerly_stop: number | null;
  buyerly_rule: string | null;
  spent: number;
  no_rules: number;
  overshoot: number | null;
  inbox_delay_minutes: number | null;
  manual: Record<number, number | null>;
  manual_spent: Record<number, number>;
  stop_success_events: number;
  stop_error_events: number;
  meta_pauses: number;
  final_status: string;
}

export interface UndoAttempt {
  ok: boolean;
  already_reverted?: boolean;
  error?: string;
  status?: number;
  posts: number;
}

export interface Summary {
  adsets: number;
  sheet_stops: number;
  buyerly_stops: number;
  matched: number;
  same_rule: number;
  missed: number;
  extra: number;
  early: number;
  double_writes: number;
  delay_median: number | null;
  delay_max: number | null;
  spent: number;
  sheet: number;
  no_rules: number;
  over_sheet: number;
  manual: Record<number, number>;
}

export interface SimulationResult {
  scenario: string;
  title: string;
  spend_lag: number;
  event_lag: number;
  confirmation_minutes: number;
  hours: number;
  time_window: string;
  rows: Row[];
  events: Record<string, number>;
  meta_posts: number;
  insight_presets: string[];
  meta_changes: number;
  backoff_seconds: number;
  account_active: boolean;
  health: string | null;
  undo: { minute?: number; attempts?: UndoAttempt[] };
  summary: Summary;
}

const silentLog = Fastify({ logger: false }).log;

export async function simulate(
  chosen: Scenario | string = 'nl_day',
  overrides: { lagMinutes?: number; confirmationMinutes?: number; hours?: number } = {},
): Promise<SimulationResult> {
  let scenarioDef = typeof chosen === 'string' ? SCENARIOS[chosen] : chosen;
  const changed: Partial<Scenario> = {};
  if (overrides.lagMinutes !== undefined) {
    changed.spendLag = overrides.lagMinutes;
    changed.eventLag = Math.max(overrides.lagMinutes, scenarioDef.eventLag);
  }
  if (overrides.confirmationMinutes !== undefined) changed.confirmationMinutes = overrides.confirmationMinutes;
  if (overrides.hours !== undefined) changed.hours = overrides.hours;
  scenarioDef = { ...scenarioDef, ...changed };

  const db = createBuyerlyDataSource(testDatabaseUrl(), { poolSize: 4 });
  await db.initialize();
  try {
    await db.query('DROP SCHEMA public CASCADE');
    await db.query('CREATE SCHEMA public');
    await db.synchronize();
    const { user } = await seed(db, { confirmationMinutes: scenarioDef.confirmationMinutes, repeatMinutes: 1440, timeWindow: scenarioDef.timeWindow });

    const launch = launchTimestamp(scenarioDef.minutesBeforeMidnight);
    let now = launch;
    const adsets = scenarioDef.adsets();
    const byId = new Map(adsets.map((item) => [item.adsetId, item]));
    const fake = new FakeMeta(byId);
    fake.faults = [...scenarioDef.writeFaults];
    fake.expireTokenOnFirstWrite = scenarioDef.tokenExpiresOnFirstWrite;
    const backoff = { seconds: 0 };
    const meta = new SimulatedMetaClient(adsets, fake, scenarioDef, backoff);

    const database = databaseOver(db);
    const sync = new AccountSync({ db: database, log: silentLog, meta, tokenEncryptionKey: TOKEN_KEY, clock: () => now });
    const rules = new RuleCycle({ db: database, log: silentLog, meta, tokenEncryptionKey: TOKEN_KEY, clock: () => now, sleep: async () => undefined });
    // What undo reaches through `app`: the database, the config, the services
    // and the Meta client the worker runs with.
    const app = {
      db: database,
      config: readConfig({ META_TOKEN_ENCRYPTION_KEY: TOKEN_KEY, LOG_LEVEL: 'silent' }),
      services: { metaFetch: fake.fetch as typeof fetch },
      log: silentLog,
    } as unknown as FastifyInstance;
    useMetaClient(app, meta);

    const stopMinute = new Map<string, number>();
    const stopCents = new Map<string, number>();
    const undoReport: SimulationResult['undo'] = {};
    const seenEvents = new Set<number>();
    const minutes = Math.trunc(scenarioDef.hours * 60);

    const doUndo = async (eventId: number, minute: number): Promise<void> => {
      let postsBefore = fake.posts.length;
      fake.faults = [...scenarioDef.undoWriteFaults];
      const attempts: UndoAttempt[] = [];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const result = await undoAuditEvent(app, user, eventId);
          attempts.push({ ok: true, already_reverted: Boolean(result.already_reverted), posts: fake.posts.length - postsBefore });
        } catch (error) {
          if (!(error instanceof RouteError)) throw error;
          attempts.push({ ok: false, error: error.message, status: error.statusCode, posts: fake.posts.length - postsBefore });
        }
        postsBefore = fake.posts.length;
        if (attempts.at(-1)!.ok && attempts.at(-1)!.already_reverted) break;
      }
      undoReport.minute = minute;
      undoReport.attempts = attempts;
    };

    let pendingUndo: [number, number] | null = null;
    for (let minute = 0; minute <= minutes; minute += 1) {
      now = launch + minute * 60;
      meta.minute = fake.minute = minute;
      if (minute) for (const item of adsets) item.advance();
      await sync.run();
      await rules.run();
      const events = await db.query<Array<{ id: number; entity_id: string | null; adset_id: string | null }>>(
        "SELECT id, entity_id, adset_id FROM audit_events WHERE event_type = 'STOP' AND status = 'SUCCESS' ORDER BY id",
      );
      for (const event of events) {
        if (seenEvents.has(event.id)) continue;
        seenEvents.add(event.id);
        const adsetId = event.entity_id || event.adset_id || '';
        if (!stopMinute.has(adsetId)) stopMinute.set(adsetId, minute);
        if (!stopCents.has(adsetId)) stopCents.set(adsetId, byId.get(adsetId)!.spentCents / 100);
        if (scenarioDef.undo && adsetId === scenarioDef.undo[0] && pendingUndo === null) pendingUndo = [event.id, minute + scenarioDef.undo[1]];
      }
      if (pendingUndo && minute === pendingUndo[1]) await doUndo(pendingUndo[0], minute);
    }

    const audit = await db.query<Array<{ id: number; event_type: string; status: string; entity_id: string | null; adset_id: string | null; rule_name: string | null }>>(
      'SELECT id, event_type, status, entity_id, adset_id, rule_name FROM audit_events ORDER BY id',
    );
    const [health] = await db.query<Array<{ status: string }>>('SELECT status FROM account_health LIMIT 1');
    const [account] = await db.query<Array<{ is_active: boolean }>>('SELECT is_active FROM accounts');

    const rows: Row[] = adsets.map((item) => {
      const [sheet, sheetRule] = item.cheatSheetStop();
      const stopped = stopCents.get(item.adsetId) ?? null;
      const sheetMinute = sheet === null ? null : (sheet * 100) / item.centsPerMinute;
      const stopEvents = audit.filter((event) => event.event_type === 'STOP' && (event.entity_id || event.adset_id) === item.adsetId);
      const manual = Object.fromEntries(MANUAL_CHECK_MINUTES.map((every) => [every, item.manualStop(every, scenarioDef.spendLag, scenarioDef.eventLag, minutes)]));
      const noRules = item.trajectory(minutes);
      return {
        adset: item.name,
        adset_id: item.adsetId,
        story: item.story,
        dollars_per_minute: item.dollarsPerMinute,
        sheet_stop: sheet,
        sheet_rule: sheetRule,
        buyerly_stop: stopped,
        buyerly_rule: stopEvents.find((event) => event.status === 'SUCCESS')?.rule_name ?? null,
        spent: item.spentCents / 100,
        no_rules: noRules,
        overshoot: sheet !== null && stopped !== null ? pyRound(stopped - sheet, 2) : null,
        inbox_delay_minutes: sheetMinute !== null && stopMinute.has(item.adsetId) ? pyRound(stopMinute.get(item.adsetId)! - sheetMinute, 1) : null,
        manual,
        manual_spent: Object.fromEntries(Object.entries(manual).map(([every, stop]) => [every, stop ?? noRules])),
        stop_success_events: stopEvents.filter((event) => event.status === 'SUCCESS').length,
        stop_error_events: stopEvents.filter((event) => event.status === 'ERROR').length,
        meta_pauses: fake.changes.filter(([changedId, status]) => changedId === item.adsetId && status === 'PAUSED').length,
        final_status: item.status,
      };
    });
    const counts: Record<string, number> = {};
    for (const event of audit) {
      const key = `${event.event_type}:${event.status}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return {
      scenario: scenarioDef.name,
      title: scenarioDef.title,
      spend_lag: scenarioDef.spendLag,
      event_lag: scenarioDef.eventLag,
      confirmation_minutes: scenarioDef.confirmationMinutes,
      hours: scenarioDef.hours,
      time_window: scenarioDef.timeWindow,
      rows,
      events: counts,
      meta_posts: fake.posts.length,
      insight_presets: [...new Set(meta.requestedPresets)].sort(),
      meta_changes: fake.changes.length,
      backoff_seconds: pyRound(backoff.seconds, 1),
      account_active: account?.is_active ?? false,
      health: health?.status ?? null,
      undo: undoReport,
      summary: summarize(rows),
    };
  } finally {
    await db.destroy();
  }
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

export function summarize(rows: Row[]): Summary {
  const delays = rows.map((row) => row.inbox_delay_minutes).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const spent = pyRound(sum(rows.map((row) => row.spent)), 2);
  const sheet = pyRound(sum(rows.map((row) => row.sheet_stop ?? row.no_rules)), 2);
  return {
    adsets: rows.length,
    sheet_stops: rows.filter((row) => row.sheet_stop !== null).length,
    buyerly_stops: rows.filter((row) => row.buyerly_stop !== null).length,
    matched: rows.filter((row) => row.sheet_stop !== null && row.buyerly_stop !== null).length,
    same_rule: rows.filter((row) => row.buyerly_rule && row.buyerly_rule === row.sheet_rule).length,
    missed: rows.filter((row) => row.sheet_stop !== null && row.buyerly_stop === null).length,
    extra: rows.filter((row) => row.sheet_stop === null && row.buyerly_stop !== null).length,
    early: rows.filter((row) => row.overshoot !== null && row.overshoot < 0).length,
    double_writes: sum(rows.map((row) => Math.max(0, row.meta_pauses - 1))),
    delay_median: delays.length ? delays[Math.floor(delays.length / 2)] : null,
    delay_max: delays.length ? delays[delays.length - 1] : null,
    spent,
    sheet,
    no_rules: pyRound(sum(rows.map((row) => row.no_rules)), 2),
    over_sheet: pyRound(spent - sheet, 2),
    manual: Object.fromEntries(MANUAL_CHECK_MINUTES.map((every) => [every, pyRound(sum(rows.map((row) => row.manual_spent[every])), 2)])),
  };
}

// Python's repr() of the JSON-like values render() prints.
function pyRepr(value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
    return `${quote}${value.replaceAll('\\', '\\\\').replaceAll(quote, `\\${quote}`).replaceAll('\n', '\\n')}${quote}`;
  }
  if (Array.isArray(value)) return `[${value.map(pyRepr).join(', ')}]`;
  return `{${Object.entries(value as Record<string, unknown>).map(([key, item]) => `${pyRepr(key)}: ${pyRepr(item)}`).join(', ')}}`;
}

// str(float)
const pyFloatText = (value: number | null): string => (value === null ? 'None' : Number.isInteger(value) ? `${value}.0` : String(value));

// format(x, ".2f") and format(x, "+.2f")
function fixed(value: number, sign = false): string {
  const negative = value < 0 || Object.is(value, -0);
  const text = Math.abs(value).toFixed(2);
  return `${negative ? '-' : sign ? '+' : ''}${text}`;
}

export function render(result: SimulationResult): string {
  const money = (value: number | null): string => (value === null ? '—' : `$${fixed(value)}`);
  const lines = [
    `### ${result.scenario}: ${result.title}`,
    `Meta lag: spend ${result.spend_lag} min, events ${result.event_lag} min; ` +
      `stop confirmation ${result.confirmation_minutes} min; ${result.hours} h; window ${result.time_window}`,
    '',
    '| Ad set | $/min | Sheet | Buyerly | Over | Inbox delay | Manual 15/30/60 | Without rules |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const row of result.rows) {
    const over = row.overshoot === null ? '—' : fixed(row.overshoot, true);
    const delay = row.inbox_delay_minutes === null ? '—' : `${row.inbox_delay_minutes.toFixed(1)} min`;
    const manual = MANUAL_CHECK_MINUTES.map((every) => money(row.manual_spent[every])).join(' / ');
    lines.push(
      `| ${row.adset} | ${fixed(row.dollars_per_minute)} | ${money(row.sheet_stop)} | ${money(row.buyerly_stop)} | ${over} | ${delay} | ${manual} | ${money(row.no_rules)} |`,
    );
  }
  const s = result.summary;
  lines.push(
    '',
    `Stops: sheet ${s.sheet_stops}, Buyerly ${s.buyerly_stops} (matched ${s.matched}, same rule ${s.same_rule}, missed ${s.missed}, ` +
      `extra ${s.extra}, early ${s.early}, double writes ${s.double_writes}). Inbox delay median ${pyFloatText(s.delay_median)} min, max ${pyFloatText(s.delay_max)} min.`,
    `Spent: Buyerly $${fixed(s.spent)}, sheet $${fixed(s.sheet)}, manual every 15/30/60 min ` +
      `${MANUAL_CHECK_MINUTES.map((every) => `$${fixed(s.manual[every])}`).join(' / ')}, without rules $${fixed(s.no_rules)}.`,
    `Meta writes ${result.meta_posts}, real changes ${result.meta_changes}, backoff ${pyFloatText(result.backoff_seconds)} s; ` +
      `account active ${pyRepr(result.account_active)}, health ${result.health ?? 'None'}.`,
    `Audit events: ${pyRepr(result.events)}`,
  );
  if (Object.keys(result.undo).length) lines.push(`Undo: ${pyRepr(result.undo)}`);
  return lines.join('\n');
}

// argparse's exit codes: 2 for a usage error, 0 after --help.
async function main(): Promise<void> {
  const usage = 'usage: rule-simulator [-h] [--scenario SCENARIO] [--lag-minutes LAG_MINUTES] [--confirmation-minutes CONFIRMATION_MINUTES] [--hours HOURS]';
  const fail = (message: string): never => {
    console.error(`${usage}\nrule-simulator: error: ${message}`);
    process.exit(2);
  };
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        scenario: { type: 'string', multiple: true },
        'lag-minutes': { type: 'string' },
        'confirmation-minutes': { type: 'string' },
        hours: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    }));
  } catch (error) {
    return fail((error as Error).message);
  }
  if (values.help) {
    console.log(`${usage}\n\nReplay simulated buyer days through the real worker, rule engine and undo.\n\n  --scenario NAME            Scenario to run (repeatable); default nl_day. One of: ${Object.keys(SCENARIOS).sort().join(', ')}, all\n  --lag-minutes N            Override how late Meta reports spend.\n  --confirmation-minutes N   Override the stop confirmation window.\n  --hours H`);
    return;
  }
  const integer = (name: string, text: string | undefined): number | undefined => {
    if (text === undefined) return undefined;
    if (!/^\s*[+-]?\d+\s*$/.test(text)) return fail(`argument --${name}: invalid int value: '${text}'`);
    return Number(text);
  };
  const lagMinutes = integer('lag-minutes', values['lag-minutes']);
  const confirmationMinutes = integer('confirmation-minutes', values['confirmation-minutes']);
  let hours: number | undefined;
  if (values.hours !== undefined) {
    hours = Number(values.hours);
    if (values.hours.trim() === '' || Number.isNaN(hours)) return fail(`argument --hours: invalid float value: '${values.hours}'`);
  }
  let names = values.scenario ?? ['nl_day'];
  for (const name of names) {
    if (name !== 'all' && !Object.hasOwn(SCENARIOS, name)) {
      return fail(`argument --scenario: invalid choice: '${name}' (choose from ${[...Object.keys(SCENARIOS).sort(), 'all'].map((item) => `'${item}'`).join(', ')})`);
    }
  }
  if (names.includes('all')) names = Object.keys(SCENARIOS);
  for (const name of names) {
    const result = await simulate(name, { lagMinutes, confirmationMinutes, hours });
    console.log(render(result));
    console.log();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
