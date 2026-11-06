// The rule engine's evaluation (rules/engine.py RuleEngine with
// core/metrics.py rule_metric_reading and compare_metric), line for line:
// given an entity's numbers and the rules on its ad account, what each rule
// sees and which action wins. Pure: no database, no Meta, no clock. The part
// that acts on Meta stays on Python until stage 4 of #611, which will run
// this module side by side with Python's engine before switching.
//
// Values come from JSON or SQL, so Python's float(), int(), str() and `==`
// are mirrored for those shapes (rules/validation.ts has the conventions).
// test/rules/engine.test.ts feeds the same cases to this module and to
// Python (engine_parity.py) and requires identical answers, messages
// included.

import { normalizeCurrency } from '../graphql/areas/accounts/currency.ts';
import { costPerEvent } from '../graphql/areas/accounts/metrics.ts';
import {
  RULE_OPERATORS,
  RuleAttributeError,
  RuleValueError,
  canonicalRuleMetric,
  get,
  isMapping,
  normalizeRuleLevel,
  normalizeRuleScope,
  pyFloat,
  pyRepr,
  pyStr,
  pyStrip,
  truthy,
  validateRuleSetCompatibility,
  validateRuntimeRule,
  type Rule,
} from './validation.ts';

// A Python exception other than ValueError (TypeError, AttributeError,
// OverflowError…): the engine lets it through, so the port does too.
export class PythonCrash extends Error {
  constructor(readonly pythonType: string, message: string) {
    super(message);
    this.name = pythonType;
  }
}

// `except (TypeError, ValueError)`: a ValueError of the port, or a TypeError
// raised as such by the port (validation.ts raises its TypeErrors as ValueErrors).
const valueOrTypeError = (error: unknown): boolean =>
  (error instanceof RuleValueError && !(error instanceof RuleAttributeError)) || (error instanceof PythonCrash && error.pythonType === 'TypeError');

const DIGITS = /^[+-]?\d(?:_?\d)*$/;

// int() of a JSON or SQL value: floats truncate toward zero.
export function pyInt(value: unknown): number {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) throw new RuleValueError('cannot convert float NaN to integer');
    if (!Number.isFinite(value)) throw new PythonCrash('OverflowError', 'cannot convert float infinity to integer');
    return Math.trunc(value) + 0;
  }
  if (typeof value === 'string') {
    const text = pyStrip(value);
    if (DIGITS.test(text)) return Number(text.replace(/_/g, ''));
    throw new RuleValueError(`invalid literal for int() with base 10: ${pyRepr(value)}`);
  }
  throw new PythonCrash('TypeError', 'int() argument must be a string, a bytes-like object or a real number');
}

// f"{int(x)}" of a whole number, digit for digit at any size.
const intText = (value: number): string => BigInt(pyInt(value)).toString();

// f"{x:.{digits}f}": the float's exact binary value rounded half to even, as
// Python formats it (toFixed rounds an exact tie up: 0.125 → 0.13, Python 0.12).
export function pyFixed(value: number, digits: number): string {
  if (Number.isNaN(value)) return 'nan';
  if (!Number.isFinite(value)) return value > 0 ? 'inf' : '-inf';
  const negative = value < 0 || Object.is(value, -0);
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(value));
  const bits = view.getBigUint64(0);
  const exponentBits = Number((bits >> 52n) & 0x7ffn);
  let mantissa = bits & ((1n << 52n) - 1n);
  let exponent: number;
  if (exponentBits === 0) exponent = -1074;
  else {
    mantissa |= 1n << 52n;
    exponent = exponentBits - 1075;
  }
  let numerator = mantissa * 10n ** BigInt(digits);
  let denominator = 1n;
  if (exponent >= 0) numerator <<= BigInt(exponent);
  else denominator <<= BigInt(-exponent);
  let whole = numerator / denominator;
  const twice = (numerator % denominator) * 2n;
  if (twice > denominator || (twice === denominator && (whole & 1n) === 1n)) whole += 1n;
  const text = whole.toString().padStart(digits + 1, '0');
  return (negative ? '-' : '') + (digits ? `${text.slice(0, -digits)}.${text.slice(-digits)}` : text);
}

// core/currency.py format_money.
const ZERO_DECIMAL_CURRENCIES = new Set(['CLP', 'ISK', 'JPY', 'KRW', 'PYG', 'VND']);

export function formatMoney(value: number | null, currency: unknown): string {
  if (value === null) return '—';
  const code = pyCurrency(currency);
  const digits = ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : 2;
  return `${pyFixed(pyFloat(value), digits)} ${code !== 'UNKNOWN' ? code : 'currency unknown'}`;
}

// normalize_currency(value): str(value or "").
const pyCurrency = (value: unknown): string => normalizeCurrency(truthy(value) ? pyStr(value) : '');

// `a == b` for JSON values: 1 == 1.0 == True.
export function pyEquals(a: unknown, b: unknown): boolean {
  const numeric = (value: unknown) => typeof value === 'number' || typeof value === 'boolean';
  if (numeric(a) && numeric(b)) return Number(a) === Number(b);
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => pyEquals(item, b[index]));
  if (isMapping(a) && isMapping(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && pyEquals(a[key], b[key]));
  }
  return a === b || (a === undefined && b === null) || (a === null && b === undefined);
}

// ---------------------------------------------------------------------------
// core/metrics.py: reading a metric and comparing it.

const METRIC_LABELS: Record<string, string> = {
  spend: 'Spend',
  cpl: 'Cost per lead (CPL)',
  cpreg: 'Cost per registration (CPReg)',
  cpp: 'Cost per purchase (CPP)',
  leads: 'Leads',
  registrations: 'Registrations',
  purchases: 'Purchases',
  ctr: 'CTR',
  cpc: 'CPC',
  clicks: 'Clicks',
  link_clicks: 'Link clicks',
  legacy_cpa: 'Legacy combined CPA',
};

const METRIC_UNITS: Record<string, string> = {
  spend: 'currency', cpl: 'currency', cpreg: 'currency', cpp: 'currency', leads: '', registrations: '', purchases: '',
  ctr: '%', cpc: 'currency', clicks: '', link_clicks: '', legacy_cpa: 'currency',
};

const DENOMINATORS: Record<string, string> = { cpl: 'leads', cpreg: 'registrations', cpp: 'purchases', cpc: 'clicks', ctr: 'impressions' };

const own = (mapping: Record<string, string>, key: string): string | undefined =>
  Object.prototype.hasOwnProperty.call(mapping, key) ? mapping[key] : undefined;

export interface MetricReading {
  key: string;
  label: string;
  unit: string;
  value: number | null;
  unavailable_reason: string;
}

// _number: float(data.get(key, 0) or 0), 0.0 when that fails.
function number(data: Record<string, unknown>, key: string): number {
  const raw = get(data, key, 0);
  try {
    return pyFloat(truthy(raw) ? raw : 0);
  } catch (error) {
    if (valueOrTypeError(error)) return 0;
    throw error;
  }
}

function asMapping(data: unknown): Record<string, unknown> {
  if (!isMapping(data)) throw new PythonCrash('AttributeError', "object has no attribute 'get'");
  return data;
}

export function ruleMetricReading(metric: unknown, source: unknown): MetricReading {
  const data = asMapping(source);
  const key = canonicalRuleMetric(metric);
  const label = own(METRIC_LABELS, key) ?? (key || 'Unknown metric');
  const unit = own(METRIC_UNITS, key) ?? '';
  const spend = number(data, 'spend');
  const leads = pyInt(number(data, 'leads'));
  const registrations = pyInt(number(data, 'registrations'));
  const purchases = pyInt(number(data, 'purchases'));
  const clicks = pyInt(number(data, 'clicks'));
  const linkClicks = pyInt(number(data, 'link_clicks'));
  const impressions = pyInt(number(data, 'impressions'));
  const reading = (value: number | null, reason = ''): MetricReading => ({ key, label, unit, value, unavailable_reason: reason });

  let value: number | null;
  switch (key) {
    case 'spend': value = spend; break;
    case 'leads': value = leads; break;
    case 'registrations': value = registrations; break;
    case 'purchases': value = purchases; break;
    case 'clicks': value = clicks; break;
    case 'link_clicks': value = linkClicks; break;
    case 'cpl': value = costPerEvent(spend, leads); break;
    case 'cpreg': value = costPerEvent(spend, registrations); break;
    case 'cpp': value = costPerEvent(spend, purchases); break;
    case 'cpc': value = costPerEvent(spend, clicks); break;
    case 'ctr': value = impressions > 0 ? (clicks / impressions) * 100 : null; break;
    case 'legacy_cpa':
      return reading(null, 'The combined CPA mixed leads and registrations. Choose CPL, CPReg or CPP instead.');
    default:
      return reading(null, 'This metric is not supported by the current version of Buyerly.');
  }
  if (value === null) return reading(null, `No ${own(DENOMINATORS, key) ?? 'data'} to calculate from.`);
  return reading(value);
}

// math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9).
function isClose(a: number, b: number): boolean {
  if (a === b) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const difference = Math.abs(a - b);
  return difference <= Math.max(1e-9 * Math.max(Math.abs(a), Math.abs(b)), 1e-9);
}

// Raw values: rounding is only for display and never affects a rule.
export function compareMetric(reading: MetricReading, operator: unknown, target: unknown): boolean {
  if (reading.value === null || typeof operator !== 'string' || !RULE_OPERATORS.has(operator)) return false;
  const value = reading.value;
  const targetValue = pyFloat(target);
  if (operator === 'gt') return value > targetValue;
  if (operator === 'gte') return value >= targetValue;
  if (operator === 'lt') return value < targetValue;
  if (operator === 'lte') return value <= targetValue;
  return isClose(value, targetValue);
}

// core/metrics.py rule_scope_matches_entity.
export function ruleScopeMatchesEntity(scope: unknown, entity: Record<string, unknown>): boolean {
  let normalized;
  try {
    normalized = normalizeRuleScope(scope);
  } catch (error) {
    if (error instanceof RuleValueError) return false;
    throw error;
  }
  if (normalized.level === 'account') return true;
  const entityLevel = entityText(entity, 'entity_level') || 'adset';
  const entityId = entityText(entity, 'entity_id') || entityText(entity, 'adset_id');
  let ownerId: string;
  if (normalized.level === 'campaign') ownerId = entityLevel === 'campaign' ? entityId : entityText(entity, 'campaign_id');
  else if (entityLevel === 'adset') ownerId = entityId;
  else if (entityLevel === 'ad') ownerId = entityText(entity, 'adset_id');
  else return false;
  return Boolean(ownerId) && normalized.ids.includes(ownerId);
}

// str(entity.get(key) or ""): one link of an `a or b or ""` chain.
function entityText(entity: Record<string, unknown>, key: string): string {
  const value = get(entity, key);
  return truthy(value) ? pyStr(value) : '';
}

// ---------------------------------------------------------------------------
// rules/engine.py.

export type RuleAction = 'NOOP' | 'STOP' | 'NOTIFY_ONLY' | 'PROPOSE_REACTIVATE' | 'AUTO_REACTIVATE' | 'INCREASE_BUDGET' | 'DECREASE_BUDGET';

const RULE_ACTION_BY_TYPE: Record<string, RuleAction> = {
  turn_off: 'STOP',
  notify_only: 'NOTIFY_ONLY',
  turn_on: 'AUTO_REACTIVATE',
  increase_budget: 'INCREASE_BUDGET',
  decrease_budget: 'DECREASE_BUDGET',
};

const ACTION_PRIORITY: Record<RuleAction, number> = {
  STOP: 100, DECREASE_BUDGET: 90, INCREASE_BUDGET: 80, AUTO_REACTIVATE: 70, PROPOSE_REACTIVATE: 60, NOTIFY_ONLY: 50, NOOP: 0,
};

const OPERATOR_SYMBOLS: Record<string, string> = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=' };
const WINDOW_LABELS: Record<string, string> = { yesterday: 'Yesterday', last_3d: 'Last 3 days', last_7d: 'Last 7 days', lifetime: 'Lifetime' };

// RuleEvaluationResult as dataclasses.asdict() gives it.
export interface RuleEvaluationResult {
  action: RuleAction;
  entity_id: string;
  entity_name: string;
  spend: number;
  leads: number;
  registrations: number;
  purchases: number;
  cpl: number | null;
  cpreg: number | null;
  cpp: number | null;
  reason: string;
  budget_change_percent: number;
  budget_max_daily: number;
  cooldown_minutes: number;
  rule_id: unknown;
  rule_name: unknown;
  conditions_snapshot: unknown;
  currency: string;
  entity_level: string;
  campaign_id: string;
  yielded_rules: YieldedRule[];
}

export interface YieldedRule { rule_id: unknown; rule_name: unknown; action: RuleAction }

// What one rule saw on one entity (#322): matched, not_met (with the
// readings that fell short) or inactive (its delivery state rules it out).
export interface RuleCheck {
  rule: Rule;
  outcome: 'matched' | 'not_met' | 'inactive';
  detail: string;
}

// The Account fields the engine reads (getattr with its defaults).
export interface EngineAccount {
  rules_enabled?: unknown;
  workspace_id?: unknown;
  currency?: unknown;
  active_rules?: unknown;
}

export type Insights = Record<string, unknown> | null | undefined;

interface Triggered {
  action: RuleAction;
  reason: string;
  budget_change: number;
  budget_max: number;
  cooldown_minutes: number;
  rule_id: unknown;
  rule_name: unknown;
  conditions: unknown;
  priority: number;
}

function run(
  entity: Record<string, unknown>,
  account: EngineAccount,
  insightsByWindow: Insights,
  activeRulesOverride: unknown[] | null | undefined,
  checks: RuleCheck[] | null,
): RuleEvaluationResult | RuleEvaluationResult[] {
  const entityLevel = entityText(entity, 'entity_level') || 'adset';
  const entityId = entityText(entity, 'entity_id') || entityText(entity, 'adset_id');
  const entityName = entityText(entity, 'entity_name') || entityText(entity, 'adset_name');
  const campaignId = entityText(entity, 'campaign_id');
  const status = get(entity, 'status', 'UNKNOWN');
  const effectiveStatus = get(entity, 'effective_status', status);
  const spend = pyFloat(get(entity, 'spend', 0.0));
  const leads = pyInt(get(entity, 'leads', 0));
  const registrations = pyInt(get(entity, 'registrations', 0));
  const purchases = pyInt(get(entity, 'purchases', 0));
  const cpl = costPerEvent(spend, leads);
  const cpreg = costPerEvent(spend, registrations);
  const cpp = costPerEvent(spend, purchases);
  const isActive = status === 'ACTIVE' && effectiveStatus === 'ACTIVE';
  const currency = pyCurrency(account.currency === undefined ? 'UNKNOWN' : account.currency);

  const result = (action: RuleAction, reason: string, triggered?: Triggered): RuleEvaluationResult => ({
    action,
    entity_id: entityId,
    entity_name: entityName,
    spend,
    leads,
    registrations,
    purchases,
    cpl,
    cpreg,
    cpp,
    reason,
    budget_change_percent: triggered?.budget_change ?? 0.0,
    budget_max_daily: triggered?.budget_max ?? 0.0,
    cooldown_minutes: triggered?.cooldown_minutes ?? 0,
    rule_id: triggered ? triggered.rule_id : null,
    rule_name: triggered ? triggered.rule_name : '',
    conditions_snapshot: triggered ? triggered.conditions : [],
    currency,
    entity_level: entityLevel,
    campaign_id: campaignId,
    yielded_rules: [],
  });
  const noop = (reason = 'Metrics are within range.') => result('NOOP', reason);

  if (!truthy(account.rules_enabled ?? false)) return noop('Rules are switched off for this ad account.');

  let activeRules: unknown;
  if (activeRulesOverride !== null && activeRulesOverride !== undefined) activeRules = activeRulesOverride;
  else {
    const raw = account.active_rules === undefined ? '[]' : account.active_rules;
    try {
      activeRules = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      activeRules = [];
    }
  }
  if (!truthy(activeRules) || !Array.isArray(activeRules) || activeRules.length === 0) return noop('No rules are configured.');
  let rules: unknown[] = activeRules;

  if (account.workspace_id !== null && account.workspace_id !== undefined) {
    rules = rules.filter((rule) => isMapping(rule) && pyEquals(get(rule, 'workspace_id'), account.workspace_id));
    if (!rules.length) return noop("This workspace's rules are not configured.");
  }

  try {
    validateRuleSetCompatibility(rules);
  } catch (error) {
    if (valueOrTypeError(error)) return noop(`Automation halted: ${(error as Error).message}`);
    throw error;
  }

  const triggeredActions: Triggered[] = [];
  let invalidRuleSeen = false;

  for (const item of rules) {
    const rule = asMapping(item);
    if (get(rule, 'enabled', true) === false || get(rule, 'needs_review', false) === true) continue;
    // A rule only ever sees the level it executes on.
    try {
      if (normalizeRuleLevel(get(rule, 'level')) !== entityLevel) continue;
    } catch (error) {
      if (!(error instanceof RuleValueError)) throw error;
      invalidRuleSeen = true;
      continue;
    }
    // A rule aimed at one campaign must leave the rest of the account alone.
    if (!ruleScopeMatchesEntity(get(rule, 'scope'), entity)) continue;
    try {
      validateRuntimeRule(rule);
    } catch (error) {
      if (!valueOrTypeError(error)) throw error;
      invalidRuleSeen = true;
      continue;
    }
    const actionType = get(rule, 'action');
    if (actionType === 'turn_on') {
      if (status !== 'PAUSED') {
        checks?.push({ rule, outcome: 'inactive', detail: 'Not paused' });
        continue;
      }
    } else if (!isActive) {
      checks?.push({ rule, outcome: 'inactive', detail: 'Not active' });
      continue;
    }

    const conditions = get(rule, 'conditions', []);
    if (!truthy(conditions)) continue;
    const conditionLogic = get(rule, 'logic', 'and');

    const matchedReasons: string[] = [];
    const unmetReasons: string[] = [];
    let anyMatch = false;
    let allMatch = true;

    for (const raw of conditions as unknown[]) {
      const cond = asMapping(raw);
      const metric = get(cond, 'metric', 'spend');
      const operator = get(cond, 'operator', 'gte');
      const targetValue = pyFloat(get(cond, 'value', 0.0));
      const timeWindow = get(cond, 'time_window', 'today');

      let source: unknown;
      if (timeWindow !== 'today' && truthy(insightsByWindow) && windowIn(timeWindow, insightsByWindow!)) source = insightsByWindow![timeWindow as string];
      else if (timeWindow === 'lifetime') {
        // Never stand in today's numbers for the lifetime ones: without the
        // lifetime read the rule waits.
        source = null;
      } else source = entity;

      let reading = ruleMetricReading(metric, truthy(source) ? source : {});
      if (source === null || source === undefined) reading = { ...reading, value: null };
      const { value: metricValue, label: metricName, unit } = reading;

      const opSymbol = typeof operator === 'string' && own(OPERATOR_SYMBOLS, operator) !== undefined ? OPERATOR_SYMBOLS[operator] : pyStr(operator);
      let windowLabel = '';
      if (timeWindow !== 'today') {
        const label = typeof timeWindow === 'string' ? own(WINDOW_LABELS, timeWindow) : undefined;
        windowLabel = ` [${label ?? pyStr(timeWindow)}]`;
      }

      if (metricValue === null) {
        allMatch = false;
        unmetReasons.push(`${metricName}${windowLabel}: no data`);
        continue;
      }
      let valueText: string;
      let targetText: string;
      if (unit === 'currency') {
        valueText = formatMoney(metricValue, currency);
        targetText = formatMoney(targetValue, currency);
      } else if (unit === '%') {
        valueText = `${pyFixed(metricValue, 2)}%`;
        targetText = `${pyFixed(targetValue, 2)}%`;
      } else {
        valueText = intText(metricValue);
        targetText = intText(targetValue);
      }

      if (compareMetric(reading, operator, targetValue)) {
        anyMatch = true;
        matchedReasons.push(`${metricName}${windowLabel} (${valueText}) ${opSymbol} ${targetText}`);
      } else {
        allMatch = false;
        unmetReasons.push(`${metricName}${windowLabel} ${valueText}, needs ${opSymbol} ${targetText}`);
      }
    }

    const triggered = conditionLogic === 'or' ? anyMatch : allMatch;
    checks?.push({ rule, outcome: triggered ? 'matched' : 'not_met', detail: (triggered ? matchedReasons : unmetReasons).join(', ') });

    if (triggered) {
      const ruleAction = typeof actionType === 'string' ? (RULE_ACTION_BY_TYPE as Record<string, RuleAction | undefined>)[actionType] : undefined;
      if (!ruleAction || !Object.prototype.hasOwnProperty.call(RULE_ACTION_BY_TYPE, actionType as string)) {
        invalidRuleSeen = true;
        continue;
      }
      const ruleName = get(rule, 'name', 'Unknown Rule');
      triggeredActions.push({
        action: ruleAction,
        reason: `[${pyStr(ruleName)}] ` + matchedReasons.join(', '),
        budget_change: pyFloat(get(rule, 'budget_change_percent', 0.0)),
        budget_max: pyFloat(get(rule, 'budget_max_daily', 0.0)),
        cooldown_minutes: pyInt(get(rule, 'cooldown_minutes', 0)),
        rule_id: get(rule, 'preset_id'),
        rule_name: ruleName,
        conditions,
        priority: ACTION_PRIORITY[ruleAction],
      });
    }
  }

  if (!triggeredActions.length) {
    return noop(invalidRuleSeen ? 'Rules are missing or invalid; no actions were sent to Meta.' : 'Metrics are within range.');
  }
  // Highest priority first; the sort is stable, so rules with the same
  // action keep their order.
  triggeredActions.sort((a, b) => b.priority - a.priority);
  return triggeredActions.map((triggered) => result(triggered.action, triggered.reason, triggered));
}

// `time_window in insights_by_window`: JSON keys are strings; an unhashable
// window is Python's TypeError.
function windowIn(timeWindow: unknown, insights: Record<string, unknown>): boolean {
  if (Array.isArray(timeWindow) || isMapping(timeWindow)) throw new PythonCrash('TypeError', 'unhashable type');
  return typeof timeWindow === 'string' && Object.prototype.hasOwnProperty.call(insights, timeWindow);
}

// RuleEngine.evaluate: the highest-priority action; reasons of every rule
// that matched, joined.
export function evaluate(entity: Record<string, unknown>, account: EngineAccount, insightsByWindow?: Insights, activeRulesOverride?: unknown[] | null): RuleEvaluationResult {
  const results = run(entity, account, insightsByWindow, activeRulesOverride, null);
  if (!Array.isArray(results)) return results;
  return { ...results[0], reason: results.map((item) => item.reason).join(' | ') };
}

// RuleEngine.evaluate_all: changes of the strongest kind that matched (one
// per rule, naming the weaker ones they beat), then every notify-only alert.
export function evaluateAll(entity: Record<string, unknown>, account: EngineAccount, insightsByWindow?: Insights, activeRulesOverride?: unknown[] | null): RuleEvaluationResult[] {
  const results = run(entity, account, insightsByWindow, activeRulesOverride, null);
  if (!Array.isArray(results)) return [];
  let changes = results.filter((item) => item.action !== 'NOTIFY_ONLY');
  const alerts = results.filter((item) => item.action === 'NOTIFY_ONLY');
  if (changes.length) {
    const strongest = changes[0].action;
    const weaker = changes.filter((item) => item.action !== strongest).map(yieldedRule);
    changes = changes.filter((item) => item.action === strongest).map((item) => ({ ...item, yielded_rules: [...weaker] }));
  }
  return [...changes, ...alerts];
}

// RuleEngine.check: how each rule aimed at the entity fared, matched or not.
export function check(entity: Record<string, unknown>, account: EngineAccount, insightsByWindow?: Insights, activeRulesOverride?: unknown[] | null): RuleCheck[] {
  const checks: RuleCheck[] = [];
  run(entity, account, insightsByWindow, activeRulesOverride, checks);
  return checks;
}

export const yieldedRule = (result: RuleEvaluationResult): YieldedRule => ({ rule_id: result.rule_id, rule_name: result.rule_name, action: result.action });
