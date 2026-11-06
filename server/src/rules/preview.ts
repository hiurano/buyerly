// What a rule would check and act on if attached to a whole ad account (#200),
// from the account's stored daily facts (services/rule_preview.py
// preview_from_facts). Pure: the caller reads the facts (previewQuery says
// which); nothing here writes or calls Meta. test/rules/engine.test.ts feeds
// the same facts to both and requires identical previews.

import { daysBefore, localToday } from '../graphql/areas/accounts/clock.ts';
import { periodMetrics, type FactFigures } from '../graphql/areas/accounts/metrics.ts';
import { check } from './engine.ts';
import { RuleValueError, get, isMapping, normalizeRuleLevel, pyStr, truthy, type Rule } from './validation.ts';

export const PREVIEW_ENTITY_LIMIT = 50;
// Delivery states Meta keeps reporting for entities that will never run again.
const GONE_STATUSES = new Set(['DELETED', 'ARCHIVED']);
// Meta's date presets the worker reads: everything but `today` ends yesterday.
const WINDOW_DAYS: [string, number][] = [['yesterday', 1], ['last_3d', 3], ['last_7d', 7]];

export interface PreviewAccount {
  account_id: string;
  name: string | null;
  workspace_id: number;
  currency: string | null;
  timezone_name: string | null;
  rules_enabled: boolean | null;
}

// One analytics_entity_daily_facts row; fetched_at as Python's isoformat() in UTC.
export interface PreviewFact extends FactFigures {
  entity_id: string;
  entity_name: string | null;
  date: string;
  status: string | null;
  effective_status: string | null;
  fetched_at: string | null;
}

function previewLevel(rule: Rule): string {
  try {
    return normalizeRuleLevel(get(rule, 'level'));
  } catch (error) {
    if (error instanceof RuleValueError) return 'adset';
    throw error;
  }
}

function windowDates(account: PreviewAccount, now: Date): Record<string, string[]> {
  const today = localToday(account.timezone_name, now);
  const windows: Record<string, string[]> = { today: [today] };
  for (const [window, days] of WINDOW_DAYS) windows[window] = Array.from({ length: days }, (_, offset) => daysBefore(today, offset + 1));
  return windows;
}

const usesLifetime = (rule: Rule): boolean => {
  const conditions = get(rule, 'conditions');
  return truthy(conditions) && Array.isArray(conditions) && conditions.some((condition) => isMapping(condition) && get(condition, 'time_window') === 'lifetime');
};

// Which facts to read: the level's rows on the window dates, or every stored
// day up to today for a lifetime condition (the preview sums what Buyerly
// stored instead of calling Meta, and says from when: lifetime_since).
export function previewQuery(account: PreviewAccount, rule: Rule, now: Date): { level: string; dates: string[] | null; until: string | null } {
  const level = previewLevel(rule);
  if (usesLifetime(rule)) return { level, dates: null, until: localToday(account.timezone_name, now) };
  return { level, dates: allDates(windowDates(account, now)), until: null };
}

const allDates = (windows: Record<string, string[]>): string[] => [...new Set(Object.values(windows).flat())].sort();

// Sortable form of a Python isoformat() UTC timestamp (microseconds optional).
const instantKey = (iso: string): string => (iso.includes('.') ? iso : iso.replace('+00:00', '.000000+00:00'));

// Python's sorted() on str: code points, not UTF-16 units.
function compareText(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = left[index].codePointAt(0)! - right[index].codePointAt(0)!;
    if (difference) return difference;
  }
  return left.length - right.length;
}

const OUTCOME_ORDER: Record<string, number> = { matched: 0, not_met: 1, inactive: 2 };

interface Item { entity_id: string; entity_name: string; status: string; spend: number; outcome: string; detail: string }

export function previewFromFacts(account: PreviewAccount, rule: Rule, facts: PreviewFact[], now: Date): Record<string, unknown> {
  const level = previewLevel(rule);
  const windows = windowDates(account, now);
  const recentDates = new Set(allDates(windows));
  const lifetime = usesLifetime(rule);

  const factsByEntity = new Map<string, PreviewFact[]>();
  for (const fact of facts) {
    const key = String(fact.entity_id);
    if (!factsByEntity.has(key)) factsByEntity.set(key, []);
    factsByEntity.get(key)!.push(fact);
  }
  const lifetimeSince = lifetime && facts.length ? facts.map((fact) => fact.date).reduce((a, b) => (compareText(b, a) < 0 ? b : a)) : null;

  // The engine skips an account whose automation is off; the preview asks
  // what happens once attaching turns it on. A paused rule is previewed as
  // it will act once turned on.
  const probe = { rules_enabled: true, workspace_id: account.workspace_id, currency: account.currency, active_rules: [rule] };
  const scopedRule = { ...rule, enabled: true, scope: { level: 'account', ids: [] } };
  const items: Item[] = [];
  let latestFetch: string | null = null;
  for (const [entityId, entityFacts] of factsByEntity) {
    // Older days only feed lifetime totals; the entities listed stay the
    // ones with recent numbers, as for any other rule.
    if (lifetime && !entityFacts.some((fact) => recentDates.has(fact.date))) continue;
    entityFacts.sort((a, b) => compareText(a.date, b.date));
    const latest = entityFacts[entityFacts.length - 1];
    const status = (latest.status || 'UNKNOWN').toUpperCase();
    if (GONE_STATUSES.has(status)) continue;
    if (latest.fetched_at && (latestFetch === null || instantKey(latest.fetched_at) > instantKey(latestFetch))) latestFetch = latest.fetched_at;
    const insights: Record<string, Record<string, number | null>> = {};
    for (const [window, days] of Object.entries(windows)) insights[window] = periodMetrics(entityFacts.filter((fact) => days.includes(fact.date)));
    if (lifetime) insights.lifetime = periodMetrics(entityFacts);
    const entity = {
      ...insights.today,
      entity_level: level,
      entity_id: entityId,
      entity_name: latest.entity_name || entityId,
      status,
      effective_status: (latest.effective_status || status).toUpperCase(),
    };
    const [found] = check(entity, probe, insights, [scopedRule]);
    items.push({
      entity_id: entityId,
      entity_name: entity.entity_name,
      status,
      spend: insights.today.spend as number,
      outcome: found ? found.outcome : 'not_met',
      detail: found ? found.detail : '',
    });
  }

  items.sort((a, b) =>
    (OUTCOME_ORDER[a.outcome] ?? 3) - (OUTCOME_ORDER[b.outcome] ?? 3)
    || b.spend - a.spend
    || compareText(a.entity_name.toLowerCase(), b.entity_name.toLowerCase()));
  const name = get(rule, 'name');
  const action = get(rule, 'action');
  return {
    account_id: account.account_id,
    account_name: account.name || account.account_id,
    level,
    rule_name: truthy(name) ? pyStr(name) : '',
    action: truthy(action) ? pyStr(action) : '',
    rules_enabled: Boolean(account.rules_enabled),
    total: items.length,
    running: items.filter((item) => item.status === 'ACTIVE').length,
    matching: items.filter((item) => item.outcome === 'matched').length,
    data_as_of: latestFetch,
    // First stored day the lifetime numbers start from; null when the rule
    // has no lifetime condition or nothing is stored.
    lifetime_since: lifetimeSince,
    entities: items.slice(0, PREVIEW_ENTITY_LIMIT),
  };
}
