import { BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation, Unique } from 'typeorm';
import type { ViewSettingsBlob, WorkspaceViewDefault } from '@buyerly/shared';
import { UserEntity } from './user.ts';
import { WorkspaceEntity } from './workspace.ts';

@Unique('uq_workspace_view_defaults_key', ['workspaceId', 'viewKey'])
@Index('ix_workspace_view_defaults_workspace_id', ['workspaceId'])
@Entity({ name: 'workspace_view_defaults' })
export class WorkspaceViewDefaultEntity implements WorkspaceViewDefault {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'workspace_id', type: 'integer' })
  workspaceId!: number;

  @Column({ name: 'view_key', type: 'varchar', length: 64 })
  viewKey!: string;

  @Column({ name: 'settings', type: 'jsonb' })
  settings!: ViewSettingsBlob;

  @Column({ name: 'updated_by_user_id', type: 'integer', nullable: true })
  updatedByUserId!: number | null;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date = new Date();

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updated_by_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'workspace_view_defaults_updated_by_user_id_fkey' })
  updatedByUser?: Relation<UserEntity>;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id', referencedColumnName: 'id', foreignKeyConstraintName: 'workspace_view_defaults_workspace_id_fkey' })
  workspace?: Relation<WorkspaceEntity>;

  // models.py sets updatedAt on every ORM update (onupdate=utcnow).
  @BeforeUpdate()
  protected touch(): void {
    this.updatedAt = new Date();
  }
}
