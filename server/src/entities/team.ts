import { BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import type { Team } from '@buyerly/shared';
import { UserEntity } from './user.ts';
import { WorkspaceEntity } from './workspace.ts';

// uq_teams_workspace_name is on an expression, which TypeORM's @Index cannot
// describe; the schema check skips it:
// CREATE UNIQUE INDEX uq_teams_workspace_name ON public.teams USING btree (workspace_id, lower((name)::text)) WHERE (deleted_at IS NULL)
// uq_teams_workspace_key is on an expression, which TypeORM's @Index cannot
// describe; the schema check skips it:
// CREATE UNIQUE INDEX uq_teams_workspace_key ON public.teams USING btree (workspace_id, upper((key)::text)) WHERE (deleted_at IS NULL)
@Index('ix_teams_deleted_at', ['deletedAt'])
@Index('ix_teams_workspace_id', ['workspaceId'])
@Entity({ name: 'teams' })
export class TeamEntity implements Team {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'workspace_id', type: 'integer' })
  workspaceId!: number;

  @Column({ name: 'name', type: 'varchar', length: 48 })
  name!: string;

  @Column({ name: 'key', type: 'varchar', length: 7 })
  key!: string;

  @Column({ name: 'description', type: 'varchar', length: 255, default: () => "''::character varying" })
  description: string = '';

  @Column({ name: 'created_by_user_id', type: 'integer', nullable: true })
  createdByUserId!: number | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date = new Date();

  @Column({ name: 'retired_at', type: 'timestamptz', nullable: true })
  retiredAt!: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @Column({ name: 'private', type: 'boolean', default: () => 'false' })
  private: boolean = false;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'teams_created_by_user_id_fkey' })
  createdByUser?: Relation<UserEntity>;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id', referencedColumnName: 'id', foreignKeyConstraintName: 'teams_workspace_id_fkey' })
  workspace?: Relation<WorkspaceEntity>;

  // models.py sets updatedAt on every ORM update (onupdate=utcnow).
  @BeforeUpdate()
  protected touch(): void {
    this.updatedAt = new Date();
  }
}
