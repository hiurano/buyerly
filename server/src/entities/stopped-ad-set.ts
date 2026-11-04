import { BeforeUpdate, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { StoppedAdSet } from '@buyerly/shared';

@Index('ix_stopped_adsets_account_id', ['accountId'])
@Index('ix_stopped_adsets_adset_id', ['adsetId'], { unique: true })
@Entity({ name: 'stopped_adsets' })
export class StoppedAdSetEntity implements StoppedAdSet {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'account_id', type: 'varchar' })
  accountId!: string;

  @Column({ name: 'adset_id', type: 'varchar' })
  adsetId!: string;

  @Column({ name: 'adset_name', type: 'varchar' })
  adsetName!: string;

  @Column({ name: 'stop_spend', type: 'double precision' })
  stopSpend!: number;

  @Column({ name: 'stop_leads', type: 'integer' })
  stopLeads: number = 0;

  @Column({ name: 'stop_registrations', type: 'integer' })
  stopRegistrations: number = 0;

  @Column({ name: 'is_resolved', type: 'boolean' })
  isResolved: boolean = false;

  @Column({ name: 'stopped_at', type: 'timestamptz' })
  stoppedAt: Date = new Date();

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date = new Date();

  // models.py sets updatedAt on every ORM update (onupdate=utcnow).
  @BeforeUpdate()
  protected touch(): void {
    this.updatedAt = new Date();
  }
}
