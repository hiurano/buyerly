// Real App + Zustand, synthetic API only. No production server or ad actions.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-scoped-state';
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5174 } });
const preset = (id, name) => ({
  id, name, action: 'turn_off', level: 'adset', enabled: true,
  conditions: [{ metric: 'spend', operator: 'gt', value: 10, time_window: 'today' }],
  condition_logic: 'and', cooldown_minutes: 0, check_interval_minutes: 5,
  budget_change_percent: 0, budget_max_daily: 0, needs_review: false,
  review_reason: '', last_run_at: '', attached_account_ids: [], attached_scopes: {},
});
const workspaces = ['alpha', 'beta'].map((slug, i) => ({
  id: i + 1, slug, name: slug, role: 'owner', badge_text: slug[0], badge_color: '', logo_url: '', is_active: i === 0,
}));
const user = { username: 'scope-test', full_name: 'Scope Test', first_name: 'Scope', last_name: 'Test',
  email: 'scope@example.test', email_verified: true, avatar_url: '', onboarding_completed: true,
  onboarding_step: 'completed', active_workspace: workspaces[0], workspaces };
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  for (const width of [390, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let delayAlpha = false;
    let failBeta = false;
    let delayedWrite;
    let notifyWrite;
    const writeSeen = new Promise(resolve => { notifyWrite = resolve; });
    const delayed = [];
    const writes = [];
    await page.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const workspace = request.headers()['x-workspace-slug'];
      if (url.pathname === '/api/me') return route.fulfill({ json: user });
      if (request.method() !== 'GET') {
        writes.push({ path: url.pathname, workspace });
        delayedWrite = route;
        notifyWrite();
        return;
      }
      if (url.pathname === '/api/presets') {
        if (workspace === 'alpha' && delayAlpha) { delayed.push(route); return; }
        if (workspace === 'beta' && failBeta) return route.fulfill({ status: 503, json: { detail: 'Beta unavailable' } });
        return route.fulfill({ json: [preset(workspace === 'alpha' ? 1 : 2, `${workspace} rule`)] });
      }
      if (url.pathname === '/api/accounts') return route.fulfill({ json: [
        { account_id: 'A', name: 'Account A', is_active: true, active_rules: [] },
        { account_id: 'B', name: 'Account B', is_active: true, active_rules: [] },
      ] });
      if (url.pathname === '/api/analytics/hierarchy') return route.fulfill({ json: { items: [] } });
      return route.fulfill({ json: [] });
    });
    const navigate = path => page.evaluate(path => {
      history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await page.goto('http://127.0.0.1:5174/alpha/rules');
    await page.evaluate(async () => {
      window.testStore = (await import('/src/store/useAppStore.ts')).useAppStore;
    });
    await page.waitForFunction(() => window.testStore.getState().rulesLoadState === 'ready');
    await page.getByText('alpha rule', { exact: true }).first().waitFor();
    await page.evaluate(() => {
      const s = window.testStore.getState();
      s.setSidebarCollapsed(innerWidth < 768); s.setInterfaceTheme('dark');
      s.setRuleSelection(['1']); s.openEditRuleModal('1');
    });
    await page.getByRole('dialog').waitFor();
    delayAlpha = true;
    const alphaRequest = page.waitForRequest(req => req.url().endsWith('/api/presets'));
    await page.evaluate(() => { void window.testStore.getState().loadRules(); });
    await alphaRequest;
    // Navigation must reset the singleton before beta's children can consume it.
    await navigate('/beta/rules');
    await page.getByText('beta rule', { exact: true }).first().waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.waitForFunction(() => window.testStore.getState().selectedRuleIds.length === 0);
    for (const route of delayed.splice(0)) await route.fulfill({ json: [preset(1, 'late alpha rule')] });
    await page.waitForFunction(() => window.testStore.getState().rulesLoadState === 'ready');
    assert.equal(await page.getByText('late alpha rule', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.testStore.getState().interfaceTheme), 'dark');

    // Complete a mutation after navigation. It must not reload alpha or beta.
    await page.evaluate(() => { void window.testStore.getState().toggleRuleStatus('2'); });
    await writeSeen;
    assert.ok(delayedWrite); assert.equal(writes[0].workspace, 'beta');
    delayAlpha = false;
    await navigate('/alpha/rules');
    await page.getByText('alpha rule', { exact: true }).first().waitFor();
    await page.evaluate(() => window.testStore.getState().openEditRuleModal('1'));
    await delayedWrite.fulfill({ json: preset(2, 'beta rule') });
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.testStore.getState().isCreateRuleModalOpen);

    // An in-flight Undo must not repopulate the new workspace's history/toasts.
    await page.evaluate(async () => {
      const { pushHistory } = await import('/src/lib/undoHistory.ts');
      pushHistory({ label: 'old workspace action', undo: async () => {
        await fetch('/api/test-undo', { method: 'POST' });
        window.undoFinished = true;
      }, redo: async () => { window.staleRedo = true; } });
    });
    const undoRequest = page.waitForRequest(req => req.url().endsWith('/api/test-undo'));
    await page.keyboard.press('Control+z');
    await undoRequest;
    failBeta = true;
    await navigate('/beta/rules');
    await page.getByText('Beta unavailable', { exact: true }).waitFor();
    await delayedWrite.fulfill({ json: {} });
    await page.waitForFunction(() => window.undoFinished);
    await page.keyboard.press('Control+Shift+z');
    assert.equal(await page.evaluate(() => Boolean(window.staleRedo)), false);
    assert.equal(await page.evaluate(async () => {
      const { useToastStore } = await import('/src/ui/toast.ts');
      return useToastStore.getState().toasts.length;
    }), 0);
    assert.equal(await page.getByText('alpha rule', { exact: true }).count(), 0);
    await page.evaluate(() => window.testStore.getState().deleteRule('1').catch(() => {}));
    assert.equal(writes.length, 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`);
    await page.screenshot({ path: `${output}/rules-error-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`App scope navigation, editor reset, stale mutation and error state passed at ${width}px`);
  }
} finally {
  await browser?.close();
  await server.close();
}
