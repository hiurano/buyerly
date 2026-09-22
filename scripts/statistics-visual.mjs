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
        // The first account declares a target, the second declares nothing, so
        // one run covers both the judged and the unjudged path.
        return route.fulfill({ json: mode === 'no-accounts' ? [] : [
          { account_id: 'act_123', name: 'Visual QA account', is_active: true,
            currency: 'USD', timezone_name: 'America/New_York',
            primary_result: 'leads', target_cost_per_result: 40 },
          { account_id: 'act_456', name: 'Second QA account', is_active: true,
            currency: 'USD', timezone_name: 'America/New_York',
            primary_result: '', target_cost_per_result: null },
        ] });
      }
      if (url.pathname === '/api/analytics/hierarchy') {
        requests.push(Object.fromEntries(url.searchParams));
        if (mode === 'loading') await new Promise(resolve => setTimeout(resolve, 1200));
        if (mode === 'error') return route.fulfill({ status: 503, json: { detail: 'Temporarily unavailable' } });
        // The full fact shape: the screen derives its primary result, decision
        // state and diagnostics from these fields alone.
        const items = mode === 'empty' ? [] : [1, 2, 3, 4, 5].map(id => {
          const impressions = id * 40000;
          const clicks = id * 200;
          // Row 2 stays under the decision floor so the undecidable state renders.
          const leads = id === 2 ? 4 : id * 30;
          const spend = id * 1400;
          return {
            entity_id: String(id), entity_name: `QA campaign ${id}`,
            entity_level: url.searchParams.get('level'),
            parent_entity_id: url.searchParams.get('parent_id'),
            account_id: 'act_123', currency: 'USD',
            status: id === 2 ? 'PAUSED' : 'ACTIVE', effective_status: '',
            daily_budget: id * 1000, data_as_of: '2026-09-14T08:00:00Z',
            spend, impressions, reach: impressions / 2, cpm: 35, clicks,
            link_clicks: clicks * 0.8, outbound_clicks: clicks * 0.7,
            landing_page_views: clicks * 0.6,
            leads, registrations: 0, purchases: 0,
            cost_per_lead: leads ? spend / leads : null,
            cost_per_registration: null, cost_per_purchase: null,
            cost_per_landing_page_view: 12.5,
            cpc: spend / clicks, ctr: 0.5, cpc_link: 9.4, ctr_link: 0.4, ctr_outbound: 0.35,
          };
        });
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
    // The declared target turns cost per result into a verdict.
    await page.getByText('17% above target', { exact: true }).first().waitFor();
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

    // Decision grouping is a real view change, and the undecidable row is
    // reported separately from a row that is simply performing badly.
    await page.getByRole('button', { name: 'Display options', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Decision status', exact: true }).click();
    await page.getByText('Not enough data', { exact: true }).first().waitFor();
    await noOverflow();
    await screenshot('grouped');

    // Diagnostics open in place, under the row they explain.
    await page.getByRole('button', { name: 'Show diagnostics for QA campaign 1', exact: true }).click();
    await page.getByText('Frequency', { exact: true }).waitFor();
    await noOverflow();
    await screenshot('diagnostics');
    await page.getByRole('button', { name: 'Hide diagnostics for QA campaign 1', exact: true }).click();

    // Drilling into a campaign keeps the columns and deepens the parent.
    await page.getByRole('button', { name: 'Show ad sets in QA campaign 1', exact: true }).click();
    await page.getByRole('navigation', { name: 'Statistics drill-down' }).waitFor();
    assert.equal(requests.at(-1).parent_id, '1');
    assert.equal(requests.at(-1).level, 'adset');
    await noOverflow();
    await screenshot('drilldown');

    // A level tab returns to the account-wide view.
    await page.getByRole('tab', { name: 'Ad sets', exact: true }).click();
    await page.getByText('QA campaign 1', { exact: true }).waitFor();
    assert.equal(requests.at(-1).level, 'adset');
    assert.equal(requests.at(-1).parent_id, 'act_456');
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
