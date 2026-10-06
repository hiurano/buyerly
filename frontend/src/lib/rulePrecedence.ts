import type { RuleAction } from './rules';

/**
 * How several rules on one campaign, ad set or ad play out when they all
 * match in the same check (decision #47, #323). Mirrors
 * `RuleEngine.evaluate_all` and the worker's pick:
 * - alerts never compete, each one fires on its own;
 * - of the rules that change the entity only one acts per check: the
 *   strongest action wins, and between equal actions the rule listed first;
 * - a rule of the winning action that waits to repeat hands over to the next
 *   one of the same action, never to a weaker one.
 */
export interface PrecedenceRule {
  id: string;
  name: string;
  action: RuleAction;
}

export type PrecedenceRole = 'wins' | 'next' | 'gives_way' | 'alerts';

export interface PrecedenceLine {
  rule: PrecedenceRule;
  role: PrecedenceRole;
  /** Short reason, in the buyer's words. */
  note: string;
}

/** Strongest first, as in `get_action_priority` of the rule engine. */
const ACTION_STRENGTH: Record<RuleAction, number> = {
  turn_off: 4,
  decrease_budget: 3,
  increase_budget: 2,
  turn_on: 1,
  notify_only: 0,
};

const ACTION_NAMES: Record<RuleAction, string> = {
  turn_off: 'turning off',
  decrease_budget: 'lowering budget',
  increase_budget: 'raising budget',
  turn_on: 'turning on',
  notify_only: 'alerting',
};

/**
 * The rules in the order they are stored on the ad account, already narrowed
 * to the running rules that act on this one entity. Empty when there is
 * nothing to explain: fewer than two rules, or nothing they could fight over.
 */
export function explainRulePrecedence(rules: PrecedenceRule[]): PrecedenceLine[] {
  if (rules.length < 2) return [];
  const changes = rules
    .filter((rule) => rule.action !== 'notify_only')
    // Array.prototype.sort is stable, so equal actions keep the stored order.
    .sort((a, b) => ACTION_STRENGTH[b.action] - ACTION_STRENGTH[a.action]);
  const alerts = rules.filter((rule) => rule.action === 'notify_only');

  const [winner, ...rest] = changes;
  const lines: PrecedenceLine[] = [];
  if (winner) {
    lines.push({
      rule: winner,
      role: 'wins',
      note: rest.length > 0 ? `Acts first: ${ACTION_NAMES[winner.action]}` : 'The only one that changes it',
    });
  }
  let previous = winner;
  for (const rule of rest) {
    if (rule.action === winner.action) {
      lines.push({
        rule,
        role: 'next',
        note: `Acts if "${previous.name}" waits to repeat`,
      });
      previous = rule;
    } else {
      lines.push({
        rule,
        role: 'gives_way',
        note: `Gives way to "${winner.name}": ${ACTION_NAMES[winner.action]} goes first`,
      });
    }
  }
  for (const rule of alerts) {
    lines.push({ rule, role: 'alerts', note: 'Alerts on its own' });
  }
  return lines;
}
