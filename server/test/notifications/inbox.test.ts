import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import {
  AuditEventEntity,
  InboxNotificationStateEntity,
  RulePresetEntity,
  UserEntity,
  WorkspaceMemberEntity,
  type WorkspaceEntity,
} from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';

// The member's Inbox over GraphQL (tests/test_inbox.py), against either server.

interface GraphQLAnswer {
  data: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { statusCode?: number } }[];
}

interface Item { id: number; message: string; is_read: boolean; kind: string; event_type: string; snoozed_until: string | null; unsnoozed_at: string | null }
interface Page { items: Item[]; has_more: boolean; unread_count: number; priority_unread_count: number; hidden_by_filters: number }
interface Facet { value: string; count: number; label?: string }

const ALL_KINDS = ['urgent', 'rule_alerts', 'rule_actions', 'assistant', 'manual', 'team', 'system'];
const DEFAULT_DISPLAY = {
  unread_only: false, ordering: 'newest', show_snoozed: false, unread_first: false, grouping: 'none',
  priority_inbox: false, priority_kinds: ALL_KINDS, priority_rules: [], badge_count: 'all',
};

const INBOX = `query($offset: Int, $limit: Int, $ordering: String, $unreadOnly: Boolean, $showSnoozed: Boolean,
  $unreadFirst: Boolean, $tab: String, $priority: String, $filter: String) {
  inbox(offset: $offset, limit: $limit, ordering: $ordering, unreadOnly: $unreadOnly, showSnoozed: $showSnoozed,
    unreadFirst: $unreadFirst, tab: $tab, priority: $priority, filter: $filter) }`;
const FACETS = 'query($unreadOnly: Boolean, $tab: String, $priority: String) { inboxFacets(unreadOnly: $unreadOnly, tab: $tab, priority: $priority) }';
const READ = 'mutation($id: Int!, $input: JSON!) { inboxNotificationRead(id: $id, input: $input) { success lastSyncId inboxNotification } }';
const DELETE = 'mutation($id: Int!) { inboxNotificationDelete(id: $id) { success inboxNotification } }';
const SNOOZE = 'mutation($id: Int!, $input: JSON!) { inboxNotificationSnooze(id: $id, input: $input) { success inboxNotification } }';
const DISPLAY_SET = 'mutation($input: JSON!) { inboxDisplayUpdate(input: $input) { success inboxDisplay } }';

describe.skipIf(!DATABASE_URL)('inbox', () => {
  let target: Target;
  let db: DataSource;

  beforeAll(async () => {
    target = await contractTarget();
    db = await testDatabase();
  });

  afterAll(async () => {
    await target?.close();
    await db?.destroy();
  });

  interface Member { browser: Browser; user: UserEntity; workspace: WorkspaceEntity }
  interface World {
    owner: Member;
    buyer: Member;
    events: Record<'beforeMark' | 'ruleStop' | 'ruleAlert' | 'ownChange' | 'otherWorkspace', number>;
    event: (minutesAgo: number, values?: Partial<AuditEventEntity>) => Promise<number>;
  }

  async function signIn(user: UserEntity, workspace: WorkspaceEntity): Promise<Member> {
    const browser = new Browser(target, { 'x-workspace-slug': workspace.slug });
    expect((await browser.signIn(user.email!)).status).toBe(200);
    return { browser, user, workspace };
  }

  // tests/test_inbox.py setUp: an owner and a buyer whose read mark is two
  // days old, and an outsider's workspace.
  async function world(): Promise<World> {
    const ownerUser = await createUser(db, { fullName: 'Owner' });
    const workspace = await createWorkspace(db, ownerUser);
    const buyerUser = await createUser(db, { fullName: 'Buyer' });
    await db.getRepository(WorkspaceMemberEntity).save({ workspaceId: workspace.id, userId: buyerUser.id, role: 'buyer', joinedAt: new Date() });
    await db.getRepository(UserEntity).update({ id: buyerUser.id }, { activeWorkspaceId: workspace.id });
    const oldMark = new Date(Date.now() - 2 * 86_400_000);
    await db.getRepository(WorkspaceMemberEntity).update({ workspaceId: workspace.id }, { inboxReadBefore: oldMark });
    const outsider = await createUser(db);
    const other = await createWorkspace(db, outsider);

    const events = db.getRepository(AuditEventEntity);
    const event = async (minutesAgo: number, values: Partial<AuditEventEntity> = {}): Promise<number> => (await events.save(events.create({
      workspaceId: workspace.id,
      eventType: 'STOP',
      accountId: 'act_1',
      accountName: 'Account',
      message: '',
      createdAt: new Date(Date.now() - minutesAgo * 60_000),
      ...values,
    }))).id;
    return {
      owner: await signIn(ownerUser, workspace),
      buyer: await signIn(buyerUser, workspace),
      events: {
        beforeMark: await event(60 * 72, { message: 'before mark' }),
        ruleStop: await event(30, { message: 'rule stop' }),
        ruleAlert: await event(20, { eventType: 'NOTIFY_ONLY', message: 'rule alert' }),
        ownChange: await event(10, { actorType: 'user', actorId: String(ownerUser.id), message: 'owner change' }),
        otherWorkspace: await event(5, { workspaceId: other.id, message: 'other workspace' }),
      },
      event,
    };
  }

  async function graphql(member: Member, query: string, variables?: Record<string, unknown>): Promise<GraphQLAnswer> {
    const answer = await member.browser.post('/api/graphql', { query, variables }, member.browser.csrf());
    expect(answer.status).toBe(200);
    return answer.body as GraphQLAnswer;
  }

  async function field<T>(member: Member, query: string, variables?: Record<string, unknown>): Promise<T> {
    const { data, errors } = await graphql(member, query, variables);
    expect(errors).toBeUndefined();
    return Object.values(data!)[0] as T;
  }

  const inbox = (member: Member, variables: Record<string, unknown> = {}): Promise<Page> => field<Page>(member, INBOX, variables);
  const readMap = (page: Page): Record<string, boolean> => Object.fromEntries(page.items.map((item) => [item.message, item.is_read]));
  const messages = (page: Page): string[] => page.items.map((item) => item.message);
  const refusal = (answer: GraphQLAnswer): [number | undefined, string | undefined] =>
    [answer.errors?.[0].extensions?.statusCode, answer.errors?.[0].message];
  const read = (member: Member, id: number, value: boolean) =>
    field<{ inboxNotification: Record<string, unknown> }>(member, READ, { id, input: { read: value } });
  const snooze = (member: Member, id: number, until: Date | null) => graphql(member, SNOOZE, { id, input: { until: until?.toISOString() ?? null } });

  it("new events are unread, except old ones and the member's own", async () => {
    const { owner, buyer } = await world();
    const page = await inbox(owner);
    expect(readMap(page)).toEqual({ 'owner change': true, 'rule alert': false, 'rule stop': false, 'before mark': true });
    expect(messages(page)).toEqual(['owner change', 'rule alert', 'rule stop', 'before mark']);
    expect([page.unread_count, page.priority_unread_count, page.has_more, page.hidden_by_filters]).toEqual([2, 2, false, 0]);
    expect((await inbox(buyer)).unread_count).toBe(3);
    expect(await field(owner, '{ inboxUnreadCount }')).toEqual({ unread_count: 2, priority_unread_count: 2 });
  });

  it('read state is per member, and the first touch pins it', async () => {
    const { owner, buyer, events } = await world();
    const answer = await field<{ success: boolean; lastSyncId: number; inboxNotification: unknown }>(owner, READ, { id: events.ruleStop, input: { read: true } });
    expect(answer.inboxNotification).toEqual({ success: true, unread_count: 1, priority_unread_count: 1 });
    expect((await inbox(buyer)).unread_count).toBe(3);
    await read(owner, events.beforeMark, false);
    expect(messages(await inbox(owner, { unreadOnly: true }))).toEqual(['rule alert', 'before mark']);
    const state = await db.getRepository(InboxNotificationStateEntity).findOneByOrFail({ userId: owner.user.id, auditEventId: events.ruleStop });
    expect(state.isRead).toBe(true);
    expect(refusal(await graphql(owner, READ, { id: events.ruleStop, input: {} }))).toEqual([422, 'Field required']);
    expect(refusal(await graphql(owner, READ, { id: events.ruleStop, input: { read: 'maybe' } }))).toEqual([422, 'Input should be a valid boolean, unable to interpret input']);
  });

  it('delete hides a notification for that member only', async () => {
    const { owner, buyer, events } = await world();
    expect((await field<{ inboxNotification: { unread_count: number } }>(owner, DELETE, { id: events.ruleAlert })).inboxNotification.unread_count).toBe(1);
    expect(readMap(await inbox(owner))).not.toHaveProperty('rule alert');
    expect(readMap(await inbox(buyer))).toHaveProperty('rule alert');
  });

  it('snooze hides until the time and keeps the read state; unsnooze puts it back', async () => {
    const { owner, events } = await world();
    await read(owner, events.ruleStop, true);
    expect((await snooze(owner, events.ruleStop, new Date(Date.now() + 3_600_000))).errors).toBeUndefined();
    expect(readMap(await inbox(owner))).not.toHaveProperty('rule stop');
    const snoozed = await inbox(owner, { showSnoozed: true });
    const item = snoozed.items.find((entry) => entry.message === 'rule stop')!;
    expect(item.is_read).toBe(true);
    expect(item.snoozed_until).toMatch(/Z$/);
    expect(item.unsnoozed_at).toBeNull();
    expect(snoozed.unread_count).toBe(1);
    expect(refusal(await snooze(owner, events.ruleStop, new Date(Date.now() - 60_000)))).toEqual([400, 'Pick a time in the future.']);
    expect(refusal(await graphql(owner, SNOOZE, { id: events.ruleStop, input: { until: 'tomorrow at noon' } }))).toEqual([422, 'Input should be a valid datetime or date, invalid character in year']);

    expect((await snooze(owner, events.ruleStop, null)).errors).toBeUndefined();
    const page = await inbox(owner);
    expect(messages(page)).toEqual(['owner change', 'rule alert', 'rule stop', 'before mark']);
    expect(page.items[2]).toMatchObject({ is_read: true, snoozed_until: null, unsnoozed_at: null });
  });

  it('a snooze that ran out comes back on top and unread', async () => {
    const { owner, events } = await world();
    await read(owner, events.ruleStop, true);
    await snooze(owner, events.ruleStop, new Date(Date.now() + 3_600_000));
    const ended = new Date(Date.now() - 2 * 60_000);
    await db.getRepository(InboxNotificationStateEntity).update(
      { auditEventId: events.ruleStop },
      { snoozedUntil: ended, updatedAt: new Date(ended.getTime() - 3_600_000) },
    );
    let page = await inbox(owner);
    expect(messages(page)).toEqual(['rule stop', 'owner change', 'rule alert', 'before mark']);
    expect(page.items[0]).toMatchObject({ is_read: false, snoozed_until: null });
    expect(page.items[0].unsnoozed_at).toMatch(/Z$/);
    expect(page.unread_count).toBe(2);
    expect(messages(await inbox(owner, { ordering: 'oldest' })).at(-1)).toBe('rule stop');

    // "Delete all read" goes by what the member sees: it is unread now.
    await field(owner, 'mutation { inboxDeleteAllRead { success inboxNotification } }');
    expect(readMap(await inbox(owner))).toHaveProperty('rule stop');
    // Reading it ends "Unsnoozed …" though it was stored as read already.
    expect((await read(owner, events.ruleStop, true)).inboxNotification.unread_count).toBe(1);
    page = await inbox(owner);
    expect(page.items[0]).toMatchObject({ message: 'rule stop', is_read: true, unsnoozed_at: null });
  });

  it('delete all read keeps the unread ones', async () => {
    const { owner, events } = await world();
    await read(owner, events.ruleStop, true);
    await read(owner, events.beforeMark, false);
    await field(owner, 'mutation { inboxDeleteAllRead { success inboxNotification } }');
    expect(readMap(await inbox(owner))).toEqual({ 'rule alert': false, 'before mark': false });
    // Reading one afterwards must not make it vanish with the old read ones.
    await read(owner, events.beforeMark, true);
    expect(readMap(await inbox(owner))).toHaveProperty('before mark');
  });

  it('delete all empties the Inbox, but new events arrive unread', async () => {
    const { owner, event } = await world();
    const answer = await field<{ success: boolean; inboxNotification: unknown }>(owner, 'mutation { inboxDeleteAll { success inboxNotification } }');
    expect(answer.inboxNotification).toEqual({ success: true, unread_count: 0, priority_unread_count: 0 });
    expect((await inbox(owner)).items).toEqual([]);
    await event(-1 / 60, { message: 'after clear' });
    expect(readMap(await inbox(owner))).toEqual({ 'after clear': false });
  });

  it('orders, puts unread first and pages', async () => {
    const { owner, events } = await world();
    await read(owner, events.ruleAlert, true);
    expect(messages(await inbox(owner, { ordering: 'oldest' }))[0]).toBe('before mark');
    expect(messages(await inbox(owner, { unreadFirst: true }))[0]).toBe('rule stop');
    const first = await inbox(owner, { limit: 2 });
    const rest = await inbox(owner, { limit: 2, offset: 2 });
    expect([first.has_more, rest.has_more, first.items.length + rest.items.length]).toEqual([true, false, 4]);
    expect(refusal(await graphql(owner, INBOX, { limit: 0 }))).toEqual([422, 'Input should be greater than or equal to 1']);
    expect(refusal(await graphql(owner, INBOX, { limit: 101 }))).toEqual([422, 'Input should be less than or equal to 100']);
    expect(refusal(await graphql(owner, INBOX, { offset: -1 }))).toEqual([422, 'Input should be greater than or equal to 0']);
    expect(refusal(await graphql(owner, INBOX, { ordering: 'sideways' }))).toEqual([422, "String should match pattern '^(newest|oldest)$'"]);
    expect(refusal(await graphql(owner, INBOX, { tab: 'all' }))).toEqual([422, "String should match pattern '^(priority|other)$'"]);
  });

  it('filters by type and from, and reports how many the filters hide', async () => {
    const { owner, event } = await world();
    const filter = (clauses: unknown) => ({ filter: JSON.stringify(clauses) });
    let page = await inbox(owner, filter([{ field: 'type', operator: 'is', values: ['NOTIFY_ONLY'] }]));
    expect([messages(page), page.hidden_by_filters]).toEqual([['rule alert'], 3]);
    const notOwner = filter([{ field: 'from', operator: 'is_not', values: [`user:${owner.user.id}`] }]);
    page = await inbox(owner, notOwner);
    expect([readMap(page)['owner change'], page.hidden_by_filters]).toEqual([undefined, 1]);
    expect(refusal(await graphql(owner, INBOX, filter([{ field: 'message', operator: 'is', values: ['x'] }])))).toEqual([400, 'Unsupported filter clause.']);
    expect(refusal(await graphql(owner, INBOX, { filter: '{' }))).toEqual([400, 'Filter is not valid JSON.']);
    expect(refusal(await graphql(owner, INBOX, filter({})))).toEqual([400, 'Filter must be a list of clauses.']);

    // A person matches whichever id an action recorded them by.
    await db.getRepository(UserEntity).update({ id: owner.user.id }, { telegramId: String(7_300_000_000 + owner.user.id) });
    await event(1, { eventType: 'INVITE_SEND', message: 'invite by telegram id', actorType: 'user', actorId: String(7_300_000_000 + owner.user.id) });
    page = await inbox(owner, filter([{ field: 'from', operator: 'is', values: [`user:${7_300_000_000 + owner.user.id}`] }]));
    expect(messages(page).sort()).toEqual(['invite by telegram id', 'owner change']);
    const facets = await field<{ from: Facet[] }>(owner, FACETS);
    expect(facets.from).toEqual([
      { value: 'buyerly', label: 'Buyerly', count: 3 },
      { value: `user:${7_300_000_000 + owner.user.id}`, label: 'Owner', count: 2 },
    ]);
  });

  it('facets count values over what the list shows and name the senders', async () => {
    const { owner, event } = await world();
    await event(1, { eventType: 'MANUAL_PAUSE', message: 'no author', actorType: 'user', actorId: 'None' });
    const facets = await field<Record<string, Facet[]>>(owner, FACETS);
    expect(facets.type).toEqual([{ value: 'STOP', count: 3 }, { value: 'MANUAL_PAUSE', count: 1 }, { value: 'NOTIFY_ONLY', count: 1 }]);
    // An author nobody can be named for is left out.
    expect(facets.from).toEqual([{ value: 'buyerly', label: 'Buyerly', count: 3 }, { value: `user:${owner.user.id}`, label: 'Owner', count: 1 }]);
    expect(facets.account).toEqual([{ value: 'act_1', label: 'Account', count: 5 }]);
    expect(facets.status).toEqual([{ value: 'SUCCESS', count: 5 }]);
    const unread = await field<Record<string, Facet[]>>(owner, FACETS, { unreadOnly: true });
    expect(unread.type.reduce((sum, entry) => sum + entry.count, 0)).toBe(3);
  });

  it('senders list everyone in the workspace', async () => {
    const { owner, buyer } = await world();
    const presets = db.getRepository(RulePresetEntity);
    await presets.save(presets.create({ workspaceId: owner.workspace.id, ownerUserId: owner.user.id, name: 'Stop without leads' }));
    const senders = await field<Record<string, unknown>[]>(owner, '{ inboxSenders }');
    expect(senders).toEqual([
      { value: `user:${buyer.user.id}`, label: 'Buyer', kind: 'user', avatar_url: '' },
      { value: `user:${owner.user.id}`, label: 'Owner', kind: 'user', avatar_url: '' },
      { value: expect.stringMatching(/^rule:\d+$/) as unknown, label: 'Stop without leads', kind: 'rule' },
      { value: 'buyerly', label: 'Buyerly', kind: 'buyerly' },
    ]);
  });

  it("cannot touch another workspace's event", async () => {
    const { owner, events } = await world();
    const id = events.otherWorkspace;
    expect(refusal(await graphql(owner, READ, { id, input: { read: true } }))).toEqual([404, 'Notification not found.']);
    expect(refusal(await graphql(owner, DELETE, { id }))).toEqual([404, 'Notification not found.']);
    expect(refusal(await snooze(owner, id, null))).toEqual([404, 'Notification not found.']);
    expect(readMap(await inbox(owner))).not.toHaveProperty('other workspace');
  });

  it('display options are saved per member, in order, with defaults for anything unreadable', async () => {
    const { owner, buyer } = await world();
    expect(await field(owner, '{ inboxDisplay }')).toEqual(DEFAULT_DISPLAY);
    const chosen = {
      unread_only: true, ordering: 'oldest', show_snoozed: true, unread_first: true,
      grouping: 'focus', priority_inbox: true, priority_kinds: ['team', 'urgent', 'team'], badge_count: 'priority',
    };
    const saved = await field<{ success: boolean; inboxDisplay: unknown }>(owner, DISPLAY_SET, { input: chosen });
    const expected = { ...chosen, priority_kinds: ['urgent', 'team'], priority_rules: [] };
    expect(saved).toEqual({ success: true, inboxDisplay: expected });
    expect(await field(owner, '{ inboxDisplay }')).toEqual(expected);
    expect(await field(buyer, '{ inboxDisplay }')).toEqual(DEFAULT_DISPLAY);
    expect(refusal(await graphql(owner, DISPLAY_SET, { input: { ...chosen, ordering: 'priority' } }))).toEqual([422, "Input should be 'newest' or 'oldest'"]);

    // Options saved before #240 keep working; unreadable ones fall back to the defaults.
    await db.getRepository(WorkspaceMemberEntity).update({ workspaceId: owner.workspace.id, userId: owner.user.id }, {
      inboxDisplay: { unread_only: true, ordering: 'oldest', show_snoozed: false, unread_first: false } as never,
    });
    expect(await field(owner, '{ inboxDisplay }')).toEqual({ ...DEFAULT_DISPLAY, unread_only: true, ordering: 'oldest' });
    await db.getRepository(WorkspaceMemberEntity).update({ workspaceId: owner.workspace.id, userId: owner.user.id }, {
      inboxDisplay: { ordering: 'sideways' } as never,
    });
    expect(await field(owner, '{ inboxDisplay }')).toEqual(DEFAULT_DISPLAY);
  });

  it('notifications carry their kind; the priority inbox splits them into tabs', async () => {
    const { owner, buyer, event } = await world();
    const add = (eventType: string, values: Partial<AuditEventEntity> = {}) => event(1, { eventType, message: eventType, ...values });
    await add('TOKEN_EXPIRED');
    await add('STOP', { status: 'ERROR', message: 'failed stop' });
    await add('ASSISTANT_CREATE_RULE', { actorType: 'user', actorId: String(buyer.user.id) });
    await add('INVITE_SEND', { category: 'WORKSPACE_INVITE', actorType: 'user', actorId: String(buyer.user.id) });
    await add('ACCOUNT_HEALTH_RECOVERED');
    // Bookkeeping, not a notification (#325).
    await add('ACCOUNT_DAY_STARTED');

    const page = await inbox(owner);
    const kinds = Object.fromEntries(page.items.map((item) => [item.message, item.kind]));
    expect(kinds).toEqual({
      TOKEN_EXPIRED: 'urgent', 'failed stop': 'urgent', 'rule alert': 'rule_alerts', 'rule stop': 'rule_actions',
      ASSISTANT_CREATE_RULE: 'assistant', 'owner change': 'manual', INVITE_SEND: 'team',
      ACCOUNT_HEALTH_RECOVERED: 'system', 'before mark': 'rule_actions',
    });
    expect([page.unread_count, page.priority_unread_count]).toEqual([7, 7]);

    const chosen = JSON.stringify({ kinds: ['urgent', 'rule_alerts'] });
    const priority = await inbox(owner, { tab: 'priority', priority: chosen });
    expect(new Set(priority.items.map((item) => item.kind))).toEqual(new Set(['urgent', 'rule_alerts']));
    expect(priority.priority_unread_count).toBe(3);
    const other = await inbox(owner, { tab: 'other', priority: chosen });
    expect(priority.items.length + other.items.length).toBe(page.items.length);
    expect((await inbox(owner, { tab: 'priority', priority: JSON.stringify({ kinds: [] }) })).items).toEqual([]);
    const facets = await field<{ type: Facet[] }>(owner, FACETS, { tab: 'priority', priority: JSON.stringify({ kinds: ['team'] }) });
    expect(facets.type.map((entry) => entry.value)).toEqual(['INVITE_SEND']);
    for (const bad of [JSON.stringify({ kinds: ['mentions'] }), '{', JSON.stringify({ rules: [] }), '']) {
      expect(refusal(await graphql(owner, INBOX, { tab: 'priority', priority: bad })), bad).toEqual([400, 'Unsupported priority inbox.']);
    }
  });

  it('custom filters add to the priority inbox', async () => {
    const { owner, buyer, events } = await world();
    const rule = [
      { field: 'type', operator: 'is', values: ['STOP'] },
      { field: 'from', operator: 'is', values: ['buyerly'] },
    ];
    const display = { ...DEFAULT_DISPLAY, priority_inbox: true, priority_kinds: ['rule_alerts'], priority_rules: [rule] };
    expect((await field<{ inboxDisplay: { priority_rules: unknown } }>(owner, DISPLAY_SET, { input: display })).inboxDisplay.priority_rules).toEqual([rule]);

    // Without "priority" the saved priority inbox applies.
    const priority = await inbox(owner, { tab: 'priority' });
    expect(readMap(priority)).toEqual({ 'rule alert': false, 'rule stop': false, 'before mark': true });
    expect(priority.priority_unread_count).toBe(2);
    expect(readMap(await inbox(owner, { tab: 'other' }))).toEqual({ 'owner change': true });
    // Every condition of a custom filter has to match.
    const onlyOwner = [rule[0], { field: 'from', operator: 'is', values: [`user:${owner.user.id}`] }];
    expect(readMap(await inbox(owner, { tab: 'priority', priority: JSON.stringify({ kinds: [], rules: [onlyOwner] }) }))).toEqual({ 'owner change': true });
    // Mark read and the badge use the saved priority inbox too.
    expect((await read(owner, events.ruleStop, true)).inboxNotification.priority_unread_count).toBe(1);
    expect((await inbox(buyer, { tab: 'priority' })).priority_unread_count).toBe(3);

    const cases: [unknown, string][] = [
      [[[]], 'A custom filter needs one condition per property.'],
      [[[rule[0], rule[0]]], 'A custom filter needs one condition per property.'],
      [[[{ field: 'account', operator: 'is', values: ['act_1'] }]], "Input should be 'type' or 'from'"],
      [[[{ field: 'type', operator: 'is', values: [] }]], 'List should have at least 1 item after validation, not 0'],
    ];
    for (const [bad, message] of cases) {
      expect(refusal(await graphql(owner, DISPLAY_SET, { input: { ...display, priority_rules: bad } })), JSON.stringify(bad)).toEqual([422, message]);
      expect(refusal(await graphql(owner, INBOX, { tab: 'priority', priority: JSON.stringify({ kinds: [], rules: bad }) }))).toEqual([400, 'Unsupported priority inbox.']);
    }
  });
});
