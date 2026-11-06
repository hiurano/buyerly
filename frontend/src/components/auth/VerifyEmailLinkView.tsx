import React, { useEffect, useRef, useState } from 'react';
import { graphql } from '@/lib/graphql';
import type { LoginResult } from '@/lib/types';
import { AuthFrame, AuthLoading, BuyerlyBrand } from './AuthFrame';

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

    graphql<LoginResult>('mutation EmailLinkUserAccountAuth($input: JSON!) { emailLinkUserAccountAuth(input: $input) }', {
      input: { token },
    })
      .then(onAuthenticated)
      .catch((verifyError) => {
        setError(verifyError instanceof Error ? verifyError.message : 'This login link is invalid');
      });
  }, [onAuthenticated, token]);

  if (!error) return <AuthLoading plain label="Logging you in securely…" />;
  return (
    <AuthFrame>
      <section className="buyerly-auth-card">
        <BuyerlyBrand />
        <h1>Link expired</h1>
        <p className="buyerly-auth-copy">{error}</p>
        <button className="buyerly-auth-button" type="button" onClick={onBackToLogin}>
          Back to login
        </button>
      </section>
    </AuthFrame>
  );
};
