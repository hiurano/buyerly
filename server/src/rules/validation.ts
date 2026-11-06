// The rule checks of core/metrics.py, line for line: what a saved rule may
// look like, how a stored rule snapshot is normalized, and which rules may run
// together on one ad account. Pure functions with no I/O; the rule engine's
// evaluation (reading metrics, comparing them, acting) is not here and stays
// on Python until stage 4 of #611.
//
// Values come from JSON, so Python's float() and str() are mirrored for the
// shapes JSON has. One difference cannot be mirrored: JSON 3.0 and 3 are the
// same JS number, so a number Python would hold as a float prints like an int
// (only in messages naming a bad metric or operator, never in a decision).
//
// test/rules/validation.test.ts feeds the same cases to this module and to
// core/metrics.py and requires identical results.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Rule = Record<string, unknown>;

export class RuleValueError extends Error {}

// Python's AttributeError (.get on a non-mapping). The checks here treat it
// as any failure; the engine, like Python's, lets it through (rules/engine.ts).
export class RuleAttributeError extends RuleValueError {}

const LEGACY_METRIC_ALIASES: Record<string, string> = { cpr: 'cpreg', cpa: 'legacy_cpa' };

export const PUBLIC_RULE_METRICS = new Set([
  'spend', 'cpl', 'cpreg', 'cpp', 'leads', 'registrations', 'purchases', 'ctr', 'cpc', 'clicks', 'link_clicks',
]);
const COUNT_RULE_METRICS = new Set(['leads', 'registrations', 'purchases', 'clicks', 'link_clicks']);
export const RULE_OPERATORS = new Set(['gt', 'gte', 'lt', 'lte', 'eq']);
export const RULE_ACTIONS = new Set(['turn_off', 'notify_only', 'turn_on', 'increase_budget', 'decrease_budget']);
const RULE_LOGICS = new Set(['and', 'or']);
export const RULE_TIME_WINDOWS = new Set(['today', 'yesterday', 'last_3d', 'last_7d', 'lifetime']);

const RULE_MAX_CONDITIONS = 20;
const RULE_MAX_VALUE = 1_000_000_000.0;
const RULE_MAX_BUDGET = 10_000_000.0;
const RULE_MAX_COOLDOWN_MINUTES = 10_080;
const RULE_MAX_CHECK_INTERVAL_MINUTES = 1_440;
const RULE_MAX_BUDGET_CHANGE_PERCENT = 100.0;
const RULE_SCOPE_LEVELS = new Set(['account', 'campaign', 'adset']);
const RULE_EXECUTION_LEVELS = new Set(['campaign', 'adset', 'ad']);
const BUDGET_RULE_ACTIONS = new Set(['increase_budget', 'decrease_budget']);
export const RULE_MAX_SCOPE_IDS = 200;
const RULE_MAX_SCOPE_ID_LENGTH = 64;
const CONFLICTING_RULE_ACTIONS = [['turn_off', 'turn_on'], ['increase_budget', 'decrease_budget']];

// Python's whitespace (str.isspace), for strip() and float().
const SPACE = '[\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]';
const STRIP = new RegExp(`^${SPACE}+|${SPACE}+$`, 'g');
export const pyStrip = (value: string): string => value.replace(STRIP, '');

export const isMapping = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// dict.get(key, default): the default only when the key is absent.
export function get(mapping: Record<string, unknown>, key: string, fallback: unknown = null): unknown {
  return Object.prototype.hasOwnProperty.call(mapping, key) ? mapping[key] : fallback;
}

function floatRepr(value: number): string {
  if (Number.isNaN(value)) return 'nan';
  if (!Number.isFinite(value)) return value > 0 ? 'inf' : '-inf';
  if (Object.is(value, -0)) return '-0.0';
  const abs = Math.abs(value);
  if (abs >= 1e16 || (abs !== 0 && abs < 1e-4)) {
    // repr switches to exponent notation: 1e+16, 1.5e-05.
    const [mantissa, exponent] = value.toExponential().split('e');
    const power = Number(exponent);
    return `${mantissa}e${power < 0 ? '-' : '+'}${String(Math.abs(power)).padStart(2, '0')}`;
  }
  const text = String(value);
  return text.includes('.') ? text : `${text}.0`;
}

// str() of a JSON value. A whole number prints as an int (see the header).
export function pyStr(value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'number') return Number.isInteger(value) && Math.abs(value) < 1e16 ? String(value) : floatRepr(value);
  if (typeof value === 'string') return value;
  return pyRepr(value);
}

export function pyRepr(value: unknown): string {
  if (typeof value === 'string') {
    const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
    const body = value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    return quote + (quote === "'" ? body.replace(/'/g, "\\'") : body) + quote;
  }
  if (Array.isArray(value)) return `[${value.map(pyRepr).join(', ')}]`;
  if (isMapping(value)) return `{${Object.entries(value).map(([key, item]) => `${pyRepr(key)}: ${pyRepr(item)}`).join(', ')}}`;
  return pyStr(value);
}

const FLOAT_TEXT = /^[+-]?(?:(?:\d(?:_?\d)*)?\.?\d(?:_?\d)*|\d(?:_?\d)*\.)(?:[eE][+-]?\d(?:_?\d)*)?$/;
const SPECIAL_FLOAT = /^([+-]?)(inf|infinity|nan)$/i;

// float(): a number, a bool, or a string holding one; anything else fails
// (Python's TypeError or ValueError, which the callers treat alike).
export function pyFloat(value: unknown): number {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const text = pyStrip(value);
    const special = SPECIAL_FLOAT.exec(text);
    if (special) return special[2].toLowerCase() === 'nan' ? NaN : (special[1] === '-' ? -Infinity : Infinity);
    if (FLOAT_TEXT.test(text)) return Number(text.replace(/_/g, ''));
    throw new RuleValueError(`could not convert string to float: ${pyRepr(value)}`);
  }
  // Python's TypeError, with its message: the engine quotes it ("Automation halted: …").
  throw new RuleValueError(`float() argument must be a string or a real number, not '${pyTypeName(value)}'`);
}

// type(value).__name__ of a JSON value.
export function pyTypeName(value: unknown): string {
  if (value === null || value === undefined) return 'NoneType';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float';
  if (typeof value === 'string') return 'str';
  return Array.isArray(value) ? 'list' : 'dict';
}

export function canonicalRuleMetric(metric: unknown): string {
  const key = pyStrip(truthy(metric) ? pyStr(metric) : '').toLowerCase();
  return LEGACY_METRIC_ALIASES[key] ?? key;
}

// Python truthiness of a JSON value, for `x or default`.
export function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (isMapping(value)) return Object.keys(value).length > 0;
  return Boolean(value);
}

export interface NormalizedConditions {
  conditions: Record<string, unknown>[];
  changed: boolean;
  hasLegacyCpa: boolean;
}

export function normalizeRuleConditions(conditions: unknown): NormalizedConditions {
  if (!Array.isArray(conditions)) {
    return { conditions: [], changed: conditions !== null && conditions !== undefined, hasLegacyCpa: false };
  }
  const normalized: Record<string, unknown>[] = [];
  let changed = false;
  let hasLegacyCpa = false;
  for (const raw of conditions) {
    if (!isMapping(raw)) {
      changed = true;
      continue;
    }
    const condition = { ...raw };
    const original = pyStr(get(condition, 'metric', ''));
    const metric = canonicalRuleMetric(original);
    if (metric !== original) {
      condition.metric = metric;
      changed = true;
    }
    if (metric === 'legacy_cpa') {
      hasLegacyCpa = true;
      if (get(condition, 'migration_note') !== 'replace_with_cpl_cpreg_or_cpp') {
        condition.migration_note = 'replace_with_cpl_cpreg_or_cpp';
        changed = true;
      }
    }
    normalized.push(condition);
  }
  return { conditions: normalized, changed, hasLegacyCpa };
}

const LEGACY_REVIEW_REASON = 'Replace the legacy combined CPA with CPL, CPReg or CPP.';

export function normalizeRuntimeRule(rule: Rule): { rule: Rule; changed: boolean; hasLegacyCpa: boolean } {
  const normalizedRule: Rule = { ...rule };
  const { conditions, changed: conditionsChanged, hasLegacyCpa } = normalizeRuleConditions(get(normalizedRule, 'conditions', []));
  let changed = conditionsChanged;
  normalizedRule.conditions = conditions;
  if (hasLegacyCpa) {
    if (get(normalizedRule, 'enabled') !== false) {
      normalizedRule.enabled = false;
      changed = true;
    }
    if (get(normalizedRule, 'needs_review') !== true) {
      normalizedRule.needs_review = true;
      changed = true;
    }
    if (get(normalizedRule, 'review_reason') !== LEGACY_REVIEW_REASON) {
      normalizedRule.review_reason = LEGACY_REVIEW_REASON;
      changed = true;
    }
  }
  return { rule: normalizedRule, changed, hasLegacyCpa };
}

function asMapping(value: unknown): Record<string, unknown> {
  // Python would fail on .get of a non-mapping; the callers treat any failure alike.
  if (!isMapping(value)) throw new RuleAttributeError(`'${pyTypeName(value)}' object has no attribute 'get'`);
  return value;
}

export function validatePublicRuleConditions(conditions: unknown[]): void {
  for (const item of conditions) {
    const condition = asMapping(item);
    const metric = canonicalRuleMetric(get(condition, 'metric'));
    if (!PUBLIC_RULE_METRICS.has(metric)) throw new RuleValueError(`Unsupported rule metric: ${pyStr(get(condition, 'metric'))}`);
    const operator = pyStr(get(condition, 'operator', ''));
    if (!RULE_OPERATORS.has(operator)) throw new RuleValueError(`Unsupported rule operator: ${operator}`);
    const timeWindow = pyStr(get(condition, 'time_window', 'today'));
    if (!RULE_TIME_WINDOWS.has(timeWindow)) throw new RuleValueError(`Unsupported rule time window: ${timeWindow}`);
    let value: number;
    try {
      value = pyFloat(get(condition, 'value'));
    } catch {
      throw new RuleValueError('Rule value must be numeric');
    }
    if (!Number.isFinite(value) || value < 0 || value > RULE_MAX_VALUE) throw new RuleValueError('Rule value is outside the safe range');
  }
}

type Signature = [string, string, number, string];

function conditionSignature(condition: Record<string, unknown>): Signature {
  return [
    canonicalRuleMetric(get(condition, 'metric')),
    pyStr(get(condition, 'operator', '')),
    pyFloat(get(condition, 'value', 0.0)),
    pyStr(get(condition, 'time_window', 'today')),
  ];
}

// A tuple as a set/dict key. -0.0 == 0.0 in Python, so they share a key;
// nan never equals itself, so each nan is its own key.
let nanKeys = 0;
function signatureKey(signature: Signature): string {
  const [metric, operator, value, window] = signature;
  const number = Number.isNaN(value) ? `nan#${nanKeys++}` : String(value === 0 ? 0 : value);
  return JSON.stringify([metric, operator, number, window]);
}

function metricContextLabel(metric: string, timeWindow: string): string {
  const metricLabels: Record<string, string> = {
    spend: 'spend',
    cpl: 'cost per lead',
    cpreg: 'cost per registration',
    cpp: 'cost per purchase',
    leads: 'lead count',
    registrations: 'registration count',
    purchases: 'purchase count',
    ctr: 'click-through rate',
    cpc: 'cost per click',
    link_clicks: 'link clicks',
  };
  const windowLabels: Record<string, string> = {
    today: 'today',
    yesterday: 'yesterday',
    last_3d: 'over the last 3 days',
    last_7d: 'over the last 7 days',
    lifetime: 'since launch',
  };
  return `${metricLabels[metric] ?? metric} ${windowLabels[timeWindow] ?? timeWindow}`;
}

type Bound = [number, boolean];

function updateLowerBound(current: Bound | null, candidate: Bound): Bound {
  if (current === null || candidate[0] > current[0]) return candidate;
  if (candidate[0] < current[0]) return current;
  return [candidate[0], current[1] && candidate[1]];
}

function updateUpperBound(current: Bound | null, candidate: Bound): Bound {
  if (current === null || candidate[0] < current[0]) return candidate;
  if (candidate[0] > current[0]) return current;
  return [candidate[0], current[1] && candidate[1]];
}

function andGroupIsEmpty(conditions: Record<string, unknown>[]): boolean {
  let lower: Bound | null = null;
  let upper: Bound | null = null;
  for (const condition of conditions) {
    const operator = pyStr(get(condition, 'operator', ''));
    const value = pyFloat(get(condition, 'value', 0.0));
    if (operator === 'gt') lower = updateLowerBound(lower, [value, false]);
    else if (operator === 'gte') lower = updateLowerBound(lower, [value, true]);
    else if (operator === 'lt') upper = updateUpperBound(upper, [value, false]);
    else if (operator === 'lte') upper = updateUpperBound(upper, [value, true]);
    else if (operator === 'eq') {
      lower = updateLowerBound(lower, [value, true]);
      upper = updateUpperBound(upper, [value, true]);
    }
  }
  if (lower === null || upper === null) return false;
  if (lower[0] > upper[0]) return true;
  return lower[0] === upper[0] && !(lower[1] && upper[1]);
}

function orGroupIsAlwaysTrue(conditions: Record<string, unknown>[]): boolean {
  const bounds = conditions.map((condition): [string, number] => [pyStr(get(condition, 'operator', '')), pyFloat(get(condition, 'value', 0.0))]);
  const has = (operator: string, value: number) => bounds.some(([o, v]) => o === operator && v === value);
  return bounds.some(([, value]) => (has('gte', value) && has('lt', value)) || (has('gt', value) && has('lte', value)));
}

export function validateRuleSemantics(conditions: unknown[], logic: string, _action: string): void {
  const mappings = conditions.map(asMapping);
  const keys = mappings.map((condition) => signatureKey(conditionSignature(condition)));
  if (keys.length !== new Set(keys).size) throw new RuleValueError('The same condition was added to the rule more than once.');

  for (const condition of mappings) {
    const metric = canonicalRuleMetric(get(condition, 'metric'));
    const value = pyFloat(get(condition, 'value', 0.0));
    // float.is_integer(): false for inf and nan.
    if (COUNT_RULE_METRICS.has(metric) && !Number.isInteger(value)) {
      throw new RuleValueError('Leads, registrations, purchases and clicks must be whole numbers.');
    }
  }

  const grouped = new Map<string, { metric: string; timeWindow: string; conditions: Record<string, unknown>[] }>();
  for (const condition of mappings) {
    const metric = canonicalRuleMetric(get(condition, 'metric'));
    const timeWindow = pyStr(get(condition, 'time_window', 'today'));
    const key = JSON.stringify([metric, timeWindow]);
    if (!grouped.has(key)) grouped.set(key, { metric, timeWindow, conditions: [] });
    grouped.get(key)!.conditions.push(condition);
  }
  for (const { metric, timeWindow, conditions: group } of grouped.values()) {
    const label = metricContextLabel(metric, timeWindow);
    if (logic === 'and' && andGroupIsEmpty(group)) {
      throw new RuleValueError(`Conditions contradict each other: “${label}” cannot fall into the given range.`);
    }
    if (logic === 'or' && orGroupIsAlwaysTrue(group)) {
      throw new RuleValueError(`The rule would always fire: the conditions for “${label}” cover every possible value.`);
    }
  }
}

function compareSignatures(a: Signature, b: Signature): number {
  for (let index = 0; index < 4; index += 1) {
    const [x, y] = [a[index], b[index]];
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') {
      if (x < y) return -1;
      if (x > y) return 1;
      continue;
    }
    // str comparison is by code point.
    const [sx, sy] = [String(x), String(y)];
    const length = Math.min(sx.length, sy.length);
    for (let i = 0; i < length; i += 1) {
      const [cx, cy] = [sx.codePointAt(i)!, sy.codePointAt(i)!];
      if (cx !== cy) return cx < cy ? -1 : 1;
    }
    if (sx.length !== sy.length) return sx.length < sy.length ? -1 : 1;
  }
  return 0;
}

function ruleTriggerSignature(rule: Record<string, unknown>): string {
  let conditions = get(rule, 'conditions', []);
  if (!Array.isArray(conditions)) conditions = [];
  const signatures = (conditions as unknown[]).map((condition) => conditionSignature(asMapping(condition))).sort(compareSignatures);
  const logic = pyStr(get(rule, 'logic', get(rule, 'condition_logic', 'and')));
  return JSON.stringify([logic, signatures.map(([m, o, v, w]) => [m, o, Number.isNaN(v) ? 'nan' : String(v === 0 ? 0 : v), w])]);
}

function ruleScopesCanOverlap(first: Record<string, unknown>, second: Record<string, unknown>): boolean {
  let firstScope: Scope;
  let secondScope: Scope;
  try {
    firstScope = normalizeRuleScope(get(first, 'scope'));
    secondScope = normalizeRuleScope(get(second, 'scope'));
  } catch (error) {
    if (error instanceof RuleValueError) return true;
    throw error;
  }
  if (firstScope.level === 'account' || secondScope.level === 'account') return true;
  if (firstScope.level !== secondScope.level) return true;
  return firstScope.ids.some((id) => secondScope.ids.includes(id));
}

export function validateRuleSetCompatibility(rules: unknown[]): void {
  const usable = rules.filter(
    (rule): rule is Record<string, unknown> => isMapping(rule) && get(rule, 'enabled', true) !== false && get(rule, 'needs_review', false) !== true,
  );
  for (const [index, first] of usable.entries()) {
    for (const second of usable.slice(index + 1)) {
      const actions = new Set([pyStr(get(first, 'action', '')), pyStr(get(second, 'action', ''))]);
      const conflicting = CONFLICTING_RULE_ACTIONS.some((pair) => actions.size === 2 && pair.every((action) => actions.has(action)));
      if (!conflicting) continue;
      if (ruleTriggerSignature(first) !== ruleTriggerSignature(second)) continue;
      if (!ruleScopesCanOverlap(first, second)) continue;
      const firstName = truthy(get(first, 'name')) ? pyStr(get(first, 'name')) : 'First rule';
      const secondName = truthy(get(second, 'name')) ? pyStr(get(second, 'name')) : 'Second rule';
      throw new RuleValueError(
        `Rules “${firstName}” and “${secondName}” contradict each other: they share the same conditions but take opposite actions.`,
      );
    }
  }
}

export interface Scope {
  level: string;
  ids: string[];
}

export function normalizeRuleScope(scope: unknown): Scope {
  if (scope === null || scope === undefined) return { level: 'account', ids: [] };
  if (!isMapping(scope)) throw new RuleValueError('Rule scope must be an object');
  const level = pyStr(get(scope, 'level', 'account'));
  if (!RULE_SCOPE_LEVELS.has(level)) throw new RuleValueError(`Unsupported rule scope level: ${level}`);
  if (level === 'account') return { level: 'account', ids: [] };
  const rawIds = get(scope, 'ids', []);
  if (!Array.isArray(rawIds)) throw new RuleValueError('Rule scope ids must be a list');
  const ids: string[] = [];
  for (const rawId of rawIds) {
    if (typeof rawId === 'boolean' || !(typeof rawId === 'string' || (typeof rawId === 'number' && Number.isInteger(rawId)))) {
      throw new RuleValueError('Rule scope ids must be strings');
    }
    const entityId = pyStrip(pyStr(rawId));
    if (!entityId || [...entityId].length > RULE_MAX_SCOPE_ID_LENGTH) throw new RuleValueError('Rule scope id is empty or too long');
    if (!ids.includes(entityId)) ids.push(entityId);
  }
  if (!ids.length) throw new RuleValueError(`Rule scoped to a ${level} must name at least one id`);
  if (ids.length > RULE_MAX_SCOPE_IDS) throw new RuleValueError(`Rule scope cannot name more than ${RULE_MAX_SCOPE_IDS} ids`);
  return { level, ids };
}

export function normalizeRuleLevel(level: unknown): string {
  if (level === null || level === undefined) return 'adset';
  const normalized = pyStr(level);
  if (!RULE_EXECUTION_LEVELS.has(normalized)) throw new RuleValueError(`Unsupported rule execution level: ${normalized}`);
  return normalized;
}

export function validateRuntimeRule(rule: unknown): void {
  if (!isMapping(rule)) throw new RuleValueError('Rule must be an object');
  normalizeRuleScope(get(rule, 'scope'));
  const action = pyStr(get(rule, 'action', ''));
  if (!RULE_ACTIONS.has(action)) throw new RuleValueError(`Unsupported rule action: ${action}`);
  const level = normalizeRuleLevel(get(rule, 'level'));
  if (level !== 'adset' && BUDGET_RULE_ACTIONS.has(action)) throw new RuleValueError('Budget changes are supported at the ad set level only.');
  const logic = pyStr(get(rule, 'logic', get(rule, 'condition_logic', '')));
  if (!RULE_LOGICS.has(logic)) throw new RuleValueError(`Unsupported rule logic: ${logic}`);
  const conditions = get(rule, 'conditions');
  if (!Array.isArray(conditions) || conditions.length < 1 || conditions.length > RULE_MAX_CONDITIONS) {
    throw new RuleValueError('Rule must contain between 1 and 20 conditions');
  }
  validatePublicRuleConditions(conditions);
  validateRuleSemantics(conditions, logic, action);

  const safeNumber = (key: string, fallback: unknown = 0.0): number => {
    let value: number;
    try {
      value = pyFloat(get(rule, key, fallback));
    } catch {
      throw new RuleValueError(`Invalid numeric rule field: ${key}`);
    }
    if (!Number.isFinite(value)) throw new RuleValueError(`Non-finite numeric rule field: ${key}`);
    return value;
  };
  const cooldown = safeNumber('cooldown_minutes');
  const checkInterval = safeNumber('check_interval', safeNumber('check_interval_minutes', 5.0));
  const budgetPercent = safeNumber('budget_change_percent');
  const budgetMax = safeNumber('budget_max_daily');
  if (cooldown < 0 || cooldown > RULE_MAX_COOLDOWN_MINUTES || !Number.isInteger(cooldown)) throw new RuleValueError('Cooldown is outside the safe range');
  if (checkInterval < 1 || checkInterval > RULE_MAX_CHECK_INTERVAL_MINUTES || !Number.isInteger(checkInterval)) {
    throw new RuleValueError('Check interval is outside the safe range');
  }
  if (budgetMax < 0 || budgetMax > RULE_MAX_BUDGET) throw new RuleValueError('Budget limit is outside the safe range');
  if (BUDGET_RULE_ACTIONS.has(action)) {
    if (budgetPercent <= 0 || budgetPercent > RULE_MAX_BUDGET_CHANGE_PERCENT) throw new RuleValueError('Budget change percentage is outside the safe range');
    if (action === 'increase_budget' && budgetMax <= 0) throw new RuleValueError('Budget increase requires a positive daily ceiling');
  } else if (budgetPercent !== 0 || budgetMax !== 0) {
    throw new RuleValueError('Non-budget actions cannot contain budget parameters');
  }
}
