import { BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation, Unique } from 'typeorm';
import type { ViewSetting, ViewSettingsBlob } from '@buyerly/shared';
import { WorkspaceMemberEntity } from './workspace-member.ts';

@Unique('uq_view_settings_member_key', ['memberId', 'viewKey'])
@Index('ix_view_settings_member_id', ['memberId'])
@Entity({ name: 'view_settings' })
export class ViewSettingEntity implements ViewSetting {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'member_id', type: 'integer' })
  memberId!: number;

  @Column({ name: 'view_key', type: 'varchar', length: 64 })
  viewKey!: string;

  @Column({ name: 'settings', type: 'jsonb' })
  settings!: ViewSettingsBlob;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date = new Date();

  @ManyToOne(() => WorkspaceMemberEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_id', referencedColumnName: 'id', foreignKeyConstraintName: 'view_settings_member_id_fkey' })
  member?: Relation<WorkspaceMemberEntity>;

  // models.py sets updatedAt on every ORM update (onupdate=utcnow).
  @BeforeUpdate()
  protected touch(): void {
    this.updatedAt = new Date();
  }
}
