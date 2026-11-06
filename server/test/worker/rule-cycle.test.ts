import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import Fastify from 'fastify';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseOver } from '../../src/database.ts';
import { AccountEntity } from '../../src/entities/index.ts';
import { MetaClient } from '../../src/meta/client.ts';
import { PostgresInventoryCache } from '../../src/meta/inventory-cache.ts';
import { campaignEntities, entityWindows, RuleCycle, windowsByLevel } from '../../src/worker/rule-cycle.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL } from '../support/target.ts';

// The rules half of the monitoring cycle (scheduler/worker.py run_rule_cycle;
// #611 stage 4). The same accounts, rules, history and Meta go through
// several Python rule cycles and then through as many TypeScript ones, at the
// same clocks; the rows each leaves behind and the requests each sends to
// Meta (reads and writes) must be the same. The Meta here keeps state: a
// status or budget written is what the next read returns.

const REPO = join(import.meta.dirname, '../../..');
const PYTHON = process.env.PYTHON ?? 'python3';
const log = Fastify({ logger: false }).log;
const KEY = 'CKOJW1eA4PLOe59rNqizKftdfj0lN17_CIFSpe7ihLw=';
const CLOCK = Date.parse('2026-11-06T15:00:00Z') / 1000;
// Seven cycles two minutes apart: long enough for a stop to be confirmed
// (ten minutes by default) and for cooldowns to start counting.
const CLOCKS = Array.from({ length: 7 }, (_, index) => CLOCK + index * 120);

describe('pieces of the rule cycle', () => {
  it('reads the windows each level needs and rolls ad sets up into campaigns', () => {
    expect(
      Object.fromEntries(
        Object.entries(
          windowsByLevel([
            { level: 'campaign', conditions: [{ time_window: 'lifetime' }, { time_window: 'today' }, { time_window: null }] },
            { conditions: [{ time_window: 'last_7d' }, 'x'] },
            { level: 'bogus', conditions: [{ time_window: 'yesterday' }] },
            { level: 'ad', conditions: [{ time_window: 'last_3d' }] },
            'not a rule',
          ]),
        ).map(([level, windows]) => [level, [...windows].sort()]),
      ),
    ).toEqual({ adset: ['last_7d', 'yesterday'], campaign: ['lifetime'], ad: ['last_3d'] });

    expect(entityWindows('s1', { today: { s1: { spend: 1 } }, yesterday: {}, lifetime: {} })).toEqual({ today: { spend: 1 }, yesterday: {} });

    const { entities, windows } = campaignEntities(
      [
        { adset_id: 's1', campaign_id: 'c1', spend: 1.005, leads: 2, clicks: 3, impressions: 300 },
        { adset_id: 's2', campaign_id: 'c1', spend: '2', leads: '1', clicks: 0, impressions: 0 },
        { adset_id: 's3', campaign_id: '', spend: 9 },
      ],
      [{ campaign_id: 'c1', campaign_name: '', status: 'PAUSED' }, { campaign_id: 'c2', campaign_name: 'Two', status: 'ACTIVE', effective_status: 'CAMPAIGN_PAUSED' }],
      { yesterday: { s1: { spend: 4, clicks: 1, impressions: 3 }, s9: { campaign_id: 'c2', spend: 1 } } },
      { c2: { spend: 7, leads: 1 } },
    );
    expect(entities).toEqual([
      { spend: 3.005, leads: 3, registrations: 0, purchases: 0, clicks: 3, link_clicks: 0, impressions: 300, cpc: 1, ctr: 1, entity_level: 'campaign', entity_id: 'c1', entity_name: 'Campaign c1', campaign_id: 'c1', status: 'PAUSED', effective_status: 'PAUSED' },
      { spend: 0, leads: 0, registrations: 0, purchases: 0, clicks: 0, link_clicks: 0, impressions: 0, cpc: 0, ctr: 0, entity_level: 'campaign', entity_id: 'c2', entity_name: 'Two', campaign_id: 'c2', status: 'ACTIVE', effective_status: 'CAMPAIGN_PAUSED' },
    ]);
    expect(windows).toEqual({
      c1: { yesterday: { spend: 4, leads: 0, registrations: 0, purchases: 0, clicks: 1, link_clicks: 0, impressions: 3, cpc: 4, ctr: 33.33 }, lifetime: { spend: 0, leads: 0, registrations: 0, purchases: 0, clicks: 0, link_clicks: 0, impressions: 0, cpc: 0, ctr: 0 } },
      c2: { yesterday: { spend: 1, leads: 0, registrations: 0, purchases: 0, clicks: 0, link_clicks: 0, impressions: 0, cpc: 0, ctr: 0 }, lifetime: { spend: 7, leads: 1, registrations: 0, purchases: 0, clicks: 0, link_clicks: 0, impressions: 0, cpc: 0, ctr: 0 } },
    });
  });
});

// ---------------------------------------------------------------------------
// A Graph API with state.

interface FakeEntity {
  id: string;
  account: string;
  level: 'campaign' | 'adset' | 'ad';
  name: string;
  status: string;
  daily_budget?: string;
  campaign_id: string;
  adset_id?: string;
  // Spend and leads by date_preset ("today", "yesterday", "last_7d", "maximum").
  spend: Record<string, number>;
  leads: number;
  // How a write goes: applied, applied although Meta answers an error, or refused.
  writes?: 'ok' | 'landed' | 'reject';
}

interface Recorded {
  method: string;
  path: string;
  params: Record<string, string>;
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function graphApi(): { server: Server; requests: Recorded[]; entities: Map<string, FakeEntity>; seed: (items: FakeEntity[]) => void; url: () => string } {
  const requests: Recorded[] = [];
  const entities = new Map<string, FakeEntity>();
  let seeded: FakeEntity[] = [];
  const seed = (items: FakeEntity[]) => {
    seeded = items;
    entities.clear();
    for (const item of seeded) entities.set(item.id, structuredClone(item));
    requests.length = 0;
  };
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://graph');
      const params: Record<string, string> = Object.fromEntries(url.searchParams);
      const text = await readBody(request);
      if (text) for (const [key, value] of new URLSearchParams(text)) params[key] = value;
      const token = params.access_token ?? '';
      const { access_token: _token, appsecret_proof: _proof, ...kept } = params;
      const method = request.method ?? 'GET';
      requests.push({ method, path: url.pathname.replace(/^\/v\d+\.\d+\//, '/'), params: kept });
      const send = (status: number, body: unknown) => {
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(body));
      };
      const tokenRefused = () => send(400, { error: { message: 'Error validating access token: Session has expired', type: 'OAuthException', code: 190, error_subcode: 463, fbtrace_id: 'trace-1' } });
      const invalid = (message: string) => send(400, { error: { message, type: 'OAuthException', code: 100, error_subcode: 1487534, fbtrace_id: 'trace-2' } });
      if (token === 'refused') return tokenRefused();
      const [, , first, edge] = url.pathname.split('/');

      if (method === 'POST') {
        if (token === 'writes-refused') return tokenRefused();
        const entity = entities.get(first);
        if (!entity) return invalid('Unknown object');
        if (entity.writes === 'reject') return invalid('Ad set is locked');
        if (params.status) entity.status = params.status;
        if (params.daily_budget) entity.daily_budget = params.daily_budget;
        if (entity.writes === 'landed') return invalid('Service temporarily unavailable');
        return send(200, { success: true });
      }

      if (!edge) {
        const entity = entities.get(first);
        if (!entity) return invalid('Unknown object');
        return send(200, { id: entity.id, account_id: entity.account.replace(/^act_/, ''), name: entity.name, status: entity.status, effective_status: entity.status, daily_budget: entity.daily_budget });
      }

      const account = first;
      const own = [...entities.values()].filter((entity) => entity.account === account);
      if (edge === 'insights') {
        const preset = params.date_preset ?? 'today';
        if (token === 'broken-windows' && preset !== 'today') return invalid('Invalid parameter');
        const level = params.level;
        const metrics = (spend: number, leads: number) => ({
          spend: spend.toFixed(2),
          impressions: String(Math.round(spend * 100)),
          clicks: String(Math.round(spend * 2)),
          inline_link_clicks: String(Math.round(spend)),
          cpc: spend ? '0.5' : '0',
          ctr: spend ? '2' : '0',
          actions: leads ? [{ action_type: 'lead', value: String(leads) }] : [],
        });
        const rowsOf = (items: FakeEntity[]) =>
          items
            .map((entity) => ({ entity, spend: entity.spend[preset] ?? 0, leads: preset === 'today' ? entity.leads : 0 }))
            .filter(({ spend, leads }) => spend > 0 || leads > 0);
        if (level === 'campaign') {
          return send(200, { data: rowsOf(own.filter((entity) => entity.level === 'campaign')).map(({ entity, spend, leads }) => ({ campaign_id: entity.id, campaign_name: entity.name, ...metrics(spend, leads) })) });
        }
        if (level === 'adset') {
          return send(200, { data: rowsOf(own.filter((entity) => entity.level === 'adset')).map(({ entity, spend, leads }) => ({ campaign_id: entity.campaign_id, adset_id: entity.id, adset_name: entity.name, ...metrics(spend, leads) })) });
        }
        if (level === 'ad') {
          return send(200, { data: rowsOf(own.filter((entity) => entity.level === 'ad')).map(({ entity, spend, leads }) => ({ campaign_id: entity.campaign_id, adset_id: entity.adset_id, ad_id: entity.id, ad_name: entity.name, ...metrics(spend, leads) })) });
        }
        return send(200, { data: [] });
      }
      const levelOf: Record<string, FakeEntity['level']> = { campaigns: 'campaign', adsets: 'adset', ads: 'ad' };
      if (!levelOf[edge]) return send(200, { data: [] });
      return send(200, {
        data: own
          .filter((entity) => entity.level === levelOf[edge])
          .map((entity) => ({ id: entity.id, name: entity.name, status: entity.status, effective_status: entity.status, campaign_id: entity.campaign_id, adset_id: entity.adset_id, daily_budget: entity.daily_budget })),
      });
    })();
  });
  return { server, requests, entities, seed, url: () => `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

describe.skipIf(!DATABASE_URL)('the rule cycle on the database', () => {
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

  it('acts, records and leaves the same rows as the Python rule cycle', async () => {
    const owner = await createUser(dataSource);
    const workspace = await createWorkspace(dataSource, owner);
    const prefix = `act_${String(Date.now()).slice(-9)}`;
    const ids = (n: number) => `${prefix}${n}`;
    const base = Number(String(Date.now()).slice(-6)) * 10;
    const rule = (n: number, fields: Record<string, unknown>) => ({
      preset_id: base + n,
      workspace_id: workspace.id,
      name: `Rule ${n}`,
      logic: 'and',
      check_interval: 1,
      cooldown_minutes: 0,
      ...fields,
    });
    const when = (metric: string, value: number, time_window = 'today') => ({ metric, operator: 'gte', value, time_window });
    type Row = Record<string, unknown>;
    const select = <T = Row>(sql: string, parameters: unknown[] = []): Promise<T[]> => dataSource.query<T[]>(sql, parameters);

    const stopRule = rule(1, { action: 'turn_off', conditions: [when('spend', 20)] });
    const turnOn = rule(2, { action: 'turn_on', conditions: [when('leads', 1)] });
    const raise = rule(3, { action: 'increase_budget', budget_change_percent: 20, budget_max_daily: 100, cooldown_minutes: 60, conditions: [when('leads', 1)] });
    const alert = rule(4, { action: 'notify_only', cooldown_minutes: 30, conditions: [when('impressions', 1)] });
    const campaignStop = rule(5, { level: 'campaign', action: 'turn_off', conditions: [when('spend', 100, 'lifetime')] });
    const adAlert = rule(6, { level: 'ad', action: 'notify_only', conditions: [when('clicks', 1, 'yesterday')] });
    const lower = rule(7, { action: 'decrease_budget', budget_change_percent: 50, conditions: [when('spend', 1)] });
    const weekly = rule(8, { action: 'turn_off', conditions: [when('spend', 1, 'last_7d')] });

    const adset = (account: number, n: number, fields: Partial<FakeEntity>): FakeEntity => ({
      id: `${ids(account)}_s${n}`,
      account: ids(account),
      level: 'adset',
      name: `Ad set ${account}.${n}`,
      status: 'ACTIVE',
      daily_budget: '2500',
      campaign_id: `${ids(account)}_c1`,
      spend: {},
      leads: 0,
      writes: 'ok',
      ...fields,
    });
    const campaign = (account: number, n: number, fields: Partial<FakeEntity>): FakeEntity => ({
      id: `${ids(account)}_c${n}`,
      account: ids(account),
      level: 'campaign',
      name: `Campaign ${account}.${n}`,
      status: 'ACTIVE',
      campaign_id: `${ids(account)}_c${n}`,
      spend: {},
      leads: 0,
      writes: 'ok',
      ...fields,
    });
    const meta: FakeEntity[] = [
      // 1: stops (after confirming), a stop Meta reports failed but applied,
      // one Meta refuses, a budget raise and its cooldown, a raise already
      // pending from a restart, a turn-on, alerts.
      campaign(1, 1, {}),
      adset(1, 1, { spend: { today: 50 } }),
      adset(1, 2, { spend: { today: 5 }, leads: 3, daily_budget: '2000' }),
      adset(1, 3, { spend: { today: 6 }, leads: 2, daily_budget: '3000' }),
      adset(1, 4, { spend: { today: 30 }, writes: 'landed' }),
      adset(1, 5, { spend: { today: 40 }, writes: 'reject' }),
      adset(1, 6, { status: 'PAUSED', leads: 5, daily_budget: '1500' }),
      // 2: a campaign stopped on its lifetime, an ad alert on yesterday, budgets halved.
      campaign(2, 1, { spend: { today: 3, maximum: 150 } }),
      campaign(2, 2, { spend: { today: 1, maximum: 10 } }),
      adset(2, 1, { spend: { today: 3 }, daily_budget: '1000' }),
      adset(2, 2, { campaign_id: `${ids(2)}_c2`, spend: { today: 1 }, daily_budget: '300' }),
      { id: `${ids(2)}_a1`, account: ids(2), level: 'ad', name: 'Ad 2.1', status: 'ACTIVE', campaign_id: `${ids(2)}_c1`, adset_id: `${ids(2)}_s1`, spend: { today: 3, yesterday: 4 }, leads: 0 },
      // 3: Meta refuses the token on the first write.
      adset(3, 1, { leads: 2, spend: { today: 2 } }),
      // 7: undone today, turned back on in Buyerly, turned back on in Meta.
      adset(7, 1, { spend: { today: 50 } }),
      adset(7, 2, { spend: { today: 50 } }),
      adset(7, 3, { spend: { today: 50 } }),
      // 8: windows other than today fail.
      adset(8, 1, { spend: { today: 50, last_7d: 50 } }),
    ];

    const fixtures = [
      { n: 1, token: 'ok', rules: [stopRule, turnOn, raise, alert] },
      { n: 2, token: 'ok', currency: 'EUR', timezone_name: 'Europe/Kyiv', rules: [campaignStop, adAlert, lower] },
      { n: 3, token: 'writes-refused', rules: [raise] },
      // 4: the token is refused on the first read.
      { n: 4, token: 'refused', rules: [stopRule] },
      // 5: the currency is not known yet; 6: rules are off.
      { n: 5, token: 'ok', currency: 'UNKNOWN', rules: [stopRule] },
      { n: 6, token: 'ok', rules: [stopRule], rulesEnabled: false },
      { n: 7, token: 'ok', timezone_name: 'UTC', rules: [stopRule] },
      { n: 8, token: 'broken-windows', rules: [weekly] },
    ];
    const accountIds = fixtures.map(({ n }) => ids(n));
    const adsetIds = meta.filter((entity) => entity.level === 'adset').map((entity) => entity.id);

    const reset = async () => {
      for (const table of ['rule_execution_states', 'rule_entity_states', 'audit_events', 'automation_schedule_states', 'adset_inventory_cache']) {
        await dataSource.query(`DELETE FROM ${table} WHERE account_id = ANY($1)`, [accountIds]);
      }
      await dataSource.query('DELETE FROM stopped_adsets WHERE adset_id = ANY($1)', [adsetIds]);
      await dataSource.query('DELETE FROM account_health WHERE account_pk IN (SELECT id FROM accounts WHERE account_id = ANY($1))', [accountIds]);
      await dataSource.query('DELETE FROM accounts WHERE account_id = ANY($1)', [accountIds]);
      const repository = dataSource.getRepository(AccountEntity);
      for (const fixture of fixtures) {
        await repository.save(
          repository.create({
            accountId: ids(fixture.n), name: `Account ${fixture.n}`, workspaceId: workspace.id, ownerUserId: owner.id,
            accessToken: fixture.token, accessTokenEncrypted: null, metaConnectionId: null, currency: fixture.currency ?? 'USD',
            timezoneName: fixture.timezone_name ?? 'America/New_York', lastDayStartDate: '2026-11-06', statusLabel: 'Active',
            rulesEnabled: fixture.rulesEnabled ?? true, activeRules: JSON.stringify(fixture.rules), leadUserId: null, targetCostPerResult: null,
          }),
        );
      }
      // Account 1, ad set 3: a raise claimed just before a restart, which Meta holds.
      const raiseKey = `rule-action:${sha256([ids(1), `${ids(1)}_s3`, String(raise.preset_id), 'INCREASE_BUDGET'].join(':'))}`;
      await dataSource.query(
        `INSERT INTO rule_execution_states (execution_key, owner_user_id, account_id, adset_id, entity_level, entity_id, rule_key, action, status, correlation_id,
           last_attempt_at, last_success_at, before_state, after_state, details, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'adset', $4, $5, 'INCREASE_BUDGET', 'PENDING', 'before', $6, NULL, '{"daily_budget": 25.0}', '{"daily_budget": 30.0}', '{}', now(), now())`,
        [raiseKey, owner.id, ids(1), `${ids(1)}_s3`, String(raise.preset_id), CLOCK - 60],
      );
      // Account 7's history today (its day is UTC).
      const event = async (entity: string, eventType: string, category: string, actorType: string, at: number, reverts: number | null = null) => {
        const [row] = await select<{ id: number }>(
          `INSERT INTO audit_events (workspace_id, owner_user_id, actor_type, actor_id, category, event_type, status, account_id, account_name, adset_id, adset_name,
             entity_level, entity_id, entity_name, rule_id, rule_name, action, message, before_state, after_state, details, correlation_id, duration_ms, reverts_event_id, created_at)
           VALUES ($1, $2, $3, 'seed', $4, $5, 'SUCCESS', $6, 'Account 7', $7, '', 'adset', $7, '', NULL, '', $5, '', '{}', '{}', '{}', '', 0, $8, to_timestamp($9))
           RETURNING id`,
          [workspace.id, owner.id, actorType, category, eventType, ids(7), entity, reverts, at],
        );
        return row.id;
      };
      const stopped = await event(`${ids(7)}_s1`, 'STOP', 'RULE_ACTION', 'system', CLOCK - 3600);
      await event(`${ids(7)}_s1`, 'UNDO_ACTION', 'USER_ACTION', 'user', CLOCK - 1800, stopped);
      await event(`${ids(7)}_s2`, 'STOP', 'RULE_ACTION', 'system', CLOCK - 3600);
      await event(`${ids(7)}_s2`, 'MANUAL_REACTIVATE', 'USER_ACTION', 'user', CLOCK - 1800);
      await event(`${ids(7)}_s3`, 'STOP', 'RULE_ACTION', 'system', CLOCK - 3600);
      graph.seed(meta);
    };

    const snapshot = async (cycleIds: string[]) => {
      const cycle = (id: unknown) => (cycleIds.includes(String(id)) ? `cycle ${cycleIds.indexOf(String(id))}` : id);
      const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value);
      const clean = (rows: Row[], drop: string[]) =>
        rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !drop.includes(key)).map(([key, value]) => [key, key === 'correlation_id' ? cycle(value) : iso(value)])));
      return {
        accounts: await select('SELECT account_id, owner_user_id, is_active, currency FROM accounts WHERE account_id = ANY($1) ORDER BY account_id', [accountIds]),
        executions: clean(await select('SELECT * FROM rule_execution_states WHERE account_id = ANY($1) ORDER BY account_id, entity_id, action, rule_key', [accountIds]), ['id', 'created_at', 'updated_at']),
        audit: clean(
          await select("SELECT * FROM audit_events WHERE account_id = ANY($1) AND actor_id <> 'seed' ORDER BY id", [accountIds]),
          ['id', 'created_at', 'duration_ms', 'occurred_at'],
        ),
        ruleStates: clean(await select('SELECT * FROM rule_entity_states WHERE account_id = ANY($1) ORDER BY account_id, rule_id, entity_level, entity_id', [accountIds]), ['id']),
        stopped: clean(await select('SELECT * FROM stopped_adsets WHERE adset_id = ANY($1) ORDER BY adset_id', [adsetIds]), ['id', 'stopped_at', 'updated_at', 'created_at']),
        health: await select(
          `SELECT a.account_id, h.status, h.cause, h.signals, h.consecutive_failures, h.last_error_code, h.last_error_message
           FROM account_health h JOIN accounts a ON a.id = h.account_pk WHERE a.account_id = ANY($1) ORDER BY a.account_id`,
          [accountIds],
        ),
        schedules: await select('SELECT state_key, owner_user_id, account_id, rule_key, last_checked_at FROM automation_schedule_states WHERE account_id = ANY($1) ORDER BY state_key', [accountIds]),
        inventory: await select('SELECT account_id, adsets_payload FROM adset_inventory_cache WHERE account_id = ANY($1) ORDER BY account_id', [accountIds]),
        meta: [...graph.entities.values()].map(({ id, status, daily_budget }) => ({ id, status, daily_budget })),
        requests: [...graph.requests].map((request) => JSON.stringify(request)).sort(),
      };
    };

    await reset();
    const pythonDatabase = DATABASE_URL.replace(/^postgres(ql)?:/, 'postgresql+asyncpg:');
    // Not spawnSync: the Graph API answering Python runs in this process.
    const run = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
      const child = spawn(PYTHON, [join(REPO, 'server/test/worker/rule_cycle_parity.py')], {
        cwd: REPO,
        env: { ...process.env, PYTHONPATH: REPO, DATABASE_URL: pythonDatabase, META_GRAPH_BASE_URL: graph.url(), META_APP_SECRET: 'parity-secret', META_TOKEN_ENCRYPTION_KEY: KEY },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      child.on('error', (error) => resolve({ status: null, stdout, stderr: String(error) }));
      child.on('close', (status) => resolve({ status, stdout, stderr }));
      child.stdin.end(JSON.stringify({ clocks: CLOCKS, account_ids: accountIds }));
    });
    if (run.status !== 0) {
      if (process.env.CI) throw new Error(`Python failed: ${run.stderr}`);
      return;
    }
    const pythonStats = JSON.parse(run.stdout) as Array<Record<string, unknown>>;
    const pythonRows = await snapshot(pythonStats.map((stats) => String(stats.cycle_id)));

    await reset();
    const db = databaseOver(dataSource);
    let now = CLOCK;
    const cycle = new RuleCycle({
      db,
      log,
      tokenEncryptionKey: KEY,
      clock: () => now,
      sleep: async () => undefined,
      meta: new MetaClient({ graphVersion: 'v26.0', baseUrl: graph.url(), appSecret: 'parity-secret', sleep: async () => undefined, cacheProvider: new PostgresInventoryCache(db, log) }),
    });
    const ourStats: Array<Record<string, unknown>> = [];
    for (const clock of CLOCKS) {
      now = clock;
      ourStats.push({ ...(await cycle.run({ accountIds })) });
    }
    const ours = await snapshot(ourStats.map((stats) => String(stats.cycle_id)));

    const counts = (list: Array<Record<string, unknown>>) => list.map(({ cycle_id: _, ...rest }) => rest);
    expect(counts(ourStats)).toEqual(counts(pythonStats));
    expect(ours.accounts).toEqual(pythonRows.accounts);
    expect(ours.executions).toEqual(pythonRows.executions);
    expect(ours.audit).toEqual(pythonRows.audit);
    expect(ours.ruleStates).toEqual(pythonRows.ruleStates);
    expect(ours.stopped).toEqual(pythonRows.stopped);
    expect(ours.health).toEqual(pythonRows.health);
    expect(ours.schedules).toEqual(pythonRows.schedules);
    expect(ours.inventory).toEqual(pythonRows.inventory);
    expect(ours.meta).toEqual(pythonRows.meta);
    expect(ours.requests).toEqual(pythonRows.requests);

    // The cases reach what they are for.
    const events = new Set(ours.audit.map((row) => row.event_type));
    for (const type of ['STOP', 'STOP_CONFIRMATION_STARTED', 'INCREASE_BUDGET', 'DECREASE_BUDGET', 'NOTIFY_ONLY', 'RULE_ACTION_RECONCILED', 'TOKEN_EXPIRED']) {
      expect(events, type).toContain(type);
    }
    expect(ours.audit.some((row) => row.event_type === 'STOP' && row.status === 'ERROR')).toBe(true);
    expect(ours.audit.some((row) => row.event_type === 'STOP' && row.entity_level === 'campaign' && row.status === 'SUCCESS')).toBe(true);
    expect(ours.ruleStates.map((row) => row.state)).toEqual(expect.arrayContaining(['fired', 'undone', 'error', 'cooldown']));
    expect(ours.accounts.find((row) => row.account_id === ids(3))).toMatchObject({ is_active: false });
    expect(ours.meta.find((row) => row.id === `${ids(1)}_s4`)).toMatchObject({ status: 'PAUSED' });
    expect(ourStats.some((stats) => (stats.errors as string[]).some((error) => error.includes('window')))).toBe(true);
  }, 120_000);
});
