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
  /** Last action, from the history; empty when the rule never acted. */
  last_run_at: string;
  /** Last check on any entity, matched or not; empty when never checked. */
  last_checked_at: string;
  attached_account_ids: string[];
  /** Scope per attached account, keyed by ad account id. */
  attached_scopes: Record<string, RuleScope>;
}

/** Where one rule stands on one entity as of its latest check (#322). */
export type RuleEntityStateName =
  | 'fired'
  | 'cooldown'
  | 'confirming'
  | 'undone'
  | 'yielded'
  | 'not_met'
  | 'inactive'
  | 'pending'
  | 'skipped'
  | 'error'
  | 'matched'
  | 'rules_off'
  | 'rule_paused'
  /** Client only: the rule reaches the entity but no check has seen the pair yet. */
  | 'unchecked';

export interface RuleEntityStatePayload {
  rule_id: number;
  rule_name: string;
  account_id: string;
  account_name: string;
  entity_level: RuleExecutionLevel;
  entity_id: string;
  entity_name: string;
  campaign_id: string;
  state: RuleEntityStateName;
  /** Readings that matched or fell short, or Meta's error. */
  detail: string;
  /** When a cooldown, an undo or a stop confirmation runs out. */
  wait_until: string;
  yielded_to_rule_id: number | null;
  yielded_to_rule_name: string;
  checked_at: string;
  /** The rule's last action on this entity, kept across quiet checks. */
  acted_at: string;
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

/** Clock time for "until …": today's time alone, otherwise with the date. */
export function formatUntil(isoTimestamp: string, now: Date = new Date()): string {
  const parsed = new Date(isoTimestamp);
  if (!isoTimestamp || Number.isNaN(parsed.getTime())) return '';
  const time = parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (parsed.toDateString() === now.toDateString()) return time;
  const date = parsed.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${date}, ${time}`;
}

export type RuleStateTone = 'acted' | 'waiting' | 'blocked' | 'quiet' | 'error';

export interface RuleStateView {
  /** Short status, e.g. "Waiting until 00:00". */
  label: string;
  /** Why, e.g. the readings or the rule it gave way to; may be empty. */
  note: string;
  tone: RuleStateTone;
}

const ENTITY_NOUNS: Record<RuleExecutionLevel, string> = {
  campaign: 'Campaign',
  adset: 'Ad set',
  ad: 'Ad',
};

/**
 * One rule's state on one entity in words (#322): fired, waiting until …,
 * undone for the rest of the day, gave way to another rule, or the condition
 * not met with the readings that fell short.
 */
export function describeRuleState(
  row: RuleEntityStatePayload,
  now: number = Date.now(),
): RuleStateView {
  const until = formatUntil(row.wait_until, new Date(now));
  const fired = row.acted_at ? `Fired ${formatRelativeTime(row.acted_at, now).toLowerCase()}` : '';
  switch (row.state) {
    case 'fired':
      return {
        label: 'Fired',
        note: [until && `repeats after ${until}`, row.detail].filter(Boolean).join(' · '),
        tone: 'acted',
      };
    case 'cooldown':
      return {
        label: until ? `Waiting until ${until}` : 'Waiting to repeat',
        note: [fired, row.detail].filter(Boolean).join(' · '),
        tone: 'waiting',
      };
    case 'confirming':
      return {
        label: until ? `Confirming stop until ${until}` : 'Confirming stop',
        note: row.detail,
        tone: 'waiting',
      };
    case 'undone':
      // A detail means the entity was turned back on by hand after the
      // rule's stop (#200), which holds the stop the same way an undo does.
      if (row.detail) {
        return {
          label: 'Kept on for today',
          note: until
            ? `${row.detail}; the rule won't turn it off before ${until}`
            : `${row.detail}; the rule won't turn it off again today`,
          tone: 'blocked',
        };
      }
      return {
        label: 'Undone for today',
        note: until
          ? `You undid this action in Inbox; the rule won't repeat it before ${until}`
          : "You undid this action in Inbox; the rule won't repeat it today",
        tone: 'blocked',
      };
    case 'yielded':
      return {
        label: row.yielded_to_rule_name
          ? `Gave way to ${row.yielded_to_rule_name}`
          : 'Gave way to another rule',
        note: row.detail,
        tone: 'blocked',
      };
    case 'not_met':
      return {
        label: 'Condition not met',
        note: [row.detail, fired].filter(Boolean).join(' · '),
        tone: 'quiet',
      };
    case 'inactive':
      return {
        label: `${ENTITY_NOUNS[row.entity_level]} ${row.detail === 'Not paused' ? 'is running' : 'is not running'}`,
        note: fired,
        tone: 'quiet',
      };
    case 'pending':
      return { label: 'Waiting for Meta', note: 'The last action is not confirmed yet', tone: 'waiting' };
    case 'skipped':
      return { label: 'Skipped', note: row.detail, tone: 'blocked' };
    case 'error':
      return { label: 'Failed', note: row.detail, tone: 'error' };
    case 'rules_off':
      return { label: 'Rules off for this ad account', note: fired, tone: 'quiet' };
    case 'rule_paused':
      return {
        label: 'Rule paused',
        note: [fired, 'Checks nothing until you turn it on again'].filter(Boolean).join(' · '),
        tone: 'quiet',
      };
    case 'unchecked':
      return { label: 'Not checked yet', note: row.detail, tone: 'quiet' };
    case 'matched':
    default:
      return { label: 'Condition met', note: row.detail, tone: 'acted' };
  }
}

/** What a rule covers within one ad account: some campaigns, some ad sets, or all of it. */
export function formatAccountScope(scope: RuleScope): string {
  if (scope.level === 'campaign') {
    return scope.ids.length === 1 ? '1 campaign' : `${scope.ids.length} campaigns`;
  }
  if (scope.level === 'adset') {
    return scope.ids.length === 1 ? '1 ad set' : `${scope.ids.length} ad sets`;
  }
  return 'Whole account';
}

/** The rule levels that act on a row of this level or inside it. */
export const RULE_LEVELS_UNDER: Record<'campaign' | 'adset', RuleExecutionLevel[]> = {
  campaign: ['campaign', 'adset', 'ad'],
  adset: ['adset', 'ad'],
};

/**
 * Rules that check one campaign or ad set row without being aimed at it
 * (#300): attached to the whole ad account, or — for an ad set — to its
 * campaign. A rule acting on a level above the row (a campaign rule on an ad
 * set row) does not check it. Kept in the ad account's stored order.
 */
export function inheritedRuleIds(
  scopes: Record<string, RuleScope>,
  order: string[],
  ruleLevels: Record<string, RuleExecutionLevel | undefined>,
  level: 'campaign' | 'adset',
  campaignId?: string,
): string[] {
  return order.filter((ruleId) => {
    const scope = scopes[ruleId];
    if (!scope) return false;
    const ruleLevel = ruleLevels[ruleId];
    if (ruleLevel && !RULE_LEVELS_UNDER[level].includes(ruleLevel)) return false;
    if (scope.level === 'account') return true;
    return level === 'adset' && scope.level === 'campaign' && Boolean(campaignId) && scope.ids.includes(campaignId!);
  });
}

/**
 * Ad accounts arrive as Meta ids (`act_123…`). The list only needs to say
 * whether the rule can run at all and in how many places; on one account
 * narrowed to campaigns or ad sets, it counts those, as the "⋯" menu does.
 */
/** The next step for a rule that runs nowhere yet: a new rule is never attached. */
export const ATTACH_STEPS =
  'Attach a rule to an ad account from its row menu (Run on ad accounts), or to a campaign from the Rules column in Ads Manager.';

export function formatScope(preset: RulePresetPayload): string {
  const count = preset.attached_account_ids.length;
  if (count === 0) return 'Not attached';
  if (count > 1) return `${count} ad accounts`;
  const scope = preset.attached_scopes[preset.attached_account_ids[0]];
  return scope && scope.level !== 'account' ? formatAccountScope(scope) : '1 ad account';
}

/* ------------------------------------------------------------- requests -- */

export function fetchRulePresets(): Promise<RulePresetPayload[]> {
  return apiRequest<RulePresetPayload[]>('/api/presets');
}

export function fetchRuleGroups(): Promise<RuleGroupPayload[]> {
  return apiRequest<RuleGroupPayload[]>('/api/rule-groups');
}

/** One rule's state on every entity it checks. */
export function fetchRuleStates(presetId: number): Promise<RuleEntityStatePayload[]> {
  return apiRequest<RuleEntityStatePayload[]>(`/api/presets/${presetId}/states`);
}

/** Every rule's state on one campaign, ad set or ad. */
export function fetchEntityRuleStates(
  level: RuleExecutionLevel,
  entityId: string,
): Promise<RuleEntityStatePayload[]> {
  const query = new URLSearchParams({ entity_level: level, entity_id: entityId });
  return apiRequest<RuleEntityStatePayload[]>(`/api/rule-states?${query}`);
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

/** One entity a whole-account attachment would check, as the rule sees it now. */
export interface RulePreviewEntity {
  entity_id: string;
  entity_name: string;
  status: string;
  spend: number;
  outcome: 'matched' | 'not_met' | 'inactive';
  detail: string;
}

/** What attaching a rule to a whole ad account would check (#200). */
export interface RuleAccountPreview {
  account_id: string;
  account_name: string;
  level: RuleExecutionLevel;
  rule_name: string;
  action: string;
  rules_enabled: boolean;
  already_attached: boolean;
  total: number;
  running: number;
  matching: number;
  data_as_of: string | null;
  entities: RulePreviewEntity[];
}

export function fetchRuleAccountPreview(
  accountId: string,
  presetId: number,
): Promise<RuleAccountPreview> {
  return apiRequest<RuleAccountPreview>(
    `/api/accounts/${encodeURIComponent(accountId)}/rules/${presetId}/preview`,
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
