import type { RuleGroup, RuleItem } from '@/store/useAppStore';
import type { RuleAction } from '@/lib/rules';

/** The Rules details pane's quick filters (#367): state, what a rule does, its group. */
export type RuleFacetId = 'status' | 'action' | 'group';
export const RULE_FACET_IDS: RuleFacetId[] = ['status', 'action', 'group'];

export interface RuleQuickFilter {
  fieldId: string;
  value: string;
}

export interface RuleFacet {
  id: RuleFacetId;
  label: string;
  options: { value: string; label: string; count: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  paused: 'Paused',
  needs_review: 'Needs review',
};

const ACTION_LABELS: Record<RuleAction, string> = {
  turn_off: 'Pause',
  turn_on: 'Resume',
  increase_budget: 'Increase budget',
  decrease_budget: 'Decrease budget',
  notify_only: 'Notify',
};

/** A rule the runtime holds back is "Needs review" whatever its switch says: it does not run. */
export function ruleState(rule: Pick<RuleItem, 'status' | 'needsReview'>): string {
  return rule.needsReview ? 'needs_review' : rule.status;
}

export function ruleFacetValue(rule: RuleItem, facet: string): string | null {
  if (facet === 'status') return ruleState(rule);
  if (facet === 'action') return rule.actionKind;
  if (facet === 'group') return rule.groupId ?? 'ungrouped';
  return null;
}

/** Each tab's values with how many of `rules` hold them; a value no rule holds is left out. */
export function createRuleFacets(rules: RuleItem[], groups: RuleGroup[]): RuleFacet[] {
  const count = (facet: RuleFacetId, value: string) => rules.filter((rule) => ruleFacetValue(rule, facet) === value).length;
  const listed = (facet: RuleFacetId, values: { value: string; label: string }[]) => values
    .map((option) => ({ ...option, count: count(facet, option.value) }))
    .filter((option) => option.count > 0);
  return [
    {
      id: 'status',
      label: 'Status',
      options: listed('status', Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))),
    },
    {
      id: 'action',
      label: 'Action',
      options: listed('action', Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))),
    },
    {
      id: 'group',
      label: 'Groups',
      options: listed('group', [
        ...groups.map((group) => ({ value: group.id, label: group.name })),
        { value: 'ungrouped', label: 'Ungrouped' },
      ]),
    },
  ];
}

export function applyRuleQuickFilter(rules: RuleItem[], quick: RuleQuickFilter | null): RuleItem[] {
  if (!quick) return rules;
  return rules.filter((rule) => ruleFacetValue(rule, quick.fieldId) === quick.value);
}

/** The pane's filter as this browser tab left it; only one the pane can show. */
export function parseRuleQuickFilter(raw: string | null): RuleQuickFilter | null {
  try {
    const saved = JSON.parse(raw ?? 'null');
    if (saved && RULE_FACET_IDS.includes(saved.fieldId) && typeof saved.value === 'string') {
      return { fieldId: saved.fieldId, value: saved.value };
    }
  } catch { /* Storage is optional. */ }
  return null;
}
