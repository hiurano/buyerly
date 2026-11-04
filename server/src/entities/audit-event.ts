import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import type { AuditEvent, JsonObject } from '@buyerly/shared';
import { UserEntity } from './user.ts';
import { WorkspaceEntity } from './workspace.ts';

@Index('ix_audit_events_account_id', ['accountId'])
@Index('ix_audit_events_action', ['action'])
@Index('ix_audit_events_actor_type', ['actorType'])
@Index('ix_audit_events_adset_id', ['adsetId'])
@Index('ix_audit_events_category', ['category'])
@Index('ix_audit_events_correlation_id', ['correlationId'])
@Index('ix_audit_events_created_at', ['createdAt'])
@Index('ix_audit_events_event_type', ['eventType'])
@Index('ix_audit_events_owner_user_id', ['ownerUserId'])
@Index('ix_audit_events_reverts_event_id', ['revertsEventId'], { unique: true })
@Index('ix_audit_events_rule_id', ['ruleId'])
@Index('ix_audit_events_status', ['status'])
@Index('ix_audit_events_workspace_id', ['workspaceId'])
@Entity({ name: 'audit_events' })
export class AuditEventEntity implements AuditEvent {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'workspace_id', type: 'integer', nullable: true })
  workspaceId!: number | null;

  @Column({ name: 'owner_user_id', type: 'integer', nullable: true })
  ownerUserId!: number | null;

  @Column({ name: 'actor_type', type: 'varchar' })
  actorType: string = 'system';

  @Column({ name: 'actor_id', type: 'varchar' })
  actorId: string = 'monitoring_worker';

  @Column({ name: 'category', type: 'varchar' })
  category: string = 'RULE_ACTION';

  @Column({ name: 'event_type', type: 'varchar' })
  eventType!: string;

  @Column({ name: 'status', type: 'varchar' })
  status: string = 'SUCCESS';

  @Column({ name: 'account_id', type: 'varchar' })
  accountId: string = '';

  @Column({ name: 'account_name', type: 'varchar' })
  accountName: string = '';

  @Column({ name: 'adset_id', type: 'varchar' })
  adsetId: string = '';

  @Column({ name: 'adset_name', type: 'varchar' })
  adsetName: string = '';

  @Column({ name: 'rule_id', type: 'integer', nullable: true })
  ruleId!: number | null;

  @Column({ name: 'rule_name', type: 'varchar' })
  ruleName: string = '';

  @Column({ name: 'action', type: 'varchar' })
  action: string = '';

  @Column({ name: 'message', type: 'text' })
  message: string = '';

  @Column({ name: 'before_state', type: 'jsonb' })
  beforeState: JsonObject = {};

  @Column({ name: 'after_state', type: 'jsonb' })
  afterState: JsonObject = {};

  @Column({ name: 'details', type: 'jsonb' })
  details: JsonObject = {};

  @Column({ name: 'correlation_id', type: 'varchar' })
  correlationId: string = '';

  @Column({ name: 'reverts_event_id', type: 'integer', nullable: true })
  revertsEventId!: number | null;

  @Column({ name: 'duration_ms', type: 'integer' })
  durationMs: number = 0;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @Column({ name: 'entity_level', type: 'varchar', length: 16, default: () => "'adset'::character varying" })
  entityLevel: string = 'adset';

  @Column({ name: 'entity_id', type: 'varchar', length: 64, default: () => "''::character varying" })
  entityId: string = '';

  @Column({ name: 'entity_name', type: 'varchar', default: () => "''::character varying" })
  entityName: string = '';

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'audit_events_owner_user_id_fkey' })
  ownerUser?: Relation<UserEntity>;

  @ManyToOne(() => AuditEventEntity)
  @JoinColumn({ name: 'reverts_event_id', referencedColumnName: 'id', foreignKeyConstraintName: 'audit_events_reverts_event_id_fkey' })
  revertsEvent?: Relation<AuditEventEntity>;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id', referencedColumnName: 'id', foreignKeyConstraintName: 'audit_events_workspace_id_fkey' })
  workspace?: Relation<WorkspaceEntity>;
}
