import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation, Unique } from 'typeorm';
import type { RuleEntityState } from '@buyerly/shared';
import { WorkspaceEntity } from './workspace.ts';

@Unique('uq_rule_entity_state', ['workspaceId', 'accountId', 'ruleId', 'entityLevel', 'entityId'])
@Index('ix_rule_entity_states_account_id', ['accountId'])
@Index('ix_rule_entity_states_entity_id', ['entityId'])
@Index('ix_rule_entity_states_rule_id', ['ruleId'])
@Index('ix_rule_entity_states_workspace_id', ['workspaceId'])
@Entity({ name: 'rule_entity_states' })
export class RuleEntityStateEntity implements RuleEntityState {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'workspace_id', type: 'integer' })
  workspaceId!: number;

  @Column({ name: 'account_id', type: 'varchar' })
  accountId!: string;

  @Column({ name: 'rule_id', type: 'integer' })
  ruleId!: number;

  @Column({ name: 'entity_level', type: 'varchar' })
  entityLevel!: string;

  @Column({ name: 'entity_id', type: 'varchar' })
  entityId!: string;

  @Column({ name: 'entity_name', type: 'varchar', default: () => "''::character varying" })
  entityName: string = '';

  @Column({ name: 'campaign_id', type: 'varchar', default: () => "''::character varying" })
  campaignId: string = '';

  @Column({ name: 'state', type: 'varchar' })
  state!: string;

  @Column({ name: 'detail', type: 'text', default: () => "''::text" })
  detail: string = '';

  @Column({ name: 'wait_until', type: 'timestamptz', nullable: true })
  waitUntil!: Date | null;

  @Column({ name: 'yielded_to_rule_id', type: 'integer', nullable: true })
  yieldedToRuleId!: number | null;

  @Column({ name: 'yielded_to_rule_name', type: 'varchar', default: () => "''::character varying" })
  yieldedToRuleName: string = '';

  @Column({ name: 'checked_at', type: 'timestamptz' })
  checkedAt!: Date;

  @Column({ name: 'acted_at', type: 'timestamptz', nullable: true })
  actedAt!: Date | null;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id', referencedColumnName: 'id', foreignKeyConstraintName: 'rule_entity_states_workspace_id_fkey' })
  workspace?: Relation<WorkspaceEntity>;
}
