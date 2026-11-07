// Workspaces, teams, members and invites (api/schemas/members.py), #611.

/** Why an invite link does or does not open (`PublicInviteInfo.status`). */
export type PublicInviteStatus = 'pending' | 'not_found' | 'revoked' | 'expired' | 'accepted';

/**
 * `workspaceInviteDetails(token)`: what the invite page shows before signing in.
 * Every field is always sent; the workspace fields are null unless `valid`.
 */
export interface PublicInviteInfo {
  valid: boolean;
  status: PublicInviteStatus;
  workspace_name: string | null;
  workspace_slug: string | null;
  /** The workspace mark: its logo, or initials on a color from its id. */
  workspace_id: number | null;
  workspace_logo_url: string | null;
  inviter_name: string | null;
  role: string | null;
  target_email: string | null;
  /** ISO 8601 in UTC; "" for an invite that never expires. */
  expires_at: string | null;
  message: string | null;
}
