import type { RuleItem } from '@/store/useAppStore';
import type { RuleAction } from '@/lib/rules';

/** What a rule does, in a word, the same in filters, groups and the details pane. */
export const RULE_ACTION_NAMES: Record<RuleAction, string> = {
  turn_off: 'Turn off',
  turn_on: 'Turn on',
  notify_only: 'Notify',
  increase_budget: 'Budget +',
  decrease_budget: 'Budget −',
};

export const RULE_STATUS_NAMES: Record<string, string> = {
  active: 'Active',
  paused: 'Paused',
  needs_review: 'Needs review',
};

/** A rule the runtime holds back is "Needs review" whatever its switch says: it does not run. */
export function ruleState(rule: Pick<RuleItem, 'status' | 'needsReview'>): string {
  return rule.needsReview ? 'needs_review' : rule.status;
}
