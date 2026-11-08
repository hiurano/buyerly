// Screens before and after a style change, compared pixel for pixel and by
// computed style (#693). Not a CI check: a tool for moving styles around
// (index.css → StyleX and CSS Modules, #694–#698) without changing the look.
//
//   node scripts/screens-compare.ts --base <checkout> [--head <checkout>] [--only <regex>] [--out <dir>]
//     [--dev] [--jobs <n>] [--save-all]
//
// Each checkout (a git worktree with its own `npm ci`; --head defaults to this
// one) is built with its own Vite and served by `vite preview` (with --dev: by
// its dev server). Every scenario below opens the same page in both, on the
// browser checks' mock API (sync-mock.ts) with one fixed clock, in light and
// dark, at 1280×800 and 390×844 (touch), and then compares:
// - the screenshots, pixel by pixel (in the browser, with no extra packages);
// - every element's and ::before/::after's computed style, plus its box, keyed
//   by its place in the DOM (class names are not compared, so a moved rule's
//   new class name is no difference). Custom properties count on <html> only.
// It prints a table (scenario × theme × size → differing pixels and styles),
// writes it to <out>/report.md with each difference's screenshots (base, head,
// diff in red) and style lines, and exits 1 if anything differs.
//
// A scenario is a page plus what to do there (open a menu, hover a row); add
// yours to SCENARIOS when you change the styles of a screen that none covers.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { Browser, Page, Route } from 'playwright';
import { mockSync } from './sync-mock.ts';

const here = dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({
  options: {
    base: { type: 'string' },
    head: { type: 'string', default: resolve(here, '..') },
    only: { type: 'string' },
    out: { type: 'string', default: join(tmpdir(), 'buyerly-screens-compare') },
    dev: { type: 'boolean', default: false },
    jobs: { type: 'string', default: '3' },
    'save-all': { type: 'boolean', default: false },
  },
});
if (!args.base) {
  console.error('Usage: node scripts/screens-compare.ts --base <checkout> [--head <checkout>] [--only <regex>] [--out <dir>] [--dev] [--jobs <n>] [--save-all]');
  process.exit(2);
}
const trees = { base: resolve(args.base), head: resolve(args.head) } as const;
type Side = keyof typeof trees;
for (const tree of Object.values(trees)) {
  if (!existsSync(join(tree, 'node_modules', 'vite'))) throw new Error(`${tree}: run npm ci there first`);
}
const require = createRequire(join(trees.head, 'frontend', 'package.json'));
const { chromium } = require('playwright') as typeof import('playwright');

// ---------------------------------------------------------------------------
// The mock API: one workspace with a team, an ad account and its campaigns,
// rules, Inbox items, members and the Settings pages' data.

const NOW = new Date('2026-10-13T12:00:00Z');
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const workspace = {
  id: 7, slug: 'alpha', name: 'Alpha', role: 'owner', badge_text: 'A', badge_color: '#5E6AD2', logo_url: '', is_active: true,
};
const owner = {
  id: 1, username: 'olga', full_name: 'Olga Owner', first_name: 'Olga', last_name: 'Owner',
  email: 'olga@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '',
  onboarding_completed: true, onboarding_step: 'completed', active_workspace: workspace, workspaces: [workspace],
};
type User = 'owner' | 'signed-out' | 'new' | 'onboarding';
const users: Record<Exclude<User, 'signed-out'>, object> = {
  owner,
  new: { ...owner, full_name: '', first_name: '', last_name: '', onboarding_completed: false, onboarding_step: 'workspace', active_workspace: null, workspaces: [] },
  onboarding: { ...owner, onboarding_completed: false, onboarding_step: 'invites' },
};
const account = {
  id: 100, account_id: 'act_100', name: 'Main account', custom_name: '', note: 'Launch budget', lead_user_id: 1,
  connection_type: 'system_user', timezone_name: 'UTC', currency: 'USD', account_status: 1,
  status_label: 'Active (ACTIVE)', rules_enabled: true, is_active: true, primary_result: '',
  target_cost_per_result: null, active_rules: [],
};
const team = {
  id: 3, name: 'Growth', key: 'GRO', description: 'Buys traffic for the launches', created_at: ago(60 * 24 * 40),
  retired_at: null, deleted_at: null, restorable_until: null, member_user_ids: [1, 2], owner_user_ids: [1],
  account_ids: [100], is_member: true, private: false,
};
const teamDocument = {
  id: 5, team_id: 3, title: 'Launch plan', content: 'Week one: broad audiences.\n\nWeek two: lookalikes.', created_by_user_id: 1,
  updated_by_user_id: 1, created_at: ago(60 * 24 * 12), updated_at: ago(60 * 24 * 11),
};
const member = (user_id: number, full_name: string, role: string) => ({
  id: user_id, user_id, username: full_name.split(' ')[0].toLowerCase(), full_name,
  email: `${full_name.split(' ')[0].toLowerCase()}@example.test`, avatar_url: '', role,
  joined_at: ago(60 * 24 * 30), is_current_user: user_id === 1,
});
const members = [member(1, 'Olga Owner', 'owner'), member(2, 'Bob Buyer', 'member'), member(3, 'Vera Viewer', 'guest')];
const invites = [{ id: 21, email: 'waiting@example.test', role: 'member', status: 'pending', created_at: ago(60 * 24 * 2) }];
const entity = (level: string, id: string, name: string, parent: string, spend: number, leads: number, status = 'ACTIVE') => ({
  entity_id: id, entity_name: name, entity_level: level, parent_entity_id: parent, account_id: 'act_100',
  currency: 'USD', status, effective_status: status, daily_budget: level === 'ad' ? 0 : 25,
  data_as_of: ago(30), spend, impressions: spend * 100, reach: spend * 80, cpm: 10, clicks: spend,
  link_clicks: Math.round(spend / 2), outbound_clicks: 0, landing_page_views: 0, leads, registrations: 0, purchases: 0,
  cost_per_lead: leads ? spend / leads : null, cost_per_registration: null, cost_per_purchase: null,
  cost_per_landing_page_view: null, cpc: 1, ctr: 1.23, cpc_link: 2, ctr_link: 0.5, ctr_outbound: 0,
});
const hierarchy = {
  campaigns: [
    entity('campaign', '801', 'Alpha campaign', 'act_100', 50, 5),
    entity('campaign', '802', 'Retargeting with a long name that does not fit', 'act_100', 12.5, 0, 'PAUSED'),
  ],
  adsets: [entity('adset', '901', 'Broad', '801', 30, 3), entity('adset', '902', 'Lookalike 1%', '801', 20, 2)],
  ads: [entity('ad', '951', 'Video', '901', 30, 3)],
};
const preset = (id: number, name: string, extra: object = {}) => ({
  id, name, action: 'turn_off', level: 'adset', enabled: true,
  conditions: [{ metric: 'spend', operator: 'gte', value: 4, time_window: 'today' }],
  condition_logic: 'and', cooldown_minutes: 1440, check_interval_minutes: 5,
  budget_change_percent: 0, budget_max_daily: 0, needs_review: false, review_reason: '',
  created_at: ago(60 * 24 * 30), last_run_at: ago(15), last_checked_at: ago(5),
  attached_account_ids: ['act_100'], attached_scopes: { act_100: { level: 'account', ids: [] } }, label_ids: [1], ...extra,
});
const presets = [
  preset(7, '$4 and no lead'),
  preset(8, 'Budget up on cheap leads', { action: 'increase_budget', budget_change_percent: 20, enabled: false, label_ids: [] }),
];
const ruleLabels = [
  { id: 1, name: 'Launch', color: '#4cb782', description: 'First days of a campaign', created_at: ago(60 * 24 * 30) },
  { id: 2, name: 'Scaling', color: '#bb87fc', description: '', created_at: ago(60 * 24 * 20) },
];
const notification = (id: number, minutes: number, fields: object) => ({
  id, workspace_id: 7, actor_type: 'system', actor_id: null, category: 'RULE_ACTION', event_type: 'STOP',
  status: 'SUCCESS', account_id: 'act_100', account_name: account.name, adset_id: '901', adset_name: 'Broad',
  entity_level: 'adset', entity_id: '901', entity_name: 'Broad', rule_id: 7,
  rule_name: '$4 and no lead', action: 'STOP', message: 'Spent $4.50 with 0 leads', correlation_id: null,
  reverts_event_id: null, reverted_by_event_id: null, is_reverted: false, display_status: 'SUCCESS',
  can_undo: true, undo_reason: '', duration_ms: 12, created_at: ago(minutes), kind: 'rule_actions',
  is_read: false, snoozed_until: null, unsnoozed_at: null, ...fields,
});
const notifications = [
  notification(4, 5, { event_type: 'NOTIFY_ONLY', action: 'NOTIFY_ONLY', message: 'CPL is $14, above the $12 goal', kind: 'rule_alerts', can_undo: false }),
  notification(3, 180, { is_read: true }),
  notification(2, 60 * 26, { is_read: true, entity_name: 'Lookalike 1%', entity_id: '902' }),
];
const sessions = [
  { id: 'current', current: true, ip_address: '203.0.113.10', location: 'Helsinki, 18, FI',
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    created_at: ago(60 * 24 * 9), expires_at: ago(-60 * 24), last_seen_at: ago(0) },
  { id: 'other', current: false, ip_address: '203.0.113.11', location: 'Riga, RIX, LV',
    user_agent: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
    created_at: ago(60 * 24 * 10), expires_at: ago(-60 * 20), last_seen_at: ago(60 * 14) },
];
const kinds = ['urgent', 'rule_alerts', 'rule_actions', 'assistant', 'manual', 'team', 'system'];
const channels = Object.fromEntries(['desktop', 'email', 'telegram'].map((name) => [name, { enabled: name === 'email', priority_only: false, kinds }]));
const auditEvents = notifications.map((item) => ({ ...item, kind: undefined }));

/** The answer to one REST request (the graphql mock turns the app's GraphQL into these). */
function answer(user: User, method: string, url: URL): { status?: number; json: unknown } {
  const path = url.pathname;
  const ws = `/api/workspaces/${workspace.id}`;
  if (path === '/api/me') return user === 'signed-out' ? { status: 401, json: { detail: 'Not authenticated' } } : { json: users[user] };
  if (method !== 'GET') return { json: { success: true } };
  const routes: Record<string, unknown> = {
    '/api/auth/accounts': [],
    '/api/auth/sessions': sessions,
    '/api/accounts': [account],
    '/api/presets': presets,
    '/api/rule-labels': ruleLabels,
    '/api/favorites': { favorites: [] },
    '/api/view-settings': { views: {} },
    '/api/inbox': { items: notifications, has_more: false, unread_count: 1, priority_unread_count: 1, hidden_by_filters: 0 },
    '/api/inbox/unread-count': { unread_count: 1, priority_unread_count: 1 },
    '/api/inbox/display': { unread_only: false, ordering: 'newest', show_snoozed: false, unread_first: false },
    '/api/inbox/facets': { type: [], status: [], account: [], from: [] },
    '/api/inbox/senders': [],
    '/api/notifications/channels': channels,
    '/api/notifications/desktop': { subscribed: false },
    '/api/telegram/connection': { available: true, connected: false, username: null, first_name: null, connected_at: null, error: null },
    '/api/meta/connections': [],
    '/api/deleted-items': [],
    '/api/adsets/stopped': [],
    '/api/audit-events': { items: auditEvents, page: 1, page_size: 25, total: auditEvents.length, total_pages: 1, status_counts: {} },
    '/api/search': { results: [], total: 0 },
    [`/api/accounts/${account.account_id}/notifications`]: { enabled: true },
    [`${ws}/members`]: members,
    [`${ws}/invites`]: invites,
    [`${ws}/invite-link`]: { invite_url: 'https://buyerly.app/invite/link-token', turned_off: false },
    [`${ws}/teams/${team.id}/documents`]: [teamDocument],
    '/api/invites/invite-token': {
      valid: true, status: 'pending', workspace_name: workspace.name, workspace_slug: workspace.slug, workspace_id: workspace.id,
      workspace_logo_url: '', inviter_name: 'Olga Owner', role: 'member', target_email: 'new@example.test',
    },
  };
  if (path in routes) return { json: routes[path] };
  if (path === `${ws}/teams`) return { json: url.searchParams.get('status') === 'deleted' ? [] : [team] };
  if (path === '/api/analytics/hierarchy/accounts') {
    return { json: {
      period: url.searchParams.get('period'), source: 'analytics_fact_store', missing: [],
      accounts: [{ account_id: account.account_id, ...hierarchy }],
    } };
  }
  if (path === '/api/analytics/hierarchy') {
    const level = url.searchParams.get('level') ?? 'campaign';
    const items = (hierarchy as Record<string, unknown[]>)[`${level}s`] ?? [];
    return { json: { parent_id: url.searchParams.get('parent_id'), level, period: 'today', source: 'analytics_fact_store', data_as_of: null, total: items.length, items } };
  }
  if (path.endsWith('/count')) return { json: { count: 0 } };
  return { json: [] };
}

// ---------------------------------------------------------------------------
// The scenarios: a page, who is signed in, and what to do before the capture.

interface Scenario {
  name: string;
  path: string;
  user?: User;
  /** Text or a selector (starting with . # or [) that is in the page once it has its data. */
  ready?: string;
  /** Opens a menu, hovers a row… Runs on both sides alike; `phone` is true at 390px. */
  act?: (page: Page, phone: boolean) => Promise<void>;
  /** Only at one size. */
  only?: 'desktop' | 'phone';
}
const W = `/${workspace.slug}`;
const press = (keys: string) => async (page: Page) => { await page.keyboard.press(keys); };
const click = (selector: string) => async (page: Page) => { await page.locator(selector).first().click(); };
const hover = (selector: string) => async (page: Page) => { await page.locator(selector).first().hover(); };
const SCENARIOS: Scenario[] = [
  // The app shell and Inbox.
  { name: 'inbox', path: `${W}/inbox`, ready: 'CPL is $14' },
  { name: 'inbox-open', path: `${W}/inbox/4`, ready: 'CPL is $14' },
  { name: 'inbox-display-options', path: `${W}/inbox`, ready: 'CPL is $14', act: click('[aria-label="Display options"]') },
  { name: 'sidebar-hover', path: `${W}/inbox`, ready: 'CPL is $14', only: 'desktop', act: hover('.buyerly-sidebar-nav-item:has-text("Members")') },
  { name: 'sidebar-drawer', path: `${W}/inbox`, ready: 'CPL is $14', only: 'phone', act: click('role=button[name="Menu" i]') },
  { name: 'workspace-menu', path: `${W}/inbox`, ready: 'CPL is $14', act: async (page, phone) => {
    if (phone) await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.waitForTimeout(400);
    await page.locator('.buyerly-workspace-btn').first().click();
  } },
  { name: 'command-menu', path: `${W}/inbox`, ready: 'CPL is $14', only: 'desktop', act: press('ControlOrMeta+k') },
  { name: 'shortcuts-help', path: `${W}/inbox`, ready: 'CPL is $14', only: 'desktop', act: press('Shift+?') },
  // Views: lists, board, details pane, menus on them.
  { name: 'campaigns', path: `${W}/ads-manager/campaigns`, ready: 'Alpha campaign' },
  { name: 'campaigns-row-hover', path: `${W}/ads-manager/campaigns`, ready: 'Alpha campaign', only: 'desktop', act: hover('text=Alpha campaign') },
  { name: 'campaigns-row-menu', path: `${W}/ads-manager/campaigns`, ready: 'Alpha campaign', only: 'desktop', act: async (page) => {
    await page.getByText('Alpha campaign').first().click({ button: 'right' });
  } },
  { name: 'campaigns-display-options', path: `${W}/ads-manager/campaigns`, ready: 'Alpha campaign', act: click('[aria-label="Display options"]') },
  { name: 'campaigns-board', path: `${W}/ads-manager/campaigns`, ready: 'Alpha campaign', act: press('ControlOrMeta+b') },
  { name: 'adsets', path: `${W}/ads-manager/adsets`, ready: 'Broad' },
  { name: 'campaign-details', path: `${W}/ads-manager/campaigns/801`, ready: 'Alpha campaign' },
  { name: 'my-campaigns', path: `${W}/my-campaigns`, ready: 'Alpha campaign' },
  { name: 'accounts', path: `${W}/accounts`, ready: 'Main account' },
  { name: 'account', path: `${W}/accounts/act_100`, ready: 'Main account' },
  { name: 'account-activity', path: `${W}/accounts/act_100/activity`, ready: 'Main account' },
  { name: 'rules', path: `${W}/rules`, ready: '$4 and no lead' },
  { name: 'rules-board', path: `${W}/rules`, ready: '$4 and no lead', act: press('ControlOrMeta+b') },
  { name: 'rule', path: `${W}/rules/7`, ready: '$4 and no lead' },
  { name: 'rules-deleted', path: `${W}/rules/recently-deleted` },
  { name: 'search', path: `${W}/search?q=alpha` },
  // Team and member pages.
  { name: 'members', path: `${W}/members`, ready: 'Bob Buyer' },
  { name: 'teams', path: `${W}/teams`, ready: 'Growth' },
  { name: 'team', path: `${W}/team/GRO`, ready: 'Buys traffic' },
  { name: 'team-documents', path: `${W}/team/GRO/documents`, ready: 'Launch plan' },
  { name: 'team-document', path: `${W}/team/GRO/documents/5`, ready: 'Launch plan' },
  { name: 'team-members', path: `${W}/team/GRO/members`, ready: 'Bob Buyer' },
  { name: 'team-rules', path: `${W}/team/GRO/rules`, ready: '$4 and no lead' },
  // Settings.
  ...[
    '', 'workspace', 'teams', 'new-team', 'members', 'security', 'rule-labels', 'account/profile', 'account/notifications',
    'account/notifications/priority-filter', 'account/notifications/desktop', 'account/notifications/email',
    'account/notifications/telegram', 'account/connections', 'account/security',
    'teams/GRO', 'teams/GRO/general', 'teams/GRO/members', 'teams/GRO/accounts',
  ].map((section): Scenario => ({ name: `settings${section ? `-${section.replaceAll('/', '-')}` : ''}`, path: `${W}/settings${section ? `/${section}` : ''}` })),
  // Signed out, sign-in and onboarding.
  { name: 'login', path: '/login', user: 'signed-out', ready: 'Log in to Buyerly' },
  { name: 'login-email', path: '/login', user: 'signed-out', ready: 'Log in to Buyerly', act: async (page) => {
    await page.getByRole('button', { name: 'Continue with email' }).click();
  } },
  { name: 'signup', path: '/signup', user: 'signed-out' },
  { name: 'invite', path: '/invite/invite-token', user: 'signed-out', ready: 'has invited you to', act: async (page) => {
    // The reload splash stays over this page (as of #693, with this mock too): look under it.
    await page.evaluate(() => document.getElementById('loading')?.remove());
  } },
  { name: 'create-workspace', path: '/create-workspace', user: 'new', ready: 'Create a workspace' },
  { name: 'welcome', path: `${W}/welcome`, user: 'onboarding' },
  { name: 'not-found', path: `${W}/no-such-page` },
];
const THEMES = ['light', 'dark'] as const;
const SIZES = {
  desktop: { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
} as const;
type Size = keyof typeof SIZES;

// ---------------------------------------------------------------------------
// Serving each checkout.

const freePort = () => new Promise<number>((done, fail) => {
  const server = createServer();
  server.once('error', fail);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address() as { port: number };
    server.close(() => done(port));
  });
});
const children: ChildProcess[] = [];
const run = (tree: string, argv: string[], wait: (output: string) => boolean): Promise<void> => new Promise((done, fail) => {
  const vite = join(tree, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [vite, ...argv], { cwd: join(tree, 'frontend'), stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  let output = '';
  const read = (chunk: Buffer) => {
    output += chunk.toString();
    if (wait(output)) done();
  };
  child.stdout.on('data', read);
  child.stderr.on('data', read);
  child.once('exit', (code) => (code === 0 ? done() : fail(new Error(`vite ${argv[0] ?? ''} in ${tree} exited ${code}:\n${output.slice(-3000)}`))));
});
async function serve(side: Side): Promise<string> {
  const tree = trees[side];
  const port = await freePort();
  const host = ['--host', '127.0.0.1', '--port', String(port), '--strictPort'];
  if (args.dev) {
    await run(tree, host, (output) => output.includes(`:${port}`));
  } else {
    const dist = join(args.out, `${side}-dist`);
    console.log(`Building ${side} (${tree})…`);
    await run(tree, ['build', '--outDir', dist, '--emptyOutDir', '--logLevel', 'warn'], () => false);
    await run(tree, ['preview', '--outDir', dist, ...host], (output) => output.includes(`:${port}`));
  }
  return `http://127.0.0.1:${port}`;
}

// ---------------------------------------------------------------------------
// Capturing one page and comparing two.

const ORIGIN = 'http://buyerly.test';
type Theme = (typeof THEMES)[number];

async function open(browser: Browser, origin: string, scenario: Scenario, theme: Theme, size: Size) {
  const context = await browser.newContext({
    ...SIZES[size], colorScheme: theme, deviceScaleFactor: 1, serviceWorkers: 'block', locale: 'en-US', timezoneId: 'UTC',
  });
  // Both sides at one address, so a page that shows its own (Settings → Workspace) reads the same.
  await context.route(`${ORIGIN}/**`, async (route: Route) => {
    const response = await route.fetch({ url: route.request().url().replace(ORIGIN, origin) });
    return route.fulfill({ response });
  });
  await context.addCookies([{ name: 'buyerly_csrf', value: 'csrf-test', url: ORIGIN }]);
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(holdStill);
  await mockSync(page);
  const user = scenario.user ?? 'owner';
  await context.route('**/health/live', (route: Route) => route.fulfill({ json: { status: 'alive', version: 'local' } }));
  await context.route('**/api/**', (route: Route) => {
    const request = route.request();
    const { status, json } = answer(user, request.method(), new URL(request.url()));
    return route.fulfill({ status: status ?? 200, json });
  });
  const errors: string[] = [];
  page.on('pageerror', (error: Error) => errors.push(error.message));
  await page.goto(`${ORIGIN}${scenario.path}`);
  if (scenario.ready) {
    const ready = /^[.#[]/.test(scenario.ready) ? page.locator(scenario.ready) : page.getByText(scenario.ready, { exact: false });
    await ready.first().waitFor({ state: 'attached' });
  }
  await page.waitForLoadState('networkidle');
  await settle(page);
  await scenario.act?.(page, size === 'phone');
  await settle(page);
  return { context, page, errors };
}
/**
 * In the page, from its start: no caret, and animations and transitions take 0.01ms. Chrome keeps
 * a layer rasterized at the scale it had while a transform was animating, so a
 * menu that scales in draws its icons a little differently from one load to the
 * next. Taken off again before the computed styles are read (`moveAgain`).
 */
function holdStill() {
  const add = () => {
    const style = document.createElement('style');
    style.id = 'screens-compare-still';
    style.textContent = '*, ::before, ::after { animation-duration: 0.01ms !important; animation-delay: 0s !important;'
      + ' transition-duration: 0.01ms !important; transition-delay: 0s !important; caret-color: transparent !important; }';
    document.documentElement.append(style);
  };
  if (document.documentElement) add();
  else document.addEventListener('readystatechange', add, { once: true });
}
function moveAgain() {
  document.getElementById('screens-compare-still')?.remove();
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

/** A screenshot once two in a row are the same, as Playwright's toHaveScreenshot waits for. */
async function stableScreenshot(page: Page): Promise<Buffer> {
  let shot: Buffer = await page.screenshot({ animations: 'disabled', caret: 'initial' });
  for (let tries = 0; tries < 8; tries += 1) {
    await page.waitForTimeout(150);
    const next: Buffer = await page.screenshot({ animations: 'disabled', caret: 'initial' });
    if (next.equals(shot)) return next;
    shot = next;
  }
  return shot;
}

/** In the page: each element's and pseudo-element's computed style and box, as a hash, by DOM place. */
function dumpStyles() {
  const w = window as unknown as { __styles?: Map<string, string> };
  const styles = new Map<string, string>();
  w.__styles = styles;
  const hash = (text: string) => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return (h >>> 0).toString(36);
  };
  const keys: [string, string][] = [];
  const walk = (element: Element, key: string) => {
    for (const pseudo of ['', '::before', '::after']) {
      const style = getComputedStyle(element, pseudo || null);
      if (pseudo && (style.content === 'none' || style.content === 'normal')) continue;
      const items: string[] = [];
      if (!pseudo) {
        const box = element.getBoundingClientRect();
        items.push(`box:${box.x.toFixed(2)},${box.y.toFixed(2)},${box.width.toFixed(2)},${box.height.toFixed(2)}`);
      }
      for (let i = 0; i < style.length; i += 1) {
        const name = style[i];
        if (name.startsWith('--') && element !== document.documentElement) continue;
        items.push(`${name}:${style.getPropertyValue(name)}`);
      }
      // Sorted: Chrome lists custom properties in the order the stylesheets declare them.
      const text = items.sort().join(';');
      styles.set(key + pseudo, text);
      keys.push([key + pseudo, hash(text)]);
    }
    let index = 0;
    for (const child of element.children) walk(child, `${key}>${child.tagName.toLowerCase()}:${index++}`);
  };
  walk(document.documentElement, 'html');
  return keys;
}
function stylesOf(keys: string[]) {
  const styles = (window as unknown as { __styles: Map<string, string> }).__styles;
  return keys.map((key) => styles.get(key) ?? '');
}

/** In a blank page: how many pixels differ, and a picture of them in red over the head screenshot. */
async function diffPixels([base, head]: string[]) {
  const load = async (data: string) => createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
  const [a, b] = await Promise.all([load(base), load(head)]);
  if (a.width !== b.width || a.height !== b.height) return { count: -1, png: '' };
  const canvas = new OffscreenCanvas(a.width, a.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(a, 0, 0);
  const pa = context.getImageData(0, 0, a.width, a.height).data;
  context.drawImage(b, 0, 0);
  const image = context.getImageData(0, 0, a.width, a.height);
  const pb = image.data;
  let count = 0;
  for (let i = 0; i < pa.length; i += 4) {
    const same = pa[i] === pb[i] && pa[i + 1] === pb[i + 1] && pa[i + 2] === pb[i + 2] && pa[i + 3] === pb[i + 3];
    if (!same) count += 1;
    const gray = (pb[i] + pb[i + 1] + pb[i + 2]) / 3;
    pb[i] = same ? 255 - (255 - gray) * 0.2 : 255;
    pb[i + 1] = same ? 255 - (255 - gray) * 0.2 : 0;
    pb[i + 2] = same ? 255 - (255 - gray) * 0.2 : 0;
    pb[i + 3] = 255;
  }
  if (count === 0) return { count, png: '' };
  context.putImageData(image, 0, 0);
  const bytes = new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { count, png: btoa(binary) };
}

/** The differing properties of two style dumps, as `name: base → head`. */
function changes(base: string, head: string): string[] {
  const parse = (text: string) => new Map(text.split(';').filter(Boolean).map((item) => {
    const at = item.indexOf(':');
    return [item.slice(0, at), item.slice(at + 1)] as [string, string];
  }));
  const a = parse(base);
  const b = parse(head);
  const out: string[] = [];
  for (const name of new Set([...a.keys(), ...b.keys()])) {
    if (a.get(name) !== b.get(name)) out.push(`${name}: ${a.get(name) ?? '(none)'} → ${b.get(name) ?? '(none)'}`);
  }
  return out;
}

interface Result { scenario: string; theme: Theme; size: Size; pixels: number; styles: number; note: string }

async function compare(browser: Browser, blank: Page, origins: Record<Side, string>, scenario: Scenario, theme: Theme, size: Size): Promise<Result> {
  const label = `${scenario.name}-${theme}-${size}`;
  const sides = await Promise.all((['base', 'head'] as const).map((side) => open(browser, origins[side], scenario, theme, size)));
  try {
    const shots = await Promise.all(sides.map(({ page }) => stableScreenshot(page)));
    await Promise.all(sides.map(({ page }) => page.evaluate(moveAgain)));
    const dumps: [string, string][][] = await Promise.all(sides.map(({ page }) => page.evaluate(dumpStyles)));
    const [baseShot, headShot] = shots.map((shot: Buffer) => shot.toString('base64'));
    const pixels = await blank.evaluate(diffPixels, [baseShot, headShot]);
    const lines: string[] = [];
    const [base, head] = dumps;
    let styles = 0;
    if (base.length !== head.length || base.some(([key], i) => key !== head[i][0])) {
      const at = base.findIndex(([key], i) => key !== head[i]?.[0]);
      lines.push(`DOM differs (${base.length} vs ${head.length} boxes), first at ${base[at]?.[0]} / ${head[at]?.[0]}`);
      styles = -1;
    } else {
      const differing = base.flatMap(([key, value], i) => (value === head[i][1] ? [] : [key]));
      styles = differing.length;
      const shown = differing.slice(0, 40);
      const [baseStyles, headStyles] = await Promise.all(sides.map(({ page }) => page.evaluate(stylesOf, shown)));
      shown.forEach((key, i) => lines.push(`${key}\n  ${changes(baseStyles[i], headStyles[i]).join('\n  ')}`));
      if (differing.length > shown.length) lines.push(`… and ${differing.length - shown.length} more`);
    }
    const errors = sides.flatMap(({ errors }, i) => errors.map((error) => `${i ? 'head' : 'base'} page error: ${error}`));
    if (args['save-all']) {
      await mkdir(join(args.out, 'screens'), { recursive: true });
      await writeFile(join(args.out, 'screens', `${label}.png`), shots[1]);
    }
    if (pixels.count !== 0 || styles !== 0 || errors.length > 0) {
      const dir = join(args.out, 'differences');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${label}-base.png`), shots[0]);
      await writeFile(join(dir, `${label}-head.png`), shots[1]);
      if (pixels.png) await writeFile(join(dir, `${label}-diff.png`), Buffer.from(pixels.png, 'base64'));
      await writeFile(join(dir, `${label}.txt`), [...errors, ...lines].join('\n') + '\n');
    }
    return { scenario: scenario.name, theme, size, pixels: pixels.count, styles, note: errors.length ? `${errors.length} page error(s)` : '' };
  } finally {
    await Promise.all(sides.map(({ context }) => context.close()));
  }
}

// ---------------------------------------------------------------------------

const only = args.only ? new RegExp(args.only) : null;
const jobs = SCENARIOS.filter((scenario) => !only || only.test(scenario.name)).flatMap((scenario) => THEMES.flatMap((theme) =>
  (Object.keys(SIZES) as Size[]).filter((size) => !scenario.only || scenario.only === size).map((size) => ({ scenario, theme, size }))));
let browser: Browser | undefined;
let failed: boolean;
try {
  await rm(join(args.out, 'differences'), { recursive: true, force: true });
  await mkdir(args.out, { recursive: true });
  const [base, head] = await Promise.all([serve('base'), serve('head')]);
  const origins = { base, head };
  // Software rendering in one colour profile without LCD text, so the same page draws the same pixels.
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: ['--disable-gpu', '--force-color-profile=srgb', '--disable-lcd-text', '--disable-partial-raster', '--font-render-hinting=none'],
  });
  const runningBrowser = browser;
  const blank = await runningBrowser.newPage();
  console.log(`Comparing ${jobs.length} captures: base ${trees.base} (${base}), head ${trees.head} (${head})`);
  const results: Result[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Number(args.jobs) }, async () => {
    while (next < jobs.length) {
      const { scenario, theme, size } = jobs[next++];
      let result: Result;
      try {
        result = await compare(runningBrowser, blank, origins, scenario, theme, size);
      } catch (error) {
        result = { scenario: scenario.name, theme, size, pixels: NaN, styles: NaN, note: String((error as Error).message).split('\n')[0] };
      }
      results.push(result);
      const bad = result.pixels !== 0 || result.styles !== 0 || result.note;
      console.log(`${bad ? '✗' : '✓'} ${result.scenario} ${theme} ${size}: ${result.pixels} px, ${result.styles} styles ${result.note}`);
    }
  }));
  const order = (result: Result) => jobs.findIndex(({ scenario, theme, size }) => scenario.name === result.scenario && theme === result.theme && size === result.size);
  results.sort((a, b) => order(a) - order(b));
  failed = results.some((result) => result.pixels !== 0 || result.styles !== 0 || result.note);
  const table = [
    '| Screen | Theme | Size | Differing pixels | Differing styles | Note |',
    '| --- | --- | --- | ---: | ---: | --- |',
    ...results.map((r) => `| ${r.scenario} | ${r.theme} | ${SIZES[r.size].viewport.width}×${SIZES[r.size].viewport.height} | ${r.pixels} | ${r.styles} | ${r.note} |`),
  ].join('\n');
  await writeFile(join(args.out, 'report.md'), `${table}\n`);
  console.log(`\n${results.length - results.filter((r) => r.pixels !== 0 || r.styles !== 0 || r.note).length}/${results.length} identical. Report: ${join(args.out, 'report.md')}${failed ? `, differences in ${join(args.out, 'differences')}` : ''}`);
} finally {
  await browser?.close();
  for (const child of children) child.kill();
}
process.exit(failed ? 1 : 0);
