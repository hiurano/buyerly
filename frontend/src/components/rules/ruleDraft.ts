import {
  ACCOUNT_SCOPE,
  RULE_LEVEL_LABELS,
  RULE_METRIC_LABELS,
  RULE_TIME_WINDOW_LABELS,
  type RuleAction,
  type RuleConditionPayload,
  type RuleExecutionLevel,
  type RuleMetric,
  type RuleOperator,
  type RulePresetPayload,
  type RulePresetWriteRequest,
  type RuleScope,
  type RuleTimeWindow,
} from '@/lib/rules';

/**
 * The rule window's state (#387): a rule read as "WHEN … THEN …", where it
 * runs, and how often. Kept apart from the window so it can be checked,
 * named, summed up in one sentence and saved as a draft without a browser.
 */
export interface ConditionDraft {
  metric: RuleMetric;
  operator: RuleOperator;
  /** As typed; checked before it becomes a number. */
  value: string;
}

export interface RuleDraft {
  name: string;
  level: RuleExecutionLevel;
  action: RuleAction;
  conditions: ConditionDraft[];
  logic: 'and' | 'or';
  timeWindow: RuleTimeWindow;
  checkInterval: number;
  repeatMinutes: number;
  budgetPercent: string;
  budgetMax: string;
  labelIds: string[];
  /** Ad account id → where in it the rule runs. Empty: nowhere yet. */
  runOn: Record<string, RuleScope>;
}

/** Every option mirrors what `api/schemas/rules.py` accepts. */
export const RULE_ACTIONS: RuleAction[] = ['turn_off', 'turn_on', 'notify_only', 'increase_budget', 'decrease_budget'];
export const RULE_LEVELS: RuleExecutionLevel[] = ['adset', 'campaign', 'ad'];
export const RULE_WINDOWS: RuleTimeWindow[] = ['today', 'yesterday', 'last_3d', 'last_7d', 'lifetime'];
export const CHECK_INTERVALS = [5, 15, 30, 60, 180, 720, 1440];
/**
 * How long the rule leaves an entity alone after acting on it (the backend
 * cooldown); without it a condition that keeps matching repeats the action.
 */
export const REPEAT_INTERVALS = [60, 180, 360, 720, 1440];
export const MAX_CONDITIONS = 20;

/**
 * Budget changes stay on ad sets: a campaign on Campaign Budget Optimization
 * owns its budget, and Meta rejects a budget write aimed at its ad sets.
 */
export const BUDGET_ACTIONS: ReadonlySet<RuleAction> = new Set(['increase_budget', 'decrease_budget']);

/** The Metric menu's sections: money, counts, rates. */
export const METRIC_SECTIONS: { label: string; metrics: RuleMetric[] }[] = [
  { label: 'Money', metrics: ['spend', 'cpl', 'cpreg', 'cpp', 'cpc'] },
  { label: 'Counts', metrics: ['clicks', 'link_clicks', 'leads', 'registrations', 'purchases'] },
  { label: 'Rates', metrics: ['ctr'] },
];

const MONEY: ReadonlySet<RuleMetric> = new Set(METRIC_SECTIONS[0].metrics);
const COUNTS: ReadonlySet<RuleMetric> = new Set(METRIC_SECTIONS[1].metrics);

export type MetricUnit = 'money' | 'count' | 'percent';
export const metricUnit = (metric: RuleMetric): MetricUnit =>
  MONEY.has(metric) ? 'money' : COUNTS.has(metric) ? 'count' : 'percent';

/** Operators as symbols with their words, as the window lists them ("≥ at least"). */
export const RULE_OPERATORS: { value: RuleOperator; symbol: string; words: string }[] = [
  { value: 'gte', symbol: '≥', words: 'at least' },
  { value: 'gt', symbol: '>', words: 'more than' },
  { value: 'lte', symbol: '≤', words: 'at most' },
  { value: 'lt', symbol: '<', words: 'less than' },
  { value: 'eq', symbol: '=', words: 'exactly' },
];
export const operatorSymbol = (operator: RuleOperator) =>
  RULE_OPERATORS.find((option) => option.value === operator)?.symbol ?? operator;

/** THEN, said of the level the rule acts on. */
export function actionLabel(action: RuleAction, level: RuleExecutionLevel): string {
  const noun = RULE_LEVEL_LABELS[level].toLowerCase();
  if (action === 'turn_off') return `Turn the ${noun} off`;
  if (action === 'turn_on') return `Turn the ${noun} on`;
  if (action === 'notify_only') return 'Only notify me';
  if (action === 'increase_budget') return 'Raise the daily budget';
  return 'Lower the daily budget';
}

export const availableActions = (level: RuleExecutionLevel) =>
  RULE_ACTIONS.filter((action) => level === 'adset' || !BUDGET_ACTIONS.has(action));

export function formatCheckInterval(minutes: number): string {
  if (minutes < 60) return `Every ${minutes} min`;
  if (minutes < 1440) return minutes === 60 ? 'Every hour' : `Every ${minutes / 60} h`;
  return 'Once a day';
}

export function formatRepeat(minutes: number): string {
  if (minutes <= 0) return 'Every check';
  if (minutes === 60) return 'Once an hour';
  if (minutes === 1440) return 'Once a day';
  if (minutes % 1440 === 0) return `Every ${minutes / 1440} days`;
  if (minutes % 60 === 0) return `Every ${minutes / 60} h`;
  return `Every ${minutes} min`;
}

export const DEFAULT_CONDITION: ConditionDraft = { metric: 'spend', operator: 'gte', value: '' };

export function emptyDraft(): RuleDraft {
  return {
    name: '',
    level: 'adset',
    action: 'turn_off',
    conditions: [{ ...DEFAULT_CONDITION }],
    logic: 'and',
    timeWindow: 'today',
    checkInterval: 5,
    repeatMinutes: 1440,
    budgetPercent: '20',
    budgetMax: '',
    labelIds: [],
    runOn: {},
  };
}

/** A saved rule in the window, every field round-tripped. */
export function draftFromPreset(preset: RulePresetPayload, labelIds: string[]): RuleDraft {
  return {
    name: preset.name,
    level: preset.level,
    action: preset.action,
    conditions: preset.conditions.length === 0
      ? [{ ...DEFAULT_CONDITION }]
      : preset.conditions.map((condition) => ({
        metric: condition.metric, operator: condition.operator, value: String(condition.value),
      })),
    logic: preset.condition_logic,
    timeWindow: preset.conditions[0]?.time_window ?? 'today',
    checkInterval: preset.check_interval_minutes,
    repeatMinutes: preset.cooldown_minutes,
    budgetPercent: String(preset.budget_change_percent || 20),
    budgetMax: preset.budget_max_daily > 0 ? String(preset.budget_max_daily) : '',
    labelIds,
    runOn: Object.fromEntries(preset.attached_account_ids.map((accountId) => [
      accountId, preset.attached_scopes[accountId] ?? ACCOUNT_SCOPE,
    ])),
  };
}

/** What is wrong with one condition, said in its chip; null when it is fine. */
export function conditionProblem(condition: ConditionDraft): string | null {
  const label = RULE_METRIC_LABELS[condition.metric];
  const text = condition.value.trim();
  if (text === '') return `Enter a value for ${label}`;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return `${label} needs a number of 0 or more`;
  if (metricUnit(condition.metric) === 'count' && !Number.isInteger(value)) return `${label} is a whole number`;
  return null;
}

/** Everything that keeps the rule from being saved, in the order the window shows it. */
export function draftProblems(draft: RuleDraft): string[] {
  const problems = draft.conditions.map(conditionProblem).filter((problem): problem is string => problem !== null);
  if (BUDGET_ACTIONS.has(draft.action)) {
    const percent = Number(draft.budgetPercent);
    if (!(percent > 0 && percent <= 100)) problems.push('Change the budget by 1–100%');
    if (draft.action === 'increase_budget' && !(Number(draft.budgetMax) > 0)) problems.push('Set the daily ceiling');
  }
  return problems;
}

const lowerMetric = (metric: RuleMetric) => {
  const label = RULE_METRIC_LABELS[metric];
  // Acronyms stay as they are: CPL, CTR, CPReg.
  return label === label.toUpperCase() || /^CP/.test(label) ? label : label.toLowerCase();
};

function valueText(condition: ConditionDraft, currency?: string): string {
  const text = condition.value.trim() || '…';
  const unit = metricUnit(condition.metric);
  if (unit === 'percent') return `${text}%`;
  if (unit === 'money' && currency) return `${currency} ${text}`;
  return text;
}

/**
 * The name a rule gets when the field is left empty, from its conditions and
 * action: "Spend ≥ 4 & Leads = 0 → Turn off". The field shows it as a hint.
 */
export function autoRuleName(draft: RuleDraft): string {
  const joiner = draft.logic === 'or' ? ' or ' : ' & ';
  const conditions = draft.conditions
    .map((condition) => `${RULE_METRIC_LABELS[condition.metric]} ${operatorSymbol(condition.operator)} ${valueText(condition)}`)
    .join(joiner);
  const verb = {
    turn_off: 'Turn off', turn_on: 'Turn on', notify_only: 'Notify',
    increase_budget: 'Budget +', decrease_budget: 'Budget −',
  }[draft.action];
  const name = `${conditions} → ${verb}`;
  return name.length > 120 ? `${name.slice(0, 119)}…` : name;
}

export interface RunOnAccount {
  account_id: string;
  name: string;
  currency?: string;
}

/** Where the rule runs, in words: "Runs on Main account", "Runs on 2 campaigns in Main account". */
export function describeRunOn(runOn: Record<string, RuleScope>, accounts: RunOnAccount[]): string {
  const entries = Object.entries(runOn);
  if (entries.length === 0) return 'Runs nowhere until you pick where.';
  if (entries.length > 1) return `Runs on ${entries.length} ad accounts.`;
  const [accountId, scope] = entries[0];
  const name = accounts.find((account) => account.account_id === accountId)?.name ?? accountId;
  if (scope.level === 'account') return `Runs on ${name}.`;
  const noun = scope.level === 'campaign' ? 'campaign' : 'ad set';
  return `Runs on ${scope.ids.length} ${noun}${scope.ids.length === 1 ? '' : 's'} in ${name}.`;
}

/** The one currency of the accounts the rule runs on, else of every account; undefined when they differ. */
export function draftCurrency(draft: RuleDraft, accounts: RunOnAccount[]): string | undefined {
  const chosen = Object.keys(draft.runOn);
  const relevant = chosen.length ? accounts.filter((account) => chosen.includes(account.account_id)) : accounts;
  const currencies = new Set(relevant.map((account) => (account.currency ?? '').trim().toUpperCase()));
  const [only] = currencies;
  return currencies.size === 1 && only ? only : undefined;
}

/**
 * The summary under the chips: what the rule does, how often, when and where.
 * "Checks each ad set every 5 min and turns it off when spend ≥ USD 4 and
 * leads = 0 (lifetime). Acts on the same ad set at most once a day. Runs on …"
 */
export function describeDraft(draft: RuleDraft, accounts: RunOnAccount[]): string {
  const noun = RULE_LEVEL_LABELS[draft.level].toLowerCase();
  const currency = draftCurrency(draft, accounts);
  const every = draft.checkInterval >= 1440 ? 'once a day' : formatCheckInterval(draft.checkInterval).toLowerCase();
  const percent = draft.budgetPercent.trim() || '…';
  const ceiling = draft.budgetMax.trim() ? ` up to ${currency ? `${currency} ` : ''}${draft.budgetMax.trim()} a day` : '';
  const does = {
    turn_off: 'turns it off',
    turn_on: 'turns it on',
    notify_only: 'notifies you',
    increase_budget: `raises its daily budget by ${percent}%${ceiling}`,
    decrease_budget: `lowers its daily budget by ${percent}%`,
  }[draft.action];
  const when = draft.conditions
    .map((condition) => `${lowerMetric(condition.metric)} ${operatorSymbol(condition.operator)} ${valueText(condition, currency)}`)
    .join(draft.logic === 'or' ? ' or ' : ' and ');
  const repeat = draft.repeatMinutes >= 1440
    ? `Acts on the same ${noun} at most ${draft.repeatMinutes === 1440 ? 'once a day' : `every ${draft.repeatMinutes / 1440} days`}.`
    : `Acts on the same ${noun} at most ${formatRepeat(draft.repeatMinutes).toLowerCase()}.`;
  return [
    `Checks each ${noun} ${every} and ${does} when ${when} (${RULE_TIME_WINDOW_LABELS[draft.timeWindow]}).`,
    repeat,
    describeRunOn(draft.runOn, accounts),
  ].join(' ');
}

/** The write request, or null while something is wrong. Labels are filtered to ones that exist. */
export function draftToPayload(draft: RuleDraft, knownLabelIds: string[]): RulePresetWriteRequest | null {
  if (draftProblems(draft).length > 0) return null;
  const budget = BUDGET_ACTIONS.has(draft.action);
  const conditions: RuleConditionPayload[] = draft.conditions.map((condition) => ({
    metric: condition.metric,
    operator: condition.operator,
    value: Number(condition.value),
    time_window: draft.timeWindow,
  }));
  return {
    name: draft.name.trim() || autoRuleName(draft),
    action: draft.action,
    level: draft.level,
    enabled: true,
    conditions,
    condition_logic: draft.logic,
    cooldown_minutes: draft.repeatMinutes,
    check_interval_minutes: draft.checkInterval,
    // Other actions send exactly zero for both budget fields.
    budget_change_percent: budget ? Number(draft.budgetPercent) : 0,
    budget_max_daily: draft.action === 'increase_budget' ? Number(draft.budgetMax) : 0,
    label_ids: draft.labelIds.filter((id) => knownLabelIds.includes(id)).map(Number),
  };
}

export const draftAttachments = (draft: RuleDraft) =>
  Object.entries(draft.runOn).map(([account_id, scope]) => ({ account_id, scope }));

export function sameRunOn(left: Record<string, RuleScope>, right: Record<string, RuleScope>): boolean {
  const key = (runOn: Record<string, RuleScope>) => JSON.stringify(
    Object.keys(runOn).sort().map((id) => [id, runOn[id].level, [...runOn[id].ids].sort()]),
  );
  return key(left) === key(right);
}

/** Changing the level drops a budget action the new level cannot take. */
export function withLevel(draft: RuleDraft, level: RuleExecutionLevel): RuleDraft {
  return {
    ...draft,
    level,
    action: level !== 'adset' && BUDGET_ACTIONS.has(draft.action) ? 'turn_off' : draft.action,
  };
}

/** True when nothing was typed or chosen: closing such a window keeps no draft. */
export function isDraftEmpty(draft: RuleDraft): boolean {
  return JSON.stringify({ ...draft }) === JSON.stringify(emptyDraft());
}

export const draftStorageKey = (workspace: string) => `buyerly:rule-draft:${workspace}`;

/**
 * A new rule closed before it was created comes back on the next open, as
 * Linear keeps an unsent issue. Storage is optional; a malformed draft is ignored.
 */
export function readStoredDraft(key: string): RuleDraft | null {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!stored || typeof stored !== 'object') return null;
    const base = emptyDraft();
    const draft = { ...base, ...stored } as RuleDraft;
    const valid = typeof draft.name === 'string'
      && RULE_LEVELS.includes(draft.level)
      && RULE_ACTIONS.includes(draft.action)
      && RULE_WINDOWS.includes(draft.timeWindow)
      && Array.isArray(draft.conditions) && draft.conditions.length > 0 && draft.conditions.length <= MAX_CONDITIONS
      && draft.conditions.every((condition) => typeof condition?.value === 'string' && condition.metric in RULE_METRIC_LABELS
        && RULE_OPERATORS.some((option) => option.value === condition.operator))
      && Array.isArray(draft.labelIds) && typeof draft.runOn === 'object' && draft.runOn !== null;
    return valid ? draft : null;
  } catch {
    return null;
  }
}

export function writeStoredDraft(key: string, draft: RuleDraft | null) {
  try {
    if (draft === null || isDraftEmpty(draft)) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    /* Storage is optional. */
  }
}
