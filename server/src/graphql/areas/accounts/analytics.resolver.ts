import type { EntityManager } from 'typeorm';
import { Arg, Ctx, Query, Resolver } from 'type-graphql';
import { rows } from '../../../database.ts';
import { isoUtc } from '../../../workspaces/sql.ts';
import type { GraphQLContext } from '../../context.ts';
import { RouteError, invalidInput } from '../../errors.ts';
import { JSONScalar } from '../../scalars.ts';
import { comparisonMeta, periodDates, previousPeriodDates, type Comparison } from './clock.ts';
import { periodMetrics, type FactFigures } from './metrics.ts';
import { scopeOf, visibleAccounts } from './scope.ts';
import { strip } from './text.ts';

// The Analytics Fact Store's drill-downs (api/routers/analytics.py,
// services/analytics_store.py get_hierarchy_breakdown and
// get_accounts_hierarchy): campaigns, ad sets and ads with their figures for
// a period, each account in its own local days. Read-only.

// Campaigns asks for every account it lists in one request; a workspace holds far fewer.
const MAX_HIERARCHY_ACCOUNTS = 500;
const HIERARCHY_LEVELS = ['campaign', 'adset', 'ad'] as const;

interface VisibleAccount {
  id: number;
  workspace_id: number | null;
  account_id: string;
  timezone_name: string | null;
}

interface FactRow extends FactFigures {
  entity_id: string;
  entity_name: string | null;
  entity_level: string;
  parent_entity_id: string | null;
  account_id: string;
  date: string;
  currency: string | null;
  status: string | null;
  effective_status: string | null;
  daily_budget: number | null;
  fetched_at: string | null;
  fetched_key: string | null;
}

const FACT_COLUMNS = `entity_id, entity_name, entity_level, parent_entity_id, account_id, date, currency, status,
  effective_status, daily_budget, spend, impressions, reach, clicks, link_clicks, outbound_clicks,
  landing_page_views, leads, registrations, purchases,
  ${isoUtc('fetched_at')} AS fetched_at,
  to_char(fetched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS fetched_key`;

// Query(..., pattern=…) as pydantic words a mismatch.
function matching(value: string | null, pattern: string, fallback: string): string {
  if (value === null) return fallback;
  if (!new RegExp(pattern).test(value.replace(/\n$/, ''))) throw invalidInput([`String should match pattern '${pattern}'`]);
  return value;
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

// One row per entity, its latest fact naming it, highest spend first.
function hierarchyItems(facts: FactRow[], level: string, dates: string[], previousDates: string[], comparison: Comparison): Record<string, unknown>[] {
  const current = new Set(dates);
  const previous = new Set(previousDates);
  const grouped = new Map<string, FactRow[]>();
  const previousGrouped = new Map<string, FactRow[]>();
  for (const fact of facts) {
    const into = current.has(fact.date) ? grouped : previous.has(fact.date) ? previousGrouped : null;
    if (!into) continue;
    const list = into.get(fact.entity_id) ?? [];
    list.push(fact);
    into.set(fact.entity_id, list);
  }
  const results: Record<string, unknown>[] = [];
  for (const [entityId, entityFacts] of grouped) {
    const latest = entityFacts[entityFacts.length - 1];
    let freshest: FactRow | null = null;
    for (const fact of entityFacts) {
      if (fact.fetched_key && (!freshest || fact.fetched_key > freshest.fetched_key!)) freshest = fact;
    }
    const item: Record<string, unknown> = {
      entity_id: entityId,
      entity_name: latest.entity_name || `${capitalize(level)} ${entityId}`,
      entity_level: level,
      // The stored parent: an account-wide query spans many campaigns and ad sets.
      parent_entity_id: latest.parent_entity_id,
      account_id: latest.account_id,
      currency: latest.currency,
      status: latest.status,
      effective_status: latest.effective_status,
      daily_budget: latest.daily_budget,
      data_as_of: freshest?.fetched_at ?? null,
      ...periodMetrics(entityFacts),
    };
    if (comparison.available) {
      // An entity absent from the baseline window has no previous value, not zero.
      const baseline = previousGrouped.get(entityId);
      item.previous = baseline ? periodMetrics(baseline) : null;
    }
    results.push(item);
  }
  return results.sort((a, b) => (b.spend as number) - (a.spend as number));
}

function hierarchyResponse(parentId: string, level: string, period: string, items: Record<string, unknown>[], comparison: Comparison): Record<string, unknown> {
  // The oldest per-entity timestamp is the whole result's conservative freshness.
  const freshness = items.map((item) => item.data_as_of).filter((value): value is string => !!value);
  return {
    parent_id: parentId,
    level,
    period,
    source: 'analytics_fact_store',
    data_as_of: freshness.length ? freshness.reduce((a, b) => (b < a ? b : a)) : null,
    comparison,
    total: items.length,
    items,
  };
}

async function accountsOf(tx: EntityManager, context: GraphQLContext): Promise<{ workspaceId: number | null; accounts: VisibleAccount[] }> {
  const scope = await scopeOf(tx, context.user);
  return {
    workspaceId: scope.workspaceId,
    accounts: await visibleAccounts<VisibleAccount>(tx, context.user, scope, 'id, workspace_id, account_id, timezone_name'),
  };
}

@Resolver()
export class AnalyticsResolver {
  @Query(() => JSONScalar, { description: 'Campaigns, ad sets or ads under a Meta entity, with their insights for the period.' })
  async analyticsHierarchy(
    @Ctx() context: GraphQLContext,
    @Arg('parentId', () => String) parentId: string,
    @Arg('level', () => String, { nullable: true, defaultValue: null }) levelArg: string | null,
    @Arg('period', () => String, { nullable: true, defaultValue: null }) periodArg: string | null,
    @Arg('compare', () => String, { nullable: true, defaultValue: null }) compareArg: string | null,
  ): Promise<unknown> {
    const level = matching(levelArg, '^(campaign|adset|ad)$', 'campaign');
    const period = matching(periodArg, '^(today|yesterday|last_3d|last_7d)$', 'today');
    const compare = matching(compareArg, '^(none|previous)$', 'none') === 'previous';

    return context.app.db.transaction(async (tx) => {
      const { workspaceId, accounts } = await accountsOf(tx, context);
      if (workspaceId === null || !accounts.length) {
        return hierarchyResponse(parentId, level, period, [], comparisonMeta(compare, [], period));
      }

      // The ad account the parent belongs to: fact dates are its local days.
      const byId = new Map(accounts.map((account) => [account.account_id, account]));
      let account = byId.get(parentId) ?? byId.get(parentId.startsWith('act_') ? parentId : `act_${parentId}`);
      let parentFilter: string;
      if (account) {
        parentFilter = '';
      } else {
        // Campaigns hang off an account, and an act_ parent names one.
        if (level === 'campaign' || !parentId || parentId.startsWith('act_')) throw notFound();
        const owners = await rows<{ account_id: string }>(
          tx,
          `SELECT DISTINCT account_id FROM analytics_entity_daily_facts
            WHERE workspace_id = $1 AND account_id = ANY($2::text[]) AND (entity_id = $3 OR parent_entity_id = $3)
            LIMIT 2`,
          [workspaceId, [...byId.keys()], parentId],
        );
        if (owners.length > 1) {
          context.app.log.warn(`Analytics parent ${parentId} is stored under several accounts in workspace ${workspaceId}`);
        }
        if (owners.length !== 1) throw notFound();
        account = byId.get(owners[0].account_id)!;
        parentFilter = 'AND parent_entity_id = $5';
      }

      // One reading of the clock for both windows.
      const now = new Date();
      const dates = periodDates(account.timezone_name, period, now);
      const previousDates = compare ? previousPeriodDates(account.timezone_name, period, now) : [];
      const comparison = comparisonMeta(compare, previousDates, period);
      const params: unknown[] = [workspaceId, account.account_id, level, [...dates, ...previousDates]];
      if (parentFilter) params.push(parentId);
      const facts = await rows<FactRow>(
        tx,
        `SELECT ${FACT_COLUMNS} FROM analytics_entity_daily_facts
          WHERE workspace_id = $1 AND account_id = $2 ${parentFilter} AND entity_level = $3 AND date = ANY($4::text[])
          ORDER BY entity_id ASC, date ASC`,
        params,
      );
      return hierarchyResponse(parentId, level, period, hierarchyItems(facts, level, dates, previousDates, comparison), comparison);
    });
  }

  @Query(() => JSONScalar, { description: 'Ad account rows with their insights for the period; every visible one when none named.' })
  async analyticsAccountsHierarchy(
    @Ctx() context: GraphQLContext,
    @Arg('accountIds', () => String, { nullable: true, defaultValue: null }) accountIds: string | null,
    @Arg('period', () => String, { nullable: true, defaultValue: null }) periodArg: string | null,
  ): Promise<unknown> {
    if (accountIds !== null && [...accountIds].length > 20_000) throw invalidInput(['String should have at most 20000 characters']);
    const period = matching(periodArg, '^(today|yesterday|last_3d|last_7d)$', 'today');
    let wanted = accountIds === null ? null : [...new Set(accountIds.split(',').map(strip).filter(Boolean))];
    if (wanted && wanted.length > MAX_HIERARCHY_ACCOUNTS) {
      throw new RouteError(422, `At most ${MAX_HIERARCHY_ACCOUNTS} ad accounts per request`);
    }

    return context.app.db.transaction(async (tx) => {
      const { workspaceId, accounts: all } = await accountsOf(tx, context);
      const visible = new Map(all.map((account) => [account.account_id, account]));
      wanted ??= [...visible.keys()].slice(0, MAX_HIERARCHY_ACCOUNTS);
      const accounts = wanted.filter((id) => visible.has(id)).map((id) => visible.get(id)!);

      const now = new Date();
      const datesOf = new Map(accounts.map((account) => [account.account_id, periodDates(account.timezone_name, period, now)]));
      const factsOf = new Map<string, FactRow[]>();
      if (datesOf.size) {
        const facts = await rows<FactRow>(
          tx,
          `SELECT ${FACT_COLUMNS} FROM analytics_entity_daily_facts f
             JOIN unnest($2::text[], $3::text[]) AS wanted(wanted_account, wanted_day)
               ON f.account_id = wanted_account AND f.date = wanted_day
            WHERE f.workspace_id = $1 AND f.entity_level = ANY($4::text[])
            ORDER BY f.entity_id ASC, f.date ASC`,
          [
            workspaceId,
            [...datesOf].flatMap(([id, dates]) => dates.map(() => id)),
            [...datesOf].flatMap(([, dates]) => dates),
            HIERARCHY_LEVELS,
          ],
        );
        for (const fact of facts) {
          const key = `${fact.account_id}\u0000${fact.entity_level}`;
          const list = factsOf.get(key) ?? [];
          list.push(fact);
          factsOf.set(key, list);
        }
      }
      const none = comparisonMeta(false, [], period);
      const rowsOf = (account: string, level: string): Record<string, unknown>[] =>
        hierarchyItems(factsOf.get(`${account}\u0000${level}`) ?? [], level, datesOf.get(account)!, [], none);

      return {
        period,
        source: 'analytics_fact_store',
        accounts: accounts.map((account) => ({
          account_id: account.account_id,
          campaigns: rowsOf(account.account_id, 'campaign'),
          adsets: rowsOf(account.account_id, 'adset'),
          ads: rowsOf(account.account_id, 'ad'),
        })),
        missing: wanted.filter((id) => !visible.has(id)),
      };
    });
  }
}

// A parent this workspace does not hold; another workspace's looks the same.
function notFound(): RouteError {
  return new RouteError(404, 'Ad account, campaign or ad set not found, or not available in the current workspace');
}
