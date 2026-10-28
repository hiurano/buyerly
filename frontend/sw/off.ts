// The kill switch (#499): served as /sw.js instead of sw.ts when SERVICE_WORKER=off
// (api/server.py, docs/DEPLOYMENT.md). It takes over from whatever worker a tab
// has, deletes the app's caches and unregisters, so every tab's next load comes
// from the network as if no worker had ever been installed.

/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;
export {}; // A module for the type checker only: the build drops this line, as a worker is a plain script.

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('buyerly-app-')).map((name) => caches.delete(name)));
    await self.registration.unregister();
  })());
});
