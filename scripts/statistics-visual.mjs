// Run exclusively in GitHub Actions. The temporary fixture entry is never shipped.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';

if (process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('Statistics browser checks run exclusively in GitHub Actions.');
}
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
// Tailwind resolves its config and content paths from the working directory.
process.chdir(root);
const output = '/tmp/buyerly-statistics-visual';
await mkdir(output, { recursive: true });
await writeFile(`${root}statistics-preview.html`, '<div id="root"></div><script type="module" src="/statistics-preview.tsx"></script>');
await writeFile(`${root}statistics-preview.tsx`, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { StatisticsView } from './src/components/statistics/StatisticsView';
import { Sidebar } from './src/components/sidebar/Sidebar';
import { TooltipProvider } from './src/ui/Tooltip';
import { useAppStore } from './src/store/useAppStore';
import './src/styles/index.css';
useAppStore.setState({ activeTab: 'statistics', isSidebarCollapsed: innerWidth < 768 });
document.documentElement.dataset.theme = 'dark';
createRoot(document.getElementById('root')!).render(
  <TooltipProvider><div className="app-shell flex h-screen w-screen overflow-hidden">
    <Sidebar /><main className="linear-floating-canvas"><StatisticsView /></main>
  </div></TooltipProvider>
);
`);
const server = await createServer({ root, server: { port: 5173, host: '127.0.0.1' } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  for (const width of [390, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let mode = 'ready';
    const requests = [];
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/accounts') {
        return route.fulfill({ json: mode === 'no-accounts' ? [] : [
          { account_id: 'act_123', name: 'Visual QA account', is_active: true },
          { account_id: 'act_456', name: 'Second QA account', is_active: true },
        ] });
      }
      if (url.pathname === '/api/analytics/hierarchy') {
        requests.push(Object.fromEntries(url.searchParams));
        if (mode === 'loading') await new Promise(resolve => setTimeout(resolve, 1200));
        if (mode === 'error') return route.fulfill({ status: 503, json: { detail: 'Temporarily unavailable' } });
        const items = mode === 'empty' ? [] : [1, 2, 3, 4, 5].map(id => ({
          entity_id: String(id), entity_name: `QA campaign ${id}`, currency: 'USD',
          status: id === 2 ? 'PAUSED' : 'ACTIVE', effective_status: '',
          spend: id * 1400, leads: id * 30, cost_per_lead: 46.67,
          impressions: id * 40000, clicks: id * 200, ctr: 0.5,
        }));
        return route.fulfill({ json: {
          items, total: items.length, level: url.searchParams.get('level'),
          period: url.searchParams.get('period'), source: 'analytics_fact_store',
          data_as_of: '2026-09-14T08:00:00Z',
        } });
      }
      return route.fulfill({ json: [] });
    });
    const open = () => page.goto('http://127.0.0.1:5173/statistics-preview.html');
    const screenshot = name => page.screenshot({ path: `${output}/${width}-${name}.png`, fullPage: true, animations: 'disabled' });
    const noOverflow = async () => {
      assert.equal(await page.locator('.app-shell').evaluate(node => getComputedStyle(node).display), 'flex', 'Application Tailwind styles must be loaded');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: document overflow`);
      const heading = await page.getByRole('heading', { name: 'Statistics', exact: true }).boundingBox();
      assert.ok(heading && heading.y >= 0 && heading.y < 1000 && heading.x < width, `${width}: Statistics must be in the viewport`);
      const cards = await page.locator('article').evaluateAll(nodes => nodes.map(node => ({ scroll: node.scrollWidth, client: node.clientWidth })));
      assert.ok(cards.every(card => card.scroll <= card.client + 1), `${width}: clipped metric`);
    };
    await open();
    await page.getByText('QA campaign 1', { exact: true }).waitFor();
    assert.equal(await page.locator('article').count(), 4);
    await noOverflow();
    await screenshot('overview');
    await page.getByRole('button', { name: 'Filter statistics', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitemradio', { name: 'Today', exact: true }).waitFor();
    const menu = await page.getByRole('menu').boundingBox();
    assert.ok(menu && menu.x >= 0 && menu.x + menu.width <= width && menu.y + menu.height <= 1000, `${width}: filter menu must fit`);
    await screenshot('filter');
    await page.getByRole('menuitemradio', { name: 'Today', exact: true }).click();
    await page.getByText('QA campaign 1', { exact: true }).waitFor();
    assert.equal(requests.at(-1).period, 'today');
    await page.getByRole('button', { name: 'Filter statistics', exact: true }).click();
    await page.getByRole('menuitemradio', { name: /Second QA account/ }).click();
    await page.getByText('QA campaign 1', { exact: true }).waitFor();
    assert.equal(requests.at(-1).parent_id, 'act_456');
    await page.getByRole('tab', { name: 'Ad sets', exact: true }).click();
    await page.getByText('QA campaign 1', { exact: true }).waitFor();
    assert.equal(requests.at(-1).level, 'adset');
    await page.getByRole('button', { name: 'Display options', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Compact', exact: true }).click();
    await page.getByRole('searchbox').fill('no matching name');
    await page.getByText('No matching ad sets', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await page.getByText('QA campaign 1', { exact: true }).waitFor();
    await noOverflow();
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await screenshot('light');
    for (const [state, title] of [
      ['loading', 'Loading campaigns…'], ['empty', 'No campaigns in this ad account'],
      ['error', "Couldn't load Statistics"], ['no-accounts', 'Connect an ad account'],
    ]) {
      mode = state;
      await open();
      await page.getByText(title, { exact: true }).waitFor();
      await noOverflow();
      await screenshot(state);
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser?.close();
  await server.close();
  await unlink(`${root}statistics-preview.html`);
  await unlink(`${root}statistics-preview.tsx`);
}
