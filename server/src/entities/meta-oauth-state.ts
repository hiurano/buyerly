import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import type { MetaOAuthState } from '@buyerly/shared';
import { MetaConnectionInviteEntity } from './meta-connection-invite.ts';
import { MetaConnectionEntity } from './meta-connection.ts';
import { UserEntity } from './user.ts';
import { WorkspaceEntity } from './workspace.ts';

@Index('ix_meta_oauth_states_expires_at', ['expiresAt'])
@Index('ix_meta_oauth_states_invite_id', ['inviteId'])
@Index('ix_meta_oauth_states_owner_user_id', ['ownerUserId'])
@Index('ix_meta_oauth_states_reconnect_connection_id', ['reconnectConnectionId'])
@Index('ix_meta_oauth_states_state_hash', ['stateHash'], { unique: true })
@Index('ix_meta_oauth_states_workspace_id', ['workspaceId'])
@Entity({ name: 'meta_oauth_states' })
export class MetaOAuthStateEntity implements MetaOAuthState {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'state_hash', type: 'varchar' })
  stateHash!: string;

  @Column({ name: 'owner_user_id', type: 'integer' })
  ownerUserId!: number;

  @Column({ name: 'return_path', type: 'varchar' })
  returnPath: string = '/';

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @Column({ name: 'reconnect_connection_id', type: 'integer', nullable: true })
  reconnectConnectionId!: number | null;

  @Column({ name: 'workspace_id', type: 'integer' })
  workspaceId!: number;

  @Column({ name: 'invite_id', type: 'integer', nullable: true })
  inviteId!: number | null;

  @ManyToOne(() => MetaConnectionInviteEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'invite_id', referencedColumnName: 'id', foreignKeyConstraintName: 'fk_meta_oauth_states_invite_id' })
  invite?: Relation<MetaConnectionInviteEntity>;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'meta_oauth_states_owner_user_id_fkey' })
  ownerUser?: Relation<UserEntity>;

  @ManyToOne(() => MetaConnectionEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reconnect_connection_id', referencedColumnName: 'id', foreignKeyConstraintName: 'meta_oauth_states_reconnect_connection_id_fkey' })
  reconnectConnection?: Relation<MetaConnectionEntity>;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id', referencedColumnName: 'id', foreignKeyConstraintName: 'meta_oauth_states_workspace_id_fkey' })
  workspace?: Relation<WorkspaceEntity>;
}
