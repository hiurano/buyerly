import { gzipSync } from 'node:zlib';
import { SYNCED_MODELS, type SyncArchivedModels, type SyncBootstrap, type SyncDelta, type SyncRow } from '@buyerly/shared';
import { describe, expect, it } from 'vitest';
import {
  AccountEntity,
  AuditEventEntity,
  DeletedItemEntity,
  FavoriteEntity,
  InboxNotificationStateEntity,
  RuleGroupEntity,
  TeamEntity,
  WorkspaceMemberEntity,
} from '../../src/entities/index.ts';
import { SYNCED_TABLES } from '../../src/sync/log.ts';
import { Browser } from '../support/browser.ts';
import { save, syncWorld, idsOf, type SyncWorld, type Who } from '../support/sync-world.ts';
import { CONTRACT_TARGET } from '../support/target.ts';
import type { SyncContext } from './sync.test.ts';

// GET /api/sync/bootstrap and /api/sync/archived-models (tests/test_sync_bootstrap.py).

export async function logMax(world: Pick<SyncWorld, 'db'>): Promise<number> {
  const [row] = await world.db.query<{ max: string | null }[]>('SELECT max(sync_id) AS max FROM sync_actions');
  return Number(row?.max ?? 0);
}

export function bootstrapCases(context: SyncContext): void {
  describe('bootstrap', () => {
    async function bootstrap(world: SyncWorld, who: Who): Promise<SyncBootstrap> {
      const response = await (await world.browser(who)).get('/api/sync/bootstrap');
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      return response.json<SyncBootstrap>();
    }

    async function archived(world: SyncWorld, who: Who): Promise<SyncArchivedModels> {
      const response = await (await world.browser(who)).get('/api/sync/archived-models');
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      return response.json<SyncArchivedModels>();
    }

    const set = (...values: number[]) => new Set(values);

    it('returns every synced model of the workspace', async () => {
      const world = await syncWorld(context.db, context.target);
      const payload = await bootstrap(world, 'owner');
      const { models } = payload;
      // In the server's order, every model once.
      expect(Object.keys(models)).toEqual([...SYNCED_MODELS]);
      expect(idsOf(payload, 'Workspace')).toEqual(set(world.ws.id));
      expect(idsOf(payload, 'WorkspaceMember')).toEqual(set(world.members.owner.id, world.members.buyer.id, world.members.guest.id));
      expect(idsOf(payload, 'User')).toEqual(set(world.users.owner.id, world.users.buyer.id, world.users.guest.id));
      expect(idsOf(payload, 'Team')).toEqual(set(world.teams.public.id, world.teams.private.id));
      expect(models.TeamMember).toHaveLength(3);
      expect(models.TeamAccount).toHaveLength(2);
      expect(idsOf(payload, 'Account')).toEqual(set(world.accounts.loose.id, world.accounts.shared.id, world.accounts.hidden.id));
      expect(idsOf(payload, 'Rule')).toEqual(set(world.rule.id));
      expect(idsOf(payload, 'Label')).toEqual(set(world.label.id));
      expect(idsOf(payload, 'InboxEvent')).toEqual(set(world.events.hidden.id, world.events.shared.id, world.events.loose.id));
      expect(models.Favorite.map((row) => row.title)).toEqual(['Rules']);
      // Others' Inbox state, favorites and views are theirs.
      expect(models.InboxNotificationState).toEqual([]);
      expect(models.ViewSetting).toEqual([]);

      // Rows are what the log sends: the whole row less secrets and bookkeeping.
      const hidden = models.Account.find((row) => row.id === world.accounts.hidden.id)!;
      expect([hidden.account_id, hidden.name, hidden.workspace_id]).toEqual([world.accounts.hidden.accountId, 'Private', world.ws.id]);
      for (const secret of SYNCED_TABLES.accounts.excluded) expect(hidden).not.toHaveProperty(secret);
      for (const row of models.User) for (const secret of SYNCED_TABLES.users.excluded) expect(row).not.toHaveProperty(secret);

      // A member's own Inbox options reach them alone.
      const members = new Map(models.WorkspaceMember.map((row) => [row.id, row]));
      expect(members.get(world.members.owner.id)!.inbox_display).toEqual({ ordering: 'newest' });
      expect(members.get(world.members.buyer.id)).not.toHaveProperty('inbox_display');
      const buyerMembers = new Map((await bootstrap(world, 'buyer')).models.WorkspaceMember.map((row) => [row.id, row]));
      expect(buyerMembers.get(world.members.owner.id)).not.toHaveProperty('inbox_display');
      expect(buyerMembers.get(world.members.buyer.id)).toHaveProperty('inbox_read_before');

      const groups = [
        `member:${world.members.owner.id}`,
        `team:${world.teams.public.id}`,
        `team:${world.teams.private.id}`,
        `workspace:${world.ws.id}`,
        `workspace:${world.ws.id}:members`,
      ].sort();
      expect(payload.sync_groups).toEqual(groups);
    });

    it('sends nothing from another workspace', async () => {
      const world = await syncWorld(context.db, context.target);
      const payload = await bootstrap(world, 'owner');
      const rows: SyncRow[] = Object.values(payload.models).flat();
      expect(rows.filter((row) => row.workspace_id === world.other.id)).toEqual([]);
      expect(idsOf(payload, 'Team')).not.toContain(world.teams.elsewhere.id);
      expect(idsOf(payload, 'User')).not.toContain(world.users.stranger.id);
      expect(idsOf(payload, 'Workspace')).toEqual(set(world.ws.id));
    });

    it('is compressed when the client accepts it', async () => {
      const world = await syncWorld(context.db, context.target);
      const browser = await world.browser('owner');
      const zipped = await browser.get('/api/sync/bootstrap', { 'accept-encoding': 'gzip' });
      expect(zipped.headers['content-encoding']).toBe('gzip');
      expect(zipped.headers['cache-control']).toBe('no-store');
      // The Python API's CORS middleware adds Origin, on forwarded answers too.
      expect(zipped.headers['vary']).toMatch(/^Accept-Encoding\b/);
      expect(zipped.headers['content-type']).toBe('application/json');
      expect(zipped.json<SyncBootstrap>().models.Workspace[0].id).toBe(world.ws.id);
      const raw = await browser.get('/api/sync/bootstrap', { 'accept-encoding': 'identity' });
      expect(raw.headers['content-encoding']).toBeUndefined();
      // The models; other test files' writes may move the sync id in between.
      expect(raw.json<SyncBootstrap>().models).toEqual(zipped.json<SyncBootstrap>().models);
      const text = JSON.stringify(raw.body);
      expect(gzipSync(text).length).toBeLessThan(text.length);
    });

    it('needs a signed-in member', async () => {
      for (const path of ['/api/sync/bootstrap', '/api/sync/archived-models']) {
        const response = await new Browser(context.target).get(path);
        expect(response.status).toBe(401);
        expect(response.json()).toEqual({ detail: 'Sign-in is required' });
      }
    });

    it('answers 404 to a member without a workspace', async () => {
      const world = await syncWorld(context.db, context.target);
      const browser = new Browser(context.target);
      await browser.signIn(world.users.buyer.email!);
      await context.db.getRepository(WorkspaceMemberEntity).delete({ userId: world.users.buyer.id });
      for (const path of ['/api/sync/bootstrap', '/api/sync/archived-models', '/api/sync/delta?since=0']) {
        const response = await browser.get(path);
        expect(response.status, path).toBe(404);
        expect(response.json()).toEqual({ detail: 'Workspace not found.' });
      }
    });

    it('refuses a workspace the member is not in', async () => {
      const world = await syncWorld(context.db, context.target);
      const response = await (await world.browser('buyer')).get('/api/sync/bootstrap', { 'x-workspace-slug': world.other.slug });
      expect(response.status).toBe(403);
      expect(response.json()).toEqual({ detail: 'Workspace access denied' });
    });

    it('gives each member their groups only', async () => {
      const world = await syncWorld(context.db, context.target);
      const buyer = await bootstrap(world, 'buyer');
      expect(idsOf(buyer, 'Team')).toEqual(set(world.teams.public.id));
      expect(idsOf(buyer, 'Account')).toEqual(set(world.accounts.loose.id, world.accounts.shared.id));
      expect(new Set(buyer.models.TeamAccount.map((row) => row.team_id))).toEqual(set(world.teams.public.id));
      expect(new Set(buyer.models.TeamMember.map((row) => row.team_id))).toEqual(set(world.teams.public.id));
      expect(idsOf(buyer, 'InboxEvent')).toEqual(set(world.events.shared.id, world.events.loose.id));
      expect(idsOf(buyer, 'Rule')).toEqual(set(world.rule.id));
      expect(buyer.models.InboxNotificationState.map((row) => row.audit_event_id)).toEqual([world.events.shared.id]);
      expect(buyer.models.Favorite.map((row) => row.title)).toEqual(['Ad accounts']);

      // A guest sees their teams' data and the workspace's people, nothing workspace-wide beyond that.
      const guest = await bootstrap(world, 'guest');
      expect(idsOf(guest, 'Team')).toEqual(set(world.teams.public.id));
      expect(idsOf(guest, 'Account')).toEqual(set(world.accounts.shared.id));
      expect(idsOf(guest, 'InboxEvent')).toEqual(set(world.events.shared.id));
      expect(guest.models.Rule).toEqual([]);
      expect(guest.models.RuleLabel).toEqual([]);
      expect(idsOf(guest, 'Label')).toEqual(set(world.label.id));
      expect(idsOf(guest, 'User')).toEqual(set(world.users.owner.id, world.users.buyer.id, world.users.guest.id));
      expect(guest.models.ViewSetting.map((row) => row.view_key)).toEqual(['rules']);
      expect(guest.sync_groups).not.toContain(`workspace:${world.ws.id}:members`);
    });

    it('returns only rows in one of the member\'s groups, as the log would send them', async () => {
      const world = await syncWorld(context.db, context.target);
      for (const who of ['owner', 'buyer', 'guest'] as const) {
        const payload = await bootstrap(world, who);
        const groups = new Set(payload.sync_groups);
        for (const [model, rows] of Object.entries(payload.models)) {
          const table = Object.entries(SYNCED_TABLES).find(([, synced]) => synced.model === model)![0];
          for (const row of rows) {
            const [found] = await context.db.query<{ groups: string[] }[]>(
              `SELECT sync_log_groups('${table}', to_jsonb(t)) AS groups FROM ${table} t WHERE t.id = $1`,
              [row.id],
            );
            expect(found.groups.some((group) => groups.has(group)), `${who} ${model} ${row.id}`).toBe(true);
          }
        }
      }
    });

    it('is current to the newest sync id, the same for every member', async () => {
      const world = await syncWorld(context.db, context.target);
      const before = await logMax(world);
      const owner = await bootstrap(world, 'owner');
      expect(owner.last_sync_id).toBeGreaterThanOrEqual(before);
      expect(owner.last_sync_id).toBeGreaterThan(0);
      expect(owner.last_sync_id).toBeLessThanOrEqual(await logMax(world));
      // A guest gets the moment, not the newest entry they could see.
      const guest = await bootstrap(world, 'guest');
      expect(guest.last_sync_id).toBeGreaterThanOrEqual(owner.last_sync_id);
    });

    it('plus the deltas after it equals a later bootstrap', async () => {
      const world = await syncWorld(context.db, context.target);
      for (const who of ['owner', 'buyer', 'guest'] as const) {
        const before = await bootstrap(world, who);
        await context.db.getRepository(AccountEntity).update({ workspaceId: world.ws.id }, { note: `seen by ${who}` });
        await context.db.getRepository(TeamEntity).update({ id: world.teams.public.id }, { name: `Media ${who}` });
        await save(context.db, FavoriteEntity, { memberId: world.members[who].id, kind: 'page', path: `team/${who}`, title: who });
        await save(context.db, AuditEventEntity, { workspaceId: world.ws.id, eventType: 'RULE_ALERT', accountId: world.accounts.shared.accountId });
        const label = await save(context.db, RuleGroupEntity, { workspaceId: world.ws.id, ownerUserId: world.users.owner.id, name: `Label ${who}` });
        await context.db.getRepository(RuleGroupEntity).delete({ id: label.id });

        const delta = await (await world.browser(who)).get(`/api/sync/delta?since=${before.last_sync_id}&limit=5000`);
        expect(delta.status).toBe(200);
        const { actions, has_more: hasMore } = delta.json<SyncDelta>();
        expect(hasMore).toBe(false);
        expect(actions.length).toBeGreaterThan(0);
        const models = new Map(Object.entries(before.models).map(([model, rows]) => [model, new Map(rows.map((row) => [String(row.id), row as Record<string, unknown>]))]));
        for (const action of actions) {
          const rows = models.get(action.model)!;
          if (action.action === 'insert') rows.set(action.model_id, { ...action.data });
          else if (action.action === 'update') rows.set(action.model_id, { ...rows.get(action.model_id), ...action.data });
          else rows.delete(action.model_id);
        }
        const after = await bootstrap(world, who);
        expect(after.last_sync_id).toBeGreaterThanOrEqual(actions[actions.length - 1].sync_id);
        for (const [model, rows] of Object.entries(after.models)) {
          expect(Object.fromEntries(models.get(model)!), `${who} ${model}`).toEqual(Object.fromEntries(rows.map((row) => [String(row.id), row])));
        }
      }
    });

    it('returns archived models separately', async () => {
      const world = await syncWorld(context.db, context.target);
      await context.db.getRepository(TeamEntity).update({ id: world.teams.public.id }, { deletedAt: new Date() });
      await context.db.getRepository(InboxNotificationStateEntity).update({ userId: world.users.buyer.id }, { deletedAt: new Date() });
      const deletedAt = '2026-03-04 05:06:07.089+00';
      const [item] = await context.db.query<{ id: number }[]>(
        `INSERT INTO deleted_items (workspace_id, kind, entity_id, name, snapshot, deleted_by_user_id, deleted_at)
         VALUES ($1, 'rule', 9001, 'Old rule ✓', '{}', $2, $3) RETURNING id`,
        [world.ws.id, world.users.owner.id, deletedAt],
      );
      await save(context.db, DeletedItemEntity, { workspaceId: world.ws.id, kind: 'rule_group', entityId: 9002, name: 'Old label', deletedByUserId: null, deletedAt: new Date('2026-03-04T05:06:07Z') });

      const buyer = await bootstrap(world, 'buyer');
      expect(buyer.models.Team).toEqual([]);
      expect(buyer.models.TeamMember).toEqual([]);
      expect(buyer.models.InboxNotificationState).toEqual([]);

      const before = await logMax(world);
      const payload = await archived(world, 'buyer');
      expect(Object.keys(payload.models)).toEqual(['Team', 'TeamMember', 'TeamAccount', 'TeamDocument', 'InboxNotificationState', 'Rule', 'Label']);
      expect(idsOf(payload, 'Team')).toEqual(set(world.teams.public.id));
      expect(new Set(payload.models.TeamMember.map((row) => row.team_id))).toEqual(set(world.teams.public.id));
      expect(payload.models.InboxNotificationState.map((row) => row.audit_event_id)).toEqual([world.events.shared.id]);
      expect(payload.models.Rule).toEqual([{
        id: 9001, deleted_item_id: item.id, name: 'Old rule ✓', deleted_at: '2026-03-04T05:06:07.089000+00:00', deleted_by_user_id: world.users.owner.id,
      }]);
      expect(payload.models.Label).toMatchObject([{ id: 9002, name: 'Old label', deleted_at: '2026-03-04T05:06:07+00:00', deleted_by_user_id: null }]);
      expect(payload.last_sync_id).toBeGreaterThanOrEqual(before);

      // Nobody else's deleted Inbox state, and no deleted rules for a guest, who has no rules.
      expect((await archived(world, 'owner')).models.InboxNotificationState).toEqual([]);
      expect((await archived(world, 'guest')).models.Rule).toEqual([]);
      expect(idsOf(await archived(world, 'buyer'), 'Team')).not.toContain(world.teams.private.id);
    });

    it('gives a support admin the whole workspace', async () => {
      const world = await syncWorld(context.db, context.target);
      const { createUser } = await import('../support/db.ts');
      const admin = await createUser(context.db, { role: 'admin' });
      await context.db.query(
        `INSERT INTO workspace_support_grants (workspace_id, user_id, role, reason, expires_at, created_at)
         VALUES ($1, $2, 'admin', 'sync test', now() + interval '1 hour', now())`,
        [world.ws.id, admin.id],
      );
      const browser = new Browser(context.target, { 'x-workspace-slug': world.ws.slug });
      await browser.signIn(admin.email!);
      const response = await browser.get('/api/sync/bootstrap');
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      const payload = response.json<SyncBootstrap>();
      expect(payload.sync_groups).toEqual([
        `team:${world.teams.public.id}`, `team:${world.teams.private.id}`, `workspace:${world.ws.id}`, `workspace:${world.ws.id}:members`,
      ].sort());
      expect(idsOf(payload, 'Account')).toEqual(set(world.accounts.loose.id, world.accounts.shared.id, world.accounts.hidden.id));
      // No private data of its own.
      expect(payload.models.Favorite).toEqual([]);
    });

    it.skipIf(CONTRACT_TARGET === 'python')('reads the rows and the sync id in one snapshot', async () => {
      // In-process: a write commits between the snapshot's first read and the models.
      const world = await syncWorld(context.db, context.target);
      const { bootstrapJson } = await import('../../src/sync/bootstrap.ts');
      const { typescriptTarget } = await import('../support/target.ts');
      const local = await typescriptTarget();
      try {
        const late = await local.app.db.transaction(async (tx) => {
          await tx.query('SELECT 1');
          await context.db.getRepository(AccountEntity).update({ id: world.accounts.loose.id }, { name: 'Late' });
          const [entry] = await context.db.query<{ sync_id: string }[]>(
            "SELECT sync_id FROM sync_actions WHERE model = 'Account' AND model_id = $1 ORDER BY sync_id DESC LIMIT 1",
            [String(world.accounts.loose.id)],
          );
          const member = { id: world.members.owner.id, workspaceId: world.ws.id, userId: world.users.owner.id, role: 'owner' };
          return { payload: JSON.parse(await bootstrapJson(tx, member)) as SyncBootstrap, syncId: Number(entry.sync_id) };
        }, { isolation: 'REPEATABLE READ' });
        expect(late.payload.last_sync_id).toBeLessThan(late.syncId);
        expect(late.payload.models.Account.find((row) => row.id === world.accounts.loose.id)!.name).toBe('No team');
        const missed = await (await world.browser('owner')).get(`/api/sync/delta?since=${late.payload.last_sync_id}&limit=5000`);
        expect(missed.json<SyncDelta>().actions.map((action) => action.sync_id)).toContain(late.syncId);
      } finally {
        await local.close();
      }
    });

    it('sends a large workspace in one round trip', async () => {
      const world = await syncWorld(context.db, context.target);
      const ws = world.ws.id;
      await context.db.query(
        `INSERT INTO teams (workspace_id, name, key, private, description, created_at, updated_at)
         SELECT $1, 'Team ' || n, 'T' || lpad(n::text, 2, '0'), n % 5 = 0, '', now(), now() FROM generate_series(0, 19) n`,
        [ws],
      );
      await context.db.query(
        `INSERT INTO accounts (account_id, name, workspace_id, owner_user_id, currency, custom_name, note, batch_name, created_at,
                               is_active, rules_enabled, status_label, account_status, active_rules, timezone_name, last_started_date, last_day_start_date)
         SELECT 'act_9' || $1::int || lpad(n::text, 4, '0'), 'Account ' || n, $1::int, $2::int, 'USD', '', '', '', now(), true, false, '', 1, '', 'UTC', '', ''
           FROM generate_series(0, 499) n`,
        [ws, world.users.owner.id],
      );
      await context.db.query(
        `INSERT INTO team_accounts (team_id, account_id, created_at)
         SELECT t.id, a.id, now() FROM (SELECT id, row_number() OVER (ORDER BY id) - 1 AS n FROM accounts WHERE workspace_id = $1 AND name LIKE 'Account %') a
           JOIN (SELECT id, row_number() OVER (ORDER BY id) - 1 AS n FROM teams WHERE workspace_id = $1 AND name LIKE 'Team %') t ON t.n = a.n % 20`,
        [ws],
      );
      await context.db.query(
        `INSERT INTO audit_events (workspace_id, event_type, account_id, message, details, account_name, adset_id, adset_name, rule_name, action,
                                   before_state, after_state, correlation_id, duration_ms, created_at, actor_type, actor_id, category, status)
         SELECT $1::int, 'RULE_STOP', 'act_9' || $1::int || lpad((n % 500)::text, 4, '0'), 'Stopped ad set because CPL went above the limit',
                '{}', '', '', '', '', '', '{}', '{}', '', 0, now(), 'system', 'monitoring_worker', 'RULE_ACTION', 'SUCCESS'
           FROM generate_series(0, 4999) n`,
        [ws],
      );
      const started = performance.now();
      const response = await (await world.browser('buyer')).get('/api/sync/bootstrap', { 'accept-encoding': 'gzip' });
      const elapsed = performance.now() - started;
      expect(response.status).toBe(200);
      expect(response.headers['content-encoding']).toBe('gzip');
      expect(response.json<SyncBootstrap>().models.InboxEvent.length).toBeGreaterThan(3000);
      expect(elapsed).toBeLessThan(10_000);
      // Filling 5500 rows and two servers' worth of sign-in take longer than Vitest's default 5 s.
    }, 30_000);
  });
}
