import type { RuleGroup, RuleItem } from '@/store/useAppStore';
import { listViewDefaults, type SortDirection } from '@/ui/listView';
import { useListView } from '@/ui/useListView';

/** The Rules page's view as it starts, and as Reset brings it back (#385). */
export const RULES_VIEW_DEFAULTS = listViewDefaults({
  grouping: 'groups',
  ordering: 'manual',
  direction: 'asc',
  properties: {
    status: true,
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

export const groupDotColor = (iconType: string) => {
  switch (iconType) {
    case 'shield':
      return 'rgb(52, 211, 153)';
    case 'rocket':
      return 'rgb(192, 132, 252)';
    case 'flask':
      return 'rgb(251, 191, 36)';
    default:
      return 'rgb(148, 163, 184)';
  }
};

export interface RuleListGroup {
  id: string;
  label: string;
  dotColor: string;
  rows: RuleItem[];
  /** The rule group a new rule from the header's "+" joins. */
  groupId?: string;
}

/** Every group the grouping has, empty ones included: Group ordering and Show empty groups pick from these. */
export function ruleGroupsFor(grouping: string, rules: RuleItem[], ruleGroups: RuleGroup[]): RuleListGroup[] {
  if (grouping === 'status') {
    return [
      { id: 'status-active', label: 'Active rules', dotColor: 'rgb(52, 211, 153)', rows: rules.filter((rule) => rule.status === 'active') },
      { id: 'status-paused', label: 'Paused rules', dotColor: 'rgb(156, 163, 175)', rows: rules.filter((rule) => rule.status === 'paused') },
    ];
  }
  if (grouping === 'groups') {
    const grouped = new Set(ruleGroups.flatMap((group) => group.ruleIds));
    return [
      ...ruleGroups.map((group) => ({
        id: group.id,
        label: group.name,
        dotColor: groupDotColor(group.icon),
        rows: rules.filter((rule) => rule.groupId === group.id || group.ruleIds.includes(rule.id)),
        groupId: group.id,
      })),
      {
        id: 'ungrouped',
        label: 'Ungrouped rules',
        dotColor: 'rgb(148, 163, 184)',
        rows: rules.filter((rule) => !rule.groupId && !grouped.has(rule.id)),
      },
    ];
  }
  return [];
}
