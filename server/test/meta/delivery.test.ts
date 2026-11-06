import { createHmac } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountEntity, AnalyticsEntityFactEntity, UserEntity, WorkspaceEntity } from '../../src/entities/index.ts';
import { MetaTokenKeyring } from '../../src/meta/tokens.ts';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { MetaRecorder } from '../support/meta-recorder.ts';
import { DATABASE_URL, META_RECORDER_PORT, META_TEST_ENV, metaContractTarget, type Target } from '../support/target.ts';

// Turning Meta entities on and off, moving budgets and turning a stopped ad
// set back on (api/routers/delivery.py, adsets.py reactivate_adset; #611
// stage 4). These spend real money, so the tests run against both servers
// with Meta answered by the test (support/meta-recorder.ts): the requests
// each server sends, and what it writes down, must be the same.

type Row = Record<string, unknown>;
interface Answer {
  data?: Record<string, Row | null>;
  errors?: Array<{ message: string; extensions?: { statusCode?: number } }>;
}

const query = async (db: DataSource, sql: string, parameters: unknown[] = []): Promise<Row[]> => db.query<Row[]>(sql, parameters);

const TOKEN = 'meta-account-token';
const PROOF = createHmac('sha256', META_TEST_ENV.META_APP_SECRET).update(TOKEN).digest('hex');
const DELIVERY = 'mutation D($level: String!, $id: String!, $input: JSON!) { entityDeliveryUpdate(level: $level, entityId: $id, input: $input) { success lastSyncId entity } }';
const BUDGET = 'mutation B($level: String!, $id: String!, $input: JSON!) { entityBudgetUpdate(level: $level, entityId: $id, input: $input) { success lastSyncId entity } }';
const REACTIVATE = 'mutation R($id: String!) { adSetReactivate(adSetId: $id) { success lastSyncId entity } }';
const UNDO = 'mutation U($id: Int!) { auditEventUndo(id: $id) { success lastSyncId auditEvent } }';

const digits = (length: number): string => Array.from({ length }, (_, index) => (index === 0 ? 1 + Math.floor(Math.random() * 9) : Math.floor(Math.random() * 10))).join('');

async function person(target: Target, user: UserEntity, workspace: WorkspaceEntity) {
  const browser = new Browser(target, { 'x-workspace-slug': workspace.slug });
  expect((await browser.signIn(user.email!)).status).toBe(200);
  return async (text: string, variables?: Row): Promise<Answer> => {
    const answer = await browser.post('/api/graphql', { query: text, variables }, browser.csrf());
    expect(answer.status).toBe(200);
    return answer.body as Answer;
  };
}

describe.skipIf(!DATABASE_URL)('manual Meta writes, on both servers', () => {
  let target: Target;
  let db: DataSource;
  const meta = new MetaRecorder();

  beforeAll(async () => {
    await meta.start(META_RECORDER_PORT);
    target = await metaContractTarget();
    db = await testDatabase();
  });

  afterAll(async () => {
    await target?.close();
    await db?.destroy();
    await meta.stop();
  });

  let world: Awaited<ReturnType<typeof makeWorld>>;
  beforeEach(async () => {
    world = await makeWorld();
  });

  async function makeWorld() {
    const owner = await createUser(db, { fullName: 'Ann Owner' });
    const ws = await createWorkspace(db, owner);
    const number = digits(15);
    const account = await db.getRepository(AccountEntity).save(
      db.getRepository(AccountEntity).create({
        accountId: `act_${number}`,
        name: 'NL Account',
        ownerUserId: owner.id,
        workspaceId: ws.id,
        timezoneName: 'Europe/Amsterdam',
        currency: 'EUR',
        accessToken: '',
        accessTokenEncrypted: new MetaTokenKeyring(META_TEST_ENV.META_TOKEN_ENCRYPTION_KEY).encrypt(TOKEN),
        metaConnectionId: null,
        leadUserId: null,
        targetCostPerResult: null,
        rulesEnabled: false,
        isActive: true,
      }),
    );
    return { ws, owner, account, number, call: await person(target, owner, ws) };
  }

  const fact = async (level: string, entityId: string, fields: { status?: string; dailyBudget?: number }) => {
    const repository = db.getRepository(AnalyticsEntityFactEntity);
    for (const date of ['2026-11-04', '2026-11-05']) {
      await repository.save(repository.create({
        workspaceId: world.ws.id, accountId: world.account.accountId, entityLevel: level, entityId, date,
        status: fields.status ?? 'ACTIVE', effectiveStatus: fields.status ?? 'ACTIVE', dailyBudget: fields.dailyBudget ?? 0,
        cpcLink: null, ctrLink: null, ctrOutbound: null, costPerLead: null, costPerRegistration: null, costPerPurchase: null,
      }));
    }
  };
  const facts = (entityId: string) => query(db, 'SELECT date, status, effective_status, daily_budget FROM analytics_entity_daily_facts WHERE entity_id = $1 ORDER BY date', [entityId]);
  const event = async (id: unknown) => (await query(db, 'SELECT * FROM audit_events WHERE id = $1', [id]))[0];
  const read = (id: string, fields: string) => ({ method: 'GET', path: id, params: { fields, access_token: TOKEN, appsecret_proof: PROOF } });
  const ADSET_FIELDS = 'id,account_id,name,status,effective_status,daily_budget';

  it('turns an ad set off: reads it, writes it once, and records it for undo', async () => {
    const adset = digits(16);
    await query(
      db,
      `INSERT INTO adset_inventory_cache (account_id, adsets_payload, version, fetched_at, expires_at, updated_at)
       VALUES ($1, $2::jsonb, 1, now(), now() + interval '5 minutes', now() - interval '1 minute')`,
      [world.account.accountId, JSON.stringify([{ id: adset, name: 'Prospecting', status: 'ACTIVE', effective_status: 'ACTIVE' }])],
    );
    await fact('adset', adset, { status: 'ACTIVE' });
    meta.answer([
      ['GET', adset, { body: { id: adset, account_id: world.number, name: 'Prospecting', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '2500' } }],
      ['POST', adset, { body: { success: true } }],
    ]);
    const answer = await world.call(DELIVERY, { level: 'adset', id: adset, input: { account_id: world.account.accountId, status: 'PAUSED' } });
    expect(answer.errors).toBeUndefined();
    const entity = answer.data!.entityDeliveryUpdate!.entity as Row;
    expect(entity).toEqual({ entity_id: adset, level: 'adset', status: 'PAUSED', changed: true, audit_event_id: expect.any(Number) as number, message: 'Ad set turned off.' });
    expect(meta.requests).toEqual([
      read(adset, ADSET_FIELDS),
      { method: 'POST', path: adset, params: { status: 'PAUSED', access_token: TOKEN, appsecret_proof: PROOF } },
    ]);
    expect(await event(entity.audit_event_id)).toMatchObject({
      workspace_id: world.ws.id, owner_user_id: world.owner.id, actor_type: 'user', actor_id: String(world.owner.id),
      category: 'MANUAL_ACTION', event_type: 'MANUAL_PAUSE', status: 'SUCCESS', action: 'SET_ENTITY_DELIVERY',
      account_id: world.account.accountId, account_name: 'NL Account', adset_id: adset, adset_name: 'Prospecting',
      entity_level: 'adset', entity_id: adset, entity_name: 'Prospecting', rule_id: null, rule_name: '',
      message: 'Ad set turned off manually.', before_state: { status: 'ACTIVE' }, after_state: { status: 'PAUSED' }, details: {},
    });
    const [cache] = await query(db, 'SELECT adsets_payload FROM adset_inventory_cache WHERE account_id = $1', [world.account.accountId]);
    expect(cache.adsets_payload).toEqual([{ id: adset, name: 'Prospecting', status: 'PAUSED', effective_status: 'PAUSED' }]);
    // Only the newest fact changes.
    expect((await facts(adset)).map((row) => row.status)).toEqual(['ACTIVE', 'PAUSED']);
  });

  it('leaves an entity already in the state alone and reports a write Meta refused', async () => {
    const ad = digits(16);
    meta.answer([['GET', ad, { body: { id: ad, account_id: world.number, name: 'Video', status: 'PAUSED' } }]]);
    const same = await world.call(DELIVERY, { level: 'ad', id: ad, input: { account_id: world.number, status: 'PAUSED' } });
    expect(same.data!.entityDeliveryUpdate!.entity).toEqual({
      entity_id: ad, level: 'ad', status: 'PAUSED', changed: false, audit_event_id: null, message: 'This ad is already paused.',
    });
    expect(meta.requests).toEqual([read(ad, 'id,account_id,name,status,effective_status')]);

    meta.answer([
      ['GET', ad, { body: { id: ad, account_id: world.number, name: 'Video', status: 'PAUSED' } }],
      ['POST', ad, { status: 400, body: { error: { message: 'Invalid parameter', type: 'OAuthException', code: 100 } } }],
    ]);
    const refused = await world.call(DELIVERY, { level: 'ad', id: ad, input: { account_id: world.number, status: 'ACTIVE' } });
    expect(refused.errors?.[0]).toMatchObject({ message: 'Meta could not change this ad. Check its current state before retrying.', extensions: { statusCode: 502 } });
    expect(meta.requests.map((request) => request.method)).toEqual(['GET', 'POST']);
    const [row] = await query(db, "SELECT event_type, status, message, before_state, after_state, entity_level FROM audit_events WHERE entity_id = $1", [ad]);
    expect(row).toEqual({
      event_type: 'MANUAL_REACTIVATE', status: 'ERROR', entity_level: 'ad',
      message: 'Meta could not confirm the change; verify its current state before retrying.',
      before_state: { status: 'PAUSED' }, after_state: { status: 'PAUSED' },
    });
  });

  it('refuses what it cannot do before writing anything', async () => {
    const id = digits(16);
    meta.answer([['GET', id, { body: { id, account_id: '999999999', name: 'Theirs', status: 'ACTIVE', daily_budget: '1000' } }]]);
    const elsewhere = await world.call(DELIVERY, { level: 'campaign', id, input: { account_id: world.account.accountId, status: 'PAUSED' } });
    expect(elsewhere.errors?.[0]).toMatchObject({ message: 'Entity not found in this ad account.', extensions: { statusCode: 404 } });

    const ad = await world.call(BUDGET, { level: 'ad', id, input: { account_id: world.account.accountId, daily_budget: 10 } });
    expect(ad.errors?.[0]).toMatchObject({ message: 'An ad has no budget of its own.', extensions: { statusCode: 400 } });
    const level = await world.call(DELIVERY, { level: 'account', id, input: { account_id: world.account.accountId, status: 'PAUSED' } });
    expect(level.errors?.[0].extensions?.statusCode).toBe(422);
    const status = await world.call(DELIVERY, { level: 'ad', id, input: { account_id: world.account.accountId, status: 'OFF' } });
    expect(status.errors?.[0].extensions?.statusCode).toBe(422);
    const small = await world.call(BUDGET, { level: 'adset', id, input: { account_id: world.account.accountId, daily_budget: 0.5 } });
    expect(small.errors?.[0].extensions?.statusCode).toBe(422);
    const unknown = await world.call(DELIVERY, { level: 'ad', id, input: { account_id: 'act_404404404', status: 'PAUSED' } });
    expect(unknown.errors?.[0]).toMatchObject({ message: 'Ad account not found.', extensions: { statusCode: 404 } });

    meta.answer([['GET', id, { body: { id, account_id: world.number, name: 'CBO off', status: 'ACTIVE', daily_budget: '0' } }]]);
    const none = await world.call(BUDGET, { level: 'adset', id, input: { account_id: world.account.accountId, daily_budget: 10 } });
    expect(none.errors?.[0]).toMatchObject({ message: 'This ad set carries no daily budget; the budget is held by its campaign.', extensions: { statusCode: 409 } });
    expect(meta.requests.map((request) => request.method)).toEqual(['GET']);
    expect(await query(db, 'SELECT id FROM audit_events WHERE entity_id = $1', [id])).toEqual([]);
  });

  it('moves a campaign budget in the currency\'s minor units, and not when it is the same', async () => {
    const campaign = digits(16);
    await fact('campaign', campaign, { dailyBudget: 50 });
    meta.answer([
      ['GET', campaign, { body: { id: campaign, account_id: world.number, name: 'Main', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '5000' } }],
      ['POST', campaign, { body: { success: true } }],
    ]);
    const answer = await world.call(BUDGET, { level: 'campaign', id: campaign, input: { account_id: world.account.accountId, daily_budget: 75.5 } });
    expect(answer.errors).toBeUndefined();
    const entity = answer.data!.entityBudgetUpdate!.entity as Row;
    expect(entity).toEqual({
      entity_id: campaign, level: 'campaign', daily_budget: 75.5, previous_daily_budget: 50, changed: true,
      audit_event_id: expect.any(Number) as number, message: 'Campaign daily budget updated.',
    });
    expect(meta.requests).toEqual([
      read(campaign, ADSET_FIELDS),
      { method: 'POST', path: campaign, params: { daily_budget: '7550', access_token: TOKEN, appsecret_proof: PROOF } },
    ]);
    expect(await event(entity.audit_event_id)).toMatchObject({
      event_type: 'INCREASE_BUDGET', status: 'SUCCESS', action: 'SET_ENTITY_BUDGET', entity_level: 'campaign', adset_id: '', adset_name: '',
      entity_name: 'Main', message: 'Campaign daily budget changed manually.',
      before_state: { daily_budget: 50, status: 'ACTIVE' }, after_state: { daily_budget: 75.5, status: 'ACTIVE' },
    });
    expect((await facts(campaign)).map((row) => Number(row.daily_budget))).toEqual([50, 75.5]);

    meta.answer([['GET', campaign, { body: { id: campaign, account_id: world.number, name: 'Main', status: 'ACTIVE', daily_budget: '7550' } }]]);
    const same = await world.call(BUDGET, { level: 'campaign', id: campaign, input: { account_id: world.account.accountId, daily_budget: 75.5 } });
    expect(same.data!.entityBudgetUpdate!.entity).toEqual({
      entity_id: campaign, level: 'campaign', daily_budget: 75.5, changed: false, audit_event_id: null, message: 'The daily budget is already set to this amount.',
    });
    expect(meta.requests.map((request) => request.method)).toEqual(['GET']);
  });

  it('turns a stopped ad set back on and resolves its card', async () => {
    const adset = digits(16);
    await query(
      db,
      `INSERT INTO stopped_adsets (account_id, adset_id, adset_name, stop_spend, stop_leads, stop_registrations, is_resolved, stopped_at, updated_at)
       VALUES ($1, $2, 'Late leads', 12.5, 0, 0, false, now(), now())`,
      [world.account.accountId, adset],
    );
    meta.answer([['POST', adset, { body: { success: true } }]]);
    const answer = await world.call(REACTIVATE, { id: adset });
    expect(answer.errors).toBeUndefined();
    expect(answer.data!.adSetReactivate!.entity).toEqual({ success: true, message: `Ad set ${adset} turned on.` });
    expect(meta.requests).toEqual([{ method: 'POST', path: adset, params: { status: 'ACTIVE', access_token: TOKEN, appsecret_proof: PROOF } }]);
    expect(await query(db, 'SELECT is_resolved FROM stopped_adsets WHERE adset_id = $1', [adset])).toEqual([{ is_resolved: true }]);
    const [row] = await query(db, 'SELECT event_type, status, action, message, before_state, after_state, entity_level, adset_name FROM audit_events WHERE entity_id = $1', [adset]);
    expect(row).toEqual({
      event_type: 'MANUAL_REACTIVATE', status: 'SUCCESS', action: 'REACTIVATE_ADSET', message: 'Ad set turned on manually by the user.',
      before_state: { status: 'PAUSED', is_resolved: false }, after_state: { status: 'ACTIVE', is_resolved: true },
      entity_level: 'adset', adset_name: 'Late leads',
    });

    const missing = await world.call(REACTIVATE, { id: digits(16) });
    expect(missing.errors?.[0]).toMatchObject({ message: 'No record found for the stopped ad set.', extensions: { statusCode: 404 } });
  });

  it('undoes a pause once, and refuses when Meta no longer shows its result', async () => {
    const adset = digits(16);
    meta.answer([
      ['GET', adset, { body: { id: adset, account_id: world.number, name: 'Retarget', status: 'ACTIVE', daily_budget: '2000' } }],
      ['POST', adset, { body: { success: true } }],
    ]);
    const paused = (await world.call(DELIVERY, { level: 'adset', id: adset, input: { account_id: world.account.accountId, status: 'PAUSED' } })).data!.entityDeliveryUpdate!.entity as Row;
    const pauseId = paused.audit_event_id as number;

    meta.answer([
      ['GET', adset, { body: { id: adset, account_id: world.number, name: 'Retarget', status: 'PAUSED', effective_status: 'PAUSED', daily_budget: '2000' } }],
      ['POST', adset, { body: { success: true } }],
    ]);
    const answer = await world.call(UNDO, { id: pauseId });
    expect(answer.errors).toBeUndefined();
    const undone = answer.data!.auditEventUndo!.auditEvent as Row;
    expect(undone).toEqual({
      success: true, already_reverted: false, original_event_id: pauseId, reversal_event_id: expect.any(Number) as number,
      message: 'Action undone and confirmed by Meta.',
    });
    expect(meta.requests).toEqual([
      read(adset, ADSET_FIELDS),
      { method: 'POST', path: adset, params: { status: 'ACTIVE', access_token: TOKEN, appsecret_proof: PROOF } },
    ]);
    const reversal = await event(undone.reversal_event_id);
    expect(reversal).toMatchObject({
      event_type: 'UNDO_ACTION', status: 'SUCCESS', category: 'MANUAL_ACTION', action: 'UNDO_SET_ENTITY_DELIVERY', reverts_event_id: pauseId,
      message: `Action #${pauseId} was undone safely.`, entity_level: 'adset', entity_id: adset, entity_name: 'Retarget', adset_id: adset, adset_name: 'Retarget',
      after_state: { status: 'ACTIVE' },
      details: { original_event_id: pauseId, original_event_type: 'MANUAL_PAUSE', reconciled_after_restart: false, currency: 'EUR' },
    });
    expect(reversal.before_state).toMatchObject({ account_id: world.number, status: 'PAUSED', daily_budget: 20, currency: 'EUR' });
    expect(await query(db, 'SELECT status, attempt_count, correlation_id FROM action_undo_states WHERE original_event_id = $1', [pauseId])).toEqual([
      { status: 'SUCCESS', attempt_count: 1, correlation_id: reversal.correlation_id },
    ]);

    meta.answer([]);
    const again = await world.call(UNDO, { id: pauseId });
    expect(again.data!.auditEventUndo!.auditEvent).toMatchObject({ success: true, already_reverted: true, reversal_event_id: undone.reversal_event_id });
    expect(meta.requests).toEqual([]);

    // A second pause, then someone turns it on in Ads Manager: the undo would undo nothing.
    meta.answer([
      ['GET', adset, { body: { id: adset, account_id: world.number, name: 'Retarget', status: 'ACTIVE', daily_budget: '2000' } }],
      ['POST', adset, { body: { success: true } }],
    ]);
    const second = (await world.call(DELIVERY, { level: 'adset', id: adset, input: { account_id: world.account.accountId, status: 'PAUSED' } })).data!.entityDeliveryUpdate!.entity as Row;
    meta.answer([['GET', adset, { body: { id: adset, account_id: world.number, name: 'Retarget', status: 'ACTIVE', daily_budget: '2000' } }]]);
    const differs = await world.call(UNDO, { id: second.audit_event_id });
    expect(differs.errors?.[0]).toMatchObject({ message: "Meta's current state already differs from the result of the original action.", extensions: { statusCode: 409 } });
    expect(meta.requests.map((request) => request.method)).toEqual(['GET']);
    expect(await query(db, 'SELECT status, last_error FROM action_undo_states WHERE original_event_id = $1', [second.audit_event_id])).toEqual([
      { status: 'ERROR', last_error: 'Meta state no longer matches the original action' },
    ]);
  });

  it('undoes a budget change back to the exact previous budget', async () => {
    const campaign = digits(16);
    meta.answer([
      ['GET', campaign, { body: { id: campaign, account_id: world.number, name: 'Main', status: 'ACTIVE', daily_budget: '5000' } }],
      ['POST', campaign, { body: { success: true } }],
    ]);
    const raised = (await world.call(BUDGET, { level: 'campaign', id: campaign, input: { account_id: world.account.accountId, daily_budget: 80 } })).data!.entityBudgetUpdate!.entity as Row;
    meta.answer([
      ['GET', campaign, { body: { id: campaign, account_id: world.number, name: 'Main', status: 'ACTIVE', daily_budget: '8000' } }],
      ['POST', campaign, { body: { success: true } }],
    ]);
    const answer = await world.call(UNDO, { id: raised.audit_event_id });
    expect(answer.errors).toBeUndefined();
    expect(meta.requests).toEqual([
      read(campaign, ADSET_FIELDS),
      { method: 'POST', path: campaign, params: { daily_budget: '5000', access_token: TOKEN, appsecret_proof: PROOF } },
    ]);
    const reversal = await event((answer.data!.auditEventUndo!.auditEvent as Row).reversal_event_id);
    expect(reversal).toMatchObject({ action: 'UNDO_SET_ENTITY_BUDGET', adset_id: '', adset_name: '', entity_level: 'campaign', after_state: { daily_budget: 50 } });

    const missing = await world.call(UNDO, { id: 2_000_000_000 });
    expect(missing.errors?.[0]).toMatchObject({ message: 'Event not found.', extensions: { statusCode: 404 } });
  });
});
