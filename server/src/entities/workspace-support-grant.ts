import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import type { WorkspaceSupportGrant } from '@buyerly/shared';
import { UserEntity } from './user.ts';
import { WorkspaceEntity } from './workspace.ts';

@Index('ix_workspace_support_grants_expires_at', ['expiresAt'])
@Index('ix_workspace_support_grants_revoked_at', ['revokedAt'])
@Index('ix_workspace_support_grants_user_id', ['userId'])
@Index('ix_workspace_support_grants_workspace_id', ['workspaceId'])
@Entity({ name: 'workspace_support_grants' })
export class WorkspaceSupportGrantEntity implements WorkspaceSupportGrant {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'workspace_id', type: 'integer' })
  workspaceId!: number;

  @Column({ name: 'user_id', type: 'integer' })
  userId!: number;

  @Column({ name: 'role', type: 'varchar', default: () => "'admin'::character varying" })
  role: string = 'admin';

  @Column({ name: 'reason', type: 'text' })
  reason!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'workspace_support_grants_user_id_fkey' })
  user?: Relation<UserEntity>;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id', referencedColumnName: 'id', foreignKeyConstraintName: 'workspace_support_grants_workspace_id_fkey' })
  workspace?: Relation<WorkspaceEntity>;
}
