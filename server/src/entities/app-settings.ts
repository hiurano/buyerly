import { BeforeUpdate, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { AppSettings } from '@buyerly/shared';

@Entity({ name: 'app_settings' })
export class AppSettingsEntity implements AppSettings {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'poll_interval_minutes', type: 'integer' })
  pollIntervalMinutes: number = 10;

  @Column({ name: 'critical_rule_interval_minutes', type: 'integer' })
  criticalRuleIntervalMinutes: number = 2;

  @Column({ name: 'stop_confirmation_minutes', type: 'integer' })
  stopConfirmationMinutes: number = 10;

  @Column({ name: 'inventory_cache_minutes', type: 'integer' })
  inventoryCacheMinutes: number = 5;

  @Column({ name: 'account_health_interval_minutes', type: 'integer' })
  accountHealthIntervalMinutes: number = 15;

  @Column({ name: 'max_concurrent_accounts', type: 'integer' })
  maxConcurrentAccounts: number = 3;

  @Column({ name: 'max_concurrent_actions', type: 'integer' })
  maxConcurrentActions: number = 3;

  @Column({ name: 'usage_soft_limit_percent', type: 'integer' })
  usageSoftLimitPercent: number = 60;

  @Column({ name: 'usage_hard_limit_percent', type: 'integer' })
  usageHardLimitPercent: number = 80;

  @Column({ name: 'adaptive_polling_enabled', type: 'boolean' })
  adaptivePollingEnabled: boolean = true;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date = new Date();

  // models.py sets updatedAt on every ORM update (onupdate=utcnow).
  @BeforeUpdate()
  protected touch(): void {
    this.updatedAt = new Date();
  }
}
