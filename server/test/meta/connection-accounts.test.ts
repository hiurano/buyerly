import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UserEntity, WorkspaceEntity, WorkspaceMemberEntity } from '../../src/entities/index.ts';
import { MetaTokenKeyring } from '../../src/meta/tokens.ts';
import { redactSecrets } from '../../src/meta/redact.ts';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL, contractTarget, typescriptTarget, type InProcessTarget, type Target } from '../support/target.ts';

// A workspace's Meta connections and their ad accounts (api/meta_oauth.py
// list_connections, discover_accounts, import_accounts; #611 stage 4). The
// contract part runs against both servers (CONTRACT_TARGET), where neither
// has a token key, so a stored token cannot be read; reading ad accounts from
// Meta and adding them, with Meta answered by the test, runs on this server.

type Row = Record<string, unknown>;
interface Answer {
  data?: Record<string, Row | null>;
  errors?: Array<{ message: string; extensions?: { statusCode?: number; detail?: unknown } }>;
}

const query = async (db: DataSource, sql: string, parameters: unknown[] = []): Promise<Row[]> => db.query<Row[]>(sql, parameters);

const ENCRYPTION_KEY = 'CKOJW1eA4PLOe59rNqizKftdfj0lN17_CIFSpe7ihLw=';
const LIST = 'query { metaConnections }';
const DISCOVER = 'mutation MetaConnectionDiscover($id: Int!) { metaConnectionDiscover(connectionId: $id) { success lastSyncId metaConnection } }';
const IMPORT = 'mutation MetaConnectionImport($id: Int!, $input: JSON!) { metaConnectionImport(connectionId: $id, input: $input) { success lastSyncId metaConnection } }';

// A Meta ad account id no other test uses.
const accountNumber = (): string => String(10_000_000_000 + Math.floor(Math.random() * 89_999_999_999));

async function person(target: Target, user: UserEntity, workspace: WorkspaceEntity) {
  const browser = new Browser(target, { 'x-workspace-slug': workspace.slug });
  expect((await browser.signIn(user.email!)).status).toBe(200);
  return async (text: string, variables?: Row): Promise<Answer> => {
    const answer = await browser.post('/api/graphql', { query: text, variables }, browser.csrf());
    expect(answer.status).toBe(200);
    return answer.body as Answer;
  };
}

async function world(target: Target, db: DataSource) {
  const ownerUser = await createUser(db, { fullName: 'Ann Owner' });
  const ws = await createWorkspace(db, ownerUser);
  const join = async (role: string) => {
    const user = await createUser(db);
    await db.getRepository(WorkspaceMemberEntity).save({ workspaceId: ws.id, userId: user.id, role, joinedAt: new Date() });
    await db.getRepository(UserEntity).update({ id: user.id }, { activeWorkspaceId: ws.id });
    return { user, call: await person(target, user, ws) };
  };
  return { ws, ownerUser, owner: await person(target, ownerUser, ws), member: await join('member'), guest: await join('guest') };
}

async function connection(
  db: DataSource,
  workspaceId: number,
  ownerUserId: number,
  fields: { status?: string; token?: string; scopes?: string[]; expiresInDays?: number | null; name?: string } = {},
): Promise<number> {
  const expires = fields.expiresInDays === null ? null : new Date(Date.now() + (fields.expiresInDays ?? 30) * 86_400_000 + 3_600_000);
  const [row] = await query(
    db,
    `INSERT INTO meta_connections (workspace_id, owner_user_id, provider_user_id, provider_user_name, access_token_encrypted,
       granted_scopes, token_expires_at, status, last_error, last_validated_at, connected_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, '', NULL, now(), now(), now()) RETURNING id`,
    [
      workspaceId, ownerUserId, `fb-${accountNumber()}`, fields.name ?? 'Ivan FB', fields.token ?? 'not-a-token',
      JSON.stringify(fields.scopes ?? ['ads_read', 'ads_management', 'business_management']), expires, fields.status ?? 'active',
    ],
  );
  return row.id as number;
}

describe('redactSecrets', () => {
  it('removes tokens the way core/logging_config.py does', () => {
    expect(redactSecrets('GET /v26.0/me?access_token=EAAB123&appsecret_proof=abc&x=1')).toBe(
      'GET /v26.0/me?access_token=[REDACTED]&appsecret_proof=[REDACTED]&x=1',
    );
    expect(redactSecrets('Authorization: Bearer abc.def')).toBe('Authorization: Bearer [REDACTED]');
    expect(redactSecrets('/bot123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/send')).toBe('/bot123456789:[REDACTED]/send');
    expect(redactSecrets('password: hunter2')).toBe('password: [REDACTED]');
  });
});

describe.skipIf(!DATABASE_URL)('Meta connections and their ad accounts, on both servers', () => {
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

  it('lists every connection to owners and admins, their own to members', async () => {
    const { ws, ownerUser, owner, member, guest } = await world(target, db);
    const mine = await connection(db, ws.id, ownerUser.id, { scopes: ['ads_read'], expiresInDays: 3 });
    const theirs = await connection(db, ws.id, member.user.id, { expiresInDays: null, name: 'Member FB' });
    // The newest change first.
    await query(db, "UPDATE meta_connections SET updated_at = now() + interval '1 minute' WHERE id = $1", [theirs]);

    const all = (await owner(LIST)).data!.metaConnections as unknown as Row[];
    expect(all.map((row) => row.id)).toEqual([theirs, mine]);
    expect(all[1]).toMatchObject({
      provider_user_name: 'Ivan FB',
      status: 'active',
      granted_scopes: ['ads_read'],
      missing_scopes: ['ads_management', 'business_management'],
      days_until_expiration: 3,
      last_validated_at: null,
      last_error: '',
    });
    expect(all[1].token_expires_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{6})?\+00:00$/);
    expect(all[1].connected_at).toMatch(/\+00:00$/);
    expect(all[0]).toMatchObject({ token_expires_at: null, days_until_expiration: null, missing_scopes: [] });

    expect(((await member.call(LIST)).data!.metaConnections as unknown as Row[]).map((row) => row.id)).toEqual([theirs]);
    expect((await guest.call(LIST)).data!.metaConnections).toEqual([]);
  });

  it('refuses guests, hides other buyers\' connections and checks ad account ids first', async () => {
    const { ws, ownerUser, member, guest, owner } = await world(target, db);
    const id = await connection(db, ws.id, ownerUser.id);
    const refused = await guest.call(DISCOVER, { id });
    expect(refused.errors?.[0]).toMatchObject({ message: "Guests can't perform changing the Meta connection", extensions: { statusCode: 403 } });
    const hidden = await member.call(DISCOVER, { id });
    expect(hidden.errors?.[0]).toMatchObject({ message: 'Meta connection not found', extensions: { statusCode: 404 } });

    const invalid = await owner(IMPORT, { id: 999_999_999, input: { account_ids: ['act_12'] } });
    expect(invalid.errors?.[0]).toMatchObject({ message: 'Invalid ad account ID: act_12', extensions: { statusCode: 422 } });
    expect((await owner(IMPORT, { id, input: { account_ids: [] } })).errors?.[0].extensions?.statusCode).toBe(422);
    expect((await owner(IMPORT, { id, input: { account_ids: ['123456'], extra: 1 } })).errors?.[0].extensions?.statusCode).toBe(422);
    expect((await owner(IMPORT, { id: 999_999_999, input: { account_ids: ['123456'] } })).errors?.[0].extensions?.statusCode).toBe(404);

    await query(db, "UPDATE meta_connections SET status = 'expired' WHERE id = $1", [id]);
    const expired = await owner(IMPORT, { id, input: { account_ids: ['123456'] } });
    expect(expired.errors?.[0]).toMatchObject({ message: 'Reconnect your Meta profile first', extensions: { statusCode: 409 } });
  });

  it('cannot read a stored token without the key: discovery asks to reconnect, import is unavailable', async () => {
    const { ws, ownerUser, owner } = await world(target, db);
    const id = await connection(db, ws.id, ownerUser.id);
    const imported = await owner(IMPORT, { id, input: { account_ids: ['123456'] } });
    expect(imported.errors?.[0]).toMatchObject({ message: 'The Meta connection key is unavailable', extensions: { statusCode: 503 } });

    const discovered = await owner(DISCOVER, { id });
    expect(discovered.errors?.[0]).toMatchObject({
      message: 'Meta did not confirm the connection. Connect the profile again.',
      extensions: { statusCode: 502 },
    });
    const [row] = await query(db, 'SELECT status, last_error, last_validated_at FROM meta_connections WHERE id = $1', [id]);
    expect(row.status).toBe('needs_reconnect');
    expect(row.last_error).toBe('META_TOKEN_ENCRYPTION_KEY is not configured');
    expect(row.last_validated_at).not.toBeNull();
  });
});

// Meta for one test: each Graph API path answers from `routes`; every URL asked is kept.
function fakeMeta(routes: Record<string, (url: URL) => unknown>) {
  const urls: URL[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    urls.push(url);
    const path = url.pathname.replace(/^\/v\d+\.\d+\//, '');
    const answer = routes[path];
    if (!answer) return new Response(JSON.stringify({ error: { message: `unexpected ${path}`, code: 100 } }), { status: 400 });
    return new Response(JSON.stringify(answer(url)), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetcher, urls };
}

describe.skipIf(!DATABASE_URL)('reading and adding a connection\'s ad accounts on this server', () => {
  let target: InProcessTarget;
  let db: DataSource;
  const keyring = new MetaTokenKeyring(ENCRYPTION_KEY);

  beforeAll(async () => {
    target = await typescriptTarget({
      META_APP_ID: '424242',
      META_APP_SECRET: 'app-secret',
      META_LOGIN_CONFIG_ID: 'config-1',
      META_OAUTH_REDIRECT_URI: 'https://buyerly.test/api/meta/oauth/callback',
      META_TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY,
    });
    db = await testDatabase();
  });

  afterAll(async () => {
    await target?.close();
    await db?.destroy();
  });

  const debugToken = () => ({
    data: { is_valid: true, app_id: '424242', expires_at: Math.floor(Date.now() / 1000) + 40 * 86400, scopes: ['ads_read', 'ads_management', 'business_management'] },
  });

  it('reads the ad accounts again, drops the ones Meta no longer shows and marks what is already here', async () => {
    const { ws, ownerUser, owner } = await world(target, db);
    const id = await connection(db, ws.id, ownerUser.id, { token: keyring.encrypt('the-token'), status: 'expiring' });
    const [kept, manual, gone] = [accountNumber(), accountNumber(), accountNumber()];
    await query(
      db,
      `INSERT INTO meta_connection_assets (connection_id, owner_user_id, meta_account_id, name, business_id, business_name, account_status, currency, timezone_name, discovered_at)
       VALUES ($1, $2, $3, 'Old', '', 'No Business Manager', 1, 'USD', 'UTC', now()), ($1, $2, $4, 'Gone', '', 'No Business Manager', 1, 'USD', 'UTC', now())`,
      [id, ownerUser.id, `act_${kept}`, `act_${gone}`],
    );
    await query(
      db,
      `INSERT INTO accounts (account_id, name, workspace_id, owner_user_id, batch_name, currency, timezone_name, last_started_date, last_day_start_date,
         active_rules, account_status, status_label, rules_enabled, is_active, created_at, custom_name, note, primary_result)
       VALUES ($1, 'Manual', $2, $3, '', 'EUR', 'UTC', '', '', '[{"id": 1}, {"id": 2}]', 1, 'Active', true, true, now(), 'My manual', '', '')`,
      [`act_${manual}`, ws.id, ownerUser.id],
    );
    const meta = fakeMeta({
      debug_token: debugToken,
      'me/adaccounts': () => ({
        data: [
          { id: `act_${kept}`, name: 'Kept', account_status: '2', currency: 'usd', timezone_name: 'Europe/Kiev', business: { id: '77', name: 'Agency BM' } },
          { account_id: manual, name: 'Manual', account_status: 'x', currency: 'EUR', timezone_name: '' },
          { name: 'no id' },
        ],
      }),
    });
    target.app.services.metaFetch = meta.fetcher;

    const answer = await owner(DISCOVER, { id });
    expect(answer.errors).toBeUndefined();
    const result = answer.data!.metaConnectionDiscover!.metaConnection as Row;
    expect(result).toMatchObject({ connection: { id, provider_user_name: 'Ivan FB', status: 'active' }, count: 2, imported_count: 0, migratable_count: 1 });
    expect(result.accounts).toEqual([
      expect.objectContaining({
        account_id: `act_${kept}`, name: 'Kept', business_id: '77', business_name: 'Agency BM', account_status: 2, currency: 'USD',
        timezone_name: 'Europe/Kyiv', imported: false, import_status: 'not_imported', can_migrate: false, rules_count: 0, custom_name: '',
      }),
      expect.objectContaining({
        account_id: `act_${manual}`, business_name: 'No Business Manager', account_status: 0, timezone_name: 'UNKNOWN',
        imported: false, import_status: 'manual_token', can_migrate: true, rules_count: 2, rules_enabled: true, custom_name: 'My manual',
      }),
    ]);
    expect(await query(db, 'SELECT meta_account_id FROM meta_connection_assets WHERE connection_id = $1 ORDER BY meta_account_id', [id])).toEqual(
      [`act_${kept}`, `act_${manual}`].sort().map((value) => ({ meta_account_id: value })),
    );
    const [row] = await query(db, 'SELECT status, last_error, granted_scopes, token_expires_at FROM meta_connections WHERE id = $1', [id]);
    expect(row).toMatchObject({ status: 'active', last_error: '', granted_scopes: ['ads_read', 'ads_management', 'business_management'] });
    expect(meta.urls.find((url) => url.pathname.endsWith('/me/adaccounts'))?.searchParams.get('access_token')).toBe('the-token');
  });

  it('marks the connection for reconnecting when Meta refuses the token', async () => {
    const { ws, ownerUser, owner } = await world(target, db);
    const id = await connection(db, ws.id, ownerUser.id, { token: keyring.encrypt('dead-token') });
    target.app.services.metaFetch = fakeMeta({ debug_token: () => ({ data: { is_valid: false } }) }).fetcher;
    const answer = await owner(DISCOVER, { id });
    expect(answer.errors?.[0].extensions?.statusCode).toBe(502);
    expect(await query(db, 'SELECT status, last_error FROM meta_connections WHERE id = $1', [id])).toEqual([
      { status: 'needs_reconnect', last_error: 'Meta access token is invalid' },
    ]);
  });

  it('adds new ad accounts, moves a manual one onto the connection with its rules, and reports the ones that fail', async () => {
    const { ws, ownerUser, owner } = await world(target, db);
    const id = await connection(db, ws.id, ownerUser.id, { token: keyring.encrypt('the-token'), name: 'Ivan FB' });
    const [fresh, manual, badZone, elsewhere, missing] = [accountNumber(), accountNumber(), accountNumber(), accountNumber(), accountNumber()];
    for (const [number, business] of [[fresh, '77'], [manual, ''], [badZone, ''], [elsewhere, '']]) {
      await query(
        db,
        `INSERT INTO meta_connection_assets (connection_id, owner_user_id, meta_account_id, name, business_id, business_name, account_status, currency, timezone_name, discovered_at)
         VALUES ($1, $2, $3, 'Asset', $4, $5, 1, 'USD', 'UTC', now())`,
        [id, ownerUser.id, `act_${number}`, business, business ? 'Agency BM' : 'No Business Manager'],
      );
    }
    const [team] = await query(
      db,
      `INSERT INTO teams (workspace_id, name, key, description, created_by_user_id, private, created_at, updated_at)
       VALUES ($1, 'Team', 'TEAM', '', $2, false, now(), now()) RETURNING id`,
      [ws.id, ownerUser.id],
    );
    await query(
      db,
      `INSERT INTO accounts (account_id, name, workspace_id, owner_user_id, batch_name, currency, timezone_name, last_started_date, last_day_start_date,
         active_rules, account_status, status_label, rules_enabled, is_active, created_at, custom_name, note, primary_result, access_token)
       VALUES ($1, 'Manual', $2, $3, '', 'EUR', 'UTC', '', '2026-01-01', '[{"id": 1}]', 1, 'Active', true, true, now(), '', '', '', 'legacy-token')`,
      [`act_${manual}`, ws.id, ownerUser.id],
    );
    const otherOwner = await createUser(db);
    const other = await createWorkspace(db, otherOwner);
    await query(
      db,
      `INSERT INTO accounts (account_id, name, workspace_id, owner_user_id, batch_name, currency, timezone_name, last_started_date, last_day_start_date,
         active_rules, account_status, status_label, rules_enabled, is_active, created_at, custom_name, note, primary_result)
       VALUES ($1, 'Theirs', $2, $3, '', 'EUR', 'UTC', '', '', '[]', 1, 'Active', false, true, now(), '', '', '')`,
      [`act_${elsewhere}`, other.id, otherOwner.id],
    );
    const info = (number: string, timezone: string) => () => ({ id: `act_${number}`, name: `Meta ${number}`, timezone_name: timezone, currency: 'eur', account_status: 1 });
    target.app.services.metaFetch = fakeMeta({
      [`act_${fresh}`]: info(fresh, 'America/New_York'),
      [`act_${manual}`]: info(manual, 'Europe/Kiev'),
      [`act_${badZone}`]: info(badZone, 'Mars/Olympus'),
      [`act_${elsewhere}`]: info(elsewhere, 'UTC'),
    }).fetcher;

    const notDiscovered = await owner(IMPORT, { id, input: { account_ids: [fresh, missing] } });
    expect(notDiscovered.errors?.[0]).toMatchObject({ message: 'Refresh the list of available Meta ad accounts first', extensions: { statusCode: 422 } });

    const answer = await owner(IMPORT, { id, input: { account_ids: [fresh, `act_${manual}`, fresh, badZone, elsewhere] } });
    expect(answer.errors).toBeUndefined();
    const result = answer.data!.metaConnectionImport!.metaConnection as Row;
    expect(result).toEqual({
      success_count: 2,
      error_count: 2,
      added: [
        { account_id: `act_${fresh}`, name: `Meta ${fresh}`, business_name: 'Agency BM', timezone_name: 'America/New_York', currency: 'EUR', migrated: false, rules_count: 0, rules_enabled: false },
        { account_id: `act_${manual}`, name: `Meta ${manual}`, business_name: 'No Business Manager', timezone_name: 'Europe/Kyiv', currency: 'EUR', migrated: true, rules_count: 1, rules_enabled: true },
      ],
      errors: [
        { account_id: `act_${badZone}`, error: 'Meta did not return a supported time zone' },
        { account_id: `act_${elsewhere}`, error: 'This ad account is already connected in another workspace.' },
      ],
    });

    const accounts = await query(
      db,
      `SELECT account_id, workspace_id, owner_user_id, lead_user_id, meta_connection_id, batch_name, access_token, timezone_name, last_day_start_date,
              status_label, is_active, rules_enabled FROM accounts WHERE account_id = ANY($1::text[]) ORDER BY account_id`,
      [[fresh, manual, badZone, elsewhere].map((number) => `act_${number}`)],
    );
    const byId: Record<string, Row> = Object.fromEntries(accounts.map((row) => [String(row.account_id), row]));
    expect(byId[`act_${fresh}`]).toMatchObject({
      workspace_id: ws.id, owner_user_id: ownerUser.id, lead_user_id: ownerUser.id, meta_connection_id: id, batch_name: 'Agency BM',
      access_token: '', status_label: 'Active (ACTIVE)', is_active: true, rules_enabled: false,
    });
    expect(byId[`act_${manual}`]).toMatchObject({ meta_connection_id: id, access_token: '', timezone_name: 'Europe/Kyiv', last_day_start_date: '', rules_enabled: true });
    expect(byId[`act_${badZone}`]).toBeUndefined();
    expect(byId[`act_${elsewhere}`]).toMatchObject({ workspace_id: other.id, meta_connection_id: null });

    // The new ad account is on the default team; the move is in the audit log.
    const [onTeam] = await query(db, 'SELECT team_id FROM team_accounts WHERE account_id = (SELECT id FROM accounts WHERE account_id = $1)', [`act_${fresh}`]);
    expect(onTeam).toEqual({ team_id: team.id });
    const [event] = await query(
      db,
      "SELECT account_id, action, message, before_state, after_state, details, correlation_id FROM audit_events WHERE workspace_id = $1 AND event_type = 'ACCOUNT_MIGRATED_TO_OAUTH'",
      [ws.id],
    );
    expect(event).toMatchObject({
      account_id: `act_${manual}`,
      action: 'MIGRATE_TO_OAUTH',
      message: `Ad account act_${manual} was moved to an OAuth connection (Ivan FB). Assigned rules were preserved (1).`,
      before_state: { connection_type: 'system_user', previous_connection_id: null, rules_enabled: true, rules_count: 1 },
      after_state: { connection_type: 'facebook_login', meta_connection_id: id, rules_enabled: true, rules_count: 1 },
    });
    expect(event.correlation_id).toMatch(/^[0-9a-f]{32}$/);

    // Discovering again shows both as on this connection.
    target.app.services.metaFetch = fakeMeta({
      debug_token: debugToken,
      'me/adaccounts': () => ({ data: [{ id: `act_${fresh}`, name: 'A' }, { id: `act_${manual}`, name: 'B' }] }),
    }).fetcher;
    const again = (await owner(DISCOVER, { id })).data!.metaConnectionDiscover!.metaConnection as Row;
    expect(again).toMatchObject({ count: 2, imported_count: 2, migratable_count: 0 });
  });
});
