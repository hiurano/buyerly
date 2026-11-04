import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation, Unique } from 'typeorm';
import type { DesktopPushSubscription } from '@buyerly/shared';
import { WebSessionEntity } from './web-session.ts';
import { WorkspaceMemberEntity } from './workspace-member.ts';

@Unique('uq_desktop_push_member_endpoint', ['memberId', 'endpoint'])
@Index('ix_desktop_push_subscriptions_endpoint', ['endpoint'])
@Index('ix_desktop_push_subscriptions_member_id', ['memberId'])
@Index('ix_desktop_push_subscriptions_web_session_id', ['webSessionId'])
@Entity({ name: 'desktop_push_subscriptions' })
export class DesktopPushSubscriptionEntity implements DesktopPushSubscription {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'member_id', type: 'integer' })
  memberId!: number;

  @Column({ name: 'web_session_id', type: 'varchar', length: 36 })
  webSessionId!: string;

  @Column({ name: 'endpoint', type: 'text' })
  endpoint!: string;

  @Column({ name: 'p256dh', type: 'varchar' })
  p256dh!: string;

  @Column({ name: 'auth', type: 'varchar' })
  auth!: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 500 })
  userAgent: string = '';

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @ManyToOne(() => WorkspaceMemberEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_id', referencedColumnName: 'id', foreignKeyConstraintName: 'desktop_push_subscriptions_member_id_fkey' })
  member?: Relation<WorkspaceMemberEntity>;

  @ManyToOne(() => WebSessionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'web_session_id', referencedColumnName: 'id', foreignKeyConstraintName: 'desktop_push_subscriptions_web_session_id_fkey' })
  webSession?: Relation<WebSessionEntity>;
}
