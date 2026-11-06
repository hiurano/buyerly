import { Arg, Ctx, Int, Query, Resolver } from 'type-graphql';
import type { EntityManager } from 'typeorm';
import { rows } from '../../../database.ts';
import { PRESET_COLUMNS, presetSnapshot, type PresetRow } from '../../../rules/presets.ts';
import { isoUtc } from '../../../workspaces/sql.ts';
import type { GraphQLContext } from '../../context.ts';
import { RouteError, invalidInput } from '../../errors.ts';
import { JSONScalar } from '../../scalars.ts';
import { periodDates } from './clock.ts';
import { scopeOf, visibleAccounts } from './scope.ts';
import { casefold, strip } from './text.ts';

// Workspace search behind the search page (api/routers/search.py): campaigns,
// ad sets and ads of today's synced inventory, rules and ad accounts, all of
// the workspace in the address. Ranks: 0 the name (or Meta ID) itself, 1 a
// name starting with the query, 2 one containing it.

const DEFAULT_SEARCH_LIMIT = 5;
const MAX_SEARCH_LIMIT = 20;
const MAX_QUERY_LENGTH = 200;
const ENTITY_LEVELS = ['campaign', 'adset', 'ad'];
const KIND_ORDER = ['campaign', 'adset', 'ad', 'rule', 'account'];
const KINDS_MESSAGE = "Input should be 'campaign', 'adset', 'ad', 'rule' or 'account'";
const STATUSES = ['active', 'paused', 'other'];
const STATUSES_MESSAGE = "Input should be 'active', 'paused' or 'other'";
const RULE_STATUS_GROUPS: Record<string, string> = { active: 'active', paused: 'paused', needs_review: 'other' };

interface Item {
  kind: string;
  id: string;
  name: string;
  account_id: string;
  account_name: string;
  parent_name: string;
  status: string;
  updated_at: string | null;
}

// A result with its rank and its updated_at as epoch microseconds (null sorts last).
interface Ranked { rank: number; item: Item; at: bigint | null }

const result = (fields: Partial<Item> & Pick<Item, 'kind' | 'id' | 'name'>): Item => ({
  account_id: '', account_name: '', parent_name: '', status: '', updated_at: null, ...fields,
});

// A stable sort of newest first, as sorted(key=-timestamp) with None last.
const newestFirst = (items: Ranked[]): Ranked[] =>
  [...items].sort((a, b) => (a.at === null ? (b.at === null ? 0 : 1) : b.at === null ? -1 : a.at > b.at ? -1 : a.at < b.at ? 1 : 0));

// Python's sorted() on str: code points.
function compareText(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = left[index].codePointAt(0)! - right[index].codePointAt(0)!;
    if (difference) return difference;
  }
  return left.length - right.length;
}

// The query as LIKE text: a `%` or `_` in a name is a character, not a wildcard.
const literalLike = (text: string): string => text.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

class Params {
  readonly values: unknown[] = [];
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

function nameRank(column: string, text: string, params: Params): string {
  return `CASE WHEN lower(${column}) = lower(${params.add(text)}) THEN 0 WHEN ${column} ILIKE ${params.add(`${literalLike(text)}%`)} ESCAPE '\\' THEN 1 ELSE 2 END`;
}

const contains = (column: string, text: string, params: Params): string => `${column} ILIKE ${params.add(`%${literalLike(text)}%`)} ESCAPE '\\'`;

// Meta's effective status in the page's words, told apart as Ads Manager tells them.
function metaStatusIs(group: string): string {
  const paused = "(f.effective_status = 'PAUSED' OR f.effective_status LIKE '%\\_PAUSED' ESCAPE '\\')";
  if (group === 'active') return "f.effective_status = 'ACTIVE'";
  if (group === 'paused') return paused;
  return `(f.effective_status != 'ACTIVE' AND NOT ${paused})`;
}

interface AccountRow {
  id: number;
  workspace_id: number | null;
  account_id: string;
  name: string | null;
  custom_name: string | null;
  timezone_name: string | null;
  is_active: boolean;
  created_at_iso: string | null;
  created_at_us: string | null;
}

const accountName = (account: AccountRow): string => strip(account.custom_name ?? '') || strip(account.name ?? '') || account.account_id;

function textRank(name: string, folded: string): number {
  const candidate = casefold(name);
  return candidate === folded ? 0 : candidate.startsWith(folded) ? 1 : 2;
}

function accountRank(account: AccountRow, folded: string): number | null {
  const accountId = casefold(account.account_id);
  if (folded === accountId || folded === (accountId.startsWith('act_') ? accountId.slice(4) : accountId)) return 0;
  const ranks: number[] = [];
  for (const name of [strip(account.custom_name ?? ''), strip(account.name ?? '')]) {
    if (name && casefold(name).includes(folded)) ranks.push(textRank(name, folded));
  }
  return ranks.length ? Math.min(...ranks) : null;
}

const micros = (value: string | null): bigint | null => (value === null ? null : BigInt(value));

interface Filters { statuses: string[]; includeDeleted: boolean; order: string; limit: number; text: string }

interface InventoryRow {
  entity_id: string;
  entity_name: string | null;
  account_id: string;
  parent_entity_id: string | null;
  effective_status: string | null;
  rank: number;
  first_seen: string;
}

// Campaigns, ad sets and ads stored for each ad account's local today.
async function inventoryMatches(tx: EntityManager, workspaceId: number, accounts: AccountRow[], levels: string[], filters: Filters): Promise<[Ranked[], string[]]> {
  const now = new Date();
  const accountsByDay = new Map<string, string[]>();
  for (const account of accounts) {
    const day = periodDates(account.timezone_name, 'today', now)[0];
    if (!accountsByDay.has(day)) accountsByDay.set(day, []);
    accountsByDay.get(day)!.push(account.account_id);
  }
  if (!accountsByDay.size || !levels.length) return [[], []];
  const { text, limit } = filters;
  const accountIds = accounts.map((account) => account.account_id);

  const inWorkspace = (params: Params): string => {
    const days = [...accountsByDay].map(([day, ids]) => `(f.date = ${params.add(day)} AND f.account_id IN (${ids.map((id) => params.add(id)).join(', ')}))`);
    return `f.workspace_id = ${params.add(workspaceId)} AND (${days.join(' OR ')})`;
  };

  const found: [string, InventoryRow][] = [];
  const truncated: string[] = [];
  for (const level of levels) {
    const params = new Params();
    const rank = `CASE WHEN f.entity_id = ${params.add(text)} THEN 0 ELSE ${nameRank('f.entity_name', text, params)} END`;
    // The first day Buyerly synced each match: its age on the page and the "Last updated" order.
    const firstSeen = `SELECT s.entity_id, min(s.date) AS first_seen FROM analytics_entity_daily_facts s
      WHERE s.workspace_id = ${params.add(workspaceId)} AND s.entity_level = ${params.add(level)}
        AND s.account_id IN (${accountIds.map((id) => params.add(id)).join(', ')})
        AND s.entity_id IN (SELECT c.entity_id FROM analytics_entity_daily_facts c
          WHERE c.workspace_id = ${params.add(workspaceId)} AND c.entity_level = ${params.add(level)}
            AND (c.entity_id = ${params.add(text)} OR ${contains('c.entity_name', text, params)}))
      GROUP BY s.entity_id`;
    const where = [inWorkspace(params), `f.entity_level = ${params.add(level)}`, `(f.entity_id = ${params.add(text)} OR ${contains('f.entity_name', text, params)})`];
    if (filters.statuses.length) where.push(`(${filters.statuses.map(metaStatusIs).join(' OR ')})`);
    if (!filters.includeDeleted) where.push("f.effective_status NOT IN ('DELETED', 'ARCHIVED')");
    const ordering = [rank, 'lower(f.entity_name)', 'f.entity_id'];
    if (filters.order === 'updated') ordering.unshift('fs.first_seen DESC');
    const found_ = await rows<InventoryRow>(
      tx,
      `SELECT f.entity_id, f.entity_name, f.account_id, f.parent_entity_id, f.effective_status, ${rank} AS rank, fs.first_seen
         FROM analytics_entity_daily_facts f JOIN (${firstSeen}) fs ON fs.entity_id = f.entity_id
        WHERE ${where.join(' AND ')}
        ORDER BY ${ordering.join(', ')}
        LIMIT ${params.add(limit + 1)}`,
      params.values,
    );
    if (found_.length > limit) truncated.push(level);
    for (const row of found_.slice(0, limit)) found.push([level, row]);
  }

  // An ad set names its campaign and an ad its ad set, from the same inventory.
  const parentIds = [...new Set(found.filter(([level, row]) => level !== 'campaign' && row.parent_entity_id).map(([, row]) => row.parent_entity_id!))];
  const parentNames = new Map<string, string | null>();
  if (parentIds.length) {
    const params = new Params();
    const parents = await rows<{ entity_id: string; entity_name: string | null }>(
      tx,
      `SELECT f.entity_id, f.entity_name FROM analytics_entity_daily_facts f
        WHERE ${inWorkspace(params)} AND f.entity_level IN ('campaign', 'adset') AND f.entity_id IN (${parentIds.map((id) => params.add(id)).join(', ')})`,
      params.values,
    );
    for (const parent of parents) parentNames.set(parent.entity_id, parent.entity_name);
  }

  const names = new Map(accounts.map((account) => [account.account_id, accountName(account)]));
  const results = found.map(([level, row]): Ranked => ({
    rank: Number(row.rank),
    at: BigInt(Date.parse(`${row.first_seen}T00:00:00Z`)) * 1000n,
    item: result({
      kind: level,
      id: row.entity_id,
      name: row.entity_name || row.entity_id,
      account_id: row.account_id,
      account_name: names.get(row.account_id) ?? row.account_id,
      parent_name: level === 'campaign' ? '' : (parentNames.get(row.parent_entity_id ?? '') ?? ''),
      status: row.effective_status || '',
      updated_at: `${row.first_seen}T00:00:00Z`,
    }),
  }));
  return [results, truncated];
}

type RuleRow = PresetRow & { updated_at_iso: string | null; updated_at_us: string | null };

// The status comes from the runtime snapshot, as on the Rules screen, so it
// is filtered here; a workspace has few rules.
async function ruleMatches(tx: EntityManager, workspaceId: number, filters: Filters): Promise<[Ranked[], string[]]> {
  const { text, limit } = filters;
  const params = new Params();
  const presets = await rows<RuleRow>(
    tx,
    `SELECT ${PRESET_COLUMNS}, ${isoUtc('rule_presets.updated_at')} AS updated_at_iso,
            (extract(epoch FROM rule_presets.updated_at) * 1000000)::bigint::text AS updated_at_us
       FROM rule_presets
      WHERE rule_presets.workspace_id = ${params.add(workspaceId)} AND ${contains('rule_presets.name', text, params)}
      ORDER BY ${nameRank('rule_presets.name', text, params)}, lower(rule_presets.name), rule_presets.id`,
    params.values,
  );
  const folded = casefold(text);
  let ranked: Ranked[] = [];
  for (const preset of presets) {
    const snapshot = presetSnapshot(preset);
    const status = snapshot.needs_review ? 'needs_review' : (snapshot.enabled ?? true) ? 'active' : 'paused';
    if (filters.statuses.length && !filters.statuses.includes(RULE_STATUS_GROUPS[status])) continue;
    ranked.push({
      rank: textRank(preset.name, folded),
      at: micros(preset.updated_at_us),
      item: result({ kind: 'rule', id: String(preset.id), name: preset.name, status, updated_at: preset.updated_at_iso }),
    });
  }
  if (filters.order === 'updated') ranked = newestFirst(ranked);
  return [ranked.slice(0, limit), ranked.length > limit ? ['rule'] : []];
}

function accountMatches(accounts: AccountRow[], filters: Filters): [Ranked[], string[]] {
  const folded = casefold(filters.text);
  let ranked: Ranked[] = [];
  for (const account of accounts) {
    const rank = accountRank(account, folded);
    if (rank === null) continue;
    ranked.push({
      rank,
      at: micros(account.created_at_us),
      item: result({ kind: 'account', id: account.account_id, name: accountName(account), account_id: account.account_id, updated_at: account.created_at_iso }),
    });
  }
  ranked.sort((a, b) => a.rank - b.rank || compareText(casefold(a.item.name), casefold(b.item.name)) || compareText(a.item.id, b.item.id));
  if (filters.order === 'updated') ranked = newestFirst(ranked);
  return [ranked.slice(0, filters.limit), ranked.length > filters.limit ? ['account'] : []];
}

// FastAPI's Query() checks, in the handler's parameter order.
function checked(q: string, limit: number | null, kind: string | null, status: string[] | null, order: string | null) {
  if ([...q].length > MAX_QUERY_LENGTH) throw invalidInput([`String should have at most ${MAX_QUERY_LENGTH} characters`]);
  const size = limit ?? DEFAULT_SEARCH_LIMIT;
  if (size < 1) throw invalidInput(['Input should be greater than or equal to 1']);
  if (size > MAX_SEARCH_LIMIT) throw invalidInput([`Input should be less than or equal to ${MAX_SEARCH_LIMIT}`]);
  if (kind !== null && !KIND_ORDER.includes(kind)) throw invalidInput([KINDS_MESSAGE]);
  const statuses = status ?? [];
  const wrong = statuses.filter((item) => !STATUSES.includes(item));
  if (wrong.length) throw invalidInput(wrong.map(() => STATUSES_MESSAGE));
  const sort = order ?? 'relevance';
  if (sort !== 'relevance' && sort !== 'updated') throw invalidInput(["Input should be 'relevance' or 'updated'"]);
  return { size, statuses, sort };
}

@Resolver()
export class SearchResolver {
  @Query(() => JSONScalar, { description: 'Campaigns, ad sets, ads, rules and ad accounts matching a name or Meta ID.' })
  async search(
    @Arg('q', () => String) q: string,
    @Arg('limit', () => Int, { nullable: true, defaultValue: null }) limit: number | null,
    @Arg('kind', () => String, { nullable: true, defaultValue: null }) kind: string | null,
    @Arg('status', () => [String], { nullable: true, defaultValue: null }) status: string[] | null,
    @Arg('account', () => [String], { nullable: true, defaultValue: null }) account: string[] | null,
    @Arg('order', () => String, { nullable: true, defaultValue: null }) order: string | null,
    @Arg('includeDeleted', () => Boolean, { nullable: true, defaultValue: null }) includeDeleted: boolean | null,
    @Ctx() { app, user }: GraphQLContext,
  ): Promise<unknown> {
    const { size, statuses, sort } = checked(q, limit, kind, status, order);
    const accountFilter = account ?? [];
    const text = strip(q);
    if (!text) throw new RouteError(422, 'Type something to search for.');
    let kinds = kind ? [kind] : [...KIND_ORDER];
    // A filter a kind has no answer to leaves that kind out.
    if (accountFilter.length) kinds = kinds.filter((candidate) => candidate !== 'rule');
    if (statuses.length) kinds = kinds.filter((candidate) => candidate !== 'account');
    const filters: Filters = { statuses, includeDeleted: includeDeleted ?? false, order: sort, limit: size, text };

    const [entities, entitiesTruncated, rules, rulesTruncated, accounts] = await app.db.transaction(async (tx) => {
      const scope = await scopeOf(tx, user);
      if (scope.workspaceId === null) throw new RouteError(404, 'Workspace not found.');
      // Rules are the workspace's; a guest sees only their teams, as in Linear.
      if (scope.member?.role === 'guest') kinds = kinds.filter((candidate) => candidate !== 'rule');
      // Only ad accounts Ads Manager can open, so a result never leads nowhere.
      const visible = (await visibleAccounts<AccountRow>(
        tx, user, scope,
        `id, workspace_id, account_id, name, custom_name, timezone_name, is_active,
         ${isoUtc('created_at')} AS created_at_iso, (extract(epoch FROM created_at) * 1000000)::bigint::text AS created_at_us`,
      )).filter((candidate) => candidate.is_active && (!accountFilter.length || accountFilter.includes(candidate.account_id)));
      const [found, foundTruncated] = await inventoryMatches(tx, scope.workspaceId, visible, ENTITY_LEVELS.filter((level) => kinds.includes(level)), filters);
      const [ruleResults, ruleTruncated] = kinds.includes('rule') ? await ruleMatches(tx, scope.workspaceId, filters) : [[], []];
      return [found, foundTruncated, ruleResults, ruleTruncated, visible] as const;
    });
    const [foundAccounts, accountsTruncated] = kinds.includes('account') ? accountMatches(accounts, filters) : [[], []];
    // One flat list, as on Linear's search page. Sorts are stable: each kind
    // keeps its own order, and kinds keep their fixed order among equals.
    let ranked = [...entities, ...rules, ...foundAccounts];
    ranked = sort === 'updated' ? newestFirst(ranked) : ranked.sort((a, b) => a.rank - b.rank);
    return {
      query: text,
      limit: size,
      results: ranked.map(({ item }) => item),
      truncated: [...entitiesTruncated, ...rulesTruncated, ...accountsTruncated],
    };
  }
}
