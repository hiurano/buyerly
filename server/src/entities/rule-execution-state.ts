import { BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import type { JsonObject, RuleExecutionState } from '@buyerly/shared';
import { UserEntity } from './user.ts';

@Index('ix_rule_execution_states_account_id', ['accountId'])
@Index('ix_rule_execution_states_action', ['action'])
@Index('ix_rule_execution_states_adset_id', ['adsetId'])
@Index('ix_rule_execution_states_correlation_id', ['correlationId'])
@Index('ix_rule_execution_states_execution_key', ['executionKey'], { unique: true })
@Index('ix_rule_execution_states_owner_user_id', ['ownerUserId'])
@Index('ix_rule_execution_states_rule_key', ['ruleKey'])
@Index('ix_rule_execution_states_status', ['status'])
@Entity({ name: 'rule_execution_states' })
export class RuleExecutionStateEntity implements RuleExecutionState {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'execution_key', type: 'varchar' })
  executionKey!: string;

  @Column({ name: 'owner_user_id', type: 'integer', nullable: true })
  ownerUserId!: number | null;

  @Column({ name: 'account_id', type: 'varchar' })
  accountId: string = '';

  @Column({ name: 'adset_id', type: 'varchar' })
  adsetId: string = '';

  @Column({ name: 'rule_key', type: 'varchar' })
  ruleKey: string = '';

  @Column({ name: 'action', type: 'varchar' })
  action: string = '';

  @Column({ name: 'status', type: 'varchar' })
  status: string = 'IDLE';

  @Column({ name: 'correlation_id', type: 'varchar' })
  correlationId: string = '';

  @Column({ name: 'last_attempt_at', type: 'double precision' })
  lastAttemptAt: number = 0;

  @Column({ name: 'last_success_at', type: 'double precision', nullable: true })
  lastSuccessAt!: number | null;

  @Column({ name: 'before_state', type: 'jsonb' })
  beforeState: JsonObject = {};

  @Column({ name: 'after_state', type: 'jsonb' })
  afterState: JsonObject = {};

  @Column({ name: 'details', type: 'jsonb' })
  details: JsonObject = {};

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date = new Date();

  @Column({ name: 'entity_level', type: 'varchar', length: 16, default: () => "'adset'::character varying" })
  entityLevel: string = 'adset';

  @Column({ name: 'entity_id', type: 'varchar', length: 64, default: () => "''::character varying" })
  entityId: string = '';

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'rule_execution_states_owner_user_id_fkey' })
  ownerUser?: Relation<UserEntity>;

  // models.py sets updatedAt on every ORM update (onupdate=utcnow).
  @BeforeUpdate()
  protected touch(): void {
    this.updatedAt = new Date();
  }
}
