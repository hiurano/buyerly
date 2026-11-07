import { describe, expect, it } from 'vitest';
import { accountDayEnd, decide, executionKey, type DecisionInput } from '../../src/rules/decide.ts';
import { evaluateAll } from '../../src/rules/engine.ts';


// The rules engine's decision (#611 stage 4). It was proved equal to the
// Python engine's on every capture of its real monitoring cycles before
// Python was removed; these cases pin the behaviours by hand.

const stopRule = { preset_id: 1, workspace_id: 7, name: 'Stop', action: 'turn_off', logic: 'and', conditions: [{ metric: 'spend', operator: 'gte', value: 10, time_window: 'today' }] };
const raise = { preset_id: 2, workspace_id: 7, name: 'Raise', action: 'increase_budget', logic: 'and', budget_change_percent: 25, budget_max_daily: 100, cooldown_minutes: 60, conditions: [{ metric: 'spend', operator: 'gte', value: 1, time_window: 'today' }, { metric: 'leads', operator: 'gte', value: 1, time_window: 'today' }] };

function input(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    cycle_id: 'c1',
    account: { account_id: 'act_1', workspace_id: 7, currency: 'USD', rules_enabled: true, timezone_name: 'HST' },
    now: 1_800_000_000,
    stop_confirmation_minutes: 0,
    critical_interval: 2,
    due_rules: [stopRule],
    entities: [{ entity_level: 'adset', entity_id: 'as_1', entity_name: 'One', adset_id: 'as_1', campaign_id: 'c', status: 'ACTIVE', effective_status: 'ACTIVE', spend: 12, leads: 0, daily_budget: 40 }],
    entity_windows: { as_1: {} },
    undone_actions: {},
    manual_enables: {},
    execution_states: [],
    ...overrides,
  };
}

describe('the decision', () => {
  it('stops at once without a confirmation window', () => {
    const decision = decide(input());
    expect(decision.actions.map((action) => [action.evaluation.entity_id, action.evaluation.action, action.desired_state])).toEqual([['as_1', 'STOP', { status: 'PAUSED' }]]);
    expect(decision.outcomes.map((outcome) => [outcome.rule_id, outcome.state, outcome.acted_at])).toEqual([[1, 'fired', 1_800_000_000]]);
  });

  it('waits out the confirmation window before a stop, then stops', () => {
    const first = decide(input({ stop_confirmation_minutes: 10 }));
    expect(first.actions).toEqual([]);
    expect(first.outcomes[0]).toMatchObject({ state: 'confirming', wait_until: 1_800_000_600 });
    expect(first.events.map((event) => event.event_type)).toEqual(['STOP_CONFIRMATION_STARTED']);
    const states = [...first.states.values()];
    const later = decide(input({ stop_confirmation_minutes: 10, now: 1_800_000_000 + 120, execution_states: states }));
    expect(later.outcomes[0]).toMatchObject({ state: 'confirming', wait_until: 1_800_000_600 });
    let carried = [...later.states.values()];
    let now = 1_800_000_120;
    for (let step = 0; step < 4; step += 1) {
      now += 120;
      const next = decide(input({ stop_confirmation_minutes: 10, now, execution_states: carried }));
      carried = [...next.states.values()];
      if (next.actions.length) {
        expect(now).toBe(1_800_000_600);
        return;
      }
    }
    throw new Error('the stop never confirmed');
  });

  it('raises a budget by the percent, Python float for float, and then cools down', () => {
    const decision = decide(input({ due_rules: [raise], entities: [{ ...input().entities[0], leads: 2, daily_budget: 33.33 }] }));
    expect(decision.actions[0].desired_state).toEqual({ daily_budget: 33.33 * (1 + 25 / 100.0) });
    const again = decide(input({ due_rules: [raise], entities: [{ ...input().entities[0], leads: 2 }], now: 1_800_000_000 + 600, execution_states: [...decision.states.values()] }));
    expect(again.actions).toEqual([]);
    expect(again.outcomes[0]).toMatchObject({ state: 'cooldown', wait_until: 1_800_000_000 + 3600 });
  });

  it('leaves alone what the buyer undid today', () => {
    const decision = decide(input({ undone_actions: { as_1: ['STOP'] } }));
    expect(decision.actions).toEqual([]);
    expect(decision.outcomes[0]).toMatchObject({ state: 'undone', wait_until: accountDayEnd('HST', 1_800_000_000), detail: '' });
  });

  it('keys an execution slot as Python does', () => {
    const [evaluation] = evaluateAll(input().entities[0], { rules_enabled: true, workspace_id: 7, currency: 'USD' }, {}, [stopRule]);
    // hashlib.sha256(b"act_1:as_1:1:STOP").hexdigest()
    expect(executionKey('act_1', evaluation).key).toBe('rule-action:dc235ebe2b3eaac10d16579be81b8dd91d448f6cbf40540ec4fca31eed5caccf');
  });

  it('ends the account day at its next local midnight', () => {
    // 2027-01-15 12:00 UTC is 02:00 in Honolulu (UTC-10): the day ends at 10:00 UTC on the 16th.
    expect(accountDayEnd('HST', Date.UTC(2027, 0, 15, 12) / 1000)).toBe(Date.UTC(2027, 0, 16, 10) / 1000);
    // No zone: UTC.
    expect(accountDayEnd(null, Date.UTC(2027, 0, 15, 12) / 1000)).toBe(Date.UTC(2027, 0, 16) / 1000);
    // Berlin on the night clocks go forward (2027-03-28): midnight still exists, at UTC+1.
    expect(accountDayEnd('Europe/Berlin', Date.UTC(2027, 2, 27, 12) / 1000)).toBe(Date.UTC(2027, 2, 27, 23) / 1000);
  });
});
