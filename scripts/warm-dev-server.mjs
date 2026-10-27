// Loads the app once through a Vite dev server before the browser checks. StyleX
// compiles a file differently in dev than in the build, so the React Compiler's
// cache from the warm-up build misses every StyleX file in dev; the first check
// of a group compiled them inside its first page and outran its 10 s timeout.
// A signed-in user opens the Inbox and then loads every chunk, so every file
// is compiled here; every other API call answers 404.
import { createRequire } from 'node:module';
import { mockSync } from './sync-mock.mjs';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch();
  const page = await browser.newPage();
  await mockSync(page);
  const workspace = { id: 7, slug: 'alpha', name: 'Alpha', role: 'owner', badge_text: 'A', badge_color: '', logo_url: '', is_active: true };
  const me = {
    id: 1, username: 'olga', full_name: 'Olga Self', first_name: 'Olga', last_name: 'Self', email: 'olga@example.test',
    email_verified: true, unconfirmed_email: null, avatar_url: '', onboarding_completed: true, onboarding_step: 'completed',
    active_workspace: workspace, workspaces: [workspace],
  };
  await page.context().route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me') return route.fulfill({ json: me });
    if (path === '/api/inbox') return route.fulfill({ json: { items: [], has_more: false, unread_count: 0 } });
    return route.fulfill({ status: 404, json: { detail: 'Not mocked' } });
  });
  const started = Date.now();
  await page.goto(`${origin}/alpha/inbox`, { timeout: 120_000 });
  await page.waitForLoadState('networkidle', { timeout: 120_000 });
  // The other pages come as chunks once the Inbox is idle (#494); the screens
  // before the workspace and the WebMCP tools only where they are used: compile them too.
  await page.evaluate(() => Promise.all([
    '/src/components/layout/BuyerlyPageChunks.ts',
    '/src/webmcp/tools.ts',
  ].map((path) => import(path)))
    .then(([chunks]) => Promise.all([chunks.SIGNED_OUT_CHUNK, ...Object.values(chunks.PAGE_CHUNKS)].map((chunk) => chunk.load()))));
  console.log(`Dev server warmed in ${((Date.now() - started) / 1000).toFixed(1)} s`);
} finally {
  await browser?.close();
  await server.close();
}
