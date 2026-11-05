import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { AccountEntity, UserEntity, WorkspaceEntity, WorkspaceMemberEntity } from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';

// Teams over GraphQL (tests/test_teams.py): the same answers, refusals and
// access rules from either server.

interface GraphQLError {
  message: string;
  extensions?: { statusCode?: number; type?: string };
}

interface Answer {
  data: Record<string, unknown> | null;
  errors?: GraphQLError[];
}

interface Team {
  id: number;
  name: string;
  key: string;
  description: string;
  created_at: string;
  retired_at: string | null;
  deleted_at: string | null;
  restorable_until: string | null;
  member_user_ids: number[];
  owner_user_ids: number[];
  account_ids: number[];
  is_member: boolean;
  private: boolean;
}

const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{6})?Z$/;

describe.skipIf(!DATABASE_URL)('teams', () => {
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

  interface Person {
    user: UserEntity;
    call(query: string, variables?: Record<string, unknown>): Promise<Answer>;
  }

  async function person(user: UserEntity, workspace: WorkspaceEntity): Promise<Person> {
    const browser = new Browser(target, { 'x-workspace-slug': workspace.slug });
    expect((await browser.signIn(user.email!)).status).toBe(200);
    return {
      user,
      async call(query, variables) {
        const answer = await browser.post('/api/graphql', { query, variables }, browser.csrf());
        expect(answer.status).toBe(200);
        return answer.body as Answer;
      },
    };
  }

  // A workspace with its owner, a buyer, a guest, its ad account, and an outsider with a workspace of their own.
  async function world() {
    const ownerUser = await createUser(db, { fullName: 'Olga Owner' });
    const workspace = await createWorkspace(db, ownerUser);
    const members = db.getRepository(WorkspaceMemberEntity);
    const join = async (role: string) => {
      const user = await createUser(db);
      await members.save({ workspaceId: workspace.id, userId: user.id, role, joinedAt: new Date() });
      await db.getRepository(UserEntity).update({ id: user.id }, { activeWorkspaceId: workspace.id });
      return person(user, workspace);
    };
    const outsiderUser = await createUser(db);
    const otherWorkspace = await createWorkspace(db, outsiderUser);
    const [account] = await db.getRepository(AccountEntity).findBy({ workspaceId: workspace.id });
    const [foreign] = await db.getRepository(AccountEntity).findBy({ workspaceId: otherWorkspace.id });
    return {
      ws: workspace.id,
      owner: await person(ownerUser, workspace),
      buyer: await join('buyer'),
      guest: await join('guest'),
      outsider: await person(outsiderUser, otherWorkspace),
      account: account.id,
      foreign: foreign.id,
    };
  }

  const TEAM = 'team';
  const CREATE = `mutation($ws: Int!, $input: JSON!) { teamCreate(workspaceId: $ws, input: $input) { success lastSyncId ${TEAM} } }`;
  const UPDATE = `mutation($ws: Int!, $id: Int!, $input: JSON!) { teamUpdate(workspaceId: $ws, id: $id, input: $input) { team } }`;
  const LIST = 'query($ws: Int!, $status: String) { teams(workspaceId: $ws, status: $status) }';
  const MEMBERS_ADD = 'mutation($ws: Int!, $team: Int!, $input: JSON!) { teamMembersAdd(workspaceId: $ws, teamId: $team, input: $input) { team } }';
  const MEMBER_REMOVE = 'mutation($ws: Int!, $team: Int!, $user: Int!) { teamMemberRemove(workspaceId: $ws, teamId: $team, userId: $user) { team } }';
  const MEMBER_UPDATE = 'mutation($ws: Int!, $team: Int!, $user: Int!, $input: JSON!) { teamMemberUpdate(workspaceId: $ws, teamId: $team, userId: $user, input: $input) { team } }';
  const ACCOUNTS_ADD = 'mutation($ws: Int!, $team: Int!, $input: JSON!) { teamAccountsAdd(workspaceId: $ws, teamId: $team, input: $input) { team } }';
  const ACCOUNT_REMOVE = 'mutation($ws: Int!, $team: Int!, $account: Int!) { teamAccountRemove(workspaceId: $ws, teamId: $team, accountId: $account) { team } }';
  const RETIRE = 'mutation($ws: Int!, $id: Int!) { teamRetire(workspaceId: $ws, id: $id) { team } }';
  const RESTORE = 'mutation($ws: Int!, $id: Int!) { teamRestore(workspaceId: $ws, id: $id) { team } }';
  const DELETE = 'mutation($ws: Int!, $id: Int!) { teamDelete(workspaceId: $ws, id: $id) { team } }';

  function refusal(answer: Answer): [number | undefined, string] {
    expect(answer.errors, JSON.stringify(answer)).toBeDefined();
    return [answer.errors![0].extensions?.statusCode, answer.errors![0].message];
  }

  async function create(who: Person, ws: number, input: Record<string, unknown>): Promise<Team> {
    const answer = await who.call(CREATE, { ws, input });
    expect(answer.errors, JSON.stringify(answer.errors)).toBeUndefined();
    return (answer.data!.teamCreate as { team: Team }).team;
  }

  async function teams(who: Person, ws: number, status?: string): Promise<Team[]> {
    const answer = await who.call(LIST, { ws, status });
    expect(answer.errors, JSON.stringify(answer.errors)).toBeUndefined();
    return answer.data!.teams as Team[];
  }

  it('creates, lists and changes a team; its creator owns it', async () => {
    const w = await world();
    const answer = await w.owner.call(CREATE, { ws: w.ws, input: { name: '  Media   buying ', key: ' med ', description: ' Ads ' } });
    const payload = answer.data!.teamCreate as { success: boolean; lastSyncId: number; team: Team };
    expect(payload.success).toBe(true);
    expect(typeof payload.lastSyncId).toBe('number');
    const team = payload.team;
    expect(Object.keys(team).sort()).toEqual([
      'account_ids', 'created_at', 'deleted_at', 'description', 'id', 'is_member', 'key', 'member_user_ids',
      'name', 'owner_user_ids', 'private', 'restorable_until', 'retired_at',
    ]);
    expect(team).toMatchObject({
      name: 'Media buying', key: 'MED', description: 'Ads', retired_at: null, deleted_at: null, restorable_until: null,
      member_user_ids: [w.owner.user.id], owner_user_ids: [w.owner.user.id], account_ids: [], is_member: true, private: false,
    });
    expect(team.created_at).toMatch(ISO);

    const listed = await teams(w.buyer, w.ws);
    expect(listed.find((item) => item.id === team.id)).toEqual({ ...team, is_member: false });

    const updated = await w.owner.call(UPDATE, { ws: w.ws, id: team.id, input: { name: 'Growth', private: true } });
    expect((updated.data!.teamUpdate as { team: Team }).team).toMatchObject({ name: 'Growth', key: 'MED', description: 'Ads', private: true });
  });

  it('refuses names, identifiers and inputs as Python does', async () => {
    const w = await world();
    await create(w.owner, w.ws, { name: 'Alpha', key: 'ALP' });
    expect(refusal(await w.owner.call(CREATE, { ws: w.ws, input: { name: 'alpha', key: 'BET' } }))).toEqual([409, 'A team with this name already exists']);
    expect(refusal(await w.owner.call(CREATE, { ws: w.ws, input: { name: 'Beta', key: 'alp' } }))).toEqual([409, 'A team with this identifier already exists']);
    expect(refusal(await w.owner.call(CREATE, { ws: w.ws, input: { name: '   ', key: 'X' } }))).toEqual([400, "Team name can't be empty"]);
    expect(refusal(await w.owner.call(CREATE, { ws: w.ws, input: { name: 'Gamma', key: '  ' } }))).toEqual([400, "Team identifier can't be empty"]);
    expect(refusal(await w.owner.call(CREATE, { ws: w.ws, input: { name: 'Gamma', key: '1AB' } })))
      .toEqual([400, 'Team identifier must be 1–7 letters or digits and start with a letter']);
    expect(refusal(await w.owner.call(CREATE, { ws: w.ws, input: { name: 'Gamma' } }))).toEqual([422, 'Field required']);
    expect(refusal(await w.owner.call(CREATE, { ws: w.ws, input: { name: 'G'.repeat(49), key: 'G' } })))
      .toEqual([422, 'String should have at most 48 characters']);
    expect(refusal(await w.owner.call(LIST, { ws: w.ws, status: 'gone' })))
      .toEqual([422, "String should match pattern '^(all|active|retired|deleted)$'"]);
    expect(refusal(await w.guest.call(CREATE, { ws: w.ws, input: { name: 'Guests', key: 'GST' } }))).toEqual([403, "Guests can't create teams"]);
  });

  it('lets only managers run a team, and outsiders see nothing', async () => {
    const w = await world();
    const team = await create(w.owner, w.ws, { name: 'Ops', key: 'OPS' });
    expect(refusal(await w.buyer.call(UPDATE, { ws: w.ws, id: team.id, input: { name: 'Mine' } })))
      .toEqual([403, 'Only team owners and workspace admins can manage this team']);
    expect(refusal(await w.outsider.call(LIST, { ws: w.ws }))).toEqual([404, 'Workspace not found']);
    expect(refusal(await w.owner.call(UPDATE, { ws: w.ws, id: 999_999_999, input: {} }))).toEqual([404, 'Team not found']);
  });

  it('lets a team owner run their team', async () => {
    const w = await world();
    const team = await create(w.owner, w.ws, { name: 'Run', key: 'RUN' });
    await w.owner.call(MEMBERS_ADD, { ws: w.ws, team: team.id, input: { user_ids: [w.buyer.user.id, w.guest.user.id] } });
    const promoted = await w.owner.call(MEMBER_UPDATE, { ws: w.ws, team: team.id, user: w.buyer.user.id, input: { is_owner: true } });
    expect((promoted.data!.teamMemberUpdate as { team: Team }).team.owner_user_ids).toEqual([w.owner.user.id, w.buyer.user.id]);
    expect(refusal(await w.owner.call(MEMBER_UPDATE, { ws: w.ws, team: team.id, user: w.guest.user.id, input: { is_owner: true } })))
      .toEqual([400, "Guests can't be team owners"]);
    const renamed = await w.buyer.call(UPDATE, { ws: w.ws, id: team.id, input: { description: 'Ours' } });
    expect((renamed.data!.teamUpdate as { team: Team }).team.description).toBe('Ours');
    expect(refusal(await w.outsider.call(MEMBER_UPDATE, { ws: w.ws, team: team.id, user: w.buyer.user.id, input: { is_owner: false } })))
      .toEqual([404, 'Workspace not found']);
  });

  it('hides private teams from those not on them, and shows guests only theirs', async () => {
    const w = await world();
    const open = await create(w.owner, w.ws, { name: 'Open', key: 'OPN' });
    const closed = await create(w.owner, w.ws, { name: 'Closed', key: 'CLS', private: true });
    expect((await teams(w.owner, w.ws)).map((team) => team.id)).toEqual([closed.id, open.id]);
    expect((await teams(w.buyer, w.ws)).map((team) => team.id)).toEqual([open.id]);
    expect(await teams(w.guest, w.ws)).toEqual([]);
    expect(refusal(await w.buyer.call(MEMBERS_ADD, { ws: w.ws, team: closed.id, input: { user_ids: [w.buyer.user.id] } })))
      .toEqual([403, 'Only team owners and workspace admins can manage this team']);
    // A member joins a public team on their own; a guest can't.
    const joined = await w.buyer.call(MEMBERS_ADD, { ws: w.ws, team: open.id, input: { user_ids: [w.buyer.user.id] } });
    expect((joined.data!.teamMembersAdd as { team: Team }).team).toMatchObject({ is_member: true });
    expect(refusal(await w.guest.call(MEMBERS_ADD, { ws: w.ws, team: open.id, input: { user_ids: [w.guest.user.id] } }))[0]).toBe(403);
    await w.owner.call(MEMBERS_ADD, { ws: w.ws, team: open.id, input: { user_ids: [w.guest.user.id] } });
    expect((await teams(w.guest, w.ws)).map((team) => team.id)).toEqual([open.id]);
  });

  it('adds and removes members and ad accounts', async () => {
    const w = await world();
    const team = await create(w.owner, w.ws, { name: 'Crew', key: 'CRW' });
    const added = await w.owner.call(MEMBERS_ADD, { ws: w.ws, team: team.id, input: { user_ids: [w.buyer.user.id, w.buyer.user.id, w.owner.user.id] } });
    expect((added.data!.teamMembersAdd as { team: Team }).team.member_user_ids).toEqual([w.owner.user.id, w.buyer.user.id]);
    expect(refusal(await w.owner.call(MEMBERS_ADD, { ws: w.ws, team: team.id, input: { user_ids: [w.outsider.user.id] } })))
      .toEqual([400, 'Only members of this workspace can join its teams']);
    expect(refusal(await w.owner.call(MEMBERS_ADD, { ws: w.ws, team: team.id, input: { user_ids: [] } })))
      .toEqual([422, 'List should have at least 1 item after validation, not 0']);

    const left = await w.buyer.call(MEMBER_REMOVE, { ws: w.ws, team: team.id, user: w.buyer.user.id });
    expect((left.data!.teamMemberRemove as { team: Team }).team.member_user_ids).toEqual([w.owner.user.id]);
    expect(refusal(await w.owner.call(MEMBER_REMOVE, { ws: w.ws, team: team.id, user: w.buyer.user.id }))).toEqual([404, 'Not a member of this team']);
    expect(refusal(await w.owner.call(MEMBER_REMOVE, { ws: w.ws, team: team.id, user: w.outsider.user.id })))
      .toEqual([404, 'Member not found in this workspace']);

    const accounts = await w.owner.call(ACCOUNTS_ADD, { ws: w.ws, team: team.id, input: { account_ids: [w.account] } });
    expect((accounts.data!.teamAccountsAdd as { team: Team }).team.account_ids).toEqual([w.account]);
    expect(refusal(await w.owner.call(ACCOUNTS_ADD, { ws: w.ws, team: team.id, input: { account_ids: [w.foreign] } })))
      .toEqual([400, "Only this workspace's ad accounts can be added to its teams"]);
    const removed = await w.owner.call(ACCOUNT_REMOVE, { ws: w.ws, team: team.id, account: w.account });
    expect((removed.data!.teamAccountRemove as { team: Team }).team.account_ids).toEqual([]);
    expect(refusal(await w.owner.call(ACCOUNT_REMOVE, { ws: w.ws, team: team.id, account: w.account })))
      .toEqual([404, 'This ad account is not on the team']);
  });

  it('retires, deletes and restores a team', async () => {
    const w = await world();
    const team = await create(w.owner, w.ws, { name: 'Phoenix', key: 'PHX' });
    const retired = (await w.owner.call(RETIRE, { ws: w.ws, id: team.id })).data!.teamRetire as { team: Team };
    expect(retired.team.retired_at).toMatch(ISO);
    expect((await teams(w.owner, w.ws, 'retired')).map((item) => item.id)).toEqual([team.id]);
    expect(await teams(w.owner, w.ws, 'active')).toEqual([]);
    const active = (await w.owner.call(RESTORE, { ws: w.ws, id: team.id })).data!.teamRestore as { team: Team };
    expect(active.team.retired_at).toBeNull();

    const deleted = (await w.owner.call(DELETE, { ws: w.ws, id: team.id })).data!.teamDelete as { team: { status: string; restorable_until: string } };
    expect(deleted.team.status).toBe('ok');
    expect(deleted.team.restorable_until).toMatch(ISO);
    const [gone] = await teams(w.owner, w.ws, 'deleted');
    expect(gone).toMatchObject({ id: team.id, restorable_until: deleted.team.restorable_until });
    expect(Date.parse(gone.restorable_until!) - Date.parse(gone.deleted_at!)).toBe(30 * 86_400_000);
    expect(refusal(await w.owner.call(RETIRE, { ws: w.ws, id: team.id }))).toEqual([404, 'Team not found']);

    // Its name was taken meanwhile: it can't come back under it.
    const taken = await create(w.owner, w.ws, { name: 'Phoenix', key: 'PHO' });
    expect(refusal(await w.owner.call(RESTORE, { ws: w.ws, id: team.id }))).toEqual([409, 'A team with this name already exists']);
    await w.owner.call(DELETE, { ws: w.ws, id: taken.id });
    const back = (await w.owner.call(RESTORE, { ws: w.ws, id: team.id })).data!.teamRestore as { team: Team };
    expect(back.team).toMatchObject({ id: team.id, deleted_at: null, restorable_until: null });
  });

  it('keeps team documents for those who may work in the team', async () => {
    const w = await world();
    const team = await create(w.owner, w.ws, { name: 'Docs', key: 'DOC', private: true });
    const DOC_CREATE = 'mutation($ws: Int!, $team: Int!, $input: JSON!) { teamDocumentCreate(workspaceId: $ws, teamId: $team, input: $input) { success teamDocument } }';
    const DOC_UPDATE = 'mutation($ws: Int!, $team: Int!, $id: Int!, $input: JSON!) { teamDocumentUpdate(workspaceId: $ws, teamId: $team, id: $id, input: $input) { teamDocument } }';
    const DOC_DELETE = 'mutation($ws: Int!, $team: Int!, $id: Int!) { teamDocumentDelete(workspaceId: $ws, teamId: $team, id: $id) { teamDocument } }';
    const DOCS = 'query($ws: Int!, $team: Int!) { teamDocuments(workspaceId: $ws, teamId: $team) }';

    const created = (await w.owner.call(DOC_CREATE, { ws: w.ws, team: team.id, input: { title: '  Plan ', content: 'Body' } })).data!.teamDocumentCreate as {
      teamDocument: Record<string, unknown>;
    };
    const document = created.teamDocument;
    expect(Object.keys(document).sort()).toEqual(['content', 'created_at', 'created_by_user_id', 'id', 'team_id', 'title', 'updated_at', 'updated_by_user_id']);
    expect(document).toMatchObject({ team_id: team.id, title: 'Plan', content: 'Body', created_by_user_id: w.owner.user.id, updated_by_user_id: w.owner.user.id });
    expect(document.created_at).toMatch(ISO);

    // Private: the buyer isn't on it.
    expect(refusal(await w.buyer.call(DOCS, { ws: w.ws, team: team.id }))).toEqual([404, 'Team not found']);
    await w.owner.call(MEMBERS_ADD, { ws: w.ws, team: team.id, input: { user_ids: [w.buyer.user.id] } });
    const edited = (await w.buyer.call(DOC_UPDATE, { ws: w.ws, team: team.id, id: document.id, input: { content: 'New' } })).data!.teamDocumentUpdate as {
      teamDocument: Record<string, unknown>;
    };
    expect(edited.teamDocument).toMatchObject({ title: 'Plan', content: 'New', created_by_user_id: w.owner.user.id, updated_by_user_id: w.buyer.user.id });
    expect((await w.buyer.call(DOCS, { ws: w.ws, team: team.id })).data!.teamDocuments).toEqual([edited.teamDocument]);

    const removed = await w.buyer.call(DOC_DELETE, { ws: w.ws, team: team.id, id: document.id });
    expect(removed.data!.teamDocumentDelete).toEqual({ teamDocument: { status: 'ok' } });
    expect(refusal(await w.buyer.call(DOC_DELETE, { ws: w.ws, team: team.id, id: document.id }))).toEqual([404, 'Document not found']);
  });
});
