import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation, Unique } from 'typeorm';
import type { TelegramConnection } from '@buyerly/shared';
import { WorkspaceMemberEntity } from './workspace-member.ts';

@Unique('telegram_connections_member_id_key', ['memberId'])
@Index('ix_telegram_connections_chat_id', ['chatId'])
@Entity({ name: 'telegram_connections' })
export class TelegramConnectionEntity implements TelegramConnection {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'member_id', type: 'integer' })
  memberId!: number;

  @Column({ name: 'chat_id', type: 'bigint' })
  chatId!: string;

  @Column({ name: 'username', type: 'varchar', nullable: true })
  username!: string | null;

  @Column({ name: 'first_name', type: 'varchar', nullable: true })
  firstName!: string | null;

  @Column({ name: 'connected_at', type: 'timestamptz' })
  connectedAt: Date = new Date();

  @Column({ name: 'delivery_error', type: 'varchar', nullable: true })
  deliveryError!: string | null;

  @Column({ name: 'delivery_error_at', type: 'timestamptz', nullable: true })
  deliveryErrorAt!: Date | null;

  @ManyToOne(() => WorkspaceMemberEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_id', referencedColumnName: 'id', foreignKeyConstraintName: 'telegram_connections_member_id_fkey' })
  member?: Relation<WorkspaceMemberEntity>;
}
