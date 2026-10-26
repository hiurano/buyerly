// Loads the app once through a Vite dev server before the browser checks, so
// Vite bundles the dependencies into node_modules/.vite here and not inside the
// first check of a group, whose first page then outran its 10 s timeout. The
// page needs no API: only its modules have to load.
import { createRequire } from 'node:module';

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
  await page.route('**/api/**', (route) => route.fulfill({ status: 401, json: { detail: 'Not signed in' } }));
  const started = Date.now();
  await page.goto(`${origin}/`, { timeout: 120_000 });
  await page.waitForLoadState('networkidle', { timeout: 120_000 });
  console.log(`Dev server warmed in ${((Date.now() - started) / 1000).toFixed(1)} s`);
} finally {
  await browser?.close();
  await server.close();
}
