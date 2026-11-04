import { BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import type { Workspace } from '@buyerly/shared';
import { UserEntity } from './user.ts';

@Index('ix_workspaces_owner_user_id', ['ownerUserId'])
@Index('ix_workspaces_slug', ['slug'], { unique: true })
@Entity({ name: 'workspaces' })
export class WorkspaceEntity implements Workspace {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'name', type: 'varchar' })
  name!: string;

  @Column({ name: 'slug', type: 'varchar' })
  slug!: string;

  @Column({ name: 'badge_text', type: 'varchar' })
  badgeText: string = 'B';

  @Column({ name: 'badge_color', type: 'varchar' })
  badgeColor: string = '#F5A300';

  @Column({ name: 'logo_url', type: 'varchar' })
  logoUrl: string = '';

  @Column({ name: 'owner_user_id', type: 'integer' })
  ownerUserId!: number;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date = new Date();

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'workspaces_owner_user_id_fkey' })
  ownerUser?: Relation<UserEntity>;

  // models.py sets updatedAt on every ORM update (onupdate=utcnow).
  @BeforeUpdate()
  protected touch(): void {
    this.updatedAt = new Date();
  }
}
