import { Arg, Ctx, Mutation, Query, Resolver } from 'type-graphql';
import { rows } from '../../../database.ts';
import { mutated, type GraphQLContext } from '../../context.ts';
import { RouteError, invalidInput } from '../../errors.ts';
import { AccountPayload, type Payload } from '../../payloads.ts';
import { JSONScalar } from '../../scalars.ts';
import { accountAccess, allowsAccountPk } from '../../../workspaces/account-access.ts';
import { actId, ensureWriteAccess, refuseRecorded, scopeOf, visibleAccounts, writableAccount } from './scope.ts';
import { strip } from './text.ts';
import { loadActiveRules } from '../../../rules/presets.ts';
import { healthPayload, isoformatSql, type HealthRow } from '../admin/health.resolver.ts';
import { normalizeCurrency } from './currency.ts';
import { latestAccountMetricsById, persistedSummary, todayAccountMetrics } from './summary.ts';

// An ad account's Buyerly-side edits (api/routers/accounts.py): its name and
// note, its lead, and removing it; and the list of them with their figures. Adding accounts reads Meta, so it moves
// with the Meta client (stage 4). Python's in-process summary cache can't be
// cleared from here; it expires on its own (120 s).

type Body = Record<string, unknown>;

function body(input: unknown): Body {
  const value = input ?? {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw invalidInput(['Input should be a valid dictionary or object to extract fields from']);
  }
  return value as Body;
}

// pydantic with extra="forbid": every issue, fields in the model's order,
// then the unknown keys.
function check(value: Body, fields: Record<string, (field: unknown) => string | null>): void {
  const issues: string[] = [];
  for (const [name, validate] of Object.entries(fields)) {
    if (name in value) {
      const issue = validate(value[name]);
      if (issue) issues.push(issue);
    }
  }
  for (const name of Object.keys(value)) if (!(name in fields)) issues.push('Extra inputs are not permitted');
  if (issues.length) throw invalidInput(issues);
}

const text = (max: number) => (field: unknown): string | null => {
  if (typeof field !== 'string') return 'Input should be a valid string';
  if ([...field].length > max) return `String should have at most ${max} characters`;
  return null;
};

// Optional[int] in pydantic's lax mode: an int, an integral float, a bool, or
// a string holding an integer.
function optionalInt(field: unknown): number | null | string {
  if (field === null) return null;
  if (typeof field === 'boolean') return field ? 1 : 0;
  if (typeof field === 'number') {
    if (Number.isInteger(field)) return field;
    return Number.isFinite(field) ? 'Input should be a valid integer, got a number with a fractional part' : 'Input should be a finite number';
  }
  if (typeof field === 'string') {
    const trimmed = strip(field);
    if (/^[+-]?\d+$/.test(trimmed)) return Number(trimmed);
    return 'Input should be a valid integer, unable to parse string as an integer';
  }
  return 'Input should be a valid integer';
}

interface ListedAccount {
  id: number;
  account_id: string;
  name: string;
  custom_name: string | null;
  note: string | null;
  meta_connection_id: number | null;
  owner_user_id: number | null;
  lead_user_id: number | null;
  workspace_id: number | null;
  batch_name: string | null;
  timezone_name: string | null;
  currency: string | null;
  account_status: number;
  status_label: string | null;
  rules_enabled: boolean;
  is_active: boolean;
  active_rules: unknown;
  created_at: string | null;
}

const LISTED_COLUMNS = `id, account_id, name, custom_name, note, meta_connection_id, owner_user_id, lead_user_id,
  workspace_id, batch_name, timezone_name, currency, account_status, status_label, rules_enabled, is_active,
  active_rules, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS created_at`;

@Resolver()
export class AccountsResolver {
  // list_accounts: the saved summary's figures (latest_metrics), today's from
  // the fact store (today_metrics, only accounts synced today), the health
  // the worker keeps, and the rules running on each account.
  @Query(() => JSONScalar, { description: 'Ad accounts of the workspace the member may see, with their latest metrics.' })
  async accounts(@Ctx() context: GraphQLContext): Promise<unknown> {
    return context.app.db.transaction(async (tx) => {
      const scope = await scopeOf(tx, context.user);
      const accounts = await visibleAccounts<ListedAccount>(tx, context.user, scope, LISTED_COLUMNS);
      const workspaceId = scope.workspaceId;
      // get_user_accounts files the caller's legacy accounts under the workspace.
      for (const account of accounts) {
        if (account.workspace_id === null && account.owner_user_id === context.user.id) account.workspace_id = workspaceId;
      }
      const latest = latestAccountMetricsById(await persistedSummary(tx, workspaceId, context.user.id));
      const pks = accounts.map((account) => account.id);
      const healthRows = pks.length && workspaceId !== null
        ? await rows<HealthRow>(
          tx,
          `SELECT account_pk, status, cause, signals, consecutive_failures,
                  ${isoformatSql('last_success_at')} AS last_success_at, ${isoformatSql('last_error_at')} AS last_error_at,
                  last_error_code, last_error_message, ${isoformatSql('last_checked_at')} AS last_checked_at
             FROM account_health WHERE account_pk = ANY($1::int[]) AND workspace_id = $2`,
          [pks, workspaceId],
        )
        : [];
      const healthOf = new Map(healthRows.map((row) => [row.account_pk, row]));
      // Read last: Python logs a failure here and lists the rest without today's figures.
      let today = new Map<string, Record<string, unknown>>();
      if (accounts.length && workspaceId !== null) {
        try {
          today = await todayAccountMetrics(tx, workspaceId, accounts);
        } catch (error) {
          context.app.log.error({ err: error }, "Today's account figures are unavailable");
        }
      }
      return accounts.map((account) => ({
        id: account.id,
        account_id: account.account_id,
        name: account.name,
        custom_name: account.custom_name || '',
        note: account.note || '',
        connection_type: account.meta_connection_id ? 'facebook_login' : 'system_user',
        owner_user_id: account.owner_user_id,
        lead_user_id: account.lead_user_id,
        workspace_id: account.workspace_id,
        owner_id: '',
        batch_name: account.batch_name || '',
        timezone_name: account.timezone_name || 'UTC',
        currency: normalizeCurrency(account.currency),
        account_status: account.account_status,
        status_label: account.status_label || 'Active (ACTIVE)',
        rules_enabled: account.rules_enabled,
        is_active: account.is_active,
        active_rules: loadActiveRules(account.active_rules),
        latest_metrics: latest.get(account.account_id) ?? null,
        today_metrics: today.get(account.account_id) ?? null,
        health: healthPayload(healthOf.get(account.id)),
        created_at: account.created_at ?? '',
      }));
    });
  }

  @Mutation(() => AccountPayload, { nullable: true, description: 'Renames an ad account or changes its note.' })
  async accountUpdate(
    @Arg('accountId', () => String) accountId: string,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const req = body(input);
    check(req, { custom_name: text(120), note: text(500) });
    const record = await context.app.db.transaction(async (tx) => {
      const scope = await scopeOf(tx, context.user);
      ensureWriteAccess(scope, 'editing an ad account', true);
      const account = await writableAccount(tx, context.user, scope, accountId, 'UPDATE_ACCOUNT_PROFILE');
      const customName = strip((req.custom_name as string | undefined) ?? '');
      const note = strip((req.note as string | undefined) ?? '');
      await rows(tx, 'UPDATE accounts SET custom_name = $1, note = $2 WHERE id = $3', [customName, note, account.id]);
      return { account_id: account.account_id, custom_name: customName, note, message: 'Name and note saved' };
    });
    return mutated(context, AccountPayload, record);
  }

  @Mutation(() => AccountPayload, { nullable: true, description: "Sets or clears an ad account's lead." })
  async accountLeadUpdate(
    @Arg('accountId', () => String) accountId: string,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const req = body(input);
    let leadUserId: number | null = null;
    check(req, {
      lead_user_id: (field) => {
        const parsed = optionalInt(field);
        if (typeof parsed === 'string') return parsed;
        leadUserId = parsed;
        return null;
      },
    });
    const record = await context.app.db.transaction(async (tx) => {
      const scope = await scopeOf(tx, context.user);
      ensureWriteAccess(scope, "changing an ad account's lead", true);
      const [account] = await rows<{ id: number; account_id: string }>(
        tx,
        'SELECT id, account_id FROM accounts WHERE workspace_id = $1 AND account_id = $2 FOR UPDATE',
        [scope.workspaceId, actId(accountId)],
      );
      if (!account || !allowsAccountPk(await accountAccess(tx, scope.member.id === null ? null : scope.member, scope.workspaceId), account.id)) {
        throw new RouteError(404, 'Ad account not found');
      }
      if (leadUserId !== null) {
        const [inWorkspace] = await rows(
          tx,
          'SELECT id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 LIMIT 1',
          [scope.workspaceId, leadUserId],
        );
        if (!inWorkspace) throw new RouteError(400, 'The lead must be a member of this workspace');
      }
      await rows(tx, 'UPDATE accounts SET lead_user_id = $1 WHERE id = $2', [leadUserId, account.id]);
      return { account_id: account.account_id, lead_user_id: leadUserId };
    });
    return mutated(context, AccountPayload, record);
  }

  @Mutation(() => AccountPayload, { nullable: true, description: 'Removes an ad account from the workspace.' })
  async accountDelete(@Arg('accountId', () => String) accountId: string, @Ctx() context: GraphQLContext): Promise<Payload> {
    const record = await context.app.db.transaction(async (tx) => {
      const scope = await scopeOf(tx, context.user);
      ensureWriteAccess(scope, 'deleting an ad account');
      const id = actId(accountId);
      const [account] = await rows<{ id: number }>(
        tx,
        `SELECT id FROM accounts
          WHERE account_id = $1 AND (workspace_id = $2 OR (workspace_id IS NULL AND owner_user_id = $3))`,
        [id, scope.workspaceId, context.user.id],
      );
      if (!account) {
        const [elsewhere] = await rows(tx, 'SELECT id FROM accounts WHERE account_id = $1', [id]);
        if (elsewhere) {
          await refuseRecorded(tx, context.user, scope.workspaceId, 404, 'Ad account not found.', 'DELETE_ACCOUNT', { type: 'account', id });
        }
        throw new RouteError(404, 'Ad account not found.');
      }
      await rows(tx, 'DELETE FROM accounts WHERE account_id = $1', [id]);
      return { success: true, message: `Ad account ${id} deleted` };
    });
    return mutated(context, AccountPayload, record);
  }
}
