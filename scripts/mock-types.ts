// Payloads the browser checks mock for the REST routes the client API runs
// (graphql-mock.ts). The shapes mirror what the app reads (frontend/src/lib/types.ts)
// and what the server sends; a check types its own extra mocks next to where it
// builds them, and moves one here once a second check needs it.
import type { JsonObject } from '@buyerly/shared';

export type { JsonObject };

/** A workspace in `/api/me` and `/api/workspaces`. */
export interface MockWorkspace {
  id: number;
  slug: string;
  name: string;
  role: 'owner' | 'admin' | 'member' | 'guest';
  badge_text: string;
  badge_color: string;
  logo_url: string;
  is_active: boolean;
}

/** `GET /api/me`. */
export interface MockMe {
  id?: number;
  username: string;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string | null;
  email_verified: boolean;
  unconfirmed_email: string | null;
  avatar_url: string;
  onboarding_completed: boolean;
  onboarding_step: 'workspace' | 'personal_details' | 'invites' | 'completed';
  active_workspace: MockWorkspace | null;
  workspaces: MockWorkspace[];
}

/** `GET /api/accounts` health block. */
export interface MockHealth {
  status: string;
  cause: string;
  signals: JsonObject;
  consecutive_failures: number;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_code: string;
  last_error_message: string;
  last_checked_at: string | null;
}

/** An ad account in `GET /api/accounts`; a check fills the fields its page reads. */
export interface MockAccount {
  id?: number;
  account_id: string;
  name: string;
  custom_name?: string;
  note?: string;
  connection_type: string;
  owner_user_id?: number;
  workspace_id?: number;
  owner_id?: string;
  batch_name?: string;
  timezone_name?: string;
  currency?: string;
  account_status?: number;
  status_label?: string;
  rules_enabled?: boolean;
  is_active?: boolean;
  active_rules?: JsonObject[];
  group_ids?: number[];
  latest_metrics?: JsonObject | null;
  today_metrics?: JsonObject | null;
  health?: MockHealth;
  created_at?: string;
  primary_result?: string;
  target_cost_per_result?: number | null;
  lead_user_id?: number | null;
}

/** A team in `GET /api/workspaces/:id/teams`. */
export interface MockTeam {
  id: number;
  name: string;
  key: string;
  description: string;
  created_at: string;
  retired_at: string | null;
  deleted_at: string | null;
  restorable_until: string | null;
  member_user_ids: number[];
  owner_user_ids: number[];
  account_ids: number[];
  is_member: boolean;
}

/** A member in `GET /api/workspaces/:id/members`. */
export interface MockMember {
  id: number;
  user_id: number;
  username: string;
  full_name: string;
  email: string | null;
  avatar_url: string;
  role: string;
  joined_at: string;
  is_current_user: boolean;
}

/** A rule in `GET /api/presets`. */
export interface MockPreset {
  id: number;
  name: string;
  action: string;
  level: string;
  enabled: boolean;
  conditions: { metric: string; operator: string; value: number; time_window: string }[];
  condition_logic: string;
  cooldown_minutes: number;
  check_interval_minutes: number;
  budget_change_percent: number;
  budget_max_daily: number;
  needs_review: boolean;
  created_at: string;
  review_reason: string;
  last_run_at: string;
  last_checked_at: string;
  attached_account_ids: string[];
  attached_scopes: JsonObject;
}
