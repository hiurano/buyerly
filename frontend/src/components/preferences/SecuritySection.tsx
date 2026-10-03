import React, { useCallback, useEffect, useState } from 'react';
import { BrowserIcon } from '@/icons/BrowserIcons';
import {
  browserOf,
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

function errorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

interface SessionRowProps {
  session: WebSession;
  action: React.ReactNode;
}

/**
 * One browser as Linear lists it: its mark, "Chrome on Linux", then
 * "Helsinki, 18, FI · Last seen about 14 hours ago" (this browser: a green
 * "Current session" instead). A click shows the IP address and sign-in date.
 */
const SessionRow: React.FC<SessionRowProps> = ({ session, action }) => {
  const [open, setOpen] = useState(false);
  const name = describeUserAgent(session.user_agent);
  const signedIn = formatSignedIn(session.created_at);
  // Linear wraps only between facts, the dot staying at the end of the line.
  const facts = [
    session.current ? 'Current session' : '',
    session.location,
    session.current ? '' : formatLastSeen(session.last_seen_at),
  ].filter(Boolean);
  return (
    <div className="preferences-session" data-session-id={session.id} data-current={session.current}>
      <div className="preferences-session-row">
        <button
          type="button"
          className="preferences-session-main"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="preferences-session-icon">
            <BrowserIcon browser={browserOf(session.user_agent)} />
          </span>
          <span className="preferences-session-copy">
            <span className="preferences-row-title">{name}</span>
            <span className="preferences-session-desc">
              {facts.map((fact, index) => (
                <React.Fragment key={fact}>
                  {index > 0 && ' '}
                  <span className="preferences-session-fact">
                    {session.current && index === 0
                      ? <span className="preferences-session-current">{fact}</span>
                      : fact}
                    {index < facts.length - 1 && ' ·'}
                  </span>
                </React.Fragment>
              ))}
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
 * Settings → Security & access → Sessions, after Linear: this browser in its own
 * card with Log out, then a card headed "N other sessions" with Revoke all and a
 * Revoke on each.
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
          <p className="preferences-section-note preferences-section-note--sessions">Devices logged into your account</p>

          {current.length > 0 && (
            <section className="preferences-card-container preferences-sessions-card">
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
            <section className="preferences-card-container preferences-sessions-card" aria-label="Other sessions">
              <div className="preferences-sessions-others">
                <span>{others.length === 1 ? '1 other session' : `${others.length} other sessions`}</span>
                <button type="button" className="preferences-session-button" onClick={() => void revokeAll()}>
                  Revoke all
                </button>
              </div>
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
          )}
        </div>
      )}
    </>
  );
};
