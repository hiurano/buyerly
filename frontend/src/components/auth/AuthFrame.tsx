import React from 'react';
import { isSplashShown } from '@/lib/splash';

export const BuyerlyBrand: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div
    className={`buyerly-auth-brand${compact ? ' buyerly-auth-brand--compact' : ''}`}
    role="img"
    aria-label="Buyerly"
  >
    <img src="/buyerly-logo.png" alt="" aria-hidden="true" />
  </div>
);

export const AuthFrame: React.FC<React.PropsWithChildren<{ dark?: boolean; className?: string }>> = ({
  children,
  dark = false,
  className = '',
}) => (
  <main className={`buyerly-auth-page${dark ? ' buyerly-auth-page--dark' : ''}${className ? ` ${className}` : ''}`}>
    {children}
  </main>
);

export const AuthLoading: React.FC<{ label?: string; dark?: boolean }> = ({
  label = 'Loading Buyerly…',
  dark = false,
}) => {
  // While the reload splash from index.html is up, it is the loader; App removes it
  // after the first render without one (#433).
  if (isSplashShown()) return <div data-boot-loading hidden />;
  return (
    <AuthFrame dark={dark}>
      <div className="buyerly-auth-card buyerly-auth-card--loading" role="status">
        <BuyerlyBrand />
        <span className="buyerly-auth-spinner" aria-hidden="true" />
        <p>{label}</p>
      </div>
    </AuthFrame>
  );
};
