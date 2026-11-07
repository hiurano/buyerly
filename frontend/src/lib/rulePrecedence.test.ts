// What the rule picker says about several rules on one entity (#323), checked
// against decision #47 as RuleEngine.evaluate_all and the worker implement it.
import { describe, expect, it } from 'vitest';
import { explainRulePrecedence } from './rulePrecedence';
import type { RuleAction } from './rules';

const rule = (id: number, name: string, action: RuleAction) => ({ id: String(id), name, action });
const lines = (rules: ReturnType<typeof rule>[]) =>
  explainRulePrecedence(rules).map((line) => `${line.rule.name} | ${line.role} | ${line.note}`);

describe('rule precedence', () => {
  it('has nothing to say about one rule: nobody to compete with', () => {
    expect(lines([rule(1, 'Stop', 'turn_off')])).toStrictEqual([]);
  });

  // Stored order: a raise first, then an alert, then two cuts. The first cut
  // wins over the raise even though the raise is listed earlier; the second cut
  // takes over while the first one waits to repeat; the alert fires anyway.
  it('lets the first cut win over a raise listed earlier, the second cut take over, and the alert fire', () => {
    expect(
      lines([
        rule(1, 'Scale', 'increase_budget'),
        rule(2, 'Alert', 'notify_only'),
        rule(3, 'Cut', 'decrease_budget'),
        rule(4, 'Cut more', 'decrease_budget'),
      ]),
    ).toStrictEqual([
      'Cut | wins | Acts first: lowering budget',
      'Cut more | next | Acts if "Cut" waits to repeat',
      'Scale | gives_way | Gives way to "Cut": lowering budget goes first',
      'Alert | alerts | Alerts on its own',
    ]);
  });

  it('turns off before every other change', () => {
    expect(lines([rule(1, 'Revive', 'turn_on'), rule(2, 'Stop', 'turn_off')])).toStrictEqual([
      'Stop | wins | Acts first: turning off',
      'Revive | gives_way | Gives way to "Stop": turning off goes first',
    ]);
  });

  it('never makes alerts compete with each other (#296)', () => {
    expect(lines([rule(1, 'Spend alert', 'notify_only'), rule(2, 'CPL alert', 'notify_only')])).toStrictEqual([
      'Spend alert | alerts | Alerts on its own',
      'CPL alert | alerts | Alerts on its own',
    ]);
  });

  it('lets one change next to alerts simply act', () => {
    expect(lines([rule(1, 'Alert', 'notify_only'), rule(2, 'Stop', 'turn_off')])).toStrictEqual([
      'Stop | wins | The only one that changes it',
      'Alert | alerts | Alerts on its own',
    ]);
  });
});
