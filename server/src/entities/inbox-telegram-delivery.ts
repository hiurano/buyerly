import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation, Unique } from 'typeorm';
import type { InboxTelegramDelivery } from '@buyerly/shared';
import { AuditEventEntity } from './audit-event.ts';
import { UserEntity } from './user.ts';

@Unique('uq_inbox_telegram_user_event', ['userId', 'auditEventId'])
@Index('ix_inbox_telegram_deliveries_audit_event_id', ['auditEventId'])
@Index('ix_inbox_telegram_deliveries_user_id', ['userId'])
@Entity({ name: 'inbox_telegram_deliveries' })
export class InboxTelegramDeliveryEntity implements InboxTelegramDelivery {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'user_id', type: 'integer' })
  userId!: number;

  @Column({ name: 'audit_event_id', type: 'integer' })
  auditEventId!: number;

  @Column({ name: 'chat_id', type: 'bigint' })
  chatId!: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @ManyToOne(() => AuditEventEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'audit_event_id', referencedColumnName: 'id', foreignKeyConstraintName: 'inbox_telegram_deliveries_audit_event_id_fkey' })
  auditEvent?: Relation<AuditEventEntity>;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'inbox_telegram_deliveries_user_id_fkey' })
  user?: Relation<UserEntity>;
}
