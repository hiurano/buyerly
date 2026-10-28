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
// - Each page's code is its own chunk (#494): once Inbox is idle, every
//   page's module has been requested (prefetched).
// - A page whose code is still on its way (held until DELAY_MS after the
//   click), on a reloaded app: only old frames, then only new ones.
// - Every sidebar page and Settings, once the app has opened each and synced
//   (#502's "Done when"): a switch between any two, in either direction, asks
//   the server nothing (the sync socket aside) and draws the whole new page in
//   the first frame after the click, never an empty or partial one, as Linear's.
//   Settings is opened with G S and left with Back to app, as in Linear.
//   The page's clock is stopped for the walk: data not in the sync engine is
//   read again behind the page once it is 30 s old, and the walk is longer.
//
// PAGE_SWITCH_BUILD=1 builds the app and runs only that last check on the
// build, served as the server does, for switch times as users get them.
const DELAY_MS = 400;
const SLOW_DELAY_MS = 2_500;
const HOLD_MS = 1_000;
const HOLD_SLACK_MS = 250;
const ACTIVE_ROW_MS = 100;
const RAPID_GAP_MS = 120;
const SETTLE_MS = 300;
const WATCH_LIMIT_MS = 6_000;
const WARM_SETTLE_MS = 150;
const BUILD = Boolean(process.env.PAGE_SWITCH_BUILD);
// The pages' modules, as the dev server serves them; each is a chunk in the build.
const PAGE_MODULES = [
  'inbox/InboxView', 'accounts/AccountsView', 'accounts/AccountPage', 'campaigns/CampaignsView', 'rules/RulesView',
  'rules/RecentlyDeletedRulesPage', 'teams/TeamHomeView', 'workspace/WorkspaceMembersView',
  'workspace/WorkspaceTeamsView', 'search/SearchView', 'preferences/PreferencesView',
].map((name) => `/src/components/${name}.tsx`);
const HELD_MODULE = '/src/components/teams/TeamHomeView.tsx';


import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mockSync } from './sync-mock.mjs';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer, preview } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-page-switch';
await mkdir(output, { recursive: true });
if (BUILD) execFileSync('npx', ['vite', 'build', '--logLevel', 'warn'], { stdio: 'inherit' });
const server = BUILD
  ? await preview({ root, preview: { host: '127.0.0.1', port: 0 } })
  : await createServer({ root, server: { host: '127.0.0.1', port: 0 } });

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
  if (!BUILD) await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  // The build registers a service worker; its fetches would pass the routes below.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await context.addCookies([{ name: 'buyerly_csrf', value: 'csrf-test', url: origin }]);
  const page = await context.newPage();
  await mockSync(page);
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let delay = 0;
  const requestedModules = new Set();
  // What the app asks the server, the sync socket aside.
  const apiRequests = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    requestedModules.add(pathname);
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/sync/ws')) apiRequests.push(`${request.method()} ${pathname}`);
  });
  // Set to a promise: Home's code waits for it.
  let heldCode = null;
  await context.route((url) => url.pathname === HELD_MODULE, async (route) => {
    if (heldCode) await heldCode;
    await route.continue();
  });
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
  /**
   * Inbox again on a reloaded app, so the pool holds nothing of the other pages:
   * the local database (#496) that would draw them at once is deleted first.
   */
  const freshInbox = async () => {
    delay = 0;
    await page.evaluate(async () => {
      for (const { name } of await indexedDB.databases()) {
        if (!name.startsWith('buyerly_')) continue;
        await new Promise((resolve) => {
          const deleting = indexedDB.deleteDatabase(name);
          deleting.onsuccess = deleting.onerror = resolve;
        });
      }
    });
    await page.goto(`${origin}/${workspace.slug}/inbox`);
    await page.locator('main').getByText(inboxItem.message).first().waitFor();
    await page.waitForTimeout(500);
  };

  /**
   * Each page as its first frame must draw it whole: in `scope`, text that
   * starts with its header and holds a row of its data.
   */
  const SIDEBAR_PAGES = [
    { name: 'Inbox', row: ROWS.inbox, prefix: 'Inbox', marker: inboxItem.message },
    { name: 'My campaigns', row: '.buyerly-sidebar-nav-item:has-text("My campaigns")', prefix: 'My campaigns', marker: hierarchy.campaigns[0].entity_name },
    { name: 'Members', row: ROWS.members, prefix: 'Members', marker: 'Bob Buyer' },
    { name: 'Ad accounts', row: ROWS.accounts, prefix: 'Ad accounts', marker: account.name },
    { name: 'Teams', row: '#sidebar-section-workspace .buyerly-sidebar-nav-item:has-text("Teams")', prefix: 'Teams', marker: team.key },
    { name: 'Home', row: ROWS.home, prefix: `${team.name}\nOverview`, marker: document.title },
    { name: 'Campaigns', row: '.sidebar-team .buyerly-sidebar-nav-item:has-text("Campaigns")', prefix: `${team.name}\n›\nCampaigns`, marker: hierarchy.campaigns[0].entity_name },
    { name: 'Team ad accounts', row: '.sidebar-team .buyerly-sidebar-nav-item:has-text("Ad accounts")', prefix: `${team.name}\n›\nAd accounts`, marker: account.name },
    { name: 'Rules', row: ROWS.rules, prefix: `${team.name}\n›\nRules`, marker: preset.name },
  ].map((target) => ({ scope: 'main', ...target }));
  const SETTINGS = { name: 'Settings', scope: 'body:has(.preferences-sidebar)', prefix: 'Back to app', marker: 'Interface theme' };

  /** Every ordered pair of sidebar pages once, as one walk from Inbox (an Euler circuit of the complete graph). */
  const everyPair = (count) => {
    const next = Array.from({ length: count }, (_, from) => Array.from({ length: count }, (_, to) => to).filter((to) => to !== from));
    const stack = [0];
    const walk = [];
    while (stack.length) {
      const at = stack.at(-1);
      if (next[at].length) stack.push(next[at].shift());
      else walk.push(stack.pop());
    }
    return walk.reverse();
  };

  /**
   * One switch from `from` to `to` on an app that holds both: the frames from
   * the click until `to` has shown for WARM_SETTLE_MS, and what was asked of the server.
   */
  const warmSwitch = async (from, to) => {
    apiRequests.length = 0;
    const start = to === SETTINGS ? { keys: ['g', 's'] } : from === SETTINGS ? { button: '[aria-label="Back to app"]' } : { button: to.row };
    if (start.button) await page.locator(start.button).first().evaluate((element) => element.setAttribute('data-switch-target', ''));
    const frames = await page.evaluate(({ from, to, keys, settle, limit }) => new Promise((resolve) => {
      const shows = ({ scope, prefix, marker }) => [...window.document.querySelectorAll(scope)].some((element) => {
        if (!element.checkVisibility()) return false;
        const text = element.innerText.trim();
        return text.startsWith(prefix) && text.includes(marker);
      });
      const button = window.document.querySelector('[data-switch-target]');
      button?.removeAttribute('data-switch-target');
      const frames = [];
      let shownAt = null;
      const t0 = performance.now();
      const sample = () => {
        const at = performance.now() - t0;
        const kind = shows(to) ? 'new' : shows(from) ? 'old' : 'empty';
        const text = kind === 'empty' ? (window.document.querySelector('main') ?? window.document.body).innerText.slice(0, 60).replace(/\s+/g, ' ') : '';
        frames.push({ at, kind, text });
        if (kind === 'new' && shownAt === null) shownAt = at;
        if ((shownAt !== null && at - shownAt > settle) || at > limit) {
          resolve(frames);
          return;
        }
        requestAnimationFrame(sample);
      };
      if (button) button.click();
      else for (const key of keys) window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      requestAnimationFrame(sample);
    }), { from, to, keys: start.keys, settle: WARM_SETTLE_MS, limit: WATCH_LIMIT_MS });
    // Anything asked a moment after the page drew is the switch's too.
    await page.waitForTimeout(100);
    return { frames, requests: [...apiRequests] };
  };

  /** Every sidebar page and Settings opened once, then every pair switched both ways. */
  const warmSwitches = async () => {
    // On the build this is the first page: the app's origin, so its databases can be emptied.
    if (BUILD) await page.goto(`${origin}/${workspace.slug}/inbox`);
    await freshInbox();
    for (const target of [...SIDEBAR_PAGES.slice(1), SIDEBAR_PAGES[0]]) {
      await page.locator(target.row).first().click();
      await page.locator('main').getByText(target.marker).first().waitFor();
    }
    await page.keyboard.press('g');
    await page.keyboard.press('s');
    await page.getByText(SETTINGS.marker).first().waitFor();
    await page.getByRole('button', { name: 'Back to app' }).click();
    await page.locator('main').getByText(inboxItem.message).first().waitFor();
    // Synced and idle: the other pages' code prefetched, the socket caught up.
    await page.waitForTimeout(1_000);
    // Late answers from here, so a switch that waits on one shows it.
    delay = DELAY_MS;
    // The walk takes longer than the pool counts an answer current (30 s); the clock stops,
    // so the pages' data stays as current as it is on any switch a moment after the last.
    await page.clock.setFixedTime(await page.evaluate(() => Date.now()));
    const walk = everyPair(SIDEBAR_PAGES.length).map((index) => SIDEBAR_PAGES[index]);
    const steps = [];
    const toSettings = new Set();
    for (const [index, to] of walk.entries()) {
      if (index === 0) continue;
      const from = walk[index - 1];
      if (!toSettings.has(from.name)) {
        toSettings.add(from.name);
        steps.push([from, SETTINGS], [SETTINGS, from]);
      }
      steps.push([from, to]);
    }
    const times = [];
    for (const [from, to] of steps) {
      const { frames, requests } = await warmSwitch(from, to);
      const name = `${from.name} → ${to.name}`;
      const order = frames.map((frame) => frame.kind).filter((kind, index, all) => kind !== all[index - 1]);
      const shown = frames.find((frame) => frame.kind === 'new');
      if (shown) times.push({ name, ms: shown.at });
      warmReport.push({ switch: name, ms: shown ? Math.round(shown.at) : null, frames: runs(frames), requests: requests.join(', ') });
      if (requests.length) failures.push(`${name}: asked the server ${requests.join(', ')}; want nothing`);
      // The whole page in the first frame after the click: at most that frame still shows the old one.
      if (order.join(',') !== 'new' && !(order.join(',') === 'old,new' && frames.filter((frame) => frame.kind === 'old').length <= 1)) {
        const empty = frames.find((frame) => frame.kind === 'empty');
        failures.push(`${name}: ${runs(frames)}${empty ? ` (empty: "${empty.text}")` : ''}; want the new page in the first frame`);
      }
    }
    delay = 0;
    const sorted = times.map((time) => time.ms).sort((a, b) => a - b);
    warmSummary = {
      switches: steps.length,
      median: Math.round(sorted[Math.floor(sorted.length / 2)]),
      p90: Math.round(sorted[Math.floor(sorted.length * 0.9)]),
      max: Math.round(sorted.at(-1)),
    };
  };
  const warmReport = [];
  let warmSummary = null;

  try {
    if (!BUILD) {
      await page.goto(`${origin}/${workspace.slug}/inbox`);
      await page.locator('main').getByText(inboxItem.message).first().waitFor();
      await page.waitForTimeout(500);
      // The other pages' code, prefetched once Inbox is idle: in, as for anyone who looked at Inbox a moment.
      await page.evaluate(() => import('/src/components/layout/BuyerlyPageChunks.ts')
        .then(({ PAGE_CHUNKS }) => Promise.all(Object.values(PAGE_CHUNKS).map((chunk) => chunk.load()))));

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

      // Once Inbox is idle, every page's code has been asked for.
      await freshInbox();
      requestedModules.clear();
      await freshInbox();
      {
        const missing = PAGE_MODULES.filter((path) => !requestedModules.has(path));
        if (missing.length) failures.push(`Prefetch: not requested after Inbox went idle: ${missing.join(', ')}`);
      }

      // A page whose code is still downloading: the old page holds until it is in.
      {
        let release;
        heldCode = new Promise((resolve) => { release = resolve; });
        await freshInbox();
        setTimeout(release, DELAY_MS);
        const frames = await watch({ row: ROWS.home, marker: document.title });
        heldCode = null;
        report.push({ switch: 'Home (code late)', frames: runs(frames) });
        const order = frames.map((frame) => frame.kind).filter((kind, index, all) => kind !== all[index - 1]);
        if (order.join(',') !== 'old,new') failures.push(`Home (code late): ${runs(frames)}; want old frames, then the page`);
        else if (frames.find((frame) => frame.kind === 'new').at < DELAY_MS - 50) {
          failures.push('Home (code late): the page showed before its code was released');
        }
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
    }

    await warmSwitches();

    console.table(report);
    console.table(warmReport);
    console.log('Switches between sidebar pages, ms to the new page:', warmSummary);
    await page.screenshot({ path: `${output}/last-page.png` });
    assert.deepEqual(failures, [], `page switches:\n${failures.join('\n')}`);
    assert.deepEqual(errors, []);
    if (!BUILD) console.log(`Page switch: the old page holds until the next has its data and its code, the skeleton shows after ${HOLD_MS} ms, every page's code is prefetched once Inbox is idle, and G K then G R lands on Rules alone`);
    console.log(`Page switch: ${warmSummary.switches} switches between every two sidebar pages and Settings ask the server nothing and draw the new page in the first frame`);
  } catch (error) {
    console.table(report);
    console.table(warmReport);
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
