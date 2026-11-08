import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { graphql } from '@/lib/graphql';
import { acceptInvite } from '@/lib/workspaces';
import type { InviteInfo, LoginResult, SessionUser } from '@/lib/types';
import { colors } from '@/styles/tokens.stylex';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import { withClassName } from '@/ui/withClassName';
import { WorkspaceAvatar } from '@/ui/WorkspaceAvatar';
import { useShellStore } from '@/models/shellStore';
import { AuthFrame, AuthLoading, BuyerlyBrand } from './AuthFrame';
import { LoginView } from './LoginView';

const styles = stylex.create({
  /**
   * Linear's invitation page (linear.app/invite/<id>/accept, measured 2026-10-02).
   * Its main button is Linear's accent, as every main button.
   */
  page: {
    backgroundColor: 'rgb(248, 248, 249)',
    color: 'rgb(48, 48, 49)',
  },
  pageDark: {
    backgroundColor: 'rgb(17, 18, 18)',
    color: 'rgb(227, 228, 231)',
  },
  pageSignedIn: {
    paddingTop: {
      default: 32,
      '@media (max-width: 600px)': 88,
    },
  },
  card: {
    width: 'min(100%, 460px)',
    paddingTop: 32,
    paddingRight: 0,
    paddingBottom: 32,
    paddingLeft: 0,
    borderRadius: 10,
    backgroundColor: '#fff',
    boxShadow: 'rgba(0, 0, 0, 0.02) 0 6px 18px, rgba(0, 0, 0, 0.04) 0 3px 9px, rgba(0, 0, 0, 0.04) 0 1px 3px, rgba(0, 0, 0, 0.04) 0 0 0 0.5px',
    textAlign: 'center',
  },
  cardDark: {
    backgroundColor: 'rgb(25, 25, 27)',
    boxShadow: 'rgba(0, 0, 0, 0.12) 0 3px 8px, rgba(0, 0, 0, 0.12) 0 2px 5px, rgba(0, 0, 0, 0.12) 0 1px 1px',
  },
  brand: {
    marginBottom: 0,
  },
  /** Linear's huge avatar (54px, 22px initials), centered over the title. */
  workspaceMark: {
    display: 'flex',
    justifyContent: 'center',
  },
  title: {
    marginTop: 32,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    paddingTop: 0,
    paddingRight: 32,
    paddingBottom: 0,
    paddingLeft: 32,
    color: 'rgb(27, 27, 27)',
    fontSize: 24,
    fontWeight: 500,
    letterSpacing: '-0.16px',
    lineHeight: '32px',
  },
  titleDark: {
    color: '#fff',
  },
  description: {
    marginTop: 24,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    paddingTop: 0,
    paddingRight: 32,
    paddingBottom: 0,
    paddingLeft: 32,
    color: 'rgb(94, 94, 95)',
    fontSize: 16,
    fontWeight: 400,
    lineHeight: '24px',
  },
  descriptionDark: {
    color: 'rgb(152, 153, 155)',
  },
  text: {
    marginTop: 24,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    paddingTop: 0,
    paddingRight: 32,
    paddingBottom: 0,
    paddingLeft: 32,
    color: 'rgb(48, 48, 49)',
    fontSize: 16,
    fontWeight: 400,
    lineHeight: '24px',
    overflowWrap: 'anywhere',
  },
  textDark: {
    color: 'rgb(227, 228, 231)',
  },
  textAfterDivider: {
    marginTop: 0,
  },
  divider: {
    height: 0,
    marginTop: 32,
    marginRight: 0,
    marginBottom: 32,
    marginLeft: 0,
    borderTopWidth: 1,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderTopStyle: 'solid',
    borderRightStyle: 'none',
    borderBottomStyle: 'none',
    borderLeftStyle: 'none',
    borderTopColor: 'rgb(227, 227, 227)',
    borderRightColor: 'currentColor',
    borderBottomColor: 'currentColor',
    borderLeftColor: 'currentColor',
  },
  dividerDark: {
    borderTopColor: 'rgb(42, 43, 46)',
  },
  email: {
    display: 'block',
  },
  emailStrong: {
    fontWeight: 600,
  },
  error: {
    marginTop: 16,
    marginRight: 32,
    marginBottom: 0,
    marginLeft: 32,
    textAlign: 'center',
    color: 'var(--auth-error)',
    fontSize: 12,
    lineHeight: 1.45,
  },
  button: {
    display: 'flex',
    width: 'calc(100% - 64px)',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    marginRight: 32,
    marginBottom: 0,
    marginLeft: 32,
    paddingTop: 0,
    paddingRight: 18,
    paddingBottom: 0,
    paddingLeft: 18,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 9999,
    backgroundColor: {
      default: colors['--button-primary-bg'],
      ':hover:not(:disabled)': colors['--button-primary-hover-bg'],
    },
    color: colors['--button-primary-text'],
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 'normal',
    cursor: {
      default: 'pointer',
      ':disabled': 'not-allowed',
    },
    opacity: {
      default: 1,
      ':disabled': 0.5,
    },
    boxShadow: 'rgba(0, 0, 0, 0.1) 0 0.5px 1px 0.5px',
    transition: 'border 0.15s, background-color 0.15s, color 0.15s, opacity 0.15s',
  },
  buttonDark: {
    boxShadow: 'rgba(0, 0, 0, 0.298) 0 0.5px 1px 1px',
  },
  /** Corners, logged in only: "‹ Back to Buyerly" and the "Logged in as" account menu. */
  back: {
    position: 'fixed',
    top: 24,
    left: 24,
    zIndex: 1,
    display: 'inline-flex',
    height: 24,
    alignItems: 'center',
    paddingTop: 0,
    paddingRight: 6,
    paddingBottom: 0,
    paddingLeft: 2,
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'currentColor',
    borderRadius: 9999,
    backgroundColor: {
      default: 'transparent',
      ':hover': 'rgb(234, 234, 236)',
    },
    backgroundPosition: '0px 0px',
    color: {
      default: 'rgb(94, 94, 95)',
      ':hover': 'rgb(27, 27, 27)',
    },
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
  backDark: {
    backgroundColor: {
      default: 'transparent',
      ':hover': 'rgb(35, 35, 36)',
    },
    color: {
      default: 'rgb(148, 149, 151)',
      ':hover': 'rgb(226, 227, 229)',
    },
  },
  account: {
    position: 'fixed',
    top: 14,
    right: 14,
    zIndex: 1,
    display: 'flex',
    maxWidth: 'calc(100% - 180px)',
    flexDirection: 'column',
    alignItems: 'flex-end',
    paddingTop: 10,
    paddingRight: 10,
    paddingBottom: 10,
    paddingLeft: 10,
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'currentColor',
    borderRadius: 8,
    backgroundColor: {
      default: 'transparent',
      ':hover': 'rgb(234, 234, 236)',
      ':is([data-state="open"])': 'rgb(234, 234, 236)',
    },
    backgroundPosition: '0px 0px',
    textAlign: 'right',
    cursor: 'pointer',
  },
  accountDark: {
    backgroundColor: {
      default: 'transparent',
      ':hover': 'rgb(40, 41, 42)',
      ':is([data-state="open"])': 'rgb(40, 41, 42)',
    },
  },
  accountCaption: {
    color: 'rgb(94, 94, 95)',
    fontSize: 12,
    fontWeight: 450,
    lineHeight: '16px',
  },
  accountCaptionDark: {
    color: 'rgb(148, 149, 151)',
  },
  accountStrong: {
    maxWidth: '100%',
    overflow: 'hidden',
    color: 'rgb(27, 27, 27)',
    fontSize: 13,
    fontWeight: 500,
    lineHeight: '18px',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  accountStrongDark: {
    color: 'rgb(226, 227, 229)',
  },
  accountLabel: {
    paddingTop: 8,
    paddingRight: 14,
    paddingBottom: 8,
    paddingLeft: 14,
    fontSize: 12,
    fontWeight: 500,
  },
  truncate: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

/**
 * Linear's invitation page follows the system or the person's own theme, also
 * before anyone is logged in. The app shell is not mounted here, so the page
 * resolves the theme itself and marks <html> for the account menu's portal.
 */
const useInviteDarkTheme = () => {
  const interfaceTheme = useShellStore((state) => state.interfaceTheme);
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
    graphql<InviteInfo>('query WorkspaceInviteDetails($token: String!) { workspaceInviteDetails(token: $token) }', { token })
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
      const result = await acceptInvite<AcceptInviteResult>(token);
      onAccepted(result.workspace_slug, result.onboarding_completed);
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : 'Could not join this workspace');
    }
    setBusy(false);
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
      await graphql('mutation Logout { logout { success } }');
      if (thenLogIn) setShowLogin(true);
      await onSignedOut(thenLogIn);
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : 'Could not log out');
    }
    setBusy(false);
  };

  const logInAsInvitedEmail = () => {
    if (user) void logOut(true);
    else setShowLogin(true);
  };

  if (!invite && !error) return <AuthLoading plain label="Loading invitation" />;

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
      style={[styles.page, isDark && styles.pageDark, Boolean(user) && styles.pageSignedIn]}
      className="buyerly-invite-page"
    >
      {user && (
        <>
          <button {...stylex.props(styles.back, isDark && styles.backDark)} type="button" onClick={onBack}>
            <BuyerlyIcon name="chevron-left" size={14} aria-hidden="true" />
            Back to Buyerly
          </button>
          {/* Linear's account switcher; "Add an account" keeps this account logged in (#231). */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button {...stylex.props(styles.account, isDark && styles.accountDark)} type="button">
                <span {...stylex.props(styles.accountCaption, isDark && styles.accountCaptionDark)}>Logged in as</span>
                <strong {...stylex.props(styles.accountStrong, isDark && styles.accountStrongDark)}>{user.email || user.username}</strong>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="left" align="start" sideOffset={4} style={{ width: '193px', minWidth: '193px' }}>
              <DropdownMenuLabel xstyle={styles.accountLabel}>
                Accounts
              </DropdownMenuLabel>
              <DropdownMenuItem>
                <span {...stylex.props(styles.truncate)}>{user.email || user.username}</span>
                <BuyerlyIcon name="check" size={14} aria-hidden="true" />
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onAddAccount}>Add an account</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void logOut(false)}>Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
      <section {...withClassName(stylex.props(styles.card, isDark && styles.cardDark), 'buyerly-invite-card')}>
        {/* Linear shows only the workspace's own mark on a valid invitation. */}
        {!invite?.valid && <BuyerlyBrand style={styles.brand} />}
        {(error || (invite && !invite.valid)) && !invite?.valid && (
          <>
            <h1 {...withClassName(stylex.props(styles.title, isDark && styles.titleDark), 'buyerly-invite-title')}>Invitation unavailable</h1>
            <p {...stylex.props(styles.text, isDark && styles.textDark)}>{error || invite?.message}</p>
          </>
        )}
        {invite?.valid && (
          <>
            <div {...withClassName(stylex.props(styles.workspaceMark), 'buyerly-invite-workspace-mark')}>
              <WorkspaceAvatar
                workspace={{
                  id: invite.workspace_id ?? 0,
                  name: invite.workspace_name || '',
                  logo_url: invite.workspace_logo_url,
                }}
                size="huge"
              />
            </div>
            <h1 {...withClassName(stylex.props(styles.title, isDark && styles.titleDark), 'buyerly-invite-title')}>
              {invite.inviter_name} has invited you to {invite.workspace_name}
            </h1>
            {!user && (
              <>
                <p {...stylex.props(styles.description, isDark && styles.descriptionDark)}>
                  Buyerly helps your team monitor Meta Ads performance and automate routine actions.
                </p>
                <hr {...withClassName(stylex.props(styles.divider, isDark && styles.dividerDark), 'buyerly-invite-divider')} />
              </>
            )}

            {isInvitedUser ? (
              <>
                {busy && <p {...stylex.props(styles.text, isDark && styles.textDark)}>Joining {invite.workspace_name}…</p>}
                {error && <p {...stylex.props(styles.error)} role="alert">{error}</p>}
                {error && (
                  <button
                    {...withClassName(stylex.props(styles.button, isDark && styles.buttonDark), 'buyerly-invite-button')}
                    type="button"
                    onClick={() => void accept()}
                    disabled={busy}
                  >
                    Join workspace
                  </button>
                )}
              </>
            ) : user && !isOtherUser ? (
              // A shared invite link has no email to match: the logged-in person joins by choice.
              <>
                {error && <p {...stylex.props(styles.error)} role="alert">{error}</p>}
                <button
                  {...withClassName(stylex.props(styles.button, isDark && styles.buttonDark), 'buyerly-invite-button')}
                  type="button"
                  onClick={() => void accept()}
                  disabled={busy}
                >
                  {busy ? 'Joining…' : 'Join workspace'}
                </button>
              </>
            ) : (
              <>
                <p {...stylex.props(styles.text, isDark && styles.textDark, !user && styles.textAfterDivider)}>
                  {targetEmail ? (
                    <>
                      To accept the invitation please login as
                      <span {...stylex.props(styles.email)}>
                        <strong {...stylex.props(styles.emailStrong)}>{targetEmail}</strong>.
                      </span>
                    </>
                  ) : (
                    'To accept the invitation please login.'
                  )}
                </p>
                {error && <p {...stylex.props(styles.error)} role="alert">{error}</p>}
                <button
                  {...withClassName(stylex.props(styles.button, isDark && styles.buttonDark), 'buyerly-invite-button')}
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
