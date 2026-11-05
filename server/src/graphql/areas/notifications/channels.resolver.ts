import type { EntityManager } from 'typeorm';
import { Arg, Ctx, Mutation, Query, Resolver } from 'type-graphql';
import type { NotificationChannels } from '@buyerly/shared';
import { AccountEntity, AccountNotificationSettingEntity, WorkspaceMemberEntity, type UserEntity } from '../../../entities/index.ts';
import { NOTIFICATION_CHANNELS, storedNotificationChannels } from '../../../notifications/channels.ts';
import { after, field, list, model, str, ValueError } from '../../../notifications/model.ts';
import type { ActingMember } from '../../../workspaces/access.ts';
import { accountAccess, allowsAccountPk } from '../../../workspaces/account-access.ts';
import { mutated, type GraphQLContext } from '../../context.ts';
import { RouteError } from '../../errors.ts';
import { AccountNotificationSettingPayload, NotificationChannelsPayload, type Payload } from '../../payloads.ts';
import { JSONScalar } from '../../scalars.ts';
import { workspaceMember } from '../views/views.resolver.ts';
import { parseBody } from './body.ts';

// Settings → Notifications (api/routers/audit.py notification channels) and
// Linear's bell on a project, for an ad account (api/routers/account_notifications.py):
// which of the account's events reach the member's Inbox.

// The stored channels of the member; support access without a row has the defaults.
export async function memberChannels(tx: EntityManager, member: ActingMember): Promise<NotificationChannels> {
  const stored = member.id === null ? null : await tx.findOneBy(WorkspaceMemberEntity, { id: member.id });
  return storedNotificationChannels(stored?.notificationChannels ?? null);
}

// Inbox kinds an ad account's events can be; Team belongs to no account.
const ACCOUNT_NOTIFICATION_KINDS = ['urgent', 'rule_alerts', 'rule_actions', 'assistant', 'manual', 'system'];

const ACCOUNT_NOTIFICATIONS = model('AccountNotificationsPayload', {
  kinds: field(after(list(str()), (kinds) => {
    if (kinds.some((kind) => !ACCOUNT_NOTIFICATION_KINDS.includes(kind))) throw new ValueError('Unknown kind of notification.');
    return ACCOUNT_NOTIFICATION_KINDS.filter((kind) => kinds.includes(kind));
  })),
});

interface AccountNotifications { account_id: string; kinds: string[]; custom: boolean }

async function memberAndAccount(tx: EntityManager, user: UserEntity, accountId: string): Promise<{ member: ActingMember; account: AccountEntity }> {
  const { workspaceId, member } = await workspaceMember(tx, user);
  const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
  const account = await tx.findOneBy(AccountEntity, { workspaceId, accountId: actId });
  if (!account || !allowsAccountPk(await accountAccess(tx, member, workspaceId), account.id)) {
    throw new RouteError(404, 'Ad account not found');
  }
  return { member, account };
}

async function answer(tx: EntityManager, user: UserEntity, member: ActingMember, account: AccountEntity): Promise<AccountNotifications> {
  const rows = member.id === null
    ? []
    : await tx.findBy(AccountNotificationSettingEntity, { memberId: member.id, accountId: account.accountId });
  if (!rows.length) {
    // Inbox's rule without a choice: all of it for the lead, or for everyone while nobody leads.
    const lead = account.leadUserId === null || account.leadUserId === user.id;
    return { account_id: account.accountId, kinds: lead ? [...ACCOUNT_NOTIFICATION_KINDS] : [], custom: false };
  }
  const enabled = new Set(rows.filter((row) => row.enabled).map((row) => row.kind));
  return { account_id: account.accountId, kinds: ACCOUNT_NOTIFICATION_KINDS.filter((kind) => enabled.has(kind)), custom: true };
}

@Resolver()
export class NotificationChannelsResolver {
  @Query(() => JSONScalar, { description: "Where the member's notifications go besides the Inbox." })
  async notificationChannels(@Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    return app.db.transaction(async (tx) => memberChannels(tx, (await workspaceMember(tx, user)).member));
  }

  @Mutation(() => NotificationChannelsPayload, {
    nullable: true,
    description: "Sets where the member's notifications go besides the Inbox.",
  })
  async notificationChannelsUpdate(@Arg('input', () => JSONScalar) input: unknown, @Ctx() context: GraphQLContext): Promise<Payload> {
    const channels = parseBody(NOTIFICATION_CHANNELS, input);
    await context.app.db.transaction(async (tx) => {
      const { member } = await workspaceMember(tx, context.user);
      if (member.id === null) throw new RouteError(403, 'Support access cannot change these settings.');
      await tx.update(WorkspaceMemberEntity, { id: member.id }, { notificationChannels: channels });
    });
    return mutated(context, NotificationChannelsPayload, channels);
  }

  @Query(() => JSONScalar, { description: "The member's notification settings for one ad account (its bell)." })
  async accountNotificationSetting(@Arg('accountId') accountId: string, @Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    return app.db.transaction(async (tx) => {
      const { member, account } = await memberAndAccount(tx, user, accountId);
      return answer(tx, user, member, account);
    });
  }

  @Mutation(() => AccountNotificationSettingPayload, {
    nullable: true,
    description: "Sets the member's notifications for one ad account.",
  })
  async accountNotificationSettingUpdate(
    @Arg('accountId') accountId: string,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const { kinds } = parseBody(ACCOUNT_NOTIFICATIONS, input);
    const result = await context.app.db.transaction(async (tx) => {
      const { member, account } = await memberAndAccount(tx, context.user, accountId);
      if (member.id === null) throw new RouteError(403, 'Support access keeps no notification settings.');
      // Every kind keeps the member's choice, so a kind left out stays out even once they lead the account.
      await tx.delete(AccountNotificationSettingEntity, { memberId: member.id, accountId: account.accountId });
      const now = new Date();
      await tx.insert(AccountNotificationSettingEntity, ACCOUNT_NOTIFICATION_KINDS.map((kind) => ({
        memberId: member.id!,
        accountId: account.accountId,
        kind,
        enabled: kinds.includes(kind),
        updatedAt: now,
      })));
      return answer(tx, context.user, member, account);
    });
    return mutated(context, AccountNotificationSettingPayload, result);
  }
}
