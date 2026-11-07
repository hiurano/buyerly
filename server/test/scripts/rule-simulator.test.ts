import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, SCENARIOS, simulate, type SimulationResult } from '../../src/scripts/rule-simulator.ts';

// Pilot results by simulation (#200): the cheat-sheet days and Meta faults.
// Each test runs one scenario of src/scripts/rule-simulator.ts through the
// real worker, rule engine, Inbox history, undo and MetaClient retries, and
// pins what is deterministic. The numbers are the ones tests/test_rule_simulator.py
// pinned on the Python simulator (#611 stage 5), and docs/PILOT_SIMULATION.md
// quotes them. The simulator drops the schema of the disposable buyerly_test
// database, so nothing else may use it while this file runs.

const url = process.env.TEST_DATABASE_URL ?? '';
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL must be set in CI');

const REPO = join(import.meta.dirname, '../../..');
const PYTHON = process.env.PYTHON ?? 'python3';

const row = (result: SimulationResult, adsetId: string) => result.rows.find((item) => item.adset_id === adsetId)!;

function assertSummary(result: SimulationResult, expected: Partial<SimulationResult['summary']>): void {
  const actual = Object.fromEntries(Object.keys(expected).map((key) => [key, result.summary[key as keyof SimulationResult['summary']]]));
  expect(actual).toEqual(expected);
}

// Every sheet stop happened once, by the same rule, nothing extra.
function assertFollowsTheSheet(result: SimulationResult): void {
  const stops = result.summary.sheet_stops;
  assertSummary(result, { missed: 0, extra: 0, early: 0, double_writes: 0, matched: stops, same_rule: stops, buyerly_stops: stops });
  for (const item of result.rows) {
    expect(item.meta_pauses).toBeLessThanOrEqual(1);
    expect(item.stop_success_events).toBeLessThanOrEqual(1);
  }
}

const scenario = async (name: string): Promise<SimulationResult> => {
  const result = await simulate(SCENARIOS[name]);
  console.log(`\n${render(result)}\n`);
  return result;
};

async function assertFault(name: string, options: { posts: number; errors?: number }): Promise<SimulationResult> {
  const result = await scenario(name);
  assertSummary(result, { sheet_stops: 8, buyerly_stops: 8, matched: 8, missed: 0, extra: 0, early: 0, double_writes: 0 });
  // Every ad set paused exactly once in Meta, whatever the retries sent.
  expect(result.meta_changes).toBe(8);
  expect(result.meta_posts).toBe(options.posts);
  expect(result.events['STOP:SUCCESS']).toBe(8);
  expect(result.events['STOP:ERROR'] ?? 0).toBe(options.errors ?? 0);
  expect(result.account_active).toBe(true);
  expect(result.health).toBe('healthy');
  return result;
}

describe.skipIf(!url)('the rule simulator', { timeout: 300_000 }, () => {
  it('follows the cheat sheet on the NL day', async () => {
    const result = await scenario('nl_day');
    assertFollowsTheSheet(result);
    assertSummary(result, {
      sheet_stops: 8, delay_median: 12.0, delay_max: 12.0, spent: 54.1, sheet: 48.5, over_sheet: 5.6, no_rules: 163.2,
      manual: { 15: 54.45, 30: 59.1, 60: 76.2 },
    });
    expect([result.meta_posts, result.meta_changes]).toEqual([8, 8]);
    expect(result.events).toEqual({ 'STOP_CONFIRMATION_STARTED:WAITING': 8, 'STOP:SUCCESS': 8 });
  });

  it('follows the cheat sheet for fast spenders', async () => {
    const result = await scenario('fast_day');
    assertFollowsTheSheet(result);
    // With a 5-minute confirmation fast spenders cost more than a buyer
    // looking every 15 minutes: the confirmation is paid at $0.25-0.40/min.
    assertSummary(result, {
      sheet_stops: 5, delay_median: 12.0, delay_max: 12.5, spent: 49.0, sheet: 29.5, over_sheet: 19.5, no_rules: 150.0,
      manual: { 15: 46.5, 30: 57.0, 60: 96.0 },
    });
  });

  it('costs less with a short confirmation', async () => {
    const result = await scenario('fast_day_confirm2');
    assertFollowsTheSheet(result);
    expect(result.summary.spent).toBeLessThan(49.0);
    expect(result.summary.delay_max!).toBeLessThan(12.0);
  });

  it('stops early on conversions reported late', async () => {
    const result = await scenario('late_events');
    // A lead or click reported 15 min after the spend is not seen at the
    // threshold: Buyerly stops two ad sets the sheet keeps longer. A buyer
    // in Ads Manager sees the same numbers and does the same.
    assertSummary(result, {
      sheet_stops: 4, buyerly_stops: 4, matched: 4, same_rule: 2, missed: 0, extra: 0, early: 2, double_writes: 0,
      spent: 19.4, sheet: 29.0, manual: { 15: 16.5, 30: 21.0, 60: 36.0 },
    });
    expect(row(result, 'late_lead_395').buyerly_stop).toBe(4.6);
    expect(row(result, 'late_click_290').buyerly_stop).toBe(3.6);
  });

  it('restores on undo and holds for the day', async () => {
    const result = await scenario('undo');
    expect(result.undo.attempts!.map((a) => [a.ok, a.already_reverted, a.posts])).toEqual([[true, false, 1], [true, true, 0]]);
    const dead = row(result, 'nl_dead_fast');
    expect(dead.final_status).toBe('ACTIVE');
    // Stopped once; after the undo the rule leaves it alone all day.
    expect([dead.stop_success_events, dead.meta_pauses]).toEqual([1, 1]);
    expect(result.events['UNDO_ACTION:SUCCESS']).toBe(1);
    expect([result.meta_posts, result.meta_changes]).toEqual([9, 9]);
  });

  it('retries a 429', async () => {
    await assertFault('meta_429', { posts: 9 });
  });

  it('survives three 503s', async () => {
    const result = await assertFault('meta_503', { posts: 11, errors: 1 });
    // The failed stop is retried after a new confirmation: 8 more minutes.
    const dead = row(result, 'nl_dead_fast');
    expect([dead.buyerly_stop, dead.inbox_delay_minutes]).toEqual([5.0, 20.0]);
  });

  it('handles a timeout before the write', async () => {
    await assertFault('timeout_before', { posts: 9 });
  });

  it('handles a timeout after the write', async () => {
    await assertFault('timeout_after', { posts: 9 });
  });

  it('confirms a write whose retries all time out', async () => {
    // Meta paused it although every attempt timed out: one read confirms
    // it, Inbox shows the stop (with Undo), no error and no repeat.
    await assertFault('timeout_after_all', { posts: 10 });
  });

  it('deactivates the account on an expired token', async () => {
    const result = await scenario('token_expired');
    expect([result.meta_posts, result.meta_changes]).toEqual([1, 0]);
    expect(result.events).toEqual({ 'STOP_CONFIRMATION_STARTED:WAITING': 1, 'STOP:ERROR': 1, 'TOKEN_EXPIRED:ERROR': 1 });
    expect(result.account_active).toBe(false);
    expect(result.health).toBe('critical');
  });

  it('restarts a today sheet at midnight (#384)', async () => {
    // Launched at 22:30, the sheet's cut falls after midnight. Read with
    // `today`, the account's new day starts every ad set from zero.
    const result = await scenario('midnight_today');
    expect(result.insight_presets).toEqual(['today']);
    // Before midnight `today` is the whole life of the ad set: same stop.
    const fast = row(result, 'eve_dead_fast');
    expect([fast.buyerly_rule, fast.sheet_rule]).toEqual(['$3 and no click', '$3 and no click']);
    // $2.70 at midnight, then a second round of money: never stopped.
    expect(row(result, 'eve_dead_slow').buyerly_stop).toBeNull();
    // Its clicks were yesterday, so today reads "no click" and it is
    // stopped late by the wrong rule.
    const noLead = row(result, 'eve_no_lead');
    expect(noLead.sheet_rule).toBe('$4 and no lead');
    expect(noLead.buyerly_rule).toBe('$3 and no click');
    expect(noLead.overshoot!).toBeGreaterThan(2.5);
    // The converting ad set is stopped for having no click "today".
    const winner = row(result, 'eve_winner');
    expect(winner.sheet_stop).toBeNull();
    expect(winner.buyerly_stop).not.toBeNull();
    assertSummary(result, { sheet_stops: 3, missed: 1, extra: 1, double_writes: 0 });
  });

  it('stops on time across midnight with a lifetime sheet', async () => {
    const result = await scenario('midnight_lifetime');
    expect(result.insight_presets).toEqual(['maximum', 'today']);
    assertFollowsTheSheet(result);
    assertSummary(result, { sheet_stops: 3 });
    expect(row(result, 'eve_winner').buyerly_stop).toBeNull();
    for (const id of ['eve_dead_slow', 'eve_no_lead']) expect(row(result, id).overshoot!).toBeLessThanOrEqual(0.6);
  });

  it('records an undo whose write timed out after Meta applied it', async () => {
    const result = await scenario('undo_timeout_after');
    // The first try fails after three writes; the retry sees Meta already
    // undone and records it without writing; a third press is a no-op.
    expect(result.undo.attempts!.map((a) => [a.ok, a.already_reverted ?? null, a.posts])).toEqual([[false, null, 3], [true, false, 0], [true, true, 0]]);
    const dead = row(result, 'nl_dead_fast');
    expect([dead.final_status, dead.stop_success_events]).toEqual(['ACTIVE', 1]);
    expect(result.events['UNDO_ACTION:SUCCESS']).toBe(1);
  });
});

// Proof of the port, run while scripts/rule_simulator.py still existed: the
// same scenarios through both simulators print the same tables (the retry
// backoff seconds carry Meta-style jitter in Python and are left out).
describe.skipIf(!url)('parity with the Python simulator', { timeout: 900_000 }, () => {
  const normalized = (text: string) => text.replace(/backoff [\d.]+ s/g, 'backoff N s').trim();
  const python = (name: string) =>
    new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
      const child = spawn(PYTHON, ['-m', 'scripts.rule_simulator', '--scenario', name], {
        cwd: REPO,
        env: { ...process.env, PYTHONPATH: REPO, TEST_DATABASE_DISPOSABLE: 'buyerly_test', DATABASE_URL: url.replace(/^postgres(ql)?:/, 'postgresql+asyncpg:'), TEST_DATABASE_URL: url.replace(/^postgres(ql)?:/, 'postgresql+asyncpg:') },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      child.on('error', (error) => resolve({ status: null, stdout, stderr: String(error) }));
      child.on('close', (status) => resolve({ status, stdout, stderr }));
    });

  for (const name of Object.keys(SCENARIOS)) {
    it(`prints the same ${name} table`, async () => {
      const run = await python(name);
      if (run.status !== 0) {
        if (process.env.CI) throw new Error(`Python failed: ${run.stderr}`);
        return;
      }
      const ours = render(await simulate(name));
      expect(normalized(ours)).toBe(normalized(run.stdout));
    });
  }
});
