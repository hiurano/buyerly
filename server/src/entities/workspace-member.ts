import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation, Unique } from 'typeorm';
import type { InboxDisplay, NotificationChannels, WorkspaceMember } from '@buyerly/shared';
import { UserEntity } from './user.ts';
import { WorkspaceEntity } from './workspace.ts';

@Unique('uq_workspace_member_user', ['workspaceId', 'userId'])
@Index('ix_workspace_members_user_id', ['userId'])
@Index('ix_workspace_members_workspace_id', ['workspaceId'])
@Entity({ name: 'workspace_members' })
export class WorkspaceMemberEntity implements WorkspaceMember {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'workspace_id', type: 'integer' })
  workspaceId!: number;

  @Column({ name: 'user_id', type: 'integer' })
  userId!: number;

  @Column({ name: 'role', type: 'varchar' })
  role: string = 'owner';

  @Column({ name: 'joined_at', type: 'timestamptz' })
  joinedAt: Date = new Date();

  @Column({ name: 'inbox_read_before', type: 'timestamptz', default: () => 'now()' })
  inboxReadBefore: Date = new Date();

  @Column({ name: 'inbox_deleted_before', type: 'timestamptz', nullable: true })
  inboxDeletedBefore!: Date | null;

  @Column({ name: 'inbox_display', type: 'jsonb', nullable: true })
  inboxDisplay!: InboxDisplay | null;

  @Column({ name: 'notification_channels', type: 'jsonb', nullable: true })
  notificationChannels!: NotificationChannels | null;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'workspace_members_user_id_fkey' })
  user?: Relation<UserEntity>;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id', referencedColumnName: 'id', foreignKeyConstraintName: 'workspace_members_workspace_id_fkey' })
  workspace?: Relation<WorkspaceEntity>;
}
