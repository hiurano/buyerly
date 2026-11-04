import { BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation, Unique } from 'typeorm';
import type { InboxNotificationState } from '@buyerly/shared';
import { AuditEventEntity } from './audit-event.ts';
import { UserEntity } from './user.ts';

@Unique('uq_inbox_state_user_event', ['userId', 'auditEventId'])
@Index('ix_inbox_notification_states_audit_event_id', ['auditEventId'])
@Index('ix_inbox_notification_states_user_id', ['userId'])
@Entity({ name: 'inbox_notification_states' })
export class InboxNotificationStateEntity implements InboxNotificationState {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'user_id', type: 'integer' })
  userId!: number;

  @Column({ name: 'audit_event_id', type: 'integer' })
  auditEventId!: number;

  @Column({ name: 'is_read', type: 'boolean', default: () => 'false' })
  isRead: boolean = false;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @Column({ name: 'snoozed_until', type: 'timestamptz', nullable: true })
  snoozedUntil!: Date | null;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date = new Date();

  @ManyToOne(() => AuditEventEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'audit_event_id', referencedColumnName: 'id', foreignKeyConstraintName: 'inbox_notification_states_audit_event_id_fkey' })
  auditEvent?: Relation<AuditEventEntity>;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'inbox_notification_states_user_id_fkey' })
  user?: Relation<UserEntity>;

  // models.py sets updatedAt on every ORM update (onupdate=utcnow).
  @BeforeUpdate()
  protected touch(): void {
    this.updatedAt = new Date();
  }
}
