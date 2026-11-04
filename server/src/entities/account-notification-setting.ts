import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation, Unique } from 'typeorm';
import type { AccountNotificationSetting } from '@buyerly/shared';
import { WorkspaceMemberEntity } from './workspace-member.ts';

@Unique('uq_account_notification_settings_member_kind', ['memberId', 'accountId', 'kind'])
@Index('ix_account_notification_settings_member_id', ['memberId'])
@Entity({ name: 'account_notification_settings' })
export class AccountNotificationSettingEntity implements AccountNotificationSetting {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'member_id', type: 'integer' })
  memberId!: number;

  @Column({ name: 'account_id', type: 'varchar', length: 64 })
  accountId!: string;

  @Column({ name: 'kind', type: 'varchar', length: 32 })
  kind!: string;

  @Column({ name: 'enabled', type: 'boolean', default: () => 'false' })
  enabled: boolean = false;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date = new Date();

  @ManyToOne(() => WorkspaceMemberEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_id', referencedColumnName: 'id', foreignKeyConstraintName: 'account_notification_settings_member_id_fkey' })
  member?: Relation<WorkspaceMemberEntity>;
}
