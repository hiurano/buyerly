import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { EntityManager } from 'typeorm';
import { afterCommit, rows } from '../database.ts';
import { AccountEntity, AuditEventEntity, type UserEntity } from '../entities/index.ts';
import { knownTimezone } from '../graphql/areas/accounts/clock.ts';
import { RouteError } from '../graphql/errors.ts';
import { pythonIsoSql } from '../rules/presets.ts';
import { pyInt } from '../rules/engine.ts';
import { pyStr, pyStrip } from '../rules/validation.ts';
import { joinDefaultTeam } from '../workspaces/default-team.ts';
import type { ActingMember } from '../workspaces/access.ts';
import { MetaClient } from './client.ts';
import { oauthClient } from './connections.ts';
import { evaluateMetaConnectionHealth, MetaOAuthRemoteError, REQUIRED_META_SCOPES } from './oauth.ts';
import { get, isRecord, strOr, truthy, type Json } from './python.ts';
import { redactSecrets } from './redact.ts';
import { MetaTokenError, MetaTokenKeyring } from './tokens.ts';
import { canonicalTimezoneName, normalizeCurrency } from './units.ts';

// A workspace's Meta connections and their ad accounts (api/meta_oauth.py
// list_connections, discover_accounts, import_accounts; #611 stage 4).

export interface ConnectionScope {
  workspaceId: number;
  member: ActingMember;
}

const isAdmin = (member: ActingMember): boolean => member.role === 'owner' || member.role === 'admin';

// _json_list: a JSON array stored as text, or [] for anything else.
function jsonList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const decoded: unknown = JSON.parse(value);
      return Array.isArray(decoded) ? decoded : [];
    } catch {
      return [];
    }
  }
  return [];
}

// secrets.token_hex(16)
const correlationId = (): string => randomBytes(16).toString('hex');

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

interface ConnectionRow {
  id: number;
  provider_user_id: string;
  provider_user_name: string;
  status: string;
  granted_scopes: unknown;
  token_expires_at: string | null;
  token_expires_ms: string | null;
  last_validated_at: string | null;
  last_error: string;
  connected_at: string;
}

// list_connections: owners and admins see every connection, others their own; newest change first.
export async function listConnections(tx: EntityManager, user: UserEntity, scope: ConnectionScope | null): Promise<Json[]> {
  if (!scope) return [];
  const now = Date.now();
  const own = !isAdmin(scope.member);
  const found = await rows<ConnectionRow>(
    tx,
    `SELECT id, provider_user_id, provider_user_name, status, granted_scopes, last_error,
            ${pythonIsoSql('token_expires_at')} AS token_expires_at,
            (extract(epoch FROM token_expires_at) * 1000)::text AS token_expires_ms,
            ${pythonIsoSql('last_validated_at')} AS last_validated_at,
            ${pythonIsoSql('connected_at')} AS connected_at
       FROM meta_connections WHERE workspace_id = $1 ${own ? 'AND owner_user_id = $2' : ''}
      ORDER BY updated_at DESC`,
    own ? [scope.workspaceId, user.id] : [scope.workspaceId],
  );
  return found.map((item) => {
    const scopes = jsonList(item.granted_scopes);
    const daysLeft = item.token_expires_ms === null ? null : Math.max(0, Math.floor((Number(item.token_expires_ms) - now) / 86_400_000));
    return {
      id: item.id,
      provider_user_id: item.provider_user_id,
      provider_user_name: item.provider_user_name,
      status: item.status,
      granted_scopes: scopes,
      missing_scopes: REQUIRED_META_SCOPES.filter((name) => !scopes.includes(name)),
      token_expires_at: item.token_expires_at,
      days_until_expiration: daysLeft,
      last_validated_at: item.last_validated_at,
      last_error: item.last_error,
      connected_at: item.connected_at,
    };
  });
}

interface ConnectionFull {
  id: number;
  owner_user_id: number;
  provider_user_id: string;
  provider_user_name: string;
  status: string;
  access_token_encrypted: string;
}

async function connectionRow(tx: EntityManager, id: number): Promise<ConnectionFull> {
  const [row] = await rows<ConnectionFull>(
    tx,
    'SELECT id, owner_user_id, provider_user_id, provider_user_name, status, access_token_encrypted FROM meta_connections WHERE id = $1',
    [id],
  );
  return row;
}

// int(value or 0), 0 when it is not a number.
function statusNumber(value: unknown): number {
  try {
    return pyInt(truthy(value) ? value : 0);
  } catch {
    return 0;
  }
}

// discover_accounts: the connection's ad accounts read from Meta again. A
// token Meta no longer accepts marks the connection for reconnecting.
export async function discoverAccounts(app: FastifyInstance, tx: EntityManager, connectionId: number): Promise<void> {
  const connection = await connectionRow(tx, connectionId);
  let debug: Json;
  let discovered: Json[];
  try {
    const accessToken = new MetaTokenKeyring(app.config.metaTokenEncryptionKey).decrypt(connection.access_token_encrypted);
    const client = oauthClient(app);
    debug = await client.debugToken(accessToken);
    discovered = await client.discoverAdAccounts(accessToken);
  } catch (error) {
    if (!(error instanceof MetaOAuthRemoteError || error instanceof MetaTokenError)) throw error;
    await rows(
      tx,
      `UPDATE meta_connections SET status = 'needs_reconnect', last_error = $2, last_validated_at = now(), updated_at = now()
        WHERE id = $1 RETURNING id`,
      [connectionId, redactSecrets(errorText(error))],
    );
    throw afterCommit(new RouteError(502, 'Meta did not confirm the connection. Connect the profile again.'));
  }

  const existing = new Set(
    (await rows<{ meta_account_id: string }>(tx, 'SELECT meta_account_id FROM meta_connection_assets WHERE connection_id = $1', [connectionId]))
      .map((row) => row.meta_account_id),
  );
  const visible = new Set<string>();
  for (const raw of discovered) {
    const rawId = pyStrip(pyStr(truthy(get(raw, 'id')) ? get(raw, 'id') : truthy(get(raw, 'account_id')) ? get(raw, 'account_id') : ''));
    if (!rawId) continue;
    const accountId = rawId.startsWith('act_') ? rawId : `act_${rawId}`;
    const business = isRecord(get(raw, 'business')) ? (raw.business as Json) : {};
    const currencyValue = get(raw, 'currency');
    const fields = [
      strOr(get(raw, 'name'), accountId),
      strOr(get(business, 'id'), ''),
      strOr(get(business, 'name'), 'No Business Manager'),
      statusNumber(get(raw, 'account_status')),
      normalizeCurrency(truthy(currencyValue) ? pyStr(currencyValue) : ''),
      canonicalTimezoneName(get(raw, 'timezone_name')) || 'UNKNOWN',
    ];
    if (existing.has(accountId) || visible.has(accountId)) {
      await rows(
        tx,
        `UPDATE meta_connection_assets SET name = $3, business_id = $4, business_name = $5, account_status = $6, currency = $7,
           timezone_name = $8, discovered_at = now() WHERE connection_id = $1 AND meta_account_id = $2 RETURNING id`,
        [connectionId, accountId, ...fields],
      );
    } else {
      await rows(
        tx,
        `INSERT INTO meta_connection_assets (connection_id, owner_user_id, meta_account_id, name, business_id, business_name,
           account_status, currency, timezone_name, discovered_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now()) RETURNING id`,
        [connectionId, connection.owner_user_id, accountId, ...fields],
      );
    }
    visible.add(accountId);
  }
  const stale = [...existing].filter((id) => !visible.has(id));
  if (stale.length) {
    await rows(tx, 'DELETE FROM meta_connection_assets WHERE connection_id = $1 AND meta_account_id = ANY($2::text[]) RETURNING id', [connectionId, stale]);
  }

  const health = evaluateMetaConnectionHealth(debug, new Date());
  await rows(
    tx,
    `UPDATE meta_connections SET granted_scopes = $2::jsonb, token_expires_at = $3, status = $4, last_error = $5,
       last_validated_at = now(), updated_at = now() WHERE id = $1 RETURNING id`,
    [connectionId, JSON.stringify(health.granted_scopes), health.token_expires_at, health.status, health.error],
  );
}

interface AssetRow {
  meta_account_id: string;
  name: string;
  business_id: string;
  business_name: string;
  account_status: number;
  currency: string;
  timezone_name: string;
  discovered_at: string;
}

interface ExistingAccount {
  account_id: string;
  meta_connection_id: number | null;
  active_rules: string;
  rules_enabled: boolean;
  custom_name: string | null;
}

// _connection_assets: the connection's ad accounts by Business Manager and
// name, each with whether and where it is already in the workspace.
export async function connectionAssets(tx: EntityManager, user: UserEntity, connectionId: number, scope: ConnectionScope): Promise<Json> {
  const connection = await connectionRow(tx, connectionId);
  const assets = await rows<AssetRow>(
    tx,
    `SELECT meta_account_id, name, business_id, business_name, account_status, currency, timezone_name,
            ${pythonIsoSql('discovered_at')} AS discovered_at
       FROM meta_connection_assets WHERE connection_id = $1 ORDER BY business_name ASC, name ASC`,
    [connectionId],
  );
  const accounts = new Map(
    (
      await rows<ExistingAccount>(
        tx,
        `SELECT account_id, meta_connection_id, active_rules, rules_enabled, custom_name FROM accounts
          WHERE workspace_id = $1 OR (workspace_id IS NULL AND owner_user_id = $2)`,
        [scope.workspaceId, user.id],
      )
    ).map((account) => [account.account_id, account]),
  );
  const serialized = assets.map((asset) => {
    const existing = accounts.get(asset.meta_account_id);
    let importStatus = 'not_imported';
    let imported = false;
    if (existing) {
      if (existing.meta_connection_id === connectionId) {
        importStatus = 'this_connection';
        imported = true;
      } else {
        importStatus = existing.meta_connection_id === null ? 'manual_token' : 'other_connection';
      }
    }
    return {
      account_id: asset.meta_account_id,
      name: asset.name,
      business_id: asset.business_id,
      business_name: asset.business_name,
      account_status: asset.account_status,
      currency: asset.currency,
      timezone_name: asset.timezone_name,
      imported,
      import_status: importStatus,
      can_migrate: Boolean(existing) && !imported,
      rules_count: existing ? jsonList(existing.active_rules).length : 0,
      rules_enabled: existing ? Boolean(existing.rules_enabled) : false,
      custom_name: existing ? existing.custom_name || '' : '',
      discovered_at: asset.discovered_at,
    };
  });
  return {
    connection: { id: connection.id, provider_user_name: connection.provider_user_name, status: connection.status },
    accounts: serialized,
    count: assets.length,
    imported_count: serialized.filter((item) => item.import_status === 'this_connection').length,
    migratable_count: serialized.filter((item) => item.can_migrate).length,
  };
}

// MetaAccountImportRequest's ids, checked and deduplicated before anything is read.
export function requestedAccountIds(accountIds: string[]): string[] {
  const requested: string[] = [];
  for (const raw of accountIds) {
    const value = pyStrip(raw || '');
    const accountId = value.startsWith('act_') ? value : `act_${value}`;
    const numeric = accountId.slice(4);
    if (!/^\d+$/.test(numeric) || numeric.length < 5 || numeric.length > 25) throw new RouteError(422, `Invalid ad account ID: ${value}`);
    if (!requested.includes(accountId)) requested.push(accountId);
  }
  return requested;
}

// The API's Meta client (api/server.py _create_meta_client).
export function metaClient(app: FastifyInstance): MetaClient {
  return new MetaClient({
    graphVersion: app.config.metaGraphVersion,
    baseUrl: app.config.metaGraphBaseUrl,
    appSecret: app.config.metaAppSecret,
    fetch: app.services.metaFetch,
    log: app.log,
  });
}

// Python's RuntimeError inside the import of one ad account.
class ImportRefused extends Error {}

interface ImportedAccount {
  account_id: string;
  name: string;
  business_name: string;
  timezone_name: string;
  currency: string;
  migrated: boolean;
  rules_count: number;
  rules_enabled: boolean;
}

// import_accounts: each requested ad account is read from Meta and added to
// the workspace or moved onto this connection, its rules kept. One that fails
// is reported and leaves nothing behind; the others still go in.
export async function importAccounts(
  app: FastifyInstance,
  tx: EntityManager,
  user: UserEntity,
  connectionId: number,
  scope: ConnectionScope,
  requested: string[],
): Promise<Json> {
  const connection = await connectionRow(tx, connectionId);
  if (connection.status !== 'active') throw new RouteError(409, 'Reconnect your Meta profile first');
  let accessToken: string;
  try {
    accessToken = new MetaTokenKeyring(app.config.metaTokenEncryptionKey).decrypt(connection.access_token_encrypted);
  } catch (error) {
    if (error instanceof MetaTokenError) throw new RouteError(503, 'The Meta connection key is unavailable');
    throw error;
  }
  const assets = new Map(
    (
      await rows<AssetRow>(
        tx,
        `SELECT meta_account_id, name, business_id, business_name FROM meta_connection_assets
          WHERE connection_id = $1 AND meta_account_id = ANY($2::text[])`,
        [connectionId, requested],
      )
    ).map((asset) => [asset.meta_account_id, asset]),
  );
  if (requested.some((id) => !assets.has(id))) throw new RouteError(422, 'Refresh the list of available Meta ad accounts first');

  const client = metaClient(app);
  const added: ImportedAccount[] = [];
  const errors: Array<{ account_id: string; error: string }> = [];
  for (const accountId of requested) {
    const asset = assets.get(accountId)!;
    let savepoint = false;
    try {
      const info = await client.getAccountInfo(accountId, accessToken);
      const timezoneName = canonicalTimezoneName(get(info, 'timezone_name'));
      if (!knownTimezone(timezoneName)) throw new ImportRefused('Meta did not return a supported time zone');
      const currencyValue = get(info, 'currency');
      const currency = normalizeCurrency(truthy(currencyValue) ? pyStr(currencyValue) : '');
      await rows(tx, 'SAVEPOINT meta_account_import');
      savepoint = true;
      const result = await importOne(tx, user, scope, connection, asset, info, timezoneName, currency);
      await rows(tx, 'RELEASE SAVEPOINT meta_account_import');
      added.push(result);
    } catch (error) {
      if (savepoint) await rows(tx, 'ROLLBACK TO SAVEPOINT meta_account_import');
      app.log.warn(`Meta account import failed for ${accountId}`);
      errors.push({ account_id: accountId, error: redactSecrets(errorText(error)) });
    }
  }
  return { success_count: added.length, error_count: errors.length, added, errors };
}

// entity_is_owned_by(account, user)
function ownedBy(account: AccountEntity, user: UserEntity): boolean {
  if (account.workspaceId !== null && user.activeWorkspaceId && account.workspaceId === user.activeWorkspaceId) return true;
  if (account.ownerUserId !== null && user.id) return account.ownerUserId === user.id;
  return false;
}

async function importOne(
  tx: EntityManager,
  user: UserEntity,
  scope: ConnectionScope,
  connection: ConnectionFull,
  asset: AssetRow,
  info: Json,
  timezoneName: string,
  currency: string,
): Promise<ImportedAccount> {
  const accountId = asset.meta_account_id;
  const existing = await tx.findOneBy(AccountEntity, { accountId });
  if (existing) {
    if (existing.workspaceId !== null && existing.workspaceId !== scope.workspaceId) {
      throw new ImportRefused('This ad account is already connected in another workspace.');
    }
    if (existing.workspaceId === scope.workspaceId && !ownedBy(existing, user) && !isAdmin(scope.member)) {
      throw new ImportRefused('This ad account was added by another buyer in this workspace. Only the workspace owner or an admin can change it.');
    }
  }

  const statusCode = pyInt(truthy(get(info, 'account_status')) ? get(info, 'account_status') : 0);
  const statusLabel = strOr(get(info, 'status_label'), `Status #${statusCode}`);
  let migrated = false;
  let rulesCount = 0;
  let previousType = 'none';
  let previousId: number | null = null;
  if (existing) {
    rulesCount = jsonList(existing.activeRules).length;
    if (existing.metaConnectionId !== connection.id) {
      migrated = true;
      previousType = existing.metaConnectionId === null ? 'system_user' : 'other_oauth';
      previousId = existing.metaConnectionId;
    }
  }

  const name = truthy(get(info, 'name')) ? pyStr(get(info, 'name')) : asset.name || accountId;
  const account = existing ?? tx.create(AccountEntity, {
    accountId,
    name,
    workspaceId: scope.workspaceId,
    ownerUserId: user.id,
    leadUserId: user.id,
    accessToken: '',
    rulesEnabled: false,
    isActive: true,
    metaConnectionId: null,
    targetCostPerResult: null,
  });
  if (existing && existing.timezoneName !== timezoneName) account.lastDayStartDate = '';
  account.name = name;
  account.workspaceId = scope.workspaceId;
  account.batchName = asset.business_id ? asset.business_name : '';
  account.accessToken = '';
  account.accessTokenEncrypted = '';
  account.metaConnectionId = connection.id;
  account.timezoneName = timezoneName;
  account.currency = currency;
  account.accountStatus = statusCode;
  account.statusLabel = statusLabel;
  account.isActive = true;
  await tx.save(account);
  // A new ad account joins the workspace's default team, as Linear's issues have one.
  if (!existing) await joinDefaultTeam(tx, account.workspaceId, { accountId: account.id });

  if (migrated) {
    await tx.save(
      tx.create(AuditEventEntity, {
        workspaceId: scope.workspaceId,
        ownerUserId: user.id,
        actorType: 'user',
        actorId: String(user.telegramId || user.id),
        category: 'MANUAL_ACTION',
        eventType: 'ACCOUNT_MIGRATED_TO_OAUTH',
        status: 'SUCCESS',
        accountId,
        accountName: account.name,
        action: 'MIGRATE_TO_OAUTH',
        message:
          `Ad account ${accountId} was moved to an OAuth connection ` +
          `(${connection.provider_user_name || connection.provider_user_id}). ` +
          `Assigned rules were preserved (${rulesCount}).`,
        beforeState: { connection_type: previousType, previous_connection_id: previousId, rules_enabled: account.rulesEnabled, rules_count: rulesCount },
        afterState: { connection_type: 'facebook_login', meta_connection_id: connection.id, rules_enabled: account.rulesEnabled, rules_count: rulesCount },
        details: { provider_user_id: connection.provider_user_id, provider_user_name: connection.provider_user_name },
        correlationId: correlationId(),
      }),
    );
  }
  return {
    account_id: accountId,
    name: account.name,
    business_name: asset.business_name,
    timezone_name: timezoneName,
    currency,
    migrated,
    rules_count: rulesCount,
    rules_enabled: account.rulesEnabled,
  };
}
