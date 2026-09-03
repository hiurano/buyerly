import React from 'react';

export const BuyerlyBrand: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div
    className={`buyerly-auth-brand${compact ? ' buyerly-auth-brand--compact' : ''}`}
    role="img"
    aria-label="Buyerly"
  >
    <img src="/buyerly-logo.png" alt="" aria-hidden="true" />
  </div>
);

export const AuthFrame: React.FC<React.PropsWithChildren<{ dark?: boolean }>> = ({
  children,
  dark = false,
}) => (
  <main className={`buyerly-auth-page${dark ? ' buyerly-auth-page--dark' : ''}`}>
    {children}
  </main>
);

export const AuthLoading: React.FC<{ label?: string; dark?: boolean }> = ({
  label = 'Loading Buyerly…',
  dark = false,
}) => (
  <AuthFrame dark={dark}>
    <div className="buyerly-auth-card buyerly-auth-card--loading" role="status">
      <BuyerlyBrand />
      <span className="buyerly-auth-spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  </AuthFrame>
);
