import { randomBytes } from 'node:crypto';
import { Arg, Ctx, Int, Mutation, Query, Resolver } from 'type-graphql';
import type { EntityManager } from 'typeorm';
import { rows } from '../../../database.ts';
import { AuditEventEntity, type UserEntity } from '../../../entities/index.ts';
import {
  PRESET_COLUMNS,
  ensureCompatibleRuleSet,
  labelledPresetResponse,
  loadActiveRules,
  presetAttachments,
  presetLabelIds,
  presetLastRuns,
  presetResponse,
  presetSnapshot,
  pyJsonDumps,
  recordAssistantChange,
  setPresetLabels,
  validatedConditionPayloads,
  workspaceLabelIds,
  workspacePresets,
  type PresetRow,
} from '../../../rules/presets.ts';
import { RULE_MAX_SCOPE_IDS, RuleValueError, normalizeRuleScope, validateRuntimeRule } from '../../../rules/validation.ts';
import { KIND_RULE, moveToTrash, purgeExpired } from '../../../trash/trash.ts';
import { userWorkspace, userWorkspaceMember } from '../../../workspaces/access.ts';
import { accountAccess, allowsAccount, type AccountAccess } from '../../../workspaces/account-access.ts';
import { mutated, type GraphQLContext } from '../../context.ts';
import { INTERNAL_ERROR, RouteError, invalidInput } from '../../errors.ts';
import { inputSchema } from '../../input.ts';
import { RulePayload, RulesPayload, type Payload } from '../../payloads.ts';
import { JSONScalar } from '../../scalars.ts';
import { ensureWriteAccess, scopeOf, type Scope as MemberScope } from '../accounts/scope.ts';
import { strip } from '../accounts/text.ts';
import { ensureRuleExamples } from './examples.ts';

// Saved rules (api/routers/rules.py /presets): listing, the rule window's
// create, edit and check, deleting into Recently deleted, and labels on
// rules. A rule's copies on ad accounts (accounts.active_rules) follow every
// edit, as the worker runs those copies. The rule checks are core/metrics.py's,
// ported in rules/validation.ts with a parity test against Python.

const MAX_RULE_LABELS = 50;
const ID_LIST = (max: number, min = 0) => ({ type: 'array', items: { type: 'integer' }, maxItems: max, ...(min ? { minItems: min } : {}) });

const SCOPE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    level: { enum: ['account', 'campaign', 'adset'] },
    ids: { type: 'array', items: { type: 'string' }, maxItems: RULE_MAX_SCOPE_IDS },
  },
};

const CONDITION = {
  type: 'object',
  additionalProperties: false,
  properties: {
    metric: { enum: ['spend', 'cpl', 'cpreg', 'cpp', 'leads', 'registrations', 'purchases', 'ctr', 'cpc', 'clicks', 'link_clicks'] },
    operator: { enum: ['gte', 'gt', 'lte', 'lt', 'eq'] },
    value: { type: 'number', minimum: 0, maximum: 1_000_000_000 },
    time_window: { enum: ['today', 'yesterday', 'last_3d', 'last_7d', 'lifetime'] },
  },
};

// api/schemas/rules.py RuleDraftRequest and CreatePresetRequest (extra="forbid").
function draftSchema(create: boolean): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: create ? ['conditions', 'name'] : ['conditions'],
    properties: {
      name: { type: 'string', maxLength: 120, ...(create ? { minLength: 1 } : {}) },
      action: { enum: ['turn_off', 'notify_only', 'turn_on', 'increase_budget', 'decrease_budget'] },
      level: { enum: ['campaign', 'adset', 'ad'] },
      enabled: { type: 'boolean' },
      conditions: { type: 'array', items: CONDITION, minItems: 1, maxItems: 20 },
      condition_logic: { enum: ['and', 'or'] },
      cooldown_minutes: { type: 'integer', minimum: 0, maximum: 10_080 },
      check_interval_minutes: { type: 'integer', minimum: 1, maximum: 1_440 },
      budget_change_percent: { type: 'number', minimum: 0, maximum: 100 },
      budget_max_daily: { type: 'number', minimum: 0, maximum: 10_000_000 },
      ...(create
        ? {
            label_ids: { anyOf: [ID_LIST(MAX_RULE_LABELS), { type: 'null' }] },
            attachments: {
              anyOf: [
                {
                  type: 'array',
                  maxItems: 100,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['account_id'],
                    properties: {
                      account_id: { type: 'string', minLength: 1, maxLength: 64, pattern: '^(act_)?\\d+$' },
                      scope: SCOPE,
                    },
                  },
                },
                { type: 'null' },
              ],
            },
          }
        : {}),
    },
  };
}

interface Condition { metric?: string; operator?: string; value?: number; time_window?: string }
interface Attachment { account_id: string; scope: { level: string; ids: string[] } }
export interface Draft {
  name: string;
  action: string;
  level: string;
  enabled: boolean;
  conditions: Record<string, unknown>[];
  condition_logic: string;
  cooldown_minutes: number;
  check_interval_minutes: number;
  budget_change_percent: number;
  budget_max_daily: number;
  label_ids: number[] | null;
  attachments: Attachment[] | null;
}

const DRAFT = inputSchema<Record<string, unknown>>(draftSchema(false));
const CREATE = inputSchema<Record<string, unknown>>(draftSchema(true));

// The model's defaults, then its model validators in pydantic's order:
// RuleScopeItem's, RuleDraftRequest's, CreatePresetRequest's.
export function draft(input: unknown, create: boolean): Draft {
  const body = (create ? CREATE : DRAFT).parse(input);
  const valueError = (message: string) => invalidInput([`Value error, ${message}`]);
  const conditions = (body.conditions as Condition[]).map((item) => ({
    metric: item.metric ?? 'spend',
    operator: item.operator ?? 'gte',
    value: item.value ?? 0,
    time_window: item.time_window ?? 'today',
  }));
  const attachments = (body.attachments as { account_id: string; scope?: { level?: string; ids?: string[] } }[] | null | undefined)
    ?.map((item) => ({ account_id: item.account_id, scope: { level: item.scope?.level ?? 'account', ids: item.scope?.ids ?? [] } })) ?? null;
  for (const item of attachments ?? []) {
    try {
      normalizeRuleScope(item.scope);
    } catch (error) {
      if (error instanceof RuleValueError) throw valueError(error.message);
      throw error;
    }
  }
  const parsed: Draft = {
    name: (body.name as string | undefined) ?? '',
    action: (body.action as string | undefined) ?? 'turn_off',
    level: (body.level as string | undefined) ?? 'adset',
    enabled: (body.enabled as boolean | undefined) ?? true,
    conditions,
    condition_logic: (body.condition_logic as string | undefined) ?? 'and',
    cooldown_minutes: (body.cooldown_minutes as number | undefined) ?? 0,
    check_interval_minutes: (body.check_interval_minutes as number | undefined) ?? 5,
    budget_change_percent: (body.budget_change_percent as number | undefined) ?? 0,
    budget_max_daily: (body.budget_max_daily as number | undefined) ?? 0,
    label_ids: (body.label_ids as number[] | null | undefined) ?? null,
    attachments,
  };
  try {
    validateRuntimeRule({
      action: parsed.action,
      level: parsed.level,
      conditions: parsed.conditions,
      logic: parsed.condition_logic,
      cooldown_minutes: parsed.cooldown_minutes,
      check_interval: parsed.check_interval_minutes,
      budget_change_percent: parsed.budget_change_percent,
      budget_max_daily: parsed.budget_max_daily,
    });
  } catch (error) {
    if (error instanceof RuleValueError) throw valueError(error.message);
    throw error;
  }
  if (create) {
    const accounts = (attachments ?? []).map((item) => actKey(item.account_id));
    if (accounts.length !== new Set(accounts).size) throw valueError('Each ad account can be chosen once.');
  }
  return parsed;
}

const actKey = (accountId: string): string => (accountId.startsWith('act_') ? accountId : `act_${accountId}`);

// rules.py _preset_fields: the stored columns of a rule from the window.
export function presetFields(payload: Draft, conditions: Record<string, unknown>[]) {
  return {
    name: strip(payload.name) || 'New rule',
    action: payload.action || 'turn_off',
    level: payload.level,
    enabled: payload.enabled,
    conditions,
    condition_logic: payload.condition_logic || 'and',
    cooldown_minutes: payload.cooldown_minutes || 0,
    check_interval_minutes: payload.check_interval_minutes || 5,
    budget_change_percent: payload.budget_change_percent || 0,
    budget_max_daily: payload.budget_max_daily || 0,
  };
}

async function presetById(tx: EntityManager, workspaceId: number, presetId: number, lock = false): Promise<PresetRow | null> {
  const [preset] = await rows<PresetRow>(
    tx, `SELECT ${PRESET_COLUMNS} FROM rule_presets WHERE id = $1 AND workspace_id = $2${lock ? ' FOR UPDATE' : ''}`, [presetId, workspaceId],
  );
  return preset ?? null;
}

async function accessOf(tx: EntityManager, scope: MemberScope & { workspaceId: number }): Promise<AccountAccess> {
  return accountAccess(tx, scope.member && scope.member.id !== null ? scope.member : null, scope.workspaceId);
}

interface AccountRow { id: number; account_id: string; name: string | null; owner_user_id: number | null; active_rules: string | null; rules_enabled: boolean | null }

async function workspaceAccounts(tx: EntityManager, workspaceId: number): Promise<AccountRow[]> {
  return rows<AccountRow>(
    tx, 'SELECT id, account_id, name, owner_user_id, active_rules, rules_enabled FROM accounts WHERE workspace_id = $1 ORDER BY id FOR UPDATE', [workspaceId],
  );
}

async function saveAccount(tx: EntityManager, account: AccountRow, activeRules: Record<string, unknown>[], rulesEnabled: boolean | null): Promise<void> {
  await rows(tx, 'UPDATE accounts SET active_rules = $1, rules_enabled = $2 WHERE id = $3', [pyJsonDumps(activeRules), rulesEnabled, account.id]);
}

// rules.py _apply_rule_attachments: `desired` becomes the set of ad accounts
// the rule runs on, each with its scope. Accounts out of sight are neither
// named nor changed; any error leaves every account as it was.
async function applyRuleAttachments(tx: EntityManager, workspaceId: number, preset: PresetRow, desired: Attachment[], access: AccountAccess): Promise<void> {
  const wanted = new Map(desired.map((item) => [actKey(item.account_id), normalizedScopeDump(item.scope)]));
  const accounts = (await workspaceAccounts(tx, workspaceId)).filter((account) => allowsAccount(access, account.account_id));
  const known = new Set(accounts.map((account) => account.account_id));
  if ([...wanted.keys()].some((accountId) => !known.has(accountId))) throw new RouteError(404, 'Ad account not found.');
  const snapshot = presetSnapshot(preset);
  if (wanted.size && snapshot.needs_review) throw new RouteError(400, 'This rule has unsafe or outdated settings. Open it and save it again.');
  for (const account of accounts) {
    const activeRules = loadActiveRules(account.active_rules);
    const attached = activeRules.some((rule) => rule.preset_id === preset.id);
    let rulesEnabled = account.rules_enabled;
    if (wanted.has(account.account_id)) {
      const scope = wanted.get(account.account_id)!;
      if (attached) {
        for (const rule of activeRules) if (rule.preset_id === preset.id) rule.scope = scope;
      } else {
        activeRules.push({ ...snapshot, scope });
        rulesEnabled = true;
      }
      ensureCompatibleRuleSet(activeRules);
      await saveAccount(tx, account, activeRules, rulesEnabled);
    } else if (attached) {
      const remaining = activeRules.filter((rule) => rule.preset_id !== preset.id);
      await saveAccount(tx, account, remaining, remaining.length ? rulesEnabled : false);
    }
  }
}

// RuleScopeItem.model_dump(): the scope as sent (the validator only checks it).
const normalizedScopeDump = (scope: { level: string; ids: string[] }) => ({ level: scope.level, ids: scope.ids });

async function readScope(tx: EntityManager, user: UserEntity): Promise<{ workspaceId: number; access: AccountAccess; role: string | null }> {
  const found = await userWorkspaceMember(tx, user);
  if (!found) {
    // get_user_workspace answered None: the Python handlers fail on ws.id.
    throw INTERNAL_ERROR();
  }
  const memberRow = found.member.id === null ? null : found.member;
  return { workspaceId: found.workspace.id, access: await accountAccess(tx, memberRow, found.workspace.id), role: memberRow?.role ?? null };
}

@Resolver()
export class RulesResolver {
  @Query(() => JSONScalar, { description: "The workspace's rules." })
  async rules(@Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    const workspace = await app.db.transaction((tx) => userWorkspace(tx, user));
    if (!workspace) throw INTERNAL_ERROR();
    await ensureRuleExamples(app.db, user, workspace.id);
    return app.db.transaction(async (tx) => {
      const { workspaceId, access, role } = await readScope(tx, user);
      let presets = await rows<PresetRow>(tx, `SELECT ${PRESET_COLUMNS} FROM rule_presets WHERE workspace_id = $1 ORDER BY id DESC`, [workspaceId]);
      const attachments = await presetAttachments(tx, workspaceId, access);
      // A guest sees the rules at work on their teams' ad accounts.
      if (role === 'guest') presets = presets.filter((preset) => Object.keys(attachments.get(preset.id) ?? {}).length > 0);
      const ids = presets.map((preset) => preset.id);
      const lastRuns = await presetLastRuns(tx, workspaceId, ids);
      const labels = await presetLabelIds(tx, ids);
      return presets.map((preset) => presetResponse(preset, lastRuns.get(preset.id), attachments.get(preset.id), labels.get(preset.id)));
    });
  }

  @Query(() => JSONScalar, { description: 'Whether a rule draft is valid, without saving it.' })
  async ruleDraftCheck(@Arg('input', () => JSONScalar) input: unknown, @Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    const payload = draft(input, false);
    await app.db.transaction((tx) => userWorkspaceMember(tx, user));
    validatedConditionPayloads(payload.conditions);
    return { valid: true };
  }

  @Mutation(() => RulePayload, { nullable: true, description: 'Creates a rule.' })
  async ruleCreate(@Arg('input', () => JSONScalar) input: unknown, @Ctx() context: GraphQLContext): Promise<Payload> {
    const payload = draft(input, true);
    const record = await context.app.db.transaction(async (tx) => {
      const scope = await scopeOf(tx, context.user);
      ensureWriteAccess(scope, 'creating rules');
      const conditions = validatedConditionPayloads(payload.conditions);
      const labelIds = await workspaceLabelIds(tx, scope.workspaceId, payload.label_ids ?? []);
      const fields = presetFields(payload, conditions);
      const [preset] = await rows<PresetRow>(
        tx,
        `INSERT INTO rule_presets
           (workspace_id, owner_user_id, name, action, level, enabled, conditions, condition_logic, cooldown_minutes,
            check_interval_minutes, notify_tg, budget_change_percent, budget_max_daily, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, true, $11, $12, clock_timestamp(), clock_timestamp())
         RETURNING ${PRESET_COLUMNS}`,
        [
          scope.workspaceId, context.user.id, fields.name, fields.action, fields.level, fields.enabled,
          JSON.stringify(fields.conditions), fields.condition_logic, fields.cooldown_minutes, fields.check_interval_minutes,
          fields.budget_change_percent, fields.budget_max_daily,
        ],
      );
      await setPresetLabels(tx, preset.id, labelIds);
      const access = await accessOf(tx, scope);
      // Created and attached in one write: the rule never sits "nowhere" (#387).
      if (payload.attachments?.length) await applyRuleAttachments(tx, scope.workspaceId, preset, payload.attachments, access);
      await recordAssistantChange(tx, context.http.headers, {
        workspaceId: scope.workspaceId,
        user: context.user,
        eventType: 'ASSISTANT_CREATE_RULE',
        action: 'CREATE',
        message: `Rule '${preset.name}' created by the AI assistant.`,
        presetId: preset.id,
        presetName: preset.name,
        details: { rule_action: preset.action, conditions: preset.conditions },
      });
      return labelledPresetResponse(tx, scope.workspaceId, preset, access);
    });
    return mutated(context, RulePayload, record);
  }

  @Mutation(() => RulePayload, { nullable: true, description: 'Changes a rule.' })
  async ruleUpdate(
    @Arg('id', () => Int) id: number,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const payload = draft(input, true);
    const record = await context.app.db.transaction(async (tx) => {
      const scope = await scopeOf(tx, context.user);
      ensureWriteAccess(scope, 'editing rules');
      const conditions = validatedConditionPayloads(payload.conditions);
      const current = await presetById(tx, scope.workspaceId, id, true);
      if (!current) throw new RouteError(404, 'Preset not found');
      // update_preset sets every field from the window (its defaults when left
      // out); the ORM writes, and bumps updated_at, only when something changed.
      const values = [
        strip(payload.name) || current.name, payload.action || 'turn_off', payload.level, payload.enabled,
        JSON.stringify(conditions), payload.condition_logic, payload.cooldown_minutes, payload.check_interval_minutes,
        payload.budget_change_percent, payload.budget_max_daily,
      ];
      const [written] = await rows<PresetRow>(
        tx,
        `UPDATE rule_presets SET name = $1, action = $2, level = $3, enabled = $4, conditions = $5::jsonb,
                condition_logic = $6, cooldown_minutes = $7, check_interval_minutes = $8,
                budget_change_percent = $9, budget_max_daily = $10, updated_at = clock_timestamp()
          WHERE id = $11
            AND (name, action, level, enabled, conditions, condition_logic, cooldown_minutes, check_interval_minutes,
                 budget_change_percent, budget_max_daily)
                IS DISTINCT FROM ($1::varchar, $2::varchar, $3::varchar, $4::boolean, $5::jsonb, $6::varchar, $7::int, $8::int,
                                  $9::float8, $10::float8)
          RETURNING ${PRESET_COLUMNS}`,
        [...values, current.id],
      );
      const preset = written ?? current;
      const updated = presetSnapshot(preset);
      for (const account of await workspaceAccounts(tx, scope.workspaceId)) {
        const activeRules = loadActiveRules(account.active_rules);
        let changed = false;
        activeRules.forEach((rule, index) => {
          if (rule.preset_id !== id) return;
          // Scope belongs to the attachment: editing the rule never widens it.
          activeRules[index] = { ...updated, scope: 'scope' in rule ? rule.scope : updated.scope };
          changed = true;
        });
        if (changed) {
          ensureCompatibleRuleSet(activeRules);
          await saveAccount(tx, account, activeRules, account.rules_enabled);
        }
      }
      if (payload.label_ids !== null) await setPresetLabels(tx, preset.id, await workspaceLabelIds(tx, scope.workspaceId, payload.label_ids));
      const access = await accessOf(tx, scope);
      if (payload.attachments !== null) await applyRuleAttachments(tx, scope.workspaceId, preset, payload.attachments, access);
      return labelledPresetResponse(tx, scope.workspaceId, preset, access);
    });
    return mutated(context, RulePayload, record);
  }

  @Mutation(() => RulePayload, { nullable: true, description: 'Moves a rule to Recently deleted.' })
  async ruleDelete(@Arg('id', () => Int) id: number, @Ctx() context: GraphQLContext): Promise<Payload> {
    const record = await context.app.db.transaction(async (tx) => {
      const scope = await scopeOf(tx, context.user);
      ensureWriteAccess(scope, 'deleting rules');
      const preset = await presetById(tx, scope.workspaceId, id, true);
      if (!preset) throw new RouteError(404, 'Preset not found');
      // The rule leaves every ad account; each attachment is remembered for a restore.
      const affected: string[] = [];
      const attachments: Record<string, unknown>[] = [];
      for (const account of await workspaceAccounts(tx, scope.workspaceId)) {
        const activeRules = loadActiveRules(account.active_rules);
        const removed = activeRules.filter((rule) => rule.preset_id === id);
        if (!removed.length) continue;
        const remaining = activeRules.filter((rule) => rule.preset_id !== id);
        affected.push(account.account_id);
        const switchedOff = !remaining.length && Boolean(account.rules_enabled);
        await saveAccount(tx, account, remaining, remaining.length ? account.rules_enabled : false);
        const removedScope = removed[0].scope;
        attachments.push({
          account_id: account.account_id,
          scope: removedScope && (typeof removedScope !== 'object' || Object.keys(removedScope).length) ? removedScope : { level: 'account', ids: [] },
          switched_account_off: switchedOff,
        });
      }
      const groupItems = await rows<{ group_id: number; position: number }>(
        tx, 'SELECT group_id, position FROM rule_group_items WHERE preset_id = $1 ORDER BY id', [id],
      );
      await purgeExpired(tx, scope.workspaceId);
      // core/trash.py preset_snapshot.
      const trashed = await moveToTrash(tx, {
        workspaceId: scope.workspaceId,
        kind: KIND_RULE,
        entityId: preset.id,
        name: preset.name,
        snapshot: {
          preset: {
            name: preset.name,
            action: preset.action,
            enabled: preset.enabled,
            level: preset.level,
            conditions: preset.conditions,
            condition_logic: preset.condition_logic,
            cooldown_minutes: preset.cooldown_minutes,
            check_interval_minutes: preset.check_interval_minutes,
            notify_tg: preset.notify_tg,
            budget_change_percent: preset.budget_change_percent,
            budget_max_daily: preset.budget_max_daily,
            owner_user_id: preset.owner_user_id,
          },
          created_at: preset.created_at_python,
          group_items: groupItems,
          attachments,
        },
        deletedByUserId: context.user.id,
      });
      await tx.save(tx.create(AuditEventEntity, {
        workspaceId: scope.workspaceId,
        ownerUserId: preset.owner_user_id || context.user.id,
        actorType: 'user',
        actorId: String(context.user.telegramId || context.user.id),
        category: 'MANUAL_ACTION',
        eventType: 'DELETE_RULE_PRESET',
        status: 'SUCCESS',
        ruleId: preset.id,
        ruleName: preset.name,
        action: 'DELETE',
        message: `Rule '${preset.name}' deleted.`,
        beforeState: { action: preset.action, conditions: preset.conditions } as AuditEventEntity['beforeState'],
        afterState: { deleted: true },
        details: { affected_account_ids: affected },
        correlationId: randomBytes(16).toString('hex'),
      }));
      await rows(tx, 'DELETE FROM rule_group_items WHERE preset_id = $1', [id]);
      await rows(tx, 'DELETE FROM rule_presets WHERE id = $1', [id]);
      return { success: true, message: 'Preset deleted', deleted_item_id: trashed.id };
    });
    return mutated(context, RulePayload, record);
  }

  @Mutation(() => RulePayload, { nullable: true, description: "Sets a rule's labels." })
  async ruleLabelsSet(
    @Arg('id', () => Int) id: number,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const req = LABELS_SET.parse(input);
    const record = await context.app.db.transaction(async (tx) => {
      const scope = await scopeOf(tx, context.user);
      ensureWriteAccess(scope, 'labelling rules');
      const [preset] = await workspacePresets(tx, scope.workspaceId, [id]);
      await setPresetLabels(tx, preset.id, await workspaceLabelIds(tx, scope.workspaceId, req.label_ids ?? []));
      return labelledPresetResponse(tx, scope.workspaceId, preset, await accessOf(tx, scope));
    });
    return mutated(context, RulePayload, record);
  }

  @Mutation(() => RulesPayload, { nullable: true, description: 'Adds or removes labels on several rules at once.' })
  async rulesLabelsChange(@Arg('input', () => JSONScalar) input: unknown, @Ctx() context: GraphQLContext): Promise<Payload> {
    const req = LABELS_CHANGE.parse(input);
    const record = await context.app.db.transaction(async (tx) => {
      const scope = await scopeOf(tx, context.user);
      ensureWriteAccess(scope, 'labelling rules');
      const presets = await workspacePresets(tx, scope.workspaceId, req.preset_ids);
      const add = await workspaceLabelIds(tx, scope.workspaceId, req.add_label_ids ?? []);
      const remove = new Set(await workspaceLabelIds(tx, scope.workspaceId, req.remove_label_ids ?? []));
      const current = await presetLabelIds(tx, presets.map((preset) => preset.id));
      let changed = 0;
      for (const preset of presets) {
        const held = current.get(preset.id) ?? [];
        const wanted = held.filter((labelId) => !remove.has(labelId));
        for (const labelId of add) if (!wanted.includes(labelId) && !remove.has(labelId)) wanted.push(labelId);
        if (wanted.length !== held.length || wanted.some((labelId, index) => labelId !== held[index])) {
          await setPresetLabels(tx, preset.id, wanted);
          changed += 1;
        }
      }
      return { updated_count: changed };
    });
    return mutated(context, RulesPayload, record);
  }
}

// api/schemas/rules.py PresetLabelsRequest / BulkPresetLabelsRequest.
const LABELS_SET = inputSchema<{ label_ids?: number[] }>({
  type: 'object',
  additionalProperties: false,
  properties: { label_ids: ID_LIST(MAX_RULE_LABELS) },
});

const LABELS_CHANGE = inputSchema<{ preset_ids: number[]; add_label_ids?: number[]; remove_label_ids?: number[] }>({
  type: 'object',
  additionalProperties: false,
  required: ['preset_ids'],
  properties: {
    preset_ids: ID_LIST(500, 1),
    add_label_ids: ID_LIST(MAX_RULE_LABELS),
    remove_label_ids: ID_LIST(MAX_RULE_LABELS),
  },
});
