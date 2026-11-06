import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { RuleGroupEntity, RulePresetEntity, UserEntity, WorkspaceMemberEntity, type WorkspaceEntity } from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';

// Rule labels over GraphQL (tests/test_api.py rule-labels cases,
// tests/test_workspace_isolation_security.py, tests/test_rule_examples.py),
// against either server.

interface GraphQLAnswer {
  data: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { statusCode?: number } }[];
}

interface Label {
  id: number;
  name: string;
  color: string;
  description: string;
  rule_count: number;
  last_applied_at: string;
  created_at: string;
}

const LABEL_COLORS = ['#95a2b3', '#5e6ad2', '#26b5ce', '#4cb782', '#f2c94c', '#f2994a', '#f7c8c1', '#eb5757', '#bb87fc', '#4ea7fc'];

const LABELS = 'query { ruleLabels }';
const CREATE = 'mutation($input: JSON!) { ruleLabelCreate(input: $input) { success lastSyncId ruleLabel } }';
const UPDATE = 'mutation($id: Int!, $input: JSON!) { ruleLabelUpdate(id: $id, input: $input) { success ruleLabel } }';
const DELETE = 'mutation($id: Int!) { ruleLabelDelete(id: $id) { success ruleLabel } }';

describe.skipIf(!DATABASE_URL)('rule labels', () => {
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
    const user = await createUser(db);
    const workspace = await createWorkspace(db, user);
    return { browser: await signIn(user, workspace), user, workspace };
  }

  async function joined(workspace: WorkspaceEntity, role: string): Promise<Member> {
    const user = await createUser(db);
    await db.getRepository(WorkspaceMemberEntity).save({ workspaceId: workspace.id, userId: user.id, role, joinedAt: new Date() });
    await db.getRepository(UserEntity).update({ id: user.id }, { activeWorkspaceId: workspace.id });
    return { browser: await signIn(user, workspace), user, workspace };
  }

  async function graphql(member: Member, query: string, variables?: Record<string, unknown>): Promise<GraphQLAnswer> {
    const answer = await member.browser.post('/api/graphql', { query, variables }, member.browser.csrf());
    expect(answer.status).toBe(200);
    return answer.body as GraphQLAnswer;
  }

  async function ok(member: Member, query: string, variables?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { data, errors } = await graphql(member, query, variables);
    expect(errors).toBeUndefined();
    return data!;
  }

  async function refused(member: Member, query: string, variables?: Record<string, unknown>): Promise<[number | undefined, string]> {
    const { errors } = await graphql(member, query, variables);
    expect(errors).toHaveLength(1);
    return [errors![0].extensions?.statusCode, errors![0].message];
  }

  async function create(member: Member, input: Record<string, unknown>): Promise<Label> {
    return ((await ok(member, CREATE, { input })).ruleLabelCreate as { ruleLabel: Label }).ruleLabel;
  }

  function select<T>(sql: string, parameters: unknown[]): Promise<T[]> {
    return db.query<T[]>(sql, parameters);
  }

  async function labels(member: Member): Promise<Label[]> {
    return (await ok(member, LABELS)).ruleLabels as Label[];
  }

  it('gives a workspace the example rules once, under one label', async () => {
    const me = await owner();
    const first = await labels(me);
    expect(first.map((label) => [label.name, label.color, label.rule_count])).toEqual([['NL launch', '#f2994a', 5]]);
    expect(first[0].description).toContain('Every dollar must buy the next step');
    expect(first[0].last_applied_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{6})?Z$/);
    expect(first[0].created_at).toMatch(/Z$/);
    const presets = await select<{ name: string }>(
      'SELECT name, action, level, conditions, cooldown_minutes, check_interval_minutes FROM rule_presets WHERE workspace_id = $1 ORDER BY id',
      [me.workspace.id],
    );
    expect(presets.map((preset) => preset.name)).toEqual([
      '$3 and no click', '$3.50 and one click', '$4 and no lead', '$7 and no registration', '$12 ceiling',
    ]);
    expect(presets[1]).toMatchObject({
      action: 'turn_off',
      level: 'adset',
      cooldown_minutes: 1440,
      check_interval_minutes: 5,
      conditions: [
        { metric: 'spend', operator: 'gte', value: 3.5, time_window: 'lifetime' },
        { metric: 'link_clicks', operator: 'lte', value: 1, time_window: 'lifetime' },
      ],
    });

    // A second member opening Rules gets no second set; nor does deleting them bring them back.
    const teammate = await joined(me.workspace, 'member');
    expect((await labels(teammate)).map((label) => label.id)).toEqual([first[0].id]);
    await ok(me, DELETE, { id: first[0].id });
    expect(await labels(me)).toEqual([]);
    const [{ count }] = await select<{ count: number }>('SELECT count(*)::int AS count FROM rule_presets WHERE workspace_id = $1', [me.workspace.id]);
    expect(count).toBe(5);
  });

  it('gives the set once to members opening Rules at the same time', async () => {
    const me = await owner();
    const members = [await joined(me.workspace, 'member'), await joined(me.workspace, 'member'), me];
    const opened = await Promise.all(members.map((member) => labels(member)));
    expect(new Set(opened.map((list) => list.map((label) => label.id).join())).size).toBe(1);
    expect(opened[0].map((label) => label.name)).toEqual(['NL launch']);
    const [{ count }] = await select<{ count: number }>('SELECT count(*)::int AS count FROM rule_presets WHERE workspace_id = $1', [me.workspace.id]);
    expect(count).toBe(5);
    const [markers] = await select<{ owners: number[] }>('SELECT array_agg(owner_user_id) AS owners FROM rule_examples_bootstrap WHERE workspace_id = $1', [me.workspace.id]);
    // The marker sits on the owner, whoever opened Rules first.
    expect(markers.owners).toEqual([me.user.id]);
  });

  it('adds the current set once to a workspace with the older examples, and leaves those as edited', async () => {
    const me = await owner();
    const member = await joined(me.workspace, 'member');
    // Version 1 left a marker per member and its own examples, which may have been edited since.
    const presets = db.getRepository(RulePresetEntity);
    const old = await presets.save(presets.create({
      workspaceId: me.workspace.id, ownerUserId: member.user.id, name: 'Example · Stop with no leads after 20', action: 'turn_off',
      conditions: [{ metric: 'spend', operator: 'gte', value: 25, time_window: 'today' }, { metric: 'leads', operator: 'eq', value: 0, time_window: 'today' }],
    }));
    const oldLabels = db.getRepository(RuleGroupEntity);
    await oldLabels.save(oldLabels.create({ workspaceId: me.workspace.id, ownerUserId: member.user.id, name: 'Example · Launch control' }));
    await select('INSERT INTO rule_examples_bootstrap (workspace_id, owner_user_id, version, created_at) VALUES ($1, $2, 1, now()), ($1, $3, 1, now())', [me.workspace.id, me.user.id, member.user.id]);

    expect((await labels(member)).map((label) => label.name).sort()).toEqual(['Example · Launch control', 'NL launch']);
    await labels(me);
    await labels(member);
    const names = await select<{ name: string }>('SELECT name FROM rule_presets WHERE workspace_id = $1 ORDER BY id', [me.workspace.id]);
    expect(names.map((row) => row.name)).toEqual(['Example · Stop with no leads after 20', '$3 and no click', '$3.50 and one click', '$4 and no lead', '$7 and no registration', '$12 ceiling']);
    expect((await presets.findOneByOrFail({ id: old.id })).conditions[0]).toMatchObject({ value: 25 });
    const markers = await select<{ owner_user_id: number; version: number }>('SELECT owner_user_id, version FROM rule_examples_bootstrap WHERE workspace_id = $1', [me.workspace.id]);
    expect(Object.fromEntries(markers.map((row) => [row.owner_user_id, row.version]))).toEqual({ [me.user.id]: 2, [member.user.id]: 1 });
  });

  it('puts the owner’s marker on a workspace whose owner never opened Rules', async () => {
    const me = await owner();
    const member = await joined(me.workspace, 'member');
    await select('INSERT INTO rule_examples_bootstrap (workspace_id, owner_user_id, version, created_at) VALUES ($1, $2, 1, now())', [me.workspace.id, member.user.id]);
    expect((await labels(member)).map((label) => label.name)).toEqual(['NL launch']);
    expect((await labels(member)).map((label) => label.name)).toEqual(['NL launch']);
    const markers = await select<{ owner_user_id: number; version: number }>('SELECT owner_user_id, version FROM rule_examples_bootstrap WHERE workspace_id = $1', [me.workspace.id]);
    expect(Object.fromEntries(markers.map((row) => [row.owner_user_id, row.version]))).toEqual({ [me.user.id]: 2, [member.user.id]: 1 });
  });

  it('creates, renames and recolors labels with unique names', async () => {
    const me = await owner();
    await labels(me);
    const answer = await ok(me, CREATE, { input: { name: '  Safety  net ', color: '#4CB782', description: ' Stops ' } });
    const payload = answer.ruleLabelCreate as { success: boolean; lastSyncId: number; ruleLabel: Label };
    expect(payload.success).toBe(true);
    expect(payload.lastSyncId).toBeGreaterThan(0);
    const label = payload.ruleLabel;
    expect(label).toMatchObject({ name: 'Safety net', color: '#4cb782', description: 'Stops', rule_count: 0, last_applied_at: '' });
    expect(label.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{6})?Z$/);

    // Without a color, a random one from Linear's palette.
    expect(LABEL_COLORS).toContain((await create(me, { name: 'Scaling' })).color);

    expect(await refused(me, CREATE, { input: { name: 'safety NET' } })).toEqual([409, 'A label named "safety NET" already exists.']);
    expect(await refused(me, CREATE, { input: { name: '   ' } })).toEqual([400, 'Enter a label name.']);
    expect(await refused(me, CREATE, { input: { name: 'Odd', color: 'green' } })).toEqual([422, "String should match pattern '^#[0-9a-fA-F]{6}$'"]);
    expect(await refused(me, CREATE, { input: { name: '', shade: 1 } })).toEqual([422, 'String should have at least 1 character Extra inputs are not permitted']);
    expect(await refused(me, CREATE, { input: {} })).toEqual([422, 'Field required']);

    const renamed = (await ok(me, UPDATE, { id: label.id, input: { name: 'Safety', color: '#EB5757' } })).ruleLabelUpdate as { ruleLabel: Label };
    // Only what was sent changes.
    expect(renamed.ruleLabel).toMatchObject({ id: label.id, name: 'Safety', color: '#eb5757', description: 'Stops' });
    const unchanged = (await ok(me, UPDATE, { id: label.id, input: { name: null, description: null } })).ruleLabelUpdate as { ruleLabel: Label };
    expect(unchanged.ruleLabel).toEqual(renamed.ruleLabel);
    // Its own name in another case is no clash.
    expect(((await ok(me, UPDATE, { id: label.id, input: { name: 'SAFETY' } })).ruleLabelUpdate as { ruleLabel: Label }).ruleLabel.name).toBe('SAFETY');
    expect(await refused(me, UPDATE, { id: label.id, input: { name: 'scaling' } })).toEqual([409, 'A label named "scaling" already exists.']);
    expect(await refused(me, UPDATE, { id: label.id, input: { name: '' } })).toEqual([422, 'String should have at least 1 character']);
    expect(await refused(me, UPDATE, { id: 0, input: {} })).toEqual([404, 'Label not found.']);

    const names = (await labels(me)).map((item) => item.name);
    expect(names).toEqual([...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
    expect(names).toEqual(expect.arrayContaining(['SAFETY', 'Scaling', 'NL launch']));
  });

  it('deletes a label into Recently deleted and keeps its rules', async () => {
    const me = await owner();
    const [example] = await labels(me);
    const answer = (await ok(me, DELETE, { id: example.id })).ruleLabelDelete as { success: boolean; ruleLabel: Record<string, unknown> };
    expect(answer.success).toBe(true);
    expect(answer.ruleLabel).toMatchObject({ success: true, message: 'Label deleted. Its rules were kept.' });
    interface Trashed { snapshot: { group: unknown; created_at: string; items: { position: number }[] } }
    const [trashed] = await select<Trashed>('SELECT id, kind, entity_id, name, snapshot, deleted_by_user_id FROM deleted_items WHERE id = $1', [answer.ruleLabel.deleted_item_id]);
    expect(trashed).toMatchObject({ kind: 'rule_group', entity_id: example.id, name: 'NL launch', deleted_by_user_id: me.user.id });
    expect(trashed.snapshot.group).toMatchObject({ name: 'NL launch', color: '#f2994a', icon: 'custom', position: 0, owner_user_id: me.user.id });
    expect(trashed.snapshot.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{6})?\+00:00$/);
    expect(trashed.snapshot.items.map((item) => item.position)).toEqual([0, 1, 2, 3, 4]);
    const [{ count }] = await select<{ count: number }>('SELECT count(*)::int AS count FROM rule_group_items WHERE group_id = $1', [example.id]);
    expect(count).toBe(0);
    expect(await refused(me, DELETE, { id: example.id })).toEqual([404, 'Label not found.']);
  });

  it("keeps guests and other workspaces off a workspace's labels", async () => {
    const me = await owner();
    const [example] = await labels(me);
    const guest = await joined(me.workspace, 'guest');
    expect(await refused(guest, CREATE, { input: { name: 'Mine' } })).toEqual([403, "Guests can't perform creating labels"]);
    expect(await refused(guest, UPDATE, { id: example.id, input: { name: 'Mine' } })).toEqual([403, "Guests can't perform editing labels"]);
    expect(await refused(guest, DELETE, { id: example.id })).toEqual([403, "Guests can't perform deleting labels"]);

    const stranger = await owner();
    expect(await refused(stranger, UPDATE, { id: example.id, input: { name: 'Mine' } })).toEqual([404, 'Label not found.']);
    expect(await refused(stranger, DELETE, { id: example.id })).toEqual([404, 'Label not found.']);
    expect((await labels(stranger)).map((label) => label.id)).not.toContain(example.id);
    // The name is unique per workspace, not across them.
    expect((await create(stranger, { name: 'NL launch 2' })).name).toBe('NL launch 2');
    expect((await labels(me)).map((label) => label.name)).toEqual(['NL launch']);
  });
});
