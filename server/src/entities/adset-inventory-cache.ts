import { BeforeUpdate, Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { AdsetInventoryCache, JsonObject } from '@buyerly/shared';

@Index('ix_adset_inventory_cache_account_id', ['accountId'])
@Index('ix_adset_inventory_cache_expires_at', ['expiresAt'])
@Entity({ name: 'adset_inventory_cache' })
export class AdsetInventoryCacheEntity implements AdsetInventoryCache {
  @PrimaryColumn({ name: 'account_id', type: 'varchar' })
  accountId!: string;

  @Column({ name: 'adsets_payload', type: 'jsonb' })
  adsetsPayload!: JsonObject[];

  @Column({ name: 'version', type: 'integer' })
  version: number = 1;

  @Column({ name: 'fetched_at', type: 'timestamptz' })
  fetchedAt: Date = new Date();

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date = new Date();

  // models.py sets updatedAt on every ORM update (onupdate=utcnow).
  @BeforeUpdate()
  protected touch(): void {
    this.updatedAt = new Date();
  }
}
