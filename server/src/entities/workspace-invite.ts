import { BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import type { WorkspaceInvite } from '@buyerly/shared';
import { UserEntity } from './user.ts';
import { WorkspaceEntity } from './workspace.ts';

@Index('ix_workspace_invites_email', ['email'])
@Index('ix_workspace_invites_expires_at', ['expiresAt'])
@Index('ix_workspace_invites_inviter_user_id', ['inviterUserId'])
@Index('ix_workspace_invites_status', ['status'])
@Index('ix_workspace_invites_token', ['token'], { unique: true })
@Index('ix_workspace_invites_workspace_id', ['workspaceId'])
@Entity({ name: 'workspace_invites' })
export class WorkspaceInviteEntity implements WorkspaceInvite {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'workspace_id', type: 'integer' })
  workspaceId!: number;

  @Column({ name: 'token', type: 'varchar' })
  token!: string;

  @Column({ name: 'email', type: 'varchar', nullable: true })
  email!: string | null;

  @Column({ name: 'role', type: 'varchar' })
  role: string = 'member';

  @Column({ name: 'inviter_user_id', type: 'integer', nullable: true })
  inviterUserId!: number | null;

  @Column({ name: 'status', type: 'varchar' })
  status: string = 'pending';

  @Column({ name: 'max_uses', type: 'integer' })
  maxUses: number = 1;

  @Column({ name: 'used_count', type: 'integer' })
  usedCount: number = 0;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date = new Date();

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'inviter_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'workspace_invites_inviter_user_id_fkey' })
  inviterUser?: Relation<UserEntity>;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id', referencedColumnName: 'id', foreignKeyConstraintName: 'workspace_invites_workspace_id_fkey' })
  workspace?: Relation<WorkspaceEntity>;

  // models.py sets updatedAt on every ORM update (onupdate=utcnow).
  @BeforeUpdate()
  protected touch(): void {
    this.updatedAt = new Date();
  }
}
