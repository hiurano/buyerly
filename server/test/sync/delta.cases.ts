import type { SyncDelta } from '@buyerly/shared';
import { describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { TeamEntity } from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { syncWorld, type SyncWorld } from '../support/sync-world.ts';
import { logMax } from './bootstrap.cases.ts';
import type { SyncContext } from './sync.test.ts';

// GET /api/sync/delta, the socket's catch-up over HTTP (tests/test_sync_stream.py, "HTTP catch-up").

export async function rename(world: SyncWorld, team: TeamEntity, name: string): Promise<void> {
  await world.db.getRepository(TeamEntity).update({ id: team.id }, { name });
}

// Runs `work` while the log claims to have dropped everything up to sync id 1
// (database/sync_log.py compact_sync_log), then puts the mark back. Only
// `since=0` is behind it, so cases running meanwhile are not disturbed.
export async function withCompactedLog(db: DataSource, work: () => Promise<void>): Promise<void> {
  const [previous] = await db.query<{ payload: Record<string, unknown> }[]>(
    "SELECT payload FROM automation_runtime_states WHERE state_key = 'sync_log'",
  );
  const through = Math.max(Number(previous?.payload.compacted_through ?? 0), 1);
  await db.query(
    `INSERT INTO automation_runtime_states (state_key, payload, updated_at) VALUES ('sync_log', $1, now())
     ON CONFLICT (state_key) DO UPDATE SET payload = EXCLUDED.payload`,
    [{ ...previous?.payload, compacted_through: through }],
  );
  try {
    await work();
  } finally {
    if (previous) await db.query("UPDATE automation_runtime_states SET payload = $1 WHERE state_key = 'sync_log'", [previous.payload]);
    else await db.query("DELETE FROM automation_runtime_states WHERE state_key = 'sync_log'");
  }
}

export function deltaCases(context: SyncContext): void {
  describe('delta', () => {
    it("returns the member's changes since an id", async () => {
      const world = await syncWorld(context.db, context.target);
      const browser = await world.browser('buyer');
      const since = await logMax(world);
      await rename(world, world.teams.public, 'One');
      await rename(world, world.teams.private, 'Hidden');
      await rename(world, world.teams.public, 'Two');
      const newest = await logMax(world);
      const response = await browser.get(`/api/sync/delta?since=${since}`);
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      const body = response.json<SyncDelta>();
      expect(Object.keys(body)).toEqual(['actions', 'last_sync_id', 'has_more', 'sync_groups']);
      expect(body.actions.map((action) => action.data.name)).toEqual(['One', 'Two']);
      expect(body.actions[0].sync_id).toBeGreaterThan(since);
      expect(body.actions[0]).toEqual({
        sync_id: body.actions[0].sync_id,
        model: 'Team',
        model_id: String(world.teams.public.id),
        action: 'update',
        data: { name: 'One' },
      });
      expect(body.has_more).toBe(false);
      // Current to the newest id, the private team's change included.
      expect(body.last_sync_id).toBeGreaterThanOrEqual(newest);
      expect(body.sync_groups).toEqual([
        `member:${world.members.buyer.id}`, `team:${world.teams.public.id}`, `workspace:${world.ws.id}`, `workspace:${world.ws.id}:members`,
      ].sort());
    });

    it('pages with has_more', async () => {
      const world = await syncWorld(context.db, context.target);
      const browser = await world.browser('buyer');
      const since = await logMax(world);
      for (let n = 0; n < 5; n += 1) await rename(world, world.teams.public, `Page ${n}`);
      const names: unknown[] = [];
      let cursor = since;
      for (;;) {
        const body = (await browser.get(`/api/sync/delta?since=${cursor}&limit=2`)).json<SyncDelta>();
        // A full page ends at its last change; the last page at the newest id.
        if (body.has_more) expect(body.last_sync_id).toBe(body.actions[1].sync_id);
        names.push(...body.actions.filter((action) => action.model === 'Team').map((action) => action.data.name));
        cursor = body.last_sync_id;
        if (!body.has_more) break;
      }
      expect(names).toEqual(['Page 0', 'Page 1', 'Page 2', 'Page 3', 'Page 4']);
    });

    it('tells a client older than the log to bootstrap', async () => {
      const world = await syncWorld(context.db, context.target);
      const browser = await world.browser('buyer');
      await withCompactedLog(context.db, async () => {
        const response = await browser.get('/api/sync/delta?since=0');
        expect(response.status).toBe(410);
        expect(response.json()).toEqual({ detail: 'bootstrap' });
      });
    });

    it('needs a session', async () => {
      const response = await new Browser(context.target).get('/api/sync/delta?since=0');
      expect(response.status).toBe(401);
      // Sign-in comes before the query is read.
      expect((await new Browser(context.target).get('/api/sync/delta')).status).toBe(401);
    });

    it('checks its query as FastAPI does', async () => {
      const world = await syncWorld(context.db, context.target);
      const browser = await world.browser('buyer');
      const detail = async (query: string) => {
        const response = await browser.get(`/api/sync/delta${query}`);
        expect(response.status, query).toBe(422);
        return response.json<{ detail: unknown }>().detail;
      };
      expect(await detail('')).toEqual([{ type: 'missing', loc: ['query', 'since'], msg: 'Field required', input: null }]);
      expect(await detail('?since=abc&limit=0')).toEqual([
        { type: 'int_parsing', loc: ['query', 'since'], msg: 'Input should be a valid integer, unable to parse string as an integer', input: 'abc' },
        { type: 'greater_than_equal', loc: ['query', 'limit'], msg: 'Input should be greater than or equal to 1', input: '0', ctx: { ge: 1 } },
      ]);
      expect(await detail('?since=-1&limit=5001')).toEqual([
        { type: 'greater_than_equal', loc: ['query', 'since'], msg: 'Input should be greater than or equal to 0', input: '-1', ctx: { ge: 0 } },
        { type: 'less_than_equal', loc: ['query', 'limit'], msg: 'Input should be less than or equal to 5000', input: '5001', ctx: { le: 5000 } },
      ]);
      expect(await detail('?since=1.5')).toEqual([
        { type: 'int_parsing', loc: ['query', 'since'], msg: 'Input should be a valid integer, unable to parse string as an integer', input: '1.5' },
      ]);
      // What pydantic still reads as an integer.
      for (const since of ['1.0', '+1', '1_0', '%201%20']) {
        expect((await browser.get(`/api/sync/delta?since=${since}&limit=1`)).status, since).toBe(200);
      }
    });
  });
}
