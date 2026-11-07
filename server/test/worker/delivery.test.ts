import { createDecipheriv, createECDH, createHmac, createPublicKey, randomBytes, randomUUID, verify } from 'node:crypto';
import Fastify from 'fastify';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseOver, type Database } from '../../src/database.ts';
import type { EmailMessage } from '../../src/email/send.ts';
import {
  AuditEventEntity,
  DesktopPushSubscriptionEntity,
  TelegramConnectionEntity,
  UserEntity,
  WebSessionEntity,
  WorkspaceEntity,
  WorkspaceMemberEntity,
} from '../../src/entities/index.ts';
import {
  deliverInboxEmails,
  deliverInboxPush,
  deliverInboxTelegram,
} from '../../src/notifications/delivery.ts';
import type { TelegramBot, TelegramSendResult } from '../../src/notifications/telegram.ts';
import { encryptPush, vapidAuthorization, vapidKey, type PushSendResult } from '../../src/notifications/web-push.ts';
import { createUser, createWorkspace, testDatabase, unique } from '../support/db.ts';
import { DATABASE_URL, TEST_VAPID_PRIVATE_KEY } from '../support/target.ts';

// The worker's Inbox deliveries (services/inbox_email.py, inbox_telegram.py,
// inbox_push.py). What goes out was proved byte for byte equal to Python's in
// CI before Python was removed (#611); who gets what, and what is recorded,
// runs on the shared database.

const log = Fastify({ logger: false }).log;

// A browser's subscription keys, as PushManager makes them.
function browserKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { ecdh, p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') };
}

// The browser's side of RFC 8291.
function decryptPush(body: Buffer, receiver: ReturnType<typeof browserKeys>): string {
  const hmac = (key: Buffer, data: Buffer) => createHmac('sha256', key).update(data).digest();
  const salt = body.subarray(0, 16);
  const keyLength = body.readUInt8(20);
  const senderPublic = body.subarray(21, 21 + keyLength);
  const ciphertext = body.subarray(21 + keyLength);
  const shared = receiver.ecdh.computeSecret(senderPublic);
  const receiverPublic = receiver.ecdh.getPublicKey();
  const ikm = hmac(hmac(Buffer.from(receiver.auth, 'base64url'), shared), Buffer.concat([Buffer.from('WebPush: info\0'), receiverPublic, senderPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(-16));
  const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
  expect(plain.at(-1)).toBe(2);
  return plain.subarray(0, -1).toString();
}

describe('what the deliveries send', () => {
  const receiver = browserKeys();
  it('encrypts for the browser and signs for its push service', () => {
    const body = encryptPush(Buffer.from('{"hello":"world"}'), receiver.p256dh, receiver.auth);
    expect(decryptPush(body, receiver)).toBe('{"hello":"world"}');
    const vapid = vapidKey(TEST_VAPID_PRIVATE_KEY)!;
    const header = vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', vapid, 'mailto:team@buyerly.app', new Date(1_800_000_000_000));
    const [, jwt, key] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    const [head, claims, signature] = jwt.split('.');
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_800_043_200, sub: 'mailto:team@buyerly.app' });
    const publicKey = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: Buffer.from(key, 'base64url').subarray(1, 33).toString('base64url'), y: Buffer.from(key, 'base64url').subarray(33).toString('base64url') }, format: 'jwk' });
    expect(verify('sha256', Buffer.from(`${head}.${claims}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))).toBe(true);
  });
});

describe.skipIf(!DATABASE_URL)('Inbox deliveries on the database', { timeout: 60_000 }, () => {
  let dataSource: DataSource;
  let db: Database;

  beforeAll(async () => {
    dataSource = await testDatabase();
    db = databaseOver(dataSource);
  });
  afterAll(async () => {
    await dataSource?.destroy();
  });

  // A workspace whose owner and buyer have unread notifications at a moment
  // of their own, years back: runs at that `now` see no other test's events.
  async function world() {
    const now = new Date(Date.UTC(2021, 0, 1) + Math.floor(Math.random() * 1e6) * 60_000);
    const owner = await createUser(dataSource);
    const workspace = await createWorkspace(dataSource, owner);
    const buyer = await createUser(dataSource);
    const members = dataSource.getRepository(WorkspaceMemberEntity);
    await members.save({ workspaceId: workspace.id, userId: buyer.id, role: 'buyer', joinedAt: now });
    await members.update({ workspaceId: workspace.id }, { inboxReadBefore: new Date(now.getTime() - 86_400_000) });
    const [ownerMember, buyerMember] = await Promise.all([
      members.findOneByOrFail({ workspaceId: workspace.id, userId: owner.id }),
      members.findOneByOrFail({ workspaceId: workspace.id, userId: buyer.id }),
    ]);
    const events = dataSource.getRepository(AuditEventEntity);
    const event = async (minutesAgo: number, values: Partial<AuditEventEntity> = {}) => (await events.save(events.create({
      workspaceId: workspace.id,
      eventType: 'STOP',
      accountId: '',
      accountName: 'Account',
      message: unique('message'),
      createdAt: new Date(now.getTime() - minutesAgo * 60_000),
      ...values,
    }))).id;
    return { now, owner, buyer, workspace, ownerMember, buyerMember, event };
  }

  const deliveries = async (table: string, eventIds: number[]) =>
    dataSource.query<{ user_id: number; audit_event_id: number; sent_at: Date | null }[]>(
      `SELECT user_id, audit_event_id, sent_at FROM ${table} WHERE audit_event_id = ANY($1::int[]) ORDER BY id`,
      [eventIds],
    );

  it('emails unread notifications once they wait five minutes, once, to members who want them', async () => {
    const w = await world();
    const due = await w.event(10);
    const tooFresh = await w.event(2);
    const tooOld = await w.event(40);
    const alert = await w.event(12, { eventType: 'NOTIFY_ONLY' });
    // The buyer reads `due` in the app and turns off rule alerts by email.
    await dataSource.query('INSERT INTO inbox_notification_states (user_id, audit_event_id, is_read, updated_at) VALUES ($1, $2, true, now())', [w.buyer.id, due]);
    await dataSource.getRepository(WorkspaceMemberEntity).update({ id: w.buyerMember.id }, {
      notificationChannels: { email: { enabled: true, priority_only: false, kinds: ['urgent', 'rule_actions'] } } as never,
    });
    const sent: EmailMessage[] = [];
    const sendEmail = async (message: EmailMessage) => { sent.push(message); return true; };
    const count = await deliverInboxEmails({ db, log, webappUrl: 'https://buyerly.test/', now: w.now, sendEmail, pauseMs: 0 });
    const mine = sent.filter((message) => [w.owner.email, w.buyer.email].includes(message.to));
    expect(mine.map((message) => message.to).sort()).toEqual([w.owner.email, w.owner.email].sort());
    expect(count).toBeGreaterThanOrEqual(2);
    // Oldest first: the alert (12 min ago), then the stop (10 min ago).
    expect(mine.map((message) => message.subject)).toEqual(['Rule alert: Account', 'Turned off: Account']);
    expect(mine.some((message) => (message.text ?? "").includes(`https://buyerly.test/${w.workspace.slug}/inbox/${alert}`))).toBe(true);
    const rows = await deliveries('inbox_email_deliveries', [due, tooFresh, tooOld, alert]);
    expect(rows.map((row) => [row.user_id, row.audit_event_id])).toEqual([[w.owner.id, alert], [w.owner.id, due]]);
    expect(rows.every((row) => row.sent_at)).toBe(true);
    // A second run sends nothing again.
    sent.length = 0;
    await deliverInboxEmails({ db, log, webappUrl: 'https://buyerly.test', now: w.now, sendEmail, pauseMs: 0 });
    expect(sent.filter((message) => message.to === w.owner.email)).toEqual([]);
  });

  it('forgets an email the mail service refused and stops the run', async () => {
    const w = await world();
    const first = await w.event(10);
    await w.event(9);
    let tries = 0;
    const count = await deliverInboxEmails({
      db, log, webappUrl: '', now: w.now, pauseMs: 0,
      sendEmail: async (message) => { if (message.to === w.owner.email || message.to === w.buyer.email) tries += 1; return false; },
    });
    expect(count).toBe(0);
    expect(tries).toBeLessThanOrEqual(1);
    expect(await deliveries('inbox_email_deliveries', [first])).toEqual([]);
  });

  it('sends to Telegram right away and stops writing to a chat that blocked the bot', async () => {
    const w = await world();
    const connections = dataSource.getRepository(TelegramConnectionEntity);
    const chatId = String(Math.floor(Math.random() * 1e12));
    await connections.save(connections.create({ memberId: w.ownerMember.id, chatId, username: null, firstName: null, deliveryError: null, deliveryErrorAt: null }));
    await dataSource.getRepository(WorkspaceMemberEntity).update({ id: w.ownerMember.id }, {
      notificationChannels: { telegram: { enabled: true, priority_only: false, kinds: ['rule_actions'] } } as never,
    });
    const first = await w.event(3);
    const second = await w.event(1);
    const messages: { chatId: number; text: string; url?: string }[] = [];
    let answer: TelegramSendResult = { ok: true, error: '' };
    const telegram = {
      configured: true,
      sendMessage: async (chat: number, text: string, button?: { url: string }) => { messages.push({ chatId: chat, text, url: button?.url }); return answer; },
    } as unknown as TelegramBot;
    await deliverInboxTelegram({ db, log, webappUrl: 'https://buyerly.test', now: w.now, telegram, pauseMs: 0 });
    const mine = messages.filter((message) => message.chatId === Number(chatId));
    expect(mine.map((message) => message.url)).toEqual([first, second].map((id) => `https://buyerly.test/${w.workspace.slug}/inbox/${id}`));
    expect(mine[0].text.startsWith('<b>Turned off</b> · Account')).toBe(true);

    const third = await w.event(0.5);
    answer = { ok: false, unreachable: true, error: 'Forbidden: bot was blocked by the user' };
    await deliverInboxTelegram({ db, log, webappUrl: 'https://buyerly.test', now: w.now, telegram, pauseMs: 0 });
    expect(await deliveries('inbox_telegram_deliveries', [third])).toEqual([]);
    const connection = await connections.findOneByOrFail({ memberId: w.ownerMember.id });
    expect(connection.deliveryError).toBe('blocked');
    messages.length = 0;
    await deliverInboxTelegram({ db, log, webappUrl: 'https://buyerly.test', now: w.now, telegram, pauseMs: 0 });
    expect(messages.filter((message) => message.chatId === Number(chatId))).toEqual([]);
  });

  it('follows the Telegram settings and read state, and tries a failed send again', async () => {
    const w = await world();
    const members = dataSource.getRepository(WorkspaceMemberEntity);
    const connections = dataSource.getRepository(TelegramConnectionEntity);
    const chatId = Math.floor(Math.random() * 1e12);
    const sent: string[] = [];
    let answer: TelegramSendResult = { ok: true, error: '' };
    const telegram = {
      configured: true,
      sendMessage: async (chat: number, text: string) => { if (chat === chatId) sent.push(text.split('\n')[1]); return answer; },
    } as unknown as TelegramBot;
    const run = async () => { sent.length = 0; await deliverInboxTelegram({ db, log, webappUrl: 'https://buyerly.test', now: w.now, telegram, pauseMs: 0 }); return [...sent]; };
    const channel = (values: Record<string, unknown>) => members.update({ id: w.ownerMember.id }, { notificationChannels: { telegram: values } });

    // Not connected: nothing, even with the channel on.
    await channel({ enabled: true, priority_only: false, kinds: ['urgent'] });
    await w.event(1, { message: 'for nobody yet' });
    expect(await run()).toEqual([]);

    await connections.save(connections.create({ memberId: w.ownerMember.id, chatId: String(chatId), username: null, firstName: null, deliveryError: null, deliveryErrorAt: null }));
    await w.event(1, { eventType: 'NOTIFY_ONLY', message: 'alert is off' });
    await w.event(1, { eventType: 'TOKEN_EXPIRED', message: 'urgent' });
    const read = await w.event(1, { eventType: 'TOKEN_EXPIRED', message: 'already read' });
    await dataSource.query('INSERT INTO inbox_notification_states (user_id, audit_event_id, is_read, updated_at) VALUES ($1, $2, true, now())', [w.owner.id, read]);
    expect(await run()).toEqual(['urgent']);
    expect(await run()).toEqual([]);

    // A failed send is tried again later; nothing is recorded as sent.
    const retried = await w.event(0.5, { eventType: 'TOKEN_EXPIRED', message: 'retried' });
    answer = { ok: false, error: 'Too Many Requests' };
    expect(await run()).toEqual(['retried']);
    expect(await deliveries('inbox_telegram_deliveries', [retried])).toEqual([]);
    answer = { ok: true, error: '' };
    expect(await run()).toEqual(['retried']);
    expect((await deliveries('inbox_telegram_deliveries', [retried]))[0]?.sent_at).toBeTruthy();

    await channel({ enabled: false });
    await w.event(0.4, { eventType: 'TOKEN_EXPIRED', message: 'channel off' });
    expect(await run()).toEqual([]);
  });

  it('sends desktop notifications to every signed-in browser and forgets the gone ones', async () => {
    const w = await world();
    await dataSource.getRepository(WorkspaceMemberEntity).update({ id: w.ownerMember.id }, {
      notificationChannels: { desktop: { enabled: true, priority_only: false, kinds: ['rule_actions'] } } as never,
    });
    const sessions = dataSource.getRepository(WebSessionEntity);
    const session = async (revoked: boolean) => (await sessions.save(sessions.create({
      id: randomUUID(), userId: w.owner.id, tokenHash: unique('token'), csrfHash: unique('csrf'),
      expiresAt: new Date(Date.now() + 86_400_000), revokedAt: revoked ? new Date() : null,
    }))).id;
    const subscriptions = dataSource.getRepository(DesktopPushSubscriptionEntity);
    const subscribe = async (sessionId: string, endpoint: string) => (await subscriptions.save(subscriptions.create({
      memberId: w.ownerMember.id, webSessionId: sessionId, endpoint, p256dh: 'key', auth: 'auth',
    }))).id;
    const live = await subscribe(await session(false), `https://push.test/${unique('live')}`);
    const gone = await subscribe(await session(false), `https://push.test/${unique('gone')}`);
    const signedOut = await subscribe(await session(true), `https://push.test/${unique('out')}`);
    const due = await w.event(1);
    const posted: { endpoint: string; message: Record<string, unknown> }[] = [];
    const sendPush = async ({ endpoint }: { endpoint: string }, message: Record<string, unknown>): Promise<PushSendResult> => {
      posted.push({ endpoint, message });
      return endpoint.includes('/gone-') ? { ok: false, status: 410, error: 'Gone' } : { ok: true, status: 201, error: null };
    };
    await deliverInboxPush({ db, log, webappUrl: '', now: w.now, sendPush });
    const mine = posted.filter((item) => item.message.id === due);
    expect(mine.map((item) => item.endpoint.split('/')[3].split('-')[0]).sort()).toEqual(['gone', 'live']);
    expect(mine[0].message).toMatchObject({ title: 'Turned off · Account', url: `/${w.workspace.slug}/inbox/${due}`, tag: `inbox-${due}` });
    const left = (await subscriptions.findBy({ memberId: w.ownerMember.id })).map((row) => row.id);
    expect(left).toEqual([live]);
    expect(left).not.toContain(gone);
    expect(left).not.toContain(signedOut);
    const [row] = await deliveries('inbox_push_deliveries', [due]);
    expect(row?.sent_at).toBeTruthy();
  });

  // What one run of the email delivery sends to this world's two members.
  async function emailed(w: Awaited<ReturnType<typeof world>>) {
    const sent: EmailMessage[] = [];
    await deliverInboxEmails({ db, log, webappUrl: 'https://buyerly.test', now: w.now, sendEmail: async (message) => { sent.push(message); return true; }, pauseMs: 0 });
    const by = (user: UserEntity) => sent.filter((message) => message.to === user.email).map((message) => message.text?.split('\n\n')[1] ?? '').sort();
    return { owner: by(w.owner), buyer: by(w.buyer) };
  }
  const setMember = (w: Awaited<ReturnType<typeof world>>, who: 'ownerMember' | 'buyerMember', values: Partial<WorkspaceMemberEntity>) =>
    dataSource.getRepository(WorkspaceMemberEntity).update({ id: w[who].id }, values);
  const state = (userId: number, eventId: number, column: string, value: unknown) =>
    dataSource.query(`INSERT INTO inbox_notification_states (user_id, audit_event_id, ${column}, updated_at) VALUES ($1, $2, $3, now())`, [userId, eventId, value]);

  it('does not email what was read, deleted or snoozed', async () => {
    const w = await world();
    const read = await w.event(10, { message: 'read' });
    const deleted = await w.event(10, { message: 'deleted' });
    const snoozed = await w.event(10, { message: 'snoozed' });
    await state(w.owner.id, read, 'is_read', true);
    await state(w.owner.id, deleted, 'deleted_at', w.now);
    await state(w.owner.id, snoozed, 'snoozed_until', new Date(w.now.getTime() + 86_400_000));
    const mail = await emailed(w);
    expect(mail.owner).toEqual([]);
    // The buyer has not touched them, so all three reach the buyer.
    expect(mail.buyer).toEqual(['deleted', 'read', 'snoozed']);
  });

  it('does not email a member’s own actions, nor events before their read mark', async () => {
    const w = await world();
    await w.event(10, { actorType: 'user', actorId: String(w.owner.id), eventType: 'MANUAL_PAUSE', message: 'mine' });
    await setMember(w, 'buyerMember', { inboxReadBefore: w.now });
    const mail = await emailed(w);
    expect(mail.owner).toEqual([]);
    expect(mail.buyer).toEqual([]);
  });

  it('follows the email switch and the kinds a member picked', async () => {
    const w = await world();
    await w.event(10, { eventType: 'NOTIFY_ONLY', message: 'alert' });
    await w.event(10, { eventType: 'ACCOUNT_HEALTH_ALERT', message: 'urgent' });
    await setMember(w, 'ownerMember', { notificationChannels: { email: { enabled: false, priority_only: false, kinds: ['urgent', 'rule_alerts'] } } as never });
    await setMember(w, 'buyerMember', { notificationChannels: { email: { enabled: true, priority_only: false, kinds: ['urgent'] } } as never });
    expect(await emailed(w)).toEqual({ owner: [], buyer: ['urgent'] });

    const w2 = await world();
    await setMember(w2, 'buyerMember', { notificationChannels: { email: { enabled: true, priority_only: false, kinds: [] } } as never });
    await setMember(w2, 'ownerMember', { notificationChannels: { email: { enabled: false, priority_only: false, kinds: [] } } as never });
    await w2.event(10, { eventType: 'ACCOUNT_HEALTH_ALERT', message: 'urgent again' });
    expect(await emailed(w2)).toEqual({ owner: [], buyer: [] });
  });

  it('delivers only priority notifications while the priority inbox is on', async () => {
    const w = await world();
    await w.event(10, { eventType: 'NOTIFY_ONLY', message: 'alert' });
    await w.event(10, { eventType: 'MANUAL_PAUSE', actorType: 'user', actorId: 'someone', message: 'manual' });
    await w.event(10, { eventType: 'ACCOUNT_HEALTH_RECOVERED', message: 'system' });
    const onlyPriority = { email: { enabled: true, priority_only: true, kinds: ['system'] } } as never;
    // Priority inbox on: rule alerts by type, manual pauses by a custom filter; the email kinds do not apply.
    await setMember(w, 'ownerMember', {
      notificationChannels: onlyPriority,
      inboxDisplay: { priority_inbox: true, priority_kinds: ['rule_alerts'], priority_rules: [[{ field: 'type', operator: 'is', values: ['MANUAL_PAUSE'] }]] } as never,
    });
    // Priority inbox off: "only priority" does not count, the kinds do.
    await setMember(w, 'buyerMember', { notificationChannels: onlyPriority, inboxDisplay: { priority_inbox: false, priority_kinds: ['rule_alerts'] } as never });
    expect(await emailed(w)).toEqual({ owner: ['alert', 'manual'], buyer: ['system'] });
  });

  it('keeps users and workspaces apart', async () => {
    const w = await world();
    expect(w.workspace).toBeInstanceOf(WorkspaceEntity);
    expect(w.owner).toBeInstanceOf(UserEntity);
  });
});
