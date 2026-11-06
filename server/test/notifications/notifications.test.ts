import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import {
  AccountEntity,
  AccountNotificationSettingEntity,
  AuditEventEntity,
  DesktopPushSubscriptionEntity,
  TelegramLinkTokenEntity,
  UserEntity,
  WorkspaceMemberEntity,
  type WorkspaceEntity,
} from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase, unique } from '../support/db.ts';
import {
  CONTRACT_TARGET,
  DATABASE_URL,
  TEST_VAPID_PUBLIC_KEY,
  contractTarget,
  typescriptTarget,
  type InProcessTarget,
  type Target,
} from '../support/target.ts';

// Notification settings over GraphQL: channels, the ad account bell,
// desktop notifications and the Telegram connection
// (tests/test_account_notifications.py, tests/test_inbox_push.py,
// tests/test_inbox_telegram.py), against either server. The Python API in
// CI has the same VAPID key and no Telegram bot; a set-up bot runs in-process.

interface GraphQLAnswer {
  data: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { statusCode?: number } }[];
}

const ALL_KINDS = ['urgent', 'rule_alerts', 'rule_actions', 'assistant', 'manual', 'team', 'system'];
const ACCOUNT_KINDS = ['urgent', 'rule_alerts', 'rule_actions', 'assistant', 'manual', 'system'];
// A real P-256 point and 16-byte secret, as a browser's PushSubscription.toJSON() has them.
const KEYS = { p256dh: TEST_VAPID_PUBLIC_KEY, auth: 'AAAAAAAAAAAAAAAAAAAAAA' };

const BELL = 'query($id: String!) { accountNotificationSetting(accountId: $id) }';
const BELL_SET = 'mutation($id: String!, $input: JSON!) { accountNotificationSettingUpdate(accountId: $id, input: $input) { success accountNotificationSetting } }';
const CHANNELS_SET = 'mutation($input: JSON!) { notificationChannelsUpdate(input: $input) { success lastSyncId notificationChannels } }';
const DESKTOP = 'query($endpoint: String) { desktopNotifications(endpoint: $endpoint) }';
const SUBSCRIBE = 'mutation($input: JSON!) { desktopNotificationsSubscribe(input: $input) { success desktopNotifications } }';
const UNSUBSCRIBE = 'mutation($input: JSON!) { desktopNotificationsUnsubscribe(input: $input) { success desktopNotifications } }';

interface Member { browser: Browser; user: UserEntity; workspace: WorkspaceEntity; memberId: number }

function members(target: () => Target, db: () => DataSource) {
  async function signIn(user: UserEntity, workspace: WorkspaceEntity): Promise<Member> {
    const browser = new Browser(target(), { 'x-workspace-slug': workspace.slug });
    expect((await browser.signIn(user.email!)).status).toBe(200);
    const row = await db().getRepository(WorkspaceMemberEntity).findOneByOrFail({ workspaceId: workspace.id, userId: user.id });
    return { browser, user, workspace, memberId: row.id };
  }
  return {
    owner: async (): Promise<Member> => {
      const user = await createUser(db());
      return signIn(user, await createWorkspace(db(), user));
    },
    joined: async (workspace: WorkspaceEntity, role = 'buyer'): Promise<Member> => {
      const user = await createUser(db());
      await db().getRepository(WorkspaceMemberEntity).save({ workspaceId: workspace.id, userId: user.id, role, joinedAt: new Date() });
      await db().getRepository(UserEntity).update({ id: user.id }, { activeWorkspaceId: workspace.id });
      return signIn(user, workspace);
    },
    graphql: async (member: Member, query: string, variables?: Record<string, unknown>): Promise<GraphQLAnswer> => {
      const answer = await member.browser.post('/api/graphql', { query, variables }, member.browser.csrf());
      expect(answer.status).toBe(200);
      return answer.body as GraphQLAnswer;
    },
  };
}

const refusal = (answer: GraphQLAnswer): [number | undefined, string | undefined] =>
  [answer.errors?.[0].extensions?.statusCode, answer.errors?.[0].message];

describe.skipIf(!DATABASE_URL)('notification settings', () => {
  let target: Target;
  let db: DataSource;
  const { owner, joined, graphql } = members(() => target, () => db);

  beforeAll(async () => {
    target = await contractTarget();
    db = await testDatabase();
  });

  afterAll(async () => {
    await target?.close();
    await db?.destroy();
  });

  async function field(member: Member, query: string, variables?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { data, errors } = await graphql(member, query, variables);
    expect(errors).toBeUndefined();
    return Object.values(data!)[0] as Record<string, unknown>;
  }

  async function account(member: Member, leadUserId: number | null): Promise<string> {
    const row = await db.getRepository(AccountEntity).findOneByOrFail({ workspaceId: member.workspace.id });
    await db.getRepository(AccountEntity).update({ id: row.id }, { leadUserId });
    return row.accountId;
  }

  describe('channels', () => {
    it("start with Linear's defaults and keep what the member saves", async () => {
      const me = await owner();
      expect(await field(me, '{ notificationChannels }')).toEqual({
        email: { enabled: true, priority_only: false, kinds: ALL_KINDS },
        telegram: { enabled: false, priority_only: false, kinds: ALL_KINDS },
        desktop: { enabled: false, priority_only: false, kinds: ALL_KINDS },
        invite_accepted: true,
      });
      const saved = await field(me, CHANNELS_SET, {
        input: { email: { enabled: false, kinds: ['team', 'urgent'] }, invite_accepted: 'off', unknown: 1 },
      });
      const expected = {
        email: { enabled: false, priority_only: false, kinds: ['urgent', 'team'] },
        telegram: { enabled: false, priority_only: false, kinds: ALL_KINDS },
        desktop: { enabled: false, priority_only: false, kinds: ALL_KINDS },
        invite_accepted: false,
      };
      expect(saved.success).toBe(true);
      expect(typeof saved.lastSyncId).toBe('number');
      expect(saved.notificationChannels).toEqual(expected);
      expect(await field(me, '{ notificationChannels }')).toEqual(expected);
      const row = await db.getRepository(WorkspaceMemberEntity).findOneByOrFail({ id: me.memberId });
      expect(row.notificationChannels).toEqual(expected);
    });

    it('refuse what is not a channel setting, in pydantic words', async () => {
      const me = await owner();
      expect(refusal(await graphql(me, CHANNELS_SET, { input: { email: { enabled: 'maybe', kinds: ['everything'] } } }))).toEqual([
        422,
        "Input should be a valid boolean, unable to interpret input Input should be 'urgent', 'rule_alerts', 'rule_actions', 'assistant', 'manual', 'team' or 'system'",
      ]);
      expect(refusal(await graphql(me, CHANNELS_SET, { input: { desktop: { kinds: Array(8).fill('team') } } }))).toEqual([
        422, 'List should have at most 7 items after validation, not 8',
      ]);
      expect(refusal(await graphql(me, CHANNELS_SET, { input: [] }))).toEqual([
        422, 'Input should be a valid dictionary or instance of NotificationChannels',
      ]);
    });
  });

  describe('ad account bell', () => {
    it("without a choice shows Inbox's own rule: the lead's, or everyone's while nobody leads", async () => {
      const me = await owner();
      const buyer = await joined(me.workspace);
      const id = await account(me, null);
      expect(await field(buyer, BELL, { id })).toEqual({ account_id: id, kinds: ACCOUNT_KINDS, custom: false });
      await account(me, me.user.id);
      expect(await field(me, BELL, { id })).toEqual({ account_id: id, kinds: ACCOUNT_KINDS, custom: false });
      expect(await field(buyer, BELL, { id })).toEqual({ account_id: id, kinds: [], custom: false });
    });

    it('keeps the kinds a member picks, one row per kind, theirs alone', async () => {
      const me = await owner();
      const buyer = await joined(me.workspace);
      const id = await account(me, me.user.id);
      const saved = await field(buyer, BELL_SET, { id, input: { kinds: ['rule_alerts', 'urgent', 'urgent'] } });
      expect(saved).toEqual({ success: true, accountNotificationSetting: { account_id: id, kinds: ['urgent', 'rule_alerts'], custom: true } });
      expect(await field(me, BELL, { id })).toEqual({ account_id: id, kinds: ACCOUNT_KINDS, custom: false });

      // The lead mutes everything; picking again replaces the earlier choice.
      await field(me, BELL_SET, { id, input: { kinds: [] } });
      expect(await field(me, BELL, { id })).toEqual({ account_id: id, kinds: [], custom: true });
      await field(me, BELL_SET, { id, input: { kinds: ['manual', 'rule_actions'] } });
      expect((await field(me, BELL, { id })).kinds).toEqual(['rule_actions', 'manual']);
      const rows = await db.getRepository(AccountNotificationSettingEntity).findBy({ memberId: me.memberId, accountId: id });
      expect(rows.map((row) => [row.kind, row.enabled]).sort()).toEqual(ACCOUNT_KINDS.map((kind) => [kind, ['manual', 'rule_actions'].includes(kind)]).sort());
    });

    it('decides which events of the account reach Inbox, and goes with the member who leaves', async () => {
      const me = await owner();
      const buyer = await joined(me.workspace);
      const id = await account(me, me.user.id);
      const events = db.getRepository(AuditEventEntity);
      const add = (message: string, eventType: string, values: Partial<AuditEventEntity> = {}) => events.save(events.create({
        workspaceId: me.workspace.id, eventType, message, accountId: id, accountName: 'Nutra US', createdAt: new Date(Date.now() - 60_000), ...values,
      }));
      await add('account issue', 'ACCOUNT_ISSUE');
      await add('rule alert', 'NOTIFY_ONLY');
      await add('rule stop', 'STOP');
      await add('manual pause', 'MANUAL_PAUSE', { category: 'MANUAL_ACTION' });
      // On no account: everyone's, whatever the bell says.
      await add('workspace note', 'SYNC_DONE', { accountId: '' });
      const inbox = async (member: Member): Promise<string[]> => {
        const page = await field(member, 'query { inbox }') as unknown as { items: { message: string }[] };
        return page.items.map((item) => item.message).sort();
      };
      const lead = ['account issue', 'manual pause', 'rule alert', 'rule stop', 'workspace note'];
      expect(await inbox(me)).toEqual(lead);
      expect(await inbox(buyer)).toEqual(['workspace note']);

      // A member who does not lead the account follows the kinds they pick, theirs alone.
      await field(buyer, BELL_SET, { id, input: { kinds: ['urgent', 'rule_alerts'] } });
      expect(await inbox(buyer)).toEqual(['account issue', 'rule alert', 'workspace note']);
      expect(await inbox(me)).toEqual(lead);

      // The lead can mute kinds; events on no account stay.
      await field(me, BELL_SET, { id, input: { kinds: ['urgent'] } });
      expect(await inbox(me)).toEqual(['account issue', 'workspace note']);
      await field(me, BELL_SET, { id, input: { kinds: [] } });
      expect(await inbox(me)).toEqual(['workspace note']);
      await field(me, BELL_SET, { id, input: { kinds: ['manual', 'rule_actions'] } });
      expect(await inbox(me)).toEqual(['manual pause', 'rule stop', 'workspace note']);

      const left = await graphql(buyer, 'mutation($id: Int!) { workspaceLeave(id: $id) { workspace } }', { id: me.workspace.id });
      expect(left.errors).toBeUndefined();
      expect(await db.getRepository(AccountNotificationSettingEntity).countBy({ memberId: buyer.memberId })).toBe(0);
    });

    it('rejects unknown kinds and accounts; the act_ prefix is optional', async () => {
      const me = await owner();
      const id = await account(me, null);
      expect(refusal(await graphql(me, BELL_SET, { id, input: { kinds: ['team'] } }))).toEqual([422, 'Unknown kind of notification.']);
      expect(refusal(await graphql(me, BELL_SET, { id, input: { kinds: 'urgent' } }))).toEqual([422, 'Input should be a valid list']);
      expect(refusal(await graphql(me, BELL_SET, { id, input: {} }))).toEqual([422, 'Field required']);
      expect(refusal(await graphql(me, BELL, { id: 'act_404' }))).toEqual([404, 'Ad account not found']);
      expect(refusal(await graphql(me, BELL_SET, { id: 'act_404', input: { kinds: ['urgent'] } }))).toEqual([404, 'Ad account not found']);
      expect((await field(me, BELL, { id: id.slice(4) })).account_id).toBe(id);
    });

    it("hides another workspace's account", async () => {
      const me = await owner();
      const stranger = await owner();
      expect(refusal(await graphql(stranger, BELL, { id: await account(me, null) }))).toEqual([404, 'Ad account not found']);
    });
  });

  describe('desktop notifications', () => {
    const endpoint = (): string => `https://fcm.googleapis.com/fcm/send/${unique('push')}`;

    it('turning on subscribes this browser and turns the channel on with every kind', async () => {
      const me = await owner();
      await field(me, CHANNELS_SET, { input: { desktop: { enabled: false, kinds: [] } } });
      const address = endpoint();
      expect(await field(me, DESKTOP, { endpoint: address })).toEqual({ available: true, public_key: TEST_VAPID_PUBLIC_KEY, subscribed: false });
      const on = await field(me, SUBSCRIBE, { input: { endpoint: ` ${address} `, keys: KEYS } });
      expect(on).toEqual({ success: true, desktopNotifications: { available: true, public_key: TEST_VAPID_PUBLIC_KEY, subscribed: true } });
      expect(await field(me, DESKTOP, { endpoint: address })).toMatchObject({ subscribed: true });
      expect(await field(me, DESKTOP, {})).toMatchObject({ subscribed: false });
      expect(((await field(me, '{ notificationChannels }')).desktop)).toEqual({ enabled: true, priority_only: false, kinds: ALL_KINDS });
      const rows = await db.getRepository(DesktopPushSubscriptionEntity).findBy({ memberId: me.memberId });
      expect(rows.map((row) => [row.endpoint, row.p256dh, row.auth])).toEqual([[address, KEYS.p256dh, KEYS.auth]]);

      // Subscribing again in another sign-in moves the subscription there.
      const again = new Browser(target, { 'x-workspace-slug': me.workspace.slug });
      expect((await again.signIn(me.user.email!)).status).toBe(200);
      await again.post('/api/graphql', { query: SUBSCRIBE, variables: { input: { endpoint: address, keys: KEYS } } }, again.csrf());
      expect(await field(me, DESKTOP, { endpoint: address })).toMatchObject({ subscribed: false });
      expect(await db.getRepository(DesktopPushSubscriptionEntity).countBy({ memberId: me.memberId })).toBe(1);
    });

    it('refuses what is not a push subscription', async () => {
      const me = await owner();
      const cases: [unknown, string][] = [
        [{ endpoint: 'http://push.example.com/x', keys: KEYS }, 'Not a push service address'],
        [{ endpoint: 'https://127.0.0.1/x', keys: KEYS }, 'Not a push service address'],
        [{ endpoint: 'https://[::1]/x', keys: KEYS }, 'Not a push service address'],
        [{ endpoint: 'https://push.internal/x', keys: KEYS }, 'Not a push service address'],
        [{ endpoint: endpoint(), keys: { p256dh: 'AAAA', auth: KEYS.auth } }, 'Not a P-256 public key'],
        [{ endpoint: endpoint(), keys: { p256dh: KEYS.p256dh, auth: 'AAAA' } }, 'Not an auth secret'],
        [{ endpoint: endpoint(), keys: { p256dh: 'A'.repeat(201), auth: 'A'.repeat(101) } },
          'String should have at most 200 characters String should have at most 100 characters'],
        [{ endpoint: 1 }, 'Input should be a valid string Field required'],
        [{ endpoint: endpoint(), keys: [] }, 'Input should be a valid dictionary or instance of PushKeys'],
      ];
      for (const [input, message] of cases) {
        expect(refusal(await graphql(me, SUBSCRIBE, { input })), JSON.stringify(input)).toEqual([422, message]);
      }
      expect(refusal(await graphql(me, DESKTOP, { endpoint: 'x'.repeat(2049) }))).toEqual([422, 'String should have at most 2048 characters']);
      expect(await db.getRepository(DesktopPushSubscriptionEntity).countBy({ memberId: me.memberId })).toBe(0);
    });

    it('turning off stops this browser only, and the channel once no browser is left', async () => {
      const me = await owner();
      const [first, second] = [endpoint(), endpoint()];
      await field(me, SUBSCRIBE, { input: { endpoint: first, keys: KEYS } });
      await field(me, SUBSCRIBE, { input: { endpoint: second, keys: KEYS } });
      // Another account in this browser shares its push subscription.
      const other = await owner();
      await field(other, SUBSCRIBE, { input: { endpoint: first, keys: KEYS } });

      expect(await field(me, UNSUBSCRIBE, { input: { endpoint: first } })).toEqual({
        success: true,
        desktopNotifications: { available: true, public_key: TEST_VAPID_PUBLIC_KEY, subscribed: false, browser_in_use: true },
      });
      expect(((await field(me, '{ notificationChannels }')).desktop as { enabled: boolean }).enabled).toBe(true);
      expect((await field(me, UNSUBSCRIBE, { input: { endpoint: second } })).desktopNotifications).toMatchObject({ browser_in_use: false });
      expect(((await field(me, '{ notificationChannels }')).desktop as { enabled: boolean }).enabled).toBe(false);
      expect(await field(other, DESKTOP, { endpoint: first })).toMatchObject({ subscribed: true });
      expect(refusal(await graphql(me, UNSUBSCRIBE, { input: { endpoint: 'x'.repeat(2049) } }))).toEqual([422, 'String should have at most 2048 characters']);
    });
  });

  describe('Telegram without a bot', () => {
    it('has nothing to connect, and the webhook is not there', async () => {
      const me = await owner();
      expect(await field(me, '{ telegramConnection }')).toEqual({
        available: false, connected: false, username: null, first_name: null, connected_at: null, error: null,
      });
      expect(refusal(await graphql(me, 'mutation { telegramLinkCreate { success telegram } }'))).toEqual([503, 'Telegram is not set up on this server yet.']);
      expect(await field(me, 'mutation { telegramDisconnect { success telegram } }')).toEqual({
        success: true,
        telegram: { available: false, connected: false, username: null, first_name: null, connected_at: null, error: null },
      });
      const webhook = await new Browser(target).post('/api/telegram/webhook', { update_id: 1 }, { 'x-telegram-bot-api-secret-token': 'anything' });
      expect([webhook.status, webhook.body]).toEqual([404, { detail: 'Not Found' }]);
    });
  });
});

// With a bot: the link is made over GraphQL and completed by the webhook.
// Python needs the real Telegram for this, so it runs in-process only.
describe.skipIf(!DATABASE_URL || CONTRACT_TARGET === 'python')('Telegram connection', () => {
  let target: InProcessTarget;
  let db: DataSource;
  const { owner, joined, graphql } = members(() => target, () => db);

  beforeAll(async () => {
    target = await typescriptTarget({ TELEGRAM_BOT_TOKEN: '"123:test-token"' });
    db = await testDatabase();
  });

  afterAll(async () => {
    await target?.close();
    await db?.destroy();
  });

  async function connection(member: Member): Promise<Record<string, unknown>> {
    const { data, errors } = await graphql(member, '{ telegramConnection }');
    expect(errors).toBeUndefined();
    return data!.telegramConnection as Record<string, unknown>;
  }

  async function linkToken(member: Member): Promise<string> {
    const { data, errors } = await graphql(member, 'mutation { telegramLinkCreate { success telegram } }');
    expect(errors).toBeUndefined();
    const link = (data!.telegramLinkCreate as { telegram: { url: string; expires_at: string } }).telegram;
    const url = new URL(link.url);
    expect(url.host + url.pathname).toBe('t.me/buyerly_test_bot');
    expect(link.expires_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{6})?\+00:00$/);
    return url.searchParams.get('start')!;
  }

  const secret = (): string => target.telegram.webhookSecret();

  async function webhook(update: unknown, headers: Record<string, string> = { 'x-telegram-bot-api-secret-token': secret() }) {
    return new Browser(target).post('/api/telegram/webhook', update, headers);
  }

  const start = (text: string, chatId = 555, username = 'acme_tg', type = 'private') => ({
    update_id: 1,
    message: { message_id: 1, chat: { id: chatId, type }, from: { id: chatId, username, first_name: 'Acme' }, text },
  });

  it('a start with the link connects once and turns the channel on', async () => {
    const me = await owner();
    const buyer = await joined(me.workspace);
    await graphql(me, CHANNELS_SET, { input: { telegram: { enabled: false, kinds: [] } } });
    expect(await connection(me)).toEqual({ available: true, connected: false, username: null, first_name: null, connected_at: null, error: null });

    const token = await linkToken(me);
    const linked = await webhook(start(`/start ${token}`, 555));
    expect([linked.status, linked.body]).toEqual([200, { ok: true }]);
    const body = await connection(me);
    expect([body.connected, body.username, body.first_name, body.error]).toEqual([true, 'acme_tg', 'Acme', null]);
    expect(body.connected_at).toMatch(/\+00:00$/);
    expect(target.telegram.sent.at(-1)).toEqual({
      chatId: 555,
      text: `Telegram is connected to <b>${me.workspace.name}</b> in Buyerly. New notifications from your Inbox will arrive here.`,
    });
    const { data } = await graphql(me, '{ notificationChannels }');
    expect((data!.notificationChannels as { telegram: unknown }).telegram).toEqual({ enabled: true, priority_only: false, kinds: ALL_KINDS });
    expect((await connection(buyer)).connected).toBe(false);

    // The same link a second time: nothing changes, the bot says it expired.
    await webhook(start(`/start ${token}`, 999, 'someone_else'));
    expect((await connection(me)).username).toBe('acme_tg');
    expect(target.telegram.sent.at(-1)?.text).toContain('expired or was already used');
  });

  it('expired and replaced links do not connect', async () => {
    const me = await owner();
    const old = await linkToken(me);
    const newer = await linkToken(me);
    await webhook(start(`/start ${old}`, 556));
    expect((await connection(me)).connected).toBe(false);
    await db.getRepository(TelegramLinkTokenEntity).update({ memberId: me.memberId }, { expiresAt: new Date(Date.now() - 1000) });
    await webhook(start(`/start ${newer}`, 556));
    expect((await connection(me)).connected).toBe(false);
  });

  it('ignores everything but links, and strangers without the secret', async () => {
    const me = await owner();
    const token = await linkToken(me);
    const before = target.telegram.sent.length;
    for (const text of ['hello', '/start', '/help']) expect((await webhook(start(text, 557))).body).toEqual({ ok: true });
    // A link sent from a group is not a personal account.
    await webhook(start(`/start ${token}`, 557, 'acme', 'group'));
    expect((await webhook('not json')).body).toEqual({ ok: true });
    expect((await webhook([1, 2])).body).toEqual({ ok: true });
    expect(target.telegram.sent.length).toBe(before);
    expect((await connection(me)).connected).toBe(false);

    const wrong = await webhook(start(`/start ${token}`, 557), { 'x-telegram-bot-api-secret-token': 'wrong' });
    expect(wrong.status).toBe(404);
    expect((await webhook(start(`/start ${token}`, 557), {})).status).toBe(404);
    expect((await connection(me)).connected).toBe(false);
  });

  it('blocking the bot is shown, and unblocking clears it; disconnect forgets the account', async () => {
    const me = await owner();
    await webhook(start(`/start ${await linkToken(me)}`, 558));
    const member = (status: string) => ({ update_id: 2, my_chat_member: { chat: { id: 558, type: 'private' }, new_chat_member: { status } } });
    await webhook(member('kicked'));
    expect((await connection(me)).error).toBe('blocked');
    await webhook(member('member'));
    expect((await connection(me)).error).toBeNull();

    const { data } = await graphql(me, 'mutation { telegramDisconnect { success telegram } }');
    expect((data!.telegramDisconnect as { telegram: { connected: boolean; available: boolean } }).telegram).toMatchObject({ connected: false, available: true });
    expect((await connection(me)).connected).toBe(false);
  });
});
