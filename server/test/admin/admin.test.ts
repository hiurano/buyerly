import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import {
  AccountEntity,
  AccountHealthEntity,
  AuditEventEntity,
  UserEntity,
  type WorkspaceEntity,
} from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';

// Platform administration and the reliability overview over GraphQL
// (api/routers/admin_support.py, auth.py get_admin_overview, health.py),
// against either server.

interface GraphQLAnswer {
  data: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { statusCode?: number } }[];
}

interface Grant {
  id: number;
  workspace_id: number;
  workspace_name: string;
  user_id: number;
  role: string;
  reason: string;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
  is_active: boolean;
}

const CREATE = 'mutation($input: JSON!) { supportSessionCreate(input: $input) { success lastSyncId supportSession } }';
const REVOKE = 'mutation($id: Int!) { supportSessionRevoke(id: $id) { success } }';
const SESSIONS = 'query($activeOnly: Boolean!) { supportSessions(activeOnly: $activeOnly) }';

describe.skipIf(!DATABASE_URL)('platform administration and health overview', () => {
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

  interface Person { browser: Browser; user: UserEntity; workspace: WorkspaceEntity }

  async function person(role: 'admin' | 'buyer' = 'buyer'): Promise<Person> {
    const user = await createUser(db, { role });
    const workspace = await createWorkspace(db, user);
    const browser = new Browser(target, { 'x-workspace-slug': workspace.slug });
    expect((await browser.signIn(user.email!)).status).toBe(200);
    return { browser, user, workspace };
  }

  async function graphql(who: Person, query: string, variables?: Record<string, unknown>, slug?: string): Promise<GraphQLAnswer> {
    const headers = { ...who.browser.csrf(), ...(slug ? { 'x-workspace-slug': slug } : {}) };
    const answer = await who.browser.post('/api/graphql', { query, variables }, headers);
    expect(answer.status).toBe(200);
    return answer.body as GraphQLAnswer;
  }

  function refusal(answer: GraphQLAnswer): [number | undefined, string | undefined] {
    return [answer.errors?.[0]?.extensions?.statusCode, answer.errors?.[0]?.message];
  }

  async function events(workspaceId: number, eventType: string): Promise<AuditEventEntity[]> {
    return db.getRepository(AuditEventEntity).find({ where: { workspaceId, eventType }, order: { id: 'ASC' } });
  }

  it('is for platform administrators only', async () => {
    const buyer = await person();
    expect(refusal(await graphql(buyer, '{ adminOverview }'))).toEqual([403, 'Administrators only']);
    const onlyAdmins = [403, 'Platform global administrator rights are required'];
    expect(refusal(await graphql(buyer, SESSIONS, { activeOnly: true }))).toEqual(onlyAdmins);
    expect(refusal(await graphql(buyer, CREATE, { input: { workspace_id: buyer.workspace.id, reason: 'Looking around here' } })))
      .toEqual(onlyAdmins);
    expect(refusal(await graphql(buyer, REVOKE, { id: 1 }))).toEqual(onlyAdmins);
  });

  it('lists every user, workspace, membership and invite', async () => {
    const admin = await person('admin');
    const buyer = await person();
    const { data } = await graphql(admin, '{ adminOverview }');
    const overview = data!.adminOverview as Record<string, Record<string, unknown>[]>;
    const user = overview.users.find((row) => row.id === buyer.user.id)!;
    expect(user).toMatchObject({ username: buyer.user.username, email: buyer.user.email, role: 'buyer', is_approved: true,
      first_name: '', last_name: '', active_workspace_id: buyer.workspace.id });
    expect(user.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{6})?Z$/);
    expect(overview.workspaces.find((row) => row.id === buyer.workspace.id))
      .toMatchObject({ name: buyer.workspace.name, slug: buyer.workspace.slug, owner_user_id: buyer.user.id });
    expect(overview.members.find((row) => row.workspace_id === buyer.workspace.id))
      .toMatchObject({ user_id: buyer.user.id, role: 'owner' });
    expect(Object.keys(overview)).toEqual(['users', 'workspaces', 'members', 'invites']);
  });

  it('opens, lists and revokes support sessions, each in the audit log', async () => {
    const admin = await person('admin');
    const customer = await person();
    const id = customer.workspace.id;

    expect(refusal(await graphql(admin, CREATE, { input: { workspace_id: id, reason: 'short' } })))
      .toEqual([422, 'String should have at least 10 characters']);
    expect(refusal(await graphql(admin, CREATE, { input: { workspace_id: id, reason: 'Customer asked', duration_minutes: 241 } })))
      .toEqual([422, 'Input should be less than or equal to 240']);
    expect(refusal(await graphql(admin, CREATE, { input: { workspace_id: 2_000_000_000, reason: 'Customer asked for help' } })))
      .toEqual([404, 'Target workspace not found']);

    // Before a grant the admin cannot act in the workspace.
    const outside = await admin.browser.post('/api/graphql', { query: '{ healthOverview }' },
      { ...admin.browser.csrf(), 'x-workspace-slug': customer.workspace.slug });
    expect(outside.status === 200 ? (outside.body as GraphQLAnswer).errors : outside.status).toBeTruthy();

    const first = await graphql(admin, CREATE, { input: { workspace_id: id, reason: '  Customer asked for help  ' } });
    const payload = first.data!.supportSessionCreate as { success: boolean; lastSyncId: number; supportSession: Grant };
    expect(payload.success).toBe(true);
    expect(payload.supportSession).toMatchObject({
      workspace_id: id, workspace_name: customer.workspace.name, user_id: admin.user.id, role: 'admin',
      reason: 'Customer asked for help', revoked_at: null, is_active: true,
    });
    const minutes = (Date.parse(payload.supportSession.expires_at) - Date.parse(payload.supportSession.created_at)) / 60_000;
    expect(Math.round(minutes)).toBe(30);
    const [granted] = await events(id, 'SUPPORT_SESSION_GRANTED');
    expect(granted).toMatchObject({
      ownerUserId: admin.user.id, actorType: 'user', actorId: String(admin.user.id), category: 'SECURITY',
      status: 'SUCCESS', action: 'CREATE_SUPPORT_SESSION',
      message: `Support session created for workspace '${customer.workspace.name}' for 30 min. Reason: Customer asked for help`,
      details: { grant_id: payload.supportSession.id, workspace_id: id, workspace_name: customer.workspace.name,
        duration_minutes: 30, expires_at: payload.supportSession.expires_at, reason: 'Customer asked for help' },
    });

    // The grant lets the admin into the workspace.
    const health = await graphql(admin, '{ healthOverview }', undefined, customer.workspace.slug);
    expect(health.errors).toBeUndefined();

    // A second grant ends the first.
    const second = (await graphql(admin, CREATE, { input: { workspace_id: id, reason: 'Still looking into it', duration_minutes: 5 } }))
      .data!.supportSessionCreate as { supportSession: Grant };
    const active = (await graphql(admin, SESSIONS, { activeOnly: true })).data!.supportSessions as Grant[];
    expect(active.map((grant) => grant.id)).toEqual([second.supportSession.id]);
    const all = (await graphql(admin, SESSIONS, { activeOnly: false })).data!.supportSessions as Grant[];
    expect(all.map((grant) => grant.id)).toEqual([second.supportSession.id, payload.supportSession.id]);
    expect(all[1].is_active).toBe(false);
    expect(all[1].revoked_at).toMatch(/Z$/);
    // The default is active ones only.
    expect((await graphql(admin, '{ supportSessions }')).data!.supportSessions).toEqual(active);

    expect((await graphql(admin, REVOKE, { id: second.supportSession.id })).data!.supportSessionRevoke).toEqual({ success: true });
    expect((await graphql(admin, REVOKE, { id: second.supportSession.id })).data!.supportSessionRevoke).toEqual({ success: true });
    const revoked = await events(id, 'SUPPORT_SESSION_REVOKED');
    expect(revoked).toHaveLength(1);
    expect(revoked[0]).toMatchObject({
      action: 'REVOKE_SUPPORT_SESSION', category: 'SECURITY',
      message: `Support session #${second.supportSession.id} was revoked by an administrator.`,
      details: { grant_id: second.supportSession.id, workspace_id: id },
    });
    expect((await graphql(admin, SESSIONS, { activeOnly: true })).data!.supportSessions).toEqual([]);

    // Another admin's grant is not theirs to revoke.
    const other = await person('admin');
    expect(refusal(await graphql(other, REVOKE, { id: payload.supportSession.id }))).toEqual([404, 'Support session not found']);
  });

  it("reports the workspace's health and its ad accounts", async () => {
    const owner = await person();
    const [account] = await db.getRepository(AccountEntity).findBy({ workspaceId: owner.workspace.id });
    await db.getRepository(AccountEntity).update({ id: account.id }, { customName: 'Renamed' });
    const second = await db.getRepository(AccountEntity).save(db.getRepository(AccountEntity).create({
      accountId: `${account.accountId}9`, name: 'Another', ownerUserId: owner.user.id, workspaceId: owner.workspace.id,
      timezoneName: 'UTC', currency: 'USD', rulesEnabled: false, isActive: true,
    }));
    await db.getRepository(AccountHealthEntity).save(db.getRepository(AccountHealthEntity).create({
      workspaceId: owner.workspace.id, accountPk: second.id, status: 'degraded', cause: 'token',
      signals: { token: 'expiring' }, consecutiveFailures: 2, lastErrorCode: '190', lastErrorMessage: 'Token expiring',
      lastCheckedAt: new Date('2026-11-05T10:00:00.123456Z'), lastSuccessAt: new Date('2026-11-05T09:00:00Z'),
    }));

    const { data, errors } = await graphql(owner, '{ healthOverview }');
    expect(errors).toBeUndefined();
    const overview = data!.healthOverview as Record<string, Record<string, unknown>>;
    expect(overview.counts).toEqual({ healthy: 0, degraded: 1, critical: 0, unknown: 1 });
    // Ordered by the accounts' own names.
    expect(overview.accounts).toEqual([
      {
        id: second.id, account_id: second.accountId, name: 'Another', status: 'degraded', cause: 'token',
        signals: { token: 'expiring' }, consecutive_failures: 2, last_success_at: '2026-11-05T09:00:00+00:00',
        last_error_at: null, last_error_code: '190', last_error_message: 'Token expiring',
        last_checked_at: '2026-11-05T10:00:00.123000+00:00',
      },
      {
        id: account.id, account_id: account.accountId, name: 'Renamed', status: 'unknown', cause: 'none', signals: {},
        consecutive_failures: 0, last_success_at: null, last_error_at: null, last_error_code: '', last_error_message: '',
        last_checked_at: null,
      },
    ]);
    expect(['critical', 'degraded']).toContain(overview.overall_status);
    expect(overview.signals).toMatchObject({
      api_availability_target_percent: 99.9, action_error_rate_24h_percent: 0, token_problem_count: 0,
      worker_cycle_lag_warning_seconds: 180, worker_cycle_lag_critical_seconds: 360, backup_age_critical_hours: 48,
    });
    expect(Object.keys(overview.signals)).toHaveLength(23);
    expect(overview.alert_routes).toEqual({ account_transition: 'Audit Log', release_or_platform: 'GitHub Actions + production runbook' });
    expect(overview.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{6})?\+00:00$/);
  });
});
