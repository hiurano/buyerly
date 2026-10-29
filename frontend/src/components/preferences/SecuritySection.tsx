import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as stylex from '@stylexjs/stylex';
import { BrowserIcon } from '@/icons/BrowserIcons';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import {
  browserOf,
  byLastSeen,
  describeUserAgent,
  fetchSessions,
  formatLastSeen,
  formatSignedIn,
  isStale,
  logOut,
  revokeOtherSessions,
  revokeSession,
  type WebSession,
} from '@/lib/sessions';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/ui/ContextMenu';
import { DataState } from '@/ui/DataState';
import { Tooltip } from '@/ui/Tooltip';
import { toast } from '@/ui/toast';
import { useLastPresent } from '@/ui/useLastPresent';
import { withClassName } from '@/ui/withClassName';
import { colors, radii } from '@/styles/tokens.stylex';

type LoadState = 'loading' | 'ready' | 'error';

const styles = stylex.create({
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  overlay: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 500,
    backgroundColor: 'rgb(0 0 0 / 0.4)',
  },
  frame: {
    pointerEvents: 'none',
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 501,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 16,
  },
  content: {
    pointerEvents: 'auto',
    position: 'relative',
    width: '100%',
    maxWidth: 572,
    borderRadius: radii['--canvas-border-radius'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    backgroundColor: colors['--card-bg'],
    textAlign: 'left',
    outline: '2px solid transparent',
    outlineOffset: 2,
    boxShadow: colors['--dialog-elevation-shadow'],
  },
  close: {
    position: 'absolute',
    right: 16,
    top: 16,
    display: 'flex',
    height: 28,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
    },
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
    transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    transitionDuration: '150ms',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    color: colors['--text-primary'],
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
});

/** Linear lists five other sessions, then "Show all". */
const OTHERS_SHOWN = 5;

/** What the confirmation in front of the page asks about. */
type Confirmation =
  | { kind: 'revoke'; session: WebSession }
  | { kind: 'revoke-all' }
  | { kind: 'log-out' };

/** Which session's request is running: its id, or every other one. */
type Busy = string | 'all' | null;

const ERROR_HINT = 'Please try again or contact Buyerly support.';

const Spinner: React.FC = () => <span className="preferences-session-spinner" aria-hidden="true" />;

interface SessionRowProps {
  session: WebSession;
  busy: boolean;
  onOpen: () => void;
  onAction: () => void;
}

/**
 * One browser as Linear lists it: its mark, "Chrome on Linux", then "Helsinki,
 * 18, FI · Last seen about 14 hours ago" (this browser: a green "Current
 * session · Helsinki, 18, FI"). Without a known place only the time shows. The
 * line wraps between its parts, never inside one. The whole row opens the
 * details; Log out or Revoke shows on hover and focus, and a right click
 * offers both.
 */
const SessionRow: React.FC<SessionRowProps> = ({ session, busy, onOpen, onAction }) => {
  const name = describeUserAgent(session.user_agent);
  const actionLabel = session.current ? 'Log out' : 'Revoke';
  const place = session.location?.trim() || '';
  const parts: React.ReactNode[] = session.current
    ? [<span key="current" className="preferences-session-current">Current session</span>, place]
    : [place, formatLastSeen(session.last_seen_at)];
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="preferences-session"
          data-session-id={session.id}
          data-current={session.current}
          data-old={busy || (!session.current && isStale(session)) ? 'true' : undefined}
        >
          <button type="button" className="preferences-session-main" onClick={onOpen}>
            <span className="preferences-session-icon">
              <BrowserIcon browser={browserOf(session.user_agent)} />
            </span>
            <span className="preferences-session-copy">
              <span className="preferences-row-title">{name}</span>
              <span className="preferences-session-desc">
                {parts.filter(Boolean).map((part, index) => (
                  <React.Fragment key={index}>
                    {index > 0 && ' · '}
                    <span className="preferences-session-part">{part}</span>
                  </React.Fragment>
                ))}
              </span>
            </span>
          </button>
          <button
            type="button"
            className="preferences-connect-button preferences-session-button--on-hover"
            data-busy={busy ? 'true' : undefined}
            disabled={busy}
            aria-label={session.current ? undefined : `Revoke ${name}, ${formatLastSeen(session.last_seen_at).toLowerCase()}`}
            onClick={onAction}
          >
            {busy && <Spinner />}
            {busy ? (session.current ? 'Logging out' : 'Revoking') : actionLabel}
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onOpen}>
          <span {...stylex.props(styles.menuItem)}>
            <BuyerlyIcon name="info" size={14} aria-hidden="true" />
            View details
          </span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={onAction} disabled={busy}>
          <span {...stylex.props(styles.menuItem)}>
            <BuyerlyIcon name="sign-out" size={14} aria-hidden="true" />
            {actionLabel}
          </span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

interface SessionDetailsDialogProps {
  session: WebSession | null;
  busy: boolean;
  onClose: () => void;
  onAction: (session: WebSession) => void;
}

/**
 * Linear's session details: the browser over Device, IP address, Last location
 * and Original sign in, and a red Revoke Access (Log out for this browser),
 * which takes focus. Last location shows when Cloudflare told us the place.
 */
const SessionDetailsDialog: React.FC<SessionDetailsDialogProps> = ({ session, busy, onClose, onAction }) => {
  const actionRef = useRef<HTMLButtonElement>(null);
  // Kept through the closing animation after the session is gone.
  const [shown, setShown] = useState<WebSession | null>(session);
  useEffect(() => {
    if (session) setShown(session);
  }, [session]);
  if (!shown) return null;

  const name = describeUserAgent(shown.user_agent);
  const facts: Array<[string, string]> = [
    ['Device', name],
    ['IP address', shown.ip_address || 'Unknown'],
    ...(shown.location ? [['Last location', shown.location] as [string, string]] : []),
    ['Original sign in', formatSignedIn(shown.created_at) || 'Unknown'],
  ];
  return (
    <Dialog.Root open={session !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay {...stylex.props(styles.overlay)} />
        <div {...stylex.props(styles.frame)}>
          <Dialog.Content
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              actionRef.current?.focus();
            }}
            {...withClassName(stylex.props(styles.content), 'ui-dialog preferences-session-dialog animate-scale-in')}
          >
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close dialog"
                {...withClassName(stylex.props(styles.close), 'ui-icon-button')}
              >
                <BuyerlyIcon name="close" size={14} />
              </button>
            </Dialog.Close>
            <header {...stylex.props(styles.header)}>
              <span className="preferences-session-icon preferences-session-icon--outlined">
                <BrowserIcon browser={browserOf(shown.user_agent)} />
              </span>
              <Dialog.Title {...stylex.props(styles.title)}>{name}</Dialog.Title>
            </header>
            <Dialog.Description {...stylex.props(styles.srOnly)}>Details of this session</Dialog.Description>
            <dl className="preferences-session-facts">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="preferences-session-dialog-footer">
              <button
                ref={actionRef}
                type="button"
                className="preferences-session-danger-button"
                disabled={busy}
                onClick={() => onAction(shown)}
              >
                {busy && <Spinner />}
                {shown.current ? (
                  'Log out'
                ) : (
                  <>
                    <span className="preferences-session-label--wide">Revoke Access</span>
                    <span className="preferences-session-label--narrow">Revoke</span>
                  </>
                )}
              </button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

/**
 * Settings → Security & access → Sessions, after Linear: this browser in its own
 * card, then a card headed "N other sessions" with Revoke all. Every revoke and
 * the log out are confirmed first and reported by a toast.
 */
export const SecuritySection: React.FC = () => {
  const [sessions, setSessions] = useState<WebSession[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [details, setDetails] = useState<WebSession | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [showAll, setShowAll] = useState(false);
  // The closing confirmation keeps its words through the animation.
  const asked = useLastPresent(confirmation);

  const refresh = useCallback(async () => {
    try {
      setSessions(await fetchSessions());
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const current = sessions.filter((session) => session.current);
  const others = sessions.filter((session) => !session.current).sort(byLastSeen);
  const shownOthers = showAll ? others : others.slice(0, OTHERS_SHOWN);

  const askFor = (session: WebSession) =>
    setConfirmation(session.current ? { kind: 'log-out' } : { kind: 'revoke', session });

  const revoke = async (target: WebSession) => {
    setBusy(target.id);
    try {
      await revokeSession(target.id);
      setSessions((list) => list.filter((session) => session.id !== target.id));
      setDetails((open) => (open?.id === target.id ? null : open));
      toast.show({ tone: 'success', title: 'Revoked session successfully' });
    } catch {
      toast.error(
        'Session could not be revoked',
        `We encountered an error when logging out the session. ${ERROR_HINT}`,
      );
    }
    setBusy(null);
  };

  const revokeAll = async () => {
    setBusy('all');
    try {
      await revokeOtherSessions();
      setSessions((list) => list.filter((session) => session.current));
      setDetails((open) => (open && !open.current ? null : open));
      toast.show({
        tone: 'success',
        title: 'Revoked session successfully',
        description: 'You have been logged out of all other sessions.',
      });
    } catch {
      toast.error(
        'Sessions could not be logged out',
        `We encountered an error when logging out other sessions. ${ERROR_HINT}`,
      );
    }
    setBusy(null);
  };

  const leave = async (session: WebSession) => {
    setBusy(session.id);
    // On success the page leaves for the login screen.
    if (!(await logOut())) setBusy(null);
  };

  const confirm = () => {
    if (!confirmation) return;
    setConfirmation(null);
    if (confirmation.kind === 'revoke') void revoke(confirmation.session);
    else if (confirmation.kind === 'revoke-all') void revokeAll();
    else if (current[0]) void leave(current[0]);
  };

  const isBusy = (session: WebSession) => busy === session.id || (busy === 'all' && !session.current);

  return (
    <>
      <div className="preferences-title-container">
        <h1 className="preferences-page-title">Security &amp; access</h1>
      </div>

      {state === 'loading' && <DataState title="Loading sessions" detail="Fetching the devices signed in to your account." />}
      {state === 'error' && (
        <DataState
          title="Failed to load sessions"
          detail="Something went wrong while retrieving the data."
          role="alert"
          actionLabel="Retry"
          onAction={() => void refresh()}
        />
      )}

      {state === 'ready' && (
        <div className="preferences-section" aria-label="Sessions">
          <div className="preferences-section-header">
            <h3 className="preferences-section-title">Sessions</h3>
          </div>
          <p className="preferences-section-note preferences-section-note--sessions">Devices logged into your account</p>

          {current.length > 0 && (
            <section className="preferences-card-container preferences-sessions-card">
              {current.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  busy={isBusy(session)}
                  onOpen={() => setDetails(session)}
                  onAction={() => askFor(session)}
                />
              ))}
            </section>
          )}

          {/* With no other sessions Linear shows no card at all: the next section follows the current session. */}
          {others.length > 0 && (
            <section className="preferences-card-container preferences-sessions-card" aria-label="Other sessions">
              <div className="preferences-sessions-others">
                <span>{others.length === 1 ? '1 other session' : `${others.length} other sessions`}</span>
                <Tooltip content="Revoke all other sessions" side="top">
                  <button
                    type="button"
                    className="preferences-connect-button"
                    disabled={busy === 'all'}
                    onClick={() => setConfirmation({ kind: 'revoke-all' })}
                  >
                    {busy === 'all' && <Spinner />}
                    Revoke all
                  </button>
                </Tooltip>
              </div>
              {shownOthers.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  busy={isBusy(session)}
                  onOpen={() => setDetails(session)}
                  onAction={() => askFor(session)}
                />
              ))}
              {others.length > OTHERS_SHOWN && !showAll && (
                <button type="button" className="preferences-sessions-show-all" onClick={() => setShowAll(true)}>
                  Show all
                </button>
              )}
            </section>
          )}
        </div>
      )}

      <SessionDetailsDialog
        session={details}
        busy={details ? isBusy(details) : false}
        onClose={() => setDetails(null)}
        onAction={askFor}
      />

      {/* Cancel keeps the details open behind it, as in Linear. */}
      <ConfirmDialog
        open={confirmation !== null}
        placement="top"
        title={asked?.kind === 'log-out' ? 'Log out?' : 'Revoke access'}
        description={
          asked?.kind === 'revoke'
            ? `Revoke access to "${describeUserAgent(asked.session.user_agent)}"?`
            : asked?.kind === 'revoke-all'
              ? 'Revoke all other sessions? This cannot be undone.'
              : 'You will be logged out from this session'
        }
        confirmLabel={asked?.kind === 'log-out' ? 'Log out' : 'Revoke'}
        tone={asked?.kind === 'log-out' ? 'primary' : 'danger'}
        onConfirm={confirm}
        onCancel={() => setConfirmation(null)}
      />
    </>
  );
};
