import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import {
  AccountEntity,
  AuditEventEntity,
  DeletedItemEntity,
  TeamAccountEntity,
  TeamEntity,
  UserEntity,
  WorkspaceMemberEntity,
  type WorkspaceEntity,
} from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase, unique } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';

// The audit log and Recently deleted over GraphQL (tests/test_api.py
// audit-events and deleted-items cases, tests/test_client_api.py), against
// either server.

interface GraphQLAnswer {
  data: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { statusCode?: number } }[];
}

interface AuditPage {
  items: Record<string, unknown>[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  status_counts: Record<string, number>;
}

const AUDIT = `query($page: Int, $pageSize: Int, $category: String, $status: String, $accountId: String, $search: String, $dateFrom: String, $dateTo: String) {
  auditEvents(page: $page, pageSize: $pageSize, category: $category, status: $status, accountId: $accountId, search: $search, dateFrom: $dateFrom, dateTo: $dateTo)
}`;

const HOUR = 60 * 60 * 1000;

describe.skipIf(!DATABASE_URL)('audit log and Recently deleted', () => {
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

  interface Member { browser: Browser; user: UserEntity; workspace: WorkspaceEntity }

  async function signIn(user: UserEntity, workspace: WorkspaceEntity): Promise<Browser> {
    const browser = new Browser(target, { 'x-workspace-slug': workspace.slug });
    expect((await browser.signIn(user.email!)).status).toBe(200);
    return browser;
  }

  async function owner(): Promise<Member> {
    const user = await createUser(db, { fullName: 'Olga Owner' });
    const workspace = await createWorkspace(db, user);
    return { browser: await signIn(user, workspace), user, workspace };
  }

  async function joined(workspace: WorkspaceEntity, role: string): Promise<Member & { memberId: number }> {
    const user = await createUser(db);
    const member = await db.getRepository(WorkspaceMemberEntity).save({ workspaceId: workspace.id, userId: user.id, role, joinedAt: new Date() });
    await db.getRepository(UserEntity).update({ id: user.id }, { activeWorkspaceId: workspace.id });
    return { browser: await signIn(user, workspace), user, workspace, memberId: member.id };
  }

  async function graphql(member: Member, query: string, variables?: Record<string, unknown>): Promise<GraphQLAnswer> {
    const answer = await member.browser.post('/api/graphql', { query, variables }, member.browser.csrf());
    expect(answer.status).toBe(200);
    return answer.body as GraphQLAnswer;
  }

  async function audit(member: Member, variables: Record<string, unknown> = {}): Promise<AuditPage> {
    const { data, errors } = await graphql(member, AUDIT, variables);
    expect(errors).toBeUndefined();
    return data!.auditEvents as AuditPage;
  }

  function event(workspace: WorkspaceEntity, fields: Partial<AuditEventEntity>): Promise<AuditEventEntity> {
    return db.getRepository(AuditEventEntity).save(db.getRepository(AuditEventEntity).create({
      workspaceId: workspace.id,
      ownerUserId: workspace.ownerUserId,
      eventType: 'STOP',
      status: 'SUCCESS',
      accountId: '',
      correlationId: unique('cycle'),
      ...fields,
    }));
  }

  describe('auditEvents', () => {
    it('filters, counts and pages the workspace history', async () => {
      const me = await owner();
      const stranger = await owner();
      await event(me.workspace, { category: 'RULE_ACTION', accountId: 'act_1', accountName: 'Buyer account', adsetId: 'buyer_adset', message: 'Buyer event' });
      await event(me.workspace, { category: 'ACCOUNT_HEALTH', eventType: 'TOKEN_EXPIRED', status: 'ERROR', accountId: 'act_2', message: 'Token event' });
      await event(me.workspace, { category: 'RULE_ACTION', accountId: 'act_3', message: 'Other event' });
      await event(stranger.workspace, { category: 'RULE_ACTION', message: 'Buyer elsewhere' });

      const all = await audit(me);
      expect([all.total, all.page, all.page_size, all.total_pages]).toEqual([3, 1, 25, 1]);
      expect(all.status_counts).toEqual({ SUCCESS: 2, ERROR: 1, REVERTED: 0 });

      const searched = await audit(me, { category: 'rule_action', search: ' buyer ' });
      expect(searched.total).toBe(1);
      expect(searched.items[0]).toMatchObject({ adset_id: 'buyer_adset', owner_user_id: null, display_status: 'SUCCESS', is_reverted: false });

      const errorsOnly = await audit(me, { status: 'error' });
      expect(errorsOnly.total).toBe(1);
      expect(errorsOnly.status_counts).toEqual({ SUCCESS: 2, ERROR: 1, REVERTED: 0 });

      const paged = await audit(me, { pageSize: 2, page: 2 });
      expect([paged.total, paged.total_pages, paged.items.length]).toEqual([3, 2, 1]);
      expect((await audit(me, { accountId: 'act_2' })).items.map((item) => item.message)).toEqual(['Token event']);
    });

    it('serializes a row as the Python route does', async () => {
      const me = await owner();
      const created = new Date('2026-01-02T03:04:05.000Z');
      const row = await event(me.workspace, {
        category: 'MANUAL_ACTION', eventType: 'RESTORE_RULE_PRESET', actorType: 'user', actorId: '42',
        ruleName: 'Rule', action: 'RESTORE', message: 'Restored', beforeState: { deleted: true }, afterState: { deleted: false },
        details: { restored_account_ids: [] }, durationMs: 0, createdAt: created,
      });
      const [item] = (await audit(me)).items;
      expect(item).toEqual({
        id: row.id,
        owner_user_id: null,
        workspace_id: me.workspace.id,
        actor_type: 'user',
        actor_id: '42',
        category: 'MANUAL_ACTION',
        event_type: 'RESTORE_RULE_PRESET',
        status: 'SUCCESS',
        account_id: '',
        account_name: row.accountName,
        adset_id: row.adsetId,
        adset_name: row.adsetName,
        entity_level: row.entityLevel,
        entity_id: row.entityId,
        entity_name: row.entityName,
        rule_id: null,
        rule_name: 'Rule',
        action: 'RESTORE',
        message: 'Restored',
        before_state: { deleted: true },
        after_state: { deleted: false },
        details: { restored_account_ids: [] },
        correlation_id: row.correlationId,
        reverts_event_id: null,
        reverted_by_event_id: null,
        is_reverted: false,
        display_status: 'SUCCESS',
        can_undo: false,
        undo_reason: 'This event cannot be reversed by an opposite command.',
        duration_ms: 0,
        created_at: '2026-01-02T03:04:05Z',
      });
      await db.query("UPDATE audit_events SET created_at = '2026-01-02T03:04:05.123456Z' WHERE id = $1", [row.id]);
      expect((await audit(me)).items[0].created_at).toBe('2026-01-02T03:04:05.123456Z');
      expect((await audit(me, { dateFrom: '2026-01-02T03:04:06Z' })).total).toBe(0);
      expect((await audit(me, { dateFrom: '2026-01-02', dateTo: '2026-01-03T00:00:00' })).total).toBe(1);
    });

    it('says which action can still be undone', async () => {
      const me = await owner();
      const viewer = await joined(me.workspace, 'guest');
      const old = await event(me.workspace, { accountId: 'act_9', entityId: 'adset_1', createdAt: new Date(Date.now() - 2 * HOUR) });
      const latest = await event(me.workspace, { accountId: 'act_9', entityId: 'adset_1', eventType: 'DECREASE_BUDGET', createdAt: new Date(Date.now() - HOUR) });
      const stale = await event(me.workspace, { accountId: 'act_9', entityLevel: 'campaign', entityId: 'campaign_1', createdAt: new Date(Date.now() - 25 * HOUR) });
      const undone = await event(me.workspace, { accountId: 'act_9', adsetId: 'adset_2', createdAt: new Date(Date.now() - HOUR) });
      const undo = await event(me.workspace, { accountId: 'act_9', adsetId: 'adset_2', eventType: 'UNDO_ACTION', revertsEventId: undone.id, category: 'MANUAL_ACTION' });

      const byId = new Map((await audit(me)).items.map((item) => [item.id, item]));
      expect(byId.get(latest.id)).toMatchObject({ can_undo: true, undo_reason: '' });
      expect(byId.get(old.id)).toMatchObject({ can_undo: false, undo_reason: 'The ad set has changed since this event.' });
      expect(byId.get(stale.id)).toMatchObject({ can_undo: false, undo_reason: 'The 24-hour safe undo window has closed.' });
      expect(byId.get(undone.id)).toMatchObject({
        can_undo: false, undo_reason: 'This action has already been undone.', is_reverted: true,
        reverted_by_event_id: undo.id, display_status: 'REVERTED',
      });
      const reverted = await audit(me, { status: 'reverted' });
      expect(reverted.items.map((item) => item.id)).toEqual([undone.id]);
      expect(reverted.status_counts.REVERTED).toBe(1);

      // A guest sees nothing off their teams, and could not undo it anyway.
      expect((await audit(viewer)).total).toBe(0);
    });

    it("keeps a private team's accounts out of other members' history", async () => {
      const me = await owner();
      const buyer = await joined(me.workspace, 'buyer');
      const account = await db.getRepository(AccountEntity).findOneByOrFail({ workspaceId: me.workspace.id });
      const team = await db.getRepository(TeamEntity).save(db.getRepository(TeamEntity).create({
        workspaceId: me.workspace.id, name: unique('Private'), key: 'PRV', private: true, createdByUserId: me.user.id,
      }));
      await db.getRepository(TeamAccountEntity).save({ teamId: team.id, accountId: account.id, createdAt: new Date() });
      await event(me.workspace, { accountId: account.accountId, message: 'Private' });
      // An account id that is no account of the workspace is no visible account either.
      await event(me.workspace, { accountId: 'act_open', message: 'Open' });
      await event(me.workspace, { accountId: '', message: 'Workspace' });
      expect((await audit(buyer)).items.map((item) => item.message)).toEqual(['Workspace']);
    });

    it("checks the arguments as the route's Query(...) does", async () => {
      const me = await owner();
      const refusal = async (variables: Record<string, unknown>) => {
        const { errors } = await graphql(me, AUDIT, variables);
        return [errors?.[0].extensions?.statusCode, errors?.[0].message];
      };
      expect(await refusal({ pageSize: 1000 })).toEqual([422, 'Input should be less than or equal to 100']);
      expect(await refusal({ page: 0 })).toEqual([422, 'Input should be greater than or equal to 1']);
      expect(await refusal({ category: 'x'.repeat(41) })).toEqual([422, 'String should have at most 40 characters']);
    });
  });

  describe('deletedItems', () => {
    it('lists what was deleted, newest first, and drops what is past 30 days', async () => {
      const me = await owner();
      const items = db.getRepository(DeletedItemEntity);
      const older = await items.save(items.create({
        workspaceId: me.workspace.id, kind: 'rule_group', entityId: 9_000_001, name: 'Label', snapshot: {},
        deletedByUserId: null, deletedAt: new Date('2026-11-01T10:00:00.000Z'),
      }));
      const newer = await items.save(items.create({
        workspaceId: me.workspace.id, kind: 'rule', entityId: 9_000_002, name: 'Rule', snapshot: {},
        deletedByUserId: me.user.id, deletedAt: new Date(),
      }));
      const expired = await items.save(items.create({
        workspaceId: me.workspace.id, kind: 'rule', entityId: 9_000_003, name: 'Old', snapshot: {},
        deletedByUserId: me.user.id, deletedAt: new Date(Date.now() - 31 * 24 * HOUR),
      }));
      await db.query("UPDATE deleted_items SET deleted_at = '2026-11-01T10:00:00.5Z' WHERE id = $1", [older.id]);

      const { data, errors } = await graphql(me, '{ deletedItems }');
      expect(errors).toBeUndefined();
      const listed = data!.deletedItems as Record<string, unknown>[];
      expect(listed.map((item) => item.id)).toEqual([newer.id, older.id]);
      expect(listed[0]).toMatchObject({ kind: 'rule', entity_id: 9_000_002, name: 'Rule', deleted_by: 'Olga Owner' });
      expect(listed[1]).toEqual({
        id: older.id, kind: 'rule_group', entity_id: 9_000_001, name: 'Label',
        deleted_at: '2026-11-01T10:00:00.500000Z', purge_at: '2026-12-01T10:00:00.500000Z', deleted_by: '',
      });
      expect(await items.findOneBy({ id: expired.id })).toBeNull();
    });
  });
});
