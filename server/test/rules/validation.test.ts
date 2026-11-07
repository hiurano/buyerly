import { describe, expect, it } from 'vitest';
import {
  RuleValueError,
  normalizeRuleConditions,
  normalizeRuleLevel,
  normalizeRuleScope,
  normalizeRuntimeRule,
  validatePublicRuleConditions,
  validateRuleSetCompatibility,
  validateRuntimeRule,
} from '../../src/rules/validation.ts';

// The rule checks ported from core/metrics.py (proved equal to Python's on
// these cases in CI before Python was removed, #611). Cases: the example
// rules, hand-written edges, and a seeded generator that mixes valid and
// broken values.

type Answer = { ok: unknown } | { error: string } | { crash: string };
interface Case { fn: string; args: unknown[] }

const PORT: Record<string, (...args: never[]) => unknown> = {
  normalizeRuleConditions: (conditions: unknown) => {
    const result = normalizeRuleConditions(conditions);
    return [result.conditions, result.changed, result.hasLegacyCpa];
  },
  normalizeRuntimeRule: (rule: Record<string, unknown>) => {
    const result = normalizeRuntimeRule(rule);
    return [result.rule, result.changed, result.hasLegacyCpa];
  },
  validatePublicRuleConditions: (conditions: unknown[]) => validatePublicRuleConditions(conditions),
  validateRuntimeRule: (rule: unknown) => validateRuntimeRule(rule),
  validateRuleSetCompatibility: (rules: unknown[]) => validateRuleSetCompatibility(rules),
  normalizeRuleScope: (scope: unknown) => normalizeRuleScope(scope),
  normalizeRuleLevel: (level: unknown) => normalizeRuleLevel(level),
};

function portAnswer({ fn, args }: Case): Answer {
  try {
    return { ok: PORT[fn](...(args as never[])) ?? null };
  } catch (error) {
    if (error instanceof RuleValueError) return { error: error.message };
    return { crash: (error as Error).name };
  }
}

// A small seeded generator (mulberry32), so a failure reproduces.
function generator(seed: number) {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
  return { next, pick };
}

const METRICS = ['spend', 'cpl', 'cpreg', 'cpp', 'leads', 'registrations', 'purchases', 'ctr', 'cpc', 'clicks', 'link_clicks', 'cpa', 'cpr', ' CPL ', 'roas', '', null, 7];
const OPERATORS = ['gt', 'gte', 'lt', 'lte', 'eq', 'ne', '', null];
const WINDOWS = ['today', 'yesterday', 'last_3d', 'last_7d', 'lifetime', 'last_30d', null];
const VALUES = [0, 1, 2, 3, 3.5, 4, 5, 12, 0.1, 0.30000000000000004, 1e9, 1e9 + 1, -1, '5', ' 7 ', '1_000', '1e3', 'inf', '-inf', 'nan', 'abc', '', null, true, false, [], {}];
const ACTIONS = ['turn_off', 'turn_on', 'notify_only', 'increase_budget', 'decrease_budget', 'pause', null];
const LEVELS = ['campaign', 'adset', 'ad', 'account', null, undefined];
const LOGICS = ['and', 'or', 'xor', null, undefined];
const NUMBERS = [0, 1, 5, 60, 1440, 1441, 10080, 10081, -1, 2.5, '30', 'x', null, 'inf', true, 100, 100.5, 1e7, 1e7 + 1, 50];

function condition(random: ReturnType<typeof generator>): unknown {
  if (random.next() < 0.03) return random.pick(['spend', 3, null, []]);
  const result: Record<string, unknown> = {};
  if (random.next() < 0.95) result.metric = random.pick(METRICS);
  if (random.next() < 0.95) result.operator = random.pick(OPERATORS);
  if (random.next() < 0.95) result.value = random.pick(VALUES);
  if (random.next() < 0.8) result.time_window = random.pick(WINDOWS);
  if (random.next() < 0.05) result.migration_note = 'replace_with_cpl_cpreg_or_cpp';
  return result;
}

// Conditions that are valid, so the semantic checks below the public ones run.
function validCondition(random: ReturnType<typeof generator>): Record<string, unknown> {
  return {
    metric: random.pick(['spend', 'cpl', 'leads', 'link_clicks', 'ctr']),
    operator: random.pick(['gt', 'gte', 'lt', 'lte', 'eq']),
    value: random.pick([0, 1, 2, 3, 3.5, 5, 12]),
    time_window: random.pick(['today', 'lifetime']),
  };
}

function scope(random: ReturnType<typeof generator>): unknown {
  const roll = random.next();
  if (roll < 0.15) return undefined;
  if (roll < 0.2) return random.pick([null, 'account', [], 3]);
  const result: Record<string, unknown> = {};
  if (random.next() < 0.9) result.level = random.pick(['account', 'campaign', 'adset', 'ad', null]);
  if (random.next() < 0.9) {
    result.ids = random.next() < 0.1
      ? random.pick(['123', null, {}])
      : Array.from({ length: Math.floor(random.next() * 4) }, () => random.pick(['1', '2', ' 3 ', 4, '', true, 1.5, 'x'.repeat(65), '2']));
  }
  return result;
}

function rule(random: ReturnType<typeof generator>, valid: boolean): Record<string, unknown> {
  const count = random.pick([0, 1, 1, 2, 2, 3, 4, 21]);
  const result: Record<string, unknown> = {
    name: random.pick(['A', 'B', '', null, 'Stop at $5']),
    action: random.pick(ACTIONS),
    conditions: random.next() < 0.03 ? random.pick([null, 'x', {}]) : Array.from({ length: count }, () => (valid ? validCondition(random) : condition(random))),
  };
  const level = random.pick(LEVELS);
  if (level !== undefined) result.level = level;
  const logic = random.pick(LOGICS);
  if (logic !== undefined) result[random.next() < 0.8 ? 'logic' : 'condition_logic'] = logic;
  for (const key of ['cooldown_minutes', 'check_interval', 'check_interval_minutes', 'budget_change_percent', 'budget_max_daily']) {
    if (random.next() < 0.5) result[key] = random.next() < 0.6 ? random.pick([0, 5, 1440]) : random.pick(NUMBERS);
  }
  if (key(random, 0.3)) result.enabled = random.pick([true, false, null]);
  if (key(random, 0.1)) result.needs_review = random.pick([true, false]);
  const ruleScope = scope(random);
  if (ruleScope !== undefined) result.scope = ruleScope;
  return result;
}

function key(random: ReturnType<typeof generator>, chance: number): boolean {
  return random.next() < chance;
}

const EXAMPLES = [
  [['spend', 'gte', 3], ['link_clicks', 'eq', 0]],
  [['spend', 'gte', 3.5], ['link_clicks', 'lte', 1]],
  [['spend', 'gte', 4], ['leads', 'eq', 0]],
  [['spend', 'gte', 7], ['registrations', 'eq', 0], ['leads', 'lte', 1]],
  [['spend', 'gte', 12]],
].map((conditions) => ({
  action: 'turn_off',
  level: 'adset',
  conditions: conditions.map(([metric, operator, value]) => ({ metric, operator, value, time_window: 'lifetime' })),
  logic: 'and',
  cooldown_minutes: 1440,
  check_interval: 5,
  budget_change_percent: 0,
  budget_max_daily: 0,
}));

const HAND_WRITTEN: Case[] = [
  ...EXAMPLES.map((example) => ({ fn: 'validateRuntimeRule', args: [example] })),
  { fn: 'validateRuntimeRule', args: [{ action: 'turn_off', logic: 'and', conditions: [{ metric: 'spend', operator: 'gte', value: 5 }, { metric: 'spend', operator: 'lt', value: 5 }] }] },
  { fn: 'validateRuntimeRule', args: [{ action: 'turn_off', logic: 'or', conditions: [{ metric: 'cpl', operator: 'gte', value: 5 }, { metric: 'cpl', operator: 'lt', value: 5 }] }] },
  { fn: 'validateRuntimeRule', args: [{ action: 'turn_off', logic: 'and', conditions: [{ metric: 'spend', operator: 'gt', value: 5 }, { metric: 'spend', operator: 'lte', value: 5 }] }] },
  { fn: 'validateRuntimeRule', args: [{ action: 'turn_off', logic: 'and', conditions: [{ metric: 'spend', operator: 'eq', value: 5 }, { metric: 'spend', operator: 'eq', value: 5.0 }] }] },
  { fn: 'validateRuntimeRule', args: [{ action: 'turn_off', logic: 'and', conditions: [{ metric: 'leads', operator: 'gte', value: 1.5 }] }] },
  { fn: 'validateRuntimeRule', args: [{ action: 'increase_budget', logic: 'and', budget_change_percent: 20, conditions: [{ metric: 'cpl', operator: 'lt', value: 4 }] }] },
  { fn: 'validateRuntimeRule', args: [{ action: 'increase_budget', level: 'campaign', logic: 'and', budget_change_percent: 20, budget_max_daily: 50, conditions: [{ metric: 'cpl', operator: 'lt', value: 4 }] }] },
  { fn: 'validateRuntimeRule', args: [{ action: 'decrease_budget', logic: 'and', budget_change_percent: 100, conditions: [{ metric: 'cpl', operator: 'gt', value: 4 }] }] },
  { fn: 'validateRuntimeRule', args: [{ action: 'turn_off', logic: 'and', budget_max_daily: 5, conditions: [{ metric: 'cpl', operator: 'gt', value: 4 }] }] },
  { fn: 'validateRuleSetCompatibility', args: [[
    { name: 'Off', action: 'turn_off', logic: 'and', conditions: [{ metric: 'spend', operator: 'gte', value: 5, time_window: 'today' }] },
    { name: 'On', action: 'turn_on', logic: 'and', conditions: [{ metric: 'spend', operator: 'gte', value: 5.0, time_window: 'today' }] },
  ]] },
  { fn: 'validateRuleSetCompatibility', args: [[
    { name: 'Off', action: 'turn_off', logic: 'and', conditions: [{ metric: 'spend', operator: 'gte', value: 5 }], scope: { level: 'campaign', ids: ['1'] } },
    { name: 'On', action: 'turn_on', logic: 'and', conditions: [{ metric: 'spend', operator: 'gte', value: 5 }], scope: { level: 'campaign', ids: ['2'] } },
  ]] },
  { fn: 'validateRuleSetCompatibility', args: [[
    { name: '', action: 'increase_budget', condition_logic: 'or', conditions: [{ metric: 'cpa', operator: 'lt', value: 2 }, { metric: 'ctr', operator: 'gt', value: 1 }] },
    { action: 'decrease_budget', logic: 'or', conditions: [{ metric: 'ctr', operator: 'gt', value: 1 }, { metric: 'cpa', operator: 'lt', value: 2 }], scope: { level: 'adset', ids: ['9'] } },
  ]] },
  { fn: 'normalizeRuntimeRule', args: [{ name: 'Old', enabled: true, conditions: [{ metric: 'CPA', operator: 'gt', value: 3 }, 'junk', { metric: 'cpr', value: 1 }] }] },
  { fn: 'normalizeRuleConditions', args: [null] },
  { fn: 'normalizeRuleConditions', args: [[]] },
  { fn: 'normalizeRuleConditions', args: ['x'] },
  { fn: 'normalizeRuleConditions', args: [{}] },
  { fn: 'normalizeRuleScope', args: [{ level: 'campaign', ids: ['1', ' 1 ', 2, '2'] }] },
  { fn: 'normalizeRuleScope', args: [{ level: 'adset', ids: Array.from({ length: 201 }, (_, index) => String(index)) }] },
  { fn: 'normalizeRuleLevel', args: [null] },
  { fn: 'normalizeRuleLevel', args: ['account'] },
  { fn: 'normalizeRuleLevel', args: [true] },
];

function generated(count: number, seed: number): Case[] {
  const random = generator(seed);
  const cases: Case[] = [];
  for (let index = 0; index < count; index += 1) {
    const valid = random.next() < 0.4;
    switch (index % 7) {
      case 0: cases.push({ fn: 'validateRuntimeRule', args: [rule(random, valid)] }); break;
      case 1: cases.push({ fn: 'validatePublicRuleConditions', args: [Array.from({ length: 1 + Math.floor(random.next() * 3) }, () => {
        const item = condition(random);
        return typeof item === 'object' && item !== null && !Array.isArray(item) ? item : {};
      })] }); break;
      case 2: cases.push({ fn: 'normalizeRuntimeRule', args: [rule(random, valid)] }); break;
      case 3: cases.push({ fn: 'normalizeRuleConditions', args: [rule(random, false).conditions] }); break;
      case 4: cases.push({ fn: 'normalizeRuleScope', args: [scope(random) ?? null] }); break;
      case 5: cases.push({ fn: 'normalizeRuleLevel', args: [random.pick(LEVELS) ?? null] }); break;
      default: {
        // Pairs and triples built to collide: opposite actions on shared conditions.
        const base = Array.from({ length: 1 + Math.floor(random.next() * 2) }, () => validCondition(random));
        const rules = Array.from({ length: 2 + Math.floor(random.next() * 2) }, () => {
          const item = rule(random, true);
          if (random.next() < 0.7) item.conditions = random.next() < 0.5 ? [...base].reverse() : base;
          if (random.next() < 0.7) item.logic = 'and';
          return item;
        });
        cases.push({ fn: 'validateRuleSetCompatibility', args: [rules] });
      }
    }
  }
  return cases;
}

describe('rule checks', () => {
  const cases = [...HAND_WRITTEN, ...generated(14_000, 611)];
  it('reaches both outcomes in earnest', () => {
    let errors = 0;
    for (const item of cases) if ('error' in portAnswer(item)) errors += 1;
    expect(errors).toBeGreaterThan(cases.length / 5);
    expect(errors).toBeLessThan(cases.length * 0.9);
  });

  it('accepts the example rules and refuses a contradiction', () => {
    for (const example of EXAMPLES) expect(() => validateRuntimeRule(example)).not.toThrow();
    expect(() => validateRuntimeRule(HAND_WRITTEN[EXAMPLES.length].args[0])).toThrow('Conditions contradict each other: “spend today” cannot fall into the given range.');
  });
});
