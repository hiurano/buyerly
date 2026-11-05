import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import {
  AccountEntity,
  AccountHealthEntity,
  AuditEventEntity,
  StoppedAdSetEntity,
  UserEntity,
  WorkspaceMemberEntity,
  type WorkspaceEntity,
} from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';

// The ad accounts list, ad account edits and stopped ad sets over GraphQL (tests/test_api.py,
// tests/test_workspace_isolation_security.py, tests/test_client_api.py),
// against either server.

interface GraphQLAnswer {
  data: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { statusCode?: number } }[];
}

const UPDATE = 'mutation($id: String!, $input: JSON!) { accountUpdate(accountId: $id, input: $input) { success lastSyncId account } }';
const LEAD = 'mutation($id: String!, $input: JSON!) { accountLeadUpdate(accountId: $id, input: $input) { success account } }';
const DELETE = 'mutation($id: String!) { accountDelete(accountId: $id) { success account } }';
const DISMISS = 'mutation($id: String!) { adSetDismiss(adSetId: $id) { success entity } }';

describe.skipIf(!DATABASE_URL)('ad accounts and stopped ad sets', () => {
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

  async function signIn(user: UserEntity, workspace: WorkspaceEntity): Promise<Member> {
    const browser = new Browser(target, { 'x-workspace-slug': workspace.slug });
    expect((await browser.signIn(user.email!)).status).toBe(200);
    const account = await db.getRepository(AccountEntity).findOneByOrFail({ workspaceId: workspace.id });
    return { browser, user, workspace, account };
  }

  async function owner(): Promise<Member> {
    const user = await createUser(db);
    return signIn(user, await createWorkspace(db, user));
  }

  async function joined(workspace: WorkspaceEntity, role = 'buyer'): Promise<Member> {
    const user = await createUser(db);
    await db.getRepository(WorkspaceMemberEntity).save({ workspaceId: workspace.id, userId: user.id, role, joinedAt: new Date() });
    await db.getRepository(UserEntity).update({ id: user.id }, { activeWorkspaceId: workspace.id });
    return signIn(user, workspace);
  }

  async function graphql(member: Member, query: string, variables?: Record<string, unknown>): Promise<GraphQLAnswer> {
    const answer = await member.browser.post('/api/graphql', { query, variables }, member.browser.csrf());
    expect(answer.status).toBe(200);
    return answer.body as GraphQLAnswer;
  }

  const refusal = (answer: GraphQLAnswer): [number | undefined, string | undefined] =>
    [answer.errors?.[0].extensions?.statusCode, answer.errors?.[0].message];

  async function blocked(user: UserEntity, action: string): Promise<number> {
    return db.getRepository(AuditEventEntity).countBy({ ownerUserId: user.id, action, eventType: 'UNAUTHORIZED_ACCESS_ATTEMPT', status: 'BLOCKED' });
  }

  async function stop(account: AccountEntity, values: Partial<StoppedAdSetEntity> = {}): Promise<StoppedAdSetEntity> {
    return db.getRepository(StoppedAdSetEntity).save(db.getRepository(StoppedAdSetEntity).create({
      accountId: account.accountId,
      adsetId: `${randomBytes(6).readUIntBE(0, 6)}`,
      adsetName: 'Broad 25-45',
      stopSpend: 12.5,
      stopLeads: 0,
      stopRegistrations: 1,
      isResolved: false,
      stoppedAt: new Date('2026-11-04T09:07:33.123Z'),
      updatedAt: new Date(),
      ...values,
    }));
  }

  describe('accountUpdate', () => {
    it('saves the name and note, stripped', async () => {
      const me = await owner();
      const saved = await graphql(me, UPDATE, { id: me.account.accountId.slice(4), input: { custom_name: '  Main  ', note: ' n ' } });
      expect(saved.errors).toBeUndefined();
      expect(saved.data!.accountUpdate).toMatchObject({
        success: true,
        account: { account_id: me.account.accountId, custom_name: 'Main', note: 'n', message: 'Name and note saved' },
      });
      expect(await db.getRepository(AccountEntity).findOneByOrFail({ id: me.account.id })).toMatchObject({ customName: 'Main', note: 'n' });
      // Left out, a field is cleared.
      await graphql(me, UPDATE, { id: me.account.accountId, input: { note: 'only' } });
      expect(await db.getRepository(AccountEntity).findOneByOrFail({ id: me.account.id })).toMatchObject({ customName: '', note: 'only' });
    });

    it('refuses bad bodies as pydantic does', async () => {
      const me = await owner();
      const id = me.account.accountId;
      expect(refusal(await graphql(me, UPDATE, { id, input: { custom_name: 'x'.repeat(121) } }))).toEqual([422, 'String should have at most 120 characters']);
      expect(refusal(await graphql(me, UPDATE, { id, input: { note: 5 } }))).toEqual([422, 'Input should be a valid string']);
      expect(refusal(await graphql(me, UPDATE, { id, input: { name: 'x' } }))).toEqual([422, 'Extra inputs are not permitted']);
    });

    it("refuses another workspace's account and records the attempt", async () => {
      const me = await owner();
      const other = await owner();
      expect(refusal(await graphql(me, UPDATE, { id: other.account.accountId, input: { custom_name: 'x' } }))).toEqual([404, 'Ad account not found.']);
      expect(refusal(await graphql(me, UPDATE, { id: 'act_404', input: {} }))).toEqual([404, 'Ad account not found.']);
      expect(await blocked(me.user, 'UPDATE_ACCOUNT_PROFILE')).toBe(1);
      expect((await db.getRepository(AccountEntity).findOneByOrFail({ id: other.account.id })).customName).toBe('');
    });

    it('lets a guest edit only the accounts of their teams', async () => {
      const me = await owner();
      const guest = await joined(me.workspace, 'guest');
      expect(refusal(await graphql(guest, UPDATE, { id: me.account.accountId, input: { custom_name: 'x' } }))).toEqual([404, 'Ad account not found.']);
    });
  });

  describe('accountLeadUpdate', () => {
    it('sets a member as the lead and clears it', async () => {
      const me = await owner();
      const buyer = await joined(me.workspace);
      const set = await graphql(me, LEAD, { id: me.account.accountId, input: { lead_user_id: buyer.user.id } });
      expect(set.data!.accountLeadUpdate).toEqual({ success: true, account: { account_id: me.account.accountId, lead_user_id: buyer.user.id } });
      expect((await db.getRepository(AccountEntity).findOneByOrFail({ id: me.account.id })).leadUserId).toBe(buyer.user.id);
      const cleared = await graphql(buyer, LEAD, { id: me.account.accountId, input: { lead_user_id: null } });
      expect(cleared.data!.accountLeadUpdate).toEqual({ success: true, account: { account_id: me.account.accountId, lead_user_id: null } });
    });

    it('refuses a lead from outside the workspace and accounts it does not see', async () => {
      const me = await owner();
      const other = await owner();
      expect(refusal(await graphql(me, LEAD, { id: me.account.accountId, input: { lead_user_id: other.user.id } })))
        .toEqual([400, 'The lead must be a member of this workspace']);
      expect(refusal(await graphql(me, LEAD, { id: other.account.accountId, input: {} }))).toEqual([404, 'Ad account not found']);
      expect(refusal(await graphql(me, LEAD, { id: me.account.accountId, input: { lead_user_id: 1.5 } })))
        .toEqual([422, 'Input should be a valid integer, got a number with a fractional part']);
      const guest = await joined(me.workspace, 'guest');
      expect(refusal(await graphql(guest, LEAD, { id: me.account.accountId, input: {} }))).toEqual([404, 'Ad account not found']);
    });
  });

  describe('accountDelete', () => {
    it('removes the account', async () => {
      const me = await owner();
      const deleted = await graphql(me, DELETE, { id: me.account.accountId.slice(4) });
      expect(deleted.data!.accountDelete).toEqual({ success: true, account: { success: true, message: `Ad account ${me.account.accountId} deleted` } });
      expect(await db.getRepository(AccountEntity).countBy({ id: me.account.id })).toBe(0);
    });

    it('refuses guests, and records attempts on another workspace', async () => {
      const me = await owner();
      const other = await owner();
      const guest = await joined(me.workspace, 'guest');
      expect(refusal(await graphql(guest, DELETE, { id: me.account.accountId }))).toEqual([403, "Guests can't perform deleting an ad account"]);
      expect(refusal(await graphql(me, DELETE, { id: other.account.accountId }))).toEqual([404, 'Ad account not found.']);
      expect(await blocked(me.user, 'DELETE_ACCOUNT')).toBe(1);
      expect(await db.getRepository(AccountEntity).countBy({ id: other.account.id })).toBe(1);
    });
  });

  describe('stopped ad sets', () => {
    it('lists the open ones, newest first, with the account currency', async () => {
      const me = await owner();
      const older = await stop(me.account, { stoppedAt: new Date('2026-11-03T23:59:59Z') });
      const newer = await stop(me.account);
      await stop(me.account, { isResolved: true });
      const { data, errors } = await graphql(me, '{ stoppedAdSets }');
      expect(errors).toBeUndefined();
      expect(data!.stoppedAdSets).toEqual([
        {
          id: newer.id,
          account_id: me.account.accountId,
          adset_id: newer.adsetId,
          adset_name: 'Broad 25-45',
          stop_spend: 12.5,
          currency: 'USD',
          stop_leads: 0,
          stop_registrations: 1,
          stopped_at: '2026-11-04 09:07',
        },
        expect.objectContaining({ id: older.id, stopped_at: '2026-11-03 23:59' }),
      ]);
      const guest = await joined(me.workspace, 'guest');
      expect((await graphql(guest, '{ stoppedAdSets }')).data!.stoppedAdSets).toEqual([]);
    });

    it('hides a card and logs it', async () => {
      const me = await owner();
      const stopped = await stop(me.account);
      const dismissed = await graphql(me, DISMISS, { id: stopped.adsetId });
      expect(dismissed.data!.adSetDismiss).toEqual({ success: true, entity: { success: true, message: 'Card hidden. The ad set remains off.' } });
      expect((await db.getRepository(StoppedAdSetEntity).findOneByOrFail({ id: stopped.id })).isResolved).toBe(true);
      const event = await db.getRepository(AuditEventEntity).findOneByOrFail({ adsetId: stopped.adsetId, eventType: 'HIDE_STOPPED_NOTIFICATION' });
      expect(event).toMatchObject({
        workspaceId: me.workspace.id,
        category: 'MANUAL_ACTION',
        action: 'HIDE_NOTIFICATION',
        actorType: 'user',
        accountId: me.account.accountId,
        entityLevel: 'adset',
        entityId: stopped.adsetId,
        entityName: 'Broad 25-45',
        afterState: { status: 'PAUSED', is_resolved: true },
      });
      expect(event.correlationId).toMatch(/^[0-9a-f]{32}$/);
    });

    it("refuses unknown and other workspaces' ad sets", async () => {
      const me = await owner();
      const other = await owner();
      const foreign = await stop(other.account);
      expect(refusal(await graphql(me, DISMISS, { id: 'nope' }))).toEqual([404, 'Record not found.']);
      expect(refusal(await graphql(me, DISMISS, { id: foreign.adsetId }))).toEqual([403, 'Access denied.']);
      expect(await blocked(me.user, 'DISMISS_ADSET')).toBe(1);
      const guest = await joined(me.workspace, 'guest');
      const mine = await stop(me.account);
      expect(refusal(await graphql(guest, DISMISS, { id: mine.adsetId }))).toEqual([403, 'Access denied.']);
      expect((await db.getRepository(StoppedAdSetEntity).findOneByOrFail({ id: foreign.id })).isResolved).toBe(false);
    });
  });

  describe('accounts', () => {
    const day = (offset: number, timeZone: string): string =>
      new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(new Date(Date.now() - offset * 86_400_000));

    async function fact(member: Member, account: AccountEntity, date: string, figures: Record<string, number>): Promise<void> {
      const value = (key: string) => figures[key] ?? 0;
      await db.query(
        `INSERT INTO analytics_entity_daily_facts
           (workspace_id, account_id, entity_level, entity_id, entity_name, parent_entity_id, date, currency,
            spend, impressions, reach, frequency, cpm, clicks, unique_clicks, link_clicks, outbound_clicks,
            landing_page_views, cpc, cpc_link, ctr, ctr_link, ctr_outbound, leads, registrations, purchases,
            cost_per_lead, cost_per_registration, cost_per_purchase, cost_per_landing_page_view, raw_actions,
            status, effective_status, daily_budget, fetched_at, updated_at)
         VALUES ($1, $2, 'account', $2, '', '', $3, 'USD', $4, $5, $6, 0, 0, $7, $8, $9, $10, $11, 0, 0, 0, 0, 0,
                 $12, $13, $14, 0, 0, 0, 0, '[]', 'ACTIVE', 'ACTIVE', 0, now(), now())`,
        [
          member.workspace.id, account.accountId, date, value('spend'), value('impressions'), value('reach'), value('clicks'),
          value('unique_clicks'), value('link_clicks'), value('outbound_clicks'), value('landing_page_views'),
          value('leads'), value('registrations'), value('purchases'),
        ],
      );
    }

    async function snapshot(member: Member, payload: unknown, createdAt: string): Promise<void> {
      await db.query(
        `INSERT INTO summary_snapshots (workspace_id, owner_user_id, period, payload, schema_version, generated_at, created_at)
         VALUES ($1, $2, 'today', $3::jsonb, 1, $4, $4)`,
        [member.workspace.id, member.user.id, JSON.stringify(payload), createdAt],
      );
    }

    const EMPTY = {
      period: 'today', data_status: 'synced', impressions: 0, reach: 0, clicks: 0, unique_clicks: 0, link_clicks: 0,
      outbound_clicks: 0, landing_page_views: 0, leads: 0, registrations: 0, purchases: 0, spend: null, frequency: null,
      cpm: null, cpl: null, cpreg: null, cpp: null, cpc: null, ctr: null, ctr_link: null, cpc_link: null, cost_per_lpv: null, roas: null,
    };

    it("lists the workspace's accounts with saved and today's figures, health and rules", async () => {
      const me = await owner();
      const accounts = db.getRepository(AccountEntity);
      await accounts.update({ id: me.account.id }, {
        timezoneName: 'Pacific/Kiritimati',
        currency: 'usd',
        customName: 'Mine',
        createdAt: new Date('2026-11-04T09:07:33Z'),
        activeRules: JSON.stringify([{ name: 'Stop', action: 'turn_off', logic: 'and', conditions: [{ metric: 'spend', operator: 'gte', value: 5 }] }, 'junk']),
      });
      const second = await accounts.save(accounts.create({
        accountId: `act_${randomBytes(6).readUIntBE(0, 6)}`, name: 'West', ownerUserId: me.user.id, workspaceId: me.workspace.id,
        timezoneName: 'America/Los_Angeles', currency: '', statusLabel: '', isActive: false, accountStatus: 2,
      }));
      const idle = await accounts.save(accounts.create({
        accountId: `act_${randomBytes(6).readUIntBE(0, 6)}`, name: 'Idle', ownerUserId: me.user.id, workspaceId: me.workspace.id,
        timezoneName: 'Not/AZone',
      }));

      // Today in each account's own day; yesterday's facts stay out.
      await fact(me, me.account, day(0, 'Pacific/Kiritimati'), { spend: 2.675, impressions: 3, reach: 2, clicks: 1, unique_clicks: 1, link_clicks: 1 });
      await fact(me, me.account, day(1, 'Pacific/Kiritimati'), { spend: 99, impressions: 1000, leads: 4 });
      await fact(me, second, day(0, 'America/Los_Angeles'), { spend: 0.125, leads: 1 });
      await fact(me, idle, day(1, 'UTC'), { spend: 5 });

      // The newest snapshot with a non-empty payload is the saved one.
      await snapshot(me, {
        generated_at: '2026-11-04T07:00:00Z',
        accounts: [{ account_id: me.account.accountId, spend: 50 }],
      }, '2026-11-04T07:00:01Z');
      await snapshot(me, {
        generated_at: '2026-11-05T08:00:00Z',
        accounts: [
          { account_id: me.account.accountId, data_status: 'synced', spend: '1.005', frequency: 0.125, cpm: 2.675, impressions: '12.7', cost_per_lead: 0.375 },
          { account_id: ` ${second.accountId} `, data_status: 'stale', leads: -2 },
        ],
      }, '2026-11-05T08:00:01.500Z');
      await snapshot(me, {}, '2026-11-05T09:00:00Z');

      await db.getRepository(AccountHealthEntity).save(db.getRepository(AccountHealthEntity).create({
        workspaceId: me.workspace.id, accountPk: me.account.id, status: 'degraded', cause: 'meta',
        signals: { token: 'expiring' }, consecutiveFailures: 2, lastErrorCode: '190', lastErrorMessage: 'Token expiring',
        lastCheckedAt: new Date('2026-11-05T10:00:00.123456Z'), lastSuccessAt: new Date('2026-11-05T09:00:00Z'),
      }));

      const { data, errors } = await graphql(me, '{ accounts }');
      expect(errors).toBeUndefined();
      const list = data!.accounts as Record<string, unknown>[];
      expect(list.map((item) => item.account_id)).toEqual([idle.accountId, second.accountId, me.account.accountId]);
      const [idleItem, secondItem, mine] = list;

      expect(mine).toMatchObject({
        id: me.account.id, name: 'Test account', custom_name: 'Mine', note: '', connection_type: 'system_user',
        owner_user_id: me.user.id, lead_user_id: null, workspace_id: me.workspace.id, owner_id: '', batch_name: '',
        timezone_name: 'Pacific/Kiritimati', currency: 'USD', account_status: 1, status_label: 'Active (ACTIVE)',
        rules_enabled: false, is_active: true, created_at: '2026-11-04 09:07',
      });
      expect(mine.active_rules).toHaveLength(1);
      expect(mine.active_rules).toMatchObject([{ name: 'Stop', action: 'turn_off' }]);
      // round(x, 2) of the stored float: 1.005 is 1.00499…, 0.125 and 0.375 are exact ties (to even).
      expect(mine.latest_metrics).toEqual({
        ...EMPTY, generated_at: '2026-11-05T08:00:00Z', saved_at: '2026-11-05T08:00:01.500000Z', data_status_label: '',
        spend: 1, frequency: 0.12, cpm: 2.67, impressions: 12, cpl: 0.38,
      });
      // Half up from the fact store, ratios in Python's order (spend / impressions * 1000).
      const today = mine.today_metrics as Record<string, unknown>;
      expect(today.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{6})?Z$/);
      expect({ ...today, generated_at: '' }).toEqual({
        ...EMPTY, generated_at: '', saved_at: '', data_status_label: 'Metrics loaded from the Analytics Fact Store',
        spend: 2.68, impressions: 3, reach: 2, clicks: 1, unique_clicks: 1, link_clicks: 1, frequency: 1.5, cpm: 893.33,
        cpc: 2.68, ctr: 33.33, ctr_link: 33.33, cpc_link: 2.68,
      });
      expect(mine.health).toEqual({
        status: 'degraded', cause: 'meta', signals: { token: 'expiring' }, consecutive_failures: 2,
        last_success_at: '2026-11-05T09:00:00+00:00', last_error_at: null, last_error_code: '190',
        last_error_message: 'Token expiring', last_checked_at: '2026-11-05T10:00:00.123000+00:00',
      });

      expect(secondItem).toMatchObject({ currency: 'UNKNOWN', status_label: 'Active (ACTIVE)', is_active: false, account_status: 2 });
      expect(secondItem.latest_metrics).toMatchObject({ data_status: 'error', leads: 0, spend: null });
      // A blocked account that synced today still has today's figures; no impressions, no ratio but 0.
      expect(secondItem.today_metrics).toMatchObject({ spend: 0.13, leads: 1, cpl: 0.13, cpm: 0, ctr: 0, cpc: 0, frequency: 0, ctr_link: 0, cpc_link: null });
      expect(secondItem.health).toMatchObject({ status: 'unknown', cause: 'none', signals: {} });

      expect(idleItem).toMatchObject({ timezone_name: 'Not/AZone', latest_metrics: null, today_metrics: null, active_rules: [] });
    });

    it("keeps another workspace's accounts and snapshots out, and files legacy accounts under the workspace", async () => {
      const me = await owner();
      const other = await owner();
      await snapshot(other, { generated_at: 'x', accounts: [{ account_id: me.account.accountId, spend: 1 }] }, '2026-11-05T08:00:00Z');
      const legacy = await db.getRepository(AccountEntity).save(db.getRepository(AccountEntity).create({
        accountId: `act_${randomBytes(6).readUIntBE(0, 6)}`, name: 'Legacy', ownerUserId: me.user.id, workspaceId: null,
        metaConnectionId: null,
      }));

      const { data, errors } = await graphql(me, '{ accounts }');
      expect(errors).toBeUndefined();
      const list = data!.accounts as Record<string, unknown>[];
      expect(list.map((item) => [item.account_id, item.workspace_id, item.latest_metrics])).toEqual([
        [legacy.accountId, me.workspace.id, null],
        [me.account.accountId, me.workspace.id, null],
      ]);
    });

    it('lets a guest see only the accounts of their teams', async () => {
      const me = await owner();
      const guest = await joined(me.workspace, 'guest');
      const { data, errors } = await graphql(guest, '{ accounts }');
      expect(errors).toBeUndefined();
      expect(data!.accounts).toEqual([]);
    });
  });
});
