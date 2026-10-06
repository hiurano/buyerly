import { apiRequest } from '@/lib/api';
import { formatMetricMoney } from '@/components/campaigns/liveCampaigns';

/**
 * Wire format of `api/routers/rules.py`. Field names mirror the Pydantic
 * schemas exactly; translation into view models happens in this module so no
 * component has to know the backend shape.
 */

export type RuleMetric =
  | 'spend'
  | 'cpl'
  | 'cpreg'
  | 'cpp'
  | 'leads'
  | 'registrations'
  | 'purchases'
  | 'ctr'
  | 'cpc'
  | 'clicks';

export type RuleOperator = 'gte' | 'gt' | 'lte' | 'lt' | 'eq';

export type RuleTimeWindow = 'today' | 'yesterday' | 'last_3d' | 'last_7d';

export type RuleAction =
  | 'turn_off'
  | 'notify_only'
  | 'turn_on'
  | 'increase_budget'
  | 'decrease_budget';

export type RuleExecutionLevel = 'campaign' | 'adset' | 'ad';

export type RuleGroupIcon = 'backlog' | 'shield' | 'rocket' | 'flask' | 'custom';

/**
 * Which ad sets an attached rule may act on. A rule always acts on ad sets;
 * scope only narrows the search. "account" is the historical behaviour of
 * sweeping every ad set in the ad account.
 */
export type RuleScopeLevel = 'account' | 'campaign' | 'adset';

export interface RuleScope {
  level: RuleScopeLevel;
  ids: string[];
}

/** One rule as stored on an ad account, in the runtime snapshot format. */
export interface AttachedRule {
  preset_id: number;
  name: string;
  scope?: RuleScope;
}

export const ACCOUNT_SCOPE: RuleScope = { level: 'account', ids: [] };

export function attachedRuleScope(rule: AttachedRule): RuleScope {
  return rule.scope ?? ACCOUNT_SCOPE;
}

export interface RuleConditionPayload {
  metric: RuleMetric;
  operator: RuleOperator;
  value: number;
  time_window: RuleTimeWindow;
}

export interface RulePresetPayload {
  id: number;
  name: string;
  action: RuleAction;
  level: RuleExecutionLevel;
  enabled: boolean;
  conditions: RuleConditionPayload[];
  condition_logic: 'and' | 'or';
  cooldown_minutes: number;
  check_interval_minutes: number;
  budget_change_percent: number;
  budget_max_daily: number;
  currency_mode: 'account';
  created_at: string;
  needs_review: boolean;
  review_reason: string;
  last_run_at: string;
  attached_account_ids: string[];
  /** Scope per attached account, keyed by ad account id. */
  attached_scopes: Record<string, RuleScope>;
}

export interface RuleGroupPayload {
  id: number;
  name: string;
  description: string;
  icon: RuleGroupIcon;
  position: number;
  preset_ids: number[];
  rules: RulePresetPayload[];
  created_at: string;
}

export interface RulePresetWriteRequest {
  name: string;
  action: RuleAction;
  level: RuleExecutionLevel;
  enabled: boolean;
  conditions: RuleConditionPayload[];
  condition_logic: 'and' | 'or';
  cooldown_minutes: number;
  check_interval_minutes: number;
  budget_change_percent: number;
  budget_max_daily: number;
}

export interface RuleGroupWriteRequest {
  name: string;
  description: string;
  icon: RuleGroupIcon;
  position?: number;
  preset_ids: number[];
}

/* ---------------------------------------------------------------- labels -- */

export const RULE_METRIC_LABELS: Record<RuleMetric, string> = {
  spend: 'Spend',
  cpl: 'CPL',
  cpreg: 'CPReg',
  cpp: 'CPP',
  leads: 'Leads',
  registrations: 'Registrations',
  purchases: 'Purchases',
  ctr: 'CTR',
  cpc: 'CPC',
  clicks: 'Clicks',
};

export const RULE_OPERATOR_LABELS: Record<RuleOperator, string> = {
  gte: '≥',
  gt: '>',
  lte: '≤',
  lt: '<',
  eq: '=',
};

export const RULE_TIME_WINDOW_LABELS: Record<RuleTimeWindow, string> = {
  today: 'today',
  yesterday: 'yesterday',
  last_3d: 'last 3d',
  last_7d: 'last 7d',
};

export const RULE_LEVEL_LABELS: Record<RuleExecutionLevel, string> = {
  adset: 'Ad set',
  campaign: 'Campaign',
  ad: 'Ad',
};

export const RULE_ACTION_LABELS: Record<RuleAction, string> = {
  turn_off: 'TURN OFF',
  turn_on: 'TURN ON',
  notify_only: 'NOTIFY',
  increase_budget: 'BUDGET +',
  decrease_budget: 'BUDGET −',
};

const PERCENT_METRICS: ReadonlySet<RuleMetric> = new Set(['ctr']);

const MONEY_METRICS: ReadonlySet<RuleMetric> = new Set(['spend', 'cpl', 'cpreg', 'cpp', 'cpc']);

/**
 * Values are stored in each ad account's own currency. `currency` is given
 * only when every account the rule concerns uses the same one; otherwise the
 * metric name carries the unit.
 */
function formatConditionValue(metric: RuleMetric, value: number, currency?: string): string {
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (PERCENT_METRICS.has(metric)) return `${rounded}%`;
  if (currency && MONEY_METRICS.has(metric)) {
    const money = formatMetricMoney(value, currency);
    if (money !== '—') return money;
  }
  return rounded;
}

/** "IF Spend ≥ USD 50.00 & Leads = 0 today": the window is part of the condition. */
export function formatCondition(preset: RulePresetPayload, currency?: string): string {
  if (preset.conditions.length === 0) return 'No conditions';
  const joiner = preset.condition_logic === 'or' ? ' OR ' : ' & ';
  const windows = new Set(preset.conditions.map((condition) => condition.time_window));
  const shared = windows.size === 1 ? preset.conditions[0].time_window : null;
  const parts = preset.conditions.map((condition) => {
    const metric = RULE_METRIC_LABELS[condition.metric] ?? condition.metric;
    const operator = RULE_OPERATOR_LABELS[condition.operator] ?? condition.operator;
    const text = `${metric} ${operator} ${formatConditionValue(condition.metric, condition.value, currency)}`;
    return shared ? text : `${text} ${RULE_TIME_WINDOW_LABELS[condition.time_window] ?? condition.time_window}`;
  });
  const joined = parts.join(joiner);
  return shared ? `IF ${joined} ${RULE_TIME_WINDOW_LABELS[shared] ?? shared}` : `IF ${joined}`;
}

/**
 * The one currency a rule's values are in: that of the ad accounts it is
 * attached to, or — before it is attached anywhere — of every ad account in
 * the workspace. Undefined when those accounts disagree or report none.
 */
export function ruleCurrency(
  preset: RulePresetPayload,
  accounts: { account_id: string; currency?: string }[],
): string | undefined {
  const attached = new Set(preset.attached_account_ids);
  const relevant = attached.size > 0
    ? accounts.filter((account) => attached.has(account.account_id))
    : accounts;
  const currencies = new Set(relevant.map((account) => (account.currency ?? '').trim().toUpperCase()));
  if (currencies.size !== 1) return undefined;
  const [only] = currencies;
  return only || undefined;
}

/**
 * What a rule checks and where, in one sentence for the rule form. "Applies
 * to" picks the thing the rule judges and acts on; attaching the rule picks
 * the part of the account it looks in.
 */
export function describeRuleReach(level: RuleExecutionLevel): string {
  if (level === 'campaign') {
    return 'Checks each campaign as a whole. Attached to an ad account, it covers every campaign there; attached to a campaign, only that campaign.';
  }
  const noun = level === 'ad' ? 'ad' : 'ad set';
  return `Checks each ${noun} on its own. Attached to an ad account, it covers every ${noun} there; attached to a campaign, every ${noun} in that campaign.`;
}

/**
 * Includes the level, because "turn off" means very different things when it
 * takes down one ad set versus a whole campaign.
 */
export function formatAction(preset: RulePresetPayload): string {
  if (preset.action === 'increase_budget') {
    return `BUDGET +${preset.budget_change_percent}%`;
  }
  if (preset.action === 'decrease_budget') {
    return `BUDGET −${preset.budget_change_percent}%`;
  }
  const label = RULE_ACTION_LABELS[preset.action] ?? preset.action.toUpperCase();
  if (preset.action === 'notify_only') return label;
  return `${label} ${RULE_LEVEL_LABELS[preset.level]?.toUpperCase() ?? 'AD SET'}`;
}

/**
 * Semantic tone of an action, so a badge never infers meaning from its own
 * label text. "stop" takes delivery away, "positive" adds budget or delivery.
 */
export type RuleActionTone = 'stop' | 'positive' | 'default';

export function ruleActionTone(action: RuleAction): RuleActionTone {
  if (action === 'turn_off' || action === 'decrease_budget') return 'stop';
  if (action === 'turn_on' || action === 'increase_budget') return 'positive';
  return 'default';
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Relative time for the Last run column; empty input means the rule never fired. */
export function formatRelativeTime(isoTimestamp: string, now: number = Date.now()): string {
  if (!isoTimestamp) return 'Never';
  const parsed = Date.parse(isoTimestamp);
  if (Number.isNaN(parsed)) return 'Never';
  const elapsed = now - parsed;
  if (elapsed < MINUTE) return 'Just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  return `${Math.floor(elapsed / DAY)}d ago`;
}

/**
 * Ad accounts arrive as Meta ids (`act_123…`). The list only needs to say
 * whether the rule can run at all and in how many places.
 */
/** The next step for a rule that runs nowhere yet: a new rule is never attached. */
export const ATTACH_STEPS =
  'Attach a rule to an ad account from its row menu (Run on ad accounts), or to a campaign from the Rules column in Ads Manager.';

export function formatScope(preset: RulePresetPayload): string {
  const count = preset.attached_account_ids.length;
  if (count === 0) return 'Not attached';
  return count === 1 ? '1 ad account' : `${count} ad accounts`;
}

/* ------------------------------------------------------------- requests -- */

export function fetchRulePresets(): Promise<RulePresetPayload[]> {
  return apiRequest<RulePresetPayload[]>('/api/presets');
}

export function fetchRuleGroups(): Promise<RuleGroupPayload[]> {
  return apiRequest<RuleGroupPayload[]>('/api/rule-groups');
}

export function createRulePreset(
  payload: RulePresetWriteRequest,
  headers?: HeadersInit,
): Promise<RulePresetPayload> {
  return apiRequest<RulePresetPayload>('/api/presets', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers,
  });
}

export function updateRulePreset(
  presetId: number,
  payload: RulePresetWriteRequest,
): Promise<RulePresetPayload> {
  return apiRequest<RulePresetPayload>(`/api/presets/${presetId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/** The deletion keeps the rule restorable; `deleted_item_id` is its entry in Recently deleted. */
export interface DeleteResponse {
  success: boolean;
  deleted_item_id: number;
}

export function deleteRulePreset(presetId: number): Promise<DeleteResponse> {
  return apiRequest<DeleteResponse>(`/api/presets/${presetId}`, {
    method: 'DELETE',
  });
}

export function createRuleGroup(
  payload: RuleGroupWriteRequest,
): Promise<RuleGroupPayload> {
  return apiRequest<RuleGroupPayload>('/api/rule-groups', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateRuleGroup(
  groupId: number,
  payload: RuleGroupWriteRequest,
): Promise<RuleGroupPayload> {
  return apiRequest<RuleGroupPayload>(`/api/rule-groups/${groupId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteRuleGroup(groupId: number): Promise<DeleteResponse> {
  return apiRequest<DeleteResponse>(`/api/rule-groups/${groupId}`, {
    method: 'DELETE',
  });
}

/* ------------------------------------------- rules attached to accounts -- */

interface AccountRulesResponse {
  account_id: string;
  active_rules: AttachedRule[];
  rules_enabled: boolean;
}

export function assignRuleToAccount(
  accountId: string,
  presetId: number,
  scope: RuleScope,
  headers?: HeadersInit,
): Promise<AccountRulesResponse> {
  return apiRequest<AccountRulesResponse>(
    `/api/accounts/${encodeURIComponent(accountId)}/assign-rule`,
    {
      method: 'POST',
      body: JSON.stringify({ preset_id: presetId, scope }),
      headers,
    },
  );
}

export function setAttachedRuleScope(
  accountId: string,
  presetId: number,
  scope: RuleScope,
): Promise<AccountRulesResponse> {
  return apiRequest<AccountRulesResponse>(
    `/api/accounts/${encodeURIComponent(accountId)}/rules/${presetId}/scope`,
    {
      method: 'PUT',
      body: JSON.stringify(scope),
    },
  );
}

export function detachRuleFromAccount(
  accountId: string,
  presetId: number,
  headers?: HeadersInit,
): Promise<AccountRulesResponse> {
  return apiRequest<AccountRulesResponse>(
    `/api/accounts/${encodeURIComponent(accountId)}/detach-rule/${presetId}`,
    { method: 'POST', headers },
  );
}

/**
 * A preset carries every field the write endpoint requires, so an edit that
 * changes one attribute round-trips the rest unchanged.
 */
export function presetToWriteRequest(
  preset: RulePresetPayload,
  overrides: Partial<RulePresetWriteRequest> = {},
): RulePresetWriteRequest {
  return {
    name: preset.name,
    action: preset.action,
    level: preset.level,
    enabled: preset.enabled,
    conditions: preset.conditions,
    condition_logic: preset.condition_logic,
    cooldown_minutes: preset.cooldown_minutes,
    check_interval_minutes: preset.check_interval_minutes,
    budget_change_percent: preset.budget_change_percent,
    budget_max_daily: preset.budget_max_daily,
    ...overrides,
  };
}
