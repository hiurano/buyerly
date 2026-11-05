import { randomBytes } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { rows } from '../database.ts';
import { AuditEventEntity, type UserEntity } from '../entities/index.ts';
import { RouteError } from '../graphql/errors.ts';
import { allowsAccount, EVERYTHING, type AccountAccess } from '../workspaces/account-access.ts';
import {
  PUBLIC_RULE_METRICS,
  RULE_OPERATORS,
  RULE_TIME_WINDOWS,
  RuleValueError,
  normalizeRuleConditions,
  normalizeRuleScope,
  normalizeRuntimeRule,
  pyFloat,
  validatePublicRuleConditions,
  validateRuleSetCompatibility,
  validateRuntimeRule,
  type Scope,
} from './validation.ts';

// Saved rules (rule_presets) and their copies on ad accounts
// (accounts.active_rules), as api/deps.py's rule helpers read and write them.
// The copy on an account is the snapshot the worker runs: the preset's
// fields in the engine's format plus the attachment's scope.

export interface PresetRow {
  id: number;
  workspace_id: number | null;
  owner_user_id: number | null;
  name: string;
  action: string;
  level: string | null;
  enabled: boolean | null;
  conditions: unknown;
  condition_logic: string | null;
  cooldown_minutes: number | null;
  check_interval_minutes: number | null;
  notify_tg: boolean | null;
  budget_change_percent: number | null;
  budget_max_daily: number | null;
  // "%Y-%m-%d %H:%M" in UTC, and isoformat() of it, from SQL.
  created_at_display: string;
  created_at_python: string | null;
}

export const PRESET_COLUMNS = `rule_presets.*,
  coalesce(to_char(rule_presets.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI'), '') AS created_at_display,
  ${pythonIsoSql('rule_presets.created_at')} AS created_at_python`;

// datetime.isoformat() of an aware UTC value from asyncpg, NULL as NULL.
export function pythonIsoSql(column: string): string {
  return `CASE WHEN ${column} IS NULL THEN NULL ELSE to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
    || CASE WHEN extract(microseconds FROM ${column})::bigint % 1000000 = 0 THEN ''
            ELSE to_char(${column} AT TIME ZONE 'UTC', '.US') END || '+00:00' END`;
}

// json.dumps() as Python writes accounts.active_rules: ", " and ": "
// separators, non-ASCII escaped. Numbers are JS numbers: a float Python
// would write as 5.0 is written 5, the same value to every reader.
export function pyJsonDumps(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity';
  if (typeof value === 'string') {
    return JSON.stringify(value).replace(/[\u007f-￿]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
  }
  if (Array.isArray(value)) return `[${value.map(pyJsonDumps).join(', ')}]`;
  return `{${Object.entries(value as Record<string, unknown>).map(([key, item]) => `${pyJsonDumps(key)}: ${pyJsonDumps(item)}`).join(', ')}}`;
}

function parseJsonColumn(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    // Python's json.loads also reads NaN and Infinity.
    return JSON.parse(raw.replace(/\bNaN\b/g, 'null')) as unknown;
  } catch {
    return undefined;
  }
}

// _load_active_rules: the valid rule snapshots of an account's JSON field.
export function loadActiveRules(raw: unknown): Record<string, unknown>[] {
  const rules = parseJsonColumn(raw);
  if (!Array.isArray(rules)) return [];
  return rules
    .filter((rule): rule is Record<string, unknown> => typeof rule === 'object' && rule !== null && !Array.isArray(rule))
    .map((rule) => normalizeRuntimeRule(rule).rule);
}

function storedConditions(preset: PresetRow): unknown {
  const raw = preset.conditions;
  if (typeof raw === 'string') {
    const parsed = parseJsonColumn(raw);
    return parsed === undefined ? [] : parsed;
  }
  return raw;
}

const STALE_REASON = 'The rule is stored in an old or unsafe format and must be re-saved.';
const LEGACY_REASON = 'Replace the legacy combined CPA with CPL, CPReg or CPP.';

// _preset_snapshot: the runtime rule format the worker runs, held back
// (enabled false, needs_review) when it is legacy or fails the runtime check.
export function presetSnapshot(preset: PresetRow): Record<string, unknown> {
  const { conditions, hasLegacyCpa } = normalizeRuleConditions(storedConditions(preset));
  const snapshot: Record<string, unknown> = {
    preset_id: preset.id,
    workspace_id: preset.workspace_id,
    name: preset.name,
    action: preset.action,
    level: preset.level || 'adset',
    enabled: preset.enabled ?? true,
    conditions,
    logic: preset.condition_logic,
    cooldown_minutes: preset.cooldown_minutes,
    check_interval: preset.check_interval_minutes,
    budget_change_percent: preset.budget_change_percent,
    budget_max_daily: preset.budget_max_daily,
    currency_mode: 'account',
    scope: { level: 'account', ids: [] },
  };
  let invalid = false;
  try {
    validateRuntimeRule(snapshot);
  } catch (error) {
    if (!(error instanceof RuleValueError)) throw error;
    invalid = true;
  }
  if (hasLegacyCpa || invalid) {
    Object.assign(snapshot, { enabled: false, needs_review: true, review_reason: hasLegacyCpa ? LEGACY_REASON : STALE_REASON });
  }
  return snapshot;
}

// ConditionItem(**condition) in _preset_response: a stored condition the
// model would refuse (unknown key, metric or operator, bad value) is left out.
function conditionItem(condition: Record<string, unknown>): Record<string, unknown> | null {
  const allowed = ['metric', 'operator', 'value', 'time_window'];
  if (Object.keys(condition).some((key) => !allowed.includes(key))) return null;
  const metric = condition.metric ?? 'spend';
  const operator = condition.operator ?? 'gte';
  const timeWindow = condition.time_window ?? 'today';
  if (typeof metric !== 'string' || !PUBLIC_RULE_METRICS.has(metric)) return null;
  if (typeof operator !== 'string' || !RULE_OPERATORS.has(operator)) return null;
  if (typeof timeWindow !== 'string' || !RULE_TIME_WINDOWS.has(timeWindow)) return null;
  let value: number;
  try {
    value = 'value' in condition ? pyFloat(condition.value) : 0;
  } catch {
    return null;
  }
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000) return null;
  return { metric, operator, value, time_window: timeWindow };
}

export interface Activity { last_run_at?: string; last_checked_at?: string }

// _preset_response (RulePresetItem).
export function presetResponse(
  preset: PresetRow,
  activity: Activity = {},
  attachments: Record<string, Scope> = {},
  labelIds: number[] = [],
): Record<string, unknown> {
  const conditions = normalizeRuleConditions(storedConditions(preset) ?? []).conditions
    .map(conditionItem)
    .filter((item): item is Record<string, unknown> => item !== null);
  const snapshot = presetSnapshot(preset);
  return {
    id: preset.id,
    name: preset.name,
    action: preset.action,
    level: preset.level || 'adset',
    enabled: Boolean(snapshot.enabled ?? true),
    conditions,
    condition_logic: preset.condition_logic || 'and',
    cooldown_minutes: preset.cooldown_minutes || 0,
    check_interval_minutes: preset.check_interval_minutes || 5,
    budget_change_percent: preset.budget_change_percent || 0,
    budget_max_daily: preset.budget_max_daily || 0,
    currency_mode: 'account',
    created_at: preset.created_at_display,
    needs_review: Boolean(snapshot.needs_review ?? false),
    review_reason: typeof snapshot.review_reason === 'string' ? snapshot.review_reason : '',
    last_run_at: activity.last_run_at ?? '',
    last_checked_at: activity.last_checked_at ?? '',
    attached_account_ids: Object.keys(attachments),
    attached_scopes: attachments,
    label_ids: labelIds,
  };
}

// _validated_condition_payloads: the window's conditions, already the
// ConditionItem shape, checked against the public metrics and normalized.
export function validatedConditionPayloads(conditions: Record<string, unknown>[]): Record<string, unknown>[] {
  try {
    validatePublicRuleConditions(conditions);
  } catch (error) {
    if (error instanceof RuleValueError) throw new RouteError(400, 'Use only current automation-rule metrics and operators.');
    throw error;
  }
  return normalizeRuleConditions(conditions).conditions;
}

// _ensure_compatible_rule_set.
export function ensureCompatibleRuleSet(rules: Record<string, unknown>[]): void {
  try {
    validateRuleSetCompatibility(rules);
  } catch (error) {
    if (error instanceof RuleValueError) throw new RouteError(409, error.message);
    throw error;
  }
}

// _preset_attachments: each preset's ad accounts (those in `access`) and its scope on each.
export async function presetAttachments(tx: EntityManager, workspaceId: number, access: AccountAccess = EVERYTHING): Promise<Map<number, Record<string, Scope>>> {
  const accounts = await rows<{ account_id: string; active_rules: string | null }>(
    tx, 'SELECT account_id, active_rules FROM accounts WHERE workspace_id = $1 ORDER BY id', [workspaceId],
  );
  const attachments = new Map<number, Record<string, Scope>>();
  for (const account of accounts) {
    if (!allowsAccount(access, account.account_id)) continue;
    for (const rule of loadActiveRules(account.active_rules)) {
      const presetId = rule.preset_id;
      if (typeof presetId !== 'number' || !Number.isInteger(presetId)) continue;
      let scope: Scope;
      try {
        scope = normalizeRuleScope(rule.scope);
      } catch {
        scope = { level: 'account', ids: [] };
      }
      const held = attachments.get(presetId) ?? {};
      held[account.account_id] = scope;
      attachments.set(presetId, held);
    }
  }
  return attachments;
}

// _preset_last_runs: when each preset last acted (audit) and was last checked.
export async function presetLastRuns(tx: EntityManager, workspaceId: number, presetIds: number[]): Promise<Map<number, Activity>> {
  const activity = new Map<number, Activity>();
  if (!presetIds.length) return activity;
  const actions = await rows<{ rule_id: number; moment: string | null }>(
    tx,
    `SELECT rule_id, ${pythonIsoSql('max(created_at)')} AS moment FROM audit_events
      WHERE workspace_id = $1 AND category = 'RULE_ACTION' AND rule_id = ANY($2::int[]) GROUP BY rule_id`,
    [workspaceId, presetIds],
  );
  const checks = await rows<{ rule_id: number; moment: string | null }>(
    tx,
    `SELECT rule_id, ${pythonIsoSql('max(checked_at)')} AS moment FROM rule_entity_states
      WHERE workspace_id = $1 AND rule_id = ANY($2::int[]) GROUP BY rule_id`,
    [workspaceId, presetIds],
  );
  for (const [key, found] of [['last_run_at', actions], ['last_checked_at', checks]] as const) {
    for (const row of found) {
      if (row.rule_id === null || row.moment === null) continue;
      activity.set(row.rule_id, { ...activity.get(row.rule_id), [key]: row.moment });
    }
  }
  return activity;
}

// _preset_label_ids: each rule's labels in the order they were put on.
export async function presetLabelIds(tx: EntityManager, presetIds: number[]): Promise<Map<number, number[]>> {
  const result = new Map<number, number[]>();
  if (!presetIds.length) return result;
  const found = await rows<{ preset_id: number; group_id: number }>(
    tx, 'SELECT preset_id, group_id FROM rule_group_items WHERE preset_id = ANY($1::int[]) ORDER BY created_at, id', [presetIds],
  );
  for (const row of found) result.set(row.preset_id, [...(result.get(row.preset_id) ?? []), row.group_id]);
  return result;
}

// _labelled_preset_response.
export async function labelledPresetResponse(tx: EntityManager, workspaceId: number, preset: PresetRow, access: AccountAccess): Promise<Record<string, unknown>> {
  const lastRuns = await presetLastRuns(tx, workspaceId, [preset.id]);
  const attachments = await presetAttachments(tx, workspaceId, access);
  const labels = await presetLabelIds(tx, [preset.id]);
  return presetResponse(preset, lastRuns.get(preset.id), attachments.get(preset.id), labels.get(preset.id));
}

// _get_workspace_labels: the workspace's labels with these ids, in that order.
export async function workspaceLabelIds(tx: EntityManager, workspaceId: number, labelIds: number[]): Promise<number[]> {
  const ordered = [...new Set(labelIds)];
  if (!ordered.length) return [];
  const found = new Set((await rows<{ id: number }>(
    tx, 'SELECT id FROM rule_groups WHERE workspace_id = $1 AND id = ANY($2::int[])', [workspaceId, ordered],
  )).map((row) => row.id));
  if (ordered.some((id) => !found.has(id))) throw new RouteError(400, 'One or more labels no longer exist.');
  return ordered;
}

// _get_workspace_presets: the workspace's rules with these ids, in that order.
export async function workspacePresets(tx: EntityManager, workspaceId: number, presetIds: number[]): Promise<PresetRow[]> {
  const ordered = [...new Set(presetIds)];
  const found = new Map((await rows<PresetRow>(
    tx, `SELECT ${PRESET_COLUMNS} FROM rule_presets WHERE workspace_id = $1 AND id = ANY($2::int[])`, [workspaceId, ordered],
  )).map((preset) => [preset.id, preset]));
  const missing = ordered.filter((id) => !found.has(id));
  if (missing.length) throw new RouteError(400, `Rules not found or unavailable: ${missing.join(', ')}`);
  return ordered.map((id) => found.get(id)!);
}

// rules.py _set_preset_labels: exactly these labels; the ones it keeps keep their applied time.
export async function setPresetLabels(tx: EntityManager, presetId: number, labelIds: number[]): Promise<void> {
  const current = await rows<{ id: number; group_id: number }>(tx, 'SELECT id, group_id FROM rule_group_items WHERE preset_id = $1', [presetId]);
  const wanted = new Set(labelIds);
  const drop = current.filter((item) => !wanted.has(item.group_id)).map((item) => item.id);
  if (drop.length) await rows(tx, 'DELETE FROM rule_group_items WHERE id = ANY($1::int[])', [drop]);
  const held = new Set(current.map((item) => item.group_id));
  for (const labelId of labelIds) {
    if (held.has(labelId)) continue;
    await rows(tx, 'INSERT INTO rule_group_items (group_id, preset_id, position, created_at) VALUES ($1, $2, 0, clock_timestamp())', [labelId, presetId]);
  }
}

// rules.py _record_assistant_change: an Inbox row when the browser's AI
// assistant (WebMCP, marked by X-Buyerly-Agent: webmcp) changed rules.
export async function recordAssistantChange(
  tx: EntityManager,
  headers: Record<string, string | string[] | undefined>,
  change: {
    workspaceId: number;
    user: UserEntity;
    eventType: string;
    action: string;
    message: string;
    presetId: number;
    presetName: string;
    account?: { account_id: string; name: string | null; owner_user_id: number | null } | null;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  if (headers['x-buyerly-agent'] !== 'webmcp') return;
  const { account } = change;
  await tx.save(tx.create(AuditEventEntity, {
    workspaceId: change.workspaceId,
    ownerUserId: account ? account.owner_user_id : change.user.id,
    actorType: 'user',
    actorId: String(change.user.telegramId || change.user.id),
    category: 'MANUAL_ACTION',
    eventType: change.eventType,
    status: 'SUCCESS',
    accountId: account ? account.account_id : '',
    accountName: account ? account.name || '' : '',
    ruleId: change.presetId,
    ruleName: change.presetName,
    action: change.action,
    message: change.message,
    details: { via: 'webmcp', ...change.details },
    correlationId: randomBytes(16).toString('hex'),
  }));
}
