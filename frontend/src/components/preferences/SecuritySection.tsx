import React, { useCallback, useEffect, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import {
  describeUserAgent,
  fetchSessions,
  formatLastSeen,
  formatSignedIn,
  logOut,
  revokeOtherSessions,
  revokeSession,
  type WebSession,
} from '@/lib/sessions';
import { DataState } from '@/ui/DataState';
import { toast } from '@/ui/toast';

type LoadState = 'loading' | 'ready' | 'error';

const MOBILE_AGENT = /\b(?:iPhone|iPad|Android|Mobile)\b/;

function errorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

interface SessionRowProps {
  session: WebSession;
  action: React.ReactNode;
}

/** One browser: what it is and when it was last seen; a click shows its IP and sign-in date, as in Linear. */
const SessionRow: React.FC<SessionRowProps> = ({ session, action }) => {
  const [open, setOpen] = useState(false);
  const Icon = MOBILE_AGENT.test(session.user_agent) ? Smartphone : Monitor;
  const name = describeUserAgent(session.user_agent);
  const signedIn = formatSignedIn(session.created_at);
  return (
    <div className="preferences-session" data-session-id={session.id} data-current={session.current}>
      <div className="preferences-row-item preferences-session-row">
        <button
          type="button"
          className="preferences-session-main"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="preferences-channel-icon">
            <Icon size={16} aria-hidden="true" />
          </span>
          <span className="preferences-row-copy">
            <span className="preferences-row-title">{name}</span>
            <span className="preferences-row-desc">
              {session.current
                ? <span className="preferences-session-current">Current session</span>
                : formatLastSeen(session.last_seen_at)}
            </span>
          </span>
        </button>
        {action}
      </div>
      {open && (
        <dl className="preferences-session-details">
          <div>
            <dt>IP address</dt>
            <dd>{session.ip_address || 'Unknown'}</dd>
          </div>
          {signedIn && (
            <div>
              <dt>Signed in</dt>
              <dd>{signedIn}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
};

/**
 * Settings → Security & access → Sessions, after Linear: this browser first with
 * Log out, then "N other sessions" with Revoke all and a Revoke on each.
 */
export const SecuritySection: React.FC = () => {
  const [sessions, setSessions] = useState<WebSession[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setSessions(await fetchSessions());
      setState('ready');
    } catch (error) {
      setLoadError(errorMessage(error) || 'Please try again.');
      setState('error');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const current = sessions.filter((session) => session.current);
  const others = sessions.filter((session) => !session.current);

  const revoke = async (target: WebSession) => {
    setSessions((list) => list.filter((session) => session.id !== target.id));
    try {
      await revokeSession(target.id);
    } catch (error) {
      toast.error("Couldn't revoke the session", errorMessage(error));
      void refresh();
    }
  };

  const revokeAll = async () => {
    setSessions((list) => list.filter((session) => session.current));
    try {
      await revokeOtherSessions();
    } catch (error) {
      toast.error("Couldn't revoke sessions", errorMessage(error));
      void refresh();
    }
  };

  return (
    <>
      <div className="preferences-title-container">
        <h1 className="preferences-page-title">Security &amp; access</h1>
      </div>

      {state === 'loading' && <DataState title="Loading sessions" detail="Fetching the devices signed in to your account." />}
      {state === 'error' && (
        <DataState
          title="Couldn't load sessions"
          detail={loadError}
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
          <p className="preferences-section-note">Devices logged into your account</p>

          {current.length > 0 && (
            <section className="preferences-card-container preferences-card-container--divided">
              {current.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  action={(
                    <button type="button" className="preferences-session-button" onClick={() => void logOut()}>
                      Log out
                    </button>
                  )}
                />
              ))}
            </section>
          )}

          {others.length > 0 && (
            <>
              <div className="preferences-sessions-others">
                <span>{others.length === 1 ? '1 other session' : `${others.length} other sessions`}</span>
                <button type="button" className="preferences-session-button" onClick={() => void revokeAll()}>
                  Revoke all
                </button>
              </div>
              <section className="preferences-card-container preferences-card-container--divided">
                {others.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    action={(
                      <button
                        type="button"
                        className="preferences-session-button preferences-session-button--on-hover"
                        aria-label={`Revoke ${describeUserAgent(session.user_agent)}, ${formatLastSeen(session.last_seen_at).toLowerCase()}`}
                        onClick={() => void revoke(session)}
                      >
                        Revoke
                      </button>
                    )}
                  />
                ))}
              </section>
            </>
          )}
        </div>
      )}
    </>
  );
};
