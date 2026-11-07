// Campaign filter semantics.
import { describe, expect, it } from 'vitest';
import { applyFilterClauses } from '@/components/filters/filterModel';
import { readMetrics, metricsFor, readAdsManagerPeriod } from './adsManagerMetrics';
import { createLiveFields, filterView, groupView, deliveryStatus, migrateAdsManagerClauses } from './campaignViewModel';

const rows = [
  { id: 'A', name: 'A', status: 'active', accountId: 'account-1' },
  { id: 'B', name: 'B', status: 'paused', accountId: 'account-1' },
  { id: 'C', name: 'C', status: 'active', accountId: 'account-1' },
  { id: 'D', name: 'D', status: 'paused', accountId: 'account-1' },
];

const account = { account_id: 'account-1', active_rules: [
  { preset_id: 1, name: 'Bug', scope: { level: 'campaign', ids: ['A', 'B'] } },
  { preset_id: 2, name: 'Feature', scope: { level: 'campaign', ids: ['B', 'C'] } },
] };

const clause = (operator: any, values: any) => ({ fieldId: 'rule', operator, values });

const ids = (items: any) => items.map((row: any) => row.id);

describe('campaign filter semantics', () => {
  // Account groups are gone: ad accounts belong to teams. No field offers them.
  it('Account groups are gone: ad accounts belong to teams. No field offers them', () => {
    const fields = createLiveFields(rows, [account as never], 'campaigns', []);
    const view = filterView(rows, fields, [clause('includes_all', ['1'])], { fieldId: 'rule', value: '2' });
    expect(ids(view.baseRows)).toStrictEqual(['A', 'B']);
    expect(ids(view.visibleRows)).toStrictEqual(['B']);
    expect(view.facets.find(f => f.id === 'rule')!.options.map(o => [o.value, o.count])).toStrictEqual([['1', 2], ['2', 1]]);
    for (const [operator, expected] of [
      ['includes_all', ['B']], ['includes_any', ['A', 'B', 'C']],
      ['excludes_any', ['D']], ['excludes_all', ['A', 'C', 'D']],
    ]) expect(ids(applyFilterClauses(rows, fields, [clause(operator, ['1', '2'])]))).toStrictEqual(expected);
    expect(groupView(view.baseRows, fields, 'status').map(g => ids(g.rows))).toStrictEqual([['A'], ['B']]);
    const unknownRows = [{ id: 'unknown', name: 'Unknown', status: 'unknown', accountId: 'account-1' }];
    const unknownFields = createLiveFields(unknownRows, [account as never], 'campaigns', []);
    expect(groupView(unknownRows, unknownFields, 'status').flatMap(g => ids(g.rows))).toStrictEqual(['unknown']);
    expect(filterView(rows, fields, [clause('is', ['missing'])], null).facets.every(f => f.options.length === 0)).toBe(true);
    expect(ids(filterView(rows, fields, [], { fieldId: 'rule', value: 'no-rule' }).visibleRows)).toStrictEqual(['D']);
    expect(fields.some(f => f.id === 'group')).toBe(false);
    expect(fields.find(f => f.id === 'status')!.label).toBe('Status');
    // Explicit ad-set scope must not promote itself to a campaign.
    const scoped = { account_id: 'a', active_rules: [{ preset_id: 3, name: 'Scoped', scope: { level: 'adset', ids: ['S'] } }] };
    const inA = (row: any) => ({ ...row, accountId: 'a' });
    expect(createLiveFields(rows.map(inA), [scoped as never], 'campaigns', []).find(f => f.id === 'rule')!.getValue(inA(rows[0]))).toStrictEqual(['no-rule']);
    const ad = { id: 'AD', name: 'Ad', status: 'active', adSetId: 'S', accountId: 'a' };
    expect(createLiveFields([ad], [scoped as never], 'ads', [{ id: 'S', campaignId: 'A' }]).find(f => f.id === 'rule')!.getValue(ad)).toStrictEqual(['3']);
    // Several ad accounts at once, as Linear's team Issues lists every project's issues:
    // each row reads the rules and groups of its own account; Ad account filters and groups, A→Z.
    const zulu = { account_id: 'act_2', name: 'Zulu', active_rules: [{ preset_id: 9, name: 'Stop loss', scope: { level: 'account', ids: [] } }] };
    const alpha = { account_id: 'act_1', name: 'Alpha', custom_name: '', active_rules: [] };
    const mixed = [
      { id: 'z1', name: 'Z one', status: 'active', accountId: 'act_2' },
      { id: 'a1', name: 'A one', status: 'active', accountId: 'act_1' },
      { id: 'z2', name: 'Z two', status: 'paused', accountId: 'act_2' },
    ];
    const mixedFields = createLiveFields(mixed, [zulu as never, alpha as never], 'campaigns', []);
    const accountOptions = mixedFields.find(f => f.id === 'account')!.options;
    expect(accountOptions!.map(o => [o.value, o.label, o.count])).toStrictEqual([['act_1', 'Alpha', 1], ['act_2', 'Zulu', 2]]);
    expect(groupView(mixed, mixedFields, 'account').map(g => [g.label, ids(g.rows)])).toStrictEqual([['Alpha', ['a1']], ['Zulu', ['z1', 'z2']]]);
    expect(ids(applyFilterClauses(mixed, mixedFields, [{ fieldId: 'account', operator: 'is', values: ['act_2'] }]))).toStrictEqual(['z1', 'z2']);
    expect(mixedFields.find(f => f.id === 'rule')!.getValue(mixed[0]), 'Zulu\'s account-wide rule reaches its rows').toStrictEqual(['9']);
    expect(mixedFields.find(f => f.id === 'rule')!.getValue(mixed[1]), 'and not Alpha\'s').toStrictEqual(['no-rule']);
    // Status is where delivery really stands (Meta's effective_status), not the switch (#367).
    for (const [effectiveStatus, expected] of [
      ['ACTIVE', 'active'], ['PAUSED', 'paused'], ['CAMPAIGN_PAUSED', 'paused'], ['ADSET_PAUSED', 'paused'],
      ['PENDING_REVIEW', 'in_review'], ['IN_PROCESS', 'in_review'], ['PREAPPROVED', 'in_review'],
      ['DISAPPROVED', 'disapproved'], ['WITH_ISSUES', 'with_issues'], ['PENDING_BILLING_INFO', 'with_issues'],
      ['ARCHIVED', 'archived'], ['DELETED', 'archived'], ['SOMETHING_NEW', 'unknown'],
    ]) expect(deliveryStatus({ status: 'active', effectiveStatus }), effectiveStatus).toBe(expected);
    expect(deliveryStatus({ status: 'paused' }), 'without effective_status the switch decides').toBe('paused');
    const delivered = [
      { id: 'on', name: 'On', status: 'active', effectiveStatus: 'ACTIVE' },
      { id: 'rejected', name: 'Rejected', status: 'active', effectiveStatus: 'DISAPPROVED' },
      { id: 'parent-off', name: 'Parent off', status: 'active', effectiveStatus: 'CAMPAIGN_PAUSED' },
    ];
    const deliveredFields = createLiveFields(delivered, [account as never], 'adsets', []);
    const statusFacet = filterView(delivered, deliveredFields, [], null).facets.find(f => f.id === 'status');
    expect(statusFacet!.options.map(o => [o.value, o.count])).toStrictEqual([['active', 1], ['paused', 1], ['disapproved', 1]]);
    expect(ids(filterView(delivered, deliveredFields, [], { fieldId: 'status', value: 'disapproved' }).visibleRows)).toStrictEqual(['rejected']);
    // A shared link's old "Status is Paused" still finds what is not delivering because it is paused.
    expect(ids(applyFilterClauses(delivered, deliveredFields, [{ fieldId: 'status', operator: 'is', values: ['paused'] }]))).toStrictEqual(['parent-off']);
  });

  // Every figure of the period filters as a number (#389); a row without one never matches.
  it('Every figure of the period filters as a number (#389); a row without one never matches', () => {
    const measured = [
      { id: 'cheap', name: 'Cheap leads', status: 'active', campaignId: 'C1', metrics: readMetrics({ spend: 30, leads: 6, cost_per_lead: 5, daily_budget: 50, ctr: 1.5 }) },
      { id: 'dear', name: 'Dear leads', status: 'active', campaignId: 'C1', metrics: readMetrics({ spend: 40, leads: 2, cost_per_lead: 20, daily_budget: 0, ctr: 0.4 }) },
      { id: 'none', name: 'No leads', status: 'paused', campaignId: 'C2', metrics: readMetrics({ spend: 12, leads: 0, cost_per_lead: null }) },
    ];
    expect(measured[1].metrics.budget, 'no budget of its own is no budget, not zero').toBe(null);
    const measuredFields = createLiveFields(measured, [account as never], 'adsets', [], [{ id: 'C1', name: 'Leads NL' }, { id: 'C2', name: 'Zeta' }, { id: 'C3', name: 'Empty' }]);
    const metric = (fieldId: any, operator: any, value: any) => ids(applyFilterClauses(measured, measuredFields, [{ fieldId, operator, values: [value] }]));
    expect(metric('cpl', 'lt', 10)).toStrictEqual(['cheap']);
    expect(metric('cpl', 'gte', 5), 'no CPL is not a CPL of 0').toStrictEqual(['cheap', 'dear']);
    expect(metric('leads', 'gt', 0)).toStrictEqual(['cheap', 'dear']);
    expect(metric('budget', 'gt', 0)).toStrictEqual(['cheap']);
    expect(metric('ctr', 'gte', 1)).toStrictEqual(['cheap']);
    expect(measuredFields.filter(f => f.section === 'metrics').map(f => f.id).join(',')).toBe('budget,spend,impressions,cpm,clicks,ctr,cpc,leads,cpl,registrations,cpreg,purchases,cpp');
    expect(createLiveFields(measured, [account as never], 'ads', [], []).some(f => f.id === 'budget'), 'ads have no budget').toBe(false);
    expect(metricsFor('ads').some(m => m.id === 'budget')).toBe(false);
    // Ad sets and ads filter and group by their campaign; only campaigns with rows are offered, A→Z.
    const campaignField = measuredFields.find(f => f.id === 'campaign');
    expect(campaignField!.options!.map(o => [o.label, o.count])).toStrictEqual([['Leads NL', 2], ['Zeta', 1]]);
    expect(groupView(measured, measuredFields, 'campaign').map(g => [g.label, ids(g.rows)])).toStrictEqual([['Leads NL', ['cheap', 'dear']], ['Zeta', ['none']]]);
    expect(createLiveFields(measured, [account as never], 'campaigns', []).some(f => f.id === 'campaign')).toBe(false);
    // An ad finds its campaign through its ad set; ads also filter by ad set.
    const adRows = [{ id: 'ad1', name: 'Ad one', status: 'active', adSetId: 'S1' }, { id: 'ad2', name: 'Ad two', status: 'active', adSetId: 'S2' }];
    const adFields = createLiveFields(adRows, [account as never], 'ads', [{ id: 'S1', campaignId: 'C1', name: 'Set one' }, { id: 'S2', campaignId: 'C2', name: 'Set two' }], [{ id: 'C1', name: 'Leads NL' }, { id: 'C2', name: 'Zeta' }]);
    expect(ids(applyFilterClauses(adRows, adFields, [{ fieldId: 'campaign', operator: 'is', values: ['C2'] }]))).toStrictEqual(['ad2']);
    expect(ids(applyFilterClauses(adRows, adFields, [{ fieldId: 'adSet', operator: 'is_not', values: ['S2'] }]))).toStrictEqual(['ad1']);
    // Name contains matches the name or the Meta ID.
    expect(ids(applyFilterClauses(measured, measuredFields, [{ fieldId: 'name', operator: 'contains', values: ['LEADS'] }]))).toStrictEqual(['cheap', 'dear', 'none']);
    expect(ids(applyFilterClauses(measured, measuredFields, [{ fieldId: 'name', operator: 'contains', values: ['dear'] }]))).toStrictEqual(['dear']);
    // Links from before #389: Results was leads and CPA was CPL.
    expect(migrateAdsManagerClauses([{ fieldId: 'results', operator: 'gt', values: [1] }, { fieldId: 'cpa', operator: 'lt', values: [9] }])).toStrictEqual([{ fieldId: 'leads', operator: 'gt', values: [1] }, { fieldId: 'cpl', operator: 'lt', values: [9] }]);
    expect(migrateAdsManagerClauses([{ fieldId: 'cpa', operator: 'lt', values: [9] }, { fieldId: 'cpl', operator: 'lt', values: [5] }]), 'a newer CPL clause wins over the old CPA one').toStrictEqual([{ fieldId: 'cpl', operator: 'lt', values: [5] }]);
    // Account groups are gone; a saved filter by them is dropped rather than left unseen.
    expect(migrateAdsManagerClauses([{ fieldId: 'group', operator: 'includes_all', values: ['4'] }, { fieldId: 'name', operator: 'contains', values: ['x'] }])).toStrictEqual([{ fieldId: 'name', operator: 'contains', values: ['x'] }]);
    // The period comes from the address; anything unknown is today.
    expect(readAdsManagerPeriod('last_7d')).toBe('last_7d');
    expect(readAdsManagerPeriod('lifetime')).toBe('today');
    expect(readAdsManagerPeriod('')).toBe('today');
    console.log('Campaign filter semantics passed');
  });
});
