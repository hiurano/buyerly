import { BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import type { AutomationScheduleState } from '@buyerly/shared';
import { UserEntity } from './user.ts';

@Index('ix_automation_schedule_states_account_id', ['accountId'])
@Index('ix_automation_schedule_states_owner_user_id', ['ownerUserId'])
@Index('ix_automation_schedule_states_rule_key', ['ruleKey'])
@Index('ix_automation_schedule_states_state_key', ['stateKey'], { unique: true })
@Entity({ name: 'automation_schedule_states' })
export class AutomationScheduleStateEntity implements AutomationScheduleState {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'state_key', type: 'varchar' })
  stateKey!: string;

  @Column({ name: 'owner_user_id', type: 'integer', nullable: true })
  ownerUserId!: number | null;

  @Column({ name: 'account_id', type: 'varchar' })
  accountId: string = '';

  @Column({ name: 'rule_key', type: 'varchar' })
  ruleKey: string = '';

  @Column({ name: 'last_checked_at', type: 'double precision' })
  lastCheckedAt: number = 0;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date = new Date();

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'automation_schedule_states_owner_user_id_fkey' })
  ownerUser?: Relation<UserEntity>;

  // models.py sets updatedAt on every ORM update (onupdate=utcnow).
  @BeforeUpdate()
  protected touch(): void {
    this.updatedAt = new Date();
  }
}
