// The Rules pane's quick filters (#383).
import { describe, expect, it } from 'vitest';
import * as facets from './ruleFacets';

describe('rule quick filters', () => {
  // Rules: Status counts a held-back rule as "Needs review", Action and Labels list only what is there; a rule with two labels counts under both (#383).
  it('Rules: Status counts a held-back rule as "Needs review", Action and Labels list only what is there; a rule with two labels counts under both (#383)', () => {
    const rule = (id: any, fields: any = {}) => ({ id, status: 'active', needsReview: false, actionKind: 'turn_off', labelIds: [], ...fields });
    const rules = [
      rule('1'),
      rule('2', { status: 'paused', actionKind: 'notify_only', labelIds: ['g1', 'g2'] }),
      rule('3', { needsReview: true, actionKind: 'increase_budget', labelIds: ['g1'] }),
    ];
    const groups = [{ id: 'g1', name: 'Scaling', color: '#bb87fc' }, { id: 'g2', name: 'Tests', color: '#f2c94c' }, { id: 'g3', name: 'Empty', color: '#95a2b3' }];
    const built = facets.createRuleFacets(rules, groups as never);
    const options = (id: any) => built.find(facet => facet.id === id)!.options.map(option => [option.value, option.label, option.count]);
    expect(built.map(facet => facet.label)).toStrictEqual(['Status', 'Action', 'Labels']);
    expect(options('status')).toStrictEqual([['active', 'Active', 1], ['paused', 'Paused', 1], ['needs_review', 'Needs review', 1]]);
    expect(options('action')).toStrictEqual([['turn_off', 'Turn off', 1], ['notify_only', 'Notify', 1], ['increase_budget', 'Budget +', 1]]);
    expect(options('label')).toStrictEqual([['g1', 'Scaling', 2], ['g2', 'Tests', 1], ['none', 'No labels', 1]]);
    expect(facets.applyRuleQuickFilter(rules, { fieldId: 'label', value: 'g1' }).map(item => item.id)).toStrictEqual(['2', '3']);
    expect(facets.applyRuleQuickFilter(rules, { fieldId: 'status', value: 'active' }).map(item => item.id)).toStrictEqual(['1']);
    expect(facets.applyRuleQuickFilter(rules, null)).toBe(rules);
    expect(facets.parseRuleQuickFilter('{"fieldId":"action","value":"turn_off"}')).toStrictEqual({ fieldId: 'action', value: 'turn_off' });
    expect(facets.parseRuleQuickFilter('{"fieldId":"rules","value":"7"}')).toBe(null);
    expect(facets.parseRuleQuickFilter('broken')).toBe(null);
  });
});
