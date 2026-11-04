import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import type { JsonObject, SyncAction } from '@buyerly/shared';

@Unique('sync_actions_sync_id_key', ['syncId'])
@Index('ix_sync_actions_created_at', ['createdAt'])
// GIN; TypeORM's @Index cannot name the method.
@Index('ix_sync_actions_sync_groups', ['syncGroups'])
@Entity({ name: 'sync_actions' })
export class SyncActionEntity implements SyncAction {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
  id!: string;

  @Column({ name: 'sync_id', type: 'bigint', nullable: true })
  syncId!: string | null;

  @Column({ name: 'model', type: 'varchar', length: 64 })
  model!: string;

  @Column({ name: 'model_id', type: 'varchar', length: 64 })
  modelId!: string;

  @Column({ name: 'action', type: 'varchar', length: 16 })
  action!: string;

  @Column({ name: 'data', type: 'jsonb' })
  data!: JsonObject;

  @Column({ name: 'sync_groups', type: 'text', array: true })
  syncGroups!: string[];

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
