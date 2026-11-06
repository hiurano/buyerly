import type { EntityManager } from 'typeorm';
import { normalizeCurrency } from '../meta/units.ts';
import { pyFloat, pyRound, pyTruthy } from '../python-numbers.ts';
import { pyStr } from '../rules/validation.ts';

// AnalyticsFactService.upsert_entity_facts (services/analytics_store.py;
// #611 stage 4): one analytics_entity_daily_facts row per workspace, ad account,
// level, entity and account-local date, written in key order so concurrent
// writers never deadlock.

// _safe_float: float(x), 0.0 for None and what float() refuses.
function storeFloat(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return pyFloat(value) ?? 0;
}

// _safe_int: int(float(x)), 0 for None and what float() or int() refuses
// (NaN); an infinity is an OverflowError Python does not catch.
function storeInt(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const number = pyFloat(value);
  if (number === undefined || Number.isNaN(number)) return 0;
  if (!Number.isFinite(number)) throw new Error('cannot convert float infinity to integer');
  return Math.trunc(number) + 0;
}

const money = (value: unknown): number => pyRound(storeFloat(value), 2);
const optionalMoney = (value: unknown): number | null => (value === null || value === undefined ? null : money(value));
const text = (value: unknown, fallback: string, length?: number): string => {
  const result = pyTruthy(value) ? pyStr(value) : fallback;
  return length === undefined ? result : Array.from(result).slice(0, length).join('');
};

const INTEGER_COLUMNS = ['impressions', 'reach', 'clicks', 'unique_clicks', 'link_clicks', 'outbound_clicks', 'landing_page_views', 'leads', 'registrations', 'purchases'] as const;
const MONEY_COLUMNS = ['spend', 'frequency', 'cpm', 'cpc', 'ctr', 'daily_budget'] as const;
const OPTIONAL_MONEY_COLUMNS = ['cpc_link', 'ctr_link', 'ctr_outbound', 'cost_per_lead', 'cost_per_registration', 'cost_per_purchase', 'cost_per_landing_page_view'] as const;
const TEXT_COLUMNS = ['account_id', 'entity_level', 'entity_id', 'entity_name', 'parent_entity_id', 'date', 'currency', 'status', 'effective_status'] as const;

type FactRow = Record<string, unknown>;

export function normalizeFacts(workspaceId: number, accountId: string, facts: Record<string, unknown>[], now: Date): FactRow[] {
  const today = now.toISOString().slice(0, 10);
  const normalized = facts.map((fact) => {
    const status = text(fact.status, 'UNKNOWN', 32);
    const row: FactRow = {
      workspace_id: Math.trunc(workspaceId),
      account_id: String(accountId),
      entity_level: text(fact.entity_level, 'account'),
      entity_id: text(fact.entity_id, String(accountId)),
      entity_name: text(fact.entity_name, '', 255),
      parent_entity_id: text(fact.parent_entity_id, '', 64),
      date: text(fact.date, today, 10),
      currency: normalizeCurrency(pyTruthy(fact.currency) ? pyStr(fact.currency) : 'UNKNOWN'),
      raw_actions: Array.isArray(fact.raw_actions) ? fact.raw_actions : [],
      status,
      effective_status: text(fact.effective_status, status, 32),
      fetched_at: (pyTruthy(fact.fetched_at) ? fact.fetched_at : null) ?? now.toISOString(),
    };
    for (const column of MONEY_COLUMNS) row[column] = money(fact[column]);
    for (const column of INTEGER_COLUMNS) row[column] = storeInt(fact[column]);
    for (const column of OPTIONAL_MONEY_COLUMNS) row[column] = optionalMoney(fact[column]);
    return row;
  });
  const key = (row: FactRow): string[] => [String(row.account_id), String(row.entity_level), String(row.entity_id), String(row.date)];
  return normalized.sort((a, b) => {
    const left = key(a);
    const right = key(b);
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] < right[index]) return -1;
      if (left[index] > right[index]) return 1;
    }
    return 0;
  });
}

const COLUMNS: Array<[string, string]> = [
  ['workspace_id', 'integer'],
  ...TEXT_COLUMNS.map((column): [string, string] => [column, 'text']),
  ...MONEY_COLUMNS.map((column): [string, string] => [column, 'double precision']),
  ...INTEGER_COLUMNS.map((column): [string, string] => [column, 'integer']),
  ...OPTIONAL_MONEY_COLUMNS.map((column): [string, string] => [column, 'double precision']),
  ['raw_actions', 'jsonb'],
  ['fetched_at', 'timestamptz'],
];
const KEY = ['workspace_id', 'account_id', 'entity_level', 'entity_id', 'date'];

// The facts of one account in one statement; the count of facts written.
export async function upsertEntityFacts(tx: EntityManager, workspaceId: number, accountId: string, facts: Record<string, unknown>[], now: Date = new Date()): Promise<number> {
  if (!facts.length) return 0;
  const normalized = normalizeFacts(workspaceId, accountId, facts, now);
  const names = COLUMNS.map(([name]) => name);
  // jsonb_to_recordset yields the rows in array order, the sorted one.
  await tx.query(
    `INSERT INTO analytics_entity_daily_facts (${names.join(', ')}, updated_at)
     SELECT ${names.join(', ')}, $2::timestamptz
     FROM jsonb_to_recordset($1::jsonb) AS fact(${COLUMNS.map(([name, type]) => `${name} ${type}`).join(', ')})
     ON CONFLICT (${KEY.join(', ')}) DO UPDATE SET
       ${names.filter((name) => !KEY.includes(name)).map((name) => `${name} = EXCLUDED.${name}`).join(', ')},
       updated_at = $2::timestamptz`,
    [JSON.stringify(normalized), now.toISOString()],
  );
  return normalized.length;
}
