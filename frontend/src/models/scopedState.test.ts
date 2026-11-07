// Execute the production stores and API client with controlled, delayed HTTP responses.
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runPendingDeletion, restoreFromTrash } from '@/components/rules/ruleActions';
import { deliveryHistoryEntry } from '@/lib/delivery';
import { commandMenuStore } from '@/models/commandMenuStore';
import { detailsPaneStore } from '@/models/detailsPaneStore';
import { dialogStore } from '@/models/dialogStore';
import { inboxStore } from '@/models/inboxStore';
import { notificationSettingsStore } from '@/models/notificationSettingsStore';
import { rulesStore } from '@/models/rulesStore';
import { scopeStore } from '@/models/scopeStore';
import { selectionStore } from '@/models/selectionStore';
import { shellStore } from '@/models/shellStore';
import { viewStore } from '@/models/viewStore';
import { toastStore } from '@/ui/toast';

type Json = Record<string, unknown>;
interface Pending { url: string; method: string; workspace: string | null; reply: (body: unknown, status?: number) => void }
interface RestRequest { url: string; method: string; alias: string; wrap: (body: unknown, status: number) => { value?: unknown; status?: number; error?: Json } }

// No WebSocket, no sync engine: this checks scoped state over the REST API, which then serves every list.
// The sync engine's client is checked in the browser (scripts/sync-browser.ts).
const location = { pathname: '/a/rules', search: '' };
beforeAll(() => {
  vi.stubGlobal('window', { location, localStorage: { getItem: () => null }, addEventListener: () => {} });
  vi.stubGlobal('document', { cookie: '' });
  vi.stubGlobal('WebSocket', undefined);
  vi.stubGlobal('fetch', fetchAsRest);
});
afterAll(() => {
  vi.unstubAllGlobals();
});

// The client API (/api/graphql, #509) is held as the REST request of its field, as the browser
// checks hold it (scripts/graphql-mock.ts, whose table of fields this reads), and answered as GraphQL.
const graphqlFields = (() => {
  const source = fs.readFileSync(new URL('../../../scripts/graphql-mock.ts', import.meta.url), 'utf8');
  const table = /const FIELDS = String\.raw`([\s\S]*?)`;/.exec(source)![1];
  const qs = (params: Json) => {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      for (const item of Array.isArray(value) ? value : [value]) query.append(name, String(item));
    }
    const text = query.toString();
    return text ? `?${text}` : '';
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the table is the mock's own source text
  return new Function('enc', 'qs', `return ${table};`)(encodeURIComponent, qs) as Record<string, (variables: Json) => [string, string]>;
})();
/** One root field held as its REST request; `wrap` makes the field's GraphQL answer from the REST one. */
function fieldAsRest(kind: string, field: string, selection: string, variables: Json) {
  const [method, restUrl] = graphqlFields[field](variables);
  const wrap = (body: unknown, status: number) => {
    if (status >= 400) {
      const detail = (body as { detail?: unknown } | undefined)?.detail;
      const message = typeof detail === 'string' ? detail : 'Something went wrong';
      return { error: { message, path: [field], extensions: { statusCode: status } } };
    }
    const value = kind === 'query' ? body : Object.fromEntries(selection.split(/\s+/).filter(Boolean)
      .map((name) => [name, name === 'success' ? true : name === 'lastSyncId' ? 0 : body]));
    return { value };
  };
  return { url: restUrl, method, wrap };
}
/** A request as the REST requests it stands for: one, or one per write of a transaction batch (#508). */
function asRest(url: string, init: RequestInit): RestRequest[] {
  if (url !== '/api/graphql') return [{ url, method: init.method!, alias: '', wrap: (body, status) => ({ value: body, status }) }];
  const { query, variables = {} } = JSON.parse(init.body as string) as { query: string; variables?: Json };
  if (/^\s*mutation\s+Transactions\b/.test(query)) {
    return [...query.matchAll(/\b(t\d+):\s*(\w+)\s*(?:\([^)]*\))?\s*\{([^}]*)\}/g)].map(([, alias, field, selection]) => {
      const own = Object.fromEntries(Object.entries(variables)
        .filter(([name]) => name.startsWith(`${alias}_`)).map(([name, value]) => [name.slice(alias.length + 1), value]));
      return { ...fieldAsRest('mutation', field, selection, own), alias };
    });
  }
  const [, kind, field, selection = ''] = /^\s*(query|mutation)\b[^{]*\{\s*(\w+)\s*(?:\([^)]*\))?\s*(?:\{([^}]*)\})?/.exec(query)!;
  return [{ ...fieldAsRest(kind, field, selection, variables), alias: field }];
}
const pending: Pending[] = [];
function fetchAsRest(url: string, init: RequestInit) {
  return new Promise((resolve) => {
    const requests = asRest(url, init);
    const answers = new Array<{ value?: unknown; status?: number; error?: Json }>(requests.length);
    let left = requests.length;
    const finish = () => {
      if (url !== '/api/graphql') {
        const { value, status } = answers[0];
        resolve({ ok: status! < 400, status, json: async () => value });
        return;
      }
      const data: Json = {};
      const errors: Json[] = [];
      requests.forEach((request, index) => {
        data[request.alias] = answers[index].error ? null : answers[index].value;
        if (answers[index].error) errors.push({ ...answers[index].error, path: [request.alias] });
      });
      resolve({ ok: true, status: 200, json: async () => (errors.length > 0 ? { data, errors } : { data }) });
    };
    requests.forEach((request, index) => pending.push({
      url: request.url, method: request.method, workspace: (init.headers as Headers).get('X-Workspace-Slug'),
      reply: (body, status = 200) => {
        answers[index] = request.wrap(body, status);
        if (url !== '/api/graphql') answers[index].status = status;
        if ((left -= 1) === 0) finish();
      },
    }));
  });
}
/** Lets the transaction queue send what was just written: it sends once the code making changes is done. */
const sent = () => new Promise((resolve) => setTimeout(resolve, 0));
// The UI state's MobX stores (#510), read as one: each name is found on the store that has it.
const stores = [scopeStore, shellStore, commandMenuStore, inboxStore, notificationSettingsStore, viewStore, detailsPaneStore, selectionStore, dialogStore, rulesStore] as unknown as Record<PropertyKey, unknown>[];
type AllStores = typeof scopeStore & typeof shellStore & typeof commandMenuStore & typeof inboxStore & typeof notificationSettingsStore
  & typeof viewStore & typeof detailsPaneStore & typeof selectionStore & typeof dialogStore & typeof rulesStore;
const all = new Proxy({}, { get: (_, key) => stores.find((store) => key in store)?.[key] }) as AllStores;
const state = () => all;
function enter(slug: string | null) {
  location.pathname = slug ? `/${slug}/rules` : '/login';
  state().setWorkspaceScope(slug ? `user:${slug}` : null, slug || undefined);
}
function take(url: string, method = 'GET') {
  const index = pending.findIndex((item) => item.url === url && item.method === method);
  expect(index, `${method} ${url} was sent`).not.toBe(-1);
  return pending.splice(index, 1)[0];
}
const preset = (id: number, name = `Rule ${id}`) => ({
  id, name, action: 'turn_off', level: 'adset', enabled: true, conditions: [],
  condition_logic: 'and', cooldown_minutes: 0, check_interval_minutes: 5,
  budget_change_percent: 0, budget_max_daily: 0, currency_mode: 'account',
  needs_review: false, review_reason: '', last_run_at: '', attached_account_ids: [], attached_scopes: {},
});
function rulesReplies() {
  return [take('/api/presets'), take('/api/rule-labels'), take('/api/accounts')];
}
function replyRules(requests: Pending[], presets: unknown, groups: unknown[] = []) {
  requests[0].reply(presets); requests[1].reply(groups); requests[2].reply([]);
}
async function seed(slug = 'a', groups: unknown[] = []) {
  enter(slug);
  const promise = state().loadRules(); replyRules(rulesReplies(), [preset(1), preset(2)], groups); await promise;
}

describe('scoped state', () => {
  it('keeps workspace/account races, failures, ABA logout, stale targets and mutation continuations apart', async () => {
    enter('a');
    state().setInterfaceTheme('dark'); state().setSidebarWidth(300);
    state().setRuleSelection(['1']); state().openEditRuleModal('1'); state().requestDeletion('rule', ['1']);
    const a = state().loadRules(); const ar = rulesReplies();
    enter('b');
    expect(state().selectedRuleIds).toStrictEqual([]); expect(state().editingRuleId).toBe(null);
    expect(state().isCreateRuleModalOpen).toBe(false); expect(state().pendingDeletion).toBe(null);
    expect(state().interfaceTheme).toBe('dark');
    expect(state().sidebarWidth).toBe(300);
    const b = state().loadRules(); replyRules(rulesReplies(), [preset(2, 'B')]); await b;
    replyRules(ar, [preset(1, 'A')]); await a;
    expect(state().rules[0].name).toBe('B');

    // Same workspace refreshes after writes also use latest-request-wins, including errors.
    const old = state().loadRules({ afterWrite: true }); const oldReplies = rulesReplies();
    const fresh = state().loadRules({ afterWrite: true }); replyRules(rulesReplies(), [preset(3)]); await fresh;
    oldReplies[0].reply({ detail: 'old error' }, 500); oldReplies[1].reply([]); oldReplies[2].reply([]); await old;
    expect(state().rulesLoadState).toBe('ready'); expect(state().rules[0].id).toBe('3');

    enter('a'); const late = state().loadRules(); const lateReplies = rulesReplies();
    enter('b'); const failed = state().loadRules(); const failure = rulesReplies();
    failure[0].reply({ detail: 'B unavailable' }, 503); failure[1].reply([]); failure[2].reply([]); await failed;
    replyRules(lateReplies, [preset(1)]); await late;
    expect(state().rules).toStrictEqual([]); expect(state().rulesError).toBe('B unavailable');
    await expect(state().deleteRule('1')).rejects.toThrow(); expect(pending.length).toBe(0);

    // Account A/B race and failed B must never leave A writable.
    const aa = state().loadRuleAttachments(['A']); const aar = take('/api/accounts');
    const ab = state().loadRuleAttachments(['B']); const abr = take('/api/accounts');
    abr.reply([{ account_id: 'B', active_rules: [{ preset_id: 2, scope: { level: 'campaign', ids: ['b'] } }] }]); await ab;
    aar.reply([{ account_id: 'A', active_rules: [{ preset_id: 1 }] }]); await aa;
    expect(state().attachedRulesAccountIds).toStrictEqual(['B']); expect(Object.keys(state().attachedRuleScopes.B)).toStrictEqual(['2']);
    const bad = state().loadRuleAttachments(['C']); take('/api/accounts').reply({ detail: 'C unavailable' }, 500); await bad;
    expect(state().attachedRuleScopes).toStrictEqual({});
    await state().toggleRuleForEntities('C', 'campaign', ['old'], '1'); expect(pending.length).toBe(0);
    await state().toggleRuleForEntities('A', 'campaign', ['old'], '1'); expect(pending.length).toBe(0);

    // Several accounts at once: each keeps its own scopes, the row indexes merge.
    const both = state().loadRuleAttachments(['A', 'B']);
    take('/api/accounts').reply([
      { account_id: 'A', active_rules: [{ preset_id: 1, scope: { level: 'campaign', ids: ['a'] } }] },
      { account_id: 'B', active_rules: [{ preset_id: 2, scope: { level: 'campaign', ids: ['b'] } }] },
    ]); await both;
    expect(Object.keys(state().attachedRuleScopes).sort()).toStrictEqual(['A', 'B']);
    expect(state().campaignAttachedRules).toStrictEqual({ a: ['1'], b: ['2'] });

    // Logout/login to the SAME user/workspace invalidates old requests (ABA).
    enter('a'); const logout = state().loadRules(); const logoutReplies = rulesReplies();
    enter(null); enter('a'); replyRules(logoutReplies, [preset(1)]); await logout;
    expect(state().rules).toStrictEqual([]);
    await seed(); const mutation = state().toggleRuleStatus('1'); await sent(); const write = take('/api/presets/1', 'PUT');
    // eslint-disable-next-line @typescript-eslint/await-thenable -- toggleRuleStatus answers nothing; the await is only a turn of the event loop
    enter('b'); write.reply(preset(1)); await mutation;
    expect(pending.length).toBe(0); expect(state().rules).toStrictEqual([]);

    await seed(); const bulk = state().setRulesEnabled(['1', '2'], false); await sent();
    // Both writes go as one batch of transactions.
    const first = take('/api/presets/1', 'PUT'); const second = take('/api/presets/2', 'PUT');
    enter('b'); first.reply(preset(1)); second.reply(preset(2)); await bulk; expect(pending.length).toBe(0);

    await seed('a', [{ id: 9, name: 'Group', description: '', icon: 'custom', preset_ids: [] }]);
    const create = state().addRule(preset(3) as never); const creating = take('/api/presets', 'POST');
    enter('b'); creating.reply(preset(3)); await create; expect(pending.length).toBe(0);

    // URL changes immediately, before React commits its scope reset.
    await seed(); window.location.pathname = '/b/rules';
    await expect(state().deleteRule('1')).rejects.toThrow(); expect(pending.length).toBe(0);

    enter('a'); const attach = state().loadRuleAttachments(['A']);
    take('/api/accounts').reply([{ account_id: 'A', active_rules: [] }]); await attach;
    const toggle = state().toggleRuleForEntities('A', 'campaign', ['a'], '1');
    const attachmentWrite = pending.shift(); expect(attachmentWrite!.workspace).toBe('a');
    const switched = state().loadRuleAttachments(['B']);
    take('/api/accounts').reply([{ account_id: 'B', active_rules: [] }]); await switched;
    attachmentWrite!.reply({ success: true }); await toggle;
    expect(pending.length).toBe(0); expect(state().attachedRulesAccountIds).toStrictEqual(['B']);

    // A deletion batch must not re-read B's same-numbered ids or reload B.
    await seed(); state().requestDeletion('rule', ['1', '2']);
    const deletion = runPendingDeletion(); const deleting = take('/api/presets/1', 'DELETE');
    await seed('b'); deleting.reply({ deleted_item_id: 11 }); await deletion;
    expect(pending.length).toBe(0);

    // Scope changes during the follow-up read also suppress history/toasts.
    const restoration = restoreFromTrash({ id: 11, kind: 'rule', name: 'Old rule' } as never);
    take('/api/deleted-items/11/restore', 'POST').reply({ entity_id: 1, skipped_account_ids: ['A'], missing_rule_ids: [] });
    await new Promise(resolve => setImmediate(resolve));
    const restoreReads = rulesReplies(); enter('a'); replyRules(restoreReads, [preset(1)]); await restoration;
    expect(toastStore.toasts).toStrictEqual([]);

    // Delivery undo stops its queue after leaving the recorded workspace.
    let paints = 0;
    const entry = deliveryHistoryEntry({ label: 'pause', targets: [{ level: 'campaign', entityId: '1', accountId: 'A' }],
      status: 'PAUSED', auditEventIds: [11, 12], onStatus: () => { paints += 1; } });
    const undo = entry.undo(); const undoWrite = pending.shift(); expect(undoWrite).toBeTruthy();
    enter('b'); undoWrite!.reply({}); await undo;
    expect(pending.length).toBe(0); expect(paints).toBe(0);
    await entry.redo(); expect(pending.length).toBe(0);
  });
});
