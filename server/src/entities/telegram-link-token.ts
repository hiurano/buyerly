import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation, Unique } from 'typeorm';
import type { TelegramLinkToken } from '@buyerly/shared';
import { WorkspaceMemberEntity } from './workspace-member.ts';

@Unique('telegram_link_tokens_token_hash_key', ['tokenHash'])
@Index('ix_telegram_link_tokens_member_id', ['memberId'])
@Entity({ name: 'telegram_link_tokens' })
export class TelegramLinkTokenEntity implements TelegramLinkToken {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'member_id', type: 'integer' })
  memberId!: number;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @ManyToOne(() => WorkspaceMemberEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_id', referencedColumnName: 'id', foreignKeyConstraintName: 'telegram_link_tokens_member_id_fkey' })
  member?: Relation<WorkspaceMemberEntity>;
}
