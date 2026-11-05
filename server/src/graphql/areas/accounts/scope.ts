import type { EntityManager } from 'typeorm';
import { afterCommit, rows } from '../../../database.ts';
import type { UserEntity } from '../../../entities/index.ts';
import { userWorkspaceMember, type ActingMember } from '../../../workspaces/access.ts';
import { accountAccess, allowsAccountPk } from '../../../workspaces/account-access.ts';
import { recordEvent } from '../../../workspaces/audit.ts';
import { RouteError } from '../../errors.ts';

// Which ad accounts a request may read or change (api/deps.py
// get_user_accounts, load_writable_account, ensure_workspace_write_access),
// shared by the area's resolvers.

export interface Scope {
  workspaceId: number | null;
  member: ActingMember | null;
}

export async function scopeOf(tx: EntityManager, user: UserEntity): Promise<Scope> {
  const found = await userWorkspaceMember(tx, user);
  return { workspaceId: found?.workspace.id ?? null, member: found?.member ?? null };
}

// ensure_workspace_write_access: members write, guests only the writes on one
// ad account (which reach them only on their teams' accounts).
export function ensureWriteAccess(scope: Scope, description: string, guestAllowed = false): asserts scope is { workspaceId: number; member: ActingMember } {
  if (!scope.member) throw new RouteError(403, `You do not have access to this workspace for ${description}`);
  if (scope.member.role === 'guest' && !guestAllowed) throw new RouteError(403, `Guests can't perform ${description}`);
}

export function actId(accountId: string): string {
  return accountId.startsWith('act_') ? accountId : `act_${accountId}`;
}

// The workspace's accounts, plus the caller's own legacy accounts that have no
// workspace yet (owned_by), newest first; a private team's account, or for a
// guest anything off their teams, stays out.
export async function visibleAccounts<T extends { id: number; workspace_id: number | null }>(
  tx: EntityManager,
  user: UserEntity,
  scope: Scope,
  columns = '*',
): Promise<T[]> {
  if (scope.workspaceId === null) return [];
  const found = await rows<T>(
    tx,
    `SELECT ${columns} FROM accounts
      WHERE workspace_id = $1 OR (workspace_id IS NULL AND owner_user_id = $2)
      ORDER BY id DESC`,
    [scope.workspaceId, user.id],
  );
  const access = await accountAccess(tx, scope.member && scope.member.id !== null ? scope.member : null, scope.workspaceId);
  return found.filter((account) => account.workspace_id === null || allowsAccountPk(access, account.id));
}

// record_security_event_and_raise with any status: the blocked attempt is
// kept, then refused.
export async function refuseRecorded(
  tx: EntityManager,
  user: UserEntity,
  workspaceId: number | null,
  status: number,
  detail: string,
  action: string,
  resource: { type: string; id: string },
): Promise<never> {
  await recordEvent(tx, {
    workspaceId,
    user,
    actorId: String(user.telegramId || user.id),
    category: 'SECURITY',
    eventType: 'UNAUTHORIZED_ACCESS_ATTEMPT',
    status: 'BLOCKED',
    action,
    message: detail,
    details: { resource_type: resource.type, resource_id: resource.id },
  });
  throw afterCommit(new RouteError(status, detail));
}

export interface AccountRow {
  id: number;
  account_id: string;
  workspace_id: number | null;
  owner_user_id: number | null;
  name: string | null;
  custom_name: string | null;
  note: string | null;
  lead_user_id: number | null;
}

// load_writable_account: the workspace's (or the caller's legacy) account; a
// row elsewhere is a cross-workspace attempt, recorded and answered the same 404.
export async function writableAccount(
  tx: EntityManager,
  user: UserEntity,
  scope: { workspaceId: number; member: ActingMember },
  accountId: string,
  action: string,
): Promise<AccountRow> {
  const id = actId(accountId);
  const [account] = await rows<AccountRow>(
    tx,
    `SELECT * FROM accounts
      WHERE account_id = $1 AND (workspace_id = $2 OR (workspace_id IS NULL AND owner_user_id = $3))
      FOR UPDATE`,
    [id, scope.workspaceId, user.id],
  );
  if (account) {
    const access = await accountAccess(tx, scope.member.id === null ? null : scope.member, scope.workspaceId);
    if (!allowsAccountPk(access, account.id)) throw new RouteError(404, 'Ad account not found.');
    return account;
  }
  const [elsewhere] = await rows(tx, 'SELECT id FROM accounts WHERE account_id = $1', [id]);
  if (elsewhere) {
    await refuseRecorded(tx, user, scope.workspaceId, 404, 'Ad account not found.', action, { type: 'account', id });
  }
  throw new RouteError(404, 'Ad account not found.');
}
