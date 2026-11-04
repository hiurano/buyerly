import { BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation, Unique } from 'typeorm';
import type { MetaConnection } from '@buyerly/shared';
import { UserEntity } from './user.ts';
import { WorkspaceEntity } from './workspace.ts';

@Unique('uq_meta_connections_workspace_provider_user', ['workspaceId', 'providerUserId'])
@Index('ix_meta_connections_owner_user_id', ['ownerUserId'])
@Index('ix_meta_connections_provider_user_id', ['providerUserId'])
@Index('ix_meta_connections_status', ['status'])
@Index('ix_meta_connections_workspace_id', ['workspaceId'])
@Entity({ name: 'meta_connections' })
export class MetaConnectionEntity implements MetaConnection {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'workspace_id', type: 'integer' })
  workspaceId!: number;

  @Column({ name: 'owner_user_id', type: 'integer' })
  ownerUserId!: number;

  @Column({ name: 'provider_user_id', type: 'varchar' })
  providerUserId!: string;

  @Column({ name: 'provider_user_name', type: 'varchar' })
  providerUserName: string = '';

  @Column({ name: 'access_token_encrypted', type: 'text' })
  accessTokenEncrypted!: string;

  @Column({ name: 'granted_scopes', type: 'jsonb' })
  grantedScopes: string[] = [];

  @Column({ name: 'token_expires_at', type: 'timestamptz', nullable: true })
  tokenExpiresAt!: Date | null;

  @Column({ name: 'status', type: 'varchar' })
  status: string = 'active';

  @Column({ name: 'last_error', type: 'text' })
  lastError: string = '';

  @Column({ name: 'last_validated_at', type: 'timestamptz', nullable: true })
  lastValidatedAt!: Date | null;

  @Column({ name: 'connected_at', type: 'timestamptz' })
  connectedAt: Date = new Date();

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date = new Date();

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'meta_connections_owner_user_id_fkey' })
  ownerUser?: Relation<UserEntity>;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id', referencedColumnName: 'id', foreignKeyConstraintName: 'meta_connections_workspace_id_fkey' })
  workspace?: Relation<WorkspaceEntity>;

  // models.py sets updatedAt on every ORM update (onupdate=utcnow).
  @BeforeUpdate()
  protected touch(): void {
    this.updatedAt = new Date();
  }
}
