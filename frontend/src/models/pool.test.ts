// Execute the production model pool (#488) with controlled, delayed answers:
// one request per key at a time, nothing read while held data is current,
// stale data read again only after a paint, records shared and replaced in
// place, and nothing of a previous workspace surviving a reset.
import { reaction } from 'mobx';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BuyerlyPool, STALE_AFTER_MS } from './pool';

// A paint is a frame then a task: run them by hand.
const frames: (() => void)[] = [];
beforeAll(() => {
  vi.stubGlobal('requestAnimationFrame', (run: () => void) => frames.push(run));
});
afterAll(() => {
  vi.unstubAllGlobals();
});
const paint = async () => {
  frames.splice(0).forEach((run) => run());
  await new Promise((resolve) => setTimeout(resolve, 0));
};
const settle = () => new Promise((resolve) => setImmediate(resolve));

function server() {
  const calls: { key: string; resolve: (value: never) => void; reject: (error: Error) => void }[] = [];
  return {
    calls,
    query: (key: string, type = 'team') => ({
      kind: 'list' as const, key, type, id: (record: { id: number }) => record.id,
      load: () => new Promise<never>((resolve, reject) => calls.push({ key, resolve, reject })),
    }),
  };
}

describe('model pool', () => {
  it('shares reads, keeps current data, reads stale data after a paint, replaces records in place, and keeps workspaces apart', async () => {
    const pool = new BuyerlyPool();
    pool.reset('olga:7:alpha');
    const api = server();
    const teams = api.query('teams');

    // Nothing held: read now; everyone asking meanwhile shares the request.
    expect(pool.result('teams')).toStrictEqual({ data: undefined, error: '', loading: true });
    pool.ensure(teams as never); pool.ensure(teams as never); void pool.fetch(teams as never);
    expect(api.calls.length, 'one request for concurrent reads').toBe(1);
    api.calls[0].resolve([{ id: 1, name: 'Growth' }, { id: 2, name: 'Media' }] as never);
    await settle();
    const first = pool.result('teams');
    expect((first.data as any).map((team: any) => team.name)).toStrictEqual(['Growth', 'Media']);
    expect(pool.result('teams'), 'an unchanged query hands out the same object').toBe(first);

    // Held and current: no request at all.
    pool.ensure(teams as never); await paint();
    expect(api.calls.length, 'current data is not read again').toBe(1);

    // Held and stale: nothing before the paint, one read after it; an equal answer changes nothing.
    const realNow = Date.now;
    Date.now = () => realNow() + STALE_AFTER_MS + 1;
    pool.ensure(teams as never);
    await settle();
    expect(api.calls.length, 'stale data is read again only after a paint').toBe(1);
    await paint();
    expect(api.calls.length).toBe(2);
    api.calls[1].resolve([{ id: 1, name: 'Growth' }, { id: 2, name: 'Media' }] as never);
    await settle();
    Date.now = realNow;
    expect(pool.result('teams'), 'the same answer keeps the same objects').toBe(first);

    // One record per id, shared by every list that holds it; a change is a new object everywhere.
    const mine = api.query('teams:mine');
    void pool.fetch(mine as never); api.calls[2].resolve([{ id: 2, name: 'Media' }] as never); await settle();
    expect((pool.result('teams:mine').data as any)[0], 'one record per id').toBe((pool.result('teams').data as any)[1]);
    const changes = [];
    const stop = reaction(() => pool.result('teams:mine'), (value) => changes.push(value));
    pool.patch('team', 2, { name: 'Media buying' });
    expect((pool.result('teams').data as any)[1].name).toBe('Media buying');
    expect((pool.result('teams:mine').data as any)[0].name).toBe('Media buying');
    expect(pool.result('teams').data, 'a changed list is a new array').not.toBe(first.data);
    expect((first.data as any)[1].name, 'records are replaced, never edited').toBe('Media');
    expect(changes.length, 'readers hear the change').toBe(1);
    pool.remove('team', 2);
    expect((pool.result('teams').data as any).map((team: any) => team.id)).toStrictEqual([1]);
    expect(pool.result('teams:mine').data).toStrictEqual([]);
    pool.append(teams as never, { id: 3, name: 'New' }, { first: true });
    expect((pool.result('teams').data as any).map((team: any) => team.id)).toStrictEqual([3, 1]);
    stop();

    // A failed first read says why; a failed read behind held data keeps the data.
    const members = api.query('members', 'member');
    void pool.fetch(members as never); api.calls[3].reject(new Error('Members unavailable')); await settle();
    expect(pool.result('members')).toStrictEqual({ data: undefined, error: 'Members unavailable', loading: false });
    void pool.fetch(teams as never, { afterWrite: true }); api.calls[4].reject(new Error('down')); await settle();
    expect((pool.result('teams').data as any).map((team: any) => team.id)).toStrictEqual([3, 1]);

    // After a write the newest request wins, even over an older one answering later.
    const older = pool.fetch(teams as never); const newer = pool.fetch(teams as never, { afterWrite: true });
    expect(api.calls.length, 'a read after a write does not wait for the one on its way').toBe(7);
    api.calls[6].resolve([{ id: 9, name: 'Written' }] as never); await newer;
    api.calls[5].resolve([{ id: 8, name: 'Before the write' }] as never); await older;
    expect((pool.result('teams').data as any).map((team: any) => team.name)).toStrictEqual(['Written']);

    // Another workspace: nothing of the previous one is drawn, and its late answers are dropped.
    const late = pool.fetch(api.query('documents', 'teamDocument') as never);
    const heard = [];
    const stopTeams = reaction(() => pool.result('teams'), (value) => heard.push(value));
    pool.reset('olga:8:beta');
    expect(pool.result('teams')).toStrictEqual({ data: undefined, error: '', loading: true });
    expect(heard.length, 'readers hear the reset').toBe(1);
    expect(pool.record('team', 9)).toBe(undefined);
    api.calls[7].resolve([{ id: 1, title: 'Alpha plan' }] as never); await late;
    expect(pool.result('documents').data, "a late answer never lands in the next workspace").toBe(undefined);
    stopTeams();
    pool.reset('olga:8:beta');
    expect(pool.scope).toBe('olga:8:beta');
  });
});
