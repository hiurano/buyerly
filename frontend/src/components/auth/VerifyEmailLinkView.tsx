import React, { useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/api';
import type { LoginResult } from '@/lib/types';
import { AuthFrame, BuyerlyBrand } from './AuthFrame';

interface VerifyEmailLinkViewProps {
  token: string;
  onAuthenticated: (result: LoginResult) => void | Promise<void>;
  onBackToLogin: () => void;
}

export const VerifyEmailLinkView: React.FC<VerifyEmailLinkViewProps> = ({
  token,
  onAuthenticated,
  onBackToLogin,
}) => {
  const started = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // Remove the secret before the same-origin API request so it cannot appear
    // in the Referer header or remain in browser history.
    window.history.replaceState({}, '', '/login');
    if (!token) {
      setError('This login link is incomplete. Request a new one.');
      return;
    }

    apiRequest<LoginResult>('/api/auth/verify-email-link', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then(onAuthenticated)
      .catch((verifyError) => {
        setError(verifyError instanceof Error ? verifyError.message : 'This login link is invalid');
      });
  }, [onAuthenticated, token]);

  return (
    <AuthFrame>
      <section className="buyerly-auth-card buyerly-auth-card--loading">
        <BuyerlyBrand />
        {error ? (
          <>
            <h1>Link expired</h1>
            <p className="buyerly-auth-copy">{error}</p>
            <button className="buyerly-auth-button" type="button" onClick={onBackToLogin}>
              Back to login
            </button>
          </>
        ) : (
          <>
            <span className="buyerly-auth-spinner" aria-hidden="true" />
            <p>Logging you in securely…</p>
          </>
        )}
      </section>
    </AuthFrame>
  );
};
