import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { UserEntity, WorkspaceMemberEntity } from '../../src/entities/index.ts';
import { createDefaultTeam, defaultTeamKey, joinDefaultTeam } from '../../src/workspaces/default-team.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL } from '../support/target.ts';

// The team every workspace starts with (tests/test_teams.py,
// test_new_members_and_accounts_join_the_default_team).

describe('default team key', () => {
  it('takes the first three letters or digits, and TEAM when there are none', () => {
    expect(defaultTeamKey('12 Media buying')).toBe('MED');
    expect(defaultTeamKey('Canada Traffic')).toBe('CAN');
    expect(defaultTeamKey('Канада')).toBe('TEAM');
  });
});

describe.skipIf(!DATABASE_URL)('default team', () => {
  let db: DataSource;

  beforeAll(async () => {
    db = await testDatabase();
  });

  afterAll(async () => {
    await db?.destroy();
  });

  it('is the oldest live team; new members and accounts join it, once', async () => {
    const owner = await createUser(db);
    const workspace = await createWorkspace(db, owner);
    const buyer = await createUser(db);
    const member = await db.getRepository(WorkspaceMemberEntity).save({ workspaceId: workspace.id, userId: buyer.id, role: 'buyer', joinedAt: new Date() });
    await db.getRepository(UserEntity).update({ id: buyer.id }, { activeWorkspaceId: workspace.id });
    const [account] = await db.query<{ id: number }[]>('SELECT id FROM accounts WHERE workspace_id = $1', [workspace.id]);

    const first = await db.transaction((tx) => createDefaultTeam(tx, workspace.id, '  Media   buying ', owner.id));
    const second = await db.transaction((tx) => createDefaultTeam(tx, workspace.id, 'Second', owner.id));
    await db.transaction(async (tx) => {
      await joinDefaultTeam(tx, workspace.id, { memberId: member.id, accountId: account.id });
      // Joining twice changes nothing.
      await joinDefaultTeam(tx, workspace.id, { memberId: member.id, accountId: account.id });
    });

    const [team] = await db.query<{ name: string; key: string; private: boolean }[]>('SELECT name, key, private FROM teams WHERE id = $1', [first]);
    expect(team).toEqual({ name: 'Media buying', key: 'MED', private: false });
    const members = (id: number) => db.query<{ n: string }[]>('SELECT count(*) AS n FROM team_members WHERE team_id = $1 AND member_id = $2', [id, member.id]);
    const accounts = (id: number) => db.query<{ n: string }[]>('SELECT count(*) AS n FROM team_accounts WHERE team_id = $1 AND account_id = $2', [id, account.id]);
    expect(await members(first)).toEqual([{ n: '1' }]);
    expect(await accounts(first)).toEqual([{ n: '1' }]);
    expect(await members(second)).toEqual([{ n: '0' }]);
    expect(await accounts(second)).toEqual([{ n: '0' }]);

    // A retired team is no longer the default: the next live one is.
    await db.query('UPDATE teams SET retired_at = now() WHERE id = $1', [first]);
    await db.transaction((tx) => joinDefaultTeam(tx, workspace.id, { memberId: member.id }));
    expect(await members(second)).toEqual([{ n: '1' }]);
    // Nothing happens without a workspace.
    await db.transaction((tx) => joinDefaultTeam(tx, null, { memberId: member.id }));
  });
});
