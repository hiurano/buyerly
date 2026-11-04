import { BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation, Unique } from 'typeorm';
import type { MetaConnectionInvite } from '@buyerly/shared';
import { MetaConnectionEntity } from './meta-connection.ts';
import { UserEntity } from './user.ts';
import { WorkspaceEntity } from './workspace.ts';

@Unique('uq_meta_connection_invites_token_hash', ['tokenHash'])
@Index('ix_meta_connection_invites_connected_meta_id', ['connectedMetaId'])
@Index('ix_meta_connection_invites_created_by_user_id', ['createdByUserId'])
@Index('ix_meta_connection_invites_expires_at', ['expiresAt'])
@Index('ix_meta_connection_invites_status', ['status'])
@Index('ix_meta_connection_invites_token_hash', ['tokenHash'], { unique: true })
@Index('ix_meta_connection_invites_workspace_id', ['workspaceId'])
@Entity({ name: 'meta_connection_invites' })
export class MetaConnectionInviteEntity implements MetaConnectionInvite {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'workspace_id', type: 'integer' })
  workspaceId!: number;

  @Column({ name: 'created_by_user_id', type: 'integer', nullable: true })
  createdByUserId!: number | null;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ name: 'token_prefix', type: 'varchar', length: 20 })
  tokenPrefix!: string;

  @Column({ name: 'label', type: 'varchar', length: 255, default: () => "''::character varying" })
  label: string = '';

  @Column({ name: 'status', type: 'varchar', length: 32, default: () => "'pending'::character varying" })
  status: string = 'pending';

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @Column({ name: 'connected_meta_id', type: 'integer', nullable: true })
  connectedMetaId!: number | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date = new Date();

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date = new Date();

  @ManyToOne(() => MetaConnectionEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'connected_meta_id', referencedColumnName: 'id', foreignKeyConstraintName: 'meta_connection_invites_connected_meta_id_fkey' })
  connectedMeta?: Relation<MetaConnectionEntity>;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'meta_connection_invites_created_by_user_id_fkey' })
  createdByUser?: Relation<UserEntity>;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id', referencedColumnName: 'id', foreignKeyConstraintName: 'meta_connection_invites_workspace_id_fkey' })
  workspace?: Relation<WorkspaceEntity>;

  // models.py sets updatedAt on every ORM update (onupdate=utcnow).
  @BeforeUpdate()
  protected touch(): void {
    this.updatedAt = new Date();
  }
}
