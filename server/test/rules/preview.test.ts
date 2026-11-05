import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { AccountEntity, type UserEntity, type WorkspaceEntity } from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';

// rulePreview and ruleDraftPreview (api/routers/rules.py, tests/test_rule_preview.py)
// against either server: what a rule would check on the whole ad account,
// from the stored daily facts, and the refusals. The evaluation itself is
// compared case by case in engine.test.ts.

interface GraphQLAnswer {
  data: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { statusCode?: number } }[];
}

const PREVIEW = 'query($account: String!, $rule: Int!) { rulePreview(accountId: $account, ruleId: $rule) }';
const DRAFT = 'query($account: String!, $input: JSON!) { ruleDraftPreview(accountId: $account, input: $input) }';
const CREATE = 'mutation($input: JSON!) { ruleCreate(input: $input) { rule } }';

const STOP = {
  name: 'Stop at $5',
  action: 'turn_off',
  conditions: [{ metric: 'spend', operator: 'gte', value: 5, time_window: 'today' }, { metric: 'leads', operator: 'eq', value: 0 }],
};

const day = (offset: number): string => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);

interface Fact { id: string; name: string; date: string; spend: number; leads?: number; status?: string; fetchedAt?: string }

describe.skipIf(!DATABASE_URL)('rule previews', () => {
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

  async function ok(member: Member, query: string, variables: Record<string, unknown>, field: string): Promise<Record<string, unknown>> {
    const { data, errors } = await graphql(member, query, variables);
    expect(errors).toBeUndefined();
    return data![field] as Record<string, unknown>;
  }

  async function refused(member: Member, query: string, variables: Record<string, unknown>): Promise<[number | undefined, string]> {
    const { errors } = await graphql(member, query, variables);
    expect(errors).toHaveLength(1);
    return [errors![0].extensions?.statusCode, errors![0].message];
  }

  async function facts(member: Member, rows: Fact[]): Promise<void> {
    for (const fact of rows) {
      const [status, effective] = (fact.status ?? 'ACTIVE/ACTIVE').split('/');
      await db.query(
        `INSERT INTO analytics_entity_daily_facts
           (workspace_id, account_id, entity_level, entity_id, entity_name, parent_entity_id, date, currency,
            spend, impressions, reach, frequency, cpm, clicks, unique_clicks, link_clicks, outbound_clicks,
            landing_page_views, cpc, cpc_link, ctr, ctr_link, ctr_outbound, leads, registrations, purchases,
            cost_per_lead, cost_per_registration, cost_per_purchase, cost_per_landing_page_view, raw_actions,
            status, effective_status, daily_budget, fetched_at, updated_at)
         VALUES ($1, $2, 'adset', $3, $4, '900', $5, 'USD', $6, 100, 80, 0, 0, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0, $7, 0, 0,
                 0, 0, 0, 0, '[]', $8, $9, 50.5, $10, now())`,
        [member.workspace.id, member.account.accountId, fact.id, fact.name, fact.date, fact.spend, fact.leads ?? 0, status, effective, fact.fetchedAt ?? '2026-11-04T10:00:00Z'],
      );
    }
  }

  async function seeded(): Promise<Member> {
    const me = await owner();
    await facts(me, [
      { id: '1201', name: 'Alpha', date: day(0), spend: 6.5 },
      { id: '1202', name: 'beta', date: day(0), spend: 2, fetchedAt: '2026-11-04T11:00:00.5Z' },
      { id: '1203', name: 'Gamma', date: day(0), spend: 9, status: 'PAUSED/PAUSED' },
      { id: '1204', name: 'Gone', date: day(0), spend: 50, status: 'DELETED/DELETED' },
      { id: '1205', name: 'Delta', date: day(1), spend: 3 },
      { id: '1206', name: 'Old', date: day(30), spend: 10 },
    ]);
    return me;
  }

  const header = (me: Member) => ({ account_id: me.account.accountId, account_name: 'Test account', level: 'adset', rules_enabled: false });
  const item = (id: string, name: string, status: string, spend: number, outcome: string, detail: string) => ({ entity_id: id, entity_name: name, status, spend, outcome, detail });

  it("lists what a saved rule would check on today's numbers, matched first", async () => {
    const me = await seeded();
    const rule = ((await ok(me, CREATE, { input: STOP }, 'ruleCreate')).rule as { id: number });
    expect(await ok(me, PREVIEW, { account: me.account.accountId, rule: rule.id }, 'rulePreview')).toEqual({
      ...header(me),
      rule_name: 'Stop at $5',
      action: 'turn_off',
      total: 4,
      running: 3,
      matching: 1,
      data_as_of: '2026-11-04T11:00:00.500000+00:00',
      lifetime_since: null,
      entities: [
        item('1201', 'Alpha', 'ACTIVE', 6.5, 'matched', 'Spend (6.50 USD) ≥ 5.00 USD, Leads (0) = 0'),
        item('1202', 'beta', 'ACTIVE', 2, 'not_met', 'Spend 2.00 USD, needs ≥ 5.00 USD'),
        item('1205', 'Delta', 'ACTIVE', 0, 'not_met', 'Spend 0.00 USD, needs ≥ 5.00 USD'),
        item('1203', 'Gamma', 'PAUSED', 9, 'inactive', 'Not active'),
      ],
      already_attached: false,
    });
    // The account id without act_ works too; attached, it says so.
    await ok(me, CREATE, { input: { ...STOP, name: 'Attached', attachments: [{ account_id: me.account.accountId }] } }, 'ruleCreate');
    const attached = ((await ok(me, CREATE, { input: { ...STOP, name: 'Mine', attachments: [{ account_id: me.account.accountId }] } }, 'ruleCreate')).rule as { id: number });
    expect(await ok(me, PREVIEW, { account: me.account.accountId.slice(4), rule: attached.id }, 'rulePreview')).toMatchObject({ rule_name: 'Mine', already_attached: true });
  });

  it('previews a draft, lifetime rules summing every stored day', async () => {
    const me = await seeded();
    const draft = { action: 'notify_only', conditions: [{ metric: 'spend', operator: 'gte', value: 3, time_window: 'lifetime' }] };
    expect(await ok(me, DRAFT, { account: me.account.accountId, input: draft }, 'ruleDraftPreview')).toEqual({
      ...header(me),
      rule_name: 'New rule',
      action: 'notify_only',
      total: 4,
      running: 3,
      matching: 2,
      data_as_of: '2026-11-04T11:00:00.500000+00:00',
      lifetime_since: day(30),
      entities: [
        item('1201', 'Alpha', 'ACTIVE', 6.5, 'matched', 'Spend [Lifetime] (6.50 USD) ≥ 3.00 USD'),
        item('1205', 'Delta', 'ACTIVE', 0, 'matched', 'Spend [Lifetime] (3.00 USD) ≥ 3.00 USD'),
        item('1202', 'beta', 'ACTIVE', 2, 'not_met', 'Spend [Lifetime] 2.00 USD, needs ≥ 3.00 USD'),
        item('1203', 'Gamma', 'PAUSED', 9, 'inactive', 'Not active'),
      ],
      already_attached: false,
    });
    // Nothing stored: an empty listing.
    const empty = await owner();
    expect(await ok(empty, DRAFT, { account: empty.account.accountId, input: STOP }, 'ruleDraftPreview')).toMatchObject({
      total: 0, running: 0, matching: 0, data_as_of: null, lifetime_since: null, entities: [],
    });
  });

  it('refuses accounts and rules out of reach, and drafts that cannot run', async () => {
    const me = await seeded();
    const other = await owner();
    const rule = ((await ok(me, CREATE, { input: STOP }, 'ruleCreate')).rule as { id: number });
    expect(await refused(me, PREVIEW, { account: other.account.accountId, rule: rule.id })).toEqual([404, 'Ad account not found.']);
    expect(await refused(other, PREVIEW, { account: other.account.accountId, rule: rule.id })).toEqual([404, 'Preset not found.']);
    expect(await refused(me, DRAFT, { account: '999999999', input: STOP })).toEqual([404, 'Ad account not found.']);
    // A rule stored in a format that can no longer run.
    await db.query(`UPDATE rule_presets SET conditions = '[{"metric": "cpa", "operator": "gte", "value": 5}]' WHERE id = $1`, [rule.id]);
    expect(await refused(me, PREVIEW, { account: me.account.accountId, rule: rule.id })).toEqual([400, 'This rule has unsafe or outdated settings. Open it and save it again.']);
    expect(await refused(me, DRAFT, { account: me.account.accountId, input: { ...STOP, conditions: [] } })).toEqual([422, 'List should have at least 1 item after validation, not 0']);
    expect(await refused(me, DRAFT, { account: me.account.accountId, input: { ...STOP, action: 'increase_budget', budget_change_percent: 10 } }))
      .toEqual([422, 'Budget increase requires a positive daily ceiling']);
    expect(await refused(me, DRAFT, { account: me.account.accountId, input: { ...STOP, conditions: [{ metric: 'spend', operator: 'gt', value: 5 }, { metric: 'spend', operator: 'lt', value: 3 }] } }))
      .toEqual([422, 'Conditions contradict each other: “spend today” cannot fall into the given range.']);
  });
});
