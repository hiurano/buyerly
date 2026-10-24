// Page switch keeps the old page until the new one is ready, as Linear's (#490).
//
// Method
// - The real App on a synthetic API, served by Vite as the other checks are,
//   at 1440×900. Inbox opens with answers at once; after that every `/api`
//   answer waits DELAY_MS (SLOW_DELAY_MS for the slow page).
// - Each switch starts at t0 (a sidebar click, or G then a letter sent from
//   inside the page). Every animation frame until the new page shows its data
//   (and SETTLE_MS after) is sorted into one of:
//     old       the previous page's element is still in `main`, on screen
//     new       the new page's element shows its marker (a row of its data)
//     skeleton  the page skeleton, after a long wait
//     empty     anything else: a blank `main` or a page without its data
//   and records which sidebar row is marked active.
//
// Budgets
// - Pages never visited, each answer DELAY_MS late: only old frames, then
//   only new ones. No empty frame, no skeleton.
// - The sidebar marks the new row within ACTIVE_ROW_MS of the click.
// - Rapid switching on a reloaded app, G K then G R RAPID_GAP_MS later
//   (Ads Manager's rows are read at start, so G A would open at once):
//   Ad accounts never shows, and Rules comes after the old page with no empty
//   frame between.
// - A page whose data takes SLOW_DELAY_MS, on a reloaded app: old frames
//   until about HOLD_MS, then the skeleton, then the page; no empty frame.
const DELAY_MS = 400;
const SLOW_DELAY_MS = 2_500;
const HOLD_MS = 1_000;
const HOLD_SLACK_MS = 250;
const ACTIVE_ROW_MS = 100;
const RAPID_GAP_MS = 120;
const SETTLE_MS = 300;
const WATCH_LIMIT_MS = 6_000;


import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-page-switch';
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


const ROWS = {
  inbox: '.buyerly-sidebar-nav-item:has-text("Inbox")',
  accounts: '#sidebar-section-workspace .buyerly-sidebar-nav-item:has-text("Ad accounts")',
  rules: '.sidebar-team .buyerly-sidebar-nav-item:has-text("Rules")',
  members: '#sidebar-section-workspace .buyerly-sidebar-nav-item:has-text("Members")',
  home: '.sidebar-team .buyerly-sidebar-nav-item:has-text("Home")',
};

// Pages never visited before, in this order, from Inbox; each shows its marker once it has its data.
const FIRST_VISITS = [
  { name: 'Ad accounts', row: ROWS.accounts, marker: account.name },
  { name: 'Rules', row: ROWS.rules, marker: preset.name },
  { name: 'Members', row: ROWS.members, marker: 'Bob Buyer' },
  { name: 'Home', row: ROWS.home, marker: document.title },
];

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'buyerly_csrf', value: 'csrf-test', url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let delay = 0;
  await context.route('**/health/live', (route) => route.fulfill({ json: { status: 'alive', version: 'local' } }));
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() !== 'GET') {
      errors.push(`Unexpected write: ${request.method()} ${path}`);
      return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
    }
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
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

  /**
   * Starts a switch at t0 and sorts every frame of `main` until the marker has
   * shown for SETTLE_MS. `start` is a sidebar row to click, or letters to press after G.
   */
  const watch = async ({ row, keys, marker }) => {
    if (row) await page.locator(row).first().evaluate((element) => element.setAttribute('data-switch-target', ''));
    return page.evaluate(({ marker, keys, gap, settle, limit }) => new Promise((resolve) => {
      const main = window.document.querySelector('main');
      const oldPage = main.firstElementChild;
      const button = window.document.querySelector('[data-switch-target]');
      button?.removeAttribute('data-switch-target');
      const frames = [];
      let shownAt = null;
      const visible = (element) => Boolean(element?.isConnected && element.checkVisibility());
      const t0 = performance.now();
      const sample = () => {
        const at = performance.now() - t0;
        const skeleton = main.querySelector('[data-buyerly-page-skeleton]');
        const fresh = [...main.children].find((child) => child !== oldPage && visible(child));
        const kind = visible(oldPage)
          ? 'old'
          : visible(skeleton)
            ? 'skeleton'
            : fresh && fresh.innerText.includes(marker) ? 'new' : 'empty';
        const active = window.document.querySelector('.buyerly-sidebar-nav-item[aria-current="page"]');
        const shown = [...main.children].find(visible);
        frames.push({ at, kind, active: active?.innerText.trim() ?? '', text: shown?.innerText.slice(0, 60).replace(/\s+/g, ' ') ?? '' });
        if (kind === 'new' && shownAt === null) shownAt = at;
        if ((shownAt !== null && at - shownAt > settle) || at > limit) {
          resolve(frames);
          return;
        }
        requestAnimationFrame(sample);
      };
      const press = (key) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      if (button) button.click();
      else {
        press('g');
        press(keys[0]);
        setTimeout(() => {
          press('g');
          press(keys[1]);
        }, gap);
      }
      requestAnimationFrame(sample);
    }), { marker, keys, gap: RAPID_GAP_MS, settle: SETTLE_MS, limit: WATCH_LIMIT_MS });
  };

  /** The frames as runs: "old ×12 (0–380 ms) → new ×20". */
  const runs = (frames) => {
    const out = [];
    for (const frame of frames) {
      const last = out.at(-1);
      if (last && last.kind === frame.kind) {
        last.count += 1;
        last.to = frame.at;
      } else out.push({ kind: frame.kind, count: 1, from: frame.at, to: frame.at });
    }
    return out.map((run) => `${run.kind} ×${run.count} (${Math.round(run.from)}–${Math.round(run.to)} ms)`).join(' → ');
  };
  const kinds = (frames) => [...new Set(frames.map((frame) => frame.kind))];
  const failures = [];
  const report = [];
  /** Inbox again on a reloaded app, so the pool holds nothing of the other pages. */
  const freshInbox = async () => {
    delay = 0;
    await page.goto(`${origin}/${workspace.slug}/inbox`);
    await page.locator('main').getByText(inboxItem.message).first().waitFor();
    await page.waitForTimeout(500);
  };

  try {
    await page.goto(`${origin}/${workspace.slug}/inbox`);
    await page.locator('main').getByText(inboxItem.message).first().waitFor();
    await page.waitForTimeout(500);

    // Pages never visited, each answer late: the old page holds until the new one has its data.
    delay = DELAY_MS;
    for (const target of FIRST_VISITS) {
      const frames = await watch(target);
      report.push({ switch: target.name, frames: runs(frames) });
      const order = frames.map((frame) => frame.kind).filter((kind, index, all) => kind !== all[index - 1]);
      if (order.join(',') !== 'old,new' && order.join(',') !== 'new') {
        failures.push(`${target.name}: ${runs(frames)}; want old frames, then the page with its data`);
      }
      const marked = frames.find((frame) => frame.active.includes(target.name.split(' ')[0]));
      if (!marked || marked.at > ACTIVE_ROW_MS) {
        failures.push(`${target.name}: sidebar row marked at ${marked ? Math.round(marked.at) : 'never'} ms, budget ${ACTIVE_ROW_MS} ms`);
      }
      await page.waitForTimeout(DELAY_MS + 300);
    }

    // Rapid switching on a reloaded app: G K, then G R before Ad accounts is ready.
    await freshInbox();
    delay = DELAY_MS;
    {
      const frames = await watch({ keys: ['k', 'r'], marker: preset.name });
      report.push({ switch: 'G K, G R', frames: runs(frames) });
      const order = frames.map((frame) => frame.kind).filter((kind, index, all) => kind !== all[index - 1]);
      if (order.join(',') !== 'old,new') failures.push(`G K, G R: ${runs(frames)}; want old frames, then Rules`);
      const between = frames.filter((frame) => frame.text.startsWith('Ad accounts'));
      if (between.length) failures.push(`G K, G R: Ad accounts showed in ${between.length} frame(s)`);
    }

    // A page whose data is slow: the old page, then the skeleton after HOLD_MS, then the page.
    await freshInbox();
    delay = SLOW_DELAY_MS;
    {
      const frames = await watch({ row: ROWS.rules, marker: preset.name });
      report.push({ switch: 'Rules (slow)', frames: runs(frames) });
      const order = frames.map((frame) => frame.kind).filter((kind, index, all) => kind !== all[index - 1]);
      const skeletonAt = frames.find((frame) => frame.kind === 'skeleton')?.at ?? Infinity;
      if (order.join(',') !== 'old,skeleton,new') {
        failures.push(`Rules (slow): ${runs(frames)}; want old frames, the skeleton, then the page`);
      } else if (Math.abs(skeletonAt - HOLD_MS) > HOLD_SLACK_MS) {
        failures.push(`Rules (slow): skeleton at ${Math.round(skeletonAt)} ms, want ${HOLD_MS} ± ${HOLD_SLACK_MS} ms`);
      }
    }

    console.table(report);
    await page.screenshot({ path: `${output}/last-page.png` });
    assert.deepEqual(failures, [], `page switches:\n${failures.join('\n')}`);
    assert.deepEqual(errors, []);
    console.log(`Page switch: the old page holds until the next has its data, the skeleton shows after ${HOLD_MS} ms, and G K then G R lands on Rules alone`);
  } catch (error) {
    console.table(report);
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
