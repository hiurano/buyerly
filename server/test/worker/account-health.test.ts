import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountEntity } from '../../src/entities/index.ts';
import { classifyHealthError, recordAccountHealth, safeHealthMessage } from '../../src/worker/account-health.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';

// Account health (services/account_health.py; tests/test_account_health.py).
// The synthetic-metrics normalizer of that file is Python-only: nothing but
// the post-deploy smoke writes those metrics (its own test covers them).

describe('classifying a failure', () => {
  it('names the user, Meta or the system as responsible', () => {
    expect(classifyHealthError('OAuth token expired').cause).toBe('user');
    expect(classifyHealthError('Meta Graph rate limit reached').cause).toBe('meta');
    expect(classifyHealthError('database connection timeout').cause).toBe('system');
  });

  it('gives a stable code, and one for what has no text', () => {
    expect(classifyHealthError('Meta Graph unavailable!').code).toBe('meta_graph_unavailable');
    expect(classifyHealthError(null)).toEqual({ code: 'unknown_error', cause: 'system' });
    expect(classifyHealthError('x'.repeat(100)).code).toHaveLength(64);
  });

  it('redacts and bounds the text it keeps', () => {
    const message = safeHealthMessage(`access_token=EAAB-super-secret ${'x'.repeat(500)}`);
    expect(message).not.toContain('EAAB-super-secret');
    expect(message.length).toBeLessThanOrEqual(240);
  });
});

describe('the health row', () => {
  let db: DataSource;
  let account: AccountEntity;

  beforeAll(async () => {
    db = await testDatabase();
    const workspace = await createWorkspace(db, await createUser(db));
    account = await db.getRepository(AccountEntity).findOneByOrFail({ workspaceId: workspace.id });
  });
  afterAll(() => db.destroy());

  it('counts failures, turns critical on the third and recovers on a success', async () => {
    const target = { id: account.id, workspace_id: account.workspaceId };
    const record = (update: Parameters<typeof recordAccountHealth>[2]) =>
      db.transaction((tx) => recordAccountHealth(tx, target, update));

    const first = await record({ success: false, error: 'Meta Graph unavailable' });
    expect(first.transitioned).toBe(true);
    expect(first.row).toMatchObject({ status: 'degraded', cause: 'meta', consecutive_failures: 1 });

    const second = await record({ success: false, error: 'Meta Graph unavailable' });
    expect(second.transitioned).toBe(false);
    expect(second.row?.consecutive_failures).toBe(2);

    const third = await record({ success: false, error: 'Meta Graph unavailable' });
    expect(third.transitioned).toBe(true);
    expect(third.row).toMatchObject({ status: 'critical', consecutive_failures: 3 });

    const recovered = await record({ success: true, signals: { token_healthy: true } });
    expect(recovered.transitioned).toBe(true);
    expect(recovered.row).toMatchObject({ status: 'healthy', cause: 'none', consecutive_failures: 0, last_error_message: '' });
    const [stored] = await db.query<{ signals: Record<string, unknown> }[]>('SELECT signals FROM account_health WHERE account_pk = $1', [account.id]);
    expect(stored?.signals.token_healthy).toBe(true);
    expect(String(stored?.signals.data_fresh_at)).toMatch(/\+00:00$/);
  });

  it('is critical at once when the person has to act, and writes nothing for an account without a workspace', async () => {
    const result = await db.transaction((tx) => recordAccountHealth(tx, { id: account.id, workspace_id: account.workspaceId }, { success: false, error: 'token expired' }));
    expect(result.row).toMatchObject({ status: 'critical', cause: 'user', consecutive_failures: 1 });
    const none = await db.transaction((tx) => recordAccountHealth(tx, { id: account.id, workspace_id: null }, { success: false, error: 'x' }));
    expect(none).toEqual({ row: null, transitioned: false });
  });
});
