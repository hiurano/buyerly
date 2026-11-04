// The JSONB columns' contracts (database/jsonb_contract.py,
// database/rule_workspace_contract.py): the top-level type each structured
// column must hold, and the shapes of the ones whose content the server
// reads field by field. The models in models.ts use these types.

import type { JsonObject } from './json.ts';

// Table, primary key, column and the top-level JSON type the column must
// hold. A legacy row that stored the value as a JSON string is decoded only
// when the decoded value has this type (decode_legacy_jsonb_string).
export type JsonbTopLevelType = 'object' | 'array';

export interface JsonbNativeColumn {
  table: string;
  primaryKey: string;
  column: string;
  type: JsonbTopLevelType;
}

// JSONB_NATIVE_COLUMNS, without analytics_view_preferences, which migration
// 0054 dropped.
export const JSONB_NATIVE_COLUMNS: readonly JsonbNativeColumn[] = [
  { table: 'automation_runtime_states', primaryKey: 'state_key', column: 'payload', type: 'object' },
  { table: 'rule_presets', primaryKey: 'id', column: 'conditions', type: 'array' },
  { table: 'meta_connections', primaryKey: 'id', column: 'granted_scopes', type: 'array' },
  { table: 'summary_snapshots', primaryKey: 'id', column: 'payload', type: 'object' },
  { table: 'adset_inventory_cache', primaryKey: 'account_id', column: 'adsets_payload', type: 'array' },
  { table: 'audit_events', primaryKey: 'id', column: 'before_state', type: 'object' },
  { table: 'audit_events', primaryKey: 'id', column: 'after_state', type: 'object' },
  { table: 'audit_events', primaryKey: 'id', column: 'details', type: 'object' },
  { table: 'rule_execution_states', primaryKey: 'id', column: 'before_state', type: 'object' },
  { table: 'rule_execution_states', primaryKey: 'id', column: 'after_state', type: 'object' },
  { table: 'rule_execution_states', primaryKey: 'id', column: 'details', type: 'object' },
  { table: 'action_undo_states', primaryKey: 'id', column: 'expected_state', type: 'object' },
  { table: 'action_undo_states', primaryKey: 'id', column: 'desired_state', type: 'object' },
];

// Rules (core/metrics.py, api/schemas/rules.py).

export type RuleMetric =
  | 'spend' | 'cpl' | 'cpreg' | 'cpp' | 'leads' | 'registrations' | 'purchases'
  | 'ctr' | 'cpc' | 'clicks' | 'link_clicks';
export type RuleOperator = 'gte' | 'gt' | 'lte' | 'lt' | 'eq';
export type RuleTimeWindow = 'today' | 'yesterday' | 'last_3d' | 'last_7d' | 'lifetime';
export type RuleAction = 'turn_off' | 'notify_only' | 'turn_on' | 'increase_budget' | 'decrease_budget';
export type RuleConditionLogic = 'and' | 'or';
// Where a rule reads metrics and applies its action.
export type RuleLevel = 'campaign' | 'adset' | 'ad';
// Which entities an attached rule may act on; "account" sweeps the whole ad account.
export type RuleScopeLevel = 'account' | 'campaign' | 'adset';

// One element of rule_presets.conditions. Rows saved before CPA was split
// may still hold metric "cpa" (read as "legacy_cpa", with a migration note);
// such a rule is held back from running until it is re-saved.
export interface RuleCondition {
  metric: RuleMetric | 'legacy_cpa';
  operator: RuleOperator;
  value: number;
  time_window: RuleTimeWindow;
  migration_note?: 'replace_with_cpl_cpreg_or_cpp';
}

export interface RuleScope {
  level: RuleScopeLevel;
  ids: string[];
}

// One element of accounts.active_rules: the rule as attached to an ad account
// (api/deps.py _preset_snapshot). The column is TEXT holding a JSON array, not
// JSONB, so it is read with JSON.parse.
export interface RuleSnapshot {
  preset_id: number;
  // Stamped by rule_workspace_contract; a snapshot whose rule is not in the ad
  // account's workspace is switched off and marked for review (fail closed).
  workspace_id: number | null;
  name: string;
  action: RuleAction;
  level: RuleLevel;
  enabled: boolean;
  conditions: RuleCondition[];
  logic: RuleConditionLogic;
  cooldown_minutes: number;
  check_interval: number;
  budget_change_percent: number;
  budget_max_daily: number;
  currency_mode: 'account';
  scope: RuleScope;
  needs_review?: boolean;
  review_reason?: string;
}

// rule_workspace_contract.WORKSPACE_REVIEW_REASON.
export const WORKSPACE_REVIEW_REASON = 'Rule disabled: its workspace cannot be confirmed for this ad account.';

// Inbox and notifications (api/routers/audit.py), on workspace_members.

export type InboxKind = 'urgent' | 'rule_alerts' | 'rule_actions' | 'assistant' | 'manual' | 'team' | 'system';

// One condition of a priority inbox custom filter; a filter is a list of them.
export interface InboxPriorityClause {
  field: 'type' | 'from';
  operator: 'is' | 'is_not';
  values: string[];
}

// workspace_members.inbox_display; NULL keeps Linear's defaults.
export interface InboxDisplay {
  unread_only: boolean;
  ordering: 'newest' | 'oldest';
  show_snoozed: boolean;
  unread_first: boolean;
  grouping: 'none' | 'focus';
  priority_inbox: boolean;
  priority_kinds: InboxKind[];
  priority_rules: InboxPriorityClause[][];
  badge_count: 'all' | 'priority' | 'none';
}

export interface ChannelNotifications {
  enabled: boolean;
  // Only priority notifications, while Priority inbox is on.
  priority_only: boolean;
  kinds: InboxKind[];
}

// workspace_members.notification_channels; NULL keeps Linear's defaults.
export interface NotificationChannels {
  email: ChannelNotifications;
  telegram: ChannelNotifications;
  desktop: ChannelNotifications;
  invite_accepted: boolean;
}

// view_settings.settings and workspace_view_defaults.settings: a list page's
// layout, grouping, ordering and filters. Each page knows its own shape; the
// server keeps the blob as given.
export type ViewSettingsBlob = JsonObject;
