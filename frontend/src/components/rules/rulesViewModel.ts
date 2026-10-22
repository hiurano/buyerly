import type { RuleItem, RuleLabel } from '@/store/useAppStore';
import { RULE_LEVEL_LABELS, type RuleAction, type RuleExecutionLevel } from '@/lib/rules';
import { RULE_ACTION_NAMES, RULE_STATUS_NAMES, ruleState } from './ruleNames';

export { RULE_ACTION_NAMES, RULE_STATUS_NAMES, ruleState };
import { listViewDefaults, type SortDirection } from '@/ui/listView';
import { useListView } from '@/ui/useListView';

/**
 * Display properties of the Rules list, in column order (#390). ID, Applies
 * to, Check, Repeat and Created are one switch away; the rest show at first.
 */
export const RULE_PROPERTIES: { id: string; label: string; on: boolean }[] = [
  { id: 'status', label: 'Status', on: true },
  { id: 'id', label: 'ID', on: false },
  { id: 'labels', label: 'Labels', on: true },
  { id: 'condition', label: 'Condition', on: true },
  { id: 'action', label: 'Action', on: true },
  { id: 'level', label: 'Applies to', on: false },
  { id: 'scope', label: 'Scope', on: true },
  { id: 'check', label: 'Check', on: false },
  { id: 'repeat', label: 'Repeat', on: false },
  { id: 'lastCheck', label: 'Last check', on: true },
  { id: 'lastRun', label: 'Last action', on: true },
  { id: 'created', label: 'Created', on: false },
];

/** The Rules page's view as it starts, and as Reset brings it back (#385). */
export const RULES_VIEW_DEFAULTS = listViewDefaults({
  grouping: 'labels',
  ordering: 'manual',
  direction: 'asc',
  properties: Object.fromEntries(RULE_PROPERTIES.map((property) => [property.id, property.on])),
});

export const useRulesView = () => useListView('rules', RULES_VIEW_DEFAULTS);

/** A board always has columns: without a grouping, Rules' board is by Status. */
export const RULE_BOARD_FALLBACK = 'status';

/** Groupings, as Linear's: by label, state, what it does, what it acts on and where it runs. */
export const RULE_GROUPINGS = [
  { value: 'none', label: 'No grouping' },
  { value: 'labels', label: 'Label' },
  { value: 'status', label: 'Status' },
  { value: 'action', label: 'Action' },
  { value: 'level', label: 'Applies to' },
  { value: 'account', label: 'Ad account' },
];

export const RULE_ORDERINGS = [
  { value: 'manual', label: 'Manual' },
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
  { value: 'lastRun', label: 'Last action' },
  { value: 'lastCheck', label: 'Last check' },
  { value: 'created', label: 'Created' },
];

/** The direction a column header sorts in first: names A→Z, times newest first. */
export const naturalRuleDirection = (ordering: string): SortDirection => (ordering === 'name' || ordering === 'status' ? 'asc' : 'desc');

const STATUS_ORDER: Record<string, number> = { active: 1, paused: 2, needs_review: 3 };

const time = (value: string | undefined) => Date.parse(value ?? '') || 0;

/** Rules in the view's ordering and direction; Manual keeps the stored order. */
export function sortRules(rules: RuleItem[], ordering: string, direction: SortDirection): RuleItem[] {
  const factor = direction === 'asc' ? 1 : -1;
  if (ordering === 'name') return [...rules].sort((a, b) => a.name.localeCompare(b.name) * factor);
  if (ordering === 'status') {
    return [...rules].sort((a, b) => ((STATUS_ORDER[ruleState(a)] || 99) - (STATUS_ORDER[ruleState(b)] || 99)) * factor);
  }
  // The raw timestamps: the visible labels are relative text like "3h ago". Never sorts as oldest.
  if (ordering === 'lastRun') return [...rules].sort((a, b) => (time(a.preset.last_run_at) - time(b.preset.last_run_at)) * factor);
  if (ordering === 'lastCheck') return [...rules].sort((a, b) => (time(a.preset.last_checked_at) - time(b.preset.last_checked_at)) * factor);
  if (ordering === 'created') return [...rules].sort((a, b) => (time(a.preset.created_at) - time(b.preset.created_at)) * factor);
  return rules;
}

/** The dot of "No label", Linear's neutral gray. */
export const NO_LABEL_COLOR = '#95a2b3';
export const NO_LABEL_GROUP_ID = 'no-label';
export const NOT_ATTACHED_GROUP_ID = 'account-none';

/** A rule's labels in the workspace's order (by name); a label since deleted is left out. */
export function labelsOf(rule: Pick<RuleItem, 'labelIds'>, labels: RuleLabel[]): RuleLabel[] {
  return labels.filter((label) => rule.labelIds.includes(label.id));
}

export interface RuleListGroup {
  id: string;
  label: string;
  dotColor: string;
  rows: RuleItem[];
  /** The label a new rule from the header's "+" starts with. */
  labelId?: string;
  /** A label's color tints its header, as in Linear. */
  tint?: string;
  /**
   * What dropping a card into this board column sets (#390): a label, or a
   * state. Columns of other groupings take no drops.
   */
  drop?: { kind: 'label'; labelId: string | null } | { kind: 'status'; enabled: boolean };
}

export interface RuleGroupAccount {
  account_id: string;
  name: string;
}

/** The workspace's ad accounts as the Ad account grouping and filter name them. */
export const ruleGroupAccounts = (
  accounts: { account_id: string; name: string; custom_name?: string | null }[],
): RuleGroupAccount[] => accounts.map((account) => ({
  account_id: account.account_id,
  name: account.custom_name?.trim() || account.name || account.account_id,
}));

const ACTION_COLORS: Record<RuleAction, string> = {
  turn_off: '#eb5757',
  turn_on: '#4cb782',
  notify_only: '#95a2b3',
  increase_budget: '#5e6ad2',
  decrease_budget: '#f2994a',
};
const LEVEL_COLORS: Record<RuleExecutionLevel, string> = { campaign: '#bb87fc', adset: '#5e6ad2', ad: '#26b5ce' };
const STATUS_COLORS: Record<string, string> = { active: 'rgb(52, 211, 153)', paused: 'rgb(156, 163, 175)', needs_review: '#f2994a' };

/**
 * Every group the grouping has, empty ones included: Group ordering, Show
 * empty groups and the board's columns pick from these. A rule with two
 * labels, or on two ad accounts, shows in both groups, as in Linear.
 */
export function ruleGroupsFor(
  grouping: string,
  rules: RuleItem[],
  labels: RuleLabel[],
  accounts: RuleGroupAccount[] = [],
): RuleListGroup[] {
  if (grouping === 'status') {
    // The ids stay those of the two-state grouping, so a saved group order still applies.
    return (['active', 'paused', 'needs_review'] as const).map((state) => ({
      id: `status-${state}`,
      label: state === 'needs_review' ? 'Needs review' : `${RULE_STATUS_NAMES[state]} rules`,
      dotColor: STATUS_COLORS[state],
      rows: rules.filter((rule) => ruleState(rule) === state),
      drop: state === 'needs_review' ? undefined : { kind: 'status' as const, enabled: state === 'active' },
    }));
  }
  if (grouping === 'labels') {
    const known = new Set(labels.map((label) => label.id));
    return [
      ...labels.map((label) => ({
        id: label.id,
        label: label.name,
        dotColor: label.color,
        tint: label.color,
        rows: rules.filter((rule) => rule.labelIds.includes(label.id)),
        labelId: label.id,
        drop: { kind: 'label' as const, labelId: label.id },
      })),
      {
        id: NO_LABEL_GROUP_ID,
        label: 'No label',
        dotColor: NO_LABEL_COLOR,
        rows: rules.filter((rule) => !rule.labelIds.some((id) => known.has(id))),
        drop: { kind: 'label' as const, labelId: null },
      },
    ];
  }
  if (grouping === 'action') {
    return (Object.keys(RULE_ACTION_NAMES) as RuleAction[]).map((action) => ({
      id: `action-${action}`,
      label: RULE_ACTION_NAMES[action],
      dotColor: ACTION_COLORS[action],
      rows: rules.filter((rule) => rule.actionKind === action),
    }));
  }
  if (grouping === 'level') {
    return (['campaign', 'adset', 'ad'] as RuleExecutionLevel[]).map((level) => ({
      id: `level-${level}`,
      label: RULE_LEVEL_LABELS[level],
      dotColor: LEVEL_COLORS[level],
      rows: rules.filter((rule) => (rule.preset.level ?? 'adset') === level),
    }));
  }
  if (grouping === 'account') {
    return [
      ...accounts.map((account) => ({
        id: `account-${account.account_id}`,
        label: account.name,
        dotColor: '#5e6ad2',
        rows: rules.filter((rule) => rule.preset.attached_account_ids.includes(account.account_id)),
      })),
      {
        id: NOT_ATTACHED_GROUP_ID,
        label: 'Not attached',
        dotColor: NO_LABEL_COLOR,
        rows: rules.filter((rule) => rule.preset.attached_account_ids.length === 0),
      },
    ];
  }
  return [];
}

/** The groups a rule sits in under a grouping: where to open it when an address names it. */
export function ruleGroupIds(grouping: string, rule: RuleItem, labels: RuleLabel[], accounts: RuleGroupAccount[]): string[] {
  return ruleGroupsFor(grouping, [rule], labels, accounts).filter((group) => group.rows.length > 0).map((group) => group.id);
}
