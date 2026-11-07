// The rule window's pure model (#387).
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  emptyDraft, draftProblems, draftToPayload, autoRuleName, describeDraft, draftFromPreset,
  draftAttachments, sameRunOn, withLevel, readStoredDraft, writeStoredDraft, availableActions, conditionProblem,
} from './ruleDraft';

// Storage stands in for the browser's.
const store = new Map<string, string>();
beforeAll(() => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (store.has(key) ? store.get(key) : null),
    setItem: (key: string, value: unknown) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
  });
});

const accounts = [{ account_id: 'act_1', name: 'Main', currency: 'USD' }, { account_id: 'act_2', name: 'Second', currency: 'USD' }];

const nl = {
  ...emptyDraft(),
  conditions: [
    { metric: 'spend', operator: 'gte', value: '4' },
    { metric: 'leads', operator: 'eq', value: '0' },
  ],
  timeWindow: 'lifetime',
};

// Budget actions need a percent and, to raise, a ceiling; only ad sets take them.
const raise = { ...nl, action: 'increase_budget', budgetMax: '' };

describe('rule window model', () => {
  // A value is checked in its own chip.
  it('A value is checked in its own chip', () => {
    expect(conditionProblem({ metric: 'spend', operator: 'gte', value: '' })).toBe('Enter a value for Spend');
    expect(conditionProblem({ metric: 'leads', operator: 'eq', value: '1.5' })).toBe('Leads is a whole number');
    expect(conditionProblem({ metric: 'cpl', operator: 'gt', value: '-1' })).toBe('CPL needs a number of 0 or more');
    expect(conditionProblem({ metric: 'ctr', operator: 'lt', value: '0.8' })).toBe(null);
    expect(draftProblems(emptyDraft())).toStrictEqual(['Enter a value for Spend']);
    expect(draftToPayload(emptyDraft(), []), 'nothing is sent while a value is missing').toBe(null);
  });

  // Budget actions need a percent and, to raise, a ceiling; only ad sets take them.
  it('Budget actions need a percent and, to raise, a ceiling; only ad sets take them', () => {
    expect(draftProblems(raise as never)).toStrictEqual(['Set the daily ceiling']);
    expect(draftProblems({ ...raise, budgetMax: '300', budgetPercent: '0' } as never)).toStrictEqual(['Change the budget by 1–100%']);
    expect(availableActions('campaign')).toStrictEqual(['turn_off', 'turn_on', 'notify_only']);
    expect(withLevel(raise as never, 'campaign').action, 'a campaign cannot take a budget action').toBe('turn_off');
    expect(withLevel(nl as never, 'ad').action).toBe('turn_off');
  });

  // The name is optional: left empty, it is made from the rule.
  it('The name is optional: left empty, it is made from the rule', () => {
    expect(autoRuleName(nl as never)).toBe('Spend ≥ 4 & Leads = 0 → Turn off');
    expect(autoRuleName({ ...nl, logic: 'or', action: 'notify_only' } as never)).toBe('Spend ≥ 4 or Leads = 0 → Notify');
    const payload = draftToPayload({ ...nl, labelIds: ['3', 'gone'] } as never, ['3']);
    expect(payload!.name).toBe('Spend ≥ 4 & Leads = 0 → Turn off');
    expect(payload!.label_ids, 'only labels that exist').toStrictEqual([3]);
    expect(payload!.conditions).toStrictEqual([
      { metric: 'spend', operator: 'gte', value: 4, time_window: 'lifetime' },
      { metric: 'leads', operator: 'eq', value: 0, time_window: 'lifetime' },
    ]);
    expect(payload!.budget_change_percent, 'no budget fields on a non-budget action').toBe(0);
    expect(draftToPayload({ ...nl, name: '  $4 and no lead ' } as never, [])!.name).toBe('$4 and no lead');
    const raised = draftToPayload({ ...raise, budgetMax: '300' } as never, []);
    expect([raised!.budget_change_percent, raised!.budget_max_daily]).toStrictEqual([20, 300]);
  });

  // The sentence under the chips: what, how often, when and where.
  it('The sentence under the chips: what, how often, when and where', () => {
    expect(describeDraft(nl as never, accounts)).toBe('Checks each ad set every 5 min and turns it off when spend ≥ $4 and leads = 0 (lifetime). '
      + 'Acts on the same ad set at most once a day. Runs nowhere until you pick where.');
    expect(describeDraft({ ...nl, runOn: { act_1: { level: 'account', ids: [] } } } as never, accounts)).toMatch(/Runs on Main\.$/);
    expect(describeDraft({ ...nl, runOn: { act_1: { level: 'campaign', ids: ['c1', 'c2'] } } } as never, accounts)).toMatch(/Runs on 2 campaigns in Main\.$/);
    expect(describeDraft({ ...nl, runOn: { act_1: { level: 'account', ids: [] }, act_2: { level: 'account', ids: [] } } } as never, accounts)).toMatch(/Runs on 2 ad accounts\.$/);
    expect(describeDraft({ ...raise, budgetMax: '300', checkInterval: 60 } as never, accounts)).toMatch(/every hour and raises its daily budget by 20% up to \$300 a day/);
    expect(describeDraft({ ...nl, conditions: [{ metric: 'ctr', operator: 'lt', value: '0.8' }] } as never, accounts)).toMatch(/when CTR < 0\.8%/);
    // Mixed currencies: no unit is claimed.
    expect(describeDraft(nl as never, [...accounts, { account_id: 'act_3', name: 'Euro', currency: 'EUR' }])).toMatch(/spend ≥ 4 and/);
  });

  // Where it runs: created in one write; an edit sends it only when it changed.
  it('Where it runs: created in one write; an edit sends it only when it changed', () => {
    expect(draftAttachments({ ...nl, runOn: { act_1: { level: 'campaign', ids: ['c1'] } } } as never)).toStrictEqual([{ account_id: 'act_1', scope: { level: 'campaign', ids: ['c1'] } }]);
    expect(sameRunOn({ a: { level: 'campaign', ids: ['1', '2'] } }, { a: { level: 'campaign', ids: ['2', '1'] } })).toBe(true);
    expect(sameRunOn({ a: { level: 'account', ids: [] } }, {})).toBe(false);
  });

  // A saved rule round-trips every field, where it runs included.
  it('A saved rule round-trips every field, where it runs included', () => {
    const preset = {
      id: 7, name: 'Cap', action: 'increase_budget', level: 'adset', enabled: true,
      conditions: [{ metric: 'cpl', operator: 'lte', value: 2.5, time_window: 'last_3d' }],
      condition_logic: 'or', cooldown_minutes: 360, check_interval_minutes: 15,
      budget_change_percent: 15, budget_max_daily: 250, attached_account_ids: ['act_2'],
      attached_scopes: { act_2: { level: 'adset', ids: ['s1'] } },
    };
    const loaded = draftFromPreset(preset as never, ['4']);
    expect([loaded.timeWindow, loaded.logic, loaded.repeatMinutes, loaded.checkInterval, loaded.budgetPercent, loaded.budgetMax, loaded.labelIds]).toStrictEqual(['last_3d', 'or', 360, 15, '15', '250', ['4']]);
    expect(loaded.runOn).toStrictEqual({ act_2: { level: 'adset', ids: ['s1'] } });
    expect(draftToPayload(loaded, ['4'])!.conditions[0].value).toBe(2.5);
  });

  // An unsaved draft comes back; an empty one or a broken one does not.
  it('An unsaved draft comes back; an empty one or a broken one does not', () => {
    writeStoredDraft('k', nl as never);
    expect(readStoredDraft('k')).toStrictEqual(nl);
    writeStoredDraft('k', emptyDraft());
    expect(readStoredDraft('k'), 'an empty window keeps no draft').toBe(null);
    store.set('k', JSON.stringify({ ...nl, level: 'account' }));
    expect(readStoredDraft('k'), 'a malformed draft is ignored').toBe(null);
    store.set('k', '{not json');
    expect(readStoredDraft('k')).toBe(null);
    writeStoredDraft('k', null);
    expect(store.has('k')).toBe(false);
  });
});
