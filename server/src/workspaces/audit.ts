import type { EntityManager } from 'typeorm';
import { afterCommit, rows } from '../database.ts';
import { AuditEventEntity, type UserEntity } from '../entities/index.ts';
import { RouteError } from '../graphql/errors.ts';

// The audit events the workspace handlers write (api/routers/members.py,
// api/deps.py record_security_event_and_raise).

type Json = Record<string, unknown>;

export interface WorkspaceEvent {
  workspaceId: number | null;
  user: UserEntity;
  category: string;
  eventType: string;
  status?: string;
  message: string;
  details?: Json;
  action?: string;
  actorId?: string;
}

export async function recordEvent(tx: EntityManager, event: WorkspaceEvent): Promise<void> {
  await tx.save(
    tx.create(AuditEventEntity, {
      workspaceId: event.workspaceId,
      ownerUserId: event.user.id,
      actorType: 'user',
      actorId: event.actorId ?? String(event.user.id),
      category: event.category,
      eventType: event.eventType,
      status: event.status ?? 'SUCCESS',
      action: event.action ?? '',
      message: event.message,
      details: (event.details ?? {}) as AuditEventEntity['details'],
    }),
  );
}

// record_security_event_and_raise: the blocked attempt is kept, then refused.
export async function refuseAndRecord(
  tx: EntityManager,
  user: UserEntity,
  workspaceId: number | null,
  detail: string,
  action: string,
  resource: { type?: string; id?: string } = {},
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
    details: { resource_type: resource.type ?? 'workspace', resource_id: resource.id ?? String(workspaceId ?? '') },
  });
  throw afterCommit(new RouteError(403, detail));
}

// The caller's role in the workspace: their membership's, or a platform
// admin's support grant's. Null when they have neither.
export async function callerRole(tx: EntityManager, user: UserEntity, workspaceId: number): Promise<string | null> {
  const [member] = await rows<{ role: string }>(tx, 'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [workspaceId, user.id]);
  if (member?.role) return member.role;
  if (user.role !== 'admin') return null;
  const [grant] = await rows<{ role: string | null }>(
    tx,
    `SELECT role FROM workspace_support_grants
      WHERE workspace_id = $1 AND user_id = $2 AND expires_at > now() AND revoked_at IS NULL LIMIT 1`,
    [workspaceId, user.id],
  );
  return grant ? grant.role || 'admin' : null;
}
