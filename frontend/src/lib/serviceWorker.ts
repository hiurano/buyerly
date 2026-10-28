// The page's side of the service worker (#499, frontend/sw/sw.ts). The worker
// keeps one build's files and serves the app from them, so a tab opens without
// the network; a deploy installs as a second worker that waits until Reload in
// the "New version available" notice (lib/appVersion.ts) lets it take over.
// A clicked desktop notification (#503) asks the tab to open its Inbox record.

import { openAppPath } from './routing';

declare global {
  interface ImportMetaEnv {
    /** Vite's: true in a build, false in the dev server. */
    readonly PROD: boolean;
  }
}

type Listener = () => void;

const listeners = new Set<Listener>();
/** The worker serving this tab, to tell another tab's update from the first install. */
let tabWorker: ServiceWorker | null = null;
let newBuild = false;
let reloading = false;

function announceNewBuild() {
  newBuild = true;
  for (const listener of listeners) listener();
}

/**
 * Installs the worker in a built app; the dev server's modules are no build to
 * keep. Registered after the page has loaded, so caching the build's files
 * never competes with the first page for the network.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const container = navigator.serviceWorker;
  tabWorker = container.controller;
  // The worker focused this tab for a clicked notification: go to its record, as a link would.
  container.addEventListener('message', (event: MessageEvent<{ type?: string; url?: unknown } | null>) => {
    if (event.data?.type === 'OPEN_URL' && typeof event.data.url === 'string' && event.data.url.startsWith('/')) {
      openAppPath(event.data.url);
    }
  });
  container.addEventListener('controllerchange', () => {
    const previous = tabWorker;
    tabWorker = container.controller;
    if (reloading) window.location.reload();
    // Another tab's Reload moved every tab to the new build; this one still runs the old.
    else if (previous) announceNewBuild();
  });
  const register = async () => {
    const registration = await container.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    if (registration.waiting && container.controller) announceNewBuild();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        // Installed with a worker already serving the tab: a new build is cached and waiting.
        if (worker.state === 'installed' && container.controller) announceNewBuild();
      });
    });
  };
  const start = () => void register().catch(() => {});
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

/** True while the worker serves this tab: then it, not /health/live, says when a new build is out. */
export function servedByWorker(): boolean {
  return Boolean(typeof navigator !== 'undefined' && navigator.serviceWorker?.controller);
}

/** Asks the server for the worker again; a new build then installs and announces itself. */
export async function checkForNewBuild(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  // Offline, or the server mid-deploy: the next check asks again.
  await registration?.update().catch(() => {});
}

/** Calls `listener` once a new build is installed (at once if it already is); returns the unsubscribe. */
export function onNewBuild(listener: Listener): () => void {
  if (newBuild) listener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reloads into the new build: the waiting worker takes over first, so the page loads from its cache. */
export async function reloadToNewBuild(): Promise<void> {
  const registration = await navigator.serviceWorker?.getRegistration();
  const waiting = registration?.waiting;
  if (!waiting) {
    window.location.reload();
    return;
  }
  reloading = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
  // Should the worker never take over, the page still reloads.
  window.setTimeout(() => window.location.reload(), 3000);
}
