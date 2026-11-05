import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { AccountEntity, type UserEntity, type WorkspaceEntity } from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';

// The Analytics Fact Store's drill-downs over GraphQL (tests/test_analytics_*.py,
// tests/test_client_api.py), against either server.

interface GraphQLAnswer {
  data: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { statusCode?: number } }[];
}

const HIERARCHY = `query($parent: String!, $level: String, $period: String, $compare: String) {
  analyticsHierarchy(parentId: $parent, level: $level, period: $period, compare: $compare) }`;
const ACCOUNTS = 'query($ids: String, $period: String) { analyticsAccountsHierarchy(accountIds: $ids, period: $period) }';

const day = (offset: number, timeZone = 'UTC'): string => {
  const date = new Date(Date.now() - offset * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
};

interface Fact {
  level?: string;
  id: string;
  name?: string;
  parent?: string;
  date: string;
  spend?: number;
  impressions?: number;
  reach?: number;
  clicks?: number;
  leads?: number;
  fetchedAt?: string;
}

describe.skipIf(!DATABASE_URL)('analytics hierarchy', () => {
  let target: Target;
  let db: DataSource;

  beforeAll(async () => {
    target = await contractTarget();
    db = await testDatabase();
  });

  afterAll(async () => {
    await target?.close();
    await db?.destroy();
  });

  interface Member { browser: Browser; user: UserEntity; workspace: WorkspaceEntity; account: AccountEntity }

  async function owner(timezoneName = 'UTC'): Promise<Member> {
    const user = await createUser(db);
    const workspace = await createWorkspace(db, user);
    const account = await db.getRepository(AccountEntity).findOneByOrFail({ workspaceId: workspace.id });
    await db.getRepository(AccountEntity).update({ id: account.id }, { timezoneName });
    const browser = new Browser(target, { 'x-workspace-slug': workspace.slug });
    expect((await browser.signIn(user.email!)).status).toBe(200);
    return { browser, user, workspace, account };
  }

  async function graphql(member: Member, query: string, variables?: Record<string, unknown>): Promise<GraphQLAnswer> {
    const answer = await member.browser.post('/api/graphql', { query, variables }, member.browser.csrf());
    expect(answer.status).toBe(200);
    return answer.body as GraphQLAnswer;
  }

  async function read<T>(member: Member, query: string, variables: Record<string, unknown>, field: string): Promise<T> {
    const { data, errors } = await graphql(member, query, variables);
    expect(errors).toBeUndefined();
    return data![field] as T;
  }

  const refusal = (answer: GraphQLAnswer): [number | undefined, string | undefined] =>
    [answer.errors?.[0].extensions?.statusCode, answer.errors?.[0].message];

  async function facts(member: Member, rows: Fact[]): Promise<void> {
    for (const fact of rows) {
      await db.query(
        `INSERT INTO analytics_entity_daily_facts
           (workspace_id, account_id, entity_level, entity_id, entity_name, parent_entity_id, date, currency,
            spend, impressions, reach, frequency, cpm, clicks, unique_clicks, link_clicks, outbound_clicks,
            landing_page_views, cpc, cpc_link, ctr, ctr_link, ctr_outbound, leads, registrations, purchases,
            cost_per_lead, cost_per_registration, cost_per_purchase, cost_per_landing_page_view, raw_actions,
            status, effective_status, daily_budget, fetched_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'USD', $8, $9, $10, 0, 0, $11, 0, $11, 0, 0, 0, 0, 0, 0, 0, $12, 0, 0,
                 0, 0, 0, 0, '[]', 'ACTIVE', 'ACTIVE', 50.5, $13, now())`,
        [
          member.workspace.id, member.account.accountId, fact.level ?? 'campaign', fact.id, fact.name ?? '',
          fact.parent ?? member.account.accountId, fact.date, fact.spend ?? 0, fact.impressions ?? 0, fact.reach ?? 0,
          fact.clicks ?? 0, fact.leads ?? 0, fact.fetchedAt ?? '2026-11-04T10:00:00Z',
        ],
      );
    }
  }

  it("lists an account's campaigns with today's figures, highest spend first", async () => {
    const me = await owner();
    await facts(me, [
      { id: '201', name: 'Small', date: day(0), spend: 1.1, impressions: 0, fetchedAt: '2026-11-05T08:00:00.250000Z' },
      { id: '202', date: day(0), spend: 26.75, impressions: 3, reach: 2, clicks: 10, leads: 3, fetchedAt: '2026-11-05T07:00:00Z' },
      { id: '203', name: 'Yesterday only', date: day(1), spend: 99 },
    ]);
    const answer = await read<Record<string, unknown>>(me, HIERARCHY, { parent: me.account.accountId.slice(4) }, 'analyticsHierarchy');
    expect(answer).toMatchObject({
      parent_id: me.account.accountId.slice(4),
      level: 'campaign',
      period: 'today',
      source: 'analytics_fact_store',
      data_as_of: '2026-11-05T07:00:00Z',
      comparison: { requested: false, available: false, dates: [], reason: '', current_includes_open_day: true },
      total: 2,
    });
    const items = answer.items as Record<string, unknown>[];
    expect(items.map((item) => item.entity_id)).toEqual(['202', '201']);
    expect(items[0]).toEqual({
      entity_id: '202',
      entity_name: 'Campaign 202',
      entity_level: 'campaign',
      parent_entity_id: me.account.accountId,
      account_id: me.account.accountId,
      currency: 'USD',
      status: 'ACTIVE',
      effective_status: 'ACTIVE',
      daily_budget: 50.5,
      data_as_of: '2026-11-05T07:00:00Z',
      spend: 26.75,
      impressions: 3,
      reach: 2,
      cpm: 8916.67,
      clicks: 10,
      link_clicks: 10,
      outbound_clicks: 0,
      landing_page_views: 0,
      cpc: 2.68,
      ctr: 333.33,
      cpc_link: 2.68,
      ctr_link: 333.33,
      ctr_outbound: 0,
      leads: 3,
      registrations: 0,
      purchases: 0,
      cost_per_lead: 8.92,
      cost_per_registration: null,
      cost_per_purchase: null,
      cost_per_landing_page_view: null,
    });
    expect(items[1]).toMatchObject({ entity_name: 'Small', cpm: null, ctr: null, cpc: null, data_as_of: '2026-11-05T08:00:00.250000Z' });
  });

  it('adds up a period and compares it with the one before', async () => {
    const me = await owner();
    await facts(me, [
      { id: '301', date: day(0), spend: 0.1, reach: 5, clicks: 1 },
      { id: '301', date: day(1), spend: 0.2, reach: 7, clicks: 1 },
      { id: '301', date: day(3), spend: 4, reach: 1 },
      { id: '302', date: day(2), spend: 1 },
    ]);
    const answer = await read<{ comparison: Record<string, unknown>; items: Record<string, unknown>[] }>(
      me, HIERARCHY, { parent: me.account.accountId, period: 'last_3d', compare: 'previous' }, 'analyticsHierarchy',
    );
    expect(answer.comparison).toEqual({
      requested: true, available: true, dates: [day(3), day(4), day(5)], reason: '', current_includes_open_day: true,
    });
    expect(answer.items.map((item) => [item.entity_id, item.spend, item.reach, item.cpc])).toEqual([['302', 1, 0, null], ['301', 0.3, 7, 0.15]]);
    expect(answer.items[1].previous).toMatchObject({ spend: 4, reach: 1 });
    expect(answer.items[0].previous).toBeNull();

    const today = await read<{ comparison: Record<string, unknown> }>(me, HIERARCHY, { parent: me.account.accountId, compare: 'previous' }, 'analyticsHierarchy');
    expect(today.comparison).toMatchObject({ requested: true, available: false, dates: [] });
    expect(today.comparison.reason).toMatch(/^Today is still open/);
  });

  it("reads ad sets under a campaign in the account's own day", async () => {
    // Kiritimati is UTC+14: its today is usually a day ahead of UTC's.
    const me = await owner('Pacific/Kiritimati');
    const local = day(0, 'Pacific/Kiritimati');
    await facts(me, [
      { level: 'adset', id: '401', parent: '201', date: local, spend: 2 },
      { level: 'adset', id: '402', parent: '209', date: local, spend: 3 },
    ]);
    const answer = await read<{ items: Record<string, unknown>[] }>(me, HIERARCHY, { parent: '201', level: 'adset' }, 'analyticsHierarchy');
    expect(answer.items.map((item) => item.entity_id)).toEqual(['401']);
    expect(answer.items[0].entity_name).toBe('Adset 401');
  });

  it("refuses parents it doesn't hold and bad arguments", async () => {
    const me = await owner();
    const other = await owner();
    await facts(other, [{ level: 'adset', id: '501', parent: '601', date: day(0) }]);
    const missing: [number, string] = [404, 'Ad account, campaign or ad set not found, or not available in the current workspace'];
    expect(refusal(await graphql(me, HIERARCHY, { parent: other.account.accountId }))).toEqual(missing);
    expect(refusal(await graphql(me, HIERARCHY, { parent: '601', level: 'adset' }))).toEqual(missing);
    expect(refusal(await graphql(me, HIERARCHY, { parent: '601' }))).toEqual(missing);
    expect(refusal(await graphql(me, HIERARCHY, { parent: me.account.accountId, level: 'account' })))
      .toEqual([422, "String should match pattern '^(campaign|adset|ad)$'"]);
    expect(refusal(await graphql(me, HIERARCHY, { parent: me.account.accountId, period: 'month' })))
      .toEqual([422, "String should match pattern '^(today|yesterday|last_3d|last_7d)$'"]);
  });

  it('reads several accounts at once and names the ones it cannot', async () => {
    const me = await owner();
    const other = await owner();
    await facts(me, [
      { id: '701', date: day(0), spend: 1 },
      { level: 'adset', id: '702', parent: '701', date: day(0), spend: 1 },
      { level: 'ad', id: '703', parent: '702', date: day(0), spend: 1 },
    ]);
    const all = await read<{ accounts: Record<string, unknown>[]; missing: string[] }>(me, ACCOUNTS, {}, 'analyticsAccountsHierarchy');
    expect(all).toMatchObject({ period: 'today', source: 'analytics_fact_store', missing: [] });
    expect(all.accounts).toHaveLength(1);
    const [row] = all.accounts as { account_id: string; campaigns: { entity_id: string }[]; adsets: { entity_id: string }[]; ads: { entity_id: string }[] }[];
    expect([row.account_id, row.campaigns[0].entity_id, row.adsets[0].entity_id, row.ads[0].entity_id])
      .toEqual([me.account.accountId, '701', '702', '703']);

    const named = await read<{ accounts: { account_id: string }[]; missing: string[] }>(
      me, ACCOUNTS, { ids: ` ${other.account.accountId}, ${me.account.accountId},,${me.account.accountId}`, period: 'yesterday' }, 'analyticsAccountsHierarchy',
    );
    expect(named.accounts.map((account) => account.account_id)).toEqual([me.account.accountId]);
    expect(named.missing).toEqual([other.account.accountId]);
    expect((named.accounts[0] as unknown as { campaigns: unknown[] }).campaigns).toEqual([]);

    const many = Array.from({ length: 501 }, (_, index) => `act_${index}`).join(',');
    expect(refusal(await graphql(me, ACCOUNTS, { ids: many }))).toEqual([422, 'At most 500 ad accounts per request']);
  });
});
