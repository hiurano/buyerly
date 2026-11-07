// The cases client.test.ts runs through src/meta/ and compares with the
// answers recorded in test/fixtures/meta-client-answers.json (#685).

export type Scripted = { status: number; headers?: Record<string, string>; body: string } | { network_error: string };

interface Call {
  fn: string;
  args?: Record<string, unknown>;
}

export interface ClientCase {
  kind: 'client';
  name?: string;
  now?: number;
  options?: {
    graph_version?: string;
    base_url?: string;
    app_secret?: string;
    automation?: {
      inventory_cache_minutes?: number;
      adaptive_polling_enabled?: boolean;
      usage_soft_limit_percent?: number;
      usage_hard_limit_percent?: number;
      usage_ttl_minutes?: number;
    };
  };
  responses?: Scripted[];
  calls: Call[];
}

export interface OAuthCase {
  kind: 'oauth';
  name?: string;
  options: { app_id: string; app_secret: string; redirect_uri: string; graph_version: string; login_config_id: string };
  responses?: Scripted[];
  calls: Call[];
}

export interface FnCase {
  kind: 'fn';
  fn: string;
  args: unknown[];
}

export type Case = ClientCase | OAuthCase | FnCase;
export type Answer = Record<string, unknown>;

const ok = (body: unknown, headers: Record<string, string> = {}): Scripted => ({ status: 200, headers, body: JSON.stringify(body) });
const fail = (status: number, body: unknown, headers: Record<string, string> = {}): Scripted => ({
  status,
  headers,
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const metaError = (status: number, error: Record<string, unknown>): Scripted => fail(status, { error });
const page = (data: unknown[], after?: string): Scripted =>
  ok(after ? { data, paging: { cursors: { before: 'b', after }, next: `https://graph.facebook.com/v26.0/next?access_token=SECRET&after=${after}` } } : { data });

const T = 'EAAB-test-token';
const ACC = 'act_1000000000000001';
const SECRET = { app_secret: 'app-secret-for-tests' };

const client = (name: string, calls: Call[], responses: Scripted[] = [], extra: Partial<ClientCase> = {}): ClientCase => ({
  kind: 'client',
  name,
  options: SECRET,
  responses,
  calls,
  ...extra,
});

const ADSETS = [
  { id: '11', name: 'Broad', campaign_id: '1', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '15000' },
  { id: '12', name: 'Paused', campaign_id: '1', status: 'PAUSED', effective_status: 'CAMPAIGN_PAUSED', daily_budget: '5000' },
  { id: '13', name: 'Dead', campaign_id: '2', status: 'ARCHIVED', effective_status: 'ARCHIVED' },
  { id: '14', name: 'Archived with spend', campaign_id: '2', status: 'ARCHIVED', effective_status: 'ARCHIVED' },
];
const ADSET_INSIGHTS = [
  {
    campaign_id: '1', adset_id: '11', adset_name: 'Broad', spend: '12.34', impressions: '1000', clicks: '40', inline_link_clicks: '30',
    cpc: '0.3085', ctr: '4.005', actions: [
      { action_type: 'lead', value: '3' }, { action_type: 'offsite_conversion.fb_pixel_lead', value: '3' },
      { action_type: 'landing_page_view', value: '20' }, { action_type: 'purchase', value: '1' },
    ],
  },
  { campaign_id: '2', adset_id: '14', adset_name: 'Archived with spend', spend: '1.5', impressions: '20', clicks: '0' },
  { campaign_id: '3', adset_id: '99', adset_name: 'Gone', spend: '2.125', impressions: '50', clicks: '1', cpc: '2.125', ctr: '2.0' },
  { campaign_id: '3', adset_id: '98', spend: '0', impressions: '0' },
  { campaign_id: '3', adset_id: 77, spend: '1', impressions: '5' },
];

const ENTITIES = {
  campaigns: [
    { id: '1', name: 'Leads', status: 'ACTIVE', effective_status: 'ACTIVE' },
    { id: '2', name: 'CBO', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '30000' },
    { id: '', name: 'No id' },
  ],
  adsets: ADSETS.slice(0, 3),
  ads: [
    { id: '101', name: 'Video', campaign_id: '1', adset_id: '11', status: 'ACTIVE', effective_status: 'ACTIVE' },
    { id: '102', campaign_id: '1', adset_id: '12', status: 'ACTIVE' },
    { id: '103', name: 'Dead ad', campaign_id: '2', adset_id: '13', status: 'ARCHIVED', effective_status: 'ARCHIVED' },
  ],
};
const metricRow = (extra: Record<string, unknown>) => ({
  spend: '10', impressions: '500', reach: '400', frequency: '', cpm: '0', clicks: '25', unique_clicks: '20', inline_link_clicks: '15',
  outbound_clicks: [{ action_type: 'outbound_click', value: '12' }],
  actions: [{ action_type: 'custom:form_submitted', value: '2' }, { action_type: 'offsite_conversion.custom.555', value: '4' }],
  ...extra,
});

export function scenarios(): ClientCase[] {
  return [
    {
      kind: 'client', name: 'bad graph version', options: { graph_version: 'latest' }, calls: [],
    },
    client('account info, legacy zone, proof', [{ fn: 'get_account_info', args: { account_id: '1000000000000001', access_token: T } }], [
      ok({ id: ACC, name: 'Hawaii', timezone_name: ' US/Hawaii ', currency: 'usd', account_status: 3, disable_reason: 0 }),
    ]),
    client('account info without secret, odd status', [
      { fn: 'get_account_info', args: { account_id: ACC, access_token: 'tok en/+&=' } },
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
    ], [
      ok({ id: ACC, account_status: 42 }),
      ok({ id: ACC, account_status: '1', currency: 'EURO', timezone_name: null }),
      ok({ id: ACC, account_status: null, currency: 7 }),
      ok({ id: ACC, account_status: true, currency: 'jpy', timezone_name: 'Canada/Pacific' }),
    ], { options: {} }),
    client('summary: empty, one row, two rows, range', [
      { fn: 'get_account_insights_summary', args: { account_id: ACC, access_token: T } },
      { fn: 'get_account_insights_summary', args: { account_id: '5', access_token: T, date_preset: 'yesterday' } },
      { fn: 'get_account_insights_summary', args: { account_id: ACC, access_token: T } },
      { fn: 'get_account_insights_summary', args: { account_id: ACC, access_token: T, since: '2026-11-05', until: '2026-11-06' } },
    ], [
      ok({ data: [] }),
      ok({ data: [metricRow({})] }),
      ok({ data: [metricRow({}), metricRow({ spend: '2' })] }),
      ok({ data: [metricRow({ frequency: '1.5', cpm: '12.5', actions: [{ action_type: 'omni_purchase', value: '2' }] })] }),
    ]),
    client('pagination: pages, repeated cursor, broken paging', [
      { fn: 'get_campaigns_inventory', args: { account_id: ACC, access_token: T } },
      { fn: 'get_campaigns_inventory', args: { account_id: ACC, access_token: T } },
      { fn: 'get_campaigns_inventory', args: { account_id: ACC, access_token: T } },
      { fn: 'get_campaigns_inventory', args: { account_id: ACC, access_token: T } },
      { fn: 'get_campaigns_inventory', args: { account_id: ACC, access_token: T } },
    ], [
      page([ENTITIES.campaigns[0]], 'MjU='), page([ENTITIES.campaigns[1], 'not a row'], 'NTA='), page([{ id: 3, name: null, status: '' }]),
      page([], 'X'), page([], 'X'),
      ok({ data: [], paging: { next: 'yes' } }),
      ok({ data: [], paging: 'broken' }),
      ok([1, 2]),
    ]),
    client('ad sets: merge, dead, missing, numeric ids', [
      { fn: 'get_adsets_insights', args: { account_id: ACC, access_token: T, date_preset: 'last_7d', currency: 'eur' } },
    ], [page(ADSETS.slice(0, 2), 'c1'), page(ADSETS.slice(2)), ok({ data: ADSET_INSIGHTS })]),
    client('ad sets: the inventory cache and writes that update it', [
      { fn: 'get_adsets_insights', args: { account_id: ACC, access_token: T, currency: 'USD' } },
      { fn: 'set_adset_status', args: { adset_id: '11', access_token: T, status: 'PAUSED', account_id: ACC } },
      { fn: 'update_entity_budget', args: { entity_id: '12', access_token: T, new_daily_budget_dollars: 75.5, currency: 'USD', account_id: ACC } },
      { fn: 'get_adsets_insights', args: { account_id: ACC, access_token: T, currency: 'USD' } },
      { fn: 'set_campaign_status', args: { campaign_id: '1', access_token: T, status: 'ACTIVE', account_id: ACC } },
      { fn: 'get_adsets_insights', args: { account_id: ACC, access_token: T, currency: 'USD' } },
      { fn: 'invalidate_inventory_cache', args: { account_id: '1000000000000001' } },
      { fn: 'get_adsets_insights', args: { account_id: ACC, access_token: T, currency: 'USD' } },
    ], [
      ok({ data: ADSETS }), ok({ data: ADSET_INSIGHTS }),
      ok({ success: true }), ok({ success: true }),
      ok({ data: [] }),
      ok({ success: true }),
      ok({ data: ADSETS.slice(0, 1) }), ok({ data: [] }),
      ok({ data: ADSETS.slice(1, 2) }), ok({ data: [] }),
    ]),
    client('ad sets: a missing id or name', [
      { fn: 'get_adsets_insights', args: { account_id: ACC, access_token: T } },
      { fn: 'get_adsets_insights', args: { account_id: '2', access_token: T } },
    ], [ok({ data: [{ name: 'x' }] }), ok({ data: [] }), ok({ data: [{ id: '5' }] }), ok({ data: [] })]),
    client('hierarchy for a reporting date, idle inventory left out', [
      {
        fn: 'get_hierarchical_insights',
        args: { account_id: ACC, access_token: T, currency: 'JPY', account_name: 'Tokyo', reporting_date: '2026-11-05', include_idle_inventory: false },
      },
    ], [
      ok({ data: [metricRow({})] }),
      ok({ data: ENTITIES.campaigns }), ok({ data: ENTITIES.adsets }), ok({ data: ENTITIES.ads }),
      ok({ data: [metricRow({ campaign_id: '1', campaign_name: 'Leads' }), metricRow({ campaign_id: '9', campaign_name: '' })] }),
      ok({ data: [metricRow({ campaign_id: '1', adset_id: '11', adset_name: 'Broad' })] }),
      ok({ data: [metricRow({ adset_id: '11', ad_id: '101' }), metricRow({ adset_id: '40', ad_id: '400', ad_name: 'Removed', spend: '0' })] }),
    ]),
    client('hierarchy for a preset with the whole inventory', [
      { fn: 'get_hierarchical_insights', args: { account_id: '1000000000000001', access_token: T, date_preset: 'maximum', priority: 'critical' } },
    ], [
      ok({ data: [] }),
      ok({ data: ENTITIES.campaigns }), ok({ data: ENTITIES.adsets }), ok({ data: ENTITIES.ads }),
      ok({ data: [] }), ok({ data: [metricRow({ adset_id: '12', campaign_id: '1', clicks: '0', impressions: '0', inline_link_clicks: 0 })] }), ok({ data: [] }),
    ]),
    client('ads, campaigns and their insights', [
      { fn: 'get_ads_insights', args: { account_id: '77', access_token: T, currency: 'USD' } },
      { fn: 'get_campaigns_insights', args: { account_id: ACC, access_token: T, date_preset: 'maximum', currency: 'ISK' } },
    ], [
      ok({ data: ENTITIES.ads }),
      ok({ data: [{ ad_id: '101', adset_id: '11', campaign_id: '1', spend: '3.335', clicks: '3', cpc: '1.115', ctr: '0.125' }, { ad_id: '103', spend: '0' }] }),
      ok({ data: [{ campaign_id: '1', spend: '5', cpc: '0.375', ctr: 2.675 }, { spend: '1' }, { campaign_id: '2', actions: 'odd' }] }),
    ]),
    client('live states', [
      { fn: 'get_adset_state', args: { adset_id: '11', access_token: T, currency: 'USD' } },
      { fn: 'get_entity_state', args: { entity_id: '101', access_token: T, entity_level: 'ad', currency: 'KRW' } },
      { fn: 'get_entity_state', args: { entity_id: '1', access_token: T, entity_level: 'campaign', currency: 'KRW' } },
      { fn: 'get_entity_state', args: { entity_id: '11', access_token: T, entity_level: 'adset' } },
    ], [
      ok({ id: '11', account_id: '1000000000000001', name: 'Broad', status: 'paused', effective_status: 'campaign_paused', daily_budget: '12345' }),
      ok({ id: '101', name: 'Video', status: 'ACTIVE' }),
      ok({ daily_budget: 30000 }),
      ok({}),
    ]),
    client('writes: statuses at every level, refused ones', [
      { fn: 'set_entity_status', args: { entity_id: '1', access_token: T, status: 'PAUSED', entity_level: 'campaign', account_id: '1000000000000001' } },
      { fn: 'set_entity_status', args: { entity_id: '101', access_token: T, status: 'ACTIVE', entity_level: 'ad' } },
      { fn: 'set_entity_status', args: { entity_id: '11', access_token: T, status: 'PAUSED' } },
      { fn: 'set_ad_status', args: { ad_id: '101', access_token: T, status: 'paused' } },
      { fn: 'set_adset_status', args: { adset_id: '11', access_token: T, status: 'DELETED' } },
      { fn: 'set_adset_status', args: { adset_id: '11', access_token: T, status: 'ACTIVE' } },
      { fn: 'set_adset_status', args: { adset_id: '11', access_token: T, status: 'ACTIVE' } },
      { fn: 'set_campaign_status', args: { campaign_id: '1', access_token: T, status: 'ACTIVE' } },
    ], [
      ok({ success: true }), ok({ success: true }), ok({ success: true }),
      ok({ success: false, error: { message: 'Nope' } }),
      ok({ success: 'true' }),
      ok([true]),
    ]),
    client('writes: budgets', [
      { fn: 'update_entity_budget', args: { entity_id: '11', access_token: T, new_daily_budget_dollars: 12.345, currency: 'USD' } },
      { fn: 'update_entity_budget', args: { entity_id: '2', access_token: T, new_daily_budget_dollars: 1500.5, currency: 'jpy', entity_level: 'campaign', account_id: ACC } },
      { fn: 'update_entity_budget', args: { entity_id: '11', access_token: T, new_daily_budget_dollars: 0.004, currency: 'USD' } },
      { fn: 'update_entity_budget', args: { entity_id: '11', access_token: T, new_daily_budget_dollars: 10, currency: 'UNKNOWN' } },
      { fn: 'update_entity_budget', args: { entity_id: '101', access_token: T, new_daily_budget_dollars: 10, currency: 'USD', entity_level: 'ad' } },
      { fn: 'update_entity_budget', args: { entity_id: '11', access_token: T, new_daily_budget_dollars: 0.125, currency: 'USD', entity_level: 'other' } },
      { fn: 'update_adset_budget', args: { adset_id: '11', access_token: T, new_daily_budget_dollars: 2.5, currency: 'CLP' } },
      { fn: 'update_adset_budget', args: { adset_id: '11', access_token: T, new_daily_budget_dollars: 20, currency: 'EUR' } },
    ], [
      ok({ success: true }), ok({ success: true }), ok({ success: true }), ok({ success: true }),
      fail(400, { error: { message: 'Budget too low', code: 100, error_subcode: 1885272 } }),
    ]),
    client('token and permission errors', [
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
      { fn: 'set_adset_status', args: { adset_id: '11', access_token: T, status: 'PAUSED' } },
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
    ], [
      metaError(400, { message: 'Error validating access token', type: 'OAuthException', code: 190, error_subcode: 463, fbtrace_id: ' Abc ' }),
      metaError(403, { message: 'Permissions error', code: 200, error_user_title: 'No access', error_user_msg: 'Ask an admin' }),
      metaError(400, { message: 'Session', code: 102 }),
      metaError(400, { code: 10, error_subcode: '1348001' }),
      metaError(400, { message: 'Weird', code: 190, error_subcode: 'x' }),
      metaError(400, { message: 'Not a token error', code: '190' }),
      fail(400, '<html>Bad gateway</html>'),
      fail(404, { error: 'flat string' }),
      metaError(400, { message: 'float', code: 190.0, error_subcode: 460.7 }),
    ]),
    client('retries: 5xx, 429 with Retry-After, exhausted, network', [
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
      { fn: 'set_adset_status', args: { adset_id: '11', access_token: T, status: 'PAUSED' } },
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
    ], [
      metaError(500, { message: 'Unknown error' }), ok({ id: ACC }),
      fail(429, { error: { message: 'Too many calls', code: 17 } }, { 'retry-after': '7.5' }), fail(429, '', { 'retry-after': '0.2' }), ok({ id: ACC }),
      fail(503, 'down'), fail(502, { error: { message: 'Bad' } }), fail(504, { error: { message: 'Timeout' } }),
      { network_error: 'connection reset' }, ok({ success: true }),
      { network_error: 'one' }, { network_error: 'two' }, { network_error: 'three' },
      fail(503, { error: 'not a dict' }),
    ]),
    client('quota headers: app usage defers polling, not writes', [
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
      { fn: 'set_adset_status', args: { adset_id: '11', access_token: T, status: 'PAUSED' } },
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T, priority: 'critical' } },
    ], [
      ok({ id: ACC }, { 'x-app-usage': JSON.stringify({ call_count: 85, total_cputime: 10, total_time: 12 }) }),
      ok({ success: true }, { 'x-app-usage': JSON.stringify({ call_count: '64', total_cputime: 3 }) }),
      ok({ id: ACC }),
    ]),
    client('quota headers: soft limit slows down, account limit defers', [
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
      { fn: 'get_account_info', args: { account_id: '2000000000000002', access_token: T } },
      { fn: 'get_account_info', args: { account_id: '3000000000000003', access_token: T } },
    ], [
      ok({ id: ACC }, {
        'x-business-use-case-usage': JSON.stringify({
          [ACC]: [{ type: 'ads_management', call_count: 70, total_cputime: 20, total_time: 30, estimated_time_to_regain_access: 0 }],
          '3000000000000003': [{ call_count: '90.5', total_time: 1, estimated_time_to_regain_access: 12 }],
        }),
      }),
      ok({ id: ACC }, { 'x-business-use-case-usage': JSON.stringify({ [ACC]: [{ call_count: 82 }] }) }),
      ok({ id: 'act_2000000000000002' }, { 'x-business-use-case-usage': '{not json', 'x-app-usage': '[1]' }),
    ]),
    client('quota headers: broken mid-way, stale, custom limits', [
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
      { fn: 'get_account_info', args: { account_id: '', access_token: T } },
    ], [
      ok({ id: ACC }, { 'x-business-use-case-usage': JSON.stringify({ act_9: [{ call_count: 95 }], act_8: 5, act_7: [{ call_count: 1 }] }) }),
      ok({ id: ACC }, { 'x-business-use-case-usage': JSON.stringify({ act_6: 'ab', act_5: {}, act_4: [] }) }),
    ], { options: { ...SECRET, automation: { usage_soft_limit_percent: 40, usage_hard_limit_percent: 30, usage_ttl_minutes: 0, inventory_cache_minutes: 0 } } }),
    client('quota: adaptive polling off', [
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
    ], [ok({ id: ACC }, { 'x-app-usage': JSON.stringify({ call_count: 100 }) })], {
      options: { ...SECRET, automation: { adaptive_polling_enabled: false } },
    }),
    client('another graph origin and version', [
      { fn: 'get_adset_state', args: { adset_id: '11', access_token: T } },
    ], [ok({ id: '11' })], { options: { graph_version: 'v25.0', base_url: 'http://fake-meta:8090/', app_secret: 'x' } }),
    client('a body that is not JSON on success', [
      { fn: 'get_account_info', args: { account_id: ACC, access_token: T } },
      { fn: 'get_campaigns_inventory', args: { account_id: ACC, access_token: T } },
    ], [fail(200, 'not json'), fail(200, '')]),
  ];
}

// A small seeded generator (mulberry32), so a failure reproduces.
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ACTION_TYPES = [
  'lead', 'omni_lead', 'offsite_conversion.fb_pixel_lead', 'leadgen_grouped', 'complete_registration', 'omni:complete_registration',
  'purchase', 'onsite_web_purchase', 'landing_page_view', 'omni_landing_page_view', 'link_click', 'outbound_click',
  'custom:form_submitted', 'custom:Order_Placed', 'custom:SignUp', 'offsite_conversion.custom.123', 'offsite_conversion.custom.9',
  'omni_custom_deposit', 'custom:other', 'custom:Ünïcode lead', '',
];

export function fuzzCases(count: number): Case[] {
  const random = generator(611_2026);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
  const number = (): unknown =>
    pick<() => unknown>([
      () => String(Math.round(random() * 100000) / 100),
      () => String(Math.floor(random() * 5000)),
      () => Math.floor(random() * 300),
      () => Math.round(random() * 1000) / 8,
      () => '',
      () => null,
      () => 'abc',
      () => ' 12 ',
      () => '1_000',
      () => '1e3',
      () => '0x10',
      () => true,
      () => [],
      () => '-3.5',
      () => '0.005',
    ])();
  const actions = (): unknown =>
    pick<() => unknown>([
      () => Array.from({ length: Math.floor(random() * 6) }, () =>
        random() < 0.9 ? { action_type: pick(ACTION_TYPES), value: number() } : pick<unknown>(['x', 3, null, { value: 1 }])),
      () => null,
      () => 'text',
      () => ({ lead: 1 }),
      () => [],
    ])();
  const insight = (): Record<string, unknown> => {
    const row: Record<string, unknown> = {};
    for (const key of ['spend', 'impressions', 'reach', 'frequency', 'cpm', 'clicks', 'unique_clicks', 'inline_link_clicks', 'cpc', 'ctr']) {
      if (random() < 0.8) row[key] = number();
    }
    if (random() < 0.8) row.actions = actions();
    if (random() < 0.5) row.outbound_clicks = actions();
    return row;
  };
  const status = () => pick(['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED', 'CAMPAIGN_PAUSED', '', null, 'active']);

  const cases: Case[] = [];
  for (let index = 0; index < count; index += 1) {
    const kind = index % 4;
    if (kind === 0) {
      cases.push({ kind: 'fn', fn: 'normalize_basic_insight', args: [insight()] });
    } else if (kind === 1) {
      const adsets = Array.from({ length: Math.floor(random() * 5) }, (_, i) => {
        const row: Record<string, unknown> = { id: String(i + 1), name: pick(['A', 'B', '', null]), status: status() };
        if (random() < 0.7) row.effective_status = status();
        if (random() < 0.7) row.campaign_id = pick(['1', '2', '', null]);
        if (random() < 0.7) row.daily_budget = number();
        return row;
      });
      const insights = Array.from({ length: Math.floor(random() * 5) }, () => ({
        ...insight(),
        adset_id: pick<unknown>(['1', '2', '3', '9', '', null, 4]),
        campaign_id: pick(['1', '7', '']),
        adset_name: pick(['X', '', null]),
      }));
      cases.push(client(`fuzz ad sets ${index}`, [
        { fn: 'get_adsets_insights', args: { account_id: ACC, access_token: T, currency: pick(['USD', 'JPY', 'xx', 'UNKNOWN']) } },
      ], [ok({ data: adsets }), ok({ data: insights })]));
    } else if (kind === 2) {
      const errorData: Record<string, unknown> = {};
      for (const key of ['code', 'error_subcode', 'message', 'error_user_title', 'error_user_msg', 'fbtrace_id']) {
        if (random() < 0.7) errorData[key] = pick<unknown>([190, 102, 10, 200, 463, 458, 1348001, '190', ' 467 ', 'x', null, '', 'msg', 2.5, true, []]);
      }
      cases.push({ kind: 'fn', fn: 'classify', args: [errorData, pick<unknown>(['', 'fallback', null, 0])] });
    } else {
      const now = 1_790_000_000;
      const debug: Record<string, unknown> = { is_valid: pick<unknown>([true, true, false, 1, null]) };
      if (random() < 0.8) debug.scopes = pick<unknown>([['ads_read', 'ads_management', 'business_management'], ['ads_read'], [], ['ads_read', '', null, 'ads_management', 'business_management'], null]);
      if (random() < 0.8) debug.expires_at = pick<unknown>([0, now - 10, now + 3600, now + 7 * 86400 + 5, now + 8 * 86400, String(now + 60 * 86400), 'never', null]);
      cases.push({ kind: 'fn', fn: 'connection_health', args: [debug, now] });
    }
  }
  return cases;
}

const OAUTH = {
  app_id: '123456',
  app_secret: ' oauth-secret ',
  redirect_uri: 'https://buyerly.test/api/meta/oauth/callback',
  graph_version: 'v26.0',
  login_config_id: 'cfg 1',
};

export function oauthScenarios(): OAuthCase[] {
  const oauth = (name: string, calls: Call[], responses: Scripted[] = []): OAuthCase => ({ kind: 'oauth', name, options: OAUTH, calls, responses });
  const debug = { data: { is_valid: true, app_id: '123456', expires_at: 1_795_000_000, scopes: ['ads_read', 'ads_management', 'business_management'] } };
  return [
    oauth('authorization URL and proof', [
      { fn: 'build_authorization_url', args: { state: 'st/ate+1=2&x' } },
      { fn: 'appsecret_proof', args: { access_token: 'EAAB' } },
    ]),
    oauth('code exchange with a long-lived token', [{ fn: 'exchange_code', args: { code: 'AQ code' } }], [
      ok({ access_token: ' short ' }), ok({ access_token: 'long', expires_in: 5_183_944 }), ok(debug), ok({ id: '42', name: 'Ann' }),
    ]),
    oauth('code exchange when the long-lived exchange fails', [{ fn: 'exchange_code', args: { code: 'c' } }], [
      ok({ access_token: 'short' }), metaError(400, { code: 1 }), ok(debug), ok({ id: '42' }),
    ]),
    oauth('exchange failures', [
      { fn: 'exchange_code', args: { code: 'c' } },
      { fn: 'exchange_code', args: { code: 'c' } },
      { fn: 'exchange_code', args: { code: 'c' } },
      { fn: 'exchange_code', args: { code: 'c' } },
      { fn: 'exchange_code', args: { code: 'c' } },
    ], [
      ok({}),
      { network_error: 'down' },
      fail(200, 'nope'),
      fail(500, '[1]'),
      ok({ access_token: 't' }), ok({}), ok({ data: { is_valid: true, app_id: '999' } }),
    ]),
    oauth('token checks', [
      { fn: 'debug_token', args: { access_token: 't' } },
      { fn: 'debug_token', args: { access_token: 't' } },
      { fn: 'get_identity', args: { access_token: 't' } },
      { fn: 'get_identity', args: { access_token: 't' } },
    ], [ok({ data: { is_valid: 'yes' } }), ok({ data: { is_valid: true } }), ok({ name: 'no id' }), ok({ id: 7 })]),
    oauth('ad account discovery', [
      { fn: 'discover_ad_accounts', args: { access_token: 't' } },
      { fn: 'discover_ad_accounts', args: { access_token: 't' } },
    ], [
      page([{ id: 'act_1', name: 'One' }, 'x'], 'A'), page([{ id: 'act_2' }], 'B'), ok({ data: [{ id: 'act_3' }], paging: { next: 'n', cursors: 'bad' } }),
      page([], 'A'), page([], 'A'),
    ]),
    oauth('revocation', [
      { fn: 'revoke_permissions', args: { access_token: 't' } },
      { fn: 'revoke_permissions', args: { access_token: 't' } },
      { fn: 'revoke_permissions', args: { access_token: 't' } },
      { fn: 'revoke_permissions', args: { access_token: 't' } },
    ], [ok({ success: true }), fail(200, ''), fail(400, 'oops'), ok([1])]),
    oauth('rejections with codes', [{ fn: 'debug_token', args: { access_token: 't' } }, { fn: 'debug_token', args: { access_token: 't' } }], [
      metaError(400, { code: 190 }), ok({ error: 'flat' }),
    ]),
  ];
}

export function functionCases(): FnCase[] {
  const fn = (name: string, ...args: unknown[]): FnCase => ({ kind: 'fn', fn: name, args });
  return [
    ...[
      [1234, 'USD'], ['1234', 'jpy'], ['', 'USD'], [null, 'EUR'], ['abc', 'USD'], ['12.5', 'XX'], [true, 'USD'], [' 7 ', 'KRW'],
    ].map((args) => fn('from_meta_budget_units', ...args)),
    ...[
      [12.345, 'USD'], [12.355, 'USD'], [0.005, 'USD'], [0.015, 'EUR'], [1500.5, 'JPY'], [2.5, 'JPY'], [3.5, 'VND'], [0.004, 'USD'],
      [10, 'UNKNOWN'], [10, ''], ['12', 'USD'], ['x', 'USD'], [null, 'USD'], [-1, 'USD'], [1e300, 'USD'], ['inf', 'USD'], ['nan', 'USD'],
    ].map((args) => fn('to_meta_budget_units', ...args)),
    ...['US/Pacific', ' Canada/Atlantic ', 'Europe/Amsterdam', '', null, 'HST', 'Unknown/Zone'].map((name) => fn('canonical_timezone_name', name)),
    fn('period_params', 'today', '', ''),
    fn('period_params', 'today', '2026-11-05', ''),
    fn('period_params', 'today', '2026-11-05', '2026-11-06'),
    fn('classify', {}, ''),
    fn('classify', { code: 190, error_subcode: 459, message: '  spaced  ' }, 'fallback'),
  ];
}
