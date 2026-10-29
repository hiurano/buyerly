// Exercise the real App with a synthetic API: the round Filter / Display options
// buttons are one component on every page, as Linear's (#556), in both themes.
// - On a list's tab row (Ad accounts, Rules, Ads Manager, My campaigns, Search)
//   they are white circles with Linear's 0.5px ring and soft shadow; in a page
//   header (Inbox) they sit bare. Values measured on live Linear 28.10.2026.
// - 28x28, round, a 14px icon in tertiary that turns primary on hover and while open.
// - A filter in the address leaves the Filter button as it is (Linear shows it in
//   the filter bar); the button is only lit while its menu is open.
// - The keyboard focus ring is Linear's 1px accent.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { mockSync } from './sync-mock.mjs';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-toolbar-buttons';
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });

const workspace = { id: 1, slug: 'alpha', name: 'Alpha', role: 'owner', badge_text: 'A', badge_color: '#5E6AD2', logo_url: '', is_active: true };
const me = {
  id: 5, username: 'bo', full_name: 'Bo Buyer', first_name: 'Bo', last_name: 'Buyer',
  email: 'bo@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '',
  onboarding_completed: true, onboarding_step: 'completed', active_workspace: workspace, workspaces: [workspace],
};
const healthy = {
  status: 'healthy', cause: 'none', signals: {}, consecutive_failures: 0, last_success_at: new Date().toISOString(),
  last_error_at: null, last_error_code: '', last_error_message: '', last_checked_at: null,
};
const accounts = [{
  id: 101, account_id: 'act_101', name: 'NL · Lead gen', custom_name: '', note: '', connection_type: 'facebook_login',
  owner_user_id: 5, workspace_id: 1, owner_id: '', batch_name: '', timezone_name: 'Europe/Amsterdam', currency: 'USD',
  account_status: 1, status_label: 'Active (ACTIVE)', rules_enabled: true, is_active: true, active_rules: [], group_ids: [],
  latest_metrics: null, today_metrics: null, health: healthy, created_at: '2026-10-01 09:00',
}];
const teams = [{ id: 10, name: 'Media', key: 'MED', description: '', created_at: '', retired_at: null, deleted_at: null, restorable_until: null, member_user_ids: [5], owner_user_ids: [5], account_ids: [101], is_member: true }];
const members = [{ id: 1, user_id: 5, username: 'bo', full_name: 'Bo Buyer', email: null, avatar_url: '', role: 'owner', joined_at: '', is_current_user: true }];
const presets = [{
  id: 7, name: 'Stop ad sets without leads', action: 'turn_off', level: 'adset', enabled: true,
  conditions: [{ metric: 'spend', operator: 'gte', value: 10, time_window: 'today' }],
  condition_logic: 'and', cooldown_minutes: 1440, check_interval_minutes: 5, budget_change_percent: 0, budget_max_daily: 0,
  needs_review: false, created_at: '2026-09-01T00:00:00Z', review_reason: '', last_run_at: '', last_checked_at: '',
  attached_account_ids: [], attached_scopes: {},
}];

// Linear's values (28.10.2026), per theme.
const linear = {
  light: {
    toolbarBg: 'lch(99.997 0.5 282)',
    toolbarHoverBg: 'lch(95.883 0.157 282)',
    toolbarOpenBg: 'lch(94.854 0.157 282)',
    ring: 'lch(0 0 0 / 0.09) 0px 0px 0px 0.5px, lch(0 0 0 / 0.02) 0px 3px 6px -2px, lch(0 0 0 / 0.04) 0px 1px 1px 0px',
    ringHover: 'lch(0 0 0 / 0.15) 0px 0px 0px 0.5px, lch(0 0 0 / 0.02) 0px 3px 6px -2px, lch(0 0 0 / 0.04) 0px 1px 1px 0px',
    icon: 'lch(39.176 1.25 282)',
    iconLit: 'lch(9.794 0 282)',
    focus: 'lch(53 52.26 286.91) solid 1px',
  },
  dark: {
    toolbarBg: 'lch(10.149 0.689 272)',
    toolbarHoverBg: 'lch(14.777 1.075 272)',
    toolbarOpenBg: 'lch(18.634 1.075 272)',
    ring: 'lch(100 0 0 / 0.137) 0px 0px 0px 0.5px, lch(0 0 0 / 0.3) 0px 0.5px 1px 1px',
    ringHover: 'lch(100 0 0 / 0.229) 0px 0px 0px 0.5px, lch(0 0 0 / 0.3) 0px 0.5px 1px 1px',
    icon: 'lch(61.803 1.2 272)',
    iconLit: 'lch(100 0 272)',
    focus: 'lch(47.918 59.303 288.421) solid 1px',
  },
};

const filter = encodeURIComponent(JSON.stringify([{ fieldId: 'automation', operator: 'is', values: ['on'] }]));
const pages = [
  { name: 'accounts', path: `/alpha/accounts?filter=${filter}`, placement: 'toolbar', filtered: true },
  { name: 'rules', path: '/alpha/rules', placement: 'toolbar' },
  { name: 'ads-manager', path: '/alpha/ads-manager/campaigns', placement: 'toolbar' },
  { name: 'my-campaigns', path: '/alpha/my-campaigns/campaigns', placement: 'toolbar' },
  { name: 'search', path: '/alpha/search?q=lead', placement: 'toolbar' },
  { name: 'inbox', path: '/alpha/inbox', placement: 'header' },
];

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });

  const openPage = async (scheme) => {
    // A Retina screen, as Linear was measured on.
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme });
    await context.addCookies([{ name: 'buyerly_csrf', value: 'csrf-test', url: origin }]);
    const page = await context.newPage();
    await mockSync(page);
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (route.request().method() !== 'GET') return route.fulfill({ json: {} });
      if (path === '/api/me') return route.fulfill({ json: me });
      if (path === '/api/view-settings') return route.fulfill({ json: { views: {} } });
      if (path === '/api/accounts') return route.fulfill({ json: accounts });
      if (path === '/api/workspaces/1/teams') return route.fulfill({ json: teams });
      if (path === '/api/workspaces/1/members') return route.fulfill({ json: members });
      if (path === '/api/presets') return route.fulfill({ json: presets });
      if (path === '/api/audit-events') return route.fulfill({ json: { items: [], page: 1, page_size: 5, total: 0, total_pages: 1, status_counts: {} } });
      if (path === '/api/analytics/hierarchy/accounts') {
        return route.fulfill({ json: { period: 'today', source: 'analytics_fact_store', accounts: [{ account_id: 'act_101', campaigns: [], adsets: [], ads: [] }], missing: [] } });
      }
      if (path === '/api/analytics/hierarchy') {
        return route.fulfill({ json: { parent_id: url.searchParams.get('parent_id'), level: 'campaign', period: 'today', source: 'analytics_fact_store', data_as_of: null, total: 0, items: [] } });
      }
      if (path === '/api/search') {
        const results = [{ kind: 'account', id: 'act_101', name: 'NL · Lead gen', account_id: 'act_101', account_name: '', parent_name: '', status: '', updated_at: '2026-10-01T09:00:00Z' }];
        return route.fulfill({ json: { query: url.searchParams.get('q'), limit: Number(url.searchParams.get('limit')), results, truncated: [] } });
      }
      if (path === '/api/inbox') return route.fulfill({ json: { items: [], has_more: false, unread_count: 0, priority_unread_count: 0, hidden_by_filters: 0 } });
      if (path === '/api/inbox/facets') return route.fulfill({ json: {} });
      if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0, priority_unread_count: 0 } });
      if (path === '/api/inbox/display') {
        return route.fulfill({ json: { unread_only: false, ordering: 'newest', show_snoozed: false, unread_first: false } });
      }
      return route.fulfill({ json: [] });
    });
    return { context, page, errors };
  };

  /** The button's look as Linear's tests read it: its box, colours, ring and icon. */
  const look = (button) => button.evaluate((element) => {
    const style = getComputedStyle(element);
    const ring = getComputedStyle(element, '::after');
    const box = element.getBoundingClientRect();
    const icon = element.querySelector('svg').getBoundingClientRect();
    return {
      size: `${box.width}x${box.height}`, radius: style.borderRadius, border: `${style.borderStyle} ${style.borderColor}`, background: style.backgroundColor,
      ring: ring.content === 'none' ? 'none' : ring.boxShadow, color: style.color, icon: `${icon.width}x${icon.height}`,
      active: element.dataset.active ?? null, outline: style.outline,
    };
  });

  for (const scheme of ['light', 'dark']) {
    const want = linear[scheme];
    const { context, page, errors } = await openPage(scheme);
    try {
      for (const [index, target] of pages.entries()) {
        // The first page waits for Vite to prepare the app.
        await page.goto(`${origin}${target.path}`, { timeout: index === 0 ? 120_000 : 30_000 });
        const label = `${target.name} (${scheme})`;
        const display = page.getByRole('button', { name: 'Display options' });
        await display.waitFor();
        const filterButton = page.getByRole('button', { name: /^Add (another )?filter$/ }).first();
        const buttons = [['Display options', display]];
        if (await filterButton.count()) buttons.push(['Filter', filterButton]);
        if (target.filtered) {
          // Read once on purpose: the address's filter shows from the first paint, before the saved views load.
          assert.equal(await filterButton.getAttribute('aria-label'), 'Add another filter', `${label}: a filter from the address`);
        }
        // The mouse rests away from the buttons while they are read.
        await page.mouse.move(700, 600);
        await page.waitForTimeout(300);
        for (const [name, button] of buttons) {
          const at = `${label} ${name}`;
          const rest = await look(button);
          assert.equal(rest.size, '28x28', `${at}: size`);
          assert.equal(rest.radius, '9999px', `${at}: radius`);
          // Playwright's Chromium reads a 0.5px border back as 1px, so only its kind is compared.
          assert.equal(rest.border, 'solid rgba(0, 0, 0, 0)', `${at}: clear border`);
          assert.equal(rest.icon, '14x14', `${at}: icon`);
          assert.equal(rest.color, want.icon, `${at}: icon colour`);
          assert.equal(rest.active, null, `${at}: not lit at rest, filters or not`);
          if (target.placement === 'toolbar') {
            assert.equal(rest.background, want.toolbarBg, `${at}: background`);
            assert.equal(rest.ring, want.ring, `${at}: Linear's ring`);
          } else {
            assert.equal(rest.background, 'rgba(0, 0, 0, 0)', `${at}: bare in the header`);
            assert.equal(rest.ring, 'none', `${at}: no ring in the header`);
          }

          await button.hover();
          const hover = await look(button);
          assert.equal(hover.color, want.iconLit, `${at}: hover icon`);
          if (target.placement === 'toolbar') {
            assert.equal(hover.background, want.toolbarHoverBg, `${at}: hover background`);
            assert.equal(hover.ring, want.ringHover, `${at}: hover ring`);
          }

          await button.click();
          await page.mouse.move(700, 600);
          await page.waitForTimeout(300);
          const open = await look(button);
          assert.equal(open.active, 'true', `${at}: lit while open`);
          assert.equal(open.color, want.iconLit, `${at}: open icon`);
          if (target.placement === 'toolbar') assert.equal(open.background, want.toolbarOpenBg, `${at}: open background`);
          if (name === 'Display options' && index === 0) await page.screenshot({ path: `${output}/${target.name}-open-${scheme}.png` });
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
          assert.equal((await look(button)).active, null, `${at}: unlit once closed`);

          // Keyboard focus: Linear's 1px accent ring.
          await button.focus();
          assert.equal((await look(button)).outline, want.focus, `${at}: focus ring`);
          await page.evaluate(() => document.activeElement?.blur());
        }
        await page.screenshot({ path: `${output}/${target.name}-${scheme}.png` });
      }
      assert.deepEqual(errors, []);
      console.log(`Toolbar buttons (${scheme}) passed`);
    } catch (error) {
      console.error(error);
      await page.screenshot({ path: `${output}/failure-${scheme}.png`, fullPage: true }).catch(() => {});
      console.error(errors);
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
