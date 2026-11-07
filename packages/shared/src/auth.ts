// Sign-in, sessions and the profile as their GraphQL fields send them
// (#611 stage 3). Field names are the wire's, snake_case, as the Python API
// (api/schemas/auth.py, api/schemas/workspaces.py) answered before the
// TypeScript server took these paths over.

/** A workspace the member may open (Switch workspace, the profile). */
export interface WorkspaceItem {
  id: number;
  name: string;
  slug: string;
  badge_text: string;
  badge_color: string;
  logo_url: string;
  role: string;
  is_active: boolean;
  accounts_count: number;
  members_count: number;
}

/** `emailTokenUserAccountAuth` and `emailLinkUserAccountAuth`. */
export interface LoginResponse {
  /** The signed-in account; the browser sends it back as X-Buyerly-Account. */
  account_id: number | null;
  username: string;
  full_name: string;
  role: string;
  message: string;
  redirect_url: string | null;
}

/** One account logged in to this browser (`availableUsers`), Linear's "Add an account…". */
export interface BrowserAccountItem {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  avatar_url: string;
  /** Which cookie pair holds the account: buyerly_csrf for 0, buyerly_csrf_<slot> otherwise. */
  slot: number;
  onboarding_completed: boolean;
  workspaces: WorkspaceItem[];
}

/** One signed-in browser (`authenticationSessions`); times are ISO 8601 in UTC. */
export interface WebSessionItem {
  id: string;
  user_agent: string;
  ip_address: string;
  location: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  current: boolean;
}

/** `viewer`. */
export interface UserProfileResponse {
  id: number | null;
  username: string;
  full_name: string;
  first_name: string;
  last_name: string;
  title: string;
  email: string | null;
  email_verified: boolean;
  unconfirmed_email: string | null;
  avatar_url: string;
  role: string;
  is_approved: boolean;
  onboarding_step: string;
  onboarding_completed: boolean;
  active_workspace: WorkspaceItem | null;
  workspaces: WorkspaceItem[];
}

/** `emailUserAccountAuthChallenge`'s input. */
export interface RequestTemporaryPasswordRequest {
  email: string;
  invite_token?: string | null;
  /** Cloudflare Turnstile token; required for a new address without an invitation. */
  turnstile_token?: string | null;
}

/** `emailTokenUserAccountAuth`'s input. */
export interface VerifyTemporaryPasswordRequest {
  email: string;
  code: string;
}

/** `emailLinkUserAccountAuth`'s input. */
export interface VerifyEmailLinkRequest {
  token: string;
}

/** `userEmailChangeRequest`'s input. */
export interface RequestEmailChangeRequest {
  new_email: string;
}

/** `userEmailChangeVerify`'s input. */
export interface VerifyEmailChangeRequest {
  code: string;
}
