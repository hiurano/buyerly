import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { EntityManager } from 'typeorm';
import { rows, type Database } from '../database.ts';
import { periodDates, daysBefore } from '../graphql/areas/accounts/clock.ts';
import type { MetaClient } from '../meta/client.ts';
import { MetaTokenAuthError } from '../meta/errors.ts';
import { get, type Json } from '../meta/python.ts';
import { redactSecrets } from '../meta/redact.ts';
import { MetaTokenKeyring, resolveAccountAccessToken } from '../meta/tokens.ts';
import { canonicalTimezoneName, normalizeCurrency } from '../meta/units.ts';
import { pyStr } from '../rules/validation.ts';
import { errorText, type HealthUpdate } from './account-health.ts';
import { handleTokenError, persistMonitoringEvent, setMonitoredHealth } from './monitoring-events.ts';
import { upsertEntityFacts } from './analytics-facts.ts';

// The data half of the monitoring cycle (scheduler/worker.py
// MonitoringWorker.run_account_sync_cycle; #611 stage 4), job `account_sync`:
// for every active account that is due, the account itself from Meta
// (currency, status, time zone; every account health interval), its
// hierarchical facts for today and one closed day into the analytics fact
// store, the shared ad set inventory cache the Meta client keeps on the way,
// and the account's health. The rules half stays on the Python worker.

// (days before the account's today, seconds between re-reads).
const CLOSED_DAY_REFRESH_SCHEDULE: Array<[number, number]> = [[1, 60 * 60], ...[2, 3, 4, 5, 6].map((back): [number, number] => [back, 24 * 60 * 60])];
const BROKEN_CONNECTION_STATES = new Set(['expired', 'needs_reconnect', 'missing_scopes', 'error']);
const CRITICAL_ACTIONS = new Set(['turn_off', 'stop', 'pause']);

export interface AccountRow {
  id: number;
  account_id: string;
  name: string | null;
  workspace_id: number | null;
  owner_user_id: number | null;
  meta_connection_id: number | null;
  access_token: string | null;
  access_token_encrypted: string | null;
  currency: string;
  timezone_name: string;
  account_status: number;
  status_label: string | null;
  is_active: boolean;
  rules_enabled: boolean;
  active_rules: string | null;
}

export interface ConnectionRow {
  id: number;
  workspace_id: number | null;
  owner_user_id: number | null;
  status: string;
  access_token_encrypted: string;
}

interface Settings {
  defaultInterval: number;
  criticalInterval: number;
  healthInterval: number;
  maxConcurrentAccounts: number;
}

export interface AccountSyncStats {
  cycle_id: string;
  accounts_synced: number;
  accounts_skipped: number;
  facts_stored: number;
  errors: string[];
}

interface Snapshot {
  account_info: Json | null;
  currency: string;
  hierarchical_facts: Json[];
  hierarchy_error: unknown;
  closed_day_facts: Json[];
}

export interface AccountSyncOptions {
  db: Database;
  log: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
  meta: MetaClient;
  tokenEncryptionKey: string;
  // Seconds since the epoch, the cycle's clock (time.time in Python).
  clock?: () => number;
  // Aborted on SIGTERM: the sync stops between accounts (#685).
  signal?: AbortSignal;
}

// int(value) where Python's int() takes it; undefined where it raises
// TypeError or ValueError.
function pyInt(value: unknown): number | undefined {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return undefined;
    if (!Number.isFinite(value)) throw new Error('cannot convert float infinity to integer');
    return Math.trunc(value) + 0;
  }
  if (typeof value === 'string') {
    const match = /^\s*([+-]?)(\d(?:_?\d)*)\s*$/.exec(value);
    return match ? Number(`${match[1]}${match[2].replaceAll('_', '')}`) + 0 : undefined;
  }
  return undefined;
}

// MonitoringWorker._interval_minutes
export function intervalMinutes(value: unknown, fallback: number): number {
  const parsed = pyInt(value);
  return Math.max(1, parsed === undefined ? fallback : parsed);
}

// MonitoringWorker._load_rules: the account's enabled rules of its workspace.
export function loadRules(raw: unknown, workspaceId: number | null): Json[] {
  let rules: unknown = raw;
  if (typeof raw === 'string') {
    try {
      rules = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(rules) || workspaceId === null) return [];
  const sameWorkspace = (value: unknown) => (typeof value === 'boolean' ? Number(value) : value) === workspaceId;
  return rules.filter((rule): rule is Json => typeof rule === 'object' && rule !== null && !Array.isArray(rule) && sameWorkspace((rule as Json).workspace_id) && (rule as Json).enabled !== false);
}

const isCriticalStopRule = (rule: Json): boolean => CRITICAL_ACTIONS.has((rule.action ? pyStr(rule.action) : '').toLowerCase());

// MonitoringWorker._account_sync_interval: the poll interval, or the
// account's most frequent rule's, so the facts stay as fresh as the rules' numbers.
export function accountSyncInterval(account: Pick<AccountRow, 'rules_enabled' | 'active_rules' | 'workspace_id'>, settings: Pick<Settings, 'defaultInterval' | 'criticalInterval'>): number {
  let interval = settings.defaultInterval;
  if (!account.rules_enabled) return interval;
  for (const rule of loadRules(account.active_rules, account.workspace_id)) {
    let ruleInterval = intervalMinutes(rule.check_interval, settings.defaultInterval);
    if (isCriticalStopRule(rule)) ruleInterval = Math.min(ruleInterval, settings.criticalInterval);
    interval = Math.min(interval, ruleInterval);
  }
  return interval;
}

// MonitoringWorker._connection_problem: why the account's Meta connection
// cannot be used now, as health arguments.
export function connectionProblem(account: AccountRow, connections: Map<number, ConnectionRow>, log: AccountSyncOptions['log']): HealthUpdate | null {
  const connection = account.meta_connection_id ? connections.get(account.meta_connection_id) : undefined;
  if (!connection) return null;
  if (account.workspace_id !== null && connection.workspace_id !== null && connection.workspace_id !== account.workspace_id) {
    log.warn(`Skipping account ${account.account_id}: Meta connection ${connection.id} workspace mismatch (${connection.workspace_id} != ${account.workspace_id})`);
    return { success: false, error: 'Meta connection workspace mismatch', cause: 'system', signals: { token_healthy: false } };
  }
  if (BROKEN_CONNECTION_STATES.has(connection.status)) {
    log.info(`Skipping account ${account.account_id}: Meta connection ${connection.id} is in ${connection.status} state`);
    return {
      success: false,
      error: `Meta connection requires user action: ${connection.status}`,
      cause: 'user',
      signals: { token_healthy: false, connection_status: connection.status },
    };
  }
  return null;
}

// Runs `work` for every item, at most `limit` at once, results in item order
// (asyncio.gather under a semaphore, return_exceptions=True).
// The error of an item a stopping cycle never started.
export const STOPPED = new Error('Worker is shutting down');

// Schedule states a cycle moved forward, with the times they had before.
export type ScheduleMarks = Array<[stateKey: string, previous: number]>;

// Puts schedule states back to where they were, so accounts a stopping cycle
// never reached are due again at once in the next worker.
export async function restoreSchedule(tx: EntityManager, marks: ScheduleMarks): Promise<void> {
  for (const [stateKey, previous] of marks) {
    await tx.query('UPDATE automation_schedule_states SET last_checked_at = $2, updated_at = now() WHERE state_key = $1', [stateKey, previous]);
  }
}

// `work` over every item, `limit` at a time; once `signal` is aborted no new
// item starts and the rest fail with STOPPED.
export async function gatherLimited<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>, signal?: AbortSignal): Promise<Array<{ value?: R; error?: unknown }>> {
  const results: Array<{ value?: R; error?: unknown }> = items.map(() => ({ error: STOPPED }));
  let next = 0;
  const lane = async () => {
    while (next < items.length && !signal?.aborted) {
      const index = next;
      next += 1;
      try {
        results[index] = { value: await work(items[index]) };
      } catch (error) {
        results[index] = { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

export class AccountSync {
  // (account_id, local date) -> clock time of the last closed-day refresh.
  // In memory on purpose: after a restart the days are simply re-read.
  private readonly closedDayRefreshed = new Map<string, number>();
  private readonly clock: () => number;
  private readonly keyring: MetaTokenKeyring;
  private cycleId = '';

  constructor(private readonly options: AccountSyncOptions) {
    this.clock = options.clock ?? (() => Date.now() / 1000);
    this.keyring = new MetaTokenKeyring(options.tokenEncryptionKey);
  }

  // MonitoringWorker._closed_day_due: the closed account-local day to re-read now.
  private closedDayDue(account: AccountRow, now: number): string | null {
    const today = periodDates(account.timezone_name, 'today', new Date(now * 1000))[0];
    for (const [back, interval] of CLOSED_DAY_REFRESH_SCHEDULE) {
      const day = daysBefore(today, back);
      const refreshedAt = this.closedDayRefreshed.get(`${account.account_id}\u0000${day}`);
      if (refreshedAt === undefined || now - refreshedAt >= interval) return day;
    }
    return null;
  }

  // The account sync's history entries (MonitoringWorker._persist_audit_event).
  private async audit(
    tx: EntityManager,
    account: AccountRow,
    event: { eventType: string; status: string; action: string; message: string; before?: unknown; after?: unknown; details?: Record<string, unknown> },
  ): Promise<void> {
    await persistMonitoringEvent(tx, this.options.log, this.cycleId, account, { ...event, category: 'ACCOUNT_HEALTH' });
  }

  private async setHealth(tx: EntityManager, account: AccountRow, update: HealthUpdate, emitTransitionEvent = true): Promise<void> {
    await setMonitoredHealth(tx, this.options.log, this.cycleId, account, update, emitTransitionEvent);
  }

  private async handleTokenError(tx: EntityManager, account: AccountRow, error: MetaTokenAuthError, connections: Map<number, ConnectionRow>): Promise<void> {
    await handleTokenError(tx, this.options.log, this.cycleId, account, error, new Set(connections.keys()));
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
      healthInterval: pick('account_health_interval_minutes', 15),
      maxConcurrentAccounts: pick('max_concurrent_accounts', 3),
    };
  }

  // MonitoringWorker._fetch_account_facts: one account's Meta reads.
  private async fetch(account: AccountRow, accessToken: string, accountInfoDue: boolean, now: number): Promise<Snapshot> {
    const { meta, log } = this.options;
    let accountInfo: Json | null = null;
    let currency = normalizeCurrency(account.currency);
    if (accountInfoDue || currency === 'UNKNOWN') {
      accountInfo = await meta.getAccountInfo(account.account_id, accessToken);
      const reported = get(accountInfo, 'currency');
      currency = normalizeCurrency(reported ? pyStr(reported) : currency);
    }
    if (currency === 'UNKNOWN') throw new Error('Meta did not return the ad account currency; automation is blocked');

    let hierarchicalFacts: Json[] = [];
    let hierarchyError: unknown = null;
    try {
      const reportedZone = accountInfo ? get(accountInfo, 'timezone_name') : undefined;
      const reportingTimezone = canonicalTimezoneName(reportedZone || account.timezone_name);
      hierarchicalFacts = await meta.getHierarchicalInsights(account.account_id, accessToken, {
        datePreset: 'today',
        currency,
        accountName: account.name ?? '',
        // The cycle's clock, not a fresh reading: one cycle, one day.
        reportingDate: periodDates(reportingTimezone, 'today', new Date(now * 1000))[0],
      });
    } catch (error) {
      log.warn(`Failed to collect hierarchical facts for ${account.account_id}: ${errorText(error)}`);
      hierarchyError = error;
    }

    let closedDayFacts: Json[] = [];
    const closedDay = hierarchyError === null && Array.isArray(hierarchicalFacts) ? this.closedDayDue(account, now) : null;
    if (closedDay) {
      try {
        const refreshed = await meta.getHierarchicalInsights(account.account_id, accessToken, {
          datePreset: 'today',
          currency,
          accountName: account.name ?? '',
          priority: 'normal',
          reportingDate: closedDay,
          includeIdleInventory: false,
        });
        if (Array.isArray(refreshed)) closedDayFacts = refreshed;
        this.closedDayRefreshed.set(`${account.account_id}\u0000${closedDay}`, now);
      } catch (error) {
        // Not a health problem: the day keeps its last totals and the next cycle tries again.
        log.warn(`Failed to refresh closed day ${closedDay} for ${account.account_id}: ${errorText(error)}`);
      }
    }
    return { account_info: accountInfo, currency, hierarchical_facts: hierarchicalFacts, hierarchy_error: hierarchyError, closed_day_facts: closedDayFacts };
  }

  // The facts of one account, each batch in a savepoint so a failure keeps the rest.
  private async storeFacts(tx: EntityManager, account: AccountRow, facts: Json[], stats: AccountSyncStats): Promise<void> {
    await tx.query('SAVEPOINT account_sync_facts');
    try {
      stats.facts_stored += await upsertEntityFacts(tx, account.workspace_id!, account.account_id, facts);
      await tx.query('RELEASE SAVEPOINT account_sync_facts');
    } catch (error) {
      await tx.query('ROLLBACK TO SAVEPOINT account_sync_facts');
      throw error;
    }
  }

  // What Meta's answer says about the account; false when it stops being monitored.
  private async applyAccountInfo(tx: EntityManager, account: AccountRow, info: Json, currency: string): Promise<boolean> {
    const changes: Record<string, unknown> = {};
    const reportedCurrency = get(info, 'currency');
    let newCurrency = normalizeCurrency(reportedCurrency ? pyStr(reportedCurrency) : '');
    const reportedZone = get(info, 'timezone_name');
    const zone = canonicalTimezoneName(reportedZone || account.timezone_name);
    if (zone !== account.timezone_name) {
      changes.timezone_name = zone;
      changes.last_day_start_date = '';
    }
    const statusCode = get(info, 'account_status', 1);
    const statusLabel = get(info, 'status_label', `Status #${pyStr(statusCode)}`);
    changes.account_status = statusCode;
    changes.status_label = statusLabel;
    // status_code != 1, as Python compares: 1, 1.0 and True are active.
    const active = statusCode === 1 || statusCode === true;
    if (active) newCurrency = currency;
    changes.currency = newCurrency;
    if (!active) changes.is_active = false;
    await this.updateAccount(tx, account, changes);
    if (active) return true;

    const label = pyStr(statusLabel);
    this.options.log.warn(`Account ${account.account_id} has issue: ${label}`);
    await this.audit(tx, account, {
      eventType: 'ACCOUNT_ISSUE',
      status: 'WARNING',
      action: 'DISABLE_MONITORING',
      message: label,
      before: { is_active: true, account_status: statusCode },
      after: { is_active: false, account_status: statusCode },
      details: { status_label: statusLabel },
    });
    await this.setHealth(
      tx,
      account,
      { success: false, error: `Account status: ${label}`, cause: 'user', signals: { token_healthy: true, account_active: false } },
      false,
    );
    return false;
  }

  // The ORM writes only the columns whose value changed.
  private async updateAccount(tx: EntityManager, account: AccountRow, changes: Record<string, unknown>): Promise<void> {
    const changed = Object.entries(changes).filter(([name, value]) => (account as unknown as Record<string, unknown>)[name] !== value);
    if (!changed.length) return;
    await tx.query(`UPDATE accounts SET ${changed.map(([name], index) => `${name} = $${index + 2}`).join(', ')} WHERE id = $1`, [
      account.id,
      ...changed.map(([, value]) => value),
    ]);
    Object.assign(account, Object.fromEntries(changed));
  }

  // `accountIds` limits it to those accounts (the parity test's).
  async run({ accountIds }: { accountIds?: string[] } = {}): Promise<AccountSyncStats> {
    const { db, log } = this.options;
    this.cycleId = randomUUID().replaceAll('-', '');
    const stats: AccountSyncStats = { cycle_id: this.cycleId, accounts_synced: 0, accounts_skipped: 0, facts_stored: 0, errors: [] };

    const prepared = await db.transaction(async (tx) => {
      const accounts = await rows<AccountRow>(
        tx,
        `SELECT * FROM accounts WHERE is_active = true${accountIds ? ' AND account_id = ANY($1)' : ''} ORDER BY id`,
        accountIds ? [accountIds] : [],
      );
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

      const due: Array<{ account: AccountRow; accessToken: string; accountInfoDue: boolean; now: number; marks: ScheduleMarks }> = [];
      for (const account of accounts) {
        const problem = connectionProblem(account, connections, log);
        if (problem) {
          await this.setHealth(tx, account, problem);
          continue;
        }
        const now = this.clock();
        const accountKey = `account:${account.account_id}:`;
        const healthKey = `health:${account.account_id}:`;
        const lastSync = states.get(accountKey) ?? 0;
        const lastHealth = states.get(healthKey) ?? 0;
        const syncDue = lastSync <= 0 || now - lastSync >= accountSyncInterval(account, settings) * 60;
        const healthDue = lastHealth <= 0 || now - lastHealth >= settings.healthInterval * 60;
        const currencyRefreshDue = normalizeCurrency(account.currency) === 'UNKNOWN';
        // A state not stored yet reads as never checked, so it is due here.
        if (!syncDue && !healthDue && !currencyRefreshDue) {
          stats.accounts_skipped += 1;
          continue;
        }
        await this.markChecked(tx, account, accountKey, now);
        const marks: ScheduleMarks = [[accountKey, lastSync]];
        if (healthDue || currencyRefreshDue) {
          await this.markChecked(tx, account, healthKey, now);
          marks.push([healthKey, lastHealth]);
        }
        stats.accounts_synced += 1;
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
          stats.errors.push(`Account ${account.account_id}: ${errorText(error)}`);
          await this.setHealth(tx, account, { success: false, error, signals: { token_healthy: false } });
          continue;
        }
        due.push({ account, accessToken, accountInfoDue: healthDue || currencyRefreshDue, now, marks });
      }
      return { due, connections, settings };
    });
    if (!prepared) return stats;

    const { signal } = this.options;
    const snapshots = await gatherLimited(prepared.due, prepared.settings.maxConcurrentAccounts, (item) => this.fetch(item.account, item.accessToken, item.accountInfoDue, item.now), signal);

    for (const [index, item] of prepared.due.entries()) {
      if (signal?.aborted) {
        // Shutting down: the accounts left are due again in the next worker.
        const left = prepared.due.slice(index);
        await db.transaction((tx) => restoreSchedule(tx, left.flatMap((rest) => rest.marks)));
        stats.accounts_synced -= left.length;
        log.info(`Account sync ${stats.cycle_id} stopped for shutdown; ${left.length} account(s) left for the next worker`);
        break;
      }
      const { account } = item;
      const { value: snapshot, error } = snapshots[index];
      try {
        await db.transaction(async (tx) => {
          if (error instanceof MetaTokenAuthError) {
            await this.handleTokenError(tx, account, error, prepared.connections);
            await this.setHealth(tx, account, { success: false, error, cause: 'user', signals: { token_healthy: false } }, false);
            return;
          }
          if (!snapshot) throw error;
          if (snapshot.account_info && Object.keys(snapshot.account_info).length) {
            if (!(await this.applyAccountInfo(tx, account, snapshot.account_info, snapshot.currency))) return;
          } else {
            await this.updateAccount(tx, account, { currency: snapshot.currency });
          }

          let hierarchyError = snapshot.hierarchy_error;
          if (snapshot.hierarchical_facts.length && account.workspace_id) {
            try {
              await this.storeFacts(tx, account, snapshot.hierarchical_facts, stats);
            } catch (storeError) {
              log.error(`Failed to upsert facts for ${account.account_id}: ${errorText(storeError)}`);
              hierarchyError = storeError;
            }
          }
          if (snapshot.closed_day_facts.length && account.workspace_id && hierarchyError === null) {
            try {
              // A savepoint: a failure must not undo today's facts.
              await this.storeFacts(tx, account, snapshot.closed_day_facts, stats);
            } catch (storeError) {
              log.warn(`Failed to store refreshed closed-day facts for ${account.account_id}: ${errorText(storeError)}`);
            }
          }

          if (hierarchyError !== null) {
            stats.errors.push(`Account ${account.account_id} hierarchy sync: ${errorText(hierarchyError)}`);
            await this.setHealth(tx, account, {
              success: false,
              error: `Meta hierarchy sync failed: ${errorText(hierarchyError)}`,
              signals: { token_healthy: true, account_active: true, meta_read_ok: true, hierarchy_sync_ok: false },
            });
          } else {
            await this.setHealth(tx, account, {
              success: true,
              signals: { token_healthy: true, account_active: true, meta_read_ok: true, hierarchy_sync_ok: true },
            });
          }
        });
      } catch (failure) {
        log.error(`Error syncing account ${account.account_id}: ${errorText(failure)}`);
        stats.errors.push(`Account ${account.account_id}: ${errorText(failure)}`);
        await db.transaction((tx) => this.setHealth(tx, account, { success: false, error: failure }));
      }
    }

    if (stats.errors.length) {
      log.warn(
        `Account sync ${stats.cycle_id} finished with ${stats.errors.length} error(s): ${stats.errors
          .slice(0, 5)
          .map((error) => Array.from(redactSecrets(error)).slice(0, 240).join(''))
          .join('; ')}`,
      );
    }
    return stats;
  }

  // The account's `account:` or `health:` schedule state at `checkedAt`.
  private async markChecked(tx: EntityManager, account: AccountRow, stateKey: string, checkedAt: number): Promise<void> {
    await tx.query(
      `INSERT INTO automation_schedule_states (state_key, owner_user_id, account_id, rule_key, last_checked_at, updated_at)
       VALUES ($1, $2, $3, '', $4, now())
       ON CONFLICT (state_key) DO UPDATE SET last_checked_at = EXCLUDED.last_checked_at, updated_at = now()`,
      [stateKey, account.owner_user_id, String(account.account_id), checkedAt],
    );
  }
}
