import type { RuleItem, RuleLabel } from '@/store/useAppStore';
import { listViewDefaults, type SortDirection } from '@/ui/listView';
import { useListView } from '@/ui/useListView';

/** The Rules page's view as it starts, and as Reset brings it back (#385). */
export const RULES_VIEW_DEFAULTS = listViewDefaults({
  grouping: 'labels',
  ordering: 'manual',
  direction: 'asc',
  properties: {
    status: true,
    labels: true,
    condition: true,
    action: true,
    scope: true,
    lastCheck: true,
    lastRun: true,
  },
});

export const useRulesView = () => useListView('rules', RULES_VIEW_DEFAULTS);

/** The direction a column header sorts in first: names A→Z, times newest first. */
export const naturalRuleDirection = (ordering: string): SortDirection => (ordering === 'name' || ordering === 'status' ? 'asc' : 'desc');

const STATUS_ORDER: Record<string, number> = { active: 1, paused: 2 };

/** Rules in the view's ordering and direction; Manual keeps the stored order. */
export function sortRules(rules: RuleItem[], ordering: string, direction: SortDirection): RuleItem[] {
  const factor = direction === 'asc' ? 1 : -1;
  if (ordering === 'name') return [...rules].sort((a, b) => a.name.localeCompare(b.name) * factor);
  if (ordering === 'status') {
    return [...rules].sort((a, b) => ((STATUS_ORDER[a.status] || 99) - (STATUS_ORDER[b.status] || 99)) * factor);
  }
  if (ordering === 'lastRun') {
    // The raw timestamp: the visible label is relative text like "3h ago". Never run sorts as oldest.
    return [...rules].sort(
      (a, b) => ((Date.parse(a.preset.last_run_at) || 0) - (Date.parse(b.preset.last_run_at) || 0)) * factor,
    );
  }
  return rules;
}

/** The dot of "No label", Linear's neutral gray. */
export const NO_LABEL_COLOR = '#95a2b3';
export const NO_LABEL_GROUP_ID = 'no-label';

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
}

/**
 * Every group the grouping has, empty ones included: Group ordering and Show
 * empty groups pick from these. By label, as in Linear, a rule with two labels
 * shows in both groups and a rule without one under "No label", last.
 */
export function ruleGroupsFor(grouping: string, rules: RuleItem[], labels: RuleLabel[]): RuleListGroup[] {
  if (grouping === 'status') {
    return [
      { id: 'status-active', label: 'Active rules', dotColor: 'rgb(52, 211, 153)', rows: rules.filter((rule) => rule.status === 'active') },
      { id: 'status-paused', label: 'Paused rules', dotColor: 'rgb(156, 163, 175)', rows: rules.filter((rule) => rule.status === 'paused') },
    ];
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
      })),
      {
        id: NO_LABEL_GROUP_ID,
        label: 'No label',
        dotColor: NO_LABEL_COLOR,
        rows: rules.filter((rule) => !rule.labelIds.some((id) => known.has(id))),
      },
    ];
  }
  return [];
}
