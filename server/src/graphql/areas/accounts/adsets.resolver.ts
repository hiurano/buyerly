import { randomUUID } from 'node:crypto';
import { Arg, Ctx, Mutation, Query, Resolver } from 'type-graphql';
import { recordAuditEvent } from '../../../audit/events.ts';
import { rows } from '../../../database.ts';
import { accountAccess, allowsAccountPk } from '../../../workspaces/account-access.ts';
import { mutated, type GraphQLContext } from '../../context.ts';
import { RouteError } from '../../errors.ts';
import { DeliveryPayload, type Payload } from '../../payloads.ts';
import { JSONScalar } from '../../scalars.ts';
import { normalizeCurrency, UNKNOWN_CURRENCY } from './currency.ts';
import { ensureWriteAccess, refuseRecorded, scopeOf, visibleAccounts, type AccountRow } from './scope.ts';

// The ad sets rules stopped (api/routers/adsets.py): the list and hiding a
// card. adSetReactivate turns the ad set back on in Meta, so it stays on
// Python until the Meta client moves (stage 4).

interface StoppedRow {
  id: number;
  account_id: string;
  adset_id: string;
  adset_name: string;
  stop_spend: number;
  stop_leads: number;
  stop_registrations: number;
  stopped_at: string;
}

@Resolver()
export class AdSetsResolver {
  @Query(() => JSONScalar, { description: 'Ad sets rules stopped, to reactivate or dismiss.' })
  async stoppedAdSets(@Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    return app.db.transaction(async (tx) => {
      const accounts = await visibleAccounts<AccountRow & { currency: string | null }>(tx, user, await scopeOf(tx, user));
      if (!accounts.length) return [];
      const records = await rows<StoppedRow>(
        tx,
        `SELECT id, account_id, adset_id, adset_name, stop_spend, stop_leads, stop_registrations,
                COALESCE(to_char(stopped_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI'), '') AS stopped_at
           FROM stopped_adsets
          WHERE account_id = ANY($1::text[]) AND is_resolved = false
          ORDER BY stopped_at DESC`,
        [accounts.map((account) => account.account_id)],
      );
      const currencies = new Map(accounts.map((account) => [account.account_id, normalizeCurrency(account.currency)]));
      return records.map((record) => ({
        id: record.id,
        account_id: record.account_id,
        adset_id: record.adset_id,
        adset_name: record.adset_name,
        stop_spend: record.stop_spend,
        currency: currencies.get(record.account_id) ?? UNKNOWN_CURRENCY,
        stop_leads: record.stop_leads,
        stop_registrations: record.stop_registrations,
        stopped_at: record.stopped_at,
      }));
    });
  }

  @Mutation(() => DeliveryPayload, { nullable: true, description: 'Dismisses a stopped ad set from the list.' })
  async adSetDismiss(@Arg('adSetId', () => String) adSetId: string, @Ctx() context: GraphQLContext): Promise<Payload> {
    const { user } = context;
    const record = await context.app.db.transaction(async (tx) => {
      const scope = await scopeOf(tx, user);
      ensureWriteAccess(scope, 'hiding an ad set notification', true);
      const stopped = await rows<{ id: number; account_id: string; adset_name: string }>(
        tx,
        'SELECT id, account_id, adset_name FROM stopped_adsets WHERE adset_id = $1 FOR UPDATE',
        [adSetId],
      );
      // scalar_one_or_none: two rows are a server error, as in Python.
      if (stopped.length > 1) throw new Error(`Multiple stopped_adsets rows for ${adSetId}`);
      const [entry] = stopped;
      if (!entry) throw new RouteError(404, 'Record not found.');
      let [account]: (AccountRow | undefined)[] = await rows<AccountRow>(
        tx,
        `SELECT * FROM accounts
          WHERE account_id = $1 AND (workspace_id = $2 OR (workspace_id IS NULL AND owner_user_id = $3))`,
        [entry.account_id, scope.workspaceId, user.id],
      );
      if (account && !allowsAccountPk(await accountAccess(tx, scope.member.id === null ? null : scope.member, scope.workspaceId), account.id)) {
        account = undefined;
      }
      if (!account) {
        return refuseRecorded(tx, user, scope.workspaceId, 403, 'Access denied.', 'DISMISS_ADSET', { type: 'adset', id: adSetId });
      }
      await rows(tx, 'UPDATE stopped_adsets SET is_resolved = true, updated_at = now() WHERE id = $1', [entry.id]);
      await recordAuditEvent(tx, {
        workspaceId: account.workspace_id,
        ownerUserId: account.owner_user_id,
        actorType: 'user',
        actorId: String(user.telegramId || user.id),
        category: 'MANUAL_ACTION',
        eventType: 'HIDE_STOPPED_NOTIFICATION',
        status: 'SUCCESS',
        accountId: account.account_id ?? '',
        accountName: account.name ?? '',
        adsetId: adSetId,
        adsetName: entry.adset_name ?? '',
        entityLevel: 'adset',
        entityId: adSetId,
        entityName: entry.adset_name ?? '',
        ruleId: null,
        ruleName: '',
        action: 'HIDE_NOTIFICATION',
        message: 'The completed-stop card was hidden by the user. The ad set remains off.',
        beforeState: { status: 'PAUSED', is_resolved: false },
        afterState: { status: 'PAUSED', is_resolved: true },
        details: {},
        correlationId: randomUUID().replaceAll('-', ''),
        durationMs: 0,
      });
      return { success: true, message: 'Card hidden. The ad set remains off.' };
    });
    return mutated(context, DeliveryPayload, record);
  }
}
