import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { AccountEntity, type UserEntity, type WorkspaceEntity } from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';

// The search page's `search` (api/routers/search.py, tests/test_search.py)
// against either server: today's campaigns, ad sets and ads, rules and ad
// accounts, ranked and filtered.

interface GraphQLAnswer {
  data: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { statusCode?: number } }[];
}

const SEARCH = `query($q: String!, $limit: Int, $kind: String, $status: [String!], $account: [String!], $order: String, $includeDeleted: Boolean) {
  search(q: $q, limit: $limit, kind: $kind, status: $status, account: $account, order: $order, includeDeleted: $includeDeleted) }`;
const CREATE = 'mutation($input: JSON!) { ruleCreate(input: $input) { rule } }';

const day = (offset: number): string => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{6})?Z$/;

interface Result { kind: string; id: string; name: string; account_id: string; account_name: string; parent_name: string; status: string; updated_at: string | null }
interface Answer { query: string; limit: number; results: Result[]; truncated: string[] }

describe.skipIf(!DATABASE_URL)('search', () => {
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

  async function owner(): Promise<Member> {
    const user = await createUser(db);
    const workspace = await createWorkspace(db, user);
    const account = await db.getRepository(AccountEntity).findOneByOrFail({ workspaceId: workspace.id });
    const browser = new Browser(target, { 'x-workspace-slug': workspace.slug });
    expect((await browser.signIn(user.email!)).status).toBe(200);
    return { browser, user, workspace, account };
  }

  async function graphql(member: Member, query: string, variables?: Record<string, unknown>): Promise<GraphQLAnswer> {
    const answer = await member.browser.post('/api/graphql', { query, variables }, member.browser.csrf());
    expect(answer.status).toBe(200);
    return answer.body as GraphQLAnswer;
  }

  async function search(member: Member, variables: Record<string, unknown>): Promise<Answer> {
    const { data, errors } = await graphql(member, SEARCH, variables);
    expect(errors).toBeUndefined();
    return data!.search as Answer;
  }

  async function refused(member: Member, variables: Record<string, unknown>): Promise<[number | undefined, string]> {
    const { errors } = await graphql(member, SEARCH, variables);
    expect(errors).toHaveLength(1);
    return [errors![0].extensions?.statusCode, errors![0].message];
  }

  async function fact(member: Member, level: string, id: string, name: string, parent: string, date: string, effective = 'ACTIVE'): Promise<void> {
    await db.query(
      `INSERT INTO analytics_entity_daily_facts
         (workspace_id, account_id, entity_level, entity_id, entity_name, parent_entity_id, date, currency,
          spend, impressions, reach, frequency, cpm, clicks, unique_clicks, link_clicks, outbound_clicks,
          landing_page_views, cpc, cpc_link, ctr, ctr_link, ctr_outbound, leads, registrations, purchases,
          cost_per_lead, cost_per_registration, cost_per_purchase, cost_per_landing_page_view, raw_actions,
          status, effective_status, daily_budget, fetched_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'USD', 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
               0, 0, 0, 0, '[]', 'ACTIVE', $8, 0, now(), now())`,
      [member.workspace.id, member.account.accountId, level, id, name, parent, date, effective],
    );
  }

  async function seeded(): Promise<Member> {
    const me = await owner();
    await fact(me, 'campaign', '120001', 'Summer Sale', me.account.accountId, day(0));
    await fact(me, 'campaign', '120002', 'Summer two', me.account.accountId, day(3));
    await fact(me, 'campaign', '120002', 'Summer two', me.account.accountId, day(0), 'PAUSED');
    await fact(me, 'adset', '230001', 'Summer 50%_off', '120001', day(0), 'ADSET_PAUSED');
    await fact(me, 'ad', '340001', 'summer ad', '230001', day(0), 'DELETED');
    await fact(me, 'campaign', '120003', 'Winter summer', me.account.accountId, day(1));
    await db.getRepository(AccountEntity).update({ id: me.account.id }, { customName: ' Straße Konto ' });
    await graphql(me, CREATE, { input: { name: 'Summer stop', action: 'turn_off', conditions: [{ metric: 'spend', operator: 'gte', value: 5 }] } });
    return me;
  }

  const entity = (me: Member, kind: string, id: string, name: string, parent: string, status: string, date: string): Result => ({
    kind, id, name, account_id: me.account.accountId, account_name: 'Straße Konto', parent_name: parent, status, updated_at: `${date}T00:00:00Z`,
  });

  it("finds today's inventory, rules and accounts, best match first", async () => {
    const me = await seeded();
    const found = await search(me, { q: ' summer ' });
    expect(found).toMatchObject({ query: 'summer', limit: 5, truncated: [] });
    expect(found.results.map((result) => [result.kind, result.name])).toEqual([
      ['campaign', 'Summer Sale'], ['campaign', 'Summer two'], ['adset', 'Summer 50%_off'], ['rule', 'Summer stop'],
    ]);
    expect(found.results[0]).toEqual(entity(me, 'campaign', '120001', 'Summer Sale', '', 'ACTIVE', day(0)));
    expect(found.results[1]).toEqual(entity(me, 'campaign', '120002', 'Summer two', '', 'PAUSED', day(3)));
    expect(found.results[2]).toEqual(entity(me, 'adset', '230001', 'Summer 50%_off', 'Summer Sale', 'ADSET_PAUSED', day(0)));
    expect(found.results[3]).toMatchObject({ kind: 'rule', name: 'Summer stop', account_id: '', account_name: '', parent_name: '', status: 'active' });
    expect(found.results[3].updated_at).toMatch(ISO);

    // Newest first, one per kind, deleted ones on request, a `_` is a character.
    expect((await search(me, { q: 'summer', order: 'updated', limit: 1, kind: 'campaign' }))).toMatchObject({
      results: [{ id: '120001' }], truncated: ['campaign'],
    });
    expect((await search(me, { q: 'summer', order: 'updated' })).results.map((result) => result.id).slice(-2)).toEqual(['230001', '120002']);
    expect((await search(me, { q: 'summer', kind: 'ad' })).results).toEqual([]);
    expect((await search(me, { q: 'summer', kind: 'ad', includeDeleted: true })).results)
      .toEqual([entity(me, 'ad', '340001', 'summer ad', 'Summer 50%_off', 'DELETED', day(0))]);
    expect((await search(me, { q: '50%_' })).results.map((result) => result.id)).toEqual(['230001']);
    expect((await search(me, { q: '5_%' })).results).toEqual([]);
    // By Meta ID, by status, by account.
    expect((await search(me, { q: '120002' })).results.map((result) => result.id)).toEqual(['120002']);
    expect((await search(me, { q: 'summer', status: ['paused'] })).results.map((result) => result.id)).toEqual(['120002', '230001']);
    expect((await search(me, { q: 'summer', status: ['other', 'active'] })).results.map((result) => result.id)).toEqual(['120001', found.results[3].id]);
    expect((await search(me, { q: 'summer', account: ['act_0'] })).results).toEqual([]);
  });

  it('finds ad accounts by ID and by name, folding case as Python does', async () => {
    const me = await seeded();
    const account = { kind: 'account', id: me.account.accountId, name: 'Straße Konto', account_id: me.account.accountId, account_name: '', parent_name: '', status: '' };
    const byId = await search(me, { q: me.account.accountId.slice(4) });
    expect(byId.results).toHaveLength(1);
    expect(byId.results[0]).toMatchObject(account);
    expect(byId.results[0].updated_at).toMatch(ISO);
    expect((await search(me, { q: 'STRASSE' })).results).toMatchObject([account]);
    expect((await search(me, { q: 'konto', kind: 'account' })).results).toMatchObject([account]);
    expect((await search(me, { q: 'konto', status: ['active'] })).results).toEqual([]);
  });

  it('refuses what the search page never sends', async () => {
    const me = await owner();
    expect(await refused(me, { q: '   ' })).toEqual([422, 'Type something to search for.']);
    expect(await refused(me, { q: 'x'.repeat(201) })).toEqual([422, 'String should have at most 200 characters']);
    expect(await refused(me, { q: 'x', limit: 0 })).toEqual([422, 'Input should be greater than or equal to 1']);
    expect(await refused(me, { q: 'x', limit: 21 })).toEqual([422, 'Input should be less than or equal to 20']);
    expect(await refused(me, { q: 'x', kind: 'user' })).toEqual([422, "Input should be 'campaign', 'adset', 'ad', 'rule' or 'account'"]);
    expect(await refused(me, { q: 'x', status: ['on', 'paused', 'off'] }))
      .toEqual([422, "Input should be 'active', 'paused' or 'other' Input should be 'active', 'paused' or 'other'"]);
    expect(await refused(me, { q: 'x', order: 'newest' })).toEqual([422, "Input should be 'relevance' or 'updated'"]);
  });
});
