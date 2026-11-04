import { BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation, Unique } from 'typeorm';
import type { AnalyticsEntityFact, JsonObject } from '@buyerly/shared';
import { WorkspaceEntity } from './workspace.ts';

@Unique('uq_analytics_facts_ws_acc_level_entity_date', ['workspaceId', 'accountId', 'entityLevel', 'entityId', 'date'])
@Index('ix_analytics_facts_acc_date', ['accountId', 'date'])
@Index('ix_analytics_facts_account_id', ['accountId'])
@Index('ix_analytics_facts_date', ['date'])
@Index('ix_analytics_facts_entity_id', ['entityId'])
@Index('ix_analytics_facts_entity_level', ['entityLevel'])
@Index('ix_analytics_facts_parent_entity_id', ['parentEntityId'])
@Index('ix_analytics_facts_workspace_id', ['workspaceId'])
@Index('ix_analytics_facts_ws_date_level', ['workspaceId', 'date', 'entityLevel'])
@Index('ix_analytics_facts_ws_parent_date', ['workspaceId', 'parentEntityId', 'date'])
@Entity({ name: 'analytics_entity_daily_facts' })
export class AnalyticsEntityFactEntity implements AnalyticsEntityFact {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
  id!: string;

  @Column({ name: 'workspace_id', type: 'integer' })
  workspaceId!: number;

  @Column({ name: 'account_id', type: 'varchar' })
  accountId!: string;

  @Column({ name: 'entity_level', type: 'varchar', length: 16 })
  entityLevel!: string;

  @Column({ name: 'entity_id', type: 'varchar', length: 64 })
  entityId!: string;

  @Column({ name: 'entity_name', type: 'varchar', length: 255, default: () => "''::character varying" })
  entityName: string = '';

  @Column({ name: 'parent_entity_id', type: 'varchar', length: 64, default: () => "''::character varying" })
  parentEntityId: string = '';

  @Column({ name: 'date', type: 'varchar', length: 10 })
  date!: string;

  @Column({ name: 'currency', type: 'varchar', length: 10, default: () => "'UNKNOWN'::character varying" })
  currency: string = 'UNKNOWN';

  @Column({ name: 'spend', type: 'double precision', default: () => "'0'::double precision" })
  spend: number = 0;

  @Column({ name: 'impressions', type: 'integer', default: () => '0' })
  impressions: number = 0;

  @Column({ name: 'reach', type: 'integer', default: () => '0' })
  reach: number = 0;

  @Column({ name: 'frequency', type: 'double precision', default: () => "'0'::double precision" })
  frequency: number = 0;

  @Column({ name: 'cpm', type: 'double precision', default: () => "'0'::double precision" })
  cpm: number = 0;

  @Column({ name: 'clicks', type: 'integer', default: () => '0' })
  clicks: number = 0;

  @Column({ name: 'unique_clicks', type: 'integer', default: () => '0' })
  uniqueClicks: number = 0;

  @Column({ name: 'link_clicks', type: 'integer', default: () => '0' })
  linkClicks: number = 0;

  @Column({ name: 'outbound_clicks', type: 'integer', default: () => '0' })
  outboundClicks: number = 0;

  @Column({ name: 'landing_page_views', type: 'integer', default: () => '0' })
  landingPageViews: number = 0;

  @Column({ name: 'cpc', type: 'double precision', default: () => "'0'::double precision" })
  cpc: number = 0;

  @Column({ name: 'cpc_link', type: 'double precision', nullable: true })
  cpcLink!: number | null;

  @Column({ name: 'ctr', type: 'double precision', default: () => "'0'::double precision" })
  ctr: number = 0;

  @Column({ name: 'ctr_link', type: 'double precision', nullable: true })
  ctrLink!: number | null;

  @Column({ name: 'ctr_outbound', type: 'double precision', nullable: true })
  ctrOutbound!: number | null;

  @Column({ name: 'leads', type: 'integer', default: () => '0' })
  leads: number = 0;

  @Column({ name: 'registrations', type: 'integer', default: () => '0' })
  registrations: number = 0;

  @Column({ name: 'purchases', type: 'integer', default: () => '0' })
  purchases: number = 0;

  @Column({ name: 'cost_per_lead', type: 'double precision', nullable: true })
  costPerLead!: number | null;

  @Column({ name: 'cost_per_registration', type: 'double precision', nullable: true })
  costPerRegistration!: number | null;

  @Column({ name: 'cost_per_purchase', type: 'double precision', nullable: true })
  costPerPurchase!: number | null;

  @Column({ name: 'cost_per_landing_page_view', type: 'double precision', nullable: true })
  costPerLandingPageView!: number | null;

  @Column({ name: 'raw_actions', type: 'jsonb', default: () => "'[]'::jsonb" })
  rawActions: JsonObject[] = [];

  @Column({ name: 'status', type: 'varchar', length: 32, default: () => "'UNKNOWN'::character varying" })
  status: string = 'UNKNOWN';

  @Column({ name: 'effective_status', type: 'varchar', length: 32, default: () => "'UNKNOWN'::character varying" })
  effectiveStatus: string = 'UNKNOWN';

  @Column({ name: 'daily_budget', type: 'double precision', default: () => "'0'::double precision" })
  dailyBudget: number = 0;

  @Column({ name: 'fetched_at', type: 'timestamptz', default: () => 'now()' })
  fetchedAt: Date = new Date();

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date = new Date();

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id', referencedColumnName: 'id', foreignKeyConstraintName: 'analytics_entity_daily_facts_workspace_id_fkey' })
  workspace?: Relation<WorkspaceEntity>;

  // models.py sets updatedAt on every ORM update (onupdate=utcnow).
  @BeforeUpdate()
  protected touch(): void {
    this.updatedAt = new Date();
  }
}
