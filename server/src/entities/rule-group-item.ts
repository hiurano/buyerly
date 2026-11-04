import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation, Unique } from 'typeorm';
import type { RuleGroupItem } from '@buyerly/shared';
import { RuleGroupEntity } from './rule-group.ts';
import { RulePresetEntity } from './rule-preset.ts';

@Unique('uq_rule_group_preset', ['groupId', 'presetId'])
@Index('ix_rule_group_items_group_id', ['groupId'])
@Index('ix_rule_group_items_preset_id', ['presetId'])
@Entity({ name: 'rule_group_items' })
export class RuleGroupItemEntity implements RuleGroupItem {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'group_id', type: 'integer' })
  groupId!: number;

  @Column({ name: 'preset_id', type: 'integer' })
  presetId!: number;

  @Column({ name: 'position', type: 'integer' })
  position: number = 0;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @ManyToOne(() => RuleGroupEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id', referencedColumnName: 'id', foreignKeyConstraintName: 'rule_group_items_group_id_fkey' })
  group?: Relation<RuleGroupEntity>;

  @ManyToOne(() => RulePresetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'preset_id', referencedColumnName: 'id', foreignKeyConstraintName: 'rule_group_items_preset_id_fkey' })
  preset?: Relation<RulePresetEntity>;
}
