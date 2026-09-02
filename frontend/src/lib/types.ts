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
