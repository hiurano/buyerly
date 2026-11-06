// What the rules do to one ad account in one monitoring cycle, decided
// without acting (#611 stage 4): the part of scheduler/worker.py run_cycle
// from the due rules to the Meta write, line for line. Given the entities and
// their metric windows, the due rules, today's undos and manual turn-ons, and
// the account's rule execution slots (rule_execution_states) as they stood
// before the check, it returns every rule's outcome on every entity (the
// rule_entity_states rows), the actions to send to Meta and the slot and
// history writes that go with them.
//
// Pure: no database, no Meta, no clock. The shadow run (shadow.ts) feeds it
// the inputs Python's cycle captured (rules/shadow.py) and compares; acting
// on the decision is a separate step, not ported yet; nothing acts until the switch
// (docs/DEPLOYMENT.md, "Rules engine switch").

import { createHash } from 'node:crypto';
import { accountClock, localNow } from '../worker/day-boundary.ts';
import { check, evaluateAll, pyEquals, pyInt, yieldedRule, type RuleAction, type RuleCheck, type RuleEvaluationResult, type YieldedRule } from './engine.ts';
import { isMapping, pyFloat, pyStr, type Rule } from './validation.ts';

// scheduler/worker.py PENDING_RECONCILIATION_SECONDS
export const PENDING_RECONCILIATION_SECONDS = 15 * 60;

const RULE_ACTION_BY_TYPE: Record<string, RuleAction> = {
  turn_off: 'STOP',
  notify_only: 'NOTIFY_ONLY',
  turn_on: 'AUTO_REACTIVATE',
  increase_budget: 'INCREASE_BUDGET',
  decrease_budget: 'DECREASE_BUDGET',
};

// RULE_ACTION_BY_TYPE.get(str(rule.get("action") or ""))
const ruleActionOf = (value: unknown): RuleAction | undefined => {
  const type = truthyText(value, '');
  return Object.hasOwn(RULE_ACTION_BY_TYPE, type) ? RULE_ACTION_BY_TYPE[type] : undefined;
};

export interface DecisionAccount {
  account_id: string;
  owner_user_id?: number | null;
  workspace_id: number | null;
  currency: unknown;
  rules_enabled: boolean;
  timezone_name: string | null;
}

// A rule_execution_states row, the columns the decision reads.
export interface ExecutionState {
  execution_key: string;
  entity_id: string;
  action: string;
  status: string;
  last_attempt_at: number | null;
  last_success_at: number | null;
  after_state: unknown;
  details: unknown;
  // The rest of the row, which the decision writes but never reads (absent
  // in the shadow captures).
  before_state?: unknown;
  correlation_id?: string;
  owner_user_id?: number | null;
  entity_level?: string;
  adset_id?: string;
  rule_key?: string;
  // Not stored yet: the cycle inserts it.
  is_new?: boolean;
}

export interface DecisionInput {
  cycle_id: string;
  account: DecisionAccount;
  now: number;
  stop_confirmation_minutes: number;
  critical_interval: number;
  due_rules: Rule[];
  entities: Record<string, unknown>[];
  entity_windows: Record<string, Record<string, Record<string, unknown>>>;
  // Before the manual turn-ons are added as undone stops.
  undone_actions: Record<string, string[]>;
  manual_enables: Record<string, string>;
  execution_states: ExecutionState[];
}

// A rule_entity_states row as _rule_outcomes and _note_outcome build it.
export interface RuleOutcome {
  rule_id: number;
  entity_level: string;
  entity_id: string;
  entity_name: string;
  campaign_id: string;
  state: string;
  detail: string | null;
  wait_until: number | null;
  yielded_to_rule_id: unknown;
  yielded_to_rule_name: unknown;
  acted_at: number | null;
}

export type DesiredState = { status: string } | { daily_budget: number };

// An action claimed for this cycle: the Meta write (none for an alert or a
// proposal) and its history entry.
export interface IntendedAction {
  evaluation: RuleEvaluationResult;
  execution_key: string;
  rule_key: string;
  observed_state: Record<string, unknown>;
  desired_state: Record<string, unknown>;
  // The entity as the snapshot showed it (status, budget).
  entity: Record<string, unknown>;
}

// A history entry the decision writes without acting (scheduler/worker.py
// _persist_audit_event calls outside the action branches).
export interface DecisionEvent {
  event_type: 'STOP_CONFIRMATION_STARTED' | 'RULE_ACTION_RECONCILED' | 'RULE_ACTION_COOLDOWN' | 'RULE_ACTION_PENDING';
  evaluation: RuleEvaluationResult;
  execution_key: string;
  observed_state: Record<string, unknown>;
  desired_state: Record<string, unknown>;
}

export interface Decision {
  outcomes: RuleOutcome[];
  actions: IntendedAction[];
  events: DecisionEvent[];
  // Execution slots as the decision leaves them, by key (only the touched ones).
  states: Map<string, ExecutionState>;
  stats: { actions_skipped: number; actions_reconciled: number; stop_confirmations_waiting: number };
}

// ---------------------------------------------------------------------------
// Keys

// json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
// of a JSON value. A whole number prints as an int: the stored rule keeps
// what the editor saved, and both servers save ints for whole values.
export function pyJsonSorted(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'number') return pyStr(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(pyJsonSorted).join(',')}]`;
  if (isMapping(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${pyJsonSorted(value[key])}`).join(',')}}`;
  }
  return 'null';
}

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

// MonitoringWorker._evaluation_rule_key
export function evaluationRuleKey(evaluation: RuleEvaluationResult): string {
  if (evaluation.rule_id !== null && evaluation.rule_id !== undefined) return pyStr(evaluation.rule_id);
  const fingerprint = pyJsonSorted({ name: evaluation.rule_name, conditions: evaluation.conditions_snapshot });
  return `inline-${sha256(fingerprint).slice(0, 16)}`;
}

// MonitoringWorker._execution_key
export function executionKey(accountId: string, evaluation: RuleEvaluationResult): { key: string; ruleKey: string } {
  const ruleKey = evaluationRuleKey(evaluation);
  const raw = [accountId, pyStr(evaluation.entity_id), ruleKey, evaluation.action].join(':');
  return { key: `rule-action:${sha256(raw)}`, ruleKey };
}

// ---------------------------------------------------------------------------
// The account's day

const offsetAt = (zone: string, ms: number): number => localNow(zone, new Date(ms)).offsetMinutes * 60_000;

// The instant a local midnight falls on, as zoneinfo resolves it (fold=0:
// the earlier offset when the clock repeats or skips it). `dayOffset` 0 is
// the account's current day, 1 the next.
function accountMidnight(timezoneName: string | null, now: number, dayOffset: number): number {
  const clock = accountClock(timezoneName);
  const zone = clock?.canonical ?? 'UTC';
  const today = localNow(zone, new Date(now * 1000)).date;
  const [year, month, day] = today.split('-').map(Number);
  const naive = Date.UTC(year, month - 1, day + dayOffset);
  const before = offsetAt(zone, naive - 36 * 3600_000);
  const after = offsetAt(zone, naive + 36 * 3600_000);
  let instant = naive - before;
  if (before !== after && offsetAt(zone, instant) !== before) {
    const later = naive - after;
    if (offsetAt(zone, later) === after) instant = later;
  }
  return instant / 1000;
}

// MonitoringWorker._account_day_end: the midnight that ends the ad account's current day.
export const accountDayEnd = (timezoneName: string | null, now: number): number => accountMidnight(timezoneName, now, 1);

// MonitoringWorker._account_day_start: the midnight that began it.
export const accountDayStart = (timezoneName: string | null, now: number): number => accountMidnight(timezoneName, now, 0);

// ---------------------------------------------------------------------------
// The decision

// MonitoringWorker._json_dict: a mapping, or JSON text holding one (json.loads(value or "{}")).
function jsonDict(value: unknown): Record<string, unknown> {
  if (isMapping(value)) return value;
  if (typeof value !== 'string' && value !== null && value !== undefined && value !== 0 && value !== false) return {};
  try {
    const parsed: unknown = JSON.parse(typeof value === 'string' && value ? value : '{}');
    return isMapping(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// MonitoringWorker._state_matches
export function stateMatches(observed: Record<string, unknown>, desired: Record<string, unknown>): boolean {
  if ('status' in desired) return pyStr(observed.status ?? '').toUpperCase() === pyStr(desired.status).toUpperCase();
  if ('daily_budget' in desired) {
    try {
      if (observed.daily_budget === undefined || observed.daily_budget === null) return false;
      return Math.abs(pyFloat(observed.daily_budget) - pyFloat(desired.daily_budget)) < 0.01;
    } catch {
      return false;
    }
  }
  return pyEquals(observed, desired);
}

// float(x or 0.0)
const floatOr0 = (value: unknown): number => (value === null || value === undefined || value === 0 || value === '' || value === false ? 0 : pyFloat(value));
// max(0, int(x or 0))
const nonNegativeInt = (value: unknown): number => Math.max(0, value === null || value === undefined || value === 0 || value === '' || value === false ? 0 : pyInt(value));

const isPyInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

// One entity's turn in the cycle: its rules' outcomes and the evaluations
// that may act on it, in order (_entity_actions_to_run).
export interface EntityPlan {
  entity: Record<string, unknown>;
  entity_id: string;
  outcomes: Map<number, RuleOutcome>;
  evaluations: RuleEvaluationResult[];
}

// What one evaluation comes to: nothing (skipped, a history entry, or an
// action claimed for the Meta write. A claimed action leaves its slot PENDING
// until `settle` says how the write went.
export type DecisionStep = { kind: 'skipped' } | { kind: 'event'; event: DecisionEvent } | { kind: 'act'; action: IntendedAction };

// The decision taken one step at a time, so the cycle can act on Meta between
// the steps in the order Python's run_cycle does (the slots a step touches
// are written before the next one, as Python commits them).
export interface Decider {
  plan(entity: Record<string, unknown>): EntityPlan;
  step(plan: EntityPlan, evaluation: RuleEvaluationResult): DecisionStep;
  // _finish_execution and the outcome it leaves: null for a write that landed.
  settle(plan: EntityPlan, action: IntendedAction, error: string | null): void;
  // The slots touched since the last call.
  takeDirty(): ExecutionState[];
  readonly outcomes: RuleOutcome[];
  readonly events: DecisionEvent[];
  readonly actions: IntendedAction[];
  readonly touched: Map<string, ExecutionState>;
  readonly stats: Decision['stats'];
}

export function decide(input: DecisionInput): Decision {
  const decider = createDecider(input);
  for (const entity of input.entities) {
    const plan = decider.plan(entity);
    for (const evaluation of plan.evaluations) {
      const step = decider.step(plan, evaluation);
      // As if the write lands: the slot succeeds now.
      if (step.kind === 'act') decider.settle(plan, step.action, null);
    }
  }
  return { outcomes: decider.outcomes, actions: decider.actions, events: decider.events, states: decider.touched, stats: decider.stats };
}

export function createDecider(input: DecisionInput): Decider {
  const { account, now } = input;
  const accountId = account.account_id;
  const engineAccount = { rules_enabled: account.rules_enabled, workspace_id: account.workspace_id, currency: account.currency };
  const stopConfirmationSeconds = input.stop_confirmation_minutes * 60;
  const maxGapSeconds = Math.max(180, input.critical_interval * 60 * 3);
  const dayEnd = accountDayEnd(account.timezone_name, now);
  const dueRules = input.due_rules;

  const states = new Map<string, ExecutionState>(input.execution_states.map((row) => [row.execution_key, { ...row }]));
  const touched = new Map<string, ExecutionState>();
  const dirty = new Map<string, ExecutionState>();
  const touch = (state: ExecutionState): void => {
    touched.set(state.execution_key, state);
    dirty.set(state.execution_key, state);
  };
  const slot = (evaluation: RuleEvaluationResult): { key: string; ruleKey: string; state: ExecutionState } => {
    const { key, ruleKey } = executionKey(accountId, evaluation);
    let state = states.get(key);
    if (!state) {
      state = {
        execution_key: key,
        entity_id: pyStr(evaluation.entity_id),
        action: evaluation.action,
        status: 'IDLE',
        last_attempt_at: 0,
        last_success_at: null,
        after_state: {},
        details: {},
        before_state: {},
        correlation_id: '',
        owner_user_id: account.owner_user_id ?? null,
        entity_level: evaluation.entity_level,
        adset_id: evaluation.entity_level === 'adset' ? pyStr(evaluation.entity_id) : '',
        rule_key: ruleKey,
        is_new: true,
      };
      states.set(key, state);
    }
    touch(state);
    return { key, ruleKey, state };
  };
  const existing = (evaluation: RuleEvaluationResult): ExecutionState | undefined => states.get(executionKey(accountId, evaluation).key);

  // _cooldown_until
  const cooldownUntil = (evaluation: RuleEvaluationResult): number | null => {
    const seconds = nonNegativeInt(evaluation.cooldown_minutes) * 60;
    if (seconds <= 0) return null;
    const state = existing(evaluation);
    if (state && state.status !== 'PENDING' && state.last_success_at !== null && now - state.last_success_at < seconds) {
      return state.last_success_at + seconds;
    }
    return null;
  };

  const undone = new Map<string, Set<string>>(Object.entries(input.undone_actions).map(([id, actions]) => [id, new Set(actions)]));
  const stopRulesDue = dueRules.some((rule) => ['turn_off', 'stop', 'pause'].includes(truthyText(rule.action, '').toLowerCase()));
  for (const heldId of Object.keys(input.manual_enables)) {
    if (!undone.has(heldId)) undone.set(heldId, new Set());
    undone.get(heldId)!.add('STOP');
  }

  // _rules_not_undone
  const rulesNotUndone = (held: Set<string> | undefined): Rule[] => {
    if (!held || !held.size) return dueRules;
    return dueRules.filter((rule) => {
      const action = ruleActionOf(rule.action);
      return action === undefined || !held.has(action);
    });
  };

  // _entity_actions_to_run
  const actionsToRun = (candidates: RuleEvaluationResult[]): RuleEvaluationResult[] => {
    const changes = candidates.filter((item) => item.action !== 'NOTIFY_ONLY');
    const alerts = candidates.filter((item) => item.action === 'NOTIFY_ONLY');
    if (!changes.length) return alerts;
    let chosen = 0;
    for (let index = 0; index < changes.length; index += 1) {
      if (cooldownUntil(changes[index]) === null) {
        chosen = index;
        break;
      }
    }
    const change = changes[chosen];
    change.yielded_rules = [...changes.slice(chosen + 1).map(yieldedRule), ...change.yielded_rules];
    return [change, ...alerts];
  };

  // _rule_outcomes
  const ruleOutcomes = (entity: Record<string, unknown>, checks: RuleCheck[], candidates: RuleEvaluationResult[], chosen: RuleEvaluationResult[], held: Set<string> | undefined, manualEnable: string | undefined): Map<number, RuleOutcome> => {
    const chosenChange = chosen.find((item) => item.action !== 'NOTIFY_ONLY');
    const chosenIds = chosen.map((item) => item.rule_id);
    const candidatesById = new Map<unknown, RuleEvaluationResult>();
    for (const candidate of candidates) candidatesById.set(candidate.rule_id, candidate);
    const outcomes = new Map<number, RuleOutcome>();
    for (const item of checks) {
      const ruleId = item.rule.preset_id;
      if (!isPyInt(ruleId) || outcomes.has(ruleId)) continue;
      const outcome: RuleOutcome = {
        rule_id: ruleId,
        entity_level: truthyText(entity.entity_level, 'adset'),
        entity_id: truthyText(entity.entity_id, ''),
        entity_name: truthyText(entity.entity_name, ''),
        campaign_id: truthyText(entity.campaign_id, ''),
        state: item.outcome,
        detail: item.detail,
        wait_until: null,
        yielded_to_rule_id: null,
        yielded_to_rule_name: '',
        acted_at: null,
      };
      outcomes.set(ruleId, outcome);
      if (item.outcome !== 'matched' || chosenIds.some((id) => pyEquals(id, ruleId))) continue;
      const action = ruleActionOf(item.rule.action);
      if (held && action !== undefined && held.has(action)) {
        outcome.state = 'undone';
        outcome.wait_until = dayEnd;
        outcome.detail = manualEnable && action === 'STOP' ? manualEnable : '';
        continue;
      }
      const candidate = candidatesById.get(ruleId);
      if (candidate) {
        const until = cooldownUntil(candidate);
        if (until !== null) {
          outcome.state = 'cooldown';
          outcome.wait_until = until;
          continue;
        }
      }
      outcome.state = 'yielded';
      if (chosenChange) {
        outcome.yielded_to_rule_id = chosenChange.rule_id;
        outcome.yielded_to_rule_name = chosenChange.rule_name;
      }
    }
    return outcomes;
  };

  // _note_outcome
  const note = (outcomes: Map<number, RuleOutcome>, evaluation: RuleEvaluationResult, state: string, extra: { detail?: string; wait_until?: number | null; acted_at?: number | null } = {}): void => {
    if (evaluation.rule_id === null || evaluation.rule_id === undefined) return;
    const outcome = [...outcomes.entries()].find(([id]) => pyEquals(id, evaluation.rule_id))?.[1];
    if (!outcome) return;
    outcome.state = state;
    outcome.wait_until = extra.wait_until ?? null;
    if (extra.detail !== undefined) outcome.detail = extra.detail;
    if (extra.acted_at !== undefined && extra.acted_at !== null) outcome.acted_at = extra.acted_at;
  };

  // _reset_stop_confirmations
  const resetStopConfirmations = (entityId: string, keepKey: string | null): void => {
    for (const state of states.values()) {
      if (state.entity_id !== entityId || state.action !== 'STOP' || state.status !== 'STOP_CONFIRMING') continue;
      if (keepKey && state.execution_key === keepKey) continue;
      state.status = 'IDLE';
      state.correlation_id = input.cycle_id;
      state.details = { cancelled_at: now, reason: 'stop_condition_no_longer_matched' };
      touch(state);
    }
  };

  // _confirm_stop_evaluation
  const confirmStop = (evaluation: RuleEvaluationResult): { confirmed: boolean; reason: string; state: ExecutionState | null } => {
    if (stopConfirmationSeconds <= 0) return { confirmed: true, reason: 'disabled', state: null };
    const { state } = slot(evaluation);
    if (state.status === 'PENDING') return { confirmed: true, reason: 'execution_pending', state };
    const details = jsonDict(state.details);
    let firstSeenAt: number;
    let lastSeenAt: number;
    let observations: number;
    try {
      firstSeenAt = floatOr0(details.first_seen_at);
      lastSeenAt = floatOr0(details.last_seen_at);
      observations = details.observations === null || details.observations === undefined || details.observations === 0 ? 0 : pyInt(details.observations);
    } catch {
      firstSeenAt = 0;
      lastSeenAt = 0;
      observations = 0;
    }
    const continuous = state.status === 'STOP_CONFIRMING' && firstSeenAt > 0 && lastSeenAt > 0 && now >= lastSeenAt && now - lastSeenAt <= Math.max(1, maxGapSeconds);
    if (!continuous) {
      state.status = 'STOP_CONFIRMING';
      state.owner_user_id = account.owner_user_id ?? null;
      state.correlation_id = input.cycle_id;
      state.last_attempt_at = now;
      state.before_state = { status: 'ACTIVE' };
      state.after_state = { status: 'PAUSED' };
      state.details = { first_seen_at: now, last_seen_at: now, observations: 1, confirmation_seconds: stopConfirmationSeconds };
      return { confirmed: false, reason: 'started', state };
    }
    observations += 1;
    state.last_attempt_at = now;
    state.details = { first_seen_at: firstSeenAt, last_seen_at: now, observations, confirmation_seconds: stopConfirmationSeconds };
    if (now - firstSeenAt < stopConfirmationSeconds) return { confirmed: false, reason: 'waiting', state };
    state.status = 'IDLE';
    state.details = { confirmed_at: now, first_seen_at: firstSeenAt, observations, confirmation_seconds: stopConfirmationSeconds };
    return { confirmed: true, reason: 'confirmed', state };
  };

  // _claim_execution
  const claim = (evaluation: RuleEvaluationResult, observed: Record<string, unknown>, desired: Record<string, unknown>): { claimed: boolean; reason: string; state: ExecutionState } => {
    const { state } = slot(evaluation);
    if (state.status === 'PENDING') {
      if (stateMatches(observed, jsonDict(state.after_state))) {
        state.status = 'SUCCESS';
        state.last_success_at = state.last_attempt_at || now;
        state.details = { reconciled_after_restart: true };
        return { claimed: false, reason: 'reconciled', state };
      }
      if (now - (state.last_attempt_at || 0) < PENDING_RECONCILIATION_SECONDS) return { claimed: false, reason: 'pending', state };
      state.status = 'ERROR';
      state.details = { reason: 'stale_pending_not_confirmed' };
    }
    const cooldownSeconds = nonNegativeInt(evaluation.cooldown_minutes) * 60;
    if (cooldownSeconds > 0 && state.last_success_at !== null && now - state.last_success_at < cooldownSeconds) {
      return { claimed: false, reason: 'cooldown', state };
    }
    state.owner_user_id = account.owner_user_id ?? null;
    state.status = 'PENDING';
    state.correlation_id = input.cycle_id;
    state.last_attempt_at = now;
    state.before_state = observed;
    state.after_state = desired;
    state.details = {};
    return { claimed: true, reason: 'claimed', state };
  };

  const allOutcomes: RuleOutcome[] = [];
  const actions: IntendedAction[] = [];
  const events: DecisionEvent[] = [];
  const stats = { actions_skipped: 0, actions_reconciled: 0, stop_confirmations_waiting: 0 };

  const plan = (entity: Record<string, unknown>): EntityPlan => {
    const entityId = pyStr(entity.entity_id);
    const windows = input.entity_windows[entityId] ?? {};
    const held = undone.get(entityId);
    const candidates = evaluateAll(entity, engineAccount, windows, rulesNotUndone(held));
    const entityActions = actionsToRun(candidates);
    const outcomes = ruleOutcomes(entity, check(entity, engineAccount, windows, dueRules), candidates, entityActions, held, input.manual_enables[entityId]);
    allOutcomes.push(...outcomes.values());
    if (!entityActions.length) {
      if (stopRulesDue) resetStopConfirmations(entityId, null);
    } else if (stopRulesDue) {
      const keep = entityActions[0].action === 'STOP' ? executionKey(accountId, entityActions[0]).key : null;
      resetStopConfirmations(entityId, keep);
    }
    return { entity, entity_id: entityId, outcomes, evaluations: entityActions };
  };

  const step = ({ entity, outcomes }: EntityPlan, evaluation: RuleEvaluationResult): DecisionStep => {
    const currentBudget = floatOr0(entity.daily_budget ?? 0);
    const status = 'status' in entity ? entity.status : 'UNKNOWN';
    let observed: Record<string, unknown>;
    let desired: Record<string, unknown>;
    if (evaluation.action === 'STOP') {
      observed = { status };
      desired = { status: 'PAUSED' };
    } else if (evaluation.action === 'AUTO_REACTIVATE') {
      observed = { status };
      desired = { status: 'ACTIVE' };
    } else if (evaluation.action === 'INCREASE_BUDGET' || evaluation.action === 'DECREASE_BUDGET') {
      if (currentBudget <= 0 || evaluation.budget_change_percent <= 0) {
        stats.actions_skipped += 1;
        note(outcomes, evaluation, 'skipped', { detail: 'No daily budget to change at this level' });
        return { kind: 'skipped' };
      }
      let newBudget: number;
      if (evaluation.action === 'INCREASE_BUDGET') {
        newBudget = currentBudget * (1 + evaluation.budget_change_percent / 100.0);
        if (evaluation.budget_max_daily > 0) newBudget = Math.min(newBudget, evaluation.budget_max_daily);
      } else {
        newBudget = Math.max(currentBudget * (1 - evaluation.budget_change_percent / 100.0), 1.0);
      }
      observed = { daily_budget: currentBudget };
      desired = { daily_budget: newBudget };
    } else {
      observed = { status };
      desired = { ...observed };
    }

    const until = cooldownUntil(evaluation);
    if (until !== null) {
      stats.actions_skipped += 1;
      note(outcomes, evaluation, 'cooldown', { wait_until: until });
      return { kind: 'skipped' };
    }

    if (evaluation.action === 'STOP') {
      const confirmation = confirmStop(evaluation);
      if (!confirmation.confirmed) {
        stats.actions_skipped += 1;
        stats.stop_confirmations_waiting += 1;
        const since = confirmation.state ? jsonDict(confirmation.state.details).first_seen_at : undefined;
        note(outcomes, evaluation, 'confirming', {
          wait_until: typeof since === 'number' ? since + input.stop_confirmation_minutes * 60 : null,
        });
        if (confirmation.reason === 'started' && confirmation.state) {
          const event: DecisionEvent = { event_type: 'STOP_CONFIRMATION_STARTED', evaluation, execution_key: confirmation.state.execution_key, observed_state: observed, desired_state: desired };
          events.push(event);
          return { kind: 'event', event };
        }
        return { kind: 'skipped' };
      }
    }

    const claimed = claim(evaluation, observed, desired);
    if (!claimed.claimed) {
      stats.actions_skipped += 1;
      if (claimed.reason === 'reconciled') {
        stats.actions_reconciled += 1;
        note(outcomes, evaluation, 'fired', { acted_at: claimed.state.last_success_at });
      } else if (claimed.reason === 'cooldown') {
        note(outcomes, evaluation, 'cooldown', { wait_until: (claimed.state.last_success_at || now) + nonNegativeInt(evaluation.cooldown_minutes) * 60 });
      } else {
        note(outcomes, evaluation, 'pending');
      }
      const eventType = claimed.reason === 'reconciled' ? 'RULE_ACTION_RECONCILED' : claimed.reason === 'cooldown' ? 'RULE_ACTION_COOLDOWN' : 'RULE_ACTION_PENDING';
      const event: DecisionEvent = { event_type: eventType, evaluation, execution_key: claimed.state.execution_key, observed_state: observed, desired_state: desired };
      events.push(event);
      return { kind: 'event', event };
    }

    const { ruleKey } = executionKey(accountId, evaluation);
    const action: IntendedAction = { evaluation, execution_key: claimed.state.execution_key, rule_key: ruleKey, observed_state: observed, desired_state: desired, entity };
    actions.push(action);
    return { kind: 'act', action };
  };

  const settle = ({ outcomes }: EntityPlan, action: IntendedAction, error: string | null): void => {
    const state = states.get(action.execution_key)!;
    const { evaluation } = action;
    if (error === null) {
      state.status = 'SUCCESS';
      state.last_success_at = now;
      state.details = {};
      const cooldownSeconds = nonNegativeInt(evaluation.cooldown_minutes) * 60;
      note(outcomes, evaluation, 'fired', { acted_at: now, wait_until: cooldownSeconds ? now + cooldownSeconds : null });
    } else {
      state.status = 'ERROR';
      state.details = { error };
      note(outcomes, evaluation, 'error', { detail: error || 'Meta rejected the action' });
    }
    touch(state);
  };

  const takeDirty = (): ExecutionState[] => {
    const taken = [...dirty.values()];
    dirty.clear();
    return taken;
  };

  return { plan, step, settle, takeDirty, outcomes: allOutcomes, events, actions, touched, stats };
}

// str(x or fallback)
function truthyText(value: unknown, fallback: string): string {
  if (value === null || value === undefined || value === '' || value === 0 || value === false) return fallback;
  return pyStr(value);
}

export type { YieldedRule };
