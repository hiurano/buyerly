import { spawn, spawnSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import Fastify from 'fastify';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseOver } from '../../src/database.ts';
import { AccountEntity } from '../../src/entities/index.ts';
import { MetaClient } from '../../src/meta/client.ts';
import { MetaTokenKeyring } from '../../src/meta/tokens.ts';
import { classifyHealthError, safeHealthMessage } from '../../src/worker/account-health.ts';
import { AccountSync, accountSyncInterval, intervalMinutes } from '../../src/worker/account-sync.ts';
import { normalizeFacts } from '../../src/worker/analytics-facts.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL } from '../support/target.ts';

// The data half of the monitoring cycle (scheduler/worker.py
// run_account_sync_cycle, services/analytics_store.py, account_health.py;
// #611 stage 4). The same accounts, the same Meta answers and the same clock
// go through the Python sync and through this one; the rows each leaves
// behind and the requests each sends must be the same.

const REPO = join(import.meta.dirname, '../../..');
const PYTHON = process.env.PYTHON ?? 'python3';
const log = Fastify({ logger: false }).log;
const KEY = 'CKOJW1eA4PLOe59rNqizKftdfj0lN17_CIFSpe7ihLw=';
// 15:00 UTC: 10:00 in New York, 17:00 in Kyiv, already the next day in Auckland.
const CLOCK = Date.parse('2026-11-06T15:00:00Z') / 1000;

const python = (script: string, input: unknown, env: Record<string, string> = {}) =>
  spawnSync(PYTHON, ['-c', script], { cwd: REPO, input: JSON.stringify(input), env: { ...process.env, PYTHONPATH: REPO, ...env } });

describe('pieces of the account sync', () => {
  it('classifies, rounds and schedules as Python does', () => {
    const errors = ['', 'Invalid OAuth access token', 'Meta API rate limit reached', 'boom: something__odd!!', 'Graph error with token=EAAB123secret in it', 'x'.repeat(300), 'Ünïcode ✓ failure'];
    const facts = [
      { entity_level: 'adset', entity_id: 7, spend: '0.125', impressions: '12.9', reach: null, frequency: 2.675, cpm: 0.375, cpc_link: '1.005', ctr: 'bad', daily_budget: 1e-3, status: '', raw_actions: 'x', date: '2026-11-06T00:00:00' },
      { entity_level: '', entity_name: 'N'.repeat(300), spend: -0.125, clicks: true, leads: '7', cost_per_lead: 0, ctr_link: null, currency: 'eur', status: 'ACTIVE' },
      { entity_level: 'campaign', entity_id: 'c1', spend: 1.115, frequency: 1.005, cpm: 10.555, cpc: 0.045, purchases: 2.9, cost_per_purchase: '3.335', effective_status: 'PAUSED' },
    ];
    const intervals = [null, '5', ' 7 ', '5.0', 5.7, 0, -3, true, [], {}, '1_0', 'x'];
    const accounts = [
      { rules_enabled: false, workspace_id: 1, active_rules: '[{"workspace_id": 1, "check_interval": 1}]' },
      { rules_enabled: true, workspace_id: 1, active_rules: '[{"workspace_id": 1, "check_interval": 7}, {"workspace_id": 2, "check_interval": 1}]' },
      { rules_enabled: true, workspace_id: 1, active_rules: '[{"workspace_id": 1, "check_interval": 30, "action": "PAUSE"}]' },
      { rules_enabled: true, workspace_id: 1, active_rules: '[{"workspace_id": 1, "check_interval": 1, "enabled": false}, {"workspace_id": 1.0, "check_interval": "3"}]' },
      { rules_enabled: true, workspace_id: null, active_rules: '[{"workspace_id": null, "check_interval": 1}]' },
      { rules_enabled: true, workspace_id: 1, active_rules: 'not json' },
    ];
    const now = new Date('2026-11-06T15:00:00Z');
    const ours = {
      errors: errors.map((error) => ({ ...classifyHealthError(error), message: safeHealthMessage(error) })),
      facts: normalizeFacts(3, 'act_9', facts, now).map(({ fetched_at: _, ...fact }) => fact),
      intervals: intervals.map((value) => intervalMinutes(value, 10)),
      accounts: accounts.map((account) => accountSyncInterval(account, { defaultInterval: 10, criticalInterval: 2 })),
    };
    const run = python(
      `
import json, sys
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest import mock
import services.analytics_store as store
from services.account_health import classify_health_error, safe_health_message
from scheduler.worker import MonitoringWorker
case = json.load(sys.stdin)
captured = []
class Captured(Exception):
    pass
class Insert:
    def __init__(self, model): pass
    def values(self, rows):
        captured.extend(rows)
        raise Captured
import asyncio
async def upsert():
    session = SimpleNamespace(bind=SimpleNamespace(dialect=SimpleNamespace(name="postgresql")))
    class Frozen(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 11, 6, 15, 0, tzinfo=timezone.utc)
    with mock.patch.object(store, "pg_insert", Insert), mock.patch.object(store, "datetime", Frozen):
        try:
            await store.AnalyticsFactService.upsert_entity_facts(session, 3, "act_9", case["facts"])
        except Captured:
            pass
asyncio.run(upsert())
worker = MonitoringWorker(meta_client=object())
print(json.dumps({
    "errors": [dict(zip(("code", "cause"), classify_health_error(e)), message=safe_health_message(e)) for e in case["errors"]],
    "facts": [{k: v for k, v in row.items() if k not in ("fetched_at", "updated_at")} for row in captured],
    "intervals": [MonitoringWorker._interval_minutes(v, 10) for v in case["intervals"]],
    "accounts": [worker._account_sync_interval(SimpleNamespace(**a), 10, 2) for a in case["accounts"]],
}))
`,
      { errors, facts, intervals, accounts },
    );
    if (run.error || run.status !== 0) {
      if (process.env.CI) throw new Error(`Python failed: ${run.stderr?.toString() ?? run.error?.message}`);
      return;
    }
    expect(ours).toEqual(JSON.parse(run.stdout.toString()));
  });
});

// A Graph API with fixed answers: the account, its inventory, and insights
// that depend on the account, level and day asked for. A token named
// "refused" is an expired one, "broken" fails every insights read.
interface Recorded {
  path: string;
  params: Record<string, string>;
}

interface MetaAccount {
  currency: string;
  timezone_name: string;
  account_status: number;
}

function graphApi(): { server: Server; requests: Recorded[]; accounts: Record<string, MetaAccount>; url: () => string } {
  const requests: Recorded[] = [];
  // Meta's own view of an account, when it differs from the default.
  const accounts: Record<string, MetaAccount> = {};
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://graph');
    const params = Object.fromEntries(url.searchParams);
    const token = params.access_token ?? '';
    const { access_token: _token, appsecret_proof: _proof, ...kept } = params;
    requests.push({ path: url.pathname, params: kept });
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (token === 'refused') {
      send(400, { error: { message: 'Error validating access token: Session has expired', type: 'OAuthException', code: 190, error_subcode: 463, fbtrace_id: 'trace-1' } });
      return;
    }
    const [, , account, edge] = url.pathname.split('/');
    const suffix = Number(String(account).slice(-1));
    if (!edge) {
      send(200, { id: account, name: `Meta ${account}`, disable_reason: 0, ...(accounts[account] ?? { currency: 'USD', timezone_name: 'America/New_York', account_status: 1 }) });
      return;
    }
    if (edge === 'insights' && token === 'broken') {
      send(400, { error: { message: 'Invalid parameter', type: 'OAuthException', code: 100, error_subcode: 1487534, fbtrace_id: 'trace-2' } });
      return;
    }
    const range = params.time_range ? (JSON.parse(params.time_range) as { since: string }).since : params.date_preset ?? '';
    const day = Number(range.slice(-2)) || 1;
    const base = suffix * 10 + day;
    const metrics = (scale: number) => ({
      spend: ((base * scale) / 8).toFixed(3),
      impressions: String(base * scale * 101),
      reach: String(base * scale * 77),
      frequency: '1.3125',
      cpm: '12.345',
      clicks: String(base * scale),
      unique_clicks: String(base * scale - 1),
      inline_link_clicks: String(Math.max(0, base * scale - 3)),
      outbound_clicks: [{ action_type: 'outbound_click', value: String(scale) }],
      actions: [
        { action_type: 'lead', value: String(scale + 1) },
        { action_type: 'complete_registration', value: String(scale) },
        { action_type: 'landing_page_view', value: String(scale * 3) },
      ],
    });
    const campaign = (n: number) => ({ id: `${account}_c${n}`, name: `Campaign ${n}`, status: n === 2 ? 'PAUSED' : 'ACTIVE', effective_status: n === 2 ? 'PAUSED' : 'ACTIVE', daily_budget: String(1000 * n + 5) });
    const adset = (n: number) => ({ id: `${account}_s${n}`, name: `Ad set ${n}`, campaign_id: `${account}_c${n}`, status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: String(2500 + n) });
    const ad = (n: number) => ({ id: `${account}_a${n}`, name: `Ad ${n}`, campaign_id: `${account}_c${n}`, adset_id: `${account}_s${n}`, status: 'ACTIVE', effective_status: 'ACTIVE' });
    const data: Record<string, unknown[]> = {
      campaigns: [campaign(1), campaign(2)],
      adsets: [adset(1), adset(2)],
      ads: [ad(1), ad(2)],
    };
    if (edge === 'insights') {
      const level = params.level;
      if (!level) send(200, { data: [metrics(3)] });
      else if (level === 'campaign') send(200, { data: [{ campaign_id: `${account}_c1`, campaign_name: 'Campaign 1', ...metrics(2) }, { campaign_id: `${account}_c9`, campaign_name: 'Gone', ...metrics(1) }] });
      else if (level === 'adset') send(200, { data: [{ campaign_id: `${account}_c1`, adset_id: `${account}_s1`, adset_name: 'Ad set 1', ...metrics(2) }] });
      else send(200, { data: [{ campaign_id: `${account}_c1`, adset_id: `${account}_s1`, ad_id: `${account}_a1`, ad_name: 'Ad 1', ...metrics(1) }] });
      return;
    }
    send(200, { data: data[edge] ?? [] });
  });
  return { server, requests, accounts, url: () => `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

describe.skipIf(!DATABASE_URL)('the account sync on the database', () => {
  let dataSource: DataSource;
  let graph: ReturnType<typeof graphApi>;

  beforeAll(async () => {
    dataSource = await testDatabase();
    graph = graphApi();
    await new Promise<void>((resolve) => graph.server.listen(0, '127.0.0.1', resolve));
  });
  afterAll(async () => {
    await dataSource?.destroy();
    await new Promise((resolve) => graph?.server.close(resolve));
  });

  it('leaves the same rows and sends the same requests as the Python sync', async () => {
    const owner = await createUser(dataSource);
    const workspace = await createWorkspace(dataSource, owner);
    const prefix = `act_${String(Date.now()).slice(-9)}`;
    const ids = (n: number) => `${prefix}${n}`;
    const keyring = new MetaTokenKeyring(KEY);
    type Row = Record<string, unknown>;
    const select = <T = Row>(sql: string, parameters: unknown[] = []): Promise<T[]> => dataSource.query<T[]>(sql, parameters);
    const [connection] = await select<{ id: number }>(
      `INSERT INTO meta_connections (workspace_id, owner_user_id, provider_user_id, provider_user_name, access_token_encrypted, granted_scopes, status, last_error, connected_at, created_at, updated_at)
       VALUES ($1, $2, 'u1', 'Person', $3, '[]', 'active', '', now(), now(), now()) RETURNING id`,
      [workspace.id, owner.id, keyring.encrypt('refused')],
    );
    const [broken] = await select<{ id: number }>(
      `INSERT INTO meta_connections (workspace_id, owner_user_id, provider_user_id, provider_user_name, access_token_encrypted, granted_scopes, status, last_error, connected_at, created_at, updated_at)
       VALUES ($1, $2, 'u2', 'Person', $3, '[]', 'needs_reconnect', '', now(), now(), now()) RETURNING id`,
      [workspace.id, owner.id, keyring.encrypt('ok')],
    );
    // Meta's view: account 2 is in EUR and Kyiv, account 3 is unsettled.
    graph.accounts[ids(2)] = { currency: 'EUR', timezone_name: 'Europe/Kiev', account_status: 1 };
    graph.accounts[ids(3)] = { currency: 'USD', timezone_name: 'America/New_York', account_status: 3 };
    graph.accounts[ids(8)] = { currency: 'NZD', timezone_name: 'Pacific/Auckland', account_status: 1 };

    const fixtures = [
      // 1: healthy, nothing stored yet.
      { n: 1, token: 'ok' },
      // 2: currency unknown and a time zone Meta reports differently.
      { n: 2, token: 'ok', currency: 'UNKNOWN', timezone_name: 'UTC', last_day_start_date: '2026-11-06' },
      // 3: Meta says the account cannot run.
      { n: 3, token: 'ok', owner: null },
      // 4: the token behind its connection is refused.
      { n: 4, connection: connection.id },
      // 5: its connection waits for a reconnect, after being healthy.
      { n: 5, connection: broken.id, health: 'healthy' },
      // 6: insights fail, after being healthy.
      { n: 6, token: 'broken', health: 'healthy' },
      // 7: synced a moment ago, so not due.
      { n: 7, token: 'ok', checked: CLOCK - 30 },
      // 8: critical before and fine now; health not due, sync due by its rule.
      { n: 8, token: 'ok', health: 'critical', checked: CLOCK - 120, healthChecked: CLOCK - 60, rules: [{ workspace_id: workspace.id, check_interval: 1 }], timezone_name: 'Pacific/Auckland', currency: 'NZD' },
      // 9: no token at all.
      { n: 9 },
    ];
    const accountIds = fixtures.map(({ n }) => ids(n));

    const reset = async () => {
      await dataSource.query('DELETE FROM analytics_entity_daily_facts WHERE account_id = ANY($1)', [accountIds]);
      await dataSource.query('DELETE FROM automation_schedule_states WHERE account_id = ANY($1)', [accountIds]);
      await dataSource.query('DELETE FROM audit_events WHERE account_id = ANY($1)', [accountIds]);
      await dataSource.query('DELETE FROM account_health WHERE account_pk IN (SELECT id FROM accounts WHERE account_id = ANY($1))', [accountIds]);
      await dataSource.query('DELETE FROM accounts WHERE account_id = ANY($1)', [accountIds]);
      await dataSource.query("UPDATE meta_connections SET status = CASE WHEN id = $1 THEN 'active' ELSE 'needs_reconnect' END, last_error = '' WHERE id = ANY($2)", [connection.id, [connection.id, broken.id]]);
      for (const fixture of fixtures) {
        const repository = dataSource.getRepository(AccountEntity);
        const account = await repository.save(repository.create({
          accountId: ids(fixture.n), name: `Account ${fixture.n}`, workspaceId: workspace.id, ownerUserId: fixture.owner === null ? null : owner.id,
          accessToken: fixture.token ?? null, accessTokenEncrypted: null, metaConnectionId: fixture.connection ?? null, currency: fixture.currency ?? 'USD',
          timezoneName: fixture.timezone_name ?? 'America/New_York', lastDayStartDate: fixture.last_day_start_date ?? '2026-11-06', statusLabel: 'Active',
          rulesEnabled: Boolean(fixture.rules), activeRules: JSON.stringify(fixture.rules ?? []), leadUserId: null, targetCostPerResult: null,
        }));
        if (fixture.health) {
          await dataSource.query(
            `INSERT INTO account_health (workspace_id, account_pk, status, cause, signals, consecutive_failures, last_checked_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, '{"token_healthy": true, "data_fresh_at": "2026-11-05T10:00:00+00:00"}', $5, now(), now(), now())`,
            [workspace.id, account.id, fixture.health, fixture.health === 'healthy' ? 'none' : 'meta', fixture.health === 'healthy' ? 0 : 3],
          );
        }
        if (fixture.checked) {
          for (const [scope, at] of [['account', fixture.checked], ['health', fixture.healthChecked ?? fixture.checked]] as const) {
            await dataSource.query(
              "INSERT INTO automation_schedule_states (state_key, owner_user_id, account_id, rule_key, last_checked_at, updated_at) VALUES ($1, $2, $3, '', $4, now())",
              [`${scope}:${ids(fixture.n)}:`, owner.id, ids(fixture.n), at],
            );
          }
        }
      }
      graph.requests.length = 0;
    };

    const snapshot = async () => {
      const strip = (rows: Row[], drop: string[]) =>
        rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !drop.includes(key))));
      const facts = await select('SELECT * FROM analytics_entity_daily_facts WHERE account_id = ANY($1) ORDER BY account_id, entity_level, entity_id, date', [accountIds]);
      const health = await select<Row & { signals: Row }>(
        `SELECT a.account_id, h.status, h.cause, h.signals, h.consecutive_failures, h.last_error_code, h.last_error_message,
                h.last_success_at IS NOT NULL AS succeeded, h.last_error_at IS NOT NULL AS failed, h.last_transition_at IS NOT NULL AS transitioned
         FROM account_health h JOIN accounts a ON a.id = h.account_pk WHERE a.account_id = ANY($1) ORDER BY a.account_id`,
        [accountIds],
      );
      for (const row of health) {
        const fresh = row.signals.data_fresh_at;
        row.signals = { ...row.signals, data_fresh_at: typeof fresh === 'string' && fresh !== '2026-11-05T10:00:00+00:00' ? /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{6})?\+00:00$/.test(fresh) : fresh };
      }
      return {
        accounts: await select<{ account_id: string }>(
          'SELECT account_id, owner_user_id, currency, timezone_name, last_day_start_date, account_status, status_label, is_active FROM accounts WHERE account_id = ANY($1) ORDER BY account_id',
          [accountIds],
        ),
        facts: strip(facts, ['id', 'fetched_at', 'updated_at']),
        health,
        audit: await select<{ event_type: string }>(
          `SELECT account_id, account_name, owner_user_id, actor_type, actor_id, category, event_type, status, action, message, before_state, after_state, details,
                  entity_level, entity_id, adset_id, rule_id, rule_name, duration_ms
           FROM audit_events WHERE account_id = ANY($1) ORDER BY account_id, event_type`,
          [accountIds],
        ),
        states: await select('SELECT state_key, owner_user_id, account_id, rule_key, last_checked_at FROM automation_schedule_states WHERE account_id = ANY($1) ORDER BY state_key', [accountIds]),
        connections: await select('SELECT id, status, last_error FROM meta_connections WHERE id = ANY($1) ORDER BY id', [[connection.id, broken.id]]),
        requests: [...graph.requests].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      };
    };

    await reset();
    const pythonDatabase = DATABASE_URL.replace(/^postgres(ql)?:/, 'postgresql+asyncpg:');
    // Not spawnSync: the Graph API answering Python runs in this process.
    const run = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
      const child = spawn(PYTHON, [join(REPO, 'server/test/worker/account_sync_parity.py')], {
        cwd: REPO,
        env: { ...process.env, PYTHONPATH: REPO, DATABASE_URL: pythonDatabase, META_GRAPH_BASE_URL: graph.url(), META_APP_SECRET: 'parity-secret', META_TOKEN_ENCRYPTION_KEY: KEY },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      child.on('error', (error) => resolve({ status: null, stdout, stderr: String(error) }));
      child.on('close', (status) => resolve({ status, stdout, stderr }));
      child.stdin.end(JSON.stringify({ clock: CLOCK, account_ids: accountIds }));
    });
    if (run.status !== 0) {
      if (process.env.CI) throw new Error(`Python failed: ${run.stderr}`);
      return;
    }
    const pythonStats = JSON.parse(run.stdout) as Record<string, unknown>;
    const pythonRows = await snapshot();

    await reset();
    const sync = new AccountSync({
      db: databaseOver(dataSource),
      log,
      tokenEncryptionKey: KEY,
      clock: () => CLOCK,
      meta: new MetaClient({ graphVersion: 'v26.0', baseUrl: graph.url(), appSecret: 'parity-secret', sleep: async () => undefined }),
    });
    const stats = await sync.run({ accountIds });
    const ours = await snapshot();

    const { cycle_id: _python, ...pythonCounts } = pythonStats;
    const { cycle_id: _ours, ...ourCounts } = stats;
    expect(ourCounts).toEqual(pythonCounts);
    expect(ours.accounts).toEqual(pythonRows.accounts);
    expect(ours.health).toEqual(pythonRows.health);
    expect(ours.audit).toEqual(pythonRows.audit);
    expect(ours.states).toEqual(pythonRows.states);
    expect(ours.connections).toEqual(pythonRows.connections);
    expect(ours.facts).toEqual(pythonRows.facts);
    expect(ours.requests).toEqual(pythonRows.requests);

    // The cases reach what they are for.
    expect(stats.accounts_skipped).toBe(1);
    expect(ours.facts.length).toBeGreaterThan(20);
    expect(new Set(ours.audit.map((event) => event.event_type))).toEqual(
      new Set(['ACCOUNT_ISSUE', 'TOKEN_EXPIRED', 'ACCOUNT_HEALTH_ALERT', 'ACCOUNT_HEALTH_RECOVERED']),
    );
    expect(ours.accounts.find((row) => row.account_id === ids(2))).toMatchObject({ currency: 'EUR', timezone_name: 'Europe/Kyiv', last_day_start_date: '' });

    // A second run of the same sync: everything has just been read.
    const again = await sync.run({ accountIds });
    expect(again.accounts_synced).toBe(0);
  }, 60_000);
});
