import { Arg, Ctx, Int, Query, Resolver } from 'type-graphql';
import type { EntityManager } from 'typeorm';
import { rows } from '../../../database.ts';
import type { UserEntity } from '../../../entities/index.ts';
import { PRESET_COLUMNS, loadActiveRules, presetSnapshot, pythonIsoSql, validatedConditionPayloads, type PresetRow } from '../../../rules/presets.ts';
import { previewFromFacts, previewQuery, type PreviewAccount, type PreviewFact } from '../../../rules/preview.ts';
import { accountAccess, allowsAccount } from '../../../workspaces/account-access.ts';
import type { GraphQLContext } from '../../context.ts';
import { RouteError } from '../../errors.ts';
import { JSONScalar } from '../../scalars.ts';
import { actId, scopeOf } from '../accounts/scope.ts';
import { draft, presetFields } from './rules.resolver.ts';

// What a rule would check on a whole ad account before it is attached
// (api/routers/rules.py preview_rule_on_account_endpoint and
// preview_rule_draft_on_account): read-only. The evaluation is the engine's
// (rules/engine.ts, rules/preview.ts), proven equal to Python's by
// test/rules/engine.test.ts.

const NOT_FOUND = (): RouteError => new RouteError(404, 'Ad account not found.');

interface AccountRow extends PreviewAccount { active_rules: string | null }

// The ad account in the caller's workspace, if their teams reach it.
async function previewAccount(tx: EntityManager, user: UserEntity, accountId: string): Promise<{ workspaceId: number; account: AccountRow }> {
  const scope = await scopeOf(tx, user);
  if (scope.workspaceId === null) throw NOT_FOUND();
  const [account] = await rows<AccountRow>(
    tx,
    'SELECT account_id, name, workspace_id, currency, timezone_name, rules_enabled, active_rules FROM accounts WHERE account_id = $1 AND workspace_id = $2',
    [actId(accountId), scope.workspaceId],
  );
  if (!account) throw NOT_FOUND();
  const access = await accountAccess(tx, scope.member && scope.member.id !== null ? scope.member : null, scope.workspaceId);
  if (!allowsAccount(access, account.account_id)) throw NOT_FOUND();
  return { workspaceId: scope.workspaceId, account };
}

// The facts preview_rule_on_account reads, with the same filter.
async function preview(tx: EntityManager, account: AccountRow, rule: Record<string, unknown>): Promise<Record<string, unknown>> {
  const now = new Date();
  const { level, dates, until } = previewQuery(account, rule, now);
  const params: unknown[] = [account.workspace_id, account.account_id, level];
  let dateFilter: string;
  if (until !== null) {
    params.push(until);
    dateFilter = 'date <= $4';
  } else {
    const placeholders = dates!.map((day) => {
      params.push(day);
      return `$${params.length}`;
    });
    dateFilter = `date IN (${placeholders.join(', ')})`;
  }
  const facts = await rows<PreviewFact>(
    tx,
    `SELECT entity_id, entity_name, date, status, effective_status, ${pythonIsoSql('fetched_at')} AS fetched_at,
            spend, impressions, reach, clicks, link_clicks, outbound_clicks, landing_page_views, leads, registrations, purchases
       FROM analytics_entity_daily_facts
      WHERE workspace_id = $1 AND account_id = $2 AND entity_level = $3 AND ${dateFilter}`,
    params,
  );
  return previewFromFacts(account, rule, facts, now);
}

@Resolver()
export class RulePreviewResolver {
  @Query(() => JSONScalar, { description: 'What an attached rule would do on an ad account now.' })
  async rulePreview(
    @Arg('accountId', () => String) accountId: string,
    @Arg('ruleId', () => Int) ruleId: number,
    @Ctx() { app, user }: GraphQLContext,
  ): Promise<unknown> {
    return app.db.transaction(async (tx) => {
      const { workspaceId, account } = await previewAccount(tx, user, accountId);
      const [preset] = await rows<PresetRow>(tx, `SELECT ${PRESET_COLUMNS} FROM rule_presets WHERE id = $1 AND workspace_id = $2`, [ruleId, workspaceId]);
      if (!preset) throw new RouteError(404, 'Preset not found.');
      const rule = presetSnapshot(preset);
      if (rule.needs_review) throw new RouteError(400, 'This rule has unsafe or outdated settings. Open it and save it again.');
      const result = await preview(tx, account, rule);
      result.already_attached = loadActiveRules(account.active_rules).some((item) => item.preset_id === preset.id);
      return result;
    });
  }

  @Query(() => JSONScalar, { description: 'What a rule draft would do on an ad account now.' })
  async ruleDraftPreview(
    @Arg('accountId', () => String) accountId: string,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() { app, user }: GraphQLContext,
  ): Promise<unknown> {
    const payload = draft(input, false);
    return app.db.transaction(async (tx) => {
      const { workspaceId, account } = await previewAccount(tx, user, accountId);
      const conditions = validatedConditionPayloads(payload.conditions);
      // Never stored: a draft is read, not written.
      const rule = presetSnapshot({
        id: null as unknown as number,
        workspace_id: workspaceId,
        owner_user_id: user.id,
        ...presetFields(payload, conditions),
        notify_tg: null,
        created_at_display: '',
        created_at_python: null,
      });
      if (rule.needs_review) throw new RouteError(400, (typeof rule.review_reason === 'string' && rule.review_reason) || 'This rule cannot run as set.');
      const result = await preview(tx, account, rule);
      result.already_attached = false;
      return result;
    });
  }
}
