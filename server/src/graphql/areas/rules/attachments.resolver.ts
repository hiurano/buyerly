import { randomBytes } from 'node:crypto';
import { Arg, Ctx, Int, Mutation, Query, Resolver } from 'type-graphql';
import type { EntityManager } from 'typeorm';
import { rows } from '../../../database.ts';
import { AuditEventEntity, type UserEntity } from '../../../entities/index.ts';
import {
  PRESET_COLUMNS,
  ensureCompatibleRuleSet,
  loadActiveRules,
  presetSnapshot,
  pyJsonDumps,
  pythonIsoSql,
  recordAssistantChange,
  type PresetRow,
} from '../../../rules/presets.ts';
import { RULE_MAX_SCOPE_IDS, RuleValueError, normalizeRuleScope, validateRuleSetCompatibility } from '../../../rules/validation.ts';
import { KIND_RULE, KIND_RULE_GROUP, purgeExpired } from '../../../trash/trash.ts';
import { userWorkspaceMember } from '../../../workspaces/access.ts';
import { accountAccess, allowsAccount, type AccountAccess } from '../../../workspaces/account-access.ts';
import { mutated, type GraphQLContext } from '../../context.ts';
import { INTERNAL_ERROR, RouteError, invalidInput } from '../../errors.ts';
import { inputSchema } from '../../input.ts';
import { AccountPayload, DeletedItemPayload, type Payload } from '../../payloads.ts';
import { JSONScalar } from '../../scalars.ts';
import { ensureWriteAccess, scopeOf } from '../accounts/scope.ts';

// A rule on ad accounts (api/routers/rules.py assign-rule, detach-rule,
// rules/{id}/scope, toggle-rules), where rules stand on entities (rule-states,
// presets/{id}/states), and bringing a rule or label back from Recently
// deleted (api/routers/trash.py restore).

const SCOPE_PROPERTIES = {
  level: { enum: ['account', 'campaign', 'adset'] },
  ids: { type: 'array', items: { type: 'string' }, maxItems: RULE_MAX_SCOPE_IDS },
};

// api/schemas/rules.py RuleScopeItem and ApplyPresetRequest (extra="forbid").
const SCOPE = inputSchema<{ level?: string; ids?: string[] }>({ type: 'object', additionalProperties: false, properties: SCOPE_PROPERTIES });
const APPLY = inputSchema<{ preset_id: number; scope?: { level?: string; ids?: string[] } }>({
  type: 'object',
  additionalProperties: false,
  required: ['preset_id'],
  properties: {
    preset_id: { type: 'integer', exclusiveMinimum: 0 },
    scope: { type: 'object', additionalProperties: false, properties: SCOPE_PROPERTIES },
  },
});

// RuleScopeItem's model: defaults, then its validator (normalize_rule_scope); the dump is as sent.
function scopeItem(value: { level?: string; ids?: string[] } | undefined): { level: string; ids: string[] } {
  const scope = { level: value?.level ?? 'account', ids: value?.ids ?? [] };
  try {
    normalizeRuleScope(scope);
  } catch (error) {
    if (error instanceof RuleValueError) throw invalidInput([`Value error, ${error.message}`]);
    throw error;
  }
  return scope;
}

interface AccountRow { id: number; account_id: string; name: string | null; owner_user_id: number | null; active_rules: string | null; rules_enabled: boolean | null }

const actKey = (accountId: string): string => (accountId.startsWith('act_') ? accountId : `act_${accountId}`);

async function memberAccess(tx: EntityManager, scope: { workspaceId: number; member: { id: number | null } }): Promise<AccountAccess> {
  return accountAccess(tx, scope.member.id === null ? null : (scope.member as Parameters<typeof accountAccess>[1]), scope.workspaceId);
}

// The workspace's ad account the member sees, else 404.
async function visibleAccount(tx: EntityManager, workspaceId: number, accountId: string, access: AccountAccess): Promise<AccountRow> {
  const [account] = await rows<AccountRow>(
    tx,
    'SELECT id, account_id, name, owner_user_id, active_rules, rules_enabled FROM accounts WHERE account_id = $1 AND workspace_id = $2 FOR UPDATE',
    [actKey(accountId), workspaceId],
  );
  if (!account || !allowsAccount(access, account.account_id)) throw new RouteError(404, 'Ad account not found.');
  return account;
}

async function saveAccount(tx: EntityManager, account: AccountRow, activeRules: Record<string, unknown>[], rulesEnabled: boolean | null): Promise<void> {
  await rows(tx, 'UPDATE accounts SET active_rules = $1, rules_enabled = $2 WHERE id = $3', [pyJsonDumps(activeRules), rulesEnabled, account.id]);
}

interface StateRow {
  rule_id: number;
  account_id: string;
  entity_level: string;
  entity_id: string;
  entity_name: string;
  campaign_id: string;
  state: string;
  detail: string;
  wait_until: string;
  yielded_to_rule_id: number | null;
  yielded_to_rule_name: string;
  checked_at: string;
  acted_at: string;
}

const RULE_ENTITY_STATES_LIMIT = 1000;

// deps.py _rule_entity_states: where rules stand on entities as of each rule's
// latest check, with what changed in Buyerly since winning (a rule no longer
// attached is left out; a paused rule or an account with rules off says so).
async function ruleEntityStates(
  tx: EntityManager,
  workspaceId: number,
  filter: { presetId?: number; entityLevel?: string; entityId?: string },
  access: AccountAccess,
): Promise<Record<string, unknown>[]> {
  const where = ['workspace_id = $1'];
  const parameters: unknown[] = [workspaceId];
  const add = (column: string, value: unknown) => {
    parameters.push(value);
    where.push(`${column} = $${parameters.length}`);
  };
  if (filter.presetId !== undefined) add('rule_id', filter.presetId);
  if (filter.entityLevel !== undefined) add('entity_level', filter.entityLevel);
  if (filter.entityId !== undefined) add('entity_id', filter.entityId);
  const iso = (column: string) => `coalesce(${pythonIsoSql(column)}, '')`;
  const found = (await rows<StateRow>(
    tx,
    `SELECT rule_id, account_id, entity_level, entity_id, entity_name, campaign_id, state, detail,
            ${iso('wait_until')} AS wait_until, yielded_to_rule_id, yielded_to_rule_name,
            ${iso('checked_at')} AS checked_at, ${iso('acted_at')} AS acted_at
       FROM rule_entity_states WHERE ${where.join(' AND ')}
      ORDER BY entity_name, id LIMIT ${RULE_ENTITY_STATES_LIMIT}`,
    parameters,
  )).filter((row) => allowsAccount(access, row.account_id));
  if (!found.length) return [];
  const accounts = new Map((await rows<AccountRow>(
    tx,
    'SELECT id, account_id, name, owner_user_id, active_rules, rules_enabled FROM accounts WHERE workspace_id = $1 AND account_id = ANY($2::varchar[])',
    [workspaceId, [...new Set(found.map((row) => row.account_id))]],
  )).map((account) => [account.account_id, account]));
  const names = new Map((await rows<{ id: number; name: string }>(
    tx, 'SELECT id, name FROM rule_presets WHERE workspace_id = $1 AND id = ANY($2::int[])', [workspaceId, [...new Set(found.map((row) => row.rule_id))]],
  )).map((preset) => [preset.id, preset.name]));
  const attached = new Map([...accounts].map(([accountId, account]) => [
    accountId,
    new Map(loadActiveRules(account.active_rules).map((rule) => [rule.preset_id, rule])),
  ]));
  const items: Record<string, unknown>[] = [];
  for (const row of found) {
    const account = accounts.get(row.account_id);
    if (!account || !names.has(row.rule_id)) continue;
    const rule = attached.get(row.account_id)!.get(row.rule_id);
    if (rule === undefined) continue;
    let state = row.state;
    if (!account.rules_enabled) state = 'rules_off';
    else if (rule.enabled === false) state = 'rule_paused';
    items.push({
      rule_id: row.rule_id,
      rule_name: names.get(row.rule_id),
      account_id: row.account_id,
      account_name: account.name || '',
      entity_level: row.entity_level,
      entity_id: row.entity_id,
      entity_name: row.entity_name,
      campaign_id: row.campaign_id,
      state,
      detail: row.detail,
      wait_until: row.wait_until,
      yielded_to_rule_id: row.yielded_to_rule_id,
      yielded_to_rule_name: row.yielded_to_rule_name,
      checked_at: row.checked_at,
      acted_at: row.acted_at,
    });
  }
  return items;
}

async function readScope(tx: EntityManager, user: UserEntity): Promise<{ workspaceId: number; access: AccountAccess }> {
  const found = await userWorkspaceMember(tx, user);
  // get_user_workspace answered None: the Python handlers fail on ws.id.
  if (!found) throw INTERNAL_ERROR();
  return { workspaceId: found.workspace.id, access: await accountAccess(tx, found.member.id === null ? null : found.member, found.workspace.id) };
}

function entityLevel(value: string): string {
  if (!['campaign', 'adset', 'ad'].includes(value)) throw invalidInput(["Input should be 'campaign', 'adset' or 'ad'"]);
  return value;
}

function entityId(value: string): string {
  const length = [...value].length;
  if (length < 1) throw invalidInput(['String should have at least 1 character']);
  if (length > 64) throw invalidInput(['String should have at most 64 characters']);
  return value;
}

async function existingUserId(tx: EntityManager, userId: unknown): Promise<number | null> {
  if (!userId) return null;
  const [found] = await rows(tx, 'SELECT id FROM users WHERE id = $1', [userId]);
  return found ? (userId as number) : null;
}

const ICON_COLORS: Record<string, string> = { shield: '#4cb782', rocket: '#bb87fc', flask: '#f2c94c' };

@Resolver()
export class RuleAttachmentsResolver {
  @Mutation(() => AccountPayload, { nullable: true, description: 'Attaches a rule to an ad account.' })
  async accountRuleAttach(
    @Arg('accountId', () => String) accountId: string,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const req = APPLY.parse(input);
    const scopeValue = scopeItem(req.scope);
    const record = await context.app.db.transaction(async (tx) => {
      const scope = await scopeOf(tx, context.user);
      ensureWriteAccess(scope, 'attaching rules to an ad account', true);
      const account = await visibleAccount(tx, scope.workspaceId, accountId, await memberAccess(tx, scope));
      const [preset] = await rows<PresetRow>(tx, `SELECT ${PRESET_COLUMNS} FROM rule_presets WHERE id = $1 AND workspace_id = $2`, [req.preset_id, scope.workspaceId]);
      if (!preset) throw new RouteError(404, 'Preset not found.');
      const rule = presetSnapshot(preset);
      if (rule.needs_review) throw new RouteError(400, 'This rule has unsafe or outdated settings. Open it and save it again.');
      rule.scope = scopeValue;
      const activeRules = loadActiveRules(account.active_rules);
      if (activeRules.some((item) => item.preset_id === rule.preset_id)) throw new RouteError(400, 'This rule is already attached to the ad account.');
      activeRules.push(rule);
      ensureCompatibleRuleSet(activeRules);
      await saveAccount(tx, account, activeRules, true);
      await recordAssistantChange(tx, context.http.headers, {
        workspaceId: scope.workspaceId,
        user: context.user,
        eventType: 'ASSISTANT_ATTACH_RULE',
        action: 'ATTACH',
        message: `Rule '${preset.name}' attached by the AI assistant.`,
        presetId: preset.id,
        presetName: preset.name,
        account,
        details: { scope: scopeValue, turned_automation_on: !account.rules_enabled },
      });
      return { account_id: account.account_id, active_rules: activeRules, rules_enabled: true, message: `Rule '${preset.name}' added to the ad account` };
    });
    return mutated(context, AccountPayload, record);
  }

  @Mutation(() => AccountPayload, { nullable: true, description: 'Detaches a rule from an ad account.' })
  async accountRuleDetach(
    @Arg('accountId', () => String) accountId: string,
    @Arg('ruleId', () => Int) ruleId: number,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const record = await context.app.db.transaction(async (tx) => {
      const scope = await scopeOf(tx, context.user);
      ensureWriteAccess(scope, 'detaching rules from an ad account', true);
      const account = await visibleAccount(tx, scope.workspaceId, accountId, await memberAccess(tx, scope));
      const activeRules = loadActiveRules(account.active_rules);
      const detached = activeRules.find((rule) => rule.preset_id === ruleId);
      const remaining = activeRules.filter((rule) => rule.preset_id !== ruleId);
      if (remaining.length === activeRules.length) throw new RouteError(404, 'This rule was not found on this ad account.');
      const rulesEnabled = remaining.length ? account.rules_enabled : false;
      await saveAccount(tx, account, remaining, rulesEnabled);
      const detachedName = detached && 'name' in detached ? detached.name : ruleId;
      await recordAssistantChange(tx, context.http.headers, {
        workspaceId: scope.workspaceId,
        user: context.user,
        eventType: 'ASSISTANT_DETACH_RULE',
        action: 'DETACH',
        message: `Rule '${String(detachedName)}' detached by the AI assistant.`,
        presetId: ruleId,
        presetName: detached && 'name' in detached ? String(detached.name) : '',
        account,
        details: { turned_automation_off: !remaining.length },
      });
      return { status: 'ok', message: 'Rule detached from the ad account.', active_rules: remaining, rules_enabled: rulesEnabled };
    });
    return mutated(context, AccountPayload, record);
  }

  @Mutation(() => AccountPayload, { nullable: true, description: 'Narrows an attached rule to some campaigns, ad sets or ads.' })
  async accountRuleScopeUpdate(
    @Arg('accountId', () => String) accountId: string,
    @Arg('ruleId', () => Int) ruleId: number,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const scopeValue = scopeItem(SCOPE.parse(input));
    const record = await context.app.db.transaction(async (tx) => {
      const scope = await scopeOf(tx, context.user);
      ensureWriteAccess(scope, "changing a rule's scope", true);
      const account = await visibleAccount(tx, scope.workspaceId, accountId, await memberAccess(tx, scope));
      const activeRules = loadActiveRules(account.active_rules);
      let matched = false;
      for (const rule of activeRules) {
        if (rule.preset_id !== ruleId) continue;
        rule.scope = scopeValue;
        matched = true;
      }
      if (!matched) throw new RouteError(404, 'This rule is not attached to this ad account.');
      // Narrowing can free a contradicting pair; widening can create one.
      ensureCompatibleRuleSet(activeRules);
      await saveAccount(tx, account, activeRules, account.rules_enabled);
      return { account_id: account.account_id, active_rules: activeRules, rules_enabled: account.rules_enabled };
    });
    return mutated(context, AccountPayload, record);
  }

  @Mutation(() => AccountPayload, { nullable: true, description: "Turns an ad account's rules on or off." })
  async accountRulesToggle(@Arg('accountId', () => String) accountId: string, @Ctx() context: GraphQLContext): Promise<Payload> {
    const record = await context.app.db.transaction(async (tx) => {
      const scope = await scopeOf(tx, context.user);
      ensureWriteAccess(scope, 'enabling/disabling rules', true);
      const account = await visibleAccount(tx, scope.workspaceId, accountId, await memberAccess(tx, scope));
      const activeRules = loadActiveRules(account.active_rules);
      if (!account.rules_enabled && !activeRules.length) throw new RouteError(400, 'Attach at least one rule to the ad account first.');
      if (!account.rules_enabled) ensureCompatibleRuleSet(activeRules);
      const enabled = !account.rules_enabled;
      await rows(tx, 'UPDATE accounts SET rules_enabled = $1 WHERE id = $2', [enabled, account.id]);
      return { account_id: account.account_id, rules_enabled: enabled, message: `Automation rules ${enabled ? 'enabled' : 'disabled'}` };
    });
    return mutated(context, AccountPayload, record);
  }

  @Query(() => JSONScalar, { description: 'What each rule last decided about one campaign, ad set or ad.' })
  async ruleStates(
    @Arg('entityLevel', () => String) level: string,
    @Arg('entityId', () => String) id: string,
    @Ctx() { app, user }: GraphQLContext,
  ): Promise<unknown> {
    const filter = { entityLevel: entityLevel(level), entityId: entityId(id) };
    return app.db.transaction(async (tx) => {
      const { workspaceId, access } = await readScope(tx, user);
      return ruleEntityStates(tx, workspaceId, filter, access);
    });
  }

  @Query(() => JSONScalar, { description: 'What one rule last decided about each entity it checks.' })
  async ruleEntityStates(@Arg('ruleId', () => Int) ruleId: number, @Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    return app.db.transaction(async (tx) => {
      const { workspaceId, access } = await readScope(tx, user);
      const [preset] = await rows(tx, 'SELECT id FROM rule_presets WHERE id = $1 AND workspace_id = $2', [ruleId, workspaceId]);
      if (!preset) throw new RouteError(404, 'Preset not found');
      return ruleEntityStates(tx, workspaceId, { presetId: ruleId }, access);
    });
  }

  @Mutation(() => DeletedItemPayload, { nullable: true, description: 'Restores a rule or label from Recently deleted.' })
  async deletedItemRestore(@Arg('id', () => Int) id: number, @Ctx() context: GraphQLContext): Promise<Payload> {
    const record = await context.app.db.transaction(async (tx) => {
      const scope = await scopeOf(tx, context.user);
      ensureWriteAccess(scope, 'restoring deleted items');
      await purgeExpired(tx, scope.workspaceId);
      const [item] = await rows<{ id: number; kind: string; entity_id: number; snapshot: Record<string, unknown> | null }>(
        tx, 'SELECT id, kind, entity_id, snapshot FROM deleted_items WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [id, scope.workspaceId],
      );
      if (!item) throw new RouteError(404, 'This item is no longer in Recently deleted.');
      let result: Record<string, unknown>;
      if (item.kind === KIND_RULE) result = await restoreRule(tx, scope.workspaceId, item, context.user);
      else if (item.kind === KIND_RULE_GROUP) result = await restoreGroup(tx, scope.workspaceId, item);
      else throw new RouteError(400, 'This item cannot be restored.');
      await rows(tx, 'DELETE FROM deleted_items WHERE id = $1', [item.id]);
      return result;
    });
    return mutated(context, DeletedItemPayload, record);
  }
}

type Snapshot = Record<string, unknown>;
const entries = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? (value as Record<string, unknown>[]) : []);

// trash.py _restore_rule: the row under its old id, back into the labels that
// still exist and onto every ad account it ran on, unless the account is gone
// or now runs a rule it would contradict (reported, not forced).
async function restoreRule(tx: EntityManager, workspaceId: number, item: { entity_id: number; snapshot: Snapshot | null }, user: UserEntity): Promise<Record<string, unknown>> {
  const [exists] = await rows(tx, 'SELECT id FROM rule_presets WHERE id = $1', [item.entity_id]);
  if (exists) throw new RouteError(409, 'This rule already exists.');
  const snapshot = item.snapshot ?? {};
  const fields = { ...((snapshot.preset as Snapshot | null) ?? {}) };
  const createdAt = typeof snapshot.created_at === 'string' && !Number.isNaN(Date.parse(snapshot.created_at)) ? snapshot.created_at : null;
  const [preset] = await rows<PresetRow>(
    tx,
    `INSERT INTO rule_presets
       (id, workspace_id, owner_user_id, name, action, enabled, level, conditions, condition_logic, cooldown_minutes,
        check_interval_minutes, notify_tg, budget_change_percent, budget_max_daily, created_at, updated_at)
     VALUES ($1, $2, $3, $4, coalesce($5, 'turn_off'), coalesce($6, true), coalesce($7, 'adset'), coalesce($8::jsonb, '[]'::jsonb),
             coalesce($9, 'and'), coalesce($10, 0), coalesce($11, 5), coalesce($12, true), coalesce($13, 0), coalesce($14, 0),
             coalesce($15::timestamptz, clock_timestamp()), clock_timestamp())
     RETURNING ${PRESET_COLUMNS}`,
    [
      item.entity_id, workspaceId, await existingUserId(tx, fields.owner_user_id), fields.name ?? '', fields.action ?? null,
      fields.enabled ?? null, fields.level ?? null, fields.conditions === undefined || fields.conditions === null ? null : JSON.stringify(fields.conditions),
      fields.condition_logic ?? null, fields.cooldown_minutes ?? null, fields.check_interval_minutes ?? null, fields.notify_tg ?? null,
      fields.budget_change_percent ?? null, fields.budget_max_daily ?? null, createdAt,
    ],
  );
  for (const membership of entries(snapshot.group_items)) {
    const [group] = await rows<{ id: number }>(tx, 'SELECT id FROM rule_groups WHERE id = $1 AND workspace_id = $2', [membership.group_id ?? null, workspaceId]);
    if (group) {
      await rows(tx, 'INSERT INTO rule_group_items (group_id, preset_id, position, created_at) VALUES ($1, $2, $3, clock_timestamp())', [group.id, preset.id, Number(membership.position || 0)]);
    }
  }
  const skipped: string[] = [];
  const restored: string[] = [];
  for (const attachment of entries(snapshot.attachments)) {
    const [account] = await rows<AccountRow>(
      tx,
      'SELECT id, account_id, name, owner_user_id, active_rules, rules_enabled FROM accounts WHERE account_id = $1 AND workspace_id = $2 FOR UPDATE',
      [attachment.account_id ?? null, workspaceId],
    );
    if (!account) {
      skipped.push(typeof attachment.account_id === 'string' && attachment.account_id ? attachment.account_id : '');
      continue;
    }
    const activeRules = loadActiveRules(account.active_rules);
    if (activeRules.some((rule) => rule.preset_id === preset.id)) continue;
    const rule = presetSnapshot(preset);
    const attachmentScope = attachment.scope;
    if (attachmentScope && (typeof attachmentScope !== 'object' || Object.keys(attachmentScope).length)) rule.scope = attachmentScope;
    const candidate = [...activeRules, rule];
    try {
      validateRuleSetCompatibility(candidate);
    } catch (error) {
      if (!(error instanceof RuleValueError)) throw error;
      skipped.push(account.account_id);
      continue;
    }
    await saveAccount(tx, account, candidate, attachment.switched_account_off ? true : account.rules_enabled);
    restored.push(account.account_id);
  }
  await tx.save(tx.create(AuditEventEntity, {
    workspaceId,
    ownerUserId: preset.owner_user_id || user.id,
    actorType: 'user',
    actorId: String(user.telegramId || user.id),
    category: 'MANUAL_ACTION',
    eventType: 'RESTORE_RULE_PRESET',
    status: 'SUCCESS',
    ruleId: preset.id,
    ruleName: preset.name,
    action: 'RESTORE',
    message: `Rule '${preset.name}' restored.`,
    beforeState: { deleted: true },
    afterState: { deleted: false },
    details: { restored_account_ids: restored, skipped_account_ids: skipped },
    correlationId: randomBytes(16).toString('hex'),
  }));
  return { kind: KIND_RULE, entity_id: preset.id, name: preset.name, skipped_account_ids: skipped, missing_rule_ids: [] };
}

// trash.py _restore_group: the label under its old id (in its icon's color if
// it predates colors), refused when a label of that name exists now; rules
// deleted since do not come back with it.
async function restoreGroup(tx: EntityManager, workspaceId: number, item: { entity_id: number; snapshot: Snapshot | null }): Promise<Record<string, unknown>> {
  const [exists] = await rows(tx, 'SELECT id FROM rule_groups WHERE id = $1', [item.entity_id]);
  if (exists) throw new RouteError(409, 'This label already exists.');
  const snapshot = item.snapshot ?? {};
  const fields = { ...((snapshot.group as Snapshot | null) ?? {}) };
  if (!('color' in fields)) fields.color = ICON_COLORS[typeof fields.icon === 'string' ? fields.icon : ''] ?? '#95a2b3';
  const name = typeof fields.name === 'string' ? fields.name : typeof fields.name === 'number' && fields.name ? String(fields.name) : '';
  const [taken] = await rows(tx, 'SELECT id FROM rule_groups WHERE workspace_id = $1 AND lower(name) = $2 LIMIT 1', [workspaceId, name.toLowerCase()]);
  if (taken) throw new RouteError(409, `A label named "${name}" already exists.`);
  const createdAt = typeof snapshot.created_at === 'string' && !Number.isNaN(Date.parse(snapshot.created_at)) ? snapshot.created_at : null;
  const [group] = await rows<{ id: number; name: string }>(
    tx,
    `INSERT INTO rule_groups (id, workspace_id, owner_user_id, name, description, color, icon, position, created_at, updated_at)
     VALUES ($1, $2, $3, $4, coalesce($5, ''), coalesce($6, '#95a2b3'), coalesce($7, 'custom'), coalesce($8, 0),
             coalesce($9::timestamptz, clock_timestamp()), clock_timestamp())
     RETURNING id, name`,
    [item.entity_id, workspaceId, await existingUserId(tx, fields.owner_user_id), fields.name ?? '', fields.description ?? null, fields.color ?? null, fields.icon ?? null, fields.position ?? null, createdAt],
  );
  const missing: number[] = [];
  for (const entry of entries(snapshot.items)) {
    const [preset] = await rows<{ id: number }>(tx, 'SELECT id FROM rule_presets WHERE id = $1 AND workspace_id = $2', [entry.preset_id ?? null, workspaceId]);
    if (!preset) {
      missing.push(Number(entry.preset_id || 0));
      continue;
    }
    await rows(tx, 'INSERT INTO rule_group_items (group_id, preset_id, position, created_at) VALUES ($1, $2, $3, clock_timestamp())', [group.id, preset.id, Number(entry.position || 0)]);
  }
  return { kind: KIND_RULE_GROUP, entity_id: group.id, name: group.name, skipped_account_ids: [], missing_rule_ids: missing };
}
