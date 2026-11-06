import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ActingMember } from '../../src/workspaces/access.ts';
import { changesSince, memberSyncGroups } from '../../src/sync/log.ts';
import { testDatabase } from '../support/db.ts';
import { DATABASE_URL, type Target } from '../support/target.ts';
import { syncWorld, type SyncWorld } from '../support/sync-world.ts';

// The change log the database triggers fill (tests/test_sync_log.py): one
// entry per write, in the write's transaction, with the groups that may see
// it. The triggers are the migration's, so this holds whichever server writes.
// Compaction is in worker.test.ts: it moves a mark every sync case reads.

interface Entry {
  sync_id: string | null;
  model: string;
  model_id: string;
  action: string;
  data: Record<string, unknown>;
  sync_groups: string[];
}

describe.skipIf(!DATABASE_URL)('the sync change log', () => {
  let db: DataSource;
  let world: SyncWorld;

  const entries = (model: string, ids: (number | string)[]) =>
    db.query<Entry[]>(
      'SELECT sync_id, model, model_id, action, data, sync_groups FROM sync_actions WHERE model = $1 AND model_id = ANY($2) ORDER BY id',
      [model, ids.map(String)],
    );
  const last = async (model: string, id: number | string) => {
    const found = await entries(model, [id]);
    return found[found.length - 1];
  };

  const acting = (who: 'owner' | 'buyer' | 'guest'): ActingMember & { id: number } => ({
    id: world.members[who].id,
    workspaceId: world.ws.id,
    userId: world.users[who].id,
    role: who === 'owner' ? 'owner' : who === 'buyer' ? 'member' : 'guest',
  });

  beforeAll(async () => {
    db = await testDatabase();
    world = await syncWorld(db, {} as Target);
  });
  afterAll(() => db.destroy());

  it('leaves one entry for each write, with the groups of whoever may see it', async () => {
    const { ws, members, teams } = world;
    const [team] = await db.query<{ id: number }[]>(
      `INSERT INTO teams (workspace_id, name, key, created_at, updated_at) VALUES ($1, 'Growth', $2, now(), now()) RETURNING id`,
      [ws.id, `G${Math.floor(Math.random() * 1e6)}`.slice(0, 7)],
    );
    const created = await last('Team', team.id);
    expect(created).toMatchObject({ action: 'insert', sync_groups: [`team:${team.id}`] });
    expect(created.data.name).toBe('Growth');

    await db.query(`INSERT INTO team_members (team_id, member_id, joined_at) VALUES ($1, $2, now())`, [team.id, members.owner.id]);
    const [joined] = await db.query<{ id: number }[]>('SELECT id FROM team_members WHERE team_id = $1', [team.id]);
    expect(await last('TeamMember', joined.id)).toMatchObject({ sync_groups: [`team:${team.id}`, `member:${members.owner.id}`] });

    await db.query(`UPDATE teams SET description = 'Scales winners' WHERE id = $1`, [team.id]);
    const changed = await last('Team', team.id);
    expect(changed).toMatchObject({ action: 'update', data: { description: 'Scales winners' } });
    expect(changed.data).not.toHaveProperty('name');

    await db.query(`UPDATE teams SET deleted_at = now() WHERE id = $1`, [team.id]);
    const archived = await last('Team', team.id);
    expect(archived.action).toBe('archive');
    expect(archived.data).toHaveProperty('deleted_at');

    await db.query(`UPDATE favorites SET title = 'Renamed' WHERE member_id = $1`, [members.owner.id]);
    const [favorite] = await db.query<{ id: number }[]>('SELECT id FROM favorites WHERE member_id = $1', [members.owner.id]);
    expect((await last('Favorite', favorite.id)).sync_groups).toEqual([`member:${members.owner.id}`]);

    await db.query(`UPDATE rule_presets SET name = 'Renamed rule' WHERE id = $1`, [world.rule.id]);
    expect((await last('Rule', world.rule.id)).sync_groups).toEqual([`workspace:${ws.id}:members`]);
    await db.query(`UPDATE rule_groups SET name = 'Renamed label' WHERE id = $1`, [world.label.id]);
    expect((await last('Label', world.label.id)).sync_groups).toEqual([`workspace:${ws.id}`]);
    expect(teams.public.id).toBeGreaterThan(0);
  });

  it('numbers entries in commit order, and in the writes’ order within a transaction', async () => {
    const { members } = world;
    const first = db.createQueryRunner();
    const second = db.createQueryRunner();
    await first.connect();
    await second.connect();
    await first.startTransaction();
    await second.startTransaction();
    const path = (name: string) => `${name}-${Math.random().toString(36).slice(2)}`;
    const [a, b] = [path('a'), path('b')];
    const insert = (runner: typeof first, value: string) =>
      runner.query(`INSERT INTO favorites (member_id, kind, path, title, created_at) VALUES ($1, 'page', $2, $2, now()) RETURNING id`, [members.owner.id, value]) as Promise<{ id: number }[]>;
    const [ida] = await insert(first, a);
    const [idb] = await insert(second, b);
    // Written first, committed last: it comes after in the log.
    await second.commitTransaction();
    await first.commitTransaction();
    await first.release();
    await second.release();
    const found = await entries('Favorite', [ida.id, idb.id]);
    const bySyncId = [...found].sort((x, y) => Number(x.sync_id) - Number(y.sync_id)).map((entry) => entry.data.path);
    expect(bySyncId).toEqual([b, a]);

    const ids = await db.transaction(async (tx) => {
      const made: number[] = [];
      for (const name of ['c', 'd', 'e']) {
        const [row] = await tx.query<{ id: number }[]>(`INSERT INTO favorites (member_id, kind, path, title, created_at) VALUES ($1, 'page', $2, $2, now()) RETURNING id`, [members.owner.id, path(name)]);
        made.push(row.id);
      }
      return made;
    });
    const ordered = await entries('Favorite', ids);
    const syncIds = ordered.map((entry) => Number(entry.sync_id));
    expect(syncIds).toEqual([...syncIds].sort((x, y) => x - y));
    expect(ordered.map((entry) => entry.model_id)).toEqual(ids.map(String));
  });

  it('writes the entry in the write’s transaction: pending inside it, gone with a rollback', async () => {
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const [row] = (await runner.query(`INSERT INTO favorites (member_id, kind, path, title, created_at) VALUES ($1, 'page', 'pending', 'P', now()) RETURNING id`, [world.members.owner.id])) as { id: number }[];
    const pending = (await runner.query(`SELECT sync_id FROM sync_actions WHERE model = 'Favorite' AND model_id = $1`, [String(row.id)])) as { sync_id: string | null }[];
    expect(pending).toHaveLength(1);
    expect(pending[0].sync_id).toBeNull();
    await runner.rollbackTransaction();
    await runner.release();
    expect(await entries('Favorite', [row.id])).toEqual([]);
    const [unnumbered] = await db.query<{ count: string }[]>('SELECT count(*) FROM sync_actions WHERE sync_id IS NULL');
    expect(unnumbered.count).toBe('0');
  });

  it('logs bulk statements and cascades, each row', async () => {
    const { ws, accounts, members } = world;
    await db.query(`UPDATE accounts SET note = 'bulk' WHERE workspace_id = $1`, [ws.id]);
    const notes = await entries('Account', [accounts.loose.id, accounts.shared.id, accounts.hidden.id]);
    const latest = notes.filter((entry) => entry.data.note === 'bulk');
    expect(latest).toHaveLength(3);
    expect(latest.every((entry) => entry.action === 'update' && JSON.stringify(entry.data) === '{"note":"bulk"}')).toBe(true);

    const [team] = await db.query<{ id: number }[]>(`INSERT INTO teams (workspace_id, name, key, created_at, updated_at) VALUES ($1, 'Doomed', $2, now(), now()) RETURNING id`, [ws.id, `D${Math.floor(Math.random() * 1e5)}`]);
    await db.query('INSERT INTO team_members (team_id, member_id, joined_at) VALUES ($1, $2, now()), ($1, $3)', [team.id, members.buyer.id, members.guest.id]);
    await db.query('INSERT INTO team_accounts (team_id, account_id, created_at) VALUES ($1, $2, now())', [team.id, accounts.loose.id]);
    const [mark] = await db.query<{ max: string | null }[]>('SELECT max(id) FROM sync_actions');
    await db.query('DELETE FROM teams WHERE id = $1', [team.id]);
    const gone = await db.query<Entry[]>(
      `SELECT model, action, model_id FROM sync_actions WHERE id > $1 AND action = 'delete' AND model IN ('Team', 'TeamMember', 'TeamAccount')`,
      [mark.max ?? 0],
    );
    const count = (model: string) => gone.filter((entry) => entry.model === model).length;
    expect([count('Team'), count('TeamMember'), count('TeamAccount')]).toEqual([1, 2, 1]);
  });

  it('keeps secrets and bookkeeping out of the log', async () => {
    const { accounts, users, ws, other } = world;
    await db.query(`UPDATE accounts SET name = 'Private again' WHERE id = $1`, [accounts.hidden.id]);
    const hidden = await last('Account', accounts.hidden.id);
    expect(hidden.data).not.toHaveProperty('access_token_encrypted');
    expect(hidden.data).not.toHaveProperty('access_token');

    const before = await entries('User', [users.owner.id]);
    await db.query(`UPDATE users SET auth_token = 'legacy', onboarding_step = 'completed' WHERE id = $1`, [users.owner.id]);
    expect(await entries('User', [users.owner.id])).toHaveLength(before.length);

    // The owner of both workspaces: both hear of a rename.
    await db.query(`INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES ($1, $2, 'member', now())`, [other.id, users.owner.id]);
    await db.query(`UPDATE users SET full_name = 'Olga O.' WHERE id = $1`, [users.owner.id]);
    const renamed = await last('User', users.owner.id);
    expect(renamed).toMatchObject({ data: { full_name: 'Olga O.' } });
    expect(renamed.sync_groups).toEqual([`workspace:${ws.id}`, `workspace:${other.id}`].sort());
  });

  it('sends each model to the groups that may see it', async () => {
    const { ws, accounts, teams, members, users } = world;
    await db.query(`UPDATE accounts SET name = 'Renamed' WHERE workspace_id = $1`, [ws.id]);
    const groups = async (id: number) => (await last('Account', id)).sync_groups;
    expect(await groups(accounts.loose.id)).toEqual([`workspace:${ws.id}:members`]);
    expect(await groups(accounts.shared.id)).toEqual([`team:${teams.public.id}`]);
    expect(await groups(accounts.hidden.id)).toEqual([`team:${teams.private.id}`]);

    await db.query(`UPDATE workspace_members SET joined_at = now() WHERE id = $1`, [members.buyer.id]);
    const member = await last('WorkspaceMember', members.buyer.id);
    expect(member.sync_groups).toEqual([`workspace:${ws.id}`]);
    expect(member.data).not.toHaveProperty('inbox_display');

    // A member's own Inbox options go to them alone.
    await db.query(`UPDATE workspace_members SET inbox_display = '{"ordering": "oldest"}' WHERE id = $1`, [members.buyer.id]);
    expect(await last('WorkspaceMember', members.buyer.id)).toMatchObject({
      sync_groups: [`member:${members.buyer.id}`],
      data: { inbox_display: { ordering: 'oldest' } },
    });

    // An Inbox event follows its ad account; the member's state on it is theirs.
    const [event] = await db.query<{ id: number }[]>(
      `INSERT INTO audit_events (workspace_id, event_type, account_id, actor_type) VALUES ($1, 'RULE_STOP', $2, 'system') RETURNING id`,
      [ws.id, accounts.hidden.accountId],
    );
    const [loose] = await db.query<{ id: number }[]>(`INSERT INTO audit_events (workspace_id, event_type, actor_type) VALUES ($1, 'TOKEN_ERROR', 'system') RETURNING id`, [ws.id]);
    await db.query(`INSERT INTO inbox_notification_states (user_id, audit_event_id, is_read) VALUES ($1, $2, true)`, [users.owner.id, event.id]);
    expect((await last('InboxEvent', event.id)).sync_groups).toEqual([`team:${teams.private.id}`]);
    expect((await last('InboxEvent', loose.id)).sync_groups).toEqual([`workspace:${ws.id}:members`]);
    const [state] = await db.query<{ id: number }[]>('SELECT id FROM inbox_notification_states WHERE audit_event_id = $1', [event.id]);
    expect((await last('InboxNotificationState', state.id)).sync_groups).toEqual([`member:${members.owner.id}`]);
  });

  it('gives a member groups by role and teams', async () => {
    const { ws, members, teams } = world;
    const groupsOf = (who: 'owner' | 'buyer' | 'guest') => db.transaction((tx) => memberSyncGroups(tx, acting(who)));
    expect(await groupsOf('owner')).toEqual([
      `workspace:${ws.id}`, `workspace:${ws.id}:members`, `member:${members.owner.id}`, `team:${teams.public.id}`, `team:${teams.private.id}`,
    ].sort());
    expect(await groupsOf('buyer')).toEqual([
      `workspace:${ws.id}`, `workspace:${ws.id}:members`, `member:${members.buyer.id}`, `team:${teams.public.id}`,
    ].sort());
    // A guest has only their own teams, and none of the workspace-wide data guests don't see.
    expect(await groupsOf('guest')).toEqual([`workspace:${ws.id}`, `member:${members.guest.id}`, `team:${teams.public.id}`].sort());
  });

  it('returns the changes since an id that the member may see', async () => {
    const { ws, accounts } = world;
    const [mark] = await db.query<{ max: string }[]>('SELECT max(sync_id) FROM sync_actions');
    await db.query(`UPDATE accounts SET note = 'seen?' WHERE workspace_id = $1`, [ws.id]);
    const seen = async (who: 'owner' | 'buyer' | 'guest') => {
      const rows = await db.transaction(async (tx) => changesSince(tx, await memberSyncGroups(tx, acting(who)), Number(mark.max), 10_000));
      return rows.filter((row) => row.model === 'Account' && [accounts.loose.id, accounts.shared.id, accounts.hidden.id].includes(Number(row.model_id))).map((row) => Number(row.model_id)).sort((x, y) => x - y);
    };
    const ids = (...list: { id: number }[]) => list.map((account) => account.id).sort((x, y) => x - y);
    expect(await seen('owner')).toEqual(ids(accounts.loose, accounts.shared, accounts.hidden));
    expect(await seen('buyer')).toEqual(ids(accounts.loose, accounts.shared));
    expect(await seen('guest')).toEqual(ids(accounts.shared));
  });

  it('catches up with one indexed query', async () => {
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query('SET LOCAL enable_seqscan = off');
    const plan = ((await runner.query(
      `EXPLAIN SELECT * FROM sync_actions WHERE sync_id > 0 AND sync_groups && ARRAY['workspace:1', 'team:2']::text[] ORDER BY sync_id`,
    )) as Record<string, string>[]).map((row) => row['QUERY PLAN']).join('\n');
    await runner.rollbackTransaction();
    await runner.release();
    expect(plan).not.toContain('Seq Scan');
    expect(plan).toMatch(/ix_sync_actions_sync_groups|sync_actions_sync_id_key/);
  });
});
