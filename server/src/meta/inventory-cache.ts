import type { FastifyBaseLogger } from 'fastify';
import type { EntityManager } from 'typeorm';
import { rows, type Database } from '../database.ts';
import type { InventoryCacheProvider } from './client.ts';
import { pyStr } from '../rules/validation.ts';
import { isRecord, truthy, type Json } from './python.ts';

// The ad set inventory every process shares (services/inventory_cache.py
// AdsetInventoryService and PostgreSQLInventoryCache): one row per ad account
// in adset_inventory_cache, read by both servers' Meta clients.

// _normalize_account_id
function normalized(accountId: string): string {
  const account = String(accountId || '').trim();
  if (!account) return '';
  return account.startsWith('act_') ? account : `act_${account}`;
}

// update_adset_status: the ad set's status in the cached rows; false when the
// account has no row or the row lacks the ad set.
export async function updateCachedAdsetStatus(tx: EntityManager, accountId: string, adsetId: string, status: string): Promise<boolean> {
  const account = normalized(accountId);
  const target = String(adsetId).trim();
  if (!account || !target) return false;
  const [row] = await rows<{ adsets_payload: unknown }>(
    tx,
    'SELECT adsets_payload FROM adset_inventory_cache WHERE account_id = $1 FOR UPDATE',
    [account],
  );
  if (!row) return false;
  const payload = Array.isArray(row.adsets_payload) ? (row.adsets_payload as unknown[]) : [];
  let found = false;
  for (const item of payload) {
    if (!isRecord(item)) continue;
    if (pyStr(truthy(item.id) ? item.id : item.adset_id) === target) {
      item.status = status;
      item.effective_status = status;
      found = true;
    }
  }
  if (!found) return false;
  await rows(
    tx,
    `UPDATE adset_inventory_cache SET adsets_payload = $2::jsonb, updated_at = now(), version = coalesce(version, 0) + 1
      WHERE account_id = $1 RETURNING account_id`,
    [account, JSON.stringify(payload)],
  );
  return true;
}

// invalidate_inventory
export async function invalidateCachedInventory(tx: EntityManager, accountId: string): Promise<boolean> {
  const account = normalized(accountId);
  if (!account) return false;
  await rows(tx, 'DELETE FROM adset_inventory_cache WHERE account_id = $1 RETURNING account_id', [account]);
  return true;
}

// PostgreSQLInventoryCache: each call in its own transaction; a failure is
// logged and treated as a miss, never raised into the Meta call.
export class PostgresInventoryCache implements InventoryCacheProvider {
  constructor(
    private readonly db: Database,
    private readonly log: Pick<FastifyBaseLogger, 'warn'>,
  ) {}

  async getInventory(accountId: string): Promise<Json[] | null> {
    const account = normalized(accountId);
    if (!account) return null;
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await rows<{ adsets_payload: unknown; fresh: boolean }>(
          tx,
          'SELECT adsets_payload, expires_at > now() AS fresh FROM adset_inventory_cache WHERE account_id = $1',
          [account],
        );
        if (!row || !row.fresh || !Array.isArray(row.adsets_payload)) return null;
        return (row.adsets_payload as unknown[]).filter(isRecord).map((item) => ({ ...item }));
      });
    } catch (error) {
      this.log.warn(`PostgreSQLInventoryCache get error: ${String(error)}`);
      return null;
    }
  }

  // save_inventory, with its stale-overwrite protection: a row changed after
  // this fetch began is newer than what the fetch saw, and is kept.
  async setInventory(accountId: string, adsets: Json[], { ttlSeconds, requestStartedAt }: { ttlSeconds: number; requestStartedAt: Date }): Promise<void> {
    const account = normalized(accountId);
    if (!account) return;
    const clean = adsets.filter(isRecord).map((row) => ({ ...row }));
    try {
      await this.db.transaction(async (tx) => {
        const [row] = await rows<{ newer: boolean }>(
          tx,
          'SELECT updated_at > $2::timestamptz AS newer FROM adset_inventory_cache WHERE account_id = $1 FOR UPDATE',
          [account, requestStartedAt],
        );
        const ttl = Math.max(30, Math.trunc(ttlSeconds));
        if (row) {
          if (row.newer) return;
          await rows(
            tx,
            `UPDATE adset_inventory_cache SET adsets_payload = $2::jsonb, fetched_at = $3, expires_at = now() + make_interval(secs => $4),
               updated_at = now(), version = coalesce(version, 0) + 1 WHERE account_id = $1 RETURNING account_id`,
            [account, JSON.stringify(clean), requestStartedAt, ttl],
          );
        } else {
          await rows(
            tx,
            `INSERT INTO adset_inventory_cache (account_id, adsets_payload, version, fetched_at, expires_at, updated_at)
             VALUES ($1, $2::jsonb, 1, $3, now() + make_interval(secs => $4), now()) RETURNING account_id`,
            [account, JSON.stringify(clean), requestStartedAt, ttl],
          );
        }
      });
    } catch (error) {
      this.log.warn(`PostgreSQLInventoryCache set error: ${String(error)}`);
    }
  }

  async updateStatus({ accountId, adsetId, status }: { accountId: string; adsetId: string; status: string }): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        if (!(await updateCachedAdsetStatus(tx, accountId, adsetId, status))) await invalidateCachedInventory(tx, accountId);
      });
    } catch (error) {
      this.log.warn(`PostgreSQLInventoryCache update_status error: ${String(error)}`);
    }
  }

  async invalidate(accountId: string): Promise<void> {
    try {
      await this.db.transaction((tx) => invalidateCachedInventory(tx, accountId));
    } catch (error) {
      this.log.warn(`PostgreSQLInventoryCache invalidate error: ${String(error)}`);
    }
  }
}
