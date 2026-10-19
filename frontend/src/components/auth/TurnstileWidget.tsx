import React, { useEffect, useRef } from 'react';

/**
 * Cloudflare Turnstile, as on linear.app/signup: the script loads when the
 * email step opens, and "Verifying it's you" shows Cloudflare's managed check
 * before the code is sent. The server checks the token (services/turnstile.py).
 */

interface TurnstileOptions {
  sitekey: string;
  theme: 'light' | 'dark';
  callback: (token: string) => void;
  'error-callback': () => void;
  'expired-callback': () => void;
}

interface Turnstile {
  render: (container: HTMLElement, options: TurnstileOptions) => string | undefined;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
// Public site key of the "Buyerly sign-up" widget (Cloudflare → Turnstile); it works only on buyerly.app.
const SITE_KEY = '0x4AAAAAAFb_r8WtuISX0Y1E';
// Cloudflare's always-passing test key for local and preview hosts, whose server has no secret.
const TEST_SITE_KEY = '1x00000000000000000000AA';

let loading: Promise<Turnstile> | null = null;

export function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading) {
    loading = new Promise<Turnstile>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load')));
      script.onerror = () => {
        loading = null;
        script.remove();
        reject(new Error('Turnstile did not load'));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}

export const TurnstileWidget: React.FC<{
  onToken: (token: string) => void;
  onError: () => void;
}> = ({ onToken, onError }) => {
  const container = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onToken, onError });
  handlers.current = { onToken, onError };

  useEffect(() => {
    let cancelled = false;
    let widgetId: string | undefined;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) return;
        widgetId = turnstile.render(container.current, {
          sitekey: window.location.hostname === 'buyerly.app' ? SITE_KEY : TEST_SITE_KEY,
          theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
          callback: (token) => handlers.current.onToken(token),
          'error-callback': () => handlers.current.onError(),
          'expired-callback': () => handlers.current.onError(),
        });
      })
      .catch(() => {
        if (!cancelled) handlers.current.onError();
      });
    return () => {
      cancelled = true;
      if (widgetId !== undefined) window.turnstile?.remove(widgetId);
    };
  }, []);

  return <div ref={container} className="buyerly-auth-turnstile" />;
};
