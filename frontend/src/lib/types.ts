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

export interface AnalyticsHierarchyItem {
  entity_id: string;
  entity_name: string;
  entity_level: 'campaign' | 'adset' | 'ad';
  parent_entity_id: string;
  account_id: string;
  currency: string;
  status: string;
  effective_status: string;
  daily_budget: number;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  registrations: number;
  purchases: number;
  cost_per_lead: number | null;
  cpc: number;
  ctr: number;
}

export interface AnalyticsHierarchyResponse {
  parent_id: string;
  level: 'campaign' | 'adset' | 'ad';
  period: 'today' | 'yesterday' | 'last_3d' | 'last_7d';
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
