import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UserEntity, WorkspaceEntity, WorkspaceMemberEntity } from '../../src/entities/index.ts';
import { MetaTokenKeyring } from '../../src/meta/tokens.ts';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL, contractTarget, typescriptTarget, type InProcessTarget, type Target } from '../support/target.ts';

// Connecting a Facebook profile (api/meta_oauth.py, #611 stage 4): invite
// links and the OAuth start over GraphQL, the invite landing page and
// Facebook's callback over REST. The contract part runs against both servers
// (CONTRACT_TARGET); neither has Meta settings there, so the OAuth start
// answers 503 on both. The full callback, with Meta answered by the test,
// runs on this server.

type Row = Record<string, unknown>;
interface Answer {
  data?: Record<string, Row | null>;
  errors?: Array<{ message: string; extensions?: { statusCode?: number; detail?: unknown } }>;
}

// db.query's rows, typed.
const query = async (db: DataSource, sql: string, parameters: unknown[] = []): Promise<Row[]> => db.query<Row[]>(sql, parameters);

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const ENCRYPTION_KEY = 'CKOJW1eA4PLOe59rNqizKftdfj0lN17_CIFSpe7ihLw=';
const MISSING = ['META_APP_ID', 'META_APP_SECRET', 'META_LOGIN_CONFIG_ID', 'META_OAUTH_REDIRECT_URI', 'META_TOKEN_ENCRYPTION_KEY'];
const INVITE = 'mutation MetaInviteCreate($input: JSON!) { metaInviteCreate(input: $input) { success lastSyncId metaInvite } }';
const START = 'mutation MetaOAuthStart($returnPath: String, $reconnect: Int) { metaOauthStart(returnPath: $returnPath, reconnectConnectionId: $reconnect) { success authorization } }';

async function person(target: Target, user: UserEntity, workspace: WorkspaceEntity) {
  const browser = new Browser(target, { 'x-workspace-slug': workspace.slug });
  expect((await browser.signIn(user.email!)).status).toBe(200);
  return async (query: string, variables?: Row): Promise<Answer> => {
    const answer = await browser.post('/api/graphql', { query, variables }, browser.csrf());
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

describe.skipIf(!DATABASE_URL)('Meta connections, on both servers', () => {
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

  it('creates an invite link, shows it before sign-in and refuses guests', async () => {
    const { ws, ownerUser, owner, guest } = await world(target, db);
    const answer = await owner(INVITE, { input: { label: '  Buyer Ivan — Profile #3 ', expires_in_hours: 2 } });
    expect(answer.errors).toBeUndefined();
    const invite = answer.data!.metaInviteCreate!.metaInvite as Row;
    const raw = invite.raw_token as string;
    expect(raw).toMatch(/^inv_fb_[A-Za-z0-9_-]{43}$/);
    expect(invite).toMatchObject({
      label: 'Buyer Ivan — Profile #3',
      status: 'pending',
      token_prefix: `${raw.slice(0, 16)}...`,
      invite_url: `https://buyerly.test/connect/meta/${raw}`,
      used_at: null,
      created_by_user_name: 'Ann Owner',
    });
    expect(Date.parse(invite.expires_at as string) - Date.parse(invite.created_at as string)).toBeCloseTo(2 * 3600 * 1000, -4);
    const [stored] = await query(db, 'SELECT workspace_id, token_hash FROM meta_connection_invites WHERE id = $1', [invite.id]);
    expect(stored).toEqual({ workspace_id: ws.id, token_hash: sha256(raw) });
    const [event] = await query(db, 
      "SELECT category, action, message, details FROM audit_events WHERE workspace_id = $1 AND event_type = 'META_INVITE_CREATED'",
      [ws.id],
    );
    expect(event).toEqual({
      category: 'MANUAL_ACTION',
      action: 'CREATE_INVITE',
      message: 'Invite link created for connecting a Facebook profile. Label: “  Buyer Ivan — Profile #3 ”.',
      details: { label: '  Buyer Ivan — Profile #3 ', expires_in_hours: 2 },
    });

    const page = await new Browser(target).get(`/api/meta/invites/public/${raw}`);
    expect(page.status).toBe(200);
    expect(page.json()).toEqual({
      valid: true,
      status: 'pending',
      workspace_name: ws.name,
      workspace_logo_url: ws.logoUrl ?? null,
      label: 'Buyer Ivan — Profile #3',
      inviter_name: ownerUser.fullName,
    });
    await query(db, "UPDATE meta_connection_invites SET expires_at = now() - interval '1 minute' WHERE id = $1", [invite.id]);
    expect((await new Browser(target).get(`/api/meta/invites/public/${raw}`)).json()).toMatchObject({ valid: false, status: 'expired' });
    const unknown = await new Browser(target).get('/api/meta/invites/public/inv_fb_nope');
    expect(unknown.status).toBe(404);
    expect(unknown.json()).toEqual({ detail: 'Invite link not found, or already used' });

    const refused = await guest.call(INVITE, { input: {} });
    expect(refused.errors?.[0]).toMatchObject({ message: "Guests can't perform creating a Meta invite link", extensions: { statusCode: 403 } });
    const invalid = await owner(INVITE, { input: { expires_in_hours: 200, extra: 1 } });
    expect(invalid.errors?.[0].extensions?.statusCode).toBe(422);
  });

  it('answers 503 without Meta settings, and sends a dead invite back to its page', async () => {
    const { owner } = await world(target, db);
    const answer = await owner(START, { returnPath: '/x/campaigns' });
    expect(answer.errors?.[0].extensions).toMatchObject({ statusCode: 503, detail: { code: 'meta_oauth_not_configured', missing: MISSING } });

    const created = (await owner(INVITE, { input: {} })).data!.metaInviteCreate!.metaInvite as Row;
    const start = await new Browser(target).get(`/api/meta/oauth/invite/${created.raw_token as string}`);
    expect(start.status).toBe(503);
    expect(start.json()).toEqual({ detail: { code: 'meta_oauth_not_configured', missing: MISSING } });

    const dead = await new Browser(target).get('/api/meta/oauth/invite/inv_fb_dead');
    expect(dead.status).toBe(303);
    expect(dead.headers.location).toBe('https://buyerly.test/connect/meta/inv_fb_dead?meta_status=invite_invalid');
  });

  it('turns a callback without a usable state back to the app', async () => {
    const browser = new Browser(target);
    const location = async (query: string) => {
      const response = await browser.get(`/api/meta/oauth/callback${query}`);
      expect(response.status).toBe(303);
      return response.headers.location;
    };
    expect(await location('?error=access_denied&state=unknown')).toBe('https://buyerly.test/login?meta_status=cancelled');
    expect(await location('?state=abc')).toBe('https://buyerly.test/login?meta_status=invalid_callback');
    expect(await location('?state=abc&code=xyz')).toBe('https://buyerly.test/login?meta_status=expired_state');
  });
});

// Meta's answers to one code exchange: short-lived token, long-lived token, debug_token, /me.
function metaAnswers(appId: string, identity: Row, expiresAt = Math.floor(Date.now() / 1000) + 60 * 86400) {
  const answers = [
    { access_token: 'short-token' },
    { access_token: 'long-token', expires_in: 5_183_944 },
    { data: { is_valid: true, app_id: appId, expires_at: expiresAt, scopes: ['ads_read', 'ads_management', 'business_management'] } },
    identity,
  ];
  const urls: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    urls.push(input instanceof Request ? input.url : input.toString());
    return new Response(JSON.stringify(answers.shift() ?? {}), { status: 200 });
  }) as typeof fetch;
  return { fetcher, urls };
}

describe.skipIf(!DATABASE_URL)('the Meta OAuth callback on this server', () => {
  let target: InProcessTarget;
  let db: DataSource;

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

  const stateOf = (authorizationUrl: string) => new URL(authorizationUrl).searchParams.get('state')!;

  it('connects a profile, stores the token as Python does, and refuses the state a second time', async () => {
    const { ws, owner } = await world(target, db);
    const started = await owner(START, { returnPath: '/team/campaigns' });
    const authorization = started.data!.metaOauthStart!.authorization as { authorization_url: string; expires_in_seconds: number };
    expect(authorization.expires_in_seconds).toBe(600);
    const url = new URL(authorization.authorization_url);
    expect(`${url.origin}${url.pathname}`).toBe('https://www.facebook.com/v26.0/dialog/oauth');
    expect([...url.searchParams.keys()]).toEqual(['client_id', 'redirect_uri', 'state', 'response_type', 'config_id', 'override_default_response_type']);

    const providerId = `fb-${Date.now()}`;
    const meta = metaAnswers('424242', { id: providerId, name: 'Ivan FB' });
    target.app.services.metaFetch = meta.fetcher;
    const state = stateOf(authorization.authorization_url);
    const callback = await new Browser(target).get(`/api/meta/oauth/callback?state=${state}&code=the-code`);
    expect(callback.status).toBe(303);
    const [connection] = await query(db, 
      'SELECT id, owner_user_id, provider_user_name, access_token_encrypted, granted_scopes, status, last_error FROM meta_connections WHERE workspace_id = $1 AND provider_user_id = $2',
      [ws.id, providerId],
    );
    expect(callback.headers.location).toBe(`https://buyerly.test/team/campaigns?meta_status=connected&meta_connection=${String(connection.id)}`);
    expect(connection).toMatchObject({ provider_user_name: 'Ivan FB', status: 'active', last_error: '', granted_scopes: ['ads_read', 'ads_management', 'business_management'] });
    expect(new MetaTokenKeyring(ENCRYPTION_KEY).decrypt(connection.access_token_encrypted as string)).toBe('long-token');
    expect(meta.urls.map((address) => new URL(address).pathname)).toEqual([
      '/v26.0/oauth/access_token', '/v26.0/oauth/access_token', '/v26.0/debug_token', '/v26.0/me',
    ]);

    const again = await new Browser(target).get(`/api/meta/oauth/callback?state=${state}&code=the-code`);
    expect(again.headers.location).toBe('https://buyerly.test/login?meta_status=expired_state');

    // Reconnecting as someone else is refused; as the same profile it updates the row.
    const reconnect = async (identity: Row) => {
      const answer = await owner(START, { returnPath: '/team/campaigns', reconnect: connection.id });
      target.app.services.metaFetch = metaAnswers('424242', identity).fetcher;
      const authorizationUrl = (answer.data!.metaOauthStart!.authorization as { authorization_url: string }).authorization_url;
      return (await new Browser(target).get(`/api/meta/oauth/callback?state=${stateOf(authorizationUrl)}&code=c`)).headers.location;
    };
    expect(await reconnect({ id: 'someone-else', name: 'Other' })).toBe(
      'https://buyerly.test/team/campaigns?meta_status=identity_mismatch&expected_user=Ivan+FB&actual_user=Other',
    );
    expect(await reconnect({ id: providerId, name: 'Ivan Renamed' })).toBe(
      `https://buyerly.test/team/campaigns?meta_status=connected&meta_connection=${String(connection.id)}`,
    );
    const events = await query(db, 
      "SELECT event_type FROM audit_events WHERE workspace_id = $1 AND event_type LIKE 'META_CONNECTION_%' ORDER BY id",
      [ws.id],
    );
    expect(events.map((row) => row.event_type)).toEqual(['META_CONNECTION_CONNECTED', 'META_CONNECTION_RECONNECTED']);
  });

  it('connects through an invite and uses the invite up', async () => {
    const { ws, owner, ownerUser } = await world(target, db);
    const invite = (await owner(INVITE, { input: { label: 'Profile 7' } })).data!.metaInviteCreate!.metaInvite as Row;
    const start = await new Browser(target).get(`/api/meta/oauth/invite/${invite.raw_token as string}`);
    expect(start.status).toBe(303);
    const providerId = `fb-invite-${Date.now()}`;
    target.app.services.metaFetch = metaAnswers('424242', { id: providerId }).fetcher;
    const callback = await new Browser(target).get(`/api/meta/oauth/callback?state=${stateOf(String(start.headers.location))}&code=c`);
    const [connection] = await query(db, 'SELECT id, owner_user_id, provider_user_name FROM meta_connections WHERE workspace_id = $1 AND provider_user_id = $2', [ws.id, providerId]);
    expect(connection).toMatchObject({ owner_user_id: ownerUser.id, provider_user_name: 'Meta user' });
    expect(callback.headers.location).toBe(`https://buyerly.test/connect/meta/success?meta_status=connected&meta_connection=${String(connection.id)}`);
    const [used] = await query(db, 'SELECT status, connected_meta_id FROM meta_connection_invites WHERE id = $1', [invite.id]);
    expect(used).toEqual({ status: 'used', connected_meta_id: connection.id });
    expect((await new Browser(target).get(`/api/meta/invites/public/${invite.raw_token as string}`)).json()).toMatchObject({ valid: false, status: 'used' });
  });

  it('reports a token from another app as a failed connection', async () => {
    const { owner } = await world(target, db);
    const answer = await owner(START, {});
    target.app.services.metaFetch = metaAnswers('999', { id: 'x' }).fetcher;
    const authorizationUrl = (answer.data!.metaOauthStart!.authorization as { authorization_url: string }).authorization_url;
    const callback = await new Browser(target).get(`/api/meta/oauth/callback?state=${stateOf(authorizationUrl)}&code=c`);
    expect(callback.headers.location).toBe('https://buyerly.test/login?meta_status=connection_failed');
  });
});
