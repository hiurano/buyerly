import { BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation, Unique } from 'typeorm';
import type { AccountHealth, JsonObject } from '@buyerly/shared';
import { AccountEntity } from './account.ts';
import { WorkspaceEntity } from './workspace.ts';

@Unique('uq_account_health_account_pk', ['accountPk'])
@Index('ix_account_health_account_pk', ['accountPk'])
@Index('ix_account_health_cause', ['cause'])
@Index('ix_account_health_last_checked_at', ['lastCheckedAt'])
@Index('ix_account_health_last_error_at', ['lastErrorAt'])
@Index('ix_account_health_last_success_at', ['lastSuccessAt'])
@Index('ix_account_health_status', ['status'])
@Index('ix_account_health_workspace_id', ['workspaceId'])
@Index('ix_account_health_workspace_status', ['workspaceId', 'status'])
@Entity({ name: 'account_health' })
export class AccountHealthEntity implements AccountHealth {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'workspace_id', type: 'integer' })
  workspaceId!: number;

  @Column({ name: 'account_pk', type: 'integer' })
  accountPk!: number;

  @Column({ name: 'status', type: 'varchar', length: 16, default: () => "'unknown'::character varying" })
  status: string = 'unknown';

  @Column({ name: 'cause', type: 'varchar', length: 16, default: () => "'none'::character varying" })
  cause: string = 'none';

  @Column({ name: 'signals', type: 'jsonb', default: () => "'{}'::jsonb" })
  signals: JsonObject = {};

  @Column({ name: 'consecutive_failures', type: 'integer', default: () => '0' })
  consecutiveFailures: number = 0;

  @Column({ name: 'last_success_at', type: 'timestamptz', nullable: true })
  lastSuccessAt!: Date | null;

  @Column({ name: 'last_error_at', type: 'timestamptz', nullable: true })
  lastErrorAt!: Date | null;

  @Column({ name: 'last_error_code', type: 'varchar', length: 64, default: () => "''::character varying" })
  lastErrorCode: string = '';

  @Column({ name: 'last_error_message', type: 'text', default: () => "''::text" })
  lastErrorMessage: string = '';

  @Column({ name: 'last_checked_at', type: 'timestamptz', default: () => 'now()' })
  lastCheckedAt!: Date;

  @Column({ name: 'last_transition_at', type: 'timestamptz', nullable: true })
  lastTransitionAt!: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date = new Date();

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date = new Date();

  @ManyToOne(() => AccountEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_pk', referencedColumnName: 'id', foreignKeyConstraintName: 'account_health_account_pk_fkey' })
  account?: Relation<AccountEntity>;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id', referencedColumnName: 'id', foreignKeyConstraintName: 'account_health_workspace_id_fkey' })
  workspace?: Relation<WorkspaceEntity>;

  // models.py sets updatedAt on every ORM update (onupdate=utcnow).
  @BeforeUpdate()
  protected touch(): void {
    this.updatedAt = new Date();
  }
}
