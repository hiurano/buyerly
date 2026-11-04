import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import type { JsonObject, SummarySnapshot } from '@buyerly/shared';
import { UserEntity } from './user.ts';
import { WorkspaceEntity } from './workspace.ts';

@Index('ix_summary_snapshots_created_at', ['createdAt'])
@Index('ix_summary_snapshots_generated_at', ['generatedAt'])
@Index('ix_summary_snapshots_owner_user_id', ['ownerUserId'])
@Index('ix_summary_snapshots_period', ['period'])
@Index('ix_summary_snapshots_user_period_created', ['ownerUserId', 'period', 'createdAt'])
@Index('ix_summary_snapshots_workspace_id', ['workspaceId'])
@Index('ix_summary_snapshots_workspace_period_created', ['workspaceId', 'period', 'createdAt'])
@Entity({ name: 'summary_snapshots' })
export class SummarySnapshotEntity implements SummarySnapshot {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'workspace_id', type: 'integer', nullable: true })
  workspaceId!: number | null;

  @Column({ name: 'owner_user_id', type: 'integer', nullable: true })
  ownerUserId!: number | null;

  @Column({ name: 'period', type: 'varchar' })
  period!: string;

  @Column({ name: 'payload', type: 'jsonb' })
  payload!: JsonObject;

  @Column({ name: 'schema_version', type: 'integer' })
  schemaVersion: number = 1;

  @Column({ name: 'generated_at', type: 'timestamptz' })
  generatedAt: Date = new Date();

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'summary_snapshots_owner_user_id_fkey' })
  ownerUser?: Relation<UserEntity>;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id', referencedColumnName: 'id', foreignKeyConstraintName: 'summary_snapshots_workspace_id_fkey' })
  workspace?: Relation<WorkspaceEntity>;
}
