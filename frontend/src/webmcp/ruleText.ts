import { formatMetricMoney } from '@/components/campaigns/liveCampaigns';
import type {
  RuleAction,
  RuleConditionPayload,
  RuleExecutionLevel,
  RuleMetric,
  RuleOperator,
  RuleScope,
  RuleTimeWindow,
} from '@/lib/rules';

/**
 * A rule in the plain sentences the approval dialog shows, so the person
 * approves what will actually run rather than the agent's account of it.
 */

const METRIC_WORDS: Record<RuleMetric, string> = {
  spend: 'spend',
  cpl: 'cost per lead',
  cpreg: 'cost per registration',
  cpp: 'cost per purchase',
  leads: 'leads',
  registrations: 'registrations',
  purchases: 'purchases',
  ctr: 'CTR',
  cpc: 'cost per click',
  clicks: 'clicks',
};

const MONEY_METRICS: ReadonlySet<RuleMetric> = new Set(['spend', 'cpl', 'cpreg', 'cpp', 'cpc']);

const OPERATOR_SIGNS: Record<RuleOperator, string> = { gte: '≥', gt: '>', lte: '≤', lt: '<', eq: '=' };

const WINDOW_WORDS: Record<RuleTimeWindow, string> = {
  today: 'today',
  yesterday: 'yesterday',
  last_3d: 'over the last 3 days',
  last_7d: 'over the last 7 days',
};

export const LEVEL_NOUNS: Record<RuleExecutionLevel, string> = { adset: 'ad set', campaign: 'campaign', ad: 'ad' };

const LEVEL_SUBJECTS: Record<RuleExecutionLevel, string> = { adset: 'an ad set', campaign: 'a campaign', ad: 'an ad' };

interface DescribedRule {
  action: RuleAction;
  level: RuleExecutionLevel;
  conditions: RuleConditionPayload[];
  condition_logic: 'and' | 'or';
  cooldown_minutes: number;
  check_interval_minutes: number;
  budget_change_percent?: number;
}

/** Money in the ad account currency when it is known; a rule on its own has none. */
function formatValue(metric: RuleMetric, value: number, currency?: string): string {
  if (MONEY_METRICS.has(metric) && currency) {
    const money = formatMetricMoney(value, currency);
    if (money !== '—') return money;
  }
  return metric === 'ctr' ? `${value}%` : String(value);
}

function joinWords(parts: string[], word: string): string {
  if (parts.length < 2) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} ${word} ${parts[parts.length - 1]}`;
}

export function describeConditions(
  conditions: RuleConditionPayload[],
  logic: 'and' | 'or',
  currency?: string,
): string {
  const windows = new Set(conditions.map((condition) => condition.time_window));
  const shared = windows.size === 1 ? conditions[0].time_window : null;
  const parts = conditions.map((condition) => {
    const text = `${METRIC_WORDS[condition.metric]} ${OPERATOR_SIGNS[condition.operator]} ${formatValue(condition.metric, condition.value, currency)}`;
    return shared ? text : `${text} ${WINDOW_WORDS[condition.time_window]}`;
  });
  const joined = joinWords(parts, logic === 'or' ? 'or' : 'and');
  return shared ? `${joined} ${WINDOW_WORDS[shared]}` : joined;
}

/** "Turn off an ad set when it has spend ≥ USD 4.00 and leads = 0 today." */
export function describeRuleEffect(rule: DescribedRule, currency?: string): string {
  const subject = LEVEL_SUBJECTS[rule.level];
  const when = describeConditions(rule.conditions, rule.condition_logic, currency);
  switch (rule.action) {
    case 'notify_only':
      return `Alert in Inbox when ${subject} has ${when}.`;
    case 'turn_off':
      return `Turn off ${subject} when it has ${when}.`;
    case 'turn_on':
      return `Turn on ${subject} when it has ${when}.`;
    case 'increase_budget':
      return `Raise the budget of ${subject} by ${rule.budget_change_percent ?? 0}% when it has ${when}.`;
    case 'decrease_budget':
      return `Lower the budget of ${subject} by ${rule.budget_change_percent ?? 0}% when it has ${when}.`;
  }
}

function checkCadence(minutes: number): string {
  if (minutes >= 1440) return 'once a day';
  if (minutes === 60) return 'every hour';
  if (minutes > 60 && minutes % 60 === 0) return `every ${minutes / 60} hours`;
  return `every ${minutes} min`;
}

function repeatCadence(minutes: number): string {
  if (minutes <= 0) return 'on every check';
  if (minutes === 1440) return 'at most once a day';
  if (minutes === 60) return 'at most once an hour';
  if (minutes % 1440 === 0) return `at most once every ${minutes / 1440} days`;
  if (minutes % 60 === 0) return `at most once every ${minutes / 60} hours`;
  return `at most once every ${minutes} min`;
}

/** "Checks every 5 min and acts at most once a day on each ad set." */
export function describeRuleCadence(rule: DescribedRule): string {
  const verb = rule.action === 'notify_only' ? 'alerts' : 'acts';
  return `Checks ${checkCadence(rule.check_interval_minutes)} and ${verb} ${repeatCadence(rule.cooldown_minutes)} on each ${LEVEL_NOUNS[rule.level]}.`;
}

/**
 * Which part of the ad account an attachment covers, named from the last 7
 * days of data. `names` is null when that data could not be read.
 */
export function describeScope(scope: RuleScope, names: Map<string, string> | null): string {
  if (scope.level === 'account') return 'Covers the whole ad account.';
  const labels = scope.ids.map((id) => {
    const name = names?.get(id);
    if (name !== undefined) return `“${name}”`;
    return names ? `id ${id} (no data in the last 7 days)` : `id ${id}`;
  });
  const shown = labels.slice(0, 5);
  const more = labels.length > shown.length ? ` and ${labels.length - shown.length} more` : '';
  const noun = scope.level === 'campaign'
    ? (scope.ids.length === 1 ? 'campaign' : 'campaigns')
    : (scope.ids.length === 1 ? 'ad set' : 'ad sets');
  return `Covers only the ${noun} ${shown.join(', ')}${more}.`;
}
