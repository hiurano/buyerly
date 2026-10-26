import React, { FormEvent, useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { ApiError, apiRequest } from '@/lib/api';
import type { LoginResult } from '@/lib/types';
import { AuthFrame, BuyerlyBrand } from './AuthFrame';
import { TurnstileWidget, loadTurnstile } from './TurnstileWidget';

type LoginStage = 'start' | 'email' | 'verify' | 'check' | 'code';

// The server's answer when a new address has not passed Cloudflare Turnstile yet.
const HUMAN_CHECK_FAILED = "We couldn't verify you're human. Please try again.";

const styles = stylex.create({
  /** Read by screen readers only, as Tailwind's sr-only. */
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

interface LoginViewProps {
  inviteToken?: string;
  initialEmail?: string;
  startWithEmail?: boolean;
  onAuthenticated: (result: LoginResult) => void | Promise<void>;
  /** Linear's "Add an account" screen: its own title, "Back to Buyerly" and "Logged in as". */
  title?: string;
  loggedInAs?: string;
  onBack?: () => void;
  /** Linear's /signup: "Create your workspace", legal note and "Already have an account? Log in". */
  mode?: 'login' | 'signup';
  /** Opens /login or /signup; when set, the first screen links to the other one. */
  onSwitchMode?: (path: '/login' | '/signup') => void;
}

/**
 * Linear's sign-in and sign-up: a first screen of choices, then "What's your
 * email address?", "Verifying it's you" (Cloudflare Turnstile, always on
 * sign-up and for a new address on login), "Check your email" with the
 * emailed link, and the same code by hand. As in Linear, there is no password.
 */
export const LoginView: React.FC<LoginViewProps> = ({
  inviteToken,
  initialEmail = '',
  startWithEmail = false,
  onAuthenticated,
  title = 'Log in to Buyerly',
  loggedInAs,
  onBack,
  mode = 'login',
  onSwitchMode,
}) => {
  const signup = mode === 'signup';
  const [stage, setStage] = useState<LoginStage>(startWithEmail ? 'email' : 'start');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const goTo = (next: LoginStage) => {
    setError('');
    setStage(next);
  };

  // Linear loads Turnstile as soon as the sign-up email step opens.
  useEffect(() => {
    if (signup && stage === 'email') loadTurnstile().catch(() => undefined);
  }, [signup, stage]);

  const switchLink = (path: '/login' | '/signup', label: string) => (
    <a
      href={path}
      onClick={(event) => {
        if (!onSwitchMode || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onSwitchMode(path);
      }}
    >
      {label}
    </a>
  );

  const sendCode = async (address: string, turnstileToken?: string) => {
    setBusy(true);
    setError('');
    const body = JSON.stringify({
      email: address,
      ...(inviteToken ? { invite_token: inviteToken } : {}),
      ...(turnstileToken ? { turnstile_token: turnstileToken } : {}),
    });
    try {
      await apiRequest('/api/auth/request-temporary-password', { method: 'POST', body });
      setCode('');
      setStage('check');
    } catch (requestError) {
      if (!turnstileToken && requestError instanceof ApiError && requestError.status === 400
        && requestError.message === HUMAN_CHECK_FAILED) {
        // A new address on login: the server wants the same check as sign-up.
        goTo('verify');
        setBusy(false);
        return;
      }
      setError(requestError instanceof Error ? requestError.message : 'Could not send the email');
    }
    setBusy(false);
  };

  const requestLogin = async (event?: FormEvent) => {
    event?.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Please enter an email address for login.');
      return;
    }
    if (!normalizedEmail.includes('@')) {
      setError('Enter a valid email address');
      return;
    }
    setEmail(normalizedEmail);
    if (signup) {
      goTo('verify');
      return;
    }
    await sendCode(normalizedEmail);
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^[A-Z]{10}$/.test(code)) {
      setError('Please enter a valid verification code.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest<LoginResult>('/api/auth/verify-temporary-password', {
        method: 'POST',
        body: JSON.stringify({ email, code }),
      });
      await onAuthenticated(result);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Please enter a valid verification code.');
    }
    setBusy(false);
  };

  return (
    <AuthFrame>
      {onBack && (
        <button className="buyerly-auth-back" type="button" onClick={onBack}>
          ‹ Back to Buyerly
        </button>
      )}
      {loggedInAs && (
        <p className="buyerly-auth-corner">
          Logged in as
          <strong>{loggedInAs}</strong>
        </p>
      )}
      <section className="buyerly-auth-card buyerly-auth-card--signin">
        <BuyerlyBrand />

        {stage === 'start' && signup && (
          <>
            <h1>Create your workspace</h1>
            <button className="buyerly-auth-button buyerly-auth-button--primary" type="button" onClick={() => goTo('email')}>
              Continue with email
            </button>
            <p className="buyerly-auth-legal">
              By signing up, you agree to our
              <br />
              <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>.
            </p>
            <p className="buyerly-auth-switch">
              Already have an account? {switchLink('/login', 'Log in')}
            </p>
          </>
        )}

        {stage === 'start' && !signup && (
          <>
            <h1>{title}</h1>
            <button className="buyerly-auth-button buyerly-auth-button--primary" type="button" onClick={() => goTo('email')}>
              Continue with email
            </button>
            {onSwitchMode && (
              <p className="buyerly-auth-switch">
                Don’t have an account? {switchLink('/signup', 'Sign up')}
              </p>
            )}
          </>
        )}

        {stage === 'email' && (
          <form onSubmit={requestLogin} noValidate>
            <h1>What’s your email address?</h1>
            <label className="buyerly-auth-field">
              <span {...stylex.props(styles.srOnly)}>Email address</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                placeholder="Enter your email address…"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(error)}
              />
            </label>
            {error && <p className="buyerly-auth-error" role="alert">{error}</p>}
            <button className="buyerly-auth-button" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Continue with email'}
            </button>
            <button className="buyerly-auth-text-button" type="button" onClick={() => goTo('start')}>
              {signup ? 'Back to signup' : 'Back to login'}
            </button>
          </form>
        )}

        {stage === 'verify' && (
          <>
            <h1>Verifying it’s you</h1>
            <TurnstileWidget
              onToken={(token) => sendCode(email, token)}
              onError={() => setError(HUMAN_CHECK_FAILED)}
            />
            {error && <p className="buyerly-auth-error" role="alert">{error}</p>}
            <button className="buyerly-auth-text-button" type="button" onClick={() => goTo('start')}>
              {signup ? 'Back to signup' : 'Back to login'}
            </button>
          </>
        )}

        {stage === 'check' && (
          <>
            <h1>Check your email</h1>
            <p className="buyerly-auth-copy">
              We’ve sent you a temporary login link.
              <br />
              Please check your inbox at
              <strong className="buyerly-auth-email">{email}</strong>
            </p>
            {error && <p className="buyerly-auth-error" role="alert">{error}</p>}
            <button className="buyerly-auth-button" type="button" onClick={() => goTo('code')}>
              Enter code manually
            </button>
            <button className="buyerly-auth-text-button" type="button" onClick={() => goTo('start')}>
              {signup ? 'Back to signup' : 'Back to login'}
            </button>
          </>
        )}

        {stage === 'code' && (
          <form onSubmit={verifyCode} noValidate>
            <h1>Check your email</h1>
            <p className="buyerly-auth-copy">
              We’ve sent you a temporary login code.
              <br />
              Please check your inbox at
              <strong className="buyerly-auth-email">{email}</strong>
            </p>
            <label className="buyerly-auth-field buyerly-auth-code-field">
              <span {...stylex.props(styles.srOnly)}>Login code</span>
              <input
                type="text"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                placeholder="Enter code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 10))}
                aria-invalid={Boolean(error)}
              />
            </label>
            {error && <p className="buyerly-auth-error" role="alert">{error}</p>}
            <button className="buyerly-auth-button buyerly-auth-button--primary" type="submit" disabled={busy}>
              {busy ? 'Checking…' : 'Continue with login code'}
            </button>
            <button className="buyerly-auth-text-button" type="button" onClick={() => goTo('start')}>
              {signup ? 'Back to signup' : 'Back to login'}
            </button>
          </form>
        )}
      </section>
    </AuthFrame>
  );
};
