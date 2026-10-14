import type { RuleItem, RuleLabel } from '@/store/useAppStore';
import { RULE_ACTION_NAMES, RULE_STATUS_NAMES, ruleState } from './ruleNames';

export { ruleState };

/** The Rules details pane's quick filters (#367): state, what a rule does, its labels (#383). */
export type RuleFacetId = 'status' | 'action' | 'label';
export const RULE_FACET_IDS: RuleFacetId[] = ['status', 'action', 'label'];

/** A rule without labels, as Linear's "No labels". */
export const NO_LABELS = 'none';

export interface RuleQuickFilter {
  fieldId: string;
  value: string;
}

export interface RuleFacet {
  id: RuleFacetId;
  label: string;
  options: { value: string; label: string; count: number }[];
}

/** What a rule holds for a facet: one state, one action, any number of labels. */
export function ruleFacetValues(rule: RuleItem, facet: string): string[] {
  if (facet === 'status') return [ruleState(rule)];
  if (facet === 'action') return [rule.actionKind];
  if (facet === 'label') return rule.labelIds.length ? rule.labelIds : [NO_LABELS];
  return [];
}

/** Each tab's values with how many of `rules` hold them; a value no rule holds is left out. */
export function createRuleFacets(rules: RuleItem[], labels: RuleLabel[]): RuleFacet[] {
  const count = (facet: RuleFacetId, value: string) => rules.filter((rule) => ruleFacetValues(rule, facet).includes(value)).length;
  const listed = (facet: RuleFacetId, values: { value: string; label: string }[]) => values
    .map((option) => ({ ...option, count: count(facet, option.value) }))
    .filter((option) => option.count > 0);
  return [
    {
      id: 'status',
      label: 'Status',
      options: listed('status', Object.entries(RULE_STATUS_NAMES).map(([value, label]) => ({ value, label }))),
    },
    {
      id: 'action',
      label: 'Action',
      options: listed('action', Object.entries(RULE_ACTION_NAMES).map(([value, label]) => ({ value, label }))),
    },
    {
      id: 'label',
      label: 'Labels',
      options: listed('label', [
        ...labels.map((label) => ({ value: label.id, label: label.name })),
        { value: NO_LABELS, label: 'No labels' },
      ]),
    },
  ];
}

export function applyRuleQuickFilter(rules: RuleItem[], quick: RuleQuickFilter | null): RuleItem[] {
  if (!quick) return rules;
  return rules.filter((rule) => ruleFacetValues(rule, quick.fieldId).includes(quick.value));
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
