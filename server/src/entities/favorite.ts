import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation, Unique } from 'typeorm';
import type { Favorite } from '@buyerly/shared';
import { WorkspaceMemberEntity } from './workspace-member.ts';

@Unique('uq_favorites_member_path', ['memberId', 'path'])
@Index('ix_favorites_member_id', ['memberId'])
@Entity({ name: 'favorites' })
export class FavoriteEntity implements Favorite {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'member_id', type: 'integer' })
  memberId!: number;

  @Column({ name: 'kind', type: 'varchar', length: 16 })
  kind!: string;

  @Column({ name: 'path', type: 'varchar', length: 300 })
  path!: string;

  @Column({ name: 'title', type: 'varchar', length: 200 })
  title!: string;

  @Column({ name: 'position', type: 'integer', default: () => '0' })
  position: number = 0;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @ManyToOne(() => WorkspaceMemberEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_id', referencedColumnName: 'id', foreignKeyConstraintName: 'favorites_member_id_fkey' })
  member?: Relation<WorkspaceMemberEntity>;
}
