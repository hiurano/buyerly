import type { EntityManager } from 'typeorm';
import { rows } from '../../../database.ts';
import { isoUtc } from '../../../workspaces/sql.ts';
import { pyFloat, pyRound, pyTruthy } from '../../../python-numbers.ts';
import { periodDates } from './clock.ts';
import { costPerEvent, roundHalfUp } from './metrics.ts';
import { strip } from './text.ts';

// An ad account's figures as the accounts list shows them (api/deps.py
// _load_persisted_summary and _latest_account_metrics_by_id,
// services/analytics_store.py get_workspace_summary_report for "today").

type Json = Record<string, unknown>;

const record = (value: unknown): Json =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};

// str(x) of a JSON scalar, as far as these rows hold them.
function pyStr(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return String(value);
}

const pyStrOr = (value: unknown, fallback: string): string => (pyTruthy(value) ? pyStr(value) : fallback);

// _latest_account_metrics_by_id: a compact view of each account row of a
// summary, its money in round(x, 2) of the stored float.
export function latestAccountMetricsById(summary: Json | null): Map<string, Json> {
  const result = new Map<string, Json>();
  if (!summary) return result;
  const generatedAt = pyStrOr(summary.generated_at, '');
  const savedAt = pyStrOr(record(summary.snapshot).saved_at, '');
  const accounts = Array.isArray(summary.accounts) ? summary.accounts : [];
  for (const raw of accounts) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const row = raw as Json;
    const accountId = strip(pyStrOr(row.account_id, ''));
    if (!accountId) continue;
    const rawStatus = pyStrOr(row.data_status, 'synced');
    const dataStatus = ['synced', 'blocked', 'error'].includes(rawStatus) ? rawStatus : 'error';

    const safeInt = (key: string): number => {
      const value = pyTruthy(row[key]) ? pyFloat(row[key]) : 0;
      // int() of nan raises ValueError (0 here); of inf OverflowError, which Python doesn't catch.
      if (value === undefined || !Number.isFinite(value)) return 0;
      return Math.max(0, Math.trunc(value) || 0);
    };
    const safeFloat = (key: string): number | null => {
      if (row[key] === null || row[key] === undefined) return null;
      const value = pyFloat(row[key]);
      return value === undefined ? null : pyRound(value, 2);
    };

    result.set(accountId, {
      period: 'today',
      generated_at: generatedAt,
      saved_at: savedAt,
      data_status: dataStatus,
      data_status_label: pyStrOr(row.data_status_label, ''),
      spend: safeFloat('spend'),
      impressions: safeInt('impressions'),
      reach: safeInt('reach'),
      frequency: safeFloat('frequency'),
      cpm: safeFloat('cpm'),
      clicks: safeInt('clicks'),
      unique_clicks: safeInt('unique_clicks'),
      link_clicks: safeInt('link_clicks'),
      outbound_clicks: safeInt('outbound_clicks'),
      landing_page_views: safeInt('landing_page_views'),
      leads: safeInt('leads'),
      registrations: safeInt('registrations'),
      purchases: safeInt('purchases'),
      cpl: safeFloat('cost_per_lead'),
      cpreg: safeFloat('cost_per_registration'),
      cpp: safeFloat('cost_per_purchase'),
      cpc: safeFloat('cpc'),
      ctr: safeFloat('ctr'),
      ctr_link: safeFloat('ctr_link'),
      cpc_link: safeFloat('cpc_link'),
      cost_per_lpv: safeFloat('cost_per_landing_page_view'),
      roas: safeFloat('purchase_roas'),
    });
  }
  return result;
}

// _load_persisted_summary(period="today") as the accounts list reads it: the
// newest of the last five snapshots whose payload is a non-empty object.
export async function persistedSummary(
  tx: EntityManager,
  workspaceId: number | null,
  ownerUserId: number,
): Promise<Json | null> {
  const snapshots = await rows<{ payload: unknown; saved_at: string }>(
    tx,
    `SELECT payload, ${isoUtc('created_at')} AS saved_at FROM summary_snapshots
      WHERE ${workspaceId === null ? 'owner_user_id = $1 AND workspace_id IS NULL' : 'workspace_id = $1'}
        AND period = 'today'
      ORDER BY created_at DESC, id DESC
      LIMIT 5`,
    [workspaceId ?? ownerUserId],
  );
  for (const snapshot of snapshots) {
    let payload = snapshot.payload;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        payload = null;
      }
    }
    const object = record(payload);
    if (Object.keys(object).length) return { ...object, snapshot: { saved_at: snapshot.saved_at } };
  }
  return null;
}

export interface SummaryAccount {
  account_id: string;
  timezone_name: string | null;
}

interface AccountFact {
  account_id: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  unique_clicks: number;
  link_clicks: number;
  outbound_clicks: number;
  landing_page_views: number;
  leads: number;
  registrations: number;
  purchases: number;
}

// datetime.now(timezone.utc).isoformat() with "Z".
function nowIso(now: Date): string {
  const text = now.toISOString().slice(0, 19);
  return now.getUTCMilliseconds() ? `${text}.${String(now.getUTCMilliseconds()).padStart(3, '0')}000Z` : `${text}Z`;
}

const sum = (facts: AccountFact[], key: keyof AccountFact): number =>
  facts.reduce((total, fact) => total + (fact[key] as number), 0);

// One synced account's row of get_workspace_summary_report, in the order
// and with the arithmetic Python uses (spend / impressions * 1000 for CPM).
export function summaryAccountRow(accountId: string, facts: AccountFact[]): Json {
  const spend = roundHalfUp(sum(facts, 'spend'), 2);
  const impressions = sum(facts, 'impressions');
  const reach = facts.reduce((max, fact) => Math.max(max, fact.reach), 0);
  const clicks = sum(facts, 'clicks');
  const linkClicks = sum(facts, 'link_clicks');
  const outboundClicks = sum(facts, 'outbound_clicks');
  const landingPageViews = sum(facts, 'landing_page_views');
  const leads = sum(facts, 'leads');
  const registrations = sum(facts, 'registrations');
  const purchases = sum(facts, 'purchases');
  return {
    account_id: accountId,
    spend: roundHalfUp(spend, 2),
    clicks,
    impressions,
    reach,
    frequency: roundHalfUp(reach > 0 ? impressions / reach : 0, 2),
    cpm: roundHalfUp(impressions > 0 ? (spend / impressions) * 1000 : 0, 2),
    unique_clicks: sum(facts, 'unique_clicks'),
    link_clicks: linkClicks,
    outbound_clicks: outboundClicks,
    landing_page_views: landingPageViews,
    leads,
    registrations,
    purchases,
    cost_per_lead: costPerEvent(spend, leads, 2),
    cost_per_registration: costPerEvent(spend, registrations, 2),
    cost_per_purchase: costPerEvent(spend, purchases, 2),
    cpc: roundHalfUp(clicks > 0 ? spend / clicks : 0, 2),
    ctr: roundHalfUp(impressions > 0 ? (clicks / impressions) * 100 : 0, 2),
    cpc_link: costPerEvent(spend, linkClicks, 2),
    ctr_link: roundHalfUp(impressions > 0 ? (linkClicks / impressions) * 100 : 0, 2),
    ctr_outbound: roundHalfUp(impressions > 0 ? (outboundClicks / impressions) * 100 : 0, 2),
    cost_per_landing_page_view: costPerEvent(spend, landingPageViews, 2),
    data_status: 'synced',
    data_status_label: 'Metrics loaded from the Analytics Fact Store',
  };
}

export interface SummaryFact extends AccountFact {
  date: string;
}

// The synced account rows of get_workspace_summary_report(ws, "today",
// accounts) as the accounts list keeps them: each account's facts of its
// own today, oldest day first.
export function todayFromFacts(accounts: SummaryAccount[], facts: SummaryFact[], now: Date): Map<string, Json> {
  const datesOf = new Map(accounts.map((account) => [account.account_id, periodDates(account.timezone_name || 'UTC', 'today', now)]));
  const factsOf = new Map<string, SummaryFact[]>();
  const ordered = [...facts].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const fact of ordered) {
    if (!datesOf.get(fact.account_id)?.includes(fact.date)) continue;
    const list = factsOf.get(fact.account_id) ?? [];
    list.push(fact);
    factsOf.set(fact.account_id, list);
  }
  return latestAccountMetricsById({
    generated_at: nowIso(now),
    accounts: accounts.flatMap((account) => {
      const own = factsOf.get(account.account_id);
      return own?.length ? [summaryAccountRow(account.account_id, own)] : [];
    }),
  });
}

// Today's figures of each account that has synced any today, in its own day.
export async function todayAccountMetrics(
  tx: EntityManager,
  workspaceId: number,
  accounts: SummaryAccount[],
  now = new Date(),
): Promise<Map<string, Json>> {
  if (!accounts.length) return new Map();
  const days = accounts.map((account) => [account.account_id, periodDates(account.timezone_name || 'UTC', 'today', now)] as const);
  const facts = await rows<SummaryFact>(
    tx,
    `SELECT f.account_id, f.date, f.spend, f.impressions, f.reach, f.clicks, f.unique_clicks, f.link_clicks,
            f.outbound_clicks, f.landing_page_views, f.leads, f.registrations, f.purchases
       FROM analytics_entity_daily_facts f
       JOIN unnest($2::text[], $3::text[]) AS wanted(wanted_account, wanted_day)
         ON f.account_id = wanted_account AND f.date = wanted_day
      WHERE f.workspace_id = $1 AND f.entity_level = 'account'
      ORDER BY f.date ASC`,
    [workspaceId, days.flatMap(([id, dates]) => dates.map(() => id)), days.flatMap(([, dates]) => dates)],
  );
  return todayFromFacts(accounts, facts, now);
}
