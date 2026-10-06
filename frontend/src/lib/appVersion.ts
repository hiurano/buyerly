import { useEffect } from 'react';
import { toast } from '@/ui/toast';

/** The commit this bundle was built from: `APP_VERSION` at build time, "local" otherwise (vite.config.ts). */
declare const __APP_VERSION__: string;

export const BUILD_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'local';

/** How often an open tab asks the server which release it runs. */
export const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;
/** How often a found update retries while a dialog or a text field holds the person. */
const DEFERRED_RETRY_MS = 3000;
const UNKNOWN_VERSIONS = new Set(['', 'local', 'unknown']);
/** Once per page: switching workspaces remounts the app, but must not repeat the notice. */
let noticeShown = false;

/**
 * True when the server runs a different, known release than this bundle. A dev
 * build ("local") never asks, and a server that is down, restarting mid-deploy
 * or answering without a version never counts as newer.
 */
export function isNewerRelease(buildVersion: string, serverVersion: unknown): boolean {
  if (UNKNOWN_VERSIONS.has(buildVersion)) return false;
  if (typeof serverVersion !== 'string') return false;
  const server = serverVersion.trim();
  return !UNKNOWN_VERSIONS.has(server) && server !== buildVersion;
}

/** The release the server runs, or null when it cannot say right now. */
export async function fetchServerVersion(): Promise<string | null> {
  try {
    const response = await fetch('/health/live', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const version = body && typeof body === 'object' ? (body as { version?: unknown }).version : undefined;
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}

/**
 * Whether the notice would cut into something the person is doing: an open
 * dialog or menu, or focus in a field that may hold unsaved input.
 */
export function isPersonBusy(doc: Document = document): boolean {
  if (doc.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return true;
  const active = doc.activeElement as HTMLElement | null;
  if (!active) return false;
  if (active.isContentEditable) return true;
  const tag = active.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (active as HTMLInputElement).type;
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file', 'image'].includes(type);
  }
  return false;
}

/**
 * Tells an open tab that a newer release is out (#303). It asks the server
 * every few minutes and whenever the tab comes back into view, and once the
 * versions differ it shows one notice with Reload: it never reloads on its
 * own, never shows over a dialog or a field being typed in, and never twice.
 */
export function useNewVersionNotice(buildVersion: string = BUILD_VERSION): void {
  useEffect(() => {
    if (UNKNOWN_VERSIONS.has(buildVersion) || noticeShown) return undefined;
    let disposed = false;
    let checking = false;
    let found = false;
    let retryTimer = 0;

    const showWhenFree = () => {
      window.clearTimeout(retryTimer);
      if (disposed || noticeShown) return;
      if (document.visibilityState !== 'visible' || isPersonBusy()) {
        retryTimer = window.setTimeout(showWhenFree, DEFERRED_RETRY_MS);
        return;
      }
      noticeShown = true;
      toast.show({
        tone: 'info',
        title: 'Update available',
        description: 'A new version of Buyerly is available.',
        persistent: true,
        action: { label: 'Reload', onClick: () => window.location.reload() },
      });
    };

    const check = async () => {
      if (disposed || checking || found || document.visibilityState !== 'visible') return;
      checking = true;
      const serverVersion = await fetchServerVersion();
      checking = false;
      if (disposed || found || !isNewerRelease(buildVersion, serverVersion)) return;
      found = true;
      window.clearInterval(interval);
      showWhenFree();
    };

    const interval = window.setInterval(check, VERSION_CHECK_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleVisibility);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleVisibility);
    };
  }, [buildVersion]);
}
