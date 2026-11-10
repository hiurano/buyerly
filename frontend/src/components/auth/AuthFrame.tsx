import React, { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { isSplashShown } from '@/lib/splash';
import { colors, type } from '@/styles/tokens.stylex';
import { withClassName } from '@/ui/withClassName';
import css from './AuthFrame.module.css';

/**
 * Shared styles for screens outside the app shell: sign-in, sign-up,
 * workspace creation, onboarding, invitation errors, and 404.
 * Theme custom properties (--auth-*) are set on AuthFrame's root by AuthFrame.module.css.
 */
export const authStyles = stylex.create({
  page: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'grid',
    minHeight: '100dvh',
    placeItems: 'center',
    overflow: 'auto',
    paddingTop: 32,
    paddingRight: 20,
    paddingBottom: 32,
    paddingLeft: 20,
    backgroundColor: 'var(--auth-bg)',
    color: 'var(--auth-text)',
    fontFamily: `${type['--font-regular']}, Inter, sans-serif`,
  },
  brand: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    marginBottom: 24,
    color: 'var(--auth-text)',
    fontSize: 24,
    fontWeight: 600,
    letterSpacing: '-0.02em',
    lineHeight: '40px',
  },
  brandCompact: {
    justifyContent: 'flex-start',
    marginTop: 0,
    marginRight: 0,
    marginBottom: 76,
    marginLeft: 0,
    height: 32,
    fontSize: 20,
    lineHeight: '32px',
  },
  brandSignin: {
    display: 'flex',
    height: 48,
    marginBottom: 32,
    fontSize: 28,
    lineHeight: '48px',
  },
  card: {
    width: 'min(100%, 360px)',
    textAlign: 'center',
  },
  heading: {
    marginTop: 0,
    marginRight: 0,
    marginBottom: 20,
    marginLeft: 0,
    color: 'var(--auth-text)',
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: '-0.22px',
    lineHeight: 1.35,
  },
  formHeading: {
    marginBottom: 16,
  },
  copy: {
    marginTop: -7,
    marginRight: 'auto',
    marginBottom: 24,
    marginLeft: 'auto',
    maxWidth: '100%',
    color: 'var(--auth-text-muted)',
    fontSize: 13,
    lineHeight: 1.55,
    textWrap: 'balance',
  },
  field: {
    display: 'block',
    marginBottom: 10,
  },
  fieldLabel: {
    display: 'block',
    marginTop: 0,
    marginRight: 0,
    marginBottom: 7,
    marginLeft: 2,
    color: 'var(--auth-text-muted)',
    fontSize: 12,
    fontWeight: 520,
  },
  input: {
    width: '100%',
    height: 44,
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    paddingTop: 0,
    paddingRight: 12,
    paddingBottom: 0,
    paddingLeft: 12,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--auth-input-border)',
      ':hover:not(:disabled)': 'var(--auth-input-hover-border)',
    },
    borderRadius: 10,
    outlineStyle: {
      default: 'none',
      ':focus': 'solid',
    },
    outlineWidth: {
      default: 0,
      ':focus': 1,
    },
    outlineColor: {
      default: 'currentColor',
      ':focus': 'var(--auth-input-focus)',
    },
    outlineOffset: -1,
    boxShadow: 'none',
    backgroundColor: 'var(--auth-input-bg)',
    color: 'var(--auth-input-text)',
    fontSize: 13,
    appearance: 'none',
    transitionProperty: 'border-color',
    transitionDuration: {
      default: '150ms',
      ':hover:not(:disabled)': '0s',
    },
    '::placeholder': {
      color: 'var(--auth-input-placeholder)',
    },
  },
  inputInvalid: {
    borderColor: {
      default: '#d84949',
      ':hover:not(:disabled)': 'var(--auth-input-hover-border)',
    },
    outlineColor: {
      default: 'currentColor',
      ':focus': '#d84949',
    },
  },
  button: {
    display: 'flex',
    width: '100%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    paddingTop: 9,
    paddingRight: 16,
    paddingBottom: 9,
    paddingLeft: 16,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 999,
    backgroundColor: {
      default: 'var(--auth-button-bg)',
      ':hover:not(:disabled)': 'var(--auth-button-hover-bg)',
    },
    color: 'var(--auth-button-text)',
    fontSize: 13,
    fontWeight: 540,
    cursor: {
      default: 'pointer',
      ':disabled': 'not-allowed',
    },
    opacity: {
      default: 1,
      ':disabled': 0.5,
    },
    transform: {
      default: null,
      ':active:not(:disabled)': 'translateY(1px)',
    },
    boxShadow: 'var(--auth-button-shadow)',
    transition: 'background 120ms ease, border-color 120ms ease, transform 80ms ease',
  },
  /** Linear: 16px from the last field (or its error) to the button. */
  buttonAfterField: {
    marginTop: 16,
  },
  buttonFlush: {
    marginTop: 0,
  },
  /** Linear's first sign-in choice is filled with the accent; the rest stay outlined. */
  buttonPrimary: {
    borderColor: 'transparent',
    backgroundColor: {
      default: colors['--button-primary-bg'],
      ':hover:not(:disabled)': colors['--button-primary-hover-bg'],
    },
    color: colors['--button-primary-text'],
    boxShadow: 'var(--auth-button-primary-shadow)',
  },
  linkButton: {
    textDecoration: 'none',
  },
  /** Linear's account screens: "Back to …" top left, "Logged in as <email>" top right. */
  back: {
    position: 'fixed',
    top: 24,
    left: 24,
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'currentColor',
    backgroundColor: 'transparent',
    backgroundPosition: '0px 0px',
    color: {
      default: 'var(--auth-text-muted)',
      ':hover': 'var(--auth-text)',
    },
    fontSize: 12,
    cursor: 'pointer',
  },
  corner: {
    position: 'fixed',
    top: 22,
    right: 24,
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    color: 'var(--auth-text-muted)',
    fontSize: 11,
    lineHeight: 1.5,
    textAlign: 'right',
  },
  cornerStrong: {
    display: 'block',
    color: 'var(--auth-text)',
    fontSize: 12,
    fontWeight: 540,
  },
  error: {
    marginTop: 8,
    marginRight: 3,
    marginBottom: 2,
    marginLeft: 3,
    textAlign: 'left',
    color: 'var(--auth-error)',
    fontSize: 12,
    lineHeight: 1.45,
  },
  hint: {
    marginTop: 8,
    marginRight: 3,
    marginBottom: 2,
    marginLeft: 3,
    textAlign: 'left',
    color: 'var(--auth-text-muted)',
    fontSize: 12,
    lineHeight: 1.45,
  },
});

export const BuyerlyBrand: React.FC<{
  compact?: boolean;
  signin?: boolean;
  style?: stylex.StyleXStyles;
}> = ({ compact = false, signin = false, style }) => (
  <div
    {...withClassName(
      stylex.props(
        authStyles.brand,
        compact && authStyles.brandCompact,
        signin && authStyles.brandSignin,
        style,
      ),
      'buyerly-auth-brand',
    )}
  >
    Buyerly
  </div>
);

export const AuthFrame: React.FC<React.PropsWithChildren<{
  dark?: boolean;
  className?: string;
  style?: stylex.StyleXStyles;
}>> = ({
  children,
  dark = false,
  className = '',
  style,
}) => (
  <main
    {...withClassName(
      stylex.props(authStyles.page, style),
      `buyerly-auth-page ${css.page}${dark ? ` ${css.dark}` : ''}${className ? ` ${className}` : ''}`,
    )}
  >
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
            <svg width="32" height="32" viewBox="0 0 512 512" fill="none"><path fill="currentColor" fillRule="evenodd" d="M117 64H271C335 64 379 102 379 160C379 200 359 230 327 246C369 260 395 296 395 344C395 406 347 448 277 448H117Z M199 130V218H261C289 218 305 200 305 174C305 148 289 130 261 130Z M199 282V382H269C299 382 317 362 317 332C317 302 299 282 269 282Z" /></svg>
          </div>
          <div className="splash-text">Loading…</div>
        </div>
      </div>
    </div>
  );
};
