import React, { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import type { InviteInfo, LoginResult, SessionUser } from '@/lib/types';
import { AuthFrame, BuyerlyBrand } from './AuthFrame';
import { LoginView } from './LoginView';

interface InviteViewProps {
  token: string;
  user: SessionUser | null;
  onAuthenticated: (result: LoginResult) => void | Promise<void>;
  onAccepted: (workspaceSlug: string, onboardingCompleted: boolean) => void;
}

interface AcceptInviteResult {
  workspace_slug: string;
  onboarding_completed: boolean;
}

export const InviteView: React.FC<InviteViewProps> = ({
  token,
  user,
  onAuthenticated,
  onAccepted,
}) => {
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiRequest<InviteInfo>(`/api/invites/${encodeURIComponent(token)}`)
      .then((result) => {
        if (active) setInvite(result);
      })
      .catch((inviteError) => {
        if (active) setError(inviteError instanceof Error ? inviteError.message : 'Could not open this invitation');
      });
    return () => {
      active = false;
    };
  }, [token]);

  if (showLogin && invite) {
    return (
      <LoginView
        inviteToken={token}
        initialEmail={invite.target_email || ''}
        startWithEmail
        onAuthenticated={onAuthenticated}
      />
    );
  }

  const accept = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest<AcceptInviteResult>(
        `/api/invites/${encodeURIComponent(token)}/accept`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      onAccepted(result.workspace_slug, result.onboarding_completed);
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : 'Could not join this workspace');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame>
      <section className="buyerly-auth-card buyerly-invite-card">
        <BuyerlyBrand />
        {!invite && !error && <span className="buyerly-auth-spinner" aria-label="Loading invitation" />}
        {(error || (invite && !invite.valid)) && (
          <>
            <h1>Invitation unavailable</h1>
            <p className="buyerly-auth-copy">{error || invite?.message}</p>
          </>
        )}
        {invite?.valid && (
          <>
            <div
              className="buyerly-invite-workspace-mark"
              style={{ backgroundColor: invite.workspace_badge_color || '#F5A300' }}
            >
              {invite.workspace_badge_text || invite.workspace_name?.charAt(0) || 'B'}
            </div>
            <h1>Join {invite.workspace_name}</h1>
            <p className="buyerly-auth-copy">
              {invite.inviter_name} invited you to collaborate in Buyerly as {invite.role}.
            </p>
            {error && <p className="buyerly-auth-error" role="alert">{error}</p>}
            {user ? (
              <button className="buyerly-auth-button" type="button" onClick={accept} disabled={busy}>
                {busy ? 'Joining…' : 'Join workspace'}
              </button>
            ) : (
              <button className="buyerly-auth-button" type="button" onClick={() => setShowLogin(true)}>
                Continue with email
              </button>
            )}
          </>
        )}
      </section>
    </AuthFrame>
  );
};
