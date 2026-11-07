// The Rules page's pure view model (#390).
import { describe, expect, it, vi } from 'vitest';
import { createRuleFilterFields } from '@/components/filters/filterCatalogs';
import { applyFilterClauses, filterDateLabel } from '@/components/filters/filterModel';
import { ruleGroupsFor, ruleGroupIds, sortRules, RULES_VIEW_DEFAULTS, RULE_PROPERTIES } from './rulesViewModel';

// The view hook is React's; the model under test only needs its defaults.
vi.mock('@/ui/useListView', () => ({ useListView: () => ({}) }));

const now = Date.now();

const ago = (days: any) => new Date(now - days * 86400000).toISOString();

const rule = (id: any, fields = {}, preset = {}) => ({
  id, presetId: Number(id), identifier: `RUL-${id}`, name: `Rule ${id}`, condition: '', action: '', actionKind: 'turn_off',
  status: 'active', lastRun: '', lastCheck: '', labelIds: [], needsReview: false, reviewReason: '', ...fields,
  preset: {
    level: 'adset', conditions: [{ metric: 'spend', operator: 'gte', value: 4, time_window: 'today' }],
    attached_account_ids: [], attached_scopes: {}, last_run_at: '', last_checked_at: '', created_at: ago(30),
    check_interval_minutes: 5, cooldown_minutes: 1440, ...preset,
  },
});

const rules = [
  rule('1', { labelIds: ['L1'] }, {
    conditions: [{ metric: 'spend', operator: 'gte', value: 4, time_window: 'lifetime' }, { metric: 'leads', operator: 'eq', value: 0, time_window: 'lifetime' }],
    attached_account_ids: ['act_1'], attached_scopes: { act_1: { level: 'account', ids: [] } }, last_run_at: ago(0.2), last_checked_at: ago(0.01), created_at: ago(40),
  }),
  rule('2', { actionKind: 'increase_budget', status: 'paused', labelIds: ['L1', 'L2'] }, {
    level: 'adset', conditions: [{ metric: 'cpl', operator: 'lte', value: 2, time_window: 'last_3d' }],
    attached_account_ids: ['act_1', 'act_2'], attached_scopes: { act_1: { level: 'campaign', ids: ['c'] }, act_2: { level: 'account', ids: [] } },
    last_checked_at: ago(3), created_at: ago(2),
  }),
  rule('3', { actionKind: 'notify_only', needsReview: true }, { level: 'campaign', created_at: ago(10) }),
];

const labels = [{ id: 'L1', name: 'NL launch', color: '#f2994a' }, { id: 'L2', name: 'Scaling', color: '#5e6ad2' }];

const accounts = [{ account_id: 'act_1', name: 'Main' }, { account_id: 'act_2', name: 'Second' }];

const ids = (list: any) => list.map((item: any) => item.id);

// Filters.
const fields = createRuleFilterFields({ rules: rules as never, ruleLabels: labels as never, accounts });

describe('rules view model', () => {
  // Display properties: the issue's list, the short set on at first.
  it('Display properties: the issue\'s list, the short set on at first', () => {
    expect(RULE_PROPERTIES.map((property) => property.label)).toStrictEqual(['Status', 'ID', 'Labels', 'Condition', 'Action', 'Applies to', 'Scope', 'Check', 'Repeat', 'Last check', 'Last action', 'Created']);
    expect(Object.entries(RULES_VIEW_DEFAULTS.properties).filter(([, on]) => on).map(([id]) => id)).toStrictEqual(['status', 'labels', 'condition', 'action', 'scope', 'lastCheck', 'lastRun']);
  });

  // Filters.
  it('Filters', () => {
    expect(fields.map((field) => field.label)).toStrictEqual(['Status', 'Labels', 'Action', 'Applies to', 'Metric', 'Window', 'Ad account', 'Scope', 'Name', 'Last action', 'Last check', 'Created date']);
    const by = (fieldId: any, operator: any, values: any) => ids(applyFilterClauses(rules as never, fields, [{ fieldId, operator, values }]));
    expect(by('status', 'is', ['needs_review']), 'a rule held back is "Needs review", not active').toStrictEqual(['3']);
    expect(by('status', 'is', ['active'])).toStrictEqual(['1']);
    expect(by('action', 'is', ['increase_budget'])).toStrictEqual(['2']);
    expect(by('level', 'is', ['campaign'])).toStrictEqual(['3']);
    expect(by('metric', 'includes_any', ['leads', 'cpl'])).toStrictEqual(['1', '2']);
    expect(by('metric', 'includes_all', ['spend', 'leads'])).toStrictEqual(['1']);
    expect(by('window', 'includes_any', ['lifetime'])).toStrictEqual(['1']);
    expect(by('account', 'includes_any', ['act_2'])).toStrictEqual(['2']);
    expect(by('account', 'includes_any', ['none']), 'Not attached').toStrictEqual(['3']);
    expect(by('scope', 'includes_any', ['campaign'])).toStrictEqual(['2']);
    expect(by('name', 'contains', ['rul-3']), 'the name or RUL- id').toStrictEqual(['3']);
    expect(by('lastRun', 'is', ['never']), 'Last action is Never').toStrictEqual(['2', '3']);
    expect(by('lastRun', 'after', ['-P1D'])).toStrictEqual(['1']);
    expect(by('lastCheck', 'after', ['-P1W'])).toStrictEqual(['1', '2']);
    expect(by('lastCheck', 'is', ['never'])).toStrictEqual(['3']);
    expect(by('created', 'after', ['-P1W'])).toStrictEqual(['2']);
    expect(filterDateLabel('never')).toBe('Never');
    expect(fields.find((field) => field.id === 'lastRun')!.allowNever && !fields.find((field) => field.id === 'created')!.allowNever).toBeTruthy();
  });

  // Groupings: a rule on two accounts or with two labels sits in both groups.
  it('Groupings: a rule on two accounts or with two labels sits in both groups', () => {
    const groups = (grouping: any) => ruleGroupsFor(grouping, rules as never, labels as never, accounts).map((group) => [group.label, ids(group.rows)]);
    expect(groups('labels')).toStrictEqual([['NL launch', ['1', '2']], ['Scaling', ['2']], ['No label', ['3']]]);
    expect(groups('status')).toStrictEqual([['Active rules', ['1']], ['Paused rules', ['2']], ['Needs review', ['3']]]);
    expect(groups('action')).toStrictEqual([['Turn off', ['1']], ['Turn on', []], ['Notify', ['3']], ['Budget +', ['2']], ['Budget −', []]]);
    expect(groups('level')).toStrictEqual([['Campaign', ['3']], ['Ad set', ['1', '2']], ['Ad', []]]);
    expect(groups('account')).toStrictEqual([['Main', ['1', '2']], ['Second', ['2']], ['Not attached', ['3']]]);
    expect(ruleGroupIds('account', rules[1] as never, labels as never, accounts)).toStrictEqual(['account-act_1', 'account-act_2']);
    // Only label and status columns take a dropped card on the board.
    expect(ruleGroupsFor('labels', rules as never, labels as never, accounts).map((group) => group.drop)).toStrictEqual([{ kind: 'label', labelId: 'L1' }, { kind: 'label', labelId: 'L2' }, { kind: 'label', labelId: null }]);
    expect(ruleGroupsFor('status', rules as never, labels as never, accounts).map((group) => group.drop)).toStrictEqual([{ kind: 'status', enabled: true }, { kind: 'status', enabled: false }, undefined]);
    expect(ruleGroupsFor('action', rules as never, labels as never, accounts).every((group) => !group.drop)).toBeTruthy();
  });

  // Orderings, never-run last when newest first.
  it('Orderings, never-run last when newest first', () => {
    expect(ids(sortRules(rules as never, 'lastCheck', 'desc'))).toStrictEqual(['1', '2', '3']);
    expect(ids(sortRules(rules as never, 'created', 'desc'))).toStrictEqual(['2', '3', '1']);
    expect(ids(sortRules(rules as never, 'status', 'asc'))).toStrictEqual(['1', '2', '3']);
    expect(ids(sortRules(rules as never, 'manual', 'asc'))).toStrictEqual(['1', '2', '3']);
    console.log('Rules view model passed');
  });
});
