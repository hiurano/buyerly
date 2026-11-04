import { BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import type { TeamDocument } from '@buyerly/shared';
import { TeamEntity } from './team.ts';
import { UserEntity } from './user.ts';

@Index('ix_team_documents_team_id', ['teamId'])
@Entity({ name: 'team_documents' })
export class TeamDocumentEntity implements TeamDocument {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'team_id', type: 'integer' })
  teamId!: number;

  @Column({ name: 'title', type: 'varchar', length: 255, default: () => "''::character varying" })
  title: string = '';

  @Column({ name: 'content', type: 'text', default: () => "''::text" })
  content: string = '';

  @Column({ name: 'created_by_user_id', type: 'integer', nullable: true })
  createdByUserId!: number | null;

  @Column({ name: 'updated_by_user_id', type: 'integer', nullable: true })
  updatedByUserId!: number | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date = new Date();

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'team_documents_created_by_user_id_fkey' })
  createdByUser?: Relation<UserEntity>;

  @ManyToOne(() => TeamEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'team_id', referencedColumnName: 'id', foreignKeyConstraintName: 'team_documents_team_id_fkey' })
  team?: Relation<TeamEntity>;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updated_by_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'team_documents_updated_by_user_id_fkey' })
  updatedByUser?: Relation<UserEntity>;

  // models.py sets updatedAt on every ORM update (onupdate=utcnow).
  @BeforeUpdate()
  protected touch(): void {
    this.updatedAt = new Date();
  }
}
