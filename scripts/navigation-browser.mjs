// Page-switch speed, as Linear's (#491): a page already visited comes back at
// once, from data the app holds, without asking the server first.
//
// Method
// - The real App on a synthetic API (Playwright routes answer at once), served
//   by Vite as the other checks are, at 1440×900.
// - The sidebar is walked twice: Inbox, My campaigns, the team's Campaigns,
//   Ad accounts, the team's Rules, Members, the team's Home. The first pass
//   loads every page; only the second one is measured.
// - Each switch clicks the sidebar row from inside the page, at t0. Until
//   WATCH_MS later, every animation frame records whether `main` shows the new
//   page yet and whether it shows that page's marker (a row of its data), a
//   MutationObserver records when `main` last changed, and a wrapped `fetch`
//   records when each `/api` request went out.
// - The first frame is the first one in which `main` is no longer the old page.
//
// Budgets (a revisited page fails on any of them)
// - No `/api` request before its first frame: what it shows first was held.
// - No empty frame: from its first frame on, `main` shows the page's marker.
// - Settled within SETTLE_BUDGET_MS: `main` stops changing by then.
const SETTLE_BUDGET_MS = 150;
const WATCH_MS = 800;
const MAX_REQUESTS_BEFORE_FIRST_FRAME = 0;

import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { mockSync } from './sync-mock.mjs';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-navigation';
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });

const workspace = {
  id: 7, slug: 'alpha', name: 'Alpha', role: 'owner', badge_text: 'A', badge_color: '#5E6AD2', logo_url: '', is_active: true,
};
const me = {
  id: 1, username: 'olga', full_name: 'Olga Owner', first_name: 'Olga', last_name: 'Owner',
  email: 'olga@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '',
  onboarding_completed: true, onboarding_step: 'completed', active_workspace: workspace, workspaces: [workspace],
};
const account = {
  id: 100, account_id: 'act_100', name: 'Main account', custom_name: '', note: '', lead_user_id: 1,
  connection_type: 'system_user', timezone_name: 'UTC', currency: 'USD', account_status: 1,
  status_label: 'Active (ACTIVE)', rules_enabled: true, is_active: true, primary_result: '',
  target_cost_per_result: null, active_rules: [],
};
const team = {
  id: 3, name: 'Growth', key: 'GRO', description: 'Buys traffic for the launches', created_at: '2026-09-01T10:00:00Z',
  retired_at: null, deleted_at: null, restorable_until: null, member_user_ids: [1, 2], owner_user_ids: [1],
  account_ids: [100], is_member: true, private: false,
};
const document = {
  id: 5, team_id: 3, title: 'Launch plan', content: 'Week one', created_by_user_id: 1, updated_by_user_id: 1,
  created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-02T10:00:00Z',
};
const member = (user_id, full_name, role) => ({
  id: user_id, user_id, username: full_name.split(' ')[0].toLowerCase(), full_name,
  email: `${full_name.split(' ')[0].toLowerCase()}@example.test`, avatar_url: '', role,
  joined_at: '2026-09-02T10:00:00Z', is_current_user: user_id === 1,
});
const members = [member(1, 'Olga Owner', 'owner'), member(2, 'Bob Buyer', 'member')];
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const inboxItem = {
  id: 4, workspace_id: 7, actor_type: 'system', actor_id: null, category: 'RULE_ACTION', event_type: 'NOTIFY_ONLY',
  status: 'SUCCESS', account_id: 'act_100', account_name: 'Main account', adset_id: '', adset_name: '',
  entity_level: 'adset', entity_id: '901', entity_name: 'Broad', rule_id: 7,
  rule_name: '$4 and no lead', action: 'NOTIFY_ONLY', message: 'CPL is $14, above the $12 goal', correlation_id: null,
  reverts_event_id: null, reverted_by_event_id: null, is_reverted: false, display_status: 'SUCCESS',
  can_undo: false, undo_reason: '', duration_ms: 12, created_at: minutesAgo(5), kind: 'rule_alerts',
  is_read: false, snoozed_until: null, unsnoozed_at: null,
};
const preset = {
  id: 7, name: '$4 and no lead', action: 'turn_off', level: 'adset', enabled: true,
  conditions: [{ metric: 'spend', operator: 'gte', value: 4, time_window: 'today' }],
  condition_logic: 'and', cooldown_minutes: 1440, check_interval_minutes: 5,
  budget_change_percent: 0, budget_max_daily: 0, needs_review: false, review_reason: '',
  created_at: minutesAgo(60 * 24 * 30), last_run_at: '', last_checked_at: '',
  attached_account_ids: ['act_100'], attached_scopes: { act_100: { level: 'account', ids: [] } }, label_ids: [],
};
const entity = (level, id, name, parent, spend, leads) => ({
  entity_id: id, entity_name: name, entity_level: level, parent_entity_id: parent, account_id: 'act_100',
  currency: 'USD', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: level === 'ad' ? 0 : 25,
  data_as_of: '2026-10-13T08:00:00Z', spend, impressions: spend * 100, reach: spend * 80, cpm: 10, clicks: spend,
  link_clicks: Math.round(spend / 2), outbound_clicks: 0, landing_page_views: 0, leads, registrations: 0, purchases: 0,
  cost_per_lead: leads ? spend / leads : null, cost_per_registration: null, cost_per_purchase: null,
  cost_per_landing_page_view: null, cpc: 1, ctr: 1, cpc_link: 2, ctr_link: 0.5, ctr_outbound: 0,
});
const hierarchy = {
  campaigns: [entity('campaign', '801', 'Alpha campaign', 'act_100', 50, 5)],
  adsets: [entity('adset', '901', 'Broad', '801', 30, 3)],
  ads: [entity('ad', '951', 'Video', '901', 30, 3)],
};

// Each sidebar row and a piece of its data that the page shows once it has loaded.
const PAGES = [
  { name: 'Inbox', row: '.buyerly-sidebar-nav-item:has-text("Inbox")', marker: inboxItem.message },
  { name: 'My campaigns', row: '.buyerly-sidebar-nav-item:has-text("My campaigns")', marker: 'Alpha campaign' },
  { name: 'Campaigns', row: '.sidebar-team .buyerly-sidebar-nav-item:has-text("Campaigns")', marker: 'Alpha campaign' },
  { name: 'Ad accounts', row: '#sidebar-section-workspace .buyerly-sidebar-nav-item:has-text("Ad accounts")', marker: account.name },
  { name: 'Rules', row: '.sidebar-team .buyerly-sidebar-nav-item:has-text("Rules")', marker: preset.name },
  { name: 'Members', row: '#sidebar-section-workspace .buyerly-sidebar-nav-item:has-text("Members")', marker: 'Bob Buyer' },
  { name: 'Home', row: '.sidebar-team .buyerly-sidebar-nav-item:has-text("Home")', marker: document.title },
];

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'buyerly_csrf', value: 'csrf-test', url: origin }]);
  // Every `/api` request the page sends, on the page's own clock.
  await context.addInitScript(() => {
    window.__apiRequests = [];
    const send = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
      if (url.pathname.startsWith('/api/')) window.__apiRequests.push({ at: performance.now(), path: url.pathname + url.search });
      return send(input, init);
    };
  });
  const page = await context.newPage();
  await mockSync(page);
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('**/health/live', (route) => route.fulfill({ json: { status: 'alive', version: 'local' } }));
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() !== 'GET') {
      errors.push(`Unexpected write: ${request.method()} ${path}`);
      return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
    }
    if (path === '/api/me') return route.fulfill({ json: me });
    if (path === '/api/auth/accounts') return route.fulfill({ json: [] });
    if (path === '/api/accounts') return route.fulfill({ json: [account] });
    if (path === `/api/workspaces/${workspace.id}/teams`) {
      return route.fulfill({ json: url.searchParams.get('status') === 'deleted' ? [] : [team] });
    }
    if (path === `/api/workspaces/${workspace.id}/members`) return route.fulfill({ json: members });
    if (path === `/api/workspaces/${workspace.id}/teams/${team.id}/documents`) return route.fulfill({ json: [document] });
    if (path === '/api/analytics/hierarchy/accounts') {
      const ids = url.searchParams.get('account_ids')?.split(',') ?? [account.account_id];
      return route.fulfill({ json: {
        period: url.searchParams.get('period'), source: 'analytics_fact_store',
        accounts: ids.filter((id) => id === account.account_id).map((id) => ({ account_id: id, ...hierarchy })),
        missing: ids.filter((id) => id !== account.account_id),
      } });
    }
    if (path === '/api/presets') return route.fulfill({ json: [preset] });
    if (path === '/api/inbox') return route.fulfill({ json: { items: [inboxItem], has_more: false, unread_count: 1, priority_unread_count: 1 } });
    if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 1, priority_unread_count: 1 } });
    if (path === '/api/inbox/display') return route.fulfill({ json: {} });
    if (path === '/api/view-settings') return route.fulfill({ json: { views: {} } });
    if (path === '/api/favorites') return route.fulfill({ json: { favorites: [] } });
    if (path === '/api/audit-events') {
      return route.fulfill({ json: { items: [], page: 1, page_size: 25, total: 0, total_pages: 0, status_counts: {} } });
    }
    if (path.endsWith('/count')) return route.fulfill({ json: { count: 0 } });
    return route.fulfill({ json: [] });
  });

  /** Clicks a sidebar row at t0 and watches `main` frame by frame until WATCH_MS. */
  const measure = async (target) => {
    const row = page.locator(target.row).first();
    await row.evaluate((element) => element.setAttribute('data-navigation-target', ''));
    return page.evaluate(({ marker, watch }) => new Promise((resolve) => {
      const main = document.querySelector('main');
      const button = document.querySelector('[data-navigation-target]');
      button.removeAttribute('data-navigation-target');
      const before = main.innerHTML;
      const requestsBefore = window.__apiRequests.length;
      const frames = [];
      let lastChange = null;
      const observer = new MutationObserver(() => { lastChange = performance.now(); });
      observer.observe(main, { subtree: true, childList: true, characterData: true, attributes: true });
      const t0 = performance.now();
      const sample = () => {
        const now = performance.now();
        const html = main.innerHTML;
        frames.push({ at: now - t0, switched: html !== before, marker: main.innerText.includes(marker) });
        if (now - t0 < watch) {
          requestAnimationFrame(sample);
          return;
        }
        observer.disconnect();
        resolve({
          frames,
          settled: lastChange === null ? 0 : lastChange - t0,
          requests: window.__apiRequests.slice(requestsBefore).map((request) => ({ ...request, at: request.at - t0 })),
        });
      };
      button.click();
      requestAnimationFrame(sample);
    }), { marker: target.marker, watch: WATCH_MS });
  };

  try {
    await page.goto(`${origin}/${workspace.slug}/inbox`);
    await page.locator('main').getByText(inboxItem.message).first().waitFor();

    // First pass: every page loads once, and its marker shows that the mock fills it.
    for (const target of PAGES) {
      await page.locator(target.row).first().click();
      await page.locator('main').getByText(target.marker).first().waitFor();
      await page.waitForTimeout(300);
    }

    // Second pass, measured.
    const failures = [];
    const report = [];
    for (const target of PAGES) {
      const result = await measure(target);
      const first = result.frames.find((frame) => frame.switched);
      const firstAt = first ? first.at : Infinity;
      const early = result.requests.filter((request) => request.at < firstAt);
      const empty = result.frames.filter((frame) => frame.switched && !frame.marker);
      report.push({
        page: target.name,
        firstFrameMs: Math.round(firstAt),
        settledMs: Math.round(result.settled),
        requests: result.requests.map((request) => `${request.path} @${Math.round(request.at)}ms`),
        emptyFrames: empty.length,
      });
      if (!first) failures.push(`${target.name}: main never changed`);
      if (early.length > MAX_REQUESTS_BEFORE_FIRST_FRAME) {
        failures.push(`${target.name}: ${early.length} request(s) before its first frame: ${early.map((request) => request.path).join(', ')}`);
      }
      if (empty.length) failures.push(`${target.name}: ${empty.length} frame(s) without its data (first at ${Math.round(empty[0].at)} ms)`);
      if (result.settled > SETTLE_BUDGET_MS) {
        failures.push(`${target.name}: settled at ${Math.round(result.settled)} ms, budget ${SETTLE_BUDGET_MS} ms`);
      }
      await page.waitForTimeout(300);
    }
    console.table(report);
    await page.screenshot({ path: `${output}/last-page.png` });
    assert.deepEqual(failures, [], `revisited pages:\n${failures.join('\n')}`);
    assert.deepEqual(errors, []);
    console.log(`Navigation: every revisited page shows its data in its first frame, asks nothing first and settles within ${SETTLE_BUDGET_MS} ms`);
  } catch (error) {
    await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
    console.error(errors);
    throw error;
  } finally {
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
