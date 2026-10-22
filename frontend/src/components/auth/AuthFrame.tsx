import React, { useEffect, useState } from 'react';
import { BuyerlyMark } from '@/icons/BuyerlyIcons';
import { isSplashShown } from '@/lib/splash';

export const BuyerlyBrand: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div
    className={`buyerly-auth-brand${compact ? ' buyerly-auth-brand--compact' : ''}`}
    role="img"
    aria-label="Buyerly"
  >
    <BuyerlyMark />
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

/**
 * Every loading state looks like the reload splash of index.html (#433), as in Linear:
 * the app frame in theme colours (`plain`: the signed-out backdrop), the mark with a
 * pulsing ring after 1s, "Loading…" after 8s. While that inline splash is still up it
 * is the loader; App removes it after the first render without this placeholder.
 */
export const AuthLoading: React.FC<{ label?: string; plain?: boolean }> = ({
  label = 'Loading…',
  plain = false,
}) => {
  const boot = isSplashShown();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (boot) return undefined;
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, [boot]);
  if (boot) return <div data-boot-loading hidden />;
  return (
    <div
      className={`splash content-loaded${plain ? ' plain' : ''}${slow ? ' loading-text' : ''}`}
      role="status"
      aria-label={label}
    >
      <div className="splash-frame">
        <div className="splash-content" aria-hidden="true">
          <div className="splash-mark">
            <svg className="bkg" width="64" height="64" viewBox="0 0 512 512" fill="none"><circle cx="256" cy="256" r="244" /></svg>
            <svg width="32" height="32" viewBox="0 0 512 512" fill="none"><path fill="currentColor" fillRule="evenodd" d="M192 464V336H112L80 224H192V192H288V48H320L432 464H192Z M288 224L224 256H288V224Z M192 176V48H224L256 176H192Z" /></svg>
          </div>
          <div className="splash-text">Loading…</div>
        </div>
      </div>
    </div>
  );
};
