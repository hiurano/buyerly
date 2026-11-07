import { describe, expect, it } from 'vitest';
import { check, compareMetric, evaluate, evaluateAll, formatMoney, pyFixed, ruleMetricReading } from '../../src/rules/engine.ts';
import { previewFromFacts, type PreviewFact } from '../../src/rules/preview.ts';

// The rule engine's evaluation (rules/engine.py, core/metrics.py and
// services/rule_preview.py ported) was proved to answer exactly as Python did
// on these cases in CI before Python was removed (#611): every verdict,
// reason, figure and order. Cases: every metric, operator and window; display
// rounding on exact halves; time zones around midnight and DST; missing and
// malformed data; rules that conflict, yield or cannot run; recorded cases
// (the example rules on anonymized ad sets); and a seeded generator mixing
// valid and broken values.

type Answer = { ok: unknown } | { fail: string };
interface Case { fn: string; args: unknown[] }

const asJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value) ?? 'null');

const PORT: Record<string, (...args: never[]) => unknown> = {
  check: (entity: never, account: never, insights: never, override: never) => check(entity, account, insights, override),
  evaluate: (entity: never, account: never, insights: never, override: never) => evaluate(entity, account, insights, override),
  evaluateAll: (entity: never, account: never, insights: never, override: never) => evaluateAll(entity, account, insights, override),
  preview: (account: never, rule: never, facts: PreviewFact[], now: string) => previewFromFacts(account, rule, structuredClone(facts), new Date(now)),
  ruleMetricReading: (metric: unknown, data: unknown) => ruleMetricReading(metric, data),
  compareMetric: (metric: unknown, data: unknown, operator: unknown, target: unknown) => compareMetric(ruleMetricReading(metric, data), operator, target),
  pyFixed: (value: number, digits: number) => pyFixed(value, digits),
  formatMoney: (value: number | null, currency: unknown) => formatMoney(value, currency),
};

function portAnswer({ fn, args }: Case): Answer {
  try {
    return { ok: asJson(PORT[fn](...(asJson(args) as never[]))) };
  } catch (error) {
    return { fail: (error as Error).name };
  }
}

// ---------------------------------------------------------------------------
// Building blocks.

const METRICS = ['spend', 'cpl', 'cpreg', 'cpp', 'leads', 'registrations', 'purchases', 'ctr', 'cpc', 'clicks', 'link_clicks'];
const OPERATORS = ['gt', 'gte', 'lt', 'lte', 'eq'];
const WINDOWS = ['today', 'yesterday', 'last_3d', 'last_7d', 'lifetime'];
const ACTIONS = ['turn_off', 'notify_only', 'turn_on', 'increase_budget', 'decrease_budget'];
const WORKSPACE = 7;

function rule(fields: Record<string, unknown> = {}): Record<string, unknown> {
  const action = (fields.action as string | undefined) ?? 'turn_off';
  const budget = action === 'increase_budget' ? { budget_change_percent: 10, budget_max_daily: 100 } : action === 'decrease_budget' ? { budget_change_percent: 15, budget_max_daily: 0 } : { budget_change_percent: 0, budget_max_daily: 0 };
  return {
    preset_id: 1, workspace_id: WORKSPACE, name: 'Rule', action, level: 'adset', enabled: true,
    conditions: [{ metric: 'spend', operator: 'gte', value: 5, time_window: 'today' }],
    logic: 'and', cooldown_minutes: 0, check_interval: 5, currency_mode: 'account', scope: { level: 'account', ids: [] },
    ...budget, ...fields,
  };
}

function figures(fields: Record<string, number> = {}): Record<string, number> {
  return { spend: 0, impressions: 0, clicks: 0, link_clicks: 0, leads: 0, registrations: 0, purchases: 0, ...fields };
}

const entity = (fields: Record<string, unknown> = {}): Record<string, unknown> => ({
  entity_level: 'adset', entity_id: '100', entity_name: 'Ad set', campaign_id: '10', status: 'ACTIVE', effective_status: 'ACTIVE',
  ...figures({ spend: 12.34, impressions: 1000, clicks: 37, link_clicks: 21, leads: 3, registrations: 1, purchases: 0 }), ...fields,
});

const account = (fields: Record<string, unknown> = {}) => ({ rules_enabled: true, workspace_id: WORKSPACE, currency: 'USD', ...fields });

const engineCases = (args: unknown[]): Case[] => ['check', 'evaluate', 'evaluateAll'].map((fn) => ({ fn, args }));

// A deterministic generator (mulberry32), so a failure reproduces.
function generator(seed: number) {
  let state = seed;
  const next = (): number => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
  return { next, pick, int: (max: number) => Math.floor(next() * max) };
}

// ---------------------------------------------------------------------------
// Cases.

function metricCases(): Case[] {
  const cases: Case[] = [];
  const datas = [
    figures({ spend: 12.34, impressions: 1000, clicks: 37, link_clicks: 21, leads: 3, registrations: 1, purchases: 2 }),
    figures(),
    figures({ spend: 0.1 + 0.2, impressions: 3, clicks: 1, leads: 1 }),
    { spend: '7.5', leads: '2', clicks: 'x', impressions: null, registrations: true, purchases: 2.9 },
    { spend: [], leads: {} },
    {},
  ];
  for (const metric of [...METRICS, 'legacy_cpa', 'cpa', 'CPL ', 'unknown', '', null, 3]) {
    for (const data of datas) {
      cases.push({ fn: 'ruleMetricReading', args: [metric, data] });
      for (const operator of [...OPERATORS, 'between']) {
        for (const target of [0, 0.3, 1, 3, 4.113333333333333, 12.34, 37, '12.34']) cases.push({ fn: 'compareMetric', args: [metric, data, operator, target] });
      }
    }
  }
  return cases;
}

function formattingCases(): Case[] {
  // No -0: JSON carries it as 0 (pyFixed prints a real -0.0 as Python does, "-0.00").
  const values = [0, 0.125, 0.375, 2.675, 1.005, 2.5, 3.5, -2.5, 0.5, 1.5, 0.045, 1234.565, 1e-7, 123456789.125, 1e21, 1e22, -0.001, 0.1 + 0.2, 99.995, 4.35, 8.325, 1 / 3, 2 / 3];
  const cases: Case[] = [];
  for (const value of values) {
    for (const digits of [0, 1, 2]) cases.push({ fn: 'pyFixed', args: [value, digits] });
    for (const currency of ['USD', 'usd', ' eur ', 'JPY', 'KRW', 'VND', 'US', 'DOLLAR', null, '', 'UNKNOWN', 5]) cases.push({ fn: 'formatMoney', args: [value, currency] });
  }
  cases.push({ fn: 'formatMoney', args: [null, 'USD'] });
  return cases;
}

// Every metric × operator × window on one entity, matched and not.
function conditionCases(): Case[] {
  const cases: Case[] = [];
  const insights = {
    yesterday: figures({ spend: 20, impressions: 2000, clicks: 40, link_clicks: 30, leads: 2, registrations: 0, purchases: 1 }),
    last_3d: figures({ spend: 55.55, impressions: 0, clicks: 0, leads: 0 }),
    last_7d: figures({ spend: 101.005, impressions: 9000, clicks: 99, link_clicks: 70, leads: 9, registrations: 3, purchases: 3 }),
    lifetime: figures({ spend: 300.125, impressions: 40000, clicks: 400, link_clicks: 300, leads: 30, registrations: 6, purchases: 4 }),
  };
  for (const metric of METRICS) {
    for (const operator of OPERATORS) {
      for (const timeWindow of WINDOWS) {
        for (const value of [0, 1, 3, 4.113333333333333, 12.34, 50]) {
          const conditions = [{ metric, operator, value, time_window: timeWindow }];
          cases.push(...engineCases([entity(), account(), insights, [rule({ conditions })]]));
        }
        // Without the window's read: a lifetime rule waits, others fall back to today.
        cases.push({ fn: 'check', args: [entity(), account(), null, [rule({ conditions: [{ metric, operator, value: 1, time_window: timeWindow }] })]] });
        cases.push({ fn: 'check', args: [entity(), account(), { yesterday: insights.yesterday }, [rule({ conditions: [{ metric, operator, value: 1, time_window: timeWindow }] })]] });
      }
    }
  }
  // AND / OR, and every action on every delivery state.
  const pair = [{ metric: 'spend', operator: 'gte', value: 10, time_window: 'today' }, { metric: 'leads', operator: 'eq', value: 0, time_window: 'today' }];
  for (const logic of ['and', 'or']) {
    for (const action of ACTIONS) {
      for (const [status, effective] of [['ACTIVE', 'ACTIVE'], ['PAUSED', 'PAUSED'], ['ACTIVE', 'CAMPAIGN_PAUSED'], ['PAUSED', 'ACTIVE'], ['UNKNOWN', 'UNKNOWN']]) {
        cases.push(...engineCases([entity({ status, effective_status: effective }), account(), {}, [rule({ action, logic, conditions: pair })]]));
      }
    }
  }
  return cases;
}

function ruleSetCases(): Case[] {
  const cases: Case[] = [];
  const stop = rule({ preset_id: 1, name: 'Stop' });
  const notify = rule({ preset_id: 2, name: 'Tell', action: 'notify_only' });
  const raise = rule({ preset_id: 3, name: 'Raise', action: 'increase_budget', conditions: [{ metric: 'spend', operator: 'gt', value: 1, time_window: 'today' }] });
  const cut = rule({ preset_id: 4, name: 'Cut', action: 'decrease_budget', conditions: [{ metric: 'cpl', operator: 'lt', value: 100, time_window: 'today' }] });
  const start = rule({ preset_id: 5, name: 'Start', action: 'turn_on' });
  const sets: unknown[][] = [
    [stop], [notify, stop], [raise, cut, notify], [raise, rule({ ...raise, preset_id: 6, name: 'Raise 2' })], [cut, raise, stop, notify],
    [stop, start], [stop, { ...start, scope: { level: 'campaign', ids: ['11'] } }],
    [{ ...stop, enabled: false }], [{ ...stop, needs_review: true }], [{ ...stop, level: 'campaign' }], [{ ...stop, level: 'bogus' }],
    [{ ...stop, workspace_id: 8 }], [{ ...stop, workspace_id: 7.0 }], [{ ...stop, action: 'pause' }], [{ ...stop, conditions: [] }],
    [{ ...stop, scope: { level: 'campaign', ids: ['10'] } }], [{ ...stop, scope: { level: 'campaign', ids: ['99'] } }],
    [{ ...stop, scope: { level: 'adset', ids: ['100'] } }], [{ ...stop, scope: { level: 'adset', ids: [] } }], [{ ...stop, scope: 'all' }],
    [{ ...stop, cooldown_minutes: '30' }], [{ ...stop, cooldown_minutes: 30.5 }], [{ ...stop, name: null }], [{ ...stop, name: 42 }],
    [{ ...stop, conditions: [{ metric: 'spend', operator: 'gte', value: null }] }],
    [{ ...stop, conditions: [{ metric: 'spend', operator: 'gte', value: 'abc' }] }, start],
    [{ ...stop, conditions: [{ metric: 'spend', operator: 'gte', value: null }] }, start],
    [{ ...stop, conditions: ['spend'] }, start], [{ ...stop, logic: undefined, condition_logic: 'or' }], [{ ...stop, logic: 'xor' }],
    [stop, 'not a rule'], [], [{}],
  ];
  const entities = [
    entity(), entity({ entity_level: 'campaign', entity_id: '10', campaign_id: '' }), entity({ entity_level: 'ad', entity_id: '1000', adset_id: '100' }),
    entity({ entity_id: '', adset_id: '100', entity_name: '', adset_name: 'Legacy' }), entity({ campaign_id: null }), entity({ status: 'PAUSED', effective_status: 'PAUSED' }),
    entity({ spend: '9.99', leads: '0' }), entity({ spend: null }), entity({ leads: '1.5' }), entity({ leads: 2.7 }),
  ];
  for (const set of sets) for (const item of entities) cases.push(...engineCases([item, account(), {}, set]));
  // The account itself: automation off, rules stored as text, another workspace.
  const accounts = [
    account({ rules_enabled: false }), account({ rules_enabled: 0 }), account({ rules_enabled: 'yes' }), account({ workspace_id: null }), {},
    account({ active_rules: JSON.stringify([stop, notify]) }), account({ active_rules: '{oops' }), account({ active_rules: '{"a": 1}' }),
    account({ active_rules: [] }), account({ active_rules: null }), account({ currency: 'jpy' }), account({ currency: null }), account({ workspace_id: 8 }),
  ];
  for (const item of accounts) {
    cases.push(...engineCases([entity(), item, {}, null]));
    cases.push(...engineCases([entity(), item, {}, [stop]]));
  }
  return cases;
}

// ---- Preview: facts → listing.

const NOW = '2026-03-08T07:30:00+00:00'; // US daylight saving starts that day.

function fact(entityId: string, date: string, fields: Partial<PreviewFact> = {}): PreviewFact {
  return {
    entity_id: entityId, entity_name: `Ad set ${entityId}`, date, status: 'ACTIVE', effective_status: 'ACTIVE', fetched_at: '2026-03-08T06:00:00+00:00',
    spend: 0, impressions: 0, reach: 0, clicks: 0, link_clicks: 0, outbound_clicks: 0, landing_page_views: 0, leads: 0, registrations: 0, purchases: 0,
    ...fields,
  };
}

const previewAccount = (fields: Record<string, unknown> = {}) => ({
  account_id: 'act_1', name: 'Account', workspace_id: WORKSPACE, currency: 'USD', timezone_name: 'America/Los_Angeles', rules_enabled: false, ...fields,
});

const DAYS = ['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09'];

function previewFacts(): PreviewFact[] {
  const facts: PreviewFact[] = [];
  // Spends that sum with float drift or sit on half cents.
  const spends = [0.1, 0.2, 1.005, 2.675, 0.125, 3.3, 1.115, 0, 4.445, 7, 0.015];
  DAYS.forEach((date, index) => {
    facts.push(fact('1', date, { spend: spends[index], impressions: 100 * index, clicks: index, link_clicks: index % 3, leads: index % 2, registrations: index % 4 === 0 ? 1 : 0 }));
    facts.push(fact('2', date, { spend: 1.25, impressions: 50, clicks: 1, entity_name: 'Ωμέγα ΣΑΣ', fetched_at: `2026-03-08T06:00:0${index % 10}.12345${index % 10}+00:00` }));
  });
  facts.push(fact('3', '2026-03-07', { spend: 12, status: 'deleted' }));
  facts.push(fact('4', '2026-03-08', { spend: 12, status: 'PAUSED', effective_status: 'PAUSED', entity_name: null }));
  facts.push(fact('5', '2026-03-08', { spend: 12, status: null, effective_status: null, entity_name: 'straße' }));
  facts.push(fact('6', '2026-03-08', { spend: 12, entity_name: 'STRASSE' }));
  facts.push(fact('7', '2026-03-08', { spend: 12, status: 'active', effective_status: 'campaign_paused', entity_name: 'İstanbul' }));
  facts.push(fact('8', '2026-01-01', { spend: 50, leads: 0, fetched_at: '2026-03-09T00:00:00+00:00' }));
  facts.push(fact('9', '2026-03-08', { spend: 12, entity_name: '😀 emoji', fetched_at: null }));
  facts.push(fact('10', '2026-03-08', { spend: 12, entity_name: '￿ high' }));
  return facts;
}

function previewCases(): Case[] {
  const cases: Case[] = [];
  const facts = previewFacts();
  const zones = ['America/Los_Angeles', 'US/Pacific', 'Asia/Kolkata', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC', 'Etc/GMT+12', 'Mars/Base', '', null, ' Europe/Kyiv ', 'Europe/Kiev', 'asia/kolkata', 'EST5EDT', 'Asia/Calcutta', 'GMT+5', 'Etc/GMT-14'];
  const rules = [
    rule(), rule({ conditions: [{ metric: 'spend', operator: 'gte', value: 1, time_window: 'last_3d' }, { metric: 'ctr', operator: 'gt', value: 0.5, time_window: 'last_7d' }] }),
    rule({ logic: 'or', conditions: [{ metric: 'cpl', operator: 'gte', value: 2, time_window: 'yesterday' }, { metric: 'cpc', operator: 'lte', value: 1.2, time_window: 'today' }] }),
    rule({ conditions: [{ metric: 'spend', operator: 'gte', value: 3, time_window: 'lifetime' }, { metric: 'link_clicks', operator: 'eq', value: 0, time_window: 'lifetime' }] }),
    rule({ action: 'turn_on', name: 'Wake', conditions: [{ metric: 'spend', operator: 'lt', value: 100, time_window: 'today' }] }),
    rule({ level: 'campaign' }), rule({ level: 'bogus' }), rule({ workspace_id: 8 }), rule({ enabled: false, name: '' }),
  ];
  for (const zone of zones) {
    for (const item of rules) cases.push({ fn: 'preview', args: [previewAccount({ timezone_name: zone }), item, facts, NOW] });
  }
  // Around the account's midnight, and with nothing stored.
  for (const now of ['2026-03-08T07:59:59.999+00:00', '2026-03-08T08:00:00+00:00', '2026-03-09T10:30:00+00:00', '2026-11-01T09:30:00+00:00']) {
    cases.push({ fn: 'preview', args: [previewAccount(), rules[3], facts, now] }, { fn: 'preview', args: [previewAccount(), rules[0], facts, now] });
  }
  cases.push({ fn: 'preview', args: [previewAccount({ name: null, currency: 'jpy', rules_enabled: true }), rules[3], [], NOW] });
  // More entities than the listing shows.
  const many = Array.from({ length: 70 }, (_, index) => fact(String(100 + index), '2026-03-07', { spend: (index * 7) % 13 + 0.5, entity_name: `N${index % 9}` }));
  cases.push({ fn: 'preview', args: [previewAccount(), rule({ conditions: [{ metric: 'spend', operator: 'gte', value: 6, time_window: 'yesterday' }] }), many, NOW] });
  return cases;
}

// Recorded cases: the example rules every workspace gets
// (graphql/areas/rules/examples.ts), as the rule window stores them, on
// anonymized ad sets shaped like a launch (a week of spend, clicks and leads
// growing at different speeds, one stopped, one just started).
function recordedCases(): Case[] {
  const examples: [string, [string, string, number][]][] = [
    ['$3 and no click', [['spend', 'gte', 3], ['link_clicks', 'eq', 0]]],
    ['$3.50 and one click', [['spend', 'gte', 3.5], ['link_clicks', 'lte', 1]]],
    ['$4 and no lead', [['spend', 'gte', 4], ['leads', 'eq', 0]]],
    ['$7 and no registration', [['spend', 'gte', 7], ['registrations', 'eq', 0], ['leads', 'lte', 1]]],
    ['$12 ceiling', [['spend', 'gte', 12]]],
  ];
  const { next, int } = generator(611);
  const facts: PreviewFact[] = [];
  for (let adset = 0; adset < 24; adset += 1) {
    const start = int(6);
    const rate = 0.4 + next() * 3;
    for (let day = start; day < 9; day += 1) {
      const spend = Math.round(rate * (0.5 + next()) * 100) / 100;
      const impressions = Math.round(spend * (80 + int(400)));
      const clicks = Math.round(impressions * next() * 0.03);
      facts.push(fact(`2385${String(adset).padStart(4, '0')}`, DAYS[day + 1], {
        entity_name: `NL | Broad | ${adset % 5 === 0 ? 'Video' : 'Static'} ${adset}`,
        spend, impressions, reach: Math.round(impressions * 0.8), clicks, link_clicks: Math.round(clicks * 0.6), outbound_clicks: Math.round(clicks * 0.5),
        landing_page_views: Math.round(clicks * 0.4), leads: next() < 0.25 ? 1 + int(2) : 0, registrations: next() < 0.1 ? 1 : 0,
        status: adset === 3 ? 'PAUSED' : 'ACTIVE', effective_status: adset === 3 ? 'PAUSED' : adset === 7 ? 'CAMPAIGN_PAUSED' : 'ACTIVE',
        fetched_at: `2026-03-08T07:${String(int(30)).padStart(2, '0')}:00+00:00`,
      }));
    }
  }
  const cases: Case[] = [];
  for (const [name, conditions] of examples) {
    for (const timeWindow of ['lifetime', 'today', 'last_7d']) {
      const stored = rule({ name, conditions: conditions.map(([metric, operator, value]) => ({ metric, operator, value, time_window: timeWindow })) });
      cases.push({ fn: 'preview', args: [previewAccount(), stored, facts, NOW] });
    }
  }
  return cases;
}

// Random mixes of valid and broken entities, insights and rules.
function fuzzCases(count: number): Case[] {
  const { next, pick, int } = generator(54);
  const anyValue = () => pick<unknown>([null, true, false, 0, -1, 0.5, 2.5, 1e9, '5', ' 7.25 ', 'abc', '1_000', [], {}, [1], { a: 1 }]);
  const num = () => (next() < 0.85 ? pick([0, 1, 2, 3, 5, 7.5, 10, 12.34, 0.1, 100, 1.005, 4.5]) : anyValue());
  const cases: Case[] = [];
  for (let index = 0; index < count; index += 1) {
    const conditions = Array.from({ length: 1 + int(3) }, () => {
      const condition: Record<string, unknown> = {
        metric: next() < 0.9 ? pick(METRICS) : pick(['legacy_cpa', 'cpa', 'bogus', null, 5]),
        operator: next() < 0.9 ? pick(OPERATORS) : pick(['between', null, 'GT']),
        value: next() < 0.9 ? pick([0, 1, 2, 3, 5, 10, 0.5, 2.5, 12.34]) : anyValue(),
        time_window: next() < 0.9 ? pick(WINDOWS) : pick(['last_30d', null, 3]),
      };
      if (next() < 0.05) delete condition[pick(['metric', 'operator', 'value', 'time_window'])];
      return next() < 0.02 ? anyValue() : condition;
    });
    const rules = Array.from({ length: 1 + int(3) }, (_, position) => {
      const item = rule({
        preset_id: position + 1, name: pick(['A', 'B', '', null, 'Ünïcode']), action: next() < 0.9 ? pick(ACTIONS) : pick(['pause', null]),
        level: next() < 0.9 ? pick(['adset', 'campaign', 'ad', null]) : 'x', logic: pick(['and', 'or', 'and', 'xor']),
        conditions: next() < 0.95 ? conditions : anyValue(), enabled: next() < 0.9 ? true : anyValue(), needs_review: next() < 0.95 ? false : anyValue(),
        scope: next() < 0.8 ? { level: 'account', ids: [] } : pick<unknown>([{ level: 'campaign', ids: ['10'] }, { level: 'adset', ids: ['100', 100] }, null, 'x', { level: 'ad', ids: ['1'] }]),
        cooldown_minutes: next() < 0.9 ? pick([0, 30, 60]) : anyValue(),
        workspace_id: next() < 0.95 ? WORKSPACE : pick([8, null, '7', true]),
      });
      if (next() < 0.1) {
        item.budget_change_percent = num();
        item.budget_max_daily = num();
      }
      return next() < 0.02 ? anyValue() : item;
    });
    const figuresOf = () => {
      const data: Record<string, unknown> = {};
      for (const key of ['spend', 'impressions', 'clicks', 'link_clicks', 'leads', 'registrations', 'purchases']) if (next() < 0.9) data[key] = num();
      return data;
    };
    const insights: Record<string, unknown> = {};
    for (const window of WINDOWS.slice(1)) if (next() < 0.7) insights[window] = next() < 0.97 ? figuresOf() : anyValue();
    const item = {
      ...figuresOf(), entity_level: pick(['adset', 'campaign', 'ad', null]), entity_id: pick(['100', '10', '', null]), adset_id: pick(['100', undefined]),
      campaign_id: pick(['10', '', null]), entity_name: pick(['Name', '', null]),
      status: pick(['ACTIVE', 'PAUSED', 'ACTIVE', 'DELETED', null]), effective_status: pick(['ACTIVE', 'PAUSED', 'ADSET_PAUSED', undefined]),
    };
    cases.push(...engineCases([item, account({ currency: pick(['USD', 'JPY', 'eur', null]) }), next() < 0.9 ? insights : pick([null, {}]), rules]));
  }
  return cases;
}

describe('rule engine', () => {
  const cases = [...metricCases(), ...formattingCases(), ...conditionCases(), ...ruleSetCases(), ...previewCases(), ...recordedCases(), ...fuzzCases(4000)];

  it('covers matches, misses, waits and failures', () => {
    const outcomes = new Set<string>();
    for (const item of cases) {
      const answer = portAnswer(item);
      if ('fail' in answer) outcomes.add('fail');
      else if (item.fn === 'check') for (const found of answer.ok as { outcome: string; detail: string }[]) outcomes.add(found.detail.includes('no data') ? 'no data' : found.outcome);
    }
    expect([...outcomes].sort()).toEqual(['fail', 'inactive', 'matched', 'no data', 'not_met']);
  });
});
