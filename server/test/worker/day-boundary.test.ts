import Fastify from 'fastify';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountEntity } from '../../src/entities/index.ts';
import { databaseOver } from '../../src/database.ts';
import { accountClock, evaluateDayBoundary, localNow, runDayBoundaryCycle, utcOffsetLabel } from '../../src/worker/day-boundary.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL } from '../support/target.ts';

// The account day boundary (scheduler/worker.py run_day_boundary_cycle,
// core/timezones.py; #611 stage 4), proved equal to Python's decisions at every
// zone and moment in CI before Python was removed.

const log = Fastify({ logger: false }).log;

// Moments around midnight in zones east and west of Greenwich, across a DST change, and UTC itself.
const ZONES = ['Europe/Amsterdam', 'America/New_York', 'Asia/Kolkata', 'Asia/Kathmandu', 'America/St_Johns', 'Pacific/Chatham', 'UTC', 'Europe/Kiev', 'US/Pacific', ' Asia/Tokyo ', 'Mars/Olympus', ''];
const MOMENTS = ['2026-11-06T22:59:30Z', '2026-11-06T23:03:00Z', '2026-11-06T23:05:00Z', '2026-11-07T04:59:59Z', '2026-11-07T05:00:00Z', '2026-03-29T00:30:00Z', '2026-11-01T04:02:00Z', '2026-11-06T18:16:00Z'];
const PREVIOUS = ['', '2026-11-06', '2026-11-07', '2026-03-28', '2026-10-31'];

describe('the day boundary decision', () => {
  it('reaches every outcome, at every zone and moment', () => {
    const cases = ZONES.flatMap((zone) => MOMENTS.flatMap((at) => PREVIOUS.map((previous) => ({ zone, at, previous }))));
    const ours = cases.map(({ zone, at, previous }) => {
      const clock = accountClock(zone);
      if (!clock) return null;
      const local = localNow(clock.canonical, new Date(at));
      const decision = evaluateDayBoundary(previous, local);
      return {
        canonical: clock.canonical, date: decision.current_date, update: decision.should_update, notify: decision.should_notify,
        reason: decision.reason, offset: utcOffsetLabel(local), time: `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`,
      };
    });
    expect(new Set(ours.map((item) => item?.reason ?? 'no clock'))).toEqual(new Set(['same_date', 'initialized', 'new_day', 'missed_window', 'no clock']));
  });
});

describe.skipIf(!DATABASE_URL)('the day boundary cycle on the database', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await testDatabase();
  });
  afterAll(async () => {
    await dataSource?.destroy();
  });

  it('records a new day once, within five minutes of local midnight, and only moves the date otherwise', async () => {
    const owner = await createUser(dataSource);
    const workspace = await createWorkspace(dataSource, owner);
    const accounts = dataSource.getRepository(AccountEntity);
    const make = (fields: Partial<AccountEntity>) =>
      accounts.save(accounts.create({
        accountId: `act_${Math.floor(Math.random() * 1e15)}`, name: 'Account', workspaceId: workspace.id, ownerUserId: null,
        currency: 'EUR', rulesEnabled: false, isActive: true, metaConnectionId: null, leadUserId: null, targetCostPerResult: null, ...fields,
      }));
    // 23:02 UTC is 00:02 in Amsterdam (CET) and 18:02 in New York.
    const now = new Date('2026-11-06T23:02:00Z');
    const amsterdam = await make({ timezoneName: 'Europe/Amsterdam', lastDayStartDate: '2026-11-06' });
    const kiev = await make({ timezoneName: 'Europe/Kiev', lastDayStartDate: '2026-11-07' });
    const fresh = await make({ timezoneName: 'America/New_York', lastDayStartDate: '' });
    const late = await make({ timezoneName: 'Asia/Tokyo', lastDayStartDate: '2026-11-06' });
    const nowhere = await make({ timezoneName: 'Mars/Olympus', lastDayStartDate: '2026-11-06' });
    const orphan = await make({ timezoneName: 'Europe/Amsterdam', lastDayStartDate: '2026-11-06', workspaceId: null, ownerUserId: owner.id });

    const db = databaseOver(dataSource);
    const stats = await runDayBoundaryCycle(db, log, now);
    expect(stats.errors).toContain(`Account ${nowhere.accountId}: unknown timezone 'Mars/Olympus'`);
    expect(stats.errors).toContain(`Account ${orphan.accountId}: failed to persist account day boundary`);

    const row = async (account: AccountEntity) => accounts.findOneByOrFail({ id: account.id });
    expect(await row(amsterdam)).toMatchObject({ lastDayStartDate: '2026-11-07', ownerUserId: owner.id });
    expect(await row(kiev)).toMatchObject({ timezoneName: 'Europe/Kyiv', lastDayStartDate: '2026-11-07' });
    expect((await row(fresh)).lastDayStartDate).toBe('2026-11-06');
    expect((await row(late)).lastDayStartDate).toBe('2026-11-07');
    // The orphan's date stays, so the next tick tries again; as a rollback leaves it.
    expect((await row(orphan)).lastDayStartDate).toBe('2026-11-06');

    const events = await dataSource.query<Record<string, unknown>[]>(
      "SELECT account_id, owner_user_id, actor_type, actor_id, category, status, action, message, before_state, after_state, details, entity_level, correlation_id FROM audit_events WHERE event_type = 'ACCOUNT_DAY_STARTED' AND workspace_id = $1",
      [workspace.id],
    );
    expect(events).toEqual([{
      account_id: amsterdam.accountId, owner_user_id: owner.id, actor_type: 'system', actor_id: 'monitoring_worker', category: 'MONITORING',
      status: 'SUCCESS', action: 'DETECT_ACCOUNT_DAY_BOUNDARY', entity_level: 'adset', correlation_id: stats.cycle_id,
      message: 'A new day started in the ad account: 2026-11-07 at 00:02 (Europe/Amsterdam, UTC+01:00)',
      before_state: { last_day_start_date: '2026-11-06' }, after_state: { last_day_start_date: '2026-11-07' },
      details: { timezone_name: 'Europe/Amsterdam', utc_offset: 'UTC+01:00', local_date: '2026-11-07', local_time: '00:02' },
    }]);

    // A minute later nothing is new.
    await runDayBoundaryCycle(db, log, new Date('2026-11-06T23:03:00Z'));
    const again = await dataSource.query<unknown[]>("SELECT id FROM audit_events WHERE event_type = 'ACCOUNT_DAY_STARTED' AND workspace_id = $1", [workspace.id]);
    expect(again).toHaveLength(1);
  });
});
