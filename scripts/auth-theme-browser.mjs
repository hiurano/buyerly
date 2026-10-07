// Screens outside the app follow the app theme (#232): the choice saved from
// Settings → Preferences, otherwise the system. Checks the sign-in, workspace
// creation, landing and public pages in both themes at 390 and 1440 px: the
// theme is on <html> before <body> exists (no white flash), the page is dark or
// light as expected, and nothing visible is white in the dark theme.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-auth-theme';
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });

const user = {
  username: 'creator', full_name: '', first_name: '', last_name: '',
  email: 'creator@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '',
  onboarding_completed: false, onboarding_step: 'workspace', active_workspace: null, workspaces: [],
};
const pages = [
  { name: 'login', path: '/login', ready: 'Log in to Buyerly', surface: '.buyerly-auth-page' },
  { name: 'create-workspace', path: '/create-workspace', ready: 'Create a workspace', surface: '.buyerly-auth-page', signedIn: true },
  { name: 'landing', path: '/', ready: 'Your Meta Ads operations', surface: 'body' },
  { name: 'about', path: '/about', ready: 'Get in touch', surface: 'body' },
  { name: 'privacy', path: '/privacy', ready: 'Data we use', surface: 'body' },
  { name: 'terms', path: '/terms', ready: 'Advertising and automation', surface: 'body' },
  { name: 'data-deletion', path: '/data-deletion', ready: 'Send a deletion request', surface: 'body' },
];
// System theme, saved choice (null = none, as for someone who never opened Settings), expected theme.
const themes = [
  { system: 'light', saved: null, expected: 'light' },
  { system: 'dark', saved: null, expected: 'dark' },
  { system: 'dark', saved: 'light', expected: 'light' },
  { system: 'light', saved: 'dark', expected: 'dark' },
];

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  for (const width of [390, 1440]) {
    for (const theme of themes) {
      // The saved-choice cases only need one width to prove precedence.
      if (theme.saved && width !== 1440) continue;
      for (const target of pages) {
        if (theme.saved && !['login', 'landing'].includes(target.name)) continue;
        const label = `${target.name} ${width}px system=${theme.system} saved=${theme.saved ?? 'none'}`;
        const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme.system });
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await context.addInitScript(saved => {
          if (saved) window.localStorage.setItem('buyerly-interface-theme', saved);
          // Record the theme at the moment <body> is created: before any paint.
          new MutationObserver((_records, observer) => {
            if (!document.body) return;
            window.__themeAtBody = document.documentElement.getAttribute('data-theme');
            observer.disconnect();
          }).observe(document, { childList: true, subtree: true });
        }, theme.saved);
        await context.route('**/api/**', route => {
          const path = new URL(route.request().url()).pathname;
          if (path === '/api/me') {
            return route.fulfill(target.signedIn ? { json: user } : { status: 401, json: { detail: 'Not authenticated' } });
          }
          if (path === '/api/onboarding/check-slug') return route.fulfill({ json: { available: true, message: '' } });
          // One account in this browser; several are checked by multi-account-browser.mjs (#231).
          if (path === '/api/auth/accounts') return route.fulfill({ json: [] });
          errors.push(`Unexpected API request: ${route.request().method()} ${path}`);
          return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
        });
        try {
          await page.goto(`${origin}${target.path}`);
          await page.getByText(target.ready).first().waitFor();
          const state = await page.evaluate(surfaceSelector => {
            // App tokens are lch(); let a canvas convert any CSS color to sRGB.
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            const luminance = color => {
              context.clearRect(0, 0, 1, 1);
              context.fillStyle = color;
              context.fillRect(0, 0, 1, 1);
              const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
              return a === 0 ? null : (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
            };
            const surface = document.querySelector(surfaceSelector);
            const white = [];
            for (const element of document.querySelectorAll('body *')) {
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              if (!rect.width || !rect.height || style.visibility === 'hidden' || style.display === 'none') continue;
              const value = luminance(style.backgroundColor);
              if (value !== null && value > 0.85) white.push(`${element.tagName}.${element.className}`);
            }
            return {
              themeAtBody: window.__themeAtBody,
              theme: document.documentElement.getAttribute('data-theme'),
              surface: luminance(getComputedStyle(surface).backgroundColor),
              white,
              overflow: document.documentElement.scrollWidth > innerWidth,
            };
          }, target.surface);
          assert.equal(state.themeAtBody, theme.expected, `${label}: theme set before <body>`);
          assert.equal(state.theme, theme.expected, `${label}: theme`);
          if (theme.expected === 'dark') {
            assert.ok(state.surface < 0.1, `${label}: dark background, got ${state.surface}`);
            assert.deepEqual(state.white, [], `${label}: white pieces in the dark theme`);
          } else {
            assert.ok(state.surface > 0.9, `${label}: light background, got ${state.surface}`);
          }
          assert.equal(state.overflow, false, `${label}: horizontal overflow`);
          assert.deepEqual(errors, [], `${label}: errors`);
          if (!theme.saved) {
            await page.screenshot({ path: `${output}/${target.name}-${theme.expected}-${width}.png`, fullPage: true });
          }
        } catch (error) {
          await page.screenshot({ path: `${output}/failed-${target.name}-${theme.system}-${theme.saved ?? 'none'}-${width}.png`, fullPage: true }).catch(() => {});
          throw error;
        } finally {
          await context.close();
        }
      }
    }
  }
  console.log('Sign-in, workspace creation and public pages follow the theme without a flash.');
} finally {
  await browser?.close();
  await server.close();
}
