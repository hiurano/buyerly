// Buyerly's service worker (#499), on the model of Linear's /client/sw.js: the
// build writes the list of its files into it, `install` caches them all,
// `fetch` serves them from that cache, and `activate` drops older builds'
// caches. vite.config.ts (serviceWorker) compiles this file into dist/sw.js.
//
// One build at a time: index.html and every chunk it can import come from the
// same cache, so a tab never runs a mix of two deploys. A new deploy installs
// beside the running one and waits; the app's "New version available" notice
// (src/lib/appVersion.ts) appears once it is installed, and its Reload tells
// the waiting worker to take over (src/lib/serviceWorker.ts).
//
// API responses are never cached here: the local database keeps the data (#496).
// Desktop notifications (#503), as Linear's: the server's Web Push wakes the
// worker with `push` even while no tab is open, and `notificationclick` opens
// the Inbox record, in an open tab if there is one.

/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;
export {}; // A module for the type checker only: the build drops this line, as a worker is a plain script.

/** Written by the build: the release, and every file the app can load. */
declare const __BUYERLY_BUILD__: { version: string; files: string[] };

const BUILD = __BUYERLY_BUILD__;
const CACHE_PREFIX = 'buyerly-app-';
const CACHE = `${CACHE_PREFIX}${BUILD.version}`;
const SHELL = '/index.html';
const FILES = new Set(BUILD.files);

// Root segments the server answers itself (core/workspace_slugs.py's reserved
// slugs, less the app's own: api/server.py `app_roots`), and the public
// website at `/`. Every other address without a file extension is the app.
const SERVER_ROOTS = new Set([
  'about', 'api', 'assets', 'changelog', 'data-deletion', 'docs', 'health', 'privacy', 'redoc', 'static', 'terms', 'uploads',
]);

function isAppPage(pathname: string): boolean {
  if (pathname === '/' || /\.\w+$/.test(pathname)) return false;
  return !SERVER_ROOTS.has(pathname.split('/')[1]);
}

/** What the page asks the worker. */
type Message = { type: 'SKIP_WAITING' } | { type: 'VERSION' };

/** What the worker tells a tab: open this app address (a clicked notification's record). */
type WorkerMessage = { type: 'OPEN_URL'; url: string };

/** A desktop notification, as services/inbox_push.py sends it. */
interface PushMessage { title: string; body?: string; url?: string; tag?: string }

self.addEventListener('install', (event) => {
  // All or nothing: one file missing (a deploy still rolling out) fails the
  // install, and the browser tries again at its next update check.
  // A hashed file never changes, so the HTTP cache's copy (the page just
  // loaded it) will do; index.html, fonts and icons come from the server.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(BUILD.files.map((file) =>
    new Request(file, { cache: file.startsWith('/assets/') ? 'default' : 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Tabs still open on the previous build keep loading its chunks from its
    // cache, as the server no longer has them; the build before that goes.
    const builds = (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE);
    const tabs = await self.clients.matchAll({ type: 'window' });
    const keep = tabs.length > 0 ? builds.slice(-1) : [];
    await Promise.all(builds.filter((name) => !keep.includes(name)).map((name) => caches.delete(name)));
    // The first install takes the open tab, so it is served from the cache
    // from its next load without a second one.
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const message = event.data as Message | null;
  if (message?.type === 'SKIP_WAITING') void self.skipWaiting();
  if (message?.type === 'VERSION') event.ports[0]?.postMessage({ version: BUILD.version });
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    if (isAppPage(url.pathname)) event.respondWith(fromCache(SHELL, request));
    return;
  }
  // The build's own files; an older build's chunk for a tab still running it.
  if (FILES.has(url.pathname) || url.pathname.startsWith('/assets/')) {
    event.respondWith(fromCache(url.pathname, request));
  }
});

/** This build's copy, then any build's (hashed names never collide), then the network. */
async function fromCache(key: string, request: Request): Promise<Response> {
  const cached = (await caches.match(key, { cacheName: CACHE })) ?? (await caches.match(key));
  // The browser may have evicted the cache under storage pressure.
  return cached ?? fetch(request);
}

self.addEventListener('push', (event) => {
  let message: PushMessage;
  try {
    message = event.data?.json() as PushMessage;
  } catch {
    return;
  }
  if (!message?.title) return;
  // The browser requires a notification for every push (userVisibleOnly).
  event.waitUntil(self.registration.showNotification(message.title, {
    body: message.body,
    tag: message.tag,
    icon: '/apple-touch-icon.png',
    data: { url: message.url ?? '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data as { url?: string } | null;
  event.waitUntil(openInTab(appAddress(data?.url)));
});

/** Only this app's own addresses open from a notification. */
function appAddress(url: string | undefined): string {
  const target = new URL(url ?? '/', self.location.origin);
  return target.origin === self.location.origin ? `${target.pathname}${target.search}${target.hash}` : '/';
}

/** The focused tab, else the last one used, goes to the address; with no tab, a new window. */
async function openInTab(url: string): Promise<void> {
  const tabs = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
    .filter((tab) => new URL(tab.url).origin === self.location.origin);
  const tab = tabs.find((client) => client.focused) ?? tabs[0];
  if (!tab) {
    await self.clients.openWindow(url);
    return;
  }
  // The app routes there itself, without reloading (src/lib/serviceWorker.ts).
  tab.postMessage({ type: 'OPEN_URL', url } satisfies WorkerMessage);
  // Allowed only while handling the click; the tab has its address either way.
  await tab.focus().catch(() => undefined);
}
