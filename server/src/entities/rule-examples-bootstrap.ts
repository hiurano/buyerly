import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation, Unique } from 'typeorm';
import type { RuleExamplesBootstrap } from '@buyerly/shared';
import { UserEntity } from './user.ts';
import { WorkspaceEntity } from './workspace.ts';

@Unique('uq_rule_examples_ws_owner', ['workspaceId', 'ownerUserId'])
@Index('ix_rule_examples_bootstrap_owner_user_id', ['ownerUserId'], { unique: true })
@Index('ix_rule_examples_bootstrap_workspace_id', ['workspaceId'])
@Entity({ name: 'rule_examples_bootstrap' })
export class RuleExamplesBootstrapEntity implements RuleExamplesBootstrap {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'owner_user_id', type: 'integer' })
  ownerUserId!: number;

  @Column({ name: 'version', type: 'integer' })
  version: number = 1;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @Column({ name: 'workspace_id', type: 'integer' })
  workspaceId!: number;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id', referencedColumnName: 'id', foreignKeyConstraintName: 'fk_rule_examples_bootstrap_workspace' })
  workspace?: Relation<WorkspaceEntity>;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'rule_examples_bootstrap_owner_user_id_fkey' })
  ownerUser?: Relation<UserEntity>;
}
