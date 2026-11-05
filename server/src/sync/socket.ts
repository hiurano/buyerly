import { SYNC_CLOSE, type SyncActionMessage, type SyncSocketMessage } from '@buyerly/shared';
import type { WebSocket } from 'ws';
import type { Database } from '../database.ts';
import type { UserEntity } from '../entities/index.ts';
import { WebSessionEntity } from '../entities/index.ts';
import { userWorkspaceMember, type ActingMember } from '../workspaces/access.ts';
import type { Change, Subscription, SyncHub } from './hub.ts';
import { actionMessage, bootstrapSyncGroups, changesSince, needsBootstrap } from './log.ts';

// One client's socket (api/sync_stream.py SocketSession): catch-up from the
// client's last sync id, then live changes in its member's sync groups.
//
// It subscribes to the hub before catching up and skips what it already sent
// by sync id, so the hand-over from catch-up to live has no gap and no
// duplicate. A change to the member's own membership, teams or role
// recomputes the groups before the next row is sent; a member taken out of
// the workspace is disconnected at that row.

// Entries of these models may change who sees what: the socket recomputes its member's groups.
const REGROUP_MODELS = new Set(['WorkspaceMember', 'Team', 'TeamMember']);

export class Closed extends Error {
  constructor(
    readonly code: number,
    readonly reason: string,
  ) {
    super(reason);
    this.name = 'Closed';
  }
}

export class SocketSession {
  private groups = new Set<string>();
  // The highest sync id accounted for: sent, or not for this member.
  private through = 0;
  private gone = false;
  private subscription: Subscription | null = null;

  constructor(
    private readonly socket: WebSocket,
    private readonly db: Database,
    private readonly hub: SyncHub,
    private readonly user: UserEntity,
    private member: ActingMember,
    private readonly webSessionId: string | null,
  ) {
    socket.on('close', () => {
      this.gone = true;
      this.subscription?.interrupt();
    });
    socket.on('message', (data, isBinary) => {
      if (isBinary) return;
      try {
        const message = JSON.parse(textOf(data)) as unknown;
        if (message !== null && typeof message === 'object' && (message as { type?: unknown }).type === 'ping') this.send({ type: 'pong' });
      } catch {
        // Not JSON: ignored, as the Python socket does.
      }
    });
  }

  private send(message: SyncSocketMessage): void {
    if (this.gone) throw new Closed(0, 'gone');
    this.socket.send(JSON.stringify(message));
  }

  async run(after: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (await needsBootstrap(tx, after)) throw new Closed(SYNC_CLOSE.bootstrap, 'bootstrap');
      this.groups = new Set(await bootstrapSyncGroups(tx, this.member));
    });
    const subscription = await this.hub.subscribe();
    this.subscription = subscription;
    try {
      await this.catchUp(after);
      await this.pump(subscription);
    } finally {
      subscription.close();
    }
  }

  private async catchUp(after: number): Promise<void> {
    this.through = after;
    const { batch } = this.hub.tuning;
    for (;;) {
      const groups = [...this.groups].sort();
      const found = await this.db.transaction((tx) => changesSince(tx, groups, this.through, batch));
      if (found.length) {
        this.through = Number(found[found.length - 1].sync_id);
        this.send({ type: 'delta', actions: found.map(actionMessage), last_sync_id: this.through });
      }
      if (found.length < batch) break;
    }
    this.send({ type: 'caught_up', last_sync_id: this.through });
  }

  private async pump(subscription: Subscription): Promise<void> {
    const { heartbeatMs } = this.hub.tuning;
    let quietSince = Date.now();
    while (!this.gone) {
      const left = Math.max(0, quietSince + heartbeatMs - Date.now());
      const changes = await subscription.next(left);
      if (this.gone) return;
      if (changes === undefined) {
        if (Date.now() - quietSince < heartbeatMs) continue;
        await this.checkSession();
        this.send({ type: 'ping' });
        quietSince = Date.now();
        continue;
      }
      if (changes === null) throw new Closed(SYNC_CLOSE.tooSlow, 'behind');
      quietSince = Date.now();
      await this.deliver(changes);
    }
  }

  private async deliver(changes: Change[]): Promise<void> {
    let pending: SyncActionMessage[] = [];
    let removed = false;
    for (const change of changes) {
      if (change.syncId <= this.through) continue;
      this.through = change.syncId;
      if (removed) {
        // The database already has them out; of what follows they get only the row that removes them.
        if (this.isOwnRemoval(change)) pending.push(change.message);
        continue;
      }
      const visible = this.sees(change);
      if (visible) pending.push(change.message);
      if (this.mayRegroup(change)) {
        // Rows before the change go out under the old groups, rows after it under the new ones.
        this.flush(pending);
        pending = [];
        if (!(await this.regroup())) removed = true;
        else if (!visible && this.sees(change)) {
          // The new public team itself opens its group.
          pending.push(change.message);
        }
      }
    }
    this.flush(pending);
    if (removed) throw new Closed(SYNC_CLOSE.forbidden, 'removed');
  }

  private sees(change: Change): boolean {
    for (const group of change.groups) if (this.groups.has(group)) return true;
    return false;
  }

  private isOwnRemoval(change: Change): boolean {
    const { message } = change;
    return message.model === 'WorkspaceMember' && message.model_id === String(this.member.id) && message.action === 'delete';
  }

  private mayRegroup(change: Change): boolean {
    if (change.model === 'Team') {
      // A new team, or one made private or public; its group may not be this member's yet. A rename is not.
      const workspaceId = change.data.workspace_id;
      if (workspaceId !== undefined && workspaceId !== null) return workspaceId === this.member.workspaceId;
      return 'private' in change.data;
    }
    return REGROUP_MODELS.has(change.model) && this.sees(change);
  }

  private flush(actions: SyncActionMessage[]): void {
    if (actions.length) this.send({ type: 'delta', actions, last_sync_id: this.through });
  }

  // Recomputes the member's groups from the database; false when they are no longer in the workspace.
  private async regroup(): Promise<boolean> {
    const result = await this.db.transaction(async (tx) => {
      const found = await userWorkspaceMember(tx, this.user, { workspaceId: this.member.workspaceId });
      if (!found) return null;
      return { member: found.member, groups: new Set(await bootstrapSyncGroups(tx, found.member)) };
    });
    if (!result) return false;
    this.member = result.member;
    const { groups } = result;
    const added = [...groups].filter((group) => !this.groups.has(group)).sort();
    const removed = [...this.groups].filter((group) => !groups.has(group)).sort();
    if (added.length || removed.length) {
      this.groups = groups;
      this.send({ type: 'sync_groups', sync_groups: [...groups].sort(), added, removed });
    }
    return true;
  }

  // A signed-out browser session ends its sockets at the next heartbeat.
  private async checkSession(): Promise<void> {
    if (this.webSessionId === null) return;
    const id = this.webSessionId;
    const session = await this.db.transaction((tx) => tx.findOneBy(WebSessionEntity, { id }));
    if (!session || session.revokedAt !== null || session.expiresAt <= new Date()) throw new Closed(SYNC_CLOSE.unauthorized, 'signed out');
  }
}

// A text frame's payload as ws hands it over: a Buffer, or its fragments.
function textOf(data: Buffer | ArrayBuffer | Buffer[]): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data as ArrayBuffer).toString('utf8');
}
