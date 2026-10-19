/**
 * The reload splash from index.html (#433), as Linear's: it stays until the first
 * real screen is on the page, then fades out in 100ms and is removed.
 */
let finished = false;

export function isSplashShown(): boolean {
  return !finished && document.getElementById('loading') !== null;
}

export function finishSplash(): void {
  if (finished) return;
  finished = true;
  const splash = document.getElementById('loading');
  if (!splash) return;
  splash.classList.add('loaded');
  window.setTimeout(() => splash.remove(), 150);
}
