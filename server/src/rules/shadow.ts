// The rules engine's shadow run (#611 stage 4): the TypeScript engine decides
// beside Python's on the same data and the two decisions are compared,
// before the TypeScript one may act on Meta.
//
// Python's monitoring cycle writes one capture per ad account whose rules
// were due (rules/shadow.py): the decision's inputs and what Python decided.
// The worker job `rules_shadow` reads them, runs decide.ts on the inputs,
// compares, counts the result per day in Redis, keeps every mismatch with the
// slice of input that explains it, and deletes the capture. Nothing here
// touches Meta or the business tables. `node server/dist/rules/shadow-report.js`
// prints the match statistics (docs/DEPLOYMENT.md, "Rules engine switch").

import { readdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { Redis } from 'ioredis';
import { pyEquals } from './engine.ts';
import { decide, type Decision, type DecisionInput, type RuleOutcome } from './decide.ts';

export const SHADOW_PREFIX = 'buyerly:rules-shadow';
export const SINCE_KEY = `${SHADOW_PREFIX}:since`;
export const MISMATCHES_KEY = `${SHADOW_PREFIX}:mismatches`;
export const dayKey = (day: string): string => `${SHADOW_PREFIX}:day:${day}`;
export const dayCyclesKey = (day: string): string => `${SHADOW_PREFIX}:day:${day}:cycles`;
const DAY_TTL_SECONDS = 90 * 24 * 3600;
const MISMATCHES_KEPT = 500;
const CAPTURES_PER_RUN = 300;

export interface PythonAction {
  entity_level: string;
  entity_id: string;
  rule_id: unknown;
  rule_name: unknown;
  action: string;
  reason: string;
  yielded_rules: unknown;
  observed_state: Record<string, unknown>;
  desired_state: Record<string, unknown>;
}

export interface Capture extends DecisionInput {
  version: number;
  // A cycle in which no account's rules were due (rules/shadow.py finish_cycle).
  marker?: boolean;
  python: { outcomes: RuleOutcome[]; actions: PythonAction[]; stopped_early: boolean };
}

export interface Difference {
  kind: 'outcome' | 'action';
  key: string;
  entity_id: string;
  field: string;
  python: unknown;
  ts: unknown;
  // Why the difference is not the engine's: Python's Meta write failed, or a
  // refused token cut its check short. Empty for an unexplained mismatch.
  explained: string;
}

export interface Comparison {
  decision: Decision;
  differences: Difference[];
  outcomes: number;
  outcomesMatched: number;
  actionsPython: number;
  actionsTs: number;
  actionsMatched: number;
}

const outcomeKey = (outcome: { rule_id: unknown; entity_level: unknown; entity_id: unknown }): string => `${String(outcome.rule_id)}:${String(outcome.entity_level)}:${String(outcome.entity_id)}`;
const actionKey = (action: { entity_level: unknown; entity_id: unknown; rule_id: unknown; action: unknown }): string =>
  `${String(action.entity_level)}:${String(action.entity_id)}:${String(action.rule_id)}:${String(action.action)}`;

// What _save_rule_states stores: `detail or ""`, `yielded_to_rule_name or ""`.
const OUTCOME_FIELDS: Array<[keyof RuleOutcome, (value: unknown) => unknown]> = [
  ['state', (value) => value],
  ['detail', (value) => value || ''],
  ['wait_until', (value) => value || null],
  ['acted_at', (value) => value || null],
  ['yielded_to_rule_id', (value) => value ?? null],
  ['yielded_to_rule_name', (value) => value || ''],
  ['entity_name', (value) => value],
  ['campaign_id', (value) => value],
];

// The TypeScript decision on a capture, against Python's.
export function compareCapture(capture: Capture): Comparison {
  const decision = decide(capture);
  const differences: Difference[] = [];
  const { stopped_early: stoppedEarly } = capture.python;

  const pythonActions = new Map(capture.python.actions.map((action) => [actionKey(action), action]));
  const tsActions = new Map(decision.actions.map((action) => [actionKey({ ...action.evaluation, entity_id: action.evaluation.entity_id }), action]));
  // Entities Python got to before a refused token stopped its check.
  const reached = new Set([...capture.python.outcomes.map((item) => String(item.entity_id)), ...capture.python.actions.map((item) => String(item.entity_id))]);
  const lateEntity = (entityId: string) => (stoppedEarly && !reached.has(entityId) ? 'stopped_early' : '');

  const python = new Map(capture.python.outcomes.map((outcome) => [outcomeKey(outcome), outcome]));
  const ts = new Map(decision.outcomes.map((outcome) => [outcomeKey(outcome), outcome]));
  let outcomesMatched = 0;
  for (const key of new Set([...python.keys(), ...ts.keys()])) {
    const left = python.get(key);
    const right = ts.get(key);
    const entityId = String((left ?? right)!.entity_id);
    if (!left || !right) {
      differences.push({ kind: 'outcome', key, entity_id: entityId, field: 'present', python: Boolean(left), ts: Boolean(right), explained: lateEntity(entityId) || (stoppedEarly ? 'stopped_early' : '') });
      continue;
    }
    // Python's write to Meta failed: the decision was the same.
    const pythonAction = [...pythonActions.values()].find((action) => String(action.entity_id) === entityId && pyEquals(action.rule_id, left.rule_id));
    if (left.state === 'error' && right.state === 'fired' && pythonAction) {
      outcomesMatched += 1;
      continue;
    }
    let same = true;
    for (const [field, normalise] of OUTCOME_FIELDS) {
      const a = normalise(left[field]);
      const b = normalise(right[field]);
      if (pyEquals(a, b)) continue;
      same = false;
      differences.push({ kind: 'outcome', key, entity_id: entityId, field, python: a, ts: b, explained: stoppedEarly ? 'stopped_early' : '' });
    }
    if (same) outcomesMatched += 1;
  }

  let actionsMatched = 0;
  for (const key of new Set([...pythonActions.keys(), ...tsActions.keys()])) {
    const left = pythonActions.get(key);
    const right = tsActions.get(key);
    const entityId = String(left?.entity_id ?? right?.evaluation.entity_id);
    if (!left || !right) {
      differences.push({ kind: 'action', key, entity_id: entityId, field: 'present', python: Boolean(left), ts: Boolean(right), explained: lateEntity(entityId) || (stoppedEarly ? 'stopped_early' : '') });
      continue;
    }
    const pairs: Array<[string, unknown, unknown]> = [
      ['desired_state', left.desired_state, right.desired_state],
      ['observed_state', left.observed_state, right.observed_state],
      ['reason', left.reason, right.evaluation.reason],
      ['rule_name', left.rule_name, right.evaluation.rule_name],
      ['yielded_rules', left.yielded_rules, right.evaluation.yielded_rules],
    ];
    let same = true;
    for (const [field, a, b] of pairs) {
      if (pyEquals(a, b)) continue;
      same = false;
      differences.push({ kind: 'action', key, entity_id: entityId, field, python: a, ts: b, explained: '' });
    }
    if (same) actionsMatched += 1;
  }

  return {
    decision,
    differences,
    outcomes: python.size,
    outcomesMatched,
    actionsPython: pythonActions.size,
    actionsTs: tsActions.size,
    actionsMatched,
  };
}

// The capture cut down to one entity: enough to replay the decision
// (decide() on it gives the same answer for that entity) and to read why.
export function captureSlice(capture: Capture, entityId: string): Capture {
  const has = (value: unknown) => String(value) === entityId;
  return {
    ...capture,
    entities: capture.entities.filter((entity) => has(entity.entity_id)),
    entity_windows: Object.hasOwn(capture.entity_windows, entityId) ? { [entityId]: capture.entity_windows[entityId] } : {},
    undone_actions: Object.hasOwn(capture.undone_actions, entityId) ? { [entityId]: capture.undone_actions[entityId] } : {},
    manual_enables: Object.hasOwn(capture.manual_enables, entityId) ? { [entityId]: capture.manual_enables[entityId] } : {},
    execution_states: capture.execution_states.filter((state) => has(state.entity_id)),
    python: {
      outcomes: capture.python.outcomes.filter((outcome) => has(outcome.entity_id)),
      actions: capture.python.actions.filter((action) => has(action.entity_id)),
      stopped_early: capture.python.stopped_early,
    },
  };
}

export const utcDay = (seconds: number): string => new Date(seconds * 1000).toISOString().slice(0, 10);

export interface DaySummary {
  day: string;
  captures: number;
  // Captures that were cycle markers: no rule due anywhere, empty on both sides.
  markers: number;
  cycles: number;
  clean: number;
  partial: number;
  capture_errors: number;
  outcomes: number;
  outcomes_matched: number;
  actions_python: number;
  actions_ts: number;
  actions_matched: number;
  unexplained: number;
  explained: number;
}

export async function readDay(redis: Redis, day: string): Promise<DaySummary> {
  const [hash, cycles] = await Promise.all([redis.hgetall(dayKey(day)), redis.pfcount(dayCyclesKey(day))]);
  const number = (field: string) => Number(hash[field] ?? 0);
  return {
    day,
    captures: number('captures'),
    markers: number('markers'),
    cycles,
    clean: number('clean'),
    partial: number('partial'),
    capture_errors: number('capture_errors'),
    outcomes: number('outcomes'),
    outcomes_matched: number('outcomes_matched'),
    actions_python: number('actions_python'),
    actions_ts: number('actions_ts'),
    actions_matched: number('actions_matched'),
    unexplained: number('unexplained'),
    explained: number('explained'),
  };
}

export interface ShadowLog {
  info: (object: object, message: string) => void;
  warn: (object: object, message: string) => void;
}

export interface ShadowRunStats {
  captures: number;
  unexplained: number;
  errors: number;
}

// One pass of the `rules_shadow` job: every capture waiting in `directory`.
export async function runRulesShadow(options: { directory: string; redis: Redis; log: ShadowLog; now?: () => number }): Promise<ShadowRunStats> {
  const { directory, redis, log } = options;
  const now = options.now ?? (() => Date.now() / 1000);
  const stats: ShadowRunStats = { captures: 0, unexplained: 0, errors: 0 };
  let names: string[];
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith('.json.gz')).sort().slice(0, CAPTURES_PER_RUN);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') names = [];
    else throw error;
  }
  for (const name of names) {
    const file = path.join(directory, name);
    let capture: Capture;
    try {
      capture = JSON.parse(gunzipSync(await readFile(file)).toString('utf8')) as Capture;
      if (capture.version !== 1) throw new Error(`capture version ${String(capture.version)}`);
    } catch (error) {
      stats.errors += 1;
      log.warn({ err: error, file: name }, 'Rules shadow: unreadable capture');
      await redis.hincrby(dayKey(utcDay(now())), 'capture_errors', 1);
      await unlink(file).catch(() => undefined);
      continue;
    }
    let comparison: Comparison;
    try {
      comparison = compareCapture(capture);
    } catch (error) {
      // The port throwing where Python did not is a mismatch of its own.
      comparison = {
        decision: { outcomes: [], actions: [], events: [], states: new Map(), stats: { actions_skipped: 0, actions_reconciled: 0, stop_confirmations_waiting: 0 } },
        differences: [{ kind: 'outcome', key: '*', entity_id: '*', field: 'exception', python: null, ts: String((error as Error).stack ?? error), explained: '' }],
        outcomes: capture.python.outcomes.length,
        outcomesMatched: 0,
        actionsPython: capture.python.actions.length,
        actionsTs: 0,
        actionsMatched: 0,
      };
    }
    await record(redis, capture, comparison, now());
    const unexplained = comparison.differences.filter((item) => !item.explained);
    stats.captures += 1;
    stats.unexplained += unexplained.length;
    if (unexplained.length) {
      log.warn({ cycle_id: capture.cycle_id, account_id: capture.account.account_id, differences: unexplained.slice(0, 5), total: unexplained.length }, 'Rules shadow: the TypeScript engine decided differently');
    }
    await unlink(file).catch(() => undefined);
  }
  await logDailySummary(redis, log, now());
  return stats;
}

async function record(redis: Redis, capture: Capture, comparison: Comparison, at: number): Promise<void> {
  const day = utcDay(capture.now);
  const unexplained = comparison.differences.filter((item) => !item.explained);
  const key = dayKey(day);
  const pipeline = redis.multi();
  pipeline.set(SINCE_KEY, String(at), 'NX');
  pipeline.hincrby(key, 'captures', 1);
  if (capture.marker) pipeline.hincrby(key, 'markers', 1);
  if (!unexplained.length) pipeline.hincrby(key, 'clean', 1);
  if (capture.python.stopped_early) pipeline.hincrby(key, 'partial', 1);
  pipeline.hincrby(key, 'outcomes', comparison.outcomes);
  pipeline.hincrby(key, 'outcomes_matched', comparison.outcomesMatched);
  pipeline.hincrby(key, 'actions_python', comparison.actionsPython);
  pipeline.hincrby(key, 'actions_ts', comparison.actionsTs);
  pipeline.hincrby(key, 'actions_matched', comparison.actionsMatched);
  pipeline.hincrby(key, 'unexplained', unexplained.length);
  pipeline.hincrby(key, 'explained', comparison.differences.length - unexplained.length);
  pipeline.expire(key, DAY_TTL_SECONDS);
  pipeline.pfadd(dayCyclesKey(day), capture.cycle_id);
  pipeline.expire(dayCyclesKey(day), DAY_TTL_SECONDS);
  for (const entityId of new Set(unexplained.map((item) => item.entity_id))) {
    const slice = entityId === '*' ? { ...capture, entities: [], entity_windows: {}, execution_states: [] } : captureSlice(capture, entityId);
    pipeline.lpush(
      MISMATCHES_KEY,
      JSON.stringify({ at, cycle_id: capture.cycle_id, account_id: capture.account.account_id, entity_id: entityId, differences: unexplained.filter((item) => item.entity_id === entityId), capture: slice }),
    );
  }
  pipeline.ltrim(MISMATCHES_KEY, 0, MISMATCHES_KEPT - 1);
  pipeline.expire(MISMATCHES_KEY, DAY_TTL_SECONDS);
  await pipeline.exec();
}

// Once per UTC day: yesterday's numbers in the worker's log.
async function logDailySummary(redis: Redis, log: ShadowLog, at: number): Promise<void> {
  const yesterday = utcDay(at - 24 * 3600);
  if (!(await redis.exists(dayKey(yesterday)))) return;
  if (!(await redis.hsetnx(dayKey(yesterday), 'summary_logged', '1'))) return;
  const summary = await readDay(redis, yesterday);
  log.info({ rules_shadow: summary, match_rate: matchRate(summary) }, 'Rules shadow daily summary');
}

// Share of the compared decisions (rule outcomes and actions) both engines made alike.
export function matchRate(summary: Pick<DaySummary, 'outcomes' | 'outcomes_matched' | 'actions_python' | 'actions_ts' | 'actions_matched'>): number | null {
  const total = summary.outcomes + Math.max(summary.actions_python, summary.actions_ts);
  if (!total) return null;
  return (summary.outcomes_matched + summary.actions_matched) / total;
}
