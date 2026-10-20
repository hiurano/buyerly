// Safari remembers a tab icon per page URL and, when the app moves to another
// address without a reload, shows whatever it once saved for that address: an
// old yellow or tiled icon on /inbox, /rules, /ads-manager and so on. Putting a
// fresh copy of the icon link into the head after every address change makes
// it read the current favicon.svg again and save that for the new address.

let lastPath = '';

function relinkIcons() {
  if (window.location.pathname === lastPath) return;
  lastPath = window.location.pathname;
  document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]').forEach((link) => {
    const fresh = link.cloneNode() as HTMLLinkElement;
    link.replaceWith(fresh);
  });
}

export function keepFaviconAcrossRoutes() {
  lastPath = window.location.pathname;
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method].bind(window.history);
    window.history[method] = (...args: Parameters<History['pushState']>) => {
      original(...args);
      relinkIcons();
    };
  }
  window.addEventListener('popstate', relinkIcons);
}
