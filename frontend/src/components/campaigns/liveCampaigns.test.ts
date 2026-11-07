// Maps the hierarchy answers (GET /api/analytics/hierarchy) into the Ads Manager rows.
import { describe, expect, it } from 'vitest';
import { hierarchyAdSetToRow, hierarchyAdToRow, hierarchyCampaignToRow } from './liveCampaigns';

describe('hierarchy parent mapping', () => {
  // Shaped like GET /api/analytics/hierarchy items for parent_id=<account>.
  it('Shaped like GET /api/analytics/hierarchy items for parent_id=<account>', () => {
    const item = (entity_level: any, entity_id: any, parent_entity_id: any) => ({
      entity_id, entity_name: `${entity_id} name`, entity_level, parent_entity_id,
      account_id: 'act_1', currency: 'USD', status: 'ACTIVE', effective_status: 'ACTIVE',
      daily_budget: 0, data_as_of: null, spend: 1, impressions: 0, reach: 0, frequency: 0,
      cpm: 0, clicks: 0, unique_clicks: 0, link_clicks: 0, outbound_clicks: 0,
      landing_page_views: 0, leads: 0, registrations: 0, purchases: 0, cost_per_lead: null,
      cost_per_registration: null, cost_per_purchase: null, cost_per_landing_page_view: null,
      cpc: 0, ctr: 0, cpc_link: null, ctr_link: 0, ctr_outbound: 0,
    });
    const campaigns = [item('campaign', 'cmp_a', 'act_1'), item('campaign', 'cmp_b', 'act_1')].map(hierarchyCampaignToRow);
    const campaignNames = new Map(campaigns.map(c => [c.id, c.name]));
    const adSets = [item('adset', 'set_a1', 'cmp_a'), item('adset', 'set_b1', 'cmp_b')]
      .map(i => hierarchyAdSetToRow(i, campaignNames));
    expect(adSets.map(s => [s.id, s.campaignId, s.campaignName])).toStrictEqual([
      ['set_a1', 'cmp_a', 'cmp_a name'], ['set_b1', 'cmp_b', 'cmp_b name'],
    ]);
    const adSetsById = new Map(adSets.map(s => [s.id, s]));
    const ads = [item('ad', 'ad_x', 'set_a1'), item('ad', 'ad_y', 'set_b1')].map(i => hierarchyAdToRow(i, adSetsById));
    expect(ads.map(a => [a.id, a.adSetId, a.adSetName, a.campaignId, a.campaignName])).toStrictEqual([
      ['ad_x', 'set_a1', 'set_a1 name', 'cmp_a', 'cmp_a name'], ['ad_y', 'set_b1', 'set_b1 name', 'cmp_b', 'cmp_b name'],
    ]);
    // Every row carries its figures as numbers for columns, ordering and filters (#389).
    expect(ads[0].metrics!.spend).toBe(1);
    expect(ads[0].metrics!.cpl).toBe(null);
    expect(ads[0].currency).toBe('USD');
    // A row from an older payload without a figure reads as no figure, not zero.
    const sparse = hierarchyCampaignToRow({ ...item('campaign', 'cmp_c', 'act_1'), impressions: undefined as unknown as number });
    expect(sparse.metrics!.impressions).toBe(null);
  });
});
