import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import type { DeletedItem, JsonObject } from '@buyerly/shared';
import { UserEntity } from './user.ts';
import { WorkspaceEntity } from './workspace.ts';

@Index('ix_deleted_items_deleted_at', ['deletedAt'])
@Index('ix_deleted_items_workspace_id', ['workspaceId'])
@Entity({ name: 'deleted_items' })
export class DeletedItemEntity implements DeletedItem {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'workspace_id', type: 'integer' })
  workspaceId!: number;

  @Column({ name: 'kind', type: 'varchar' })
  kind!: string;

  @Column({ name: 'entity_id', type: 'integer' })
  entityId!: number;

  @Column({ name: 'name', type: 'varchar', default: () => "''::character varying" })
  name: string = '';

  @Column({ name: 'snapshot', type: 'jsonb', default: () => "'{}'::jsonb" })
  snapshot: JsonObject = {};

  @Column({ name: 'deleted_by_user_id', type: 'integer', nullable: true })
  deletedByUserId!: number | null;

  @Column({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date = new Date();

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'deleted_by_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'deleted_items_deleted_by_user_id_fkey' })
  deletedByUser?: Relation<UserEntity>;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id', referencedColumnName: 'id', foreignKeyConstraintName: 'deleted_items_workspace_id_fkey' })
  workspace?: Relation<WorkspaceEntity>;
}
