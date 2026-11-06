import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { EntityManager } from 'typeorm';
import { rows } from '../database.ts';
import { UserEntity } from '../entities/index.ts';
import { HttpError } from '../http/errors.ts';
import { userWorkspaceMember } from '../workspaces/access.ts';
import { recordEvent } from '../workspaces/audit.ts';
import { isoUtc } from '../workspaces/sql.ts';
import { evaluateMetaConnectionHealth, MetaOAuthClient, MetaOAuthRemoteError } from './oauth.ts';
import { strOr, urlencode } from './python.ts';
import { MetaTokenError, MetaTokenKeyring } from './tokens.ts';

// Connecting a Facebook profile (api/meta_oauth.py, #611 stage 4): invite
// links, the OAuth start, and the callback that stores the connection with
// its token encrypted exactly as the Python API stores it, so either server
// reads what the other wrote.

export const OAUTH_STATE_TTL_MINUTES = 10;
export const INVITE_DEFAULT_TTL_HOURS = 24;

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

// secrets.token_urlsafe(n)
const tokenUrlsafe = (bytes: number): string => randomBytes(bytes).toString('base64url');

// HTTPException(503, {"code": "meta_oauth_not_configured", "missing": [...]}).
export class MetaNotConfigured extends Error {
  override name = 'MetaNotConfigured';
  constructor(readonly missing: string[]) {
    super('Meta OAuth is not configured');
  }

  get detail(): { code: string; missing: string[] } {
    return { code: 'meta_oauth_not_configured', missing: this.missing };
  }
}

// _oauth_client: the settings Facebook Login needs, or 503 naming the missing ones.
export function oauthClient(app: FastifyInstance): MetaOAuthClient {
  const { config } = app;
  const missing = (
    [
      ['META_APP_ID', config.metaAppId],
      ['META_APP_SECRET', config.metaAppSecret],
      ['META_LOGIN_CONFIG_ID', config.metaLoginConfigId],
      ['META_OAUTH_REDIRECT_URI', config.metaOauthRedirectUri],
      ['META_TOKEN_ENCRYPTION_KEY', config.metaTokenEncryptionKey],
    ] as const
  )
    .filter(([, value]) => !value.trim())
    .map(([key]) => key);
  if (missing.length) throw new MetaNotConfigured(missing);
  return new MetaOAuthClient({
    appId: config.metaAppId,
    appSecret: config.metaAppSecret,
    redirectUri: config.metaOauthRedirectUri,
    graphVersion: config.metaGraphVersion,
    loginConfigId: config.metaLoginConfigId,
    fetch: app.services.metaFetch,
  });
}

// Any page may start the flow, so the path is checked for shape: one leading
// slash and slug characters only, so it names no other host and carries no query.
const RETURN_PATH = /^\/(?!\/)[A-Za-z0-9_/-]{0,500}$/;
// The app's entry; "/" is the public landing page, outside the app.
export const FALLBACK_RETURN_PATH = '/login';

export function safeReturnPath(value: string | null | undefined): string {
  const path = (value ?? '').trim();
  if (path !== '/' && RETURN_PATH.test(path) && !path.includes('//')) return path;
  return FALLBACK_RETURN_PATH;
}

// _app_redirect: the web app's address for a path and its query.
export function appRedirect(webappUrl: string, path: string, params: Array<[string, string]> = []): string {
  const base = webappUrl.replace(/\/+$/, '');
  const suffix = params.length ? `?${urlencode(params)}` : '';
  return `${base}${path}${suffix}`;
}

// ---------------------------------------------------------------------------
// Invites

export interface MetaInviteRow {
  id: number;
  label: string;
  status: string;
  token_prefix: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

// create_meta_invite: a one-time link to connect a Facebook profile without sharing passwords.
export async function createMetaInvite(
  tx: EntityManager,
  user: UserEntity,
  workspaceId: number,
  webappUrl: string,
  request: { label: string; expires_in_hours: number },
): Promise<Record<string, unknown>> {
  const rawToken = `inv_fb_${tokenUrlsafe(32)}`;
  const [invite] = await rows<MetaInviteRow>(
    tx,
    `INSERT INTO meta_connection_invites (workspace_id, created_by_user_id, token_hash, token_prefix, label, status, expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', now() + make_interval(hours => $6), now(), now())
     RETURNING id, label, status, token_prefix, ${isoUtc('created_at')} AS created_at, ${isoUtc('expires_at')} AS expires_at, ${isoUtc('used_at')} AS used_at`,
    [workspaceId, user.id, sha256(rawToken), `${rawToken.slice(0, 16)}...`, request.label.trim(), request.expires_in_hours],
  );
  await recordEvent(tx, {
    workspaceId,
    user,
    actorId: String(user.telegramId || user.id),
    category: 'MANUAL_ACTION',
    eventType: 'META_INVITE_CREATED',
    action: 'CREATE_INVITE',
    message: `Invite link created for connecting a Facebook profile. Label: “${request.label}”.`,
    details: { label: request.label, expires_in_hours: request.expires_in_hours },
  });
  const url = `${webappUrl.replace(/\/+$/, '')}/connect/meta/${rawToken}`;
  return {
    id: invite.id,
    label: invite.label || '',
    status: invite.status,
    token_prefix: invite.token_prefix,
    invite_url: url,
    created_at: invite.created_at,
    expires_at: invite.expires_at,
    used_at: invite.used_at,
    created_by_user_name: user.fullName || user.username,
    // Only on creation; never stored or shown again.
    raw_token: rawToken,
  };
}

// public_invite_info: what the invite landing page shows before anyone signs in.
export async function publicMetaInviteInfo(tx: EntityManager, token: string): Promise<Record<string, unknown>> {
  const [invite] = await rows<{
    label: string | null; status: string; expired: boolean; workspace_name: string | null; logo_url: string | null; has_workspace: boolean;
    inviter_name: string | null; has_inviter: boolean;
  }>(
    tx,
    `SELECT i.label, i.status, (i.expires_at <= now()) AS expired,
            w.name AS workspace_name, w.logo_url, (w.id IS NOT NULL) AS has_workspace,
            coalesce(nullif(u.full_name, ''), u.username) AS inviter_name, (u.id IS NOT NULL) AS has_inviter
       FROM meta_connection_invites i
       LEFT JOIN workspaces w ON w.id = i.workspace_id
       LEFT JOIN users u ON u.id = i.created_by_user_id
      WHERE i.token_hash = $1`,
    [sha256(token)],
  );
  if (!invite) throw new HttpError(404, 'Invite link not found, or already used');
  const status = invite.status === 'pending' && invite.expired ? 'expired' : invite.status;
  return {
    valid: status === 'pending',
    status,
    workspace_name: invite.has_workspace ? invite.workspace_name : 'Buyerly',
    workspace_logo_url: invite.has_workspace ? invite.logo_url : null,
    label: invite.label || '',
    inviter_name: invite.has_inviter ? invite.inviter_name : null,
  };
}

async function insertState(
  tx: EntityManager,
  state: { workspaceId: number; ownerUserId: number | null; returnPath: string; reconnectConnectionId: number | null; inviteId: number | null },
): Promise<string> {
  const rawState = tokenUrlsafe(32);
  await rows(
    tx,
    `INSERT INTO meta_oauth_states (state_hash, workspace_id, owner_user_id, return_path, reconnect_connection_id, invite_id, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(mins => $7), now()) RETURNING id`,
    [sha256(rawState), state.workspaceId, state.ownerUserId, state.returnPath, state.reconnectConnectionId, state.inviteId, OAUTH_STATE_TTL_MINUTES],
  );
  return rawState;
}

// start_oauth_via_invite: the Facebook dialog for the invite, or back to the
// landing page when the invite is gone, used or expired.
export async function startOAuthViaInvite(app: FastifyInstance, token: string): Promise<string> {
  return app.db.transaction(async (tx) => {
    const [invite] = await rows<{ id: number; workspace_id: number; created_by_user_id: number | null }>(
      tx,
      `SELECT id, workspace_id, created_by_user_id FROM meta_connection_invites
        WHERE token_hash = $1 AND status = 'pending' AND expires_at > now()`,
      [sha256(token)],
    );
    if (!invite) return `${app.config.webappUrl.replace(/\/+$/, '')}/connect/meta/${token}?meta_status=invite_invalid`;
    const client = oauthClient(app);
    const state = await insertState(tx, {
      workspaceId: invite.workspace_id,
      ownerUserId: invite.created_by_user_id,
      returnPath: '/connect/meta/success',
      reconnectConnectionId: null,
      inviteId: invite.id,
    });
    return client.buildAuthorizationUrl(state);
  });
}

// start_oauth: a state for the signed-in member's workspace, and the dialog address.
export async function startOAuth(
  app: FastifyInstance,
  tx: EntityManager,
  user: UserEntity,
  workspaceId: number,
  returnPath: string,
  reconnectConnectionId: number | null,
): Promise<{ authorization_url: string; expires_in_seconds: number }> {
  const client = oauthClient(app);
  const state = await insertState(tx, {
    workspaceId,
    ownerUserId: user.id,
    returnPath: safeReturnPath(returnPath),
    reconnectConnectionId,
    inviteId: null,
  });
  return { authorization_url: client.buildAuthorizationUrl(state), expires_in_seconds: OAUTH_STATE_TTL_MINUTES * 60 };
}

// ---------------------------------------------------------------------------
// The callback

async function callbackReturnPath(app: FastifyInstance, state: string): Promise<string> {
  if (!state) return FALLBACK_RETURN_PATH;
  const [found] = await app.db.transaction((tx) =>
    rows<{ return_path: string | null }>(tx, 'SELECT return_path FROM meta_oauth_states WHERE state_hash = $1', [sha256(state)]),
  );
  return safeReturnPath(found?.return_path ?? '');
}

interface ClaimedState {
  owner_user_id: number;
  workspace_id: number;
  return_path: string;
  reconnect_connection_id: number | null;
  invite_id: number | null;
}

// oauth_callback: where Facebook sends the browser back. Every outcome is a
// redirect into the app with meta_status; the state is single-use.
export async function oauthCallback(app: FastifyInstance, query: { state?: string; code?: string; error?: string }): Promise<string> {
  const webapp = app.config.webappUrl;
  const state = query.state ?? '';
  const code = query.code ?? '';
  if (query.error) return appRedirect(webapp, await callbackReturnPath(app, state), [['meta_status', 'cancelled']]);
  if (!state || !code) return appRedirect(webapp, await callbackReturnPath(app, state), [['meta_status', 'invalid_callback']]);

  const expired = appRedirect(webapp, FALLBACK_RETURN_PATH, [['meta_status', 'expired_state']]);
  // Found, unused and fresh, then claimed: a second callback with the same state loses.
  const claimed = await app.db.transaction(async (tx) => {
    const [row] = await rows<ClaimedState>(
      tx,
      `UPDATE meta_oauth_states SET used_at = now()
        WHERE state_hash = $1 AND used_at IS NULL AND expires_at > now()
        RETURNING owner_user_id, workspace_id, return_path, reconnect_connection_id, invite_id`,
      [sha256(state)],
    );
    return row ?? null;
  });
  if (!claimed) return expired;
  const returnPath = safeReturnPath(claimed.return_path);

  let connectionId: number;
  try {
    const client = oauthClient(app);
    const result = await client.exchangeCode(code);
    const keyring = new MetaTokenKeyring(app.config.metaTokenEncryptionKey);
    const encrypted = keyring.encrypt(result.access_token);
    const providerUserId = strOr(result.identity.id, '');
    const providerUserName = strOr(result.identity.name, 'Meta user');
    const health = evaluateMetaConnectionHealth(result.debug, new Date());

    const outcome = await app.db.transaction(async (tx): Promise<{ redirect: string } | { connectionId: number }> => {
      const owner = await tx.findOneBy(UserEntity, { id: claimed.owner_user_id });
      if (!owner) throw new MetaOAuthRemoteError('Buyerly user no longer exists');
      const found = await userWorkspaceMember(tx, owner, { workspaceId: claimed.workspace_id });
      if (!found || found.member.role === 'guest') {
        return { redirect: appRedirect(webapp, returnPath, [['meta_status', 'permission_denied']]) };
      }

      let reconnectId = claimed.reconnect_connection_id;
      let id: number | null = null;
      if (reconnectId) {
        const [target] = await rows<{ id: number; workspace_id: number; owner_user_id: number; provider_user_id: string; provider_user_name: string | null }>(
          tx,
          'SELECT id, workspace_id, owner_user_id, provider_user_id, provider_user_name FROM meta_connections WHERE id = $1',
          [reconnectId],
        );
        if (
          target && target.workspace_id === claimed.workspace_id &&
          (target.owner_user_id === claimed.owner_user_id || found.member.role === 'owner' || found.member.role === 'admin')
        ) {
          if (target.provider_user_id !== providerUserId) {
            return {
              redirect: appRedirect(webapp, returnPath, [
                ['meta_status', 'identity_mismatch'],
                ['expected_user', target.provider_user_name || target.provider_user_id],
                ['actual_user', providerUserName],
              ]),
            };
          }
          id = target.id;
        } else {
          reconnectId = null;
        }
      }

      const fields = [providerUserName, encrypted, JSON.stringify(health.granted_scopes), health.token_expires_at, health.status, health.error];
      if (id === null) {
        // The upsert also settles two callbacks racing to create the same
        // connection (the IntegrityError branch in Python).
        const [row] = await rows<{ id: number }>(
          tx,
          `INSERT INTO meta_connections (workspace_id, owner_user_id, provider_user_id, provider_user_name, access_token_encrypted,
             granted_scopes, token_expires_at, status, last_error, last_validated_at, connected_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, now(), now(), now(), now())
           ON CONFLICT (workspace_id, provider_user_id) DO UPDATE SET
             provider_user_name = EXCLUDED.provider_user_name, access_token_encrypted = EXCLUDED.access_token_encrypted,
             granted_scopes = EXCLUDED.granted_scopes, token_expires_at = EXCLUDED.token_expires_at, status = EXCLUDED.status,
             last_error = EXCLUDED.last_error, last_validated_at = EXCLUDED.last_validated_at, updated_at = now()
           RETURNING id`,
          [claimed.workspace_id, claimed.owner_user_id, providerUserId, ...fields],
        );
        id = row.id;
      } else {
        await rows(
          tx,
          `UPDATE meta_connections SET provider_user_name = $2, access_token_encrypted = $3, granted_scopes = $4::jsonb,
             token_expires_at = $5, status = $6, last_error = $7, last_validated_at = now(), updated_at = now()
           WHERE id = $1 RETURNING id`,
          [id, ...fields],
        );
        // Accounts of a reconnected profile come back on.
        await rows(
          tx,
          `UPDATE accounts SET is_active = true, status_label = 'Active'
            WHERE workspace_id = $1 AND meta_connection_id = $2 RETURNING id`,
          [claimed.workspace_id, id],
        );
      }

      await recordEvent(tx, {
        workspaceId: claimed.workspace_id,
        user: owner,
        actorId: String(owner.telegramId || owner.id),
        category: 'MANUAL_ACTION',
        eventType: reconnectId ? 'META_CONNECTION_RECONNECTED' : 'META_CONNECTION_CONNECTED',
        action: reconnectId ? 'RECONNECT_CONNECTION' : 'CONNECT_CONNECTION',
        message: reconnectId ? 'Meta connection updated.' : 'Meta connection created.',
        details: { provider_user_id: providerUserId, provider_user_name: providerUserName, status: health.status },
      });

      if (claimed.invite_id) {
        await rows(
          tx,
          `UPDATE meta_connection_invites SET status = 'used', used_at = now(), connected_meta_id = $2, updated_at = now()
            WHERE id = $1 AND status = 'pending' RETURNING id`,
          [claimed.invite_id, id],
        );
      }
      return { connectionId: id };
    });
    if ('redirect' in outcome) return outcome.redirect;
    connectionId = outcome.connectionId;
  } catch (error) {
    if (error instanceof MetaNotConfigured) return appRedirect(webapp, returnPath, [['meta_status', 'not_configured']]);
    if (error instanceof MetaOAuthRemoteError || error instanceof MetaTokenError) {
      app.log.warn('Meta OAuth callback failed after state validation');
      return appRedirect(webapp, returnPath, [['meta_status', 'connection_failed']]);
    }
    throw error;
  }
  return appRedirect(webapp, returnPath, [['meta_status', 'connected'], ['meta_connection', String(connectionId)]]);
}
