import { BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import type { RuleGroup } from '@buyerly/shared';
import { UserEntity } from './user.ts';
import { WorkspaceEntity } from './workspace.ts';

@Index('ix_rule_groups_owner_user_id', ['ownerUserId'])
@Index('ix_rule_groups_workspace_id', ['workspaceId'])
@Index('ix_rule_groups_workspace_position', ['workspaceId', 'position', 'id'])
@Entity({ name: 'rule_groups' })
export class RuleGroupEntity implements RuleGroup {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'workspace_id', type: 'integer', nullable: true })
  workspaceId!: number | null;

  @Column({ name: 'owner_user_id', type: 'integer', nullable: true })
  ownerUserId!: number | null;

  @Column({ name: 'name', type: 'varchar' })
  name!: string;

  @Column({ name: 'description', type: 'varchar' })
  description: string = '';

  @Column({ name: 'position', type: 'integer' })
  position: number = 0;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date = new Date();

  @Column({ name: 'icon', type: 'varchar', length: 32, default: () => "'custom'::character varying" })
  icon: string = 'custom';

  @Column({ name: 'color', type: 'varchar', length: 7, default: () => "'#95a2b3'::character varying" })
  color: string = '#95a2b3';

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'rule_groups_owner_user_id_fkey' })
  ownerUser?: Relation<UserEntity>;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id', referencedColumnName: 'id', foreignKeyConstraintName: 'rule_groups_workspace_id_fkey' })
  workspace?: Relation<WorkspaceEntity>;

  // models.py sets updatedAt on every ORM update (onupdate=utcnow).
  @BeforeUpdate()
  protected touch(): void {
    this.updatedAt = new Date();
  }
}
