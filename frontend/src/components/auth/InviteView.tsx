import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import type { InviteInfo, LoginResult, SessionUser } from '@/lib/types';
import { useAppStore } from '@/store/useAppStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import { AuthFrame, BuyerlyBrand } from './AuthFrame';
import { LoginView } from './LoginView';

/**
 * Linear's invitation page follows the system or the person's own theme, also
 * before anyone is logged in. The app shell is not mounted here, so the page
 * resolves the theme itself and marks <html> for the account menu's portal.
 */
const useInviteDarkTheme = () => {
  const interfaceTheme = useAppStore((state) => state.interfaceTheme);
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const resolved = interfaceTheme === 'system' ? (systemDark ? 'dark' : 'light') : interfaceTheme;
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
    root.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);
  return resolved === 'dark';
};

interface InviteViewProps {
  token: string;
  user: SessionUser | null;
  onAuthenticated: (result: LoginResult) => void | Promise<void>;
  onAccepted: (workspaceSlug: string, onboardingCompleted: boolean) => void;
  /**
   * The open account logged out; `thenLogIn`: the invited email logs in next.
   * Other accounts logged in to this browser stay logged in (#231).
   */
  onSignedOut: (thenLogIn: boolean) => void | Promise<void>;
  /** Linear's "Add an account": logs in to one more account, keeping this one. */
  onAddAccount: () => void;
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
  onAddAccount,
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

  const isDark = useInviteDarkTheme();

  /** Ends the current session; `thenLogIn` goes straight on to log in as the invited email. */
  const logOut = async (thenLogIn: boolean) => {
    setBusy(true);
    setError('');
    try {
      await apiRequest('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
      if (thenLogIn) setShowLogin(true);
      await onSignedOut(thenLogIn);
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : 'Could not log out');
    } finally {
      setBusy(false);
    }
  };

  const logInAsInvitedEmail = () => {
    if (user) void logOut(true);
    else setShowLogin(true);
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
    <AuthFrame
      dark={isDark}
      className={`buyerly-invite-page${user ? ' buyerly-invite-page--signed-in' : ''}`}
    >
      {user && (
        <>
          <button className="buyerly-invite-back" type="button" onClick={onBack}>
            <ChevronLeft size={14} strokeWidth={2} aria-hidden="true" />
            Back to Buyerly
          </button>
          {/* Linear's account switcher; "Add an account" keeps this account logged in (#231). */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button className="buyerly-invite-account" type="button">
                <span>Logged in as</span>
                <strong>{user.email || user.username}</strong>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="left" align="start" sideOffset={4} style={{ width: '193px', minWidth: '193px' }}>
              <DropdownMenuLabel style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 500 }}>
                Accounts
              </DropdownMenuLabel>
              <DropdownMenuItem>
                <span className="min-w-0 truncate">{user.email || user.username}</span>
                <Check size={14} strokeWidth={2} aria-hidden="true" />
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onAddAccount}>Add an account</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void logOut(false)}>Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
      <section className="buyerly-invite-card">
        {/* Linear shows only the workspace's own mark on a valid invitation. */}
        {!invite?.valid && <BuyerlyBrand />}
        {!invite && !error && <span className="buyerly-auth-spinner" aria-label="Loading invitation" />}
        {(error || (invite && !invite.valid)) && !invite?.valid && (
          <>
            <h1 className="buyerly-invite-title">Invitation unavailable</h1>
            <p className="buyerly-invite-text">{error || invite?.message}</p>
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
            <h1 className="buyerly-invite-title">{invite.inviter_name} has invited you to {invite.workspace_name}</h1>
            {!user && (
              <>
                <p className="buyerly-invite-description">
                  Buyerly helps your team monitor Meta Ads performance and automate routine actions.
                </p>
                <hr className="buyerly-invite-divider" />
              </>
            )}

            {isInvitedUser ? (
              <>
                {busy && <p className="buyerly-invite-text">Joining {invite.workspace_name}…</p>}
                {error && <p className="buyerly-auth-error" role="alert">{error}</p>}
                {error && (
                  <button className="buyerly-invite-button" type="button" onClick={() => void accept()} disabled={busy}>
                    Join workspace
                  </button>
                )}
              </>
            ) : user && !isOtherUser ? (
              // A shared invite link has no email to match: the logged-in person joins by choice.
              <>
                {error && <p className="buyerly-auth-error" role="alert">{error}</p>}
                <button className="buyerly-invite-button" type="button" onClick={() => void accept()} disabled={busy}>
                  {busy ? 'Joining…' : 'Join workspace'}
                </button>
              </>
            ) : (
              <>
                <p className="buyerly-invite-text">
                  {targetEmail ? (
                    <>
                      To accept the invitation please login as
                      <span className="buyerly-invite-email">
                        <strong>{targetEmail}</strong>.
                      </span>
                    </>
                  ) : (
                    'To accept the invitation please login.'
                  )}
                </p>
                {error && <p className="buyerly-auth-error" role="alert">{error}</p>}
                <button
                  className="buyerly-invite-button"
                  type="button"
                  onClick={logInAsInvitedEmail}
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
