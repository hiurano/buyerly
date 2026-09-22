import type { AttachedRule } from '@/lib/rules';

export interface Workspace {
  id: number;
  name: string;
  slug: string;
  badge_text: string;
  badge_color: string;
  logo_url: string;
  role: 'owner' | 'admin' | 'buyer' | 'viewer';
  is_active: boolean;
}

export interface SessionUser {
  username: string;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string | null;
  email_verified: boolean;
  unconfirmed_email: string | null;
  avatar_url: string;
  onboarding_step: 'workspace' | 'personal_details' | 'invites' | 'completed';
  onboarding_completed: boolean;
  active_workspace: Workspace | null;
  workspaces: Workspace[];
}

export interface LoginResult {
  username: string;
  full_name: string;
  role: string;
  message: string;
  redirect_url?: string | null;
}

export interface InviteInfo {
  valid: boolean;
  status: string;
  workspace_name?: string | null;
  workspace_slug?: string | null;
  workspace_badge_text?: string | null;
  workspace_badge_color?: string | null;
  inviter_name?: string | null;
  role?: string | null;
  target_email?: string | null;
  message?: string | null;
}

export interface OnboardingStatus {
  onboarding_step: SessionUser['onboarding_step'];
  onboarding_completed: boolean;
  user: SessionUser;
  active_workspace: Workspace | null;
}

export interface MetaAccount {
  id?: number;
  account_id: string;
  name: string;
  custom_name?: string;
  note?: string;
  connection_type: 'facebook_login' | 'system_user';
  timezone_name?: string;
  currency?: string;
  account_status?: number;
  status_label?: string;
  rules_enabled?: boolean;
  is_active?: boolean;
  /** Conversion event this ad account declares as its primary result; '' when undeclared. */
  primary_result?: '' | 'leads' | 'registrations' | 'purchases';
  /** Target cost per primary result in the ad account currency; null when undeclared. */
  target_cost_per_result?: number | null;
  /** Runtime rule snapshots attached to this ad account, each with its scope. */
  active_rules?: AttachedRule[];
}

export interface MetaConnection {
  id: number;
  provider_user_name: string;
  status: string;
}

export interface MetaConnectionAsset {
  account_id: string;
  name: string;
  business_id: string;
  business_name: string;
  account_status: number;
  currency: string;
  timezone_name: string;
  imported: boolean;
  import_status: 'this_connection' | 'not_imported' | 'manual_token' | 'other_connection';
  can_migrate: boolean;
}

export interface MetaAssetsResponse {
  connection: { id: number; provider_user_name: string; status: string };
  accounts: MetaConnectionAsset[];
  count: number;
  imported_count: number;
  migratable_count: number;
}

export interface MetaInviteCreated {
  invite_url: string;
  expires_at: string;
}

/** What one reporting window measures. The baseline reports the same shape. */
export interface AnalyticsPeriodMetrics {
  spend: number;
  impressions: number;
  reach: number;
  cpm: number;
  clicks: number;
  link_clicks: number;
  outbound_clicks: number;
  landing_page_views: number;
  leads: number;
  registrations: number;
  purchases: number;
  cost_per_lead: number | null;
  cost_per_registration: number | null;
  cost_per_purchase: number | null;
  cost_per_landing_page_view: number | null;
  cpc: number;
  ctr: number;
  cpc_link: number | null;
  ctr_link: number;
  ctr_outbound: number;
}

export interface AnalyticsHierarchyItem extends AnalyticsPeriodMetrics {
  entity_id: string;
  entity_name: string;
  entity_level: 'campaign' | 'adset' | 'ad';
  parent_entity_id: string;
  account_id: string;
  currency: string;
  status: string;
  effective_status: string;
  daily_budget: number;
  data_as_of: string | null;
  /**
   * The same metrics over the equal-length window before this one. Absent when
   * no comparison was requested; null when the entity did not exist then.
   */
  previous?: AnalyticsPeriodMetrics | null;
}

/** The baseline the rows were measured against, or why there is none. */
export interface AnalyticsComparison {
  requested: boolean;
  available: boolean;
  dates: string[];
  reason: string;
  current_includes_open_day: boolean;
}

/** One local day of a trend. `has_data` false means the day was never reported. */
export interface AnalyticsTrendPoint extends AnalyticsPeriodMetrics {
  date: string;
  has_data: boolean;
}

export interface AnalyticsTimeseriesResponse {
  parent_id: string;
  level: 'campaign' | 'adset' | 'ad';
  source: 'analytics_fact_store';
  timezone: string;
  days: number;
  /** The local day still in progress; its point is not final. */
  open_day: string;
  /** Empty when the window mixes currencies, so money stays off one axis. */
  currency: string;
  points: AnalyticsTrendPoint[];
}

export interface AnalyticsHierarchyResponse {
  parent_id: string;
  level: 'campaign' | 'adset' | 'ad';
  period: 'today' | 'yesterday' | 'last_3d' | 'last_7d';
  source: 'analytics_fact_store';
  data_as_of: string | null;
  comparison?: AnalyticsComparison;
  total: number;
  items: AnalyticsHierarchyItem[];
}

export interface PublicMetaInviteInfo {
  valid: boolean;
  status: string;
  workspace_name: string;
  workspace_logo_url: string | null;
  label: string;
  inviter_name: string | null;
}
