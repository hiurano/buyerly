import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountDayEnd, decide, executionKey, type DecisionInput } from '../../src/rules/decide.ts';
import { evaluateAll } from '../../src/rules/engine.ts';
import { MISMATCHES_KEY, SINCE_KEY, compareCapture, dayKey, readDay, runRulesShadow, utcDay, type Capture } from '../../src/rules/shadow.ts';
import { report } from '../../src/rules/shadow-report.ts';

// The rules engine's decision (#611 stage 4). The cases that matter are the
// captures of Python's real monitoring cycle (tests/test_rules_shadow.py and
// tests/test_integration.py with RULES_SHADOW_DIR, the server job in CI):
// every one must be decided exactly as Python did. The rest pins a few
// behaviours by hand.

const CAPTURES = process.env.RULES_SHADOW_CAPTURES ?? '';
const REDIS_URL = process.env.REDIS_URL ?? '';

const stopRule = { preset_id: 1, workspace_id: 7, name: 'Stop', action: 'turn_off', logic: 'and', conditions: [{ metric: 'spend', operator: 'gte', value: 10, time_window: 'today' }] };
const raise = { preset_id: 2, workspace_id: 7, name: 'Raise', action: 'increase_budget', logic: 'and', budget_change_percent: 25, budget_max_daily: 100, cooldown_minutes: 60, conditions: [{ metric: 'spend', operator: 'gte', value: 1, time_window: 'today' }, { metric: 'leads', operator: 'gte', value: 1, time_window: 'today' }] };

function input(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    cycle_id: 'c1',
    account: { account_id: 'act_1', workspace_id: 7, currency: 'USD', rules_enabled: true, timezone_name: 'HST' },
    now: 1_800_000_000,
    stop_confirmation_minutes: 0,
    critical_interval: 2,
    due_rules: [stopRule],
    entities: [{ entity_level: 'adset', entity_id: 'as_1', entity_name: 'One', adset_id: 'as_1', campaign_id: 'c', status: 'ACTIVE', effective_status: 'ACTIVE', spend: 12, leads: 0, daily_budget: 40 }],
    entity_windows: { as_1: {} },
    undone_actions: {},
    manual_enables: {},
    execution_states: [],
    ...overrides,
  };
}

describe('the decision', () => {
  it('stops at once without a confirmation window', () => {
    const decision = decide(input());
    expect(decision.actions.map((action) => [action.evaluation.entity_id, action.evaluation.action, action.desired_state])).toEqual([['as_1', 'STOP', { status: 'PAUSED' }]]);
    expect(decision.outcomes.map((outcome) => [outcome.rule_id, outcome.state, outcome.acted_at])).toEqual([[1, 'fired', 1_800_000_000]]);
  });

  it('waits out the confirmation window before a stop, then stops', () => {
    const first = decide(input({ stop_confirmation_minutes: 10 }));
    expect(first.actions).toEqual([]);
    expect(first.outcomes[0]).toMatchObject({ state: 'confirming', wait_until: 1_800_000_600 });
    expect(first.events.map((event) => event.event_type)).toEqual(['STOP_CONFIRMATION_STARTED']);
    const states = [...first.states.values()];
    const later = decide(input({ stop_confirmation_minutes: 10, now: 1_800_000_000 + 120, execution_states: states }));
    expect(later.outcomes[0]).toMatchObject({ state: 'confirming', wait_until: 1_800_000_600 });
    let carried = [...later.states.values()];
    let now = 1_800_000_120;
    for (let step = 0; step < 4; step += 1) {
      now += 120;
      const next = decide(input({ stop_confirmation_minutes: 10, now, execution_states: carried }));
      carried = [...next.states.values()];
      if (next.actions.length) {
        expect(now).toBe(1_800_000_600);
        return;
      }
    }
    throw new Error('the stop never confirmed');
  });

  it('raises a budget by the percent, Python float for float, and then cools down', () => {
    const decision = decide(input({ due_rules: [raise], entities: [{ ...input().entities[0], leads: 2, daily_budget: 33.33 }] }));
    expect(decision.actions[0].desired_state).toEqual({ daily_budget: 33.33 * (1 + 25 / 100.0) });
    const again = decide(input({ due_rules: [raise], entities: [{ ...input().entities[0], leads: 2 }], now: 1_800_000_000 + 600, execution_states: [...decision.states.values()] }));
    expect(again.actions).toEqual([]);
    expect(again.outcomes[0]).toMatchObject({ state: 'cooldown', wait_until: 1_800_000_000 + 3600 });
  });

  it('leaves alone what the buyer undid today', () => {
    const decision = decide(input({ undone_actions: { as_1: ['STOP'] } }));
    expect(decision.actions).toEqual([]);
    expect(decision.outcomes[0]).toMatchObject({ state: 'undone', wait_until: accountDayEnd('HST', 1_800_000_000), detail: '' });
  });

  it('keys an execution slot as Python does', () => {
    const [evaluation] = evaluateAll(input().entities[0], { rules_enabled: true, workspace_id: 7, currency: 'USD' }, {}, [stopRule]);
    // hashlib.sha256(b"act_1:as_1:1:STOP").hexdigest()
    expect(executionKey('act_1', evaluation).key).toBe('rule-action:dc235ebe2b3eaac10d16579be81b8dd91d448f6cbf40540ec4fca31eed5caccf');
  });

  it('ends the account day at its next local midnight', () => {
    // 2027-01-15 12:00 UTC is 02:00 in Honolulu (UTC-10): the day ends at 10:00 UTC on the 16th.
    expect(accountDayEnd('HST', Date.UTC(2027, 0, 15, 12) / 1000)).toBe(Date.UTC(2027, 0, 16, 10) / 1000);
    // No zone: UTC.
    expect(accountDayEnd(null, Date.UTC(2027, 0, 15, 12) / 1000)).toBe(Date.UTC(2027, 0, 16) / 1000);
    // Berlin on the night clocks go forward (2027-03-28): midnight still exists, at UTC+1.
    expect(accountDayEnd('Europe/Berlin', Date.UTC(2027, 2, 27, 12) / 1000)).toBe(Date.UTC(2027, 2, 27, 23) / 1000);
  });
});

describe.skipIf(!CAPTURES)('the decisions of Python\'s monitoring cycles', () => {
  it('are made the same way by the TypeScript engine', () => {
    const files = readdirSync(CAPTURES).filter((name) => name.endsWith('.json.gz'));
    expect(files.length).toBeGreaterThan(100);
    const mismatches: unknown[] = [];
    let actions = 0;
    let outcomes = 0;
    for (const name of files) {
      const capture = JSON.parse(gunzipSync(readFileSync(path.join(CAPTURES, name))).toString('utf8')) as Capture;
      const comparison = compareCapture(capture);
      actions += comparison.actionsPython;
      outcomes += comparison.outcomes;
      const unexplained = comparison.differences.filter((difference) => !difference.explained);
      if (unexplained.length) mismatches.push({ name, unexplained: unexplained.slice(0, 4) });
    }
    console.log(`Rules shadow parity: ${files.length} captures, ${outcomes} rule outcomes, ${actions} actions`);
    expect(mismatches.slice(0, 10)).toEqual([]);
    expect(actions).toBeGreaterThan(20);
  });
});

describe.skipIf(!REDIS_URL)('the shadow run', () => {
  let redis: Redis;
  beforeAll(async () => {
    redis = new Redis(REDIS_URL);
    const keys = await redis.keys('buyerly:rules-shadow:*');
    if (keys.length) await redis.del(...keys);
  });
  afterAll(() => redis.disconnect());

  it('compares each capture, counts it, keeps a mismatch with its input and deletes the file', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'rules-shadow-'));
    const base = input();
    const decided = decide(base);
    const clean: Capture = {
      ...base,
      version: 1,
      python: {
        outcomes: decided.outcomes,
        actions: decided.actions.map((action) => ({
          entity_level: action.evaluation.entity_level,
          entity_id: action.evaluation.entity_id,
          rule_id: action.evaluation.rule_id,
          rule_name: action.evaluation.rule_name,
          action: action.evaluation.action,
          reason: action.evaluation.reason,
          yielded_rules: action.evaluation.yielded_rules,
          observed_state: action.observed_state,
          desired_state: action.desired_state,
        })),
        stopped_early: false,
      },
    };
    const wrong: Capture = { ...clean, cycle_id: 'c2', python: { ...clean.python, actions: clean.python.actions.map((action) => ({ ...action, desired_state: { status: 'ACTIVE' } })) } };
    writeFileSync(path.join(directory, '0001-c1-act_1.json.gz'), gzipSync(JSON.stringify(clean)));
    writeFileSync(path.join(directory, '0002-c2-act_1.json.gz'), gzipSync(JSON.stringify(wrong)));
    writeFileSync(path.join(directory, '0003-broken.json.gz'), 'not gzip');
    const logged: string[] = [];
    const log = { info: (_: object, message: string) => logged.push(message), warn: (_: object, message: string) => logged.push(message) };
    const stats = await runRulesShadow({ directory, redis, log, now: () => base.now });
    expect(stats).toEqual({ captures: 2, unexplained: 1, errors: 1 });
    expect(readdirSync(directory)).toEqual([]);
    const day = await readDay(redis, utcDay(base.now));
    expect(day).toMatchObject({ captures: 2, cycles: 2, clean: 1, actions_python: 2, actions_ts: 2, actions_matched: 1, unexplained: 1, capture_errors: 1 });
    expect(await redis.get(SINCE_KEY)).toBe(String(base.now));
    const kept = JSON.parse((await redis.lindex(MISMATCHES_KEY, 0))!) as { entity_id: string; capture: Capture };
    expect(kept.entity_id).toBe('as_1');
    expect(compareCapture(kept.capture).differences.filter((item) => !item.explained)).toHaveLength(1);

    // The next day's first run logs this day's summary, once.
    await runRulesShadow({ directory, redis, log, now: () => base.now + 24 * 3600 });
    await runRulesShadow({ directory, redis, log, now: () => base.now + 24 * 3600 });
    expect(logged.filter((message) => message === 'Rules shadow daily summary')).toHaveLength(1);
    expect(await redis.hget(dayKey(utcDay(base.now)), 'summary_logged')).toBe('1');

    const text = await report(redis, { days: 3, mismatches: 5, replay: true }, new Date((base.now + 3600) * 1000));
    expect(text).toContain('replay on this release: 1 difference(s) left');
    expect(text).toMatch(/total\s+2\s+2\s+0\s+1/);
  });
});
