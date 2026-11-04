import { BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import type { RuleCondition, RulePreset } from '@buyerly/shared';
import { UserEntity } from './user.ts';
import { WorkspaceEntity } from './workspace.ts';

@Index('ix_rule_presets_owner_user_id', ['ownerUserId'])
@Index('ix_rule_presets_workspace_id', ['workspaceId'])
@Entity({ name: 'rule_presets' })
export class RulePresetEntity implements RulePreset {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'workspace_id', type: 'integer', nullable: true })
  workspaceId!: number | null;

  @Column({ name: 'owner_user_id', type: 'integer', nullable: true })
  ownerUserId!: number | null;

  @Column({ name: 'name', type: 'varchar' })
  name!: string;

  @Column({ name: 'action', type: 'varchar' })
  action: string = 'turn_off';

  @Column({ name: 'conditions', type: 'jsonb' })
  conditions: RuleCondition[] = [];

  @Column({ name: 'condition_logic', type: 'varchar' })
  conditionLogic: string = 'and';

  @Column({ name: 'cooldown_minutes', type: 'integer' })
  cooldownMinutes: number = 0;

  @Column({ name: 'check_interval_minutes', type: 'integer' })
  checkIntervalMinutes: number = 5;

  @Column({ name: 'notify_tg', type: 'boolean' })
  notifyTg: boolean = true;

  @Column({ name: 'budget_change_percent', type: 'double precision' })
  budgetChangePercent: number = 0;

  @Column({ name: 'budget_max_daily', type: 'double precision' })
  budgetMaxDaily: number = 0;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date = new Date();

  @Column({ name: 'enabled', type: 'boolean', default: () => 'true' })
  enabled: boolean = true;

  @Column({ name: 'level', type: 'varchar', length: 16, default: () => "'adset'::character varying" })
  level: string = 'adset';

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'rule_presets_owner_user_id_fkey' })
  ownerUser?: Relation<UserEntity>;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id', referencedColumnName: 'id', foreignKeyConstraintName: 'rule_presets_workspace_id_fkey' })
  workspace?: Relation<WorkspaceEntity>;

  // models.py sets updatedAt on every ORM update (onupdate=utcnow).
  @BeforeUpdate()
  protected touch(): void {
    this.updatedAt = new Date();
  }
}
