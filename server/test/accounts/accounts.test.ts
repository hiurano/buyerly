import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import {
  AccountEntity,
  AuditEventEntity,
  StoppedAdSetEntity,
  UserEntity,
  WorkspaceMemberEntity,
  type WorkspaceEntity,
} from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';

// Ad account edits and stopped ad sets over GraphQL (tests/test_api.py,
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
});
