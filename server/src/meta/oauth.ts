import { createHmac } from 'node:crypto';
import { pyInt } from '../rules/engine.ts';
import { pyStr } from '../rules/validation.ts';
import { asDict, get, isRecord, iterate, or, strOr, truthy, urlencode, type Json } from './python.ts';

// Facebook Login for Business: the server-side code exchange and token
// checks, ported from meta_api/oauth.py with the same requests and the same
// sanitized errors (#611, stage 4).

// A Meta OAuth failure safe to store or show in the product.
export class MetaOAuthRemoteError extends Error {
  override name = 'MetaOAuthRemoteError';
}

export interface MetaOAuthOptions {
  appId: string;
  appSecret: string;
  redirectUri: string;
  graphVersion: string;
  loginConfigId: string;
  timeoutSeconds?: number;
  // Python always talks to graph.facebook.com here, even with the fake Meta.
  graphOrigin?: string;
  fetch?: typeof fetch;
}

export class MetaOAuthClient {
  readonly appId: string;
  private readonly appSecret: string;
  readonly redirectUri: string;
  readonly graphVersion: string;
  readonly loginConfigId: string;
  readonly graphUrl: string;
  private readonly timeoutSeconds: number;
  private readonly fetcher: typeof fetch;

  constructor(options: MetaOAuthOptions) {
    this.appId = options.appId.trim();
    this.appSecret = options.appSecret.trim();
    this.redirectUri = options.redirectUri.trim();
    this.graphVersion = options.graphVersion.trim();
    this.loginConfigId = options.loginConfigId.trim();
    this.timeoutSeconds = options.timeoutSeconds ?? 20;
    this.graphUrl = `${options.graphOrigin ?? 'https://graph.facebook.com'}/${this.graphVersion}`;
    this.fetcher = options.fetch ?? fetch;
  }

  buildAuthorizationUrl(state: string): string {
    const params = urlencode([
      ['client_id', this.appId],
      ['redirect_uri', this.redirectUri],
      ['state', state],
      ['response_type', 'code'],
      ['config_id', this.loginConfigId],
      ['override_default_response_type', 'true'],
    ]);
    return `https://www.facebook.com/${this.graphVersion}/dialog/oauth?${params}`;
  }

  private async call(method: 'GET' | 'DELETE', path: string, params: Array<[string, unknown]>): Promise<{ status: number; text: string }> {
    const response = await this.fetcher(`${this.graphUrl}/${path.replace(/^\/+/, '')}?${urlencode(params)}`, {
      method,
      signal: AbortSignal.timeout(this.timeoutSeconds * 1000),
    });
    return { status: response.status, text: await response.text() };
  }

  private async getJson(path: string, params: Array<[string, unknown]>): Promise<Json> {
    let response: { status: number; text: string };
    try {
      response = await this.call('GET', path, params);
    } catch {
      throw new MetaOAuthRemoteError('Meta OAuth is temporarily unavailable');
    }
    let payload: unknown;
    try {
      payload = JSON.parse(response.text);
    } catch {
      throw new MetaOAuthRemoteError('Meta OAuth returned an invalid response');
    }
    // `payload.get("error")` runs before the dict check, as in Python.
    if (response.status >= 400 || truthy(get(asDict(payload), 'error'))) {
      const error = isRecord(payload) ? get(payload, 'error') : {};
      const code = isRecord(error) ? get(error, 'code') : null;
      const suffix = truthy(code) ? ` (code ${pyStr(code)})` : '';
      throw new MetaOAuthRemoteError(`Meta OAuth rejected the request${suffix}`);
    }
    return asDict(payload);
  }

  // The code from the callback for a long-lived token, checked, with its owner.
  async exchangeCode(code: string): Promise<{ access_token: string; debug: Json; identity: Json }> {
    const shortLived = await this.getJson('oauth/access_token', [
      ['client_id', this.appId],
      ['client_secret', this.appSecret],
      ['redirect_uri', this.redirectUri],
      ['code', code],
    ]);
    let accessToken = strOr(get(shortLived, 'access_token'), '').trim();
    if (!accessToken) throw new MetaOAuthRemoteError('Meta did not return an access token');

    // Business Login may already return a long-lived token; if the exchange
    // does not apply, the check below still reads the real expiry.
    try {
      const longLived = await this.getJson('oauth/access_token', [
        ['grant_type', 'fb_exchange_token'],
        ['client_id', this.appId],
        ['client_secret', this.appSecret],
        ['fb_exchange_token', accessToken],
      ]);
      accessToken = pyStr(or(get(longLived, 'access_token'), accessToken)).trim();
    } catch (error) {
      if (!(error instanceof MetaOAuthRemoteError)) throw error;
    }

    const debug = await this.debugToken(accessToken);
    const identity = await this.getIdentity(accessToken);
    return { access_token: accessToken, debug, identity };
  }

  async debugToken(accessToken: string): Promise<Json> {
    const payload = await this.getJson('debug_token', [
      ['input_token', accessToken],
      ['access_token', `${this.appId}|${this.appSecret}`],
    ]);
    const data = get(payload, 'data');
    if (!isRecord(data) || get(data, 'is_valid') !== true) throw new MetaOAuthRemoteError('Meta access token is invalid');
    const tokenAppId = strOr(get(data, 'app_id'), '');
    if (tokenAppId && tokenAppId !== this.appId) throw new MetaOAuthRemoteError('Meta access token belongs to another application');
    return data;
  }

  async getIdentity(accessToken: string): Promise<Json> {
    const identity = await this.getJson('me', [
      ['fields', 'id,name'],
      ['access_token', accessToken],
      ['appsecret_proof', this.appsecretProof(accessToken)],
    ]);
    if (!truthy(get(identity, 'id'))) throw new MetaOAuthRemoteError('Meta did not return the authorized user');
    return identity;
  }

  appsecretProof(accessToken: string): string {
    return createHmac('sha256', this.appSecret).update(accessToken, 'utf8').digest('hex');
  }

  // Every ad account the authorized Meta profile can see.
  async discoverAdAccounts(accessToken: string): Promise<Json[]> {
    const rows: Json[] = [];
    const params: Array<[string, unknown]> = [
      ['fields', 'id,account_id,name,account_status,currency,timezone_name,business'],
      ['limit', 100],
      ['access_token', accessToken],
      ['appsecret_proof', this.appsecretProof(accessToken)],
    ];
    const seen = new Set<string>();
    for (let page = 0; page < 200; page += 1) {
      const payload = await this.getJson('me/adaccounts', params);
      const data = get(payload, 'data');
      if (Array.isArray(data)) for (const item of data) if (isRecord(item)) rows.push(item);
      const paging = isRecord(get(payload, 'paging')) ? (payload.paging as Json) : {};
      if (!truthy(get(paging, 'next'))) return rows;
      const cursors = isRecord(get(paging, 'cursors')) ? (paging.cursors as Json) : {};
      const after = strOr(get(cursors, 'after'), '');
      if (!after || seen.has(after)) throw new MetaOAuthRemoteError('Meta returned an invalid accounts cursor');
      seen.add(after);
      const index = params.findIndex(([key]) => key === 'after');
      if (index >= 0) params[index] = ['after', after];
      else params.push(['after', after]);
    }
    throw new MetaOAuthRemoteError('Meta returned too many account pages');
  }

  // Best-effort revocation of the granted permissions.
  async revokePermissions(accessToken: string): Promise<boolean> {
    try {
      const response = await this.call('DELETE', 'me/permissions', [
        ['access_token', accessToken],
        ['appsecret_proof', this.appsecretProof(accessToken)],
      ]);
      const payload: unknown = response.text ? JSON.parse(response.text) : {};
      return truthy(get(asDict(payload), 'success', false));
    } catch {
      return false;
    }
  }
}

export const REQUIRED_META_SCOPES = ['ads_read', 'ads_management', 'business_management'] as const;
export const EXPIRING_THRESHOLD_DAYS = 7;

export type MetaConnectionStatus = 'active' | 'expiring' | 'expired' | 'missing_scopes' | 'needs_reconnect';

export interface MetaConnectionHealth {
  status: MetaConnectionStatus;
  days_until_expiration: number | null;
  missing_scopes: string[];
  granted_scopes: string[];
  token_expires_at: Date | null;
  error: string;
}

// meta_token_expiry: debug_token's expires_at; 0 or nothing means no expiry.
export function metaTokenExpiry(debugData: Json): Date | null {
  let timestamp: number;
  try {
    timestamp = truthy(get(debugData, 'expires_at')) ? pyInt(get(debugData, 'expires_at')) : 0;
  } catch (error) {
    if ((error as Error).name === 'OverflowError') throw error;
    timestamp = 0;
  }
  if (timestamp <= 0) return null;
  return new Date(timestamp * 1000);
}

// evaluate_meta_connection_health: active, expiring, expired, missing_scopes or needs_reconnect.
export function evaluateMetaConnectionHealth(debugData: Json, now: Date = new Date()): MetaConnectionHealth {
  if (!truthy(get(debugData, 'is_valid', false))) {
    return {
      status: 'needs_reconnect',
      days_until_expiration: null,
      missing_scopes: [...REQUIRED_META_SCOPES],
      granted_scopes: [],
      token_expires_at: null,
      error: 'The token is invalid or was revoked in Meta',
    };
  }

  const rawScopes = or(get(debugData, 'scopes'), []);
  const grantedScopes = iterate(rawScopes)
    .filter((scope) => truthy(scope))
    .map((scope) => pyStr(scope));
  const missingScopes = REQUIRED_META_SCOPES.filter((scope) => !grantedScopes.includes(scope));

  const expiresAt = metaTokenExpiry(debugData);
  let days: number | null = null;
  if (expiresAt !== null) {
    const seconds = (expiresAt.getTime() - now.getTime()) / 1000;
    days = Math.max(0, Math.floor(seconds / 86400));
    if (seconds <= 0) {
      return {
        status: 'expired',
        days_until_expiration: 0,
        missing_scopes: missingScopes,
        granted_scopes: grantedScopes,
        token_expires_at: expiresAt,
        error: 'The token has expired',
      };
    }
  }

  if (missingScopes.length > 0) {
    return {
      status: 'missing_scopes',
      days_until_expiration: days,
      missing_scopes: missingScopes,
      granted_scopes: grantedScopes,
      token_expires_at: expiresAt,
      error: `Required permissions are missing: ${missingScopes.join(', ')}`,
    };
  }
  if (days !== null && days <= EXPIRING_THRESHOLD_DAYS) {
    return { status: 'expiring', days_until_expiration: days, missing_scopes: [], granted_scopes: grantedScopes, token_expires_at: expiresAt, error: '' };
  }
  return { status: 'active', days_until_expiration: days, missing_scopes: [], granted_scopes: grantedScopes, token_expires_at: expiresAt, error: '' };
}
