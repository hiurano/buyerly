import { SYNC_CLOSE, type SyncActionMessage, type SyncDelta } from '@buyerly/shared';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RuleGroupEntity,
  RulePresetEntity,
  TeamEntity,
  TeamMemberEntity,
  WebSessionEntity,
  WorkspaceMemberEntity,
} from '../../src/entities/index.ts';
import { Redis } from 'ioredis';
import { publishSyncBus } from '../../src/sync/bus.ts';
import type { SyncTuning } from '../../src/sync/hub.ts';
import { Browser } from '../support/browser.ts';
import { HandshakeRefused, SocketClosed, openSocket, type TestSocket } from '../support/socket.ts';
import { save, syncWorld, type SyncWorld, type Who } from '../support/sync-world.ts';
import { typescriptTarget, type Target } from '../support/target.ts';
import { logMax } from './bootstrap.cases.ts';
import { rename, withCompactedLog } from './delta.cases.ts';
import type { SyncContext } from './sync.test.ts';

// WS /api/sync/ws (tests/test_sync_stream.py): catch-up, live delivery, sync
// groups, sign-in and reconnects. Cases that shorten the batch, poll or
// heartbeat are shortened in-process.

export function streamCases(context: SyncContext): void {
  // Sockets wait on the database and on each other: more than Vitest's default 5 s per case.
  describe('stream', { timeout: 30_000 }, () => {
    const sockets: TestSocket[] = [];
    const targets: Target[] = [];

    afterEach(async () => {
      await Promise.all(sockets.splice(0).map((socket) => socket.close()));
      await Promise.all(targets.splice(0).map((target) => target.close()));
    });

    // This server with the stream's timings changed.
    async function tuned(tuning: Partial<SyncTuning>, env: Record<string, string> = {}): Promise<Target> {
      const target = await typescriptTarget(env, { sync: tuning });
      targets.push(target);
      return target;
    }

    async function open(world: SyncWorld, who: Who, options: { since?: number; target?: Target; query?: Record<string, string | number>; headers?: Record<string, string> } = {}) {
      const since = options.since ?? (await logMax(world));
      const target = options.target ?? context.target;
      const browser = await world.browser(who);
      const workspace = (who === 'stranger' ? world.other : world.ws).slug;
      const socket = await openSocket(target, browser, { since, workspace, ...options.query }, options.headers);
      sockets.push(socket);
      return socket;
    }

    // Actions of delta messages until `done(actions)` holds.
    async function deltasUntil(socket: TestSocket, done: (actions: SyncActionMessage[]) => boolean, timeoutMs = 5000) {
      const actions: SyncActionMessage[] = [];
      const deadline = Date.now() + timeoutMs;
      while (!done(actions)) {
        const message = await socket.receive(Math.max(1, deadline - Date.now()));
        if (message.type === 'delta') actions.push(...message.actions);
      }
      return actions;
    }

    const names = (actions: SyncActionMessage[]) => actions.filter((action) => action.model === 'Team').map((action) => action.data.name);

    // Catch-up

    it('catches up with every missed change in order, then says caught_up', async () => {
      const world = await syncWorld(context.db, context.target);
      const since = await logMax(world);
      await rename(world, world.teams.public, 'Media buying');
      await rename(world, world.teams.private, 'Hidden');
      await rename(world, world.teams.public, 'Media 2');
      const socket = await open(world, 'buyer', { since });

      const delta = await socket.receiveType('delta');
      // The private team is not the buyer's.
      expect(delta.actions.map((action) => [action.model, action.model_id, action.data.name])).toEqual([
        ['Team', String(world.teams.public.id), 'Media buying'],
        ['Team', String(world.teams.public.id), 'Media 2'],
      ]);
      const ids = delta.actions.map((action) => action.sync_id);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
      expect(ids[0]).toBeGreaterThan(since);
      expect(delta.last_sync_id).toBe(ids[1]);
      expect(await socket.receiveType('caught_up')).toEqual({ type: 'caught_up', last_sync_id: ids[1] });
    });

    it('pages its catch-up through more than one batch', async () => {
      const target = await tuned({ batch: 3 });
      const world = await syncWorld(context.db, target);
      const since = await logMax(world);
      for (let n = 0; n < 7; n += 1) await rename(world, world.teams.public, `Media ${n}`);
      const socket = await open(world, 'buyer', { since, target });
      const actions = await deltasUntil(socket, (found) => found.length >= 7);
      expect(names(actions)).toEqual([0, 1, 2, 3, 4, 5, 6].map((n) => `Media ${n}`));
      await socket.receiveType('caught_up');
    });

    it('gives a current client caught_up alone', async () => {
      const world = await syncWorld(context.db, context.target);
      const since = await logMax(world);
      const socket = await open(world, 'buyer', { since });
      // Other test files' writes are not the buyer's: nothing to send but caught_up.
      expect(await socket.receive()).toEqual({ type: 'caught_up', last_sync_id: since });
    });

    it('asks a client older than the log to bootstrap', async () => {
      const world = await syncWorld(context.db, context.target);
      await world.browser('buyer');
      await withCompactedLog(context.db, async () => {
        const socket = await open(world, 'buyer', { since: 0 });
        expect(await socket.closedWith()).toMatchObject({ code: SYNC_CLOSE.bootstrap, reason: 'bootstrap' });
      });
    });

    it('tells a socket without since to bootstrap', async () => {
      const world = await syncWorld(context.db, context.target);
      const socket = await openSocket(context.target, await world.browser('buyer'), { workspace: world.ws.slug });
      sockets.push(socket);
      expect(await socket.closedWith()).toMatchObject({ code: SYNC_CLOSE.bootstrap, reason: 'since' });
    });

    // Live delivery

    it("delivers a committed change to another member's socket within a second", async () => {
      const world = await syncWorld(context.db, context.target);
      const socket = await open(world, 'buyer');
      await socket.receiveType('caught_up');
      const started = Date.now();
      await rename(world, world.teams.public, 'Media live');
      const delta = await socket.receiveType('delta', 1000);
      expect(Date.now() - started).toBeLessThan(1000);
      const action = delta.actions.find((item) => item.model === 'Team')!;
      expect([action.action, action.model_id, action.data.name]).toEqual(['update', String(world.teams.public.id), 'Media live']);
      // Other test files write at the same time, so the log may already be past this delta.
      expect(delta.last_sync_id).toBeGreaterThanOrEqual(delta.actions[delta.actions.length - 1].sync_id);
    });

    it('delivers to every open socket of the workspace', async () => {
      const world = await syncWorld(context.db, context.target);
      const all = [await open(world, 'owner'), await open(world, 'buyer'), await open(world, 'guest')];
      for (const socket of all) await socket.receiveType('caught_up');
      await rename(world, world.teams.public, 'Everyone sees');
      for (const socket of all) expect((await socket.receiveType('delta')).actions[0].data.name).toBe('Everyone sees');
    });

    it('answers ping with pong', async () => {
      const world = await syncWorld(context.db, context.target);
      const socket = await open(world, 'buyer');
      await socket.receiveType('caught_up');
      socket.send({ type: 'ping' });
      expect(await socket.receive()).toEqual({ type: 'pong' });
      // Anything else is ignored.
      socket.send('not json');
      socket.send({ type: 'other' });
      socket.send({ type: 'ping' });
      expect(await socket.receive()).toEqual({ type: 'pong' });
    });

    it('sends heartbeats to a quiet socket', async () => {
      const target = await tuned({ heartbeatMs: 200 });
      const world = await syncWorld(context.db, target);
      const socket = await open(world, 'buyer', { target });
      await socket.receiveType('caught_up');
      expect(await socket.receive(2000)).toEqual({ type: 'ping' });
    });

    it('polls the log when no notification comes', async () => {
      // Without LISTEN only the poll reads the log.
      const target = await tuned({ listen: false, pollMs: 300 });
      const world = await syncWorld(context.db, target);
      const socket = await open(world, 'buyer', { target });
      await socket.receiveType('caught_up');
      await rename(world, world.teams.public, 'Polled');
      expect((await socket.receiveType('delta', 3000)).actions[0].data.name).toBe('Polled');
    });

    it.skipIf(!process.env.REDIS_URL)('reads the log when the Redis sync bus says so', async () => {
      // Neither LISTEN nor a poll within the test: only the bus wakes the hub (decision 54).
      const target = await tuned({ listen: false, pollMs: 60_000 }, { REDIS_URL: process.env.REDIS_URL! });
      const world = await syncWorld(context.db, target);
      const socket = await open(world, 'buyer', { target });
      await socket.receiveType('caught_up');
      await rename(world, world.teams.public, 'Published');
      const redis = new Redis(process.env.REDIS_URL!);
      try {
        await publishSyncBus(redis);
      } finally {
        redis.disconnect();
      }
      expect((await socket.receiveType('delta', 3000)).actions[0].data.name).toBe('Published');
    });

    // Sync groups

    it("never sends another workspace's changes", async () => {
      const world = await syncWorld(context.db, context.target);
      const stranger = await open(world, 'stranger');
      const buyer = await open(world, 'buyer');
      await stranger.receiveType('caught_up');
      await buyer.receiveType('caught_up');

      await rename(world, world.teams.public, 'Ours');
      await save(context.db, RulePresetEntity, { workspaceId: world.ws.id, ownerUserId: world.users.owner.id, name: 'Our rule' });
      await save(context.db, RuleGroupEntity, { workspaceId: world.ws.id, ownerUserId: world.users.owner.id, name: 'Our label' });
      await rename(world, world.teams.elsewhere, 'Theirs');

      // The first thing the stranger hears is their own workspace's change.
      const delta = await stranger.receiveType('delta');
      expect(delta.actions.map((action) => [action.model, action.model_id])).toEqual([['Team', String(world.teams.elsewhere.id)]]);
      expect(await stranger.silent(300)).toBe(true);
      const actions = await deltasUntil(buyer, (found) => ['Team', 'Rule', 'Label'].every((model) => found.some((action) => action.model === model)));
      expect(actions.filter((action) => action.model === 'Team').map((action) => action.model_id)).not.toContain(String(world.teams.elsewhere.id));
    });

    it('sends a guest neither rules nor private teams', async () => {
      const world = await syncWorld(context.db, context.target);
      const guest = await open(world, 'guest');
      await guest.receiveType('caught_up');
      await save(context.db, RulePresetEntity, { workspaceId: world.ws.id, ownerUserId: world.users.owner.id, name: 'Members only' });
      await rename(world, world.teams.private, 'Still secret');
      await rename(world, world.teams.public, 'Guest sees this');
      const delta = await guest.receiveType('delta');
      expect(delta.actions.map((action) => [action.model, action.model_id])).toEqual([['Team', String(world.teams.public.id)]]);
    });

    it('filters the catch-up by groups too', async () => {
      const world = await syncWorld(context.db, context.target);
      const since = await logMax(world);
      await rename(world, world.teams.elsewhere, 'Not yours');
      await rename(world, world.teams.private, 'Not yours either');
      const socket = await open(world, 'buyer', { since });
      expect((await socket.receive()).type).toBe('caught_up');
    });

    it('stops sending to a removed member at once', async () => {
      const world = await syncWorld(context.db, context.target);
      const buyer = await open(world, 'buyer');
      await buyer.receiveType('caught_up');
      await context.db.transaction(async (tx) => {
        await tx.delete(TeamMemberEntity, { memberId: world.members.buyer.id });
        await tx.delete(WorkspaceMemberEntity, { id: world.members.buyer.id });
      });
      await rename(world, world.teams.public, 'After you left');

      const actions: SyncActionMessage[] = [];
      let closed: SocketClosed | null = null;
      while (!closed) {
        try {
          const message = await buyer.receive();
          if (message.type === 'delta') actions.push(...message.actions);
        } catch (error) {
          if (!(error instanceof SocketClosed)) throw error;
          closed = error;
        }
      }
      expect(closed).toMatchObject({ code: SYNC_CLOSE.forbidden, reason: 'removed' });
      // They hear of their own removal, and nothing after it.
      expect(actions.map((action) => [action.model, action.model_id, action.action])).toContainEqual(['WorkspaceMember', String(world.members.buyer.id), 'delete']);
      expect(names(actions)).not.toContain('After you left');
    });

    it('leaks nothing written in the same transaction as a removal', async () => {
      const world = await syncWorld(context.db, context.target);
      const buyer = await open(world, 'buyer');
      await buyer.receiveType('caught_up');
      await context.db.transaction(async (tx) => {
        await tx.delete(TeamMemberEntity, { memberId: world.members.buyer.id });
        await tx.delete(WorkspaceMemberEntity, { id: world.members.buyer.id });
        await tx.update(TeamEntity, { id: world.teams.public.id }, { name: 'Same commit' });
        await tx.save(tx.create(RulePresetEntity, { workspaceId: world.ws.id, ownerUserId: world.users.owner.id, name: 'Same commit' }));
      });
      const actions: SyncActionMessage[] = [];
      for (;;) {
        try {
          const message = await buyer.receive();
          if (message.type === 'delta') actions.push(...message.actions);
        } catch (error) {
          expect(error).toMatchObject({ code: SYNC_CLOSE.forbidden });
          break;
        }
      }
      expect(actions.map((action) => action.data.name)).not.toContain('Same commit');
    });

    it('opens a private team\'s group on the open socket of a member who joins it', async () => {
      const world = await syncWorld(context.db, context.target);
      const buyer = await open(world, 'buyer');
      await buyer.receiveType('caught_up');
      await rename(world, world.teams.private, 'Before joining');
      await save(context.db, TeamMemberEntity, { teamId: world.teams.private.id, memberId: world.members.buyer.id });
      await rename(world, world.teams.private, 'After joining');

      let groups: { added: string[] } | null = null;
      const actions: SyncActionMessage[] = [];
      while (!actions.some((action) => action.data.name === 'After joining')) {
        const message = await buyer.receive();
        if (message.type === 'sync_groups') groups = message;
        else if (message.type === 'delta') actions.push(...message.actions);
      }
      expect(groups?.added).toEqual([`team:${world.teams.private.id}`]);
      expect(names(actions)).not.toContain('Before joining');
      expect(actions.map((action) => action.model)).toContain('TeamMember');
    });

    it('applies a role change to guest on the open socket', async () => {
      const world = await syncWorld(context.db, context.target);
      const buyer = await open(world, 'buyer');
      await buyer.receiveType('caught_up');
      await context.db.getRepository(WorkspaceMemberEntity).update({ id: world.members.buyer.id }, { role: 'guest' });
      const delta = await buyer.receiveType('delta');
      expect([delta.actions[0].model, delta.actions[0].data.role]).toEqual(['WorkspaceMember', 'guest']);
      const groups = await buyer.receiveType('sync_groups');
      expect(groups.removed).toContain(`workspace:${world.ws.id}:members`);
      expect(groups.sync_groups).not.toContain(`workspace:${world.ws.id}:members`);
      await save(context.db, RulePresetEntity, { workspaceId: world.ws.id, ownerUserId: world.users.owner.id, name: 'Now hidden' });
      expect(await buyer.silent(500)).toBe(true);
    });

    it('sends a new public team to members but not guests', async () => {
      const world = await syncWorld(context.db, context.target);
      const buyer = await open(world, 'buyer');
      const guest = await open(world, 'guest');
      await buyer.receiveType('caught_up');
      await guest.receiveType('caught_up');
      const team = await save(context.db, TeamEntity, { workspaceId: world.ws.id, name: 'New', key: 'NEW' });
      const groups = await buyer.receiveType('sync_groups');
      expect(groups.added).toEqual([`team:${team.id}`]);
      const created = (await buyer.receiveType('delta')).actions;
      expect(created.map((action) => [action.model, action.action, action.model_id])).toEqual([['Team', 'insert', String(team.id)]]);
      await rename(world, team, 'New and renamed');
      expect((await buyer.receiveType('delta')).actions[0].data.name).toBe('New and renamed');
      expect(await guest.silent(500)).toBe(true);
    });

    // Sign-in

    it('refuses a socket without a session', async () => {
      const socket = await openSocket(context.target, new Browser(context.target), { since: 0 });
      sockets.push(socket);
      expect(await socket.closedWith()).toMatchObject({ code: SYNC_CLOSE.unauthorized, reason: 'Sign-in is required' });
    });

    it('refuses a forged cookie', async () => {
      const socket = await openSocket(context.target, null, { since: 0 }, { cookie: 'buyerly_session=not-a-session' });
      sockets.push(socket);
      expect(await socket.closedWith()).toMatchObject({ code: SYNC_CLOSE.unauthorized });
    });

    it("refuses another site's page with the member's cookie before the upgrade", async () => {
      const world = await syncWorld(context.db, context.target);
      await expect(open(world, 'buyer', { headers: { origin: 'https://evil.example' } })).rejects.toEqual(new HandshakeRefused(403));
    });

    it("lets the app's own page open one", async () => {
      const world = await syncWorld(context.db, context.target);
      for (const origin of ['https://buyerly.test', 'https://buyerly.test/']) {
        const socket = await open(world, 'buyer', { headers: { origin } });
        await socket.receiveType('caught_up');
      }
      // A page served from the socket's own host.
      const host = new URL(await context.target.socketUrl('/')).host;
      const socket = await open(world, 'buyer', { headers: { origin: `http://${host}` } });
      await socket.receiveType('caught_up');
    });

    it('refuses a workspace the member is not in', async () => {
      const world = await syncWorld(context.db, context.target);
      const socket = await open(world, 'buyer', { since: 0, query: { workspace: world.other.slug } });
      expect(await socket.closedWith()).toMatchObject({ code: SYNC_CLOSE.forbidden, reason: 'Workspace access denied' });
    });

    it('closes 4404 for a member without a workspace', async () => {
      const world = await syncWorld(context.db, context.target);
      const browser = await world.browser('buyer');
      await context.db.getRepository(WorkspaceMemberEntity).delete({ userId: world.users.buyer.id });
      const socket = await openSocket(context.target, browser, { since: 0 });
      sockets.push(socket);
      expect(await socket.closedWith()).toMatchObject({ code: SYNC_CLOSE.notFound, reason: 'workspace' });
    });

    it('acts as the account in ?account= and uses the active workspace without ?workspace=', async () => {
      const world = await syncWorld(context.db, context.target);
      const browser = new Browser(context.target);
      await browser.signIn(world.users.buyer.email!);
      await browser.signIn(world.users.owner.email!);
      const since = await logMax(world);
      await rename(world, world.teams.private, 'Owner only');
      // The newest sign-in acts by default; the account names the other.
      const asOwner = await openSocket(context.target, browser, { since });
      const asBuyer = await openSocket(context.target, browser, { since, account: world.users.buyer.id });
      sockets.push(asOwner, asBuyer);
      expect(names((await asOwner.receiveType('delta')).actions)).toEqual(['Owner only']);
      expect((await asBuyer.receive()).type).toBe('caught_up');
      const stranger = await openSocket(context.target, browser, { since, account: world.users.stranger.id });
      sockets.push(stranger);
      expect(await stranger.closedWith()).toMatchObject({ code: SYNC_CLOSE.unauthorized, reason: 'This account is no longer logged in' });
    });

    it('renews an aging session in the upgrade response', async () => {
      const world = await syncWorld(context.db, context.target);
      // Signed in first: the session to age.
      await world.browser('buyer');
      const old = new Date(Date.now() - 10 * 60_000);
      await context.db.getRepository(WebSessionEntity).update({ userId: world.users.buyer.id }, { lastSeenAt: old });
      const socket = await open(world, 'buyer');
      await socket.receiveType('caught_up');
      expect(socket.setCookies.some((cookie) => cookie.startsWith('buyerly_session='))).toBe(true);
      const session = await context.db.getRepository(WebSessionEntity).findOneByOrFail({ userId: world.users.buyer.id });
      expect(session.lastSeenAt.getTime()).toBeGreaterThan(old.getTime());
    });

    it('closes a signed-out session at the next heartbeat', async () => {
      const target = await tuned({ heartbeatMs: 200 });
      const world = await syncWorld(context.db, target);
      const socket = await open(world, 'buyer', { target });
      await socket.receiveType('caught_up');
      await context.db.getRepository(WebSessionEntity).update({ userId: world.users.buyer.id }, { revokedAt: new Date() });
      expect(await socket.closedWith(2000)).toMatchObject({ code: SYNC_CLOSE.unauthorized, reason: 'signed out' });
    });

    // Reconnects

    it('misses and repeats nothing when reconnecting from the last sync id', async () => {
      const world = await syncWorld(context.db, context.target);
      const socket = await open(world, 'buyer');
      await socket.receiveType('caught_up');
      await rename(world, world.teams.public, 'Seen live');
      const last = (await socket.receiveType('delta')).last_sync_id;
      await socket.close();

      await rename(world, world.teams.public, 'While away 1');
      await rename(world, world.teams.public, 'While away 2');
      const again = await open(world, 'buyer', { since: last });
      expect(names((await again.receiveType('delta')).actions)).toEqual(['While away 1', 'While away 2']);
      await again.receiveType('caught_up');
      await rename(world, world.teams.public, 'Live again');
      expect(names((await again.receiveType('delta')).actions)).toEqual(['Live again']);
    });

    it('agrees with /delta about what a reconnecting client missed', async () => {
      const world = await syncWorld(context.db, context.target);
      const since = await logMax(world);
      for (let n = 0; n < 4; n += 1) await rename(world, world.teams.public, `Away ${n}`);
      const http = (await (await world.browser('buyer')).get(`/api/sync/delta?since=${since}`)).json<SyncDelta>();
      const socket = await open(world, 'buyer', { since });
      const actions = await deltasUntil(socket, (found) => found.length >= http.actions.length);
      expect(actions).toEqual(http.actions);
    });

    it('sends writes made during catch-up exactly once, in order', async () => {
      const target = await tuned({ batch: 7 });
      const world = await syncWorld(context.db, target);
      const since = await logMax(world);
      for (let n = 0; n < 20; n += 1) await rename(world, world.teams.public, `Before ${n}`);
      const writing = (async () => {
        for (let n = 0; n < 40; n += 1) await rename(world, world.teams.public, `During ${n}`);
      })();
      const socket = await open(world, 'buyer', { since, target });
      const actions = await deltasUntil(socket, (found) => found.some((action) => action.data.name === 'During 39'), 20_000);
      await writing;
      const ids = actions.map((action) => action.sync_id);
      expect(ids, 'no duplicates, in order').toEqual([...new Set(ids)].sort((a, b) => a - b));
      const expected = (await (await world.browser('buyer')).get(`/api/sync/delta?since=${since}&limit=5000`)).json<SyncDelta>();
      expect(ids, 'no gaps').toEqual(expected.actions.map((action) => action.sync_id).filter((id) => id <= ids[ids.length - 1]));
      expect(names(actions)).toEqual([...Array.from({ length: 20 }, (_, n) => `Before ${n}`), ...Array.from({ length: 40 }, (_, n) => `During ${n}`)]);
    });

    it('closes a socket that falls too far behind, to reconnect', async () => {
      const target = await tuned({ maxPendingBatches: 0 });
      const world = await syncWorld(context.db, target);
      const socket = await open(world, 'buyer', { target });
      await socket.receiveType('caught_up');
      await rename(world, world.teams.public, 'Too much');
      expect(await socket.closedWith()).toMatchObject({ code: SYNC_CLOSE.tooSlow, reason: 'behind' });
    });
  });
}
