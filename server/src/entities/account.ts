import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import type { Account } from '@buyerly/shared';
import { MetaConnectionEntity } from './meta-connection.ts';
import { UserEntity } from './user.ts';
import { WorkspaceEntity } from './workspace.ts';

@Index('ix_accounts_account_id', ['accountId'], { unique: true })
@Index('ix_accounts_lead_user_id', ['leadUserId'])
@Index('ix_accounts_meta_connection_id', ['metaConnectionId'])
@Index('ix_accounts_owner_user_id', ['ownerUserId'])
@Index('ix_accounts_workspace_id', ['workspaceId'])
@Entity({ name: 'accounts' })
export class AccountEntity implements Account {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'workspace_id', type: 'integer', nullable: true })
  workspaceId!: number | null;

  @Column({ name: 'account_id', type: 'varchar' })
  accountId!: string;

  @Column({ name: 'name', type: 'varchar' })
  name!: string;

  @Column({ name: 'custom_name', type: 'varchar' })
  customName: string = '';

  @Column({ name: 'note', type: 'text' })
  note: string = '';

  @Column({ name: 'access_token', type: 'varchar', nullable: true, default: () => "''::character varying" })
  accessToken: string | null = '';

  @Column({ name: 'meta_connection_id', type: 'integer', nullable: true })
  metaConnectionId!: number | null;

  @Column({ name: 'owner_user_id', type: 'integer', nullable: true })
  ownerUserId!: number | null;

  @Column({ name: 'batch_name', type: 'varchar' })
  batchName: string = '';

  @Column({ name: 'currency', type: 'varchar' })
  currency: string = 'UNKNOWN';

  @Column({ name: 'timezone_name', type: 'varchar' })
  timezoneName: string = 'UTC';

  @Column({ name: 'last_started_date', type: 'varchar' })
  lastStartedDate: string = '';

  @Column({ name: 'last_day_start_date', type: 'varchar' })
  lastDayStartDate: string = '';

  @Column({ name: 'active_rules', type: 'text' })
  activeRules: string = '[]';

  @Column({ name: 'account_status', type: 'integer' })
  accountStatus: number = 1;

  @Column({ name: 'status_label', type: 'varchar' })
  statusLabel: string = 'Active (ACTIVE)';

  @Column({ name: 'rules_enabled', type: 'boolean' })
  rulesEnabled: boolean = false;

  @Column({ name: 'is_active', type: 'boolean' })
  isActive: boolean = true;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @Column({ name: 'access_token_encrypted', type: 'text', nullable: true, default: () => "''::text" })
  accessTokenEncrypted: string | null = '';

  @Column({ name: 'primary_result', type: 'varchar', default: () => "''::character varying" })
  primaryResult: string = '';

  @Column({ name: 'target_cost_per_result', type: 'double precision', nullable: true })
  targetCostPerResult!: number | null;

  @Column({ name: 'lead_user_id', type: 'integer', nullable: true })
  leadUserId!: number | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'lead_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'accounts_lead_user_id_fkey' })
  leadUser?: Relation<UserEntity>;

  @ManyToOne(() => MetaConnectionEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'meta_connection_id', referencedColumnName: 'id', foreignKeyConstraintName: 'accounts_meta_connection_id_fkey' })
  metaConnection?: Relation<MetaConnectionEntity>;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'accounts_owner_user_id_fkey' })
  ownerUser?: Relation<UserEntity>;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id', referencedColumnName: 'id', foreignKeyConstraintName: 'accounts_workspace_id_fkey' })
  workspace?: Relation<WorkspaceEntity>;
}
