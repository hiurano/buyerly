import React, { FormEvent, useState } from 'react';
import { apiRequest } from '@/lib/api';
import type { LoginResult } from '@/lib/types';
import { AuthFrame, BuyerlyBrand } from './AuthFrame';

type LoginStage = 'password' | 'email' | 'check' | 'code';

interface LoginViewProps {
  inviteToken?: string;
  initialEmail?: string;
  startWithEmail?: boolean;
  onAuthenticated: (result: LoginResult) => void | Promise<void>;
}

export const LoginView: React.FC<LoginViewProps> = ({
  inviteToken,
  initialEmail = '',
  startWithEmail = false,
  onAuthenticated,
}) => {
  const [stage, setStage] = useState<LoginStage>(startWithEmail ? 'email' : 'password');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const logInWithPassword = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedIdentifier = identifier.trim();
    if (!normalizedIdentifier || !password) {
      setError('Enter your username and password');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest<LoginResult>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: normalizedIdentifier, password }),
      });
      await onAuthenticated(result);
    } catch (loginError) {
      setPassword('');
      setError(loginError instanceof Error ? loginError.message : 'Invalid username or password');
    } finally {
      setBusy(false);
    }
  };

  const requestLogin = async (event?: FormEvent) => {
    event?.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError('Enter a valid email address');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiRequest('/api/auth/request-temporary-password', {
        method: 'POST',
        body: JSON.stringify({
          email: normalizedEmail,
          ...(inviteToken ? { invite_token: inviteToken } : {}),
        }),
      });
      setEmail(normalizedEmail);
      setStage('check');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not send the email');
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the six-digit code');
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
      setError(verifyError instanceof Error ? verifyError.message : 'The code is invalid');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame>
      <section className="buyerly-auth-card">
        <BuyerlyBrand />

        {stage === 'password' && (
          <form onSubmit={logInWithPassword} noValidate>
            <h1>Log in to Buyerly</h1>
            <label className="buyerly-auth-field">
              <span className="sr-only">Username or email</span>
              <input
                type="text"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                placeholder="Username or email"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                aria-invalid={Boolean(error)}
              />
            </label>
            <label className="buyerly-auth-field">
              <span className="sr-only">Password</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(error)}
              />
            </label>
            {error && <p className="buyerly-auth-error" role="alert">{error}</p>}
            <button className="buyerly-auth-button" type="submit" disabled={busy}>
              {busy ? 'Logging in…' : 'Log in'}
            </button>
            {inviteToken && (
              <button
                className="buyerly-auth-text-button"
                type="button"
                onClick={() => {
                  setError('');
                  setStage('email');
                }}
              >
                Continue with email
              </button>
            )}
          </form>
        )}

        {stage === 'email' && (
          <form onSubmit={requestLogin} noValidate>
            <h1>What’s your email address?</h1>
            <label className="buyerly-auth-field">
              <span className="sr-only">Email address</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                placeholder="Enter your email address…"
                value={email}
                readOnly={Boolean(initialEmail)}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(error)}
              />
            </label>
            {error && <p className="buyerly-auth-error" role="alert">{error}</p>}
            <button className="buyerly-auth-button" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Continue with email'}
            </button>
            <button
              className="buyerly-auth-text-button"
              type="button"
              onClick={() => {
                setError('');
                setStage('password');
              }}
            >
              Back to login
            </button>
          </form>
        )}

        {stage === 'check' && (
          <>
            <h1>Check your email</h1>
            <p className="buyerly-auth-copy">
              We sent you a temporary login link and a six-digit code to
              <strong className="buyerly-auth-email">{email}</strong>
            </p>
            {error && <p className="buyerly-auth-error" role="alert">{error}</p>}
            <button className="buyerly-auth-button" type="button" onClick={() => setStage('code')}>
              Enter code manually
            </button>
            <button
              className="buyerly-auth-text-button"
              type="button"
              onClick={() => {
                setError('');
                setStage('password');
              }}
            >
              Back to login
            </button>
          </>
        )}

        {stage === 'code' && (
          <form onSubmit={verifyCode} noValidate>
            <h1>Enter your login code</h1>
            <p className="buyerly-auth-copy">
              Enter the code sent to
              <strong className="buyerly-auth-email">{email}</strong>
            </p>
            <label className="buyerly-auth-field buyerly-auth-code-field">
              <span className="sr-only">Six-digit login code</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                aria-invalid={Boolean(error)}
              />
            </label>
            {error && <p className="buyerly-auth-error" role="alert">{error}</p>}
            <button className="buyerly-auth-button" type="submit" disabled={busy}>
              {busy ? 'Checking…' : 'Continue'}
            </button>
            <button className="buyerly-auth-text-button" type="button" onClick={() => setStage('check')}>
              Back to email
            </button>
          </form>
        )}
      </section>
    </AuthFrame>
  );
};
