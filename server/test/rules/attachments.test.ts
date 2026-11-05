import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { AccountEntity, UserEntity, WorkspaceMemberEntity, type WorkspaceEntity } from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';

// A rule on ad accounts, where rules stand on entities, and Recently deleted
// restores over GraphQL (tests/test_api.py assign/detach/scope/toggle,
// rule-states and deleted-items cases), against either server.

interface GraphQLAnswer {
  data: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { statusCode?: number } }[];
}

const CREATE = 'mutation($input: JSON!) { ruleCreate(input: $input) { rule } }';
const DELETE = 'mutation($id: Int!) { ruleDelete(id: $id) { rule } }';
const ATTACH = 'mutation($accountId: String!, $input: JSON!) { accountRuleAttach(accountId: $accountId, input: $input) { success account } }';
const DETACH = 'mutation($accountId: String!, $ruleId: Int!) { accountRuleDetach(accountId: $accountId, ruleId: $ruleId) { account } }';
const SCOPE = 'mutation($accountId: String!, $ruleId: Int!, $input: JSON!) { accountRuleScopeUpdate(accountId: $accountId, ruleId: $ruleId, input: $input) { account } }';
const TOGGLE = 'mutation($accountId: String!) { accountRulesToggle(accountId: $accountId) { account } }';
const STATES = 'query($level: String!, $id: String!) { ruleStates(entityLevel: $level, entityId: $id) }';
const RULE_STATES = 'query($id: Int!) { ruleEntityStates(ruleId: $id) }';
const RESTORE = 'mutation($id: Int!) { deletedItemRestore(id: $id) { success deletedItem } }';
const LABEL_CREATE = 'mutation($input: JSON!) { ruleLabelCreate(input: $input) { ruleLabel } }';
const LABEL_DELETE = 'mutation($id: Int!) { ruleLabelDelete(id: $id) { ruleLabel } }';

const STOP = { name: 'Stop', action: 'turn_off', conditions: [{ metric: 'spend', operator: 'gte', value: 5 }] };

describe.skipIf(!DATABASE_URL)('rules on ad accounts', () => {
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

  async function graphql(member: Member, query: string, variables?: Record<string, unknown>): Promise<GraphQLAnswer> {
    const answer = await member.browser.post('/api/graphql', { query, variables }, member.browser.csrf());
    expect(answer.status).toBe(200);
    return answer.body as GraphQLAnswer;
  }

  async function ok<T>(member: Member, query: string, variables: Record<string, unknown>, field: string, entity?: string): Promise<T> {
    const { data, errors } = await graphql(member, query, variables);
    expect(errors).toBeUndefined();
    const value = data![field] as Record<string, unknown>;
    return (entity ? value[entity] : value) as T;
  }

  async function refused(member: Member, query: string, variables?: Record<string, unknown>): Promise<[number | undefined, string]> {
    const { errors } = await graphql(member, query, variables);
    expect(errors).toHaveLength(1);
    return [errors![0].extensions?.statusCode, errors![0].message];
  }

  const createRule = async (member: Member, input: Record<string, unknown> = STOP) => (await ok<{ id: number }>(member, CREATE, { input }, 'ruleCreate', 'rule')).id;

  async function account(member: Member): Promise<{ rules: Record<string, unknown>[]; enabled: boolean }> {
    const [row] = await db.query<{ active_rules: string | null; rules_enabled: boolean }[]>('SELECT active_rules, rules_enabled FROM accounts WHERE id = $1', [member.account.id]);
    return { rules: row.active_rules ? (JSON.parse(row.active_rules) as Record<string, unknown>[]) : [], enabled: row.rules_enabled };
  }

  it('attaches, re-aims, toggles and detaches a rule on an ad account', async () => {
    const me = await owner();
    const accountId = me.account.accountId;
    const id = await createRule(me);
    const attached = await ok<Record<string, unknown>>(me, ATTACH, { accountId: accountId.replace('act_', ''), input: { preset_id: id, scope: { level: 'campaign', ids: ['7'] } } }, 'accountRuleAttach', 'account');
    expect(attached).toMatchObject({ account_id: accountId, rules_enabled: true, message: "Rule 'Stop' added to the ad account" });
    expect(attached.active_rules).toMatchObject([{ preset_id: id, name: 'Stop', check_interval: 5, scope: { level: 'campaign', ids: ['7'] } }]);
    expect(await refused(me, ATTACH, { accountId, input: { preset_id: id } })).toEqual([400, 'This rule is already attached to the ad account.']);
    expect(await refused(me, ATTACH, { accountId, input: { preset_id: 0 } })).toEqual([422, 'Input should be greater than 0']);
    expect(await refused(me, ATTACH, { accountId, input: { preset_id: id, scope: { level: 'adset', ids: [] } } })).toEqual([422, 'Rule scoped to a adset must name at least one id']);
    expect(await refused(me, ATTACH, { accountId, input: { preset_id: 999999999 } })).toEqual([404, 'Preset not found.']);
    expect(await refused(me, ATTACH, { accountId: 'act_404', input: { preset_id: id } })).toEqual([404, 'Ad account not found.']);
    // The opposite rule on the same trigger contradicts it.
    const start = await createRule(me, { ...STOP, name: 'Start', action: 'turn_on' });
    expect(await refused(me, ATTACH, { accountId, input: { preset_id: start } }))
      .toEqual([409, 'Rules “Stop” and “Start” contradict each other: they share the same conditions but take opposite actions.']);

    const scoped = await ok<Record<string, unknown>>(me, SCOPE, { accountId, ruleId: id, input: { level: 'adset', ids: ['1', '1'] } }, 'accountRuleScopeUpdate', 'account');
    expect(scoped).toMatchObject({ account_id: accountId, rules_enabled: true, active_rules: [{ preset_id: id, scope: { level: 'adset', ids: ['1', '1'] } }] });
    expect(await refused(me, SCOPE, { accountId, ruleId: start, input: {} })).toEqual([404, 'This rule is not attached to this ad account.']);

    expect(await ok(me, TOGGLE, { accountId }, 'accountRulesToggle', 'account')).toEqual({ account_id: accountId, rules_enabled: false, message: 'Automation rules disabled' });
    expect(await ok(me, TOGGLE, { accountId }, 'accountRulesToggle', 'account')).toEqual({ account_id: accountId, rules_enabled: true, message: 'Automation rules enabled' });

    const detached = await ok<Record<string, unknown>>(me, DETACH, { accountId, ruleId: id }, 'accountRuleDetach', 'account');
    expect(detached).toEqual({ status: 'ok', message: 'Rule detached from the ad account.', active_rules: [], rules_enabled: false });
    expect(await account(me)).toEqual({ rules: [], enabled: false });
    expect(await refused(me, DETACH, { accountId, ruleId: id })).toEqual([404, 'This rule was not found on this ad account.']);
    expect(await refused(me, TOGGLE, { accountId })).toEqual([400, 'Attach at least one rule to the ad account first.']);
  });

  it('says where rules stand on an entity, as of Buyerly now', async () => {
    const me = await owner();
    const accountId = me.account.accountId;
    const id = await createRule(me, { ...STOP, attachments: [{ account_id: accountId }] });
    const other = await createRule(me, { ...STOP, name: 'Detached', action: 'notify_only' });
    const insert = (ruleId: number, entity: string, name: string) => db.query(
      `INSERT INTO rule_entity_states (workspace_id, account_id, rule_id, entity_level, entity_id, entity_name, campaign_id, state, detail, wait_until, checked_at, acted_at)
       VALUES ($1, $2, $3, 'adset', $4, $5, 'c1', 'cooldown', 'Waits', '2026-11-05T10:00:00.123456Z', '2026-11-05T09:00:00Z', NULL)`,
      [me.workspace.id, accountId, ruleId, entity, name],
    );
    await insert(id, 'as1', 'B ad set');
    await insert(other, 'as1', 'A ad set');
    await insert(id, 'as2', 'C ad set');
    const states = await ok<Record<string, unknown>[]>(me, STATES, { level: 'adset', id: 'as1' }, 'ruleStates');
    expect(states).toEqual([{
      rule_id: id, rule_name: 'Stop', account_id: accountId, account_name: me.account.name ?? '', entity_level: 'adset', entity_id: 'as1',
      entity_name: 'B ad set', campaign_id: 'c1', state: 'cooldown', detail: 'Waits', wait_until: '2026-11-05T10:00:00.123456+00:00',
      yielded_to_rule_id: null, yielded_to_rule_name: '', checked_at: '2026-11-05T09:00:00+00:00', acted_at: '',
    }]);
    expect((await ok<{ entity_id: string }[]>(me, RULE_STATES, { id }, 'ruleEntityStates')).map((state) => state.entity_id)).toEqual(['as1', 'as2']);
    await ok(me, TOGGLE, { accountId }, 'accountRulesToggle');
    expect((await ok<{ state: string }[]>(me, RULE_STATES, { id }, 'ruleEntityStates')).map((state) => state.state)).toEqual(['rules_off', 'rules_off']);
    expect(await refused(me, RULE_STATES, { id: 0 })).toEqual([404, 'Preset not found']);
    expect(await refused(me, STATES, { level: 'account', id: 'as1' })).toEqual([422, "Input should be 'campaign', 'adset' or 'ad'"]);
    expect(await refused(me, STATES, { level: 'ad', id: '' })).toEqual([422, 'String should have at least 1 character']);
  });

  it('restores a deleted rule onto its accounts and a deleted label onto its rules', async () => {
    const me = await owner();
    const accountId = me.account.accountId;
    const label = (await ok<{ id: number }>(me, LABEL_CREATE, { input: { name: 'Keep' } }, 'ruleLabelCreate', 'ruleLabel')).id;
    const id = await createRule(me, { ...STOP, label_ids: [label], attachments: [{ account_id: accountId, scope: { level: 'campaign', ids: ['5'] } }] });
    const trashed = await ok<{ deleted_item_id: number }>(me, DELETE, { id }, 'ruleDelete', 'rule');
    const restored = await ok<Record<string, unknown>>(me, RESTORE, { id: trashed.deleted_item_id }, 'deletedItemRestore', 'deletedItem');
    expect(restored).toEqual({ kind: 'rule', entity_id: id, name: 'Stop', skipped_account_ids: [], missing_rule_ids: [] });
    expect(await account(me)).toMatchObject({ enabled: true, rules: [{ preset_id: id, scope: { level: 'campaign', ids: ['5'] } }] });
    const [{ group_id }] = await db.query<{ group_id: number }[]>('SELECT group_id FROM rule_group_items WHERE preset_id = $1', [id]);
    expect(group_id).toBe(label);
    const [event] = await db.query<Record<string, unknown>[]>("SELECT action, message, details FROM audit_events WHERE rule_id = $1 AND event_type = 'RESTORE_RULE_PRESET'", [id]);
    expect(event).toEqual({ action: 'RESTORE', message: "Rule 'Stop' restored.", details: { restored_account_ids: [accountId], skipped_account_ids: [] } });
    expect(await refused(me, RESTORE, { id: trashed.deleted_item_id })).toEqual([404, 'This item is no longer in Recently deleted.']);

    const labelTrash = await ok<{ deleted_item_id: number }>(me, LABEL_DELETE, { id: label }, 'ruleLabelDelete', 'ruleLabel');
    const gone = await createRule(me, { ...STOP, name: 'Gone', action: 'notify_only', label_ids: [] });
    await db.query('UPDATE deleted_items SET snapshot = jsonb_set(snapshot, \'{items}\', snapshot->\'items\' || $2::jsonb) WHERE id = $1', [labelTrash.deleted_item_id, JSON.stringify([{ preset_id: 0, position: 1 }])]);
    expect(gone).toBeGreaterThan(0);
    expect(await ok(me, RESTORE, { id: labelTrash.deleted_item_id }, 'deletedItemRestore', 'deletedItem'))
      .toEqual({ kind: 'rule_group', entity_id: label, name: 'Keep', skipped_account_ids: [], missing_rule_ids: [0] });

    // A label of the same name made since blocks its restore.
    const again = await ok<{ deleted_item_id: number }>(me, LABEL_DELETE, { id: label }, 'ruleLabelDelete', 'ruleLabel');
    await ok(me, LABEL_CREATE, { input: { name: 'KEEP' } }, 'ruleLabelCreate');
    expect(await refused(me, RESTORE, { id: again.deleted_item_id })).toEqual([409, 'A label named "Keep" already exists.']);
  });

  it('keeps guests and other workspaces out', async () => {
    const me = await owner();
    const id = await createRule(me);
    const guestUser = await createUser(db);
    await db.getRepository(WorkspaceMemberEntity).save({ workspaceId: me.workspace.id, userId: guestUser.id, role: 'guest', joinedAt: new Date() });
    await db.getRepository(UserEntity).update({ id: guestUser.id }, { activeWorkspaceId: me.workspace.id });
    const guest = await signIn(guestUser, me.workspace);
    // A guest's writes reach only their teams' ad accounts: this one is not.
    expect(await refused(guest, ATTACH, { accountId: me.account.accountId, input: { preset_id: id } })).toEqual([404, 'Ad account not found.']);
    expect(await refused(guest, RESTORE, { id: 1 })).toEqual([403, "Guests can't perform restoring deleted items"]);
    const stranger = await owner();
    expect(await refused(stranger, ATTACH, { accountId: me.account.accountId, input: { preset_id: id } })).toEqual([404, 'Ad account not found.']);
    expect(await refused(stranger, RULE_STATES, { id })).toEqual([404, 'Preset not found']);
  });
});
