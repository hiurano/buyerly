import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { AccountEntity, UserEntity, WorkspaceMemberEntity, type WorkspaceEntity } from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';

// Saved rules over GraphQL (tests/test_api.py preset cases,
// tests/test_client_api.py), against either server: the rule window's
// create, edit and check, the copies on ad accounts, deleting into
// Recently deleted, and labels on rules.

interface GraphQLAnswer {
  data: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { statusCode?: number } }[];
}

type Rule = Record<string, unknown> & { id: number; label_ids: number[]; attached_account_ids: string[] };

const RULES = 'query { rules }';
const LABELS = 'query { ruleLabels }';
const CHECK = 'query($input: JSON!) { ruleDraftCheck(input: $input) }';
const CREATE = 'mutation($input: JSON!) { ruleCreate(input: $input) { success lastSyncId rule } }';
const UPDATE = 'mutation($id: Int!, $input: JSON!) { ruleUpdate(id: $id, input: $input) { success rule } }';
const DELETE = 'mutation($id: Int!) { ruleDelete(id: $id) { success rule } }';
const LABELS_SET = 'mutation($id: Int!, $input: JSON!) { ruleLabelsSet(id: $id, input: $input) { success rule } }';
const LABELS_CHANGE = 'mutation($input: JSON!) { rulesLabelsChange(input: $input) { success rules } }';
const LABEL_CREATE = 'mutation($input: JSON!) { ruleLabelCreate(input: $input) { ruleLabel } }';

const STOP = {
  name: 'Stop at $5',
  action: 'turn_off',
  conditions: [{ metric: 'spend', operator: 'gte', value: 5, time_window: 'today' }, { metric: 'leads', operator: 'eq', value: 0 }],
};

describe.skipIf(!DATABASE_URL)('rules', () => {
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

  async function signIn(user: UserEntity, workspace: WorkspaceEntity, headers: Record<string, string> = {}): Promise<Member> {
    const browser = new Browser(target, { 'x-workspace-slug': workspace.slug, ...headers });
    expect((await browser.signIn(user.email!)).status).toBe(200);
    const account = await db.getRepository(AccountEntity).findOneByOrFail({ workspaceId: workspace.id });
    return { browser, user, workspace, account };
  }

  async function owner(): Promise<Member> {
    const user = await createUser(db);
    return signIn(user, await createWorkspace(db, user));
  }

  async function joined(workspace: WorkspaceEntity, role: string): Promise<Member> {
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

  async function create(member: Member, input: Record<string, unknown>): Promise<Rule> {
    return ((await ok(member, CREATE, { input })).ruleCreate as { rule: Rule }).rule;
  }

  async function rules(member: Member): Promise<Rule[]> {
    return (await ok(member, RULES)).rules as Rule[];
  }

  async function activeRules(account: AccountEntity): Promise<{ rules: Record<string, unknown>[]; enabled: boolean }> {
    const [row] = await db.query<{ active_rules: string | null; rules_enabled: boolean }[]>(
      'SELECT active_rules, rules_enabled FROM accounts WHERE id = $1', [account.id],
    );
    return { rules: row.active_rules ? (JSON.parse(row.active_rules) as Record<string, unknown>[]) : [], enabled: row.rules_enabled };
  }

  it('lists the example rules, newest first, in the rule shape', async () => {
    const me = await owner();
    const listed = await rules(me);
    expect(listed.map((rule) => rule.name)).toEqual(['$12 ceiling', '$7 and no registration', '$4 and no lead', '$3.50 and one click', '$3 and no click']);
    const [label] = (await ok(me, LABELS)).ruleLabels as { id: number }[];
    expect(listed[3]).toMatchObject({
      action: 'turn_off',
      level: 'adset',
      enabled: true,
      conditions: [
        { metric: 'spend', operator: 'gte', value: 3.5, time_window: 'lifetime' },
        { metric: 'link_clicks', operator: 'lte', value: 1, time_window: 'lifetime' },
      ],
      condition_logic: 'and',
      cooldown_minutes: 1440,
      check_interval_minutes: 5,
      budget_change_percent: 0,
      budget_max_daily: 0,
      currency_mode: 'account',
      needs_review: false,
      review_reason: '',
      last_run_at: '',
      last_checked_at: '',
      attached_account_ids: [],
      attached_scopes: {},
      label_ids: [label.id],
    });
    expect(listed[0].created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    // Called again, nothing new: the set comes once.
    expect((await rules(me)).length).toBe(5);
  });

  it('holds back a stored rule that is legacy or unsafe', async () => {
    const me = await owner();
    await rules(me);
    const [legacy] = await db.query<{ id: number }[]>(
      `INSERT INTO rule_presets (workspace_id, owner_user_id, name, action, level, enabled, conditions, condition_logic,
         cooldown_minutes, check_interval_minutes, notify_tg, budget_change_percent, budget_max_daily, created_at, updated_at)
       VALUES ($1, $2, 'Old CPA', 'turn_off', 'adset', true, '[{"metric": "cpa", "operator": "gt", "value": 3}, {"metric": "cpl", "operator": "gt", "value": 2, "note": 1}]'::jsonb,
         'and', 0, 5, true, 0, 0, now(), now()) RETURNING id`,
      [me.workspace.id, me.user.id],
    );
    const [unsafe] = await db.query<{ id: number }[]>(
      `INSERT INTO rule_presets (workspace_id, owner_user_id, name, action, level, enabled, conditions, condition_logic,
         cooldown_minutes, check_interval_minutes, notify_tg, budget_change_percent, budget_max_daily, created_at, updated_at)
       VALUES ($1, $2, 'Raise', 'increase_budget', 'adset', true, '[{"metric": "cpl", "operator": "lt", "value": "4"}]'::jsonb,
         'and', 0, 5, true, 20, 0, now(), now()) RETURNING id`,
      [me.workspace.id, me.user.id],
    );
    const listed = await rules(me);
    expect(listed.find((rule) => rule.id === legacy.id)).toMatchObject({
      enabled: false, needs_review: true, review_reason: 'Replace the legacy combined CPA with CPL, CPReg or CPP.', conditions: [],
    });
    expect(listed.find((rule) => rule.id === unsafe.id)).toMatchObject({
      enabled: false,
      needs_review: true,
      review_reason: 'The rule is stored in an old or unsafe format and must be re-saved.',
      conditions: [{ metric: 'cpl', operator: 'lt', value: 4, time_window: 'today' }],
    });
    expect(await refused(me, UPDATE, { id: legacy.id, input: { ...STOP, attachments: [{ account_id: 'act_1' }] } })).toEqual([404, 'Ad account not found.']);
  });

  it('creates a rule with labels and attachments, and checks a draft as saving does', async () => {
    const me = await owner();
    const label = ((await ok(me, LABEL_CREATE, { input: { name: 'Stops' } })).ruleLabelCreate as { ruleLabel: { id: number } }).ruleLabel;
    const created = (await ok(me, CREATE, {
      input: { ...STOP, name: '  Stop at $5 ', label_ids: [label.id, label.id], attachments: [{ account_id: me.account.accountId.replace('act_', ''), scope: { level: 'campaign', ids: ['111'] } }] },
    })).ruleCreate as { success: boolean; lastSyncId: number; rule: Rule };
    expect(created.success).toBe(true);
    expect(created.rule).toMatchObject({
      name: 'Stop at $5',
      enabled: true,
      conditions: [{ metric: 'spend', operator: 'gte', value: 5, time_window: 'today' }, { metric: 'leads', operator: 'eq', value: 0, time_window: 'today' }],
      cooldown_minutes: 0,
      check_interval_minutes: 5,
      label_ids: [label.id],
      attached_account_ids: [me.account.accountId],
      attached_scopes: { [me.account.accountId]: { level: 'campaign', ids: ['111'] } },
    });
    const attached = await activeRules(me.account);
    expect(attached.enabled).toBe(true);
    expect(attached.rules).toEqual([{
      preset_id: created.rule.id,
      workspace_id: me.workspace.id,
      name: 'Stop at $5',
      action: 'turn_off',
      level: 'adset',
      enabled: true,
      conditions: [{ metric: 'spend', operator: 'gte', value: 5, time_window: 'today' }, { metric: 'leads', operator: 'eq', value: 0, time_window: 'today' }],
      logic: 'and',
      cooldown_minutes: 0,
      check_interval: 5,
      budget_change_percent: 0,
      budget_max_daily: 0,
      currency_mode: 'account',
      scope: { level: 'campaign', ids: ['111'] },
    }]);

    expect((await ok(me, CHECK, { input: STOP })).ruleDraftCheck).toEqual({ valid: true });
    const contradiction = { ...STOP, conditions: [{ metric: 'spend', operator: 'gt', value: 5 }, { metric: 'spend', operator: 'lt', value: 3 }] };
    expect(await refused(me, CHECK, { input: contradiction })).toEqual([422, 'Conditions contradict each other: “spend today” cannot fall into the given range.']);
    expect(await refused(me, CREATE, { input: contradiction })).toEqual([422, 'Conditions contradict each other: “spend today” cannot fall into the given range.']);
    expect(await refused(me, CREATE, { input: { ...STOP, action: 'increase_budget', budget_change_percent: 10 } })).toEqual([422, 'Budget increase requires a positive daily ceiling']);
    expect(await refused(me, CREATE, { input: { ...STOP, conditions: [{ metric: 'leads', operator: 'gte', value: 1.5 }] } })).toEqual([422, 'Leads, registrations, purchases and clicks must be whole numbers.']);
    expect(await refused(me, CREATE, { input: { ...STOP, action: 'pause' } })).toEqual([422, "Input should be 'turn_off', 'notify_only', 'turn_on', 'increase_budget' or 'decrease_budget'"]);
    expect(await refused(me, CREATE, { input: { ...STOP, name: '' } })).toEqual([422, 'String should have at least 1 character']);
    expect(await refused(me, CREATE, { input: { ...STOP, conditions: [] } })).toEqual([422, 'List should have at least 1 item after validation, not 0']);
    expect(await refused(me, CREATE, { input: { ...STOP, attachments: [{ account_id: '1' }, { account_id: 'act_1' }] } })).toEqual([422, 'Each ad account can be chosen once.']);
    expect(await refused(me, CREATE, { input: { ...STOP, attachments: [{ account_id: '1', scope: { level: 'campaign' } }] } })).toEqual([422, 'Rule scoped to a campaign must name at least one id']);
    expect(await refused(me, CREATE, { input: { ...STOP, label_ids: [0] } })).toEqual([400, 'One or more labels no longer exist.']);
    expect(await refused(me, CREATE, { input: { ...STOP, attachments: [{ account_id: '999999999' }] } })).toEqual([404, 'Ad account not found.']);
    // An opposite rule on the same trigger cannot join it on the account.
    expect(await refused(me, CREATE, { input: { ...STOP, name: 'Start', action: 'turn_on', attachments: [{ account_id: me.account.accountId }] } }))
      .toEqual([409, 'Rules “Stop at $5” and “Start” contradict each other: they share the same conditions but take opposite actions.']);
    // Nothing of the refused writes stayed.
    expect((await rules(me)).filter((rule) => rule.name === 'Start')).toEqual([]);
  });

  it('edits a rule and its copies on ad accounts, keeping each copy\'s scope', async () => {
    const me = await owner();
    const rule = await create(me, { ...STOP, attachments: [{ account_id: me.account.accountId, scope: { level: 'adset', ids: ['9'] } }] });
    const edited = ((await ok(me, UPDATE, { id: rule.id, input: { ...STOP, name: ' ', cooldown_minutes: 60, conditions: [{ metric: 'cpl', operator: 'gt', value: 7.5 }] } })).ruleUpdate as { rule: Rule }).rule;
    expect(edited).toMatchObject({ name: 'Stop at $5', cooldown_minutes: 60, conditions: [{ metric: 'cpl', operator: 'gt', value: 7.5, time_window: 'today' }], attached_account_ids: [me.account.accountId] });
    expect((await activeRules(me.account)).rules).toMatchObject([{ preset_id: rule.id, cooldown_minutes: 60, scope: { level: 'adset', ids: ['9'] } }]);
    // Attachments sent make the whole set: none detaches, and the account's automation goes off.
    const detached = ((await ok(me, UPDATE, { id: rule.id, input: { ...STOP, attachments: [] } })).ruleUpdate as { rule: Rule }).rule;
    expect(detached.attached_account_ids).toEqual([]);
    expect(await activeRules(me.account)).toEqual({ rules: [], enabled: false });
    expect(await refused(me, UPDATE, { id: 0, input: STOP })).toEqual([404, 'Preset not found']);
  });

  it('deletes a rule into Recently deleted, off every ad account', async () => {
    const me = await owner();
    const label = ((await ok(me, LABEL_CREATE, { input: { name: 'Gone' } })).ruleLabelCreate as { ruleLabel: { id: number } }).ruleLabel;
    const rule = await create(me, { ...STOP, label_ids: [label.id], attachments: [{ account_id: me.account.accountId }] });
    const answer = ((await ok(me, DELETE, { id: rule.id })).ruleDelete as { rule: { success: boolean; message: string; deleted_item_id: number } }).rule;
    expect(answer).toMatchObject({ success: true, message: 'Preset deleted' });
    expect(await activeRules(me.account)).toEqual({ rules: [], enabled: false });
    const [trashed] = await db.query<{ kind: string; name: string; snapshot: Record<string, unknown> }[]>('SELECT kind, name, snapshot FROM deleted_items WHERE id = $1', [answer.deleted_item_id]);
    expect(trashed).toMatchObject({ kind: 'rule', name: 'Stop at $5' });
    expect(trashed.snapshot).toMatchObject({
      preset: { name: 'Stop at $5', action: 'turn_off', enabled: true, level: 'adset', notify_tg: true, owner_user_id: me.user.id },
      group_items: [{ group_id: label.id, position: 0 }],
      attachments: [{ account_id: me.account.accountId, scope: { level: 'account', ids: [] }, switched_account_off: true }],
    });
    expect(trashed.snapshot.created_at).toMatch(/\+00:00$/);
    const [event] = await db.query<Record<string, unknown>[]>(
      "SELECT category, event_type, rule_name, action, message, before_state, after_state, details, actor_type FROM audit_events WHERE rule_id = $1 AND event_type = 'DELETE_RULE_PRESET'", [rule.id],
    );
    expect(event).toMatchObject({
      category: 'MANUAL_ACTION', rule_name: 'Stop at $5', action: 'DELETE', message: "Rule 'Stop at $5' deleted.", actor_type: 'user',
      after_state: { deleted: true }, details: { affected_account_ids: [me.account.accountId] },
    });
    expect(await refused(me, DELETE, { id: rule.id })).toEqual([404, 'Preset not found']);
  });

  it('puts labels on rules one by one and in bulk', async () => {
    const me = await owner();
    const [first, second] = [await create(me, STOP), await create(me, { ...STOP, name: 'Other', action: 'notify_only' })];
    const label = async (name: string) => ((await ok(me, LABEL_CREATE, { input: { name } })).ruleLabelCreate as { ruleLabel: { id: number } }).ruleLabel.id;
    const [a, b] = [await label('A'), await label('B')];
    const set = ((await ok(me, LABELS_SET, { id: first.id, input: { label_ids: [b, a] } })).ruleLabelsSet as { rule: Rule }).rule;
    expect(set.label_ids).toEqual([b, a]);
    const changed = (await ok(me, LABELS_CHANGE, { input: { preset_ids: [first.id, second.id, first.id], add_label_ids: [a], remove_label_ids: [b] } })).rulesLabelsChange as { rules: unknown };
    expect(changed.rules).toEqual({ updated_count: 2 });
    const listed = await rules(me);
    expect(listed.find((rule) => rule.id === first.id)!.label_ids).toEqual([a]);
    expect(listed.find((rule) => rule.id === second.id)!.label_ids).toEqual([a]);
    expect(await refused(me, LABELS_CHANGE, { input: { preset_ids: [0, first.id] } })).toEqual([400, 'Rules not found or unavailable: 0']);
    expect(await refused(me, LABELS_SET, { id: first.id, input: { label_ids: [0] } })).toEqual([400, 'One or more labels no longer exist.']);
    expect(await refused(me, LABELS_CHANGE, { input: { preset_ids: [] } })).toEqual([422, 'List should have at least 1 item after validation, not 0']);
  });

  it('keeps guests to the rules on their ad accounts and off rule writes', async () => {
    const me = await owner();
    const rule = await create(me, STOP);
    const guest = await joined(me.workspace, 'guest');
    expect(await rules(guest)).toEqual([]);
    expect(await refused(guest, CREATE, { input: STOP })).toEqual([403, "Guests can't perform creating rules"]);
    expect(await refused(guest, UPDATE, { id: rule.id, input: STOP })).toEqual([403, "Guests can't perform editing rules"]);
    expect(await refused(guest, DELETE, { id: rule.id })).toEqual([403, "Guests can't perform deleting rules"]);
    expect(await refused(guest, LABELS_SET, { id: rule.id, input: {} })).toEqual([403, "Guests can't perform labelling rules"]);
    const stranger = await owner();
    expect(await refused(stranger, UPDATE, { id: rule.id, input: STOP })).toEqual([404, 'Preset not found']);
    expect((await rules(stranger)).map((item) => item.id)).not.toContain(rule.id);
  });

  it('leaves an Inbox row when the browser assistant changed rules', async () => {
    const me = await owner();
    const assistant = await signIn(me.user, me.workspace, { 'x-buyerly-agent': 'webmcp' });
    const rule = await create(assistant, STOP);
    const [event] = await db.query<Record<string, unknown>[]>(
      "SELECT category, event_type, action, message, details, account_id, owner_user_id FROM audit_events WHERE rule_id = $1 AND event_type = 'ASSISTANT_CREATE_RULE'", [rule.id],
    );
    expect(event).toMatchObject({
      category: 'MANUAL_ACTION', action: 'CREATE', message: "Rule 'Stop at $5' created by the AI assistant.", account_id: '', owner_user_id: me.user.id,
      details: { via: 'webmcp', rule_action: 'turn_off' },
    });
  });
});
