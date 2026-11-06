import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { rows, type Database } from '../database.ts';
import type { MetaClient, Priority } from '../meta/client.ts';
import { reflectEntityChange } from '../meta/delivery.ts';
import { MetaTokenAuthError } from '../meta/errors.ts';
import { updateCachedAdsetStatus } from '../meta/inventory-cache.ts';
import type { Json } from '../meta/python.ts';
import { redactSecrets } from '../meta/redact.ts';
import { MetaTokenKeyring, resolveAccountAccessToken } from '../meta/tokens.ts';
import { normalizeCurrency } from '../meta/units.ts';
import { pyRound } from '../python-numbers.ts';
import { accountDayEnd, accountDayStart, createDecider, stateMatches, type EntityPlan, type ExecutionState, type IntendedAction } from '../rules/decide.ts';
import { pyInt, type RuleEvaluationResult } from '../rules/engine.ts';
import { isMapping, normalizeRuleLevel, pyFloat, pyStr, type Rule } from '../rules/validation.ts';
import { pythonUtcIso, errorText } from './account-health.ts';
import { connectionProblem, gatherLimited, intervalMinutes, loadRules, type AccountRow, type ConnectionRow } from './account-sync.ts';
import { handleTokenError, persistMonitoringEvent, setMonitoredHealth, type MonitoringEvent, type MonitoringLog } from './monitoring-events.ts';

// The rules half of the monitoring cycle (scheduler/worker.py
// MonitoringWorker.run_rule_cycle; #611 stage 4), job `rule_cycle`: for every
// active account with rule checks due, the Meta reads those rules need, the
// decision (rules/decide.ts, compared with Python's in the shadow run), the
// writes to Meta it calls for, their history, the execution slots that keep
// a write from running twice, the rules' state on every entity
// (rule_entity_states) and the cycle's runtime summary. The account itself,
// its facts and its health are the account sync's (account-sync.ts).
//
// Every slot a step touches is committed before the next step, and a claimed
// action's PENDING slot before its Meta write, as Python commits them: a
// restart in the middle reconciles against Meta instead of writing twice.

const CRITICAL_ACTIONS = new Set(['turn_off', 'stop', 'pause']);
// scheduler/worker.py STATUS_EVENT_TYPES
const STATUS_EVENT_TYPES = ['STOP', 'AUTO_REACTIVATE', 'MANUAL_PAUSE', 'MANUAL_REACTIVATE', 'UNDO_ACTION'];
const MANUAL_ENABLE_IN_BUYERLY = 'You turned it on in Buyerly';
const MANUAL_ENABLE_IN_META = 'Turned on again in Meta Ads Manager';

export interface RuleCycleStats {
  cycle_id: string;
  accounts_checked: number;
  accounts_skipped: number;
  rules_checked: number;
  adsets_checked: number;
  adsets_stopped: number;
  campaigns_stopped: number;
  ads_stopped: number;
  adsets_reactivated: number;
  campaigns_reactivated: number;
  ads_reactivated: number;
  budgets_changed: number;
  actions_skipped: number;
  actions_reconciled: number;
  stop_confirmations_waiting: number;
  proposals_sent: number;
  errors: string[];
}

export interface RuleCycleOptions {
  db: Database;
  log: MonitoringLog;
  meta: MetaClient;
  tokenEncryptionKey: string;
  // Seconds since the epoch, the cycle's clock (time.time in Python).
  clock?: () => number;
  // The pause between accounts, in seconds (asyncio.sleep).
  sleep?: (seconds: number) => Promise<void>;
  random?: () => number;
}

interface Settings {
  defaultInterval: number;
  criticalInterval: number;
  stopConfirmationMinutes: number;
  maxConcurrentAccounts: number;
}

interface Snapshot {
  adsets: Json[];
  campaigns: Json[];
  campaign_lifetime: Record<string, Json>;
  campaigns_error: unknown;
  ads: Json[];
  ads_by_window: Record<string, Record<string, Json>>;
  ads_error: unknown;
  insights_by_window: Record<string, Record<string, Json>>;
  window_errors: string[];
}

interface Prepared {
  account: AccountRow;
  now: number;
  dueRules: Rule[];
  accessToken: string;
}

const isCriticalStopRule = (rule: Json): boolean => CRITICAL_ACTIONS.has((rule.action ? pyStr(rule.action) : '').toLowerCase());

// MonitoringWorker._rule_level
function ruleLevel(rule: unknown): string {
  if (!isMapping(rule)) return 'adset';
  try {
    return normalizeRuleLevel(rule.level);
  } catch {
    return 'adset';
  }
}

// MonitoringWorker._windows_by_level: windows other than today the due rules of each level read.
export function windowsByLevel(rules: unknown[]): Record<string, Set<string>> {
  const windows: Record<string, Set<string>> = { adset: new Set(), campaign: new Set(), ad: new Set() };
  for (const rule of rules) {
    if (!isMapping(rule)) continue;
    const level = ruleLevel(rule);
    windows[level] ??= new Set();
    const conditions = rule.conditions;
    if (!conditions || !Array.isArray(conditions)) continue;
    for (const condition of conditions) {
      if (!isMapping(condition)) continue;
      const window = condition.time_window ? pyStr(condition.time_window) : 'today';
      if (window !== 'today') windows[level].add(window);
    }
  }
  return windows;
}

// core/metrics.py meta_date_preset
const metaDatePreset = (window: string): string => (window === 'lifetime' ? 'maximum' : window);

// MonitoringWorker._entity_windows: a short window with no row is a real
// zero; a lifetime with none is left out ("no data").
export function entityWindows(entityId: string, rowsByWindow: Record<string, Record<string, Json>>): Record<string, Json> {
  const windows: Record<string, Json> = {};
  for (const [window, byId] of Object.entries(rowsByWindow)) {
    const row = Object.hasOwn(byId, entityId) ? byId[entityId] : undefined;
    if (row === undefined && window === 'lifetime') continue;
    windows[window] = row && Object.keys(row).length ? row : {};
  }
  return windows;
}

// float(x or 0.0), int(x or 0)
const floatOr0 = (value: unknown): number => (value ? pyFloat(value) : 0);
const intOr0 = (value: unknown): number => (value ? pyInt(value) : 0);

interface Totals {
  spend: number;
  leads: number;
  registrations: number;
  purchases: number;
  clicks: number;
  link_clicks: number;
  impressions: number;
}

const blank = (): Totals => ({ spend: 0, leads: 0, registrations: 0, purchases: 0, clicks: 0, link_clicks: 0, impressions: 0 });

function accumulate(target: Totals, row: Json): void {
  target.spend += floatOr0(row.spend ?? 0);
  target.leads += intOr0(row.leads ?? 0);
  target.registrations += intOr0(row.registrations ?? 0);
  target.purchases += intOr0(row.purchases ?? 0);
  target.clicks += intOr0(row.clicks ?? 0);
  target.link_clicks += intOr0(row.link_clicks ?? 0);
  target.impressions += intOr0(row.impressions ?? 0);
}

function derive(totals: Totals): Json {
  const { clicks, impressions } = totals;
  return {
    ...totals,
    spend: pyRound(totals.spend, 6),
    cpc: clicks > 0 ? pyRound(totals.spend / clicks, 2) : 0,
    ctr: impressions > 0 ? pyRound((clicks / impressions) * 100, 2) : 0,
  };
}

// MonitoringWorker._campaign_entities: ad set rows rolled up into the
// campaigns that own them; identity and delivery state from the campaign
// inventory, lifetime read on the campaign itself.
export function campaignEntities(adsets: Json[], campaigns: Json[], insightsByWindow: Record<string, Record<string, Json>>, campaignLifetime: Record<string, Json> | null): { entities: Json[]; windows: Record<string, Record<string, Json>> } {
  const campaignOfAdset = new Map<string, string>();
  const todayTotals = new Map<string, Totals>();
  const totalsOf = (map: Map<string, Totals>, id: string): Totals => {
    let totals = map.get(id);
    if (!totals) map.set(id, (totals = blank()));
    return totals;
  };
  for (const adset of adsets) {
    const campaignId = adset.campaign_id ? pyStr(adset.campaign_id) : '';
    if (!campaignId) continue;
    campaignOfAdset.set(adset.adset_id ? pyStr(adset.adset_id) : '', campaignId);
    accumulate(totalsOf(todayTotals, campaignId), adset);
  }

  const entities: Json[] = [];
  for (const campaign of campaigns) {
    const campaignId = campaign.campaign_id ? pyStr(campaign.campaign_id) : '';
    if (!campaignId) continue;
    const status = 'status' in campaign ? campaign.status : 'UNKNOWN';
    entities.push({
      ...derive(todayTotals.get(campaignId) ?? blank()),
      entity_level: 'campaign',
      entity_id: campaignId,
      entity_name: campaign.campaign_name || `Campaign ${campaignId}`,
      campaign_id: campaignId,
      status,
      effective_status: 'effective_status' in campaign ? campaign.effective_status : status,
    });
  }

  const windows: Record<string, Record<string, Json>> = {};
  for (const [window, rowsByAdset] of Object.entries(insightsByWindow)) {
    if (window === 'lifetime') continue;
    const windowTotals = new Map<string, Totals>();
    for (const [adsetId, row] of Object.entries(rowsByAdset)) {
      const campaignId = campaignOfAdset.get(adsetId) || (row.campaign_id ? pyStr(row.campaign_id) : '');
      if (!campaignId) continue;
      accumulate(totalsOf(windowTotals, campaignId), row);
    }
    for (const [campaignId, totals] of windowTotals) (windows[campaignId] ??= {})[window] = derive(totals);
  }

  if (campaignLifetime !== null) {
    for (const entity of entities) {
      const campaignId = entity.campaign_id as string;
      const totals = blank();
      const row = Object.hasOwn(campaignLifetime, campaignId) ? campaignLifetime[campaignId] : undefined;
      if (row !== undefined) accumulate(totals, row);
      (windows[campaignId] ??= {}).lifetime = derive(totals);
    }
  }
  return { entities, windows };
}

// MonitoringWorker._stats_noun
const statsNoun = (evaluation: RuleEvaluationResult): 'adsets' | 'campaigns' | 'ads' =>
  evaluation.entity_level === 'campaign' ? 'campaigns' : evaluation.entity_level === 'ad' ? 'ads' : 'adsets';

const byId = (items: Json[], key: string): Record<string, Json> => Object.fromEntries(items.map((row) => [pyStr(row[key]), row]));

const stamp = (seconds: number | null): string | null => (seconds ? new Date(seconds * 1000).toISOString() : null);

export class RuleCycle {
  private readonly clock: () => number;
  private readonly keyring: MetaTokenKeyring;
  private cycleId = '';

  constructor(private readonly options: RuleCycleOptions) {
    this.clock = options.clock ?? (() => Date.now() / 1000);
    this.keyring = new MetaTokenKeyring(options.tokenEncryptionKey);
  }

  private async loadSettings(tx: EntityManager): Promise<Settings> {
    const [settings] = await rows<Record<string, unknown>>(tx, 'SELECT * FROM app_settings LIMIT 1');
    const pick = (name: string, fallback: number) => intervalMinutes(settings ? settings[name] : fallback, fallback);
    this.options.meta.configureAutomation({
      inventoryCacheMinutes: settings ? Number(settings.inventory_cache_minutes) : 5,
      adaptivePollingEnabled: settings ? Boolean(settings.adaptive_polling_enabled) : true,
      usageSoftLimitPercent: settings ? Number(settings.usage_soft_limit_percent) : 60,
      usageHardLimitPercent: settings ? Number(settings.usage_hard_limit_percent) : 80,
    });
    return {
      defaultInterval: pick('poll_interval_minutes', 10),
      criticalInterval: pick('critical_rule_interval_minutes', 2),
      stopConfirmationMinutes: Math.max(0, Math.min(60, settings ? pyInt(settings.stop_confirmation_minutes) : 10)),
      maxConcurrentAccounts: pick('max_concurrent_accounts', 3),
    };
  }

  // MonitoringWorker._fetch_account_snapshot: the Meta reads one account's due rules need.
  private async fetch(account: AccountRow, accessToken: string, dueRules: Rule[]): Promise<Snapshot> {
    const { meta, log } = this.options;
    const priority: Priority = dueRules.some(isCriticalStopRule) ? 'critical' : 'normal';
    const currency = normalizeCurrency(account.currency);
    const today = await meta.getAdsetsInsights(account.account_id, accessToken, 'today', currency, priority);
    const levels = windowsByLevel(dueRules);
    // A campaign's windows are summed from its ad sets, except lifetime,
    // read on the campaign itself. An ad's windows are read on the ad.
    const campaignWindows = levels.campaign;
    const adsetWindows = new Set([...levels.adset, ...[...campaignWindows].filter((window) => window !== 'lifetime')]);
    const results = await Promise.allSettled(
      [...adsetWindows].sort().map(async (window) => [window, byId(await meta.getAdsetsInsights(account.account_id, accessToken, metaDatePreset(window), currency, priority), 'adset_id')] as const),
    );
    const insightsByWindow: Record<string, Record<string, Json>> = {};
    const windowErrors: string[] = [];
    for (const result of results) {
      if (result.status === 'rejected') windowErrors.push(errorText(result.reason));
      else insightsByWindow[result.value[0]] = result.value[1];
    }

    let campaigns: Json[] = [];
    let campaignLifetime: Record<string, Json> = {};
    let campaignsError: unknown = null;
    if (dueRules.some((rule) => ruleLevel(rule) === 'campaign')) {
      try {
        campaigns = await meta.getCampaignsInventory(account.account_id, accessToken, priority);
        if (campaignWindows.has('lifetime')) {
          campaignLifetime = byId(await meta.getCampaignsInsights(account.account_id, accessToken, metaDatePreset('lifetime'), currency, priority), 'campaign_id');
        }
      } catch (error) {
        log.warn(`Failed to read campaigns for ${account.account_id}: ${errorText(error)}`);
        campaigns = [];
        campaignLifetime = {};
        campaignsError = error;
      }
    }

    let ads: Json[] = [];
    let adsByWindow: Record<string, Record<string, Json>> = {};
    let adsError: unknown = null;
    if (dueRules.some((rule) => ruleLevel(rule) === 'ad')) {
      try {
        ads = await meta.getAdsInsights(account.account_id, accessToken, 'today', currency, priority);
        for (const window of [...levels.ad].sort()) {
          adsByWindow[window] = byId(await meta.getAdsInsights(account.account_id, accessToken, metaDatePreset(window), currency, priority), 'ad_id');
        }
      } catch (error) {
        log.warn(`Failed to read ads for ${account.account_id}: ${errorText(error)}`);
        ads = [];
        adsByWindow = {};
        adsError = error;
      }
    }
    return {
      adsets: today,
      campaigns,
      campaign_lifetime: campaignLifetime,
      campaigns_error: campaignsError,
      ads,
      ads_by_window: adsByWindow,
      ads_error: adsError,
      insights_by_window: insightsByWindow,
      window_errors: windowErrors,
    };
  }

  // MonitoringWorker._load_undone_rule_actions: rule actions the buyer undid
  // today in this ad account, by entity.
  private async undoneActions(tx: EntityManager, account: AccountRow, now: number): Promise<Record<string, string[]>> {
    const found = await rows<{ entity_id: string; event_type: string }>(
      tx,
      `SELECT undo.entity_id, source.event_type FROM audit_events undo JOIN audit_events source ON undo.reverts_event_id = source.id
       WHERE undo.workspace_id = $1 AND undo.account_id = $2 AND undo.event_type = 'UNDO_ACTION' AND undo.status = 'SUCCESS'
         AND undo.created_at >= to_timestamp($3::float8) AND source.category = 'RULE_ACTION' AND source.actor_type = 'system'`,
      [account.workspace_id, String(account.account_id), accountDayStart(account.timezone_name, now)],
    );
    const undone: Record<string, Set<string>> = {};
    for (const row of found) (undone[pyStr(row.entity_id)] ??= new Set()).add(pyStr(row.event_type));
    return Object.fromEntries(Object.entries(undone).map(([id, actions]) => [id, [...actions]]));
  }

  // MonitoringWorker._load_manual_enables: entities a person turned back on
  // today after a rule turned them off, with the reason the rule state shows.
  private async manualEnables(tx: EntityManager, account: AccountRow, entities: Json[], now: number): Promise<Record<string, string>> {
    const found = await rows<{ entity_id: string; event_type: string; category: string | null; actor_type: string | null }>(
      tx,
      `SELECT entity_id, event_type, category, actor_type FROM audit_events
       WHERE workspace_id = $1 AND account_id = $2 AND status = 'SUCCESS' AND event_type = ANY($3)
         AND created_at >= to_timestamp($4::float8) AND created_at < to_timestamp($5::float8)
       ORDER BY id`,
      [account.workspace_id, String(account.account_id), STATUS_EVENT_TYPES, accountDayStart(account.timezone_name, now), accountDayEnd(account.timezone_name, now)],
    );
    const latest = new Map<string, [string, string, string]>();
    for (const row of found) {
      if (row.entity_id) latest.set(pyStr(row.entity_id), [pyStr(row.event_type), row.category ? pyStr(row.category) : '', row.actor_type ? pyStr(row.actor_type) : '']);
    }
    const statusByEntity = new Map(entities.map((entity) => [entity.entity_id ? pyStr(entity.entity_id) : '', entity.status ? pyStr(entity.status).toUpperCase() : '']));
    const holds: Record<string, string> = {};
    for (const [entityId, [eventType, category, actorType]] of latest) {
      if (eventType === 'MANUAL_REACTIVATE' && actorType === 'user') holds[entityId] = MANUAL_ENABLE_IN_BUYERLY;
      else if (eventType === 'STOP' && category === 'RULE_ACTION' && actorType === 'system' && statusByEntity.get(entityId) === 'ACTIVE') holds[entityId] = MANUAL_ENABLE_IN_META;
    }
    return holds;
  }

  // The execution slots as the decision left them.
  private async saveSlots(tx: EntityManager, account: AccountRow, states: ExecutionState[]): Promise<void> {
    for (const state of states) {
      const values = [
        state.execution_key,
        state.owner_user_id ?? null,
        String(account.account_id),
        state.adset_id ?? '',
        state.entity_level ?? 'adset',
        state.entity_id,
        state.rule_key ?? '',
        state.action,
        state.status,
        state.correlation_id ?? '',
        state.last_attempt_at ?? 0,
        state.last_success_at,
        JSON.stringify(state.before_state ?? {}),
        JSON.stringify(state.after_state ?? {}),
        JSON.stringify(state.details ?? {}),
      ];
      if (state.is_new) {
        await tx.query(
          `INSERT INTO rule_execution_states (execution_key, owner_user_id, account_id, adset_id, entity_level, entity_id, rule_key, action, status, correlation_id,
             last_attempt_at, last_success_at, before_state, after_state, details, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now(), now())`,
          values,
        );
        state.is_new = false;
      } else {
        await tx.query(
          `UPDATE rule_execution_states SET owner_user_id = $2, status = $9, correlation_id = $10, last_attempt_at = $11, last_success_at = $12,
             before_state = $13, after_state = $14, details = $15, updated_at = now()
           WHERE execution_key = $1`,
          values,
        );
      }
    }
  }

  // MonitoringWorker._save_rule_states: the account's rule-on-entity snapshot,
  // overwritten. A failure here never stops automation.
  private async saveRuleStates(tx: EntityManager, account: AccountRow, outcomes: ReturnType<typeof createDecider>['outcomes'], checkedRuleIds: number[], attachedRuleIds: number[], now: number): Promise<void> {
    if (account.workspace_id === null) return;
    const checkedAt = new Date(now * 1000).toISOString();
    const byKey = new Map<string, (typeof outcomes)[number]>();
    for (const outcome of outcomes) byKey.set(JSON.stringify([outcome.rule_id, outcome.entity_level, outcome.entity_id]), outcome);
    await tx.query('SAVEPOINT rule_states');
    try {
      for (const outcome of byKey.values()) {
        await tx.query(
          `INSERT INTO rule_entity_states (workspace_id, account_id, rule_id, entity_level, entity_id, entity_name, campaign_id, state, detail, wait_until,
             yielded_to_rule_id, yielded_to_rule_name, checked_at, acted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT ON CONSTRAINT uq_rule_entity_state DO UPDATE SET
             entity_name = EXCLUDED.entity_name, campaign_id = EXCLUDED.campaign_id, state = EXCLUDED.state, detail = EXCLUDED.detail,
             wait_until = EXCLUDED.wait_until, yielded_to_rule_id = EXCLUDED.yielded_to_rule_id, yielded_to_rule_name = EXCLUDED.yielded_to_rule_name,
             checked_at = EXCLUDED.checked_at, acted_at = coalesce(EXCLUDED.acted_at, rule_entity_states.acted_at)`,
          [
            account.workspace_id,
            String(account.account_id),
            outcome.rule_id,
            outcome.entity_level,
            outcome.entity_id,
            outcome.entity_name,
            outcome.campaign_id,
            outcome.state,
            outcome.detail || '',
            stamp(outcome.wait_until),
            outcome.yielded_to_rule_id ?? null,
            outcome.yielded_to_rule_name ? pyStr(outcome.yielded_to_rule_name) : '',
            checkedAt,
            stamp(outcome.acted_at),
          ],
        );
      }
      if (checkedRuleIds.length) {
        await tx.query('DELETE FROM rule_entity_states WHERE workspace_id = $1 AND account_id = $2 AND rule_id = ANY($3) AND checked_at < $4', [
          account.workspace_id,
          String(account.account_id),
          checkedRuleIds,
          checkedAt,
        ]);
      }
      await tx.query('DELETE FROM rule_entity_states WHERE workspace_id = $1 AND account_id = $2 AND NOT (rule_id = ANY($3))', [account.workspace_id, String(account.account_id), attachedRuleIds]);
      await tx.query('RELEASE SAVEPOINT rule_states');
    } catch (error) {
      await tx.query('ROLLBACK TO SAVEPOINT rule_states');
      this.options.log.error(`Failed to save rule states for ${account.account_id}: ${errorText(error)}`);
    }
  }

  // MonitoringWorker._mutation_landed: whether Meta holds the change although
  // the write reported a failure. A token error is never second-guessed.
  private async mutationLanded(account: AccountRow, evaluation: RuleEvaluationResult, error: unknown, accessToken: string, desired: Json): Promise<boolean> {
    const { meta, log } = this.options;
    if (error instanceof MetaTokenAuthError) return false;
    let current: unknown;
    try {
      current = await meta.getEntityState(evaluation.entity_id, accessToken, evaluation.entity_level, account.currency);
    } catch (readError) {
      log.warn(`Could not read ${evaluation.entity_level} ${evaluation.entity_id} after a failed write: ${errorText(readError)}`);
      return false;
    }
    if (!isMapping(current) || !stateMatches(current, desired)) return false;
    log.warn(`Meta applied ${JSON.stringify(desired)} on ${evaluation.entity_level} ${evaluation.entity_id} although the write failed (${errorText(error)})`);
    return true;
  }

  // _apply_entity_status / _update_budget: the Meta write at the rule's level.
  private async write(account: AccountRow, action: IntendedAction, accessToken: string): Promise<void> {
    const { meta } = this.options;
    const { evaluation, desired_state: desired } = action;
    try {
      if ('daily_budget' in desired) {
        await meta.updateAdsetBudget(evaluation.entity_id, accessToken, desired.daily_budget as number, account.currency, account.account_id);
      } else if (evaluation.entity_level === 'adset') {
        await meta.setAdsetStatus(evaluation.entity_id, accessToken, desired.status as string, account.account_id);
      } else if (evaluation.entity_level === 'ad') {
        await meta.setAdStatus(evaluation.entity_id, accessToken, desired.status as string, account.account_id);
      } else {
        await meta.setCampaignStatus(evaluation.entity_id, accessToken, desired.status as string, account.account_id);
      }
    } catch (error) {
      if (!(await this.mutationLanded(account, evaluation, error, accessToken, desired))) throw error;
    }
  }

  // MonitoringWorker._record_stopped_adset: a stopped ad set, so a late
  // conversion can propose turning it back on.
  private async recordStoppedAdset(tx: EntityManager, account: AccountRow, evaluation: RuleEvaluationResult): Promise<void> {
    const values = [String(account.account_id), evaluation.entity_id, evaluation.entity_name, evaluation.spend, evaluation.leads, evaluation.registrations];
    const [updated] = await rows<{ id: number }>(
      tx,
      `UPDATE stopped_adsets SET account_id = $1, adset_name = $3, stop_spend = $4, stop_leads = $5, stop_registrations = $6, is_resolved = false,
         stopped_at = now(), updated_at = now()
       WHERE adset_id = $2 RETURNING id`,
      values,
    );
    if (updated) return;
    await rows(
      tx,
      `INSERT INTO stopped_adsets (account_id, adset_id, adset_name, stop_spend, stop_leads, stop_registrations, is_resolved, stopped_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, false, now(), now()) RETURNING id`,
      values,
    );
  }

  // One claimed action: the Meta write, then its slot, history and local mirrors.
  private async act(account: AccountRow, plan: EntityPlan, action: IntendedAction, decider: ReturnType<typeof createDecider>, accessToken: string, stats: RuleCycleStats): Promise<MetaTokenAuthError | null> {
    const { db, log } = this.options;
    const { evaluation, entity } = action;
    const entityId = plan.entity_id;
    const kind = evaluation.action;
    const status = (fallback: string) => ('status' in entity ? entity.status : fallback);
    const event = (fields: Omit<MonitoringEvent, 'evaluation' | 'eventType'>): MonitoringEvent => ({ eventType: kind, evaluation, ...fields });

    if (kind === 'NOTIFY_ONLY' || kind === 'PROPOSE_REACTIVATE') {
      if (kind === 'PROPOSE_REACTIVATE') stats.proposals_sent += 1;
      log.info(`${kind === 'NOTIFY_ONLY' ? 'NOTIFY ONLY' : 'PROPOSE REACTIVATE'} ${evaluation.entity_level}: ${entityId} (${evaluation.entity_name}) - ${evaluation.reason}`);
      decider.settle(plan, action, null);
      await db.transaction(async (tx) => {
        await this.saveSlots(tx, account, decider.takeDirty());
        await persistMonitoringEvent(tx, log, this.cycleId, account, event({ status: 'SUCCESS', before: { status: status('UNKNOWN') }, after: { status: status('UNKNOWN') } }));
      });
      return null;
    }
    if (kind !== 'STOP' && kind !== 'AUTO_REACTIVATE' && kind !== 'INCREASE_BUDGET' && kind !== 'DECREASE_BUDGET') return null;

    const budget = kind === 'INCREASE_BUDGET' || kind === 'DECREASE_BUDGET';
    const currentBudget = budget ? (action.observed_state.daily_budget as number) : 0;
    const newBudget = budget ? (action.desired_state.daily_budget as number) : 0;
    const started = performance.now();
    let failure: unknown = null;
    try {
      await this.write(account, action, accessToken);
    } catch (error) {
      failure = error;
    }
    const durationMs = performance.now() - started;

    if (failure === null) {
      if (kind === 'STOP') {
        stats[`${statsNoun(evaluation)}_stopped`] += 1;
        log.info(`STOPPED ${evaluation.entity_level}: ${entityId} (${evaluation.entity_name}) - ${evaluation.reason}`);
      } else if (kind === 'AUTO_REACTIVATE') {
        stats[`${statsNoun(evaluation)}_reactivated`] += 1;
      } else {
        stats.budgets_changed += 1;
      }
      decider.settle(plan, action, null);
      await db.transaction(async (tx) => {
        if (!budget && evaluation.entity_level === 'adset') {
          await updateCachedAdsetStatus(tx, account.account_id, evaluation.entity_id, kind === 'STOP' ? 'PAUSED' : 'ACTIVE');
        }
        if (kind === 'STOP' && evaluation.entity_level === 'adset') {
          await tx.query('SAVEPOINT stopped_adset');
          try {
            await this.recordStoppedAdset(tx, account, evaluation);
            await tx.query('RELEASE SAVEPOINT stopped_adset');
          } catch (error) {
            await tx.query('ROLLBACK TO SAVEPOINT stopped_adset');
            log.error(`Failed to persist stopped adset ${entityId}: ${errorText(error)}`);
            stats.errors.push(`Stopped-adset persistence error ${entityId}: ${errorText(error)}`);
          }
        }
        if (kind === 'AUTO_REACTIVATE' && evaluation.entity_level === 'adset') {
          await tx.query('SAVEPOINT stopped_adset');
          try {
            await tx.query('UPDATE stopped_adsets SET is_resolved = true, updated_at = now() WHERE adset_id = $1', [entityId]);
            await tx.query('RELEASE SAVEPOINT stopped_adset');
          } catch (error) {
            await tx.query('ROLLBACK TO SAVEPOINT stopped_adset');
            log.error(`Failed to resolve stopped adset ${entityId}: ${errorText(error)}`);
            stats.errors.push(`Stopped-adset resolution error ${entityId}: ${errorText(error)}`);
          }
        }
        await this.saveSlots(tx, account, decider.takeDirty());
        const states =
          kind === 'STOP'
            ? { before: { status: status('ACTIVE') }, after: { status: 'PAUSED' } }
            : kind === 'AUTO_REACTIVATE'
              ? { before: { status: status('PAUSED') }, after: { status: 'ACTIVE' } }
              : { before: { daily_budget: currentBudget }, after: { daily_budget: newBudget } };
        await persistMonitoringEvent(tx, log, this.cycleId, account, event({ status: 'SUCCESS', ...states, durationMs }));
      });
      if (!budget) {
        await reflectEntityChange(
          { db, log },
          { workspaceId: account.workspace_id, accountId: account.account_id, level: evaluation.entity_level, entityId: evaluation.entity_id, status: kind === 'STOP' ? 'PAUSED' : 'ACTIVE' },
        );
      }
      if (kind === 'AUTO_REACTIVATE') log.info(`AUTO REACTIVATED ${evaluation.entity_level}: ${entityId} (${evaluation.entity_name})`);
      return null;
    }

    const text = errorText(failure);
    const label = { STOP: ['pausing adset', 'Pause error'], AUTO_REACTIVATE: ['auto-reactivating adset', 'Auto-reactivate error'], INCREASE_BUDGET: ['increasing budget for adset', 'Budget increase error'], DECREASE_BUDGET: ['decreasing budget for adset', 'Budget decrease error'] }[kind];
    log.error(`Error ${label[0]} ${entityId}: ${text}`);
    stats.errors.push(`${label[1]} ${entityId}: ${text}`);
    decider.settle(plan, action, text);
    const unchanged = budget ? { before: { daily_budget: currentBudget }, after: { daily_budget: currentBudget } } : { before: { status: status('UNKNOWN') }, after: { status: status('UNKNOWN') } };
    await db.transaction(async (tx) => {
      await this.saveSlots(tx, account, decider.takeDirty());
      await persistMonitoringEvent(tx, log, this.cycleId, account, event({ status: 'ERROR', message: text, ...unchanged, durationMs }));
    });
    return failure instanceof MetaTokenAuthError ? failure : null;
  }

  // One account's turn after its reads: the decision, step by step, with the writes it calls for.
  private async checkAccount(item: Prepared, snapshot: Snapshot, settings: Settings, connections: Map<number, ConnectionRow>, stats: RuleCycleStats): Promise<void> {
    const { db, log } = this.options;
    const { account, now, dueRules, accessToken } = item;
    const accountRef = String(account.account_id);
    if (snapshot.window_errors.length) {
      // The rules sit this cycle out rather than run on half the numbers.
      stats.errors.push(...snapshot.window_errors.map((error) => `Account ${accountRef} window: ${error}`));
      return;
    }
    const { adsets, campaigns, ads } = snapshot;
    stats.adsets_checked += adsets.length;

    const entities: Json[] = adsets.map((adset) => ({ ...adset, entity_level: 'adset', entity_id: pyStr(adset.adset_id), entity_name: adset.adset_name ? pyStr(adset.adset_name) : '' }));
    const windows: Record<string, Record<string, Json>> = Object.fromEntries(adsets.map((adset) => [pyStr(adset.adset_id), entityWindows(pyStr(adset.adset_id), snapshot.insights_by_window)]));
    if (campaigns.length) {
      const rolled = campaignEntities(adsets, campaigns, snapshot.insights_by_window, windowsByLevel(dueRules).campaign.has('lifetime') ? snapshot.campaign_lifetime : null);
      entities.push(...rolled.entities);
      Object.assign(windows, rolled.windows);
    } else if (snapshot.campaigns_error !== null) {
      stats.errors.push(`Account ${accountRef}: campaigns unavailable (${errorText(snapshot.campaigns_error)}); campaign rules skipped this cycle`);
    }
    for (const ad of ads) {
      const adId = pyStr(ad.ad_id);
      entities.push({ ...ad, entity_level: 'ad', entity_id: adId, entity_name: ad.ad_name ? pyStr(ad.ad_name) : '' });
      windows[adId] = entityWindows(adId, snapshot.ads_by_window);
    }
    if (snapshot.ads_error !== null) stats.errors.push(`Account ${accountRef}: ads unavailable (${errorText(snapshot.ads_error)}); ad rules skipped this cycle`);

    const loaded = await db.transaction(async (tx) => ({
      undone: await this.undoneActions(tx, account, now),
      manual: await this.manualEnables(tx, account, entities, now),
      states: await rows<ExecutionState>(
        tx,
        `SELECT execution_key, owner_user_id, account_id, adset_id, entity_level, entity_id, rule_key, action, status, correlation_id,
                last_attempt_at, last_success_at, before_state, after_state, details
         FROM rule_execution_states WHERE account_id = $1`,
        [accountRef],
      ),
    }));
    const decider = createDecider({
      cycle_id: this.cycleId,
      account: { account_id: accountRef, owner_user_id: account.owner_user_id, workspace_id: account.workspace_id, currency: account.currency, rules_enabled: account.rules_enabled, timezone_name: account.timezone_name },
      now,
      stop_confirmation_minutes: settings.stopConfirmationMinutes,
      critical_interval: settings.criticalInterval,
      due_rules: dueRules,
      entities,
      entity_windows: windows,
      undone_actions: loaded.undone,
      manual_enables: loaded.manual,
      execution_states: loaded.states.map((state) => ({ ...state, last_attempt_at: Number(state.last_attempt_at), last_success_at: state.last_success_at === null ? null : Number(state.last_success_at) })),
    });

    // A token Meta refused on a write stops this account's actions for the
    // cycle and is handled like one refused on a read.
    let tokenError: MetaTokenAuthError | null = null;
    try {
    for (const entity of entities) {
      if (tokenError) break;
      const plan = decider.plan(entity);
      const resets = decider.takeDirty();
      if (resets.length) await db.transaction((tx) => this.saveSlots(tx, account, resets));
      for (const evaluation of plan.evaluations) {
        if (tokenError) break;
        const step = decider.step(plan, evaluation);
        if (step.kind === 'act') {
          // The claim is committed before Meta is written.
          const claimed = decider.takeDirty();
          await db.transaction((tx) => this.saveSlots(tx, account, claimed));
          tokenError = await this.act(account, plan, step.action, decider, accessToken, stats);
          continue;
        }
        const touched = decider.takeDirty();
        await db.transaction(async (tx) => {
          await this.saveSlots(tx, account, touched);
          if (step.kind !== 'event') return;
          const { event } = step;
          await persistMonitoringEvent(tx, log, this.cycleId, account, this.decisionEvent(event, settings.stopConfirmationMinutes));
        });
      }
    }
    } finally {
      // Python counts these as it goes, so a failure keeps what was counted.
      stats.actions_skipped += decider.stats.actions_skipped;
      stats.actions_reconciled += decider.stats.actions_reconciled;
      stats.stop_confirmations_waiting += decider.stats.stop_confirmations_waiting;
    }

    const ids = (rules: unknown[]) => [...new Set(rules.filter(isMapping).map((rule) => rule.preset_id).filter((id): id is number => typeof id === 'number' && Number.isInteger(id)))].sort((a, b) => a - b);
    await db.transaction(async (tx) => {
      await this.saveRuleStates(tx, account, decider.outcomes, ids(dueRules), ids(loadRules(account.active_rules, account.workspace_id)), now);
      if (tokenError) {
        // Without this the account looked healthy until the next read failed,
        // and every check retried the write.
        await handleTokenError(tx, log, this.cycleId, account, tokenError, new Set(connections.keys()));
        await setMonitoredHealth(tx, log, this.cycleId, account, { success: false, error: tokenError, cause: 'user', signals: { token_healthy: false } }, false);
      }
    });
  }

  // The history entry of a step that did not act.
  private decisionEvent(event: ReturnType<typeof createDecider>['events'][number], stopConfirmationMinutes: number): MonitoringEvent {
    const { evaluation } = event;
    if (event.event_type === 'STOP_CONFIRMATION_STARTED') {
      return {
        eventType: event.event_type,
        status: 'WAITING',
        category: 'RULE_ENGINE',
        evaluation,
        action: 'STOP',
        message: `A STOP candidate was found. Buyerly will re-check the metrics within ${stopConfirmationMinutes} min.`,
        before: event.observed_state,
        after: event.desired_state,
        details: { confirmation_minutes: stopConfirmationMinutes, execution_key: event.execution_key },
      };
    }
    const reason = event.event_type === 'RULE_ACTION_RECONCILED' ? 'reconciled' : event.event_type === 'RULE_ACTION_COOLDOWN' ? 'cooldown' : 'pending';
    const messages = {
      cooldown: `Action skipped: cooldown ${pyStr(evaluation.cooldown_minutes)} min.`,
      pending: 'The action already started in a previous cycle; the duplicate was blocked.',
      reconciled: "The previous action's result was confirmed against Meta's current state.",
    };
    return {
      eventType: event.event_type,
      status: reason === 'reconciled' ? 'SUCCESS' : 'SKIPPED',
      evaluation,
      action: evaluation.action,
      message: messages[reason],
      before: event.observed_state,
      after: event.desired_state,
      details: { claim_reason: reason, execution_key: event.execution_key },
    };
  }

  // MonitoringWorker._persist_runtime_state: the cycle's summary every
  // signed-in user may read (counts only).
  private async persistRuntimeState(stats: RuleCycleStats, startedAt: string, durationMs: number): Promise<void> {
    const { db, log, meta } = this.options;
    const usage = meta.getUsageSnapshot();
    const errors = stats.errors;
    if (errors.length) {
      log.warn(
        `Monitoring cycle ${stats.cycle_id} finished with ${errors.length} error(s): ${errors
          .slice(0, 5)
          .map((error) => Array.from(redactSecrets(error)).slice(0, 240).join(''))
          .join('; ')}`,
      );
    }
    const payload: Json = {
      cycle_id: stats.cycle_id,
      started_at: startedAt,
      finished_at: pythonUtcIso(new Date()),
      duration_ms: Math.trunc(durationMs),
      accounts_checked: stats.accounts_checked,
      accounts_skipped: stats.accounts_skipped,
      rules_checked: stats.rules_checked,
      adsets_checked: stats.adsets_checked,
      actions_count:
        stats.adsets_stopped + stats.campaigns_stopped + stats.ads_stopped + stats.adsets_reactivated + stats.campaigns_reactivated + stats.ads_reactivated + stats.budgets_changed + stats.proposals_sent,
      // Error texts name ad accounts and may carry credentials; this row is
      // shared by every workspace, so only the count.
      errors_count: errors.length,
      usage: { max_percent: Math.trunc(usage.max_percent || 0), app: { ...usage.app }, accounts_observed: Object.keys(usage.accounts).length, updated_at: usage.updated_at },
    };
    try {
      await db.transaction(async (tx) => {
        const [row] = await rows<{ payload: Json | null }>(tx, "SELECT payload FROM automation_runtime_states WHERE state_key = 'monitoring' FOR UPDATE");
        const existing = row?.payload ?? {};
        if (existing.last_backup_at) payload.last_backup_at = existing.last_backup_at;
        if (existing.synthetic) payload.synthetic = existing.synthetic;
        await tx.query(
          `INSERT INTO automation_runtime_states (state_key, payload, updated_at) VALUES ('monitoring', $1, now())
           ON CONFLICT (state_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
          [JSON.stringify(payload)],
        );
      });
    } catch (error) {
      log.error(`Failed to persist monitoring runtime state: ${errorText(error)}`);
    }
  }

  // `accountIds` limits it to those accounts (the parity test's).
  async run({ accountIds }: { accountIds?: string[] } = {}): Promise<RuleCycleStats> {
    const { db, log } = this.options;
    const sleep = this.options.sleep ?? ((seconds: number) => new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000)));
    const random = this.options.random ?? Math.random;
    const cycleStarted = performance.now();
    const startedAt = pythonUtcIso(new Date());
    this.cycleId = randomUUID().replaceAll('-', '');
    const stats: RuleCycleStats = {
      cycle_id: this.cycleId,
      accounts_checked: 0,
      accounts_skipped: 0,
      rules_checked: 0,
      adsets_checked: 0,
      adsets_stopped: 0,
      campaigns_stopped: 0,
      ads_stopped: 0,
      adsets_reactivated: 0,
      campaigns_reactivated: 0,
      ads_reactivated: 0,
      budgets_changed: 0,
      actions_skipped: 0,
      actions_reconciled: 0,
      stop_confirmations_waiting: 0,
      proposals_sent: 0,
      errors: [],
    };

    const prepared = await db.transaction(async (tx) => {
      const accounts = await rows<AccountRow>(tx, `SELECT * FROM accounts WHERE is_active = true${accountIds ? ' AND account_id = ANY($1)' : ''} ORDER BY id`, accountIds ? [accountIds] : []);
      if (!accounts.length) return null;
      const states = new Map<string, number>();
      for (let index = 0; index < accounts.length; index += 500) {
        const chunk = accounts.slice(index, index + 500).map((account) => String(account.account_id));
        for (const state of await rows<{ state_key: string; last_checked_at: number }>(tx, 'SELECT state_key, last_checked_at FROM automation_schedule_states WHERE account_id = ANY($1)', [chunk])) {
          states.set(state.state_key, Number(state.last_checked_at));
        }
      }
      const connectionIds = [...new Set(accounts.map((account) => account.meta_connection_id).filter((id): id is number => id !== null))];
      const connections = new Map<number, ConnectionRow>();
      if (connectionIds.length) {
        for (const connection of await rows<ConnectionRow>(tx, 'SELECT id, workspace_id, owner_user_id, status, access_token_encrypted FROM meta_connections WHERE id = ANY($1)', [connectionIds])) {
          connections.set(connection.id, connection);
        }
      }
      const settings = await this.loadSettings(tx);

      const due: Prepared[] = [];
      for (const account of accounts) {
        const accountRef = String(account.account_id);
        // The account sync records the connection problem in the account's
        // health; the rules just wait for it to be fixed.
        if (connectionProblem(account, connections, log)) continue;
        const now = this.clock();
        const active = loadRules(account.active_rules, account.workspace_id);
        const dueEntries: Array<{ key: string; rule: Rule }> = [];
        if (account.rules_enabled) {
          for (const [index, rule] of active.entries()) {
            const ruleKey = `${accountRef}:${rule.preset_id !== null && rule.preset_id !== undefined ? pyStr(rule.preset_id) : `index-${index}`}`;
            let interval = intervalMinutes(rule.check_interval, settings.defaultInterval);
            if (isCriticalStopRule(rule)) interval = Math.min(interval, settings.criticalInterval);
            const stateKey = `rule:${accountRef}:${ruleKey}`;
            let lastChecked = states.get(stateKey);
            if (lastChecked === undefined) {
              // _get_or_create_schedule_state: the row exists from the first look on.
              await tx.query(
                `INSERT INTO automation_schedule_states (state_key, owner_user_id, account_id, rule_key, last_checked_at, updated_at)
                 VALUES ($1, $2, $3, $4, 0, now()) ON CONFLICT (state_key) DO NOTHING`,
                [stateKey, account.owner_user_id, accountRef, ruleKey],
              );
              lastChecked = 0;
              states.set(stateKey, 0);
            }
            if (lastChecked <= 0 || now - lastChecked >= interval * 60) dueEntries.push({ key: stateKey, rule: rule });
          }
        }
        if (!dueEntries.length) {
          stats.accounts_skipped += 1;
          continue;
        }
        // The account sync reads the currency from Meta first; the rules stay due until it has.
        if (normalizeCurrency(account.currency) === 'UNKNOWN') {
          stats.accounts_skipped += 1;
          continue;
        }
        for (const { key } of dueEntries) {
          await tx.query('UPDATE automation_schedule_states SET last_checked_at = $2, updated_at = now() WHERE state_key = $1', [key, now]);
          states.set(key, now);
        }
        const dueRules = dueEntries.map(({ rule }) => rule);
        stats.accounts_checked += 1;
        stats.rules_checked += dueRules.length;
        let accessToken: string;
        try {
          accessToken = await resolveAccountAccessToken(
            {
              metaConnectionId: account.meta_connection_id,
              workspaceId: account.workspace_id,
              ownerUserId: account.owner_user_id,
              accessTokenEncrypted: account.access_token_encrypted,
              accessToken: account.access_token,
            },
            this.keyring,
            async (id) => {
              const connection = connections.get(id);
              return connection
                ? { status: connection.status, workspaceId: connection.workspace_id, ownerUserId: connection.owner_user_id, accessTokenEncrypted: connection.access_token_encrypted }
                : null;
            },
          );
        } catch (error) {
          // The account sync records it in the account's health.
          stats.errors.push(`Account ${accountRef}: ${errorText(error)}`);
          continue;
        }
        due.push({ account, now, dueRules, accessToken });
      }
      return { due, connections, settings };
    });

    if (prepared) {
      const snapshots = await gatherLimited(prepared.due, prepared.settings.maxConcurrentAccounts, (item) => this.fetch(item.account, item.accessToken, item.dueRules));
      for (const [index, item] of prepared.due.entries()) {
        const { account } = item;
        const { value: snapshot, error } = snapshots[index];
        try {
          if (error instanceof MetaTokenAuthError) {
            await db.transaction(async (tx) => {
              await handleTokenError(tx, log, this.cycleId, account, error, new Set(prepared.connections.keys()));
              await setMonitoredHealth(tx, log, this.cycleId, account, { success: false, error, cause: 'user', signals: { token_healthy: false } }, false);
            });
          } else if (!snapshot) {
            // A failed Meta read; the account sync records it in the account's health.
            stats.errors.push(`Account ${account.account_id}: ${errorText(error)}`);
          } else {
            await this.checkAccount(item, snapshot, prepared.settings, prepared.connections, stats);
          }
        } catch (failure) {
          log.error(`Error processing account ${account.account_id}: ${errorText(failure)}`);
          stats.errors.push(`Account ${account.account_id}: ${errorText(failure)}`);
          await db.transaction((tx) => setMonitoredHealth(tx, log, this.cycleId, account, { success: false, error: failure }));
        }
        // Random cross-account jitter (0.5-1.5 s) to smooth the load on the Meta API.
        await sleep(0.5 + random());
      }
    }

    await this.persistRuntimeState(stats, startedAt, performance.now() - cycleStarted);
    return stats;
  }
}
