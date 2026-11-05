import type { EntityManager } from 'typeorm';
import { DeletedItemEntity } from '../entities/index.ts';

// Recently deleted (core/trash.py). Deleting a rule or a rule label removes
// the live row exactly as before, so every list keeps reading only live data;
// what the deletion removed is kept in deleted_items for TRASH_RETENTION_DAYS,
// and a restore puts the row back under its old id. An area that deletes into
// the trash calls moveToTrash in the transaction that deletes the row, with a
// snapshot of everything the deletion removed.

export const TRASH_RETENTION_DAYS = 30;
export const KIND_RULE = 'rule';
export const KIND_RULE_GROUP = 'rule_group';

const DAY_MS = 24 * 60 * 60 * 1000;

// When a deleted item stops being restorable.
export function purgeAt(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * DAY_MS);
}

// SQL mirror of purgeAt over a timestamptz column.
export function purgeAtSql(column: string): string {
  return `(${column} + interval '${TRASH_RETENTION_DAYS} days')`;
}

// Drops everything past the retention window; there is no manual purge.
export async function purgeExpired(tx: EntityManager, workspaceId: number): Promise<void> {
  await tx.query(
    `DELETE FROM deleted_items WHERE workspace_id = $1 AND deleted_at < now() - interval '${TRASH_RETENTION_DAYS} days'`,
    [workspaceId],
  );
}

export interface TrashEntry {
  workspaceId: number;
  kind: string;
  entityId: number;
  name: string;
  snapshot: Record<string, unknown>;
  deletedByUserId: number | null;
}

export async function moveToTrash(tx: EntityManager, entry: TrashEntry): Promise<DeletedItemEntity> {
  return tx.save(tx.create(DeletedItemEntity, { ...entry, snapshot: entry.snapshot as DeletedItemEntity['snapshot'], deletedAt: new Date() }));
}
