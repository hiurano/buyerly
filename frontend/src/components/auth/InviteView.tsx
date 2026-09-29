import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/api';
import type { InviteInfo, LoginResult, SessionUser } from '@/lib/types';
import { AuthFrame, BuyerlyBrand } from './AuthFrame';
import { LoginView } from './LoginView';

interface InviteViewProps {
  token: string;
  user: SessionUser | null;
  onAuthenticated: (result: LoginResult) => void | Promise<void>;
  onAccepted: (workspaceSlug: string, onboardingCompleted: boolean) => void;
  /** The current session ended so a different email can log in. */
  onSignedOut: () => void;
  onBack: () => void;
}

interface AcceptInviteResult {
  workspace_slug: string;
  onboarding_completed: boolean;
}

const sameEmail = (left?: string | null, right?: string | null) =>
  Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());

/**
 * Linear's invitation page. A personal invite is accepted by the invited email
 * only: logged out, or logged in as someone else, the page says which email to
 * log in as; logged in as that email, the invite is accepted right away.
 */
export const InviteView: React.FC<InviteViewProps> = ({
  token,
  user,
  onAuthenticated,
  onAccepted,
  onSignedOut,
  onBack,
}) => {
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const autoAccepted = useRef(false);

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

  const accept = useCallback(async () => {
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
  }, [onAccepted, token]);

  const targetEmail = invite?.target_email || null;
  const isInvitedUser = Boolean(user && targetEmail && sameEmail(user.email, targetEmail));
  const isOtherUser = Boolean(user && targetEmail && !sameEmail(user.email, targetEmail));

  // Linear accepts a personal invite as soon as the invited email is logged in.
  useEffect(() => {
    if (!invite?.valid || !isInvitedUser || autoAccepted.current) return;
    autoAccepted.current = true;
    void accept();
  }, [accept, invite?.valid, isInvitedUser]);

  const logInAsInvitedEmail = async () => {
    if (!user) {
      setShowLogin(true);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiRequest('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
      setShowLogin(true);
      onSignedOut();
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : 'Could not log out');
    } finally {
      setBusy(false);
    }
  };

  if (!user && showLogin && invite) {
    return (
      <LoginView
        inviteToken={token}
        initialEmail={targetEmail || ''}
        startWithEmail
        onAuthenticated={onAuthenticated}
      />
    );
  }

  return (
    <AuthFrame>
      {user && (
        <>
          <button className="buyerly-auth-back" type="button" onClick={onBack}>
            ‹ Back to Buyerly
          </button>
          <p className="buyerly-auth-corner">
            Logged in as
            <strong>{user.email || user.username}</strong>
          </p>
        </>
      )}
      <section className="buyerly-auth-card buyerly-invite-card">
        {/* Linear shows only the workspace's own mark on a valid invitation. */}
        {!invite?.valid && <BuyerlyBrand />}
        {!invite && !error && <span className="buyerly-auth-spinner" aria-label="Loading invitation" />}
        {(error || (invite && !invite.valid)) && !invite?.valid && (
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
            <h1>{invite.inviter_name} has invited you to {invite.workspace_name}</h1>
            {!user && (
              <p className="buyerly-auth-copy">
                Buyerly helps your team monitor Meta Ads performance and automate routine actions.
              </p>
            )}

            {isInvitedUser ? (
              <>
                {busy && <p className="buyerly-auth-copy">Joining {invite.workspace_name}…</p>}
                {error && <p className="buyerly-auth-error" role="alert">{error}</p>}
                {error && (
                  <button className="buyerly-auth-button buyerly-auth-button--primary" type="button" onClick={() => void accept()} disabled={busy}>
                    Join workspace
                  </button>
                )}
              </>
            ) : user && !isOtherUser ? (
              // A shared invite link has no email to match: the logged-in person joins by choice.
              <>
                {error && <p className="buyerly-auth-error" role="alert">{error}</p>}
                <button className="buyerly-auth-button buyerly-auth-button--primary" type="button" onClick={() => void accept()} disabled={busy}>
                  {busy ? 'Joining…' : 'Join workspace'}
                </button>
              </>
            ) : (
              <>
                <p className="buyerly-auth-copy">
                  {targetEmail ? (
                    <>
                      To accept the invitation please log in as
                      <strong className="buyerly-auth-email">{targetEmail}.</strong>
                    </>
                  ) : (
                    'To accept the invitation please log in.'
                  )}
                </p>
                {error && <p className="buyerly-auth-error" role="alert">{error}</p>}
                <button
                  className="buyerly-auth-button buyerly-auth-button--primary"
                  type="button"
                  onClick={() => void logInAsInvitedEmail()}
                  disabled={busy}
                >
                  Log in
                </button>
              </>
            )}
          </>
        )}
      </section>
    </AuthFrame>
  );
};
