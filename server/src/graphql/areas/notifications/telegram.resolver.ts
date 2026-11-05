import { randomBytes } from 'node:crypto';
import { Ctx, Mutation, Query, Resolver } from 'type-graphql';
import { TelegramConnectionEntity, TelegramLinkTokenEntity } from '../../../entities/index.ts';
import { rateLimit } from '../../../http/rate-limit.ts';
import { connectionInfo, LINK_TTL_MS, noConnection, pythonIso, tokenHash } from '../../../notifications/telegram-link.ts';
import type { ActingMember } from '../../../workspaces/access.ts';
import { mutated, type GraphQLContext } from '../../context.ts';
import { RouteError } from '../../errors.ts';
import { TelegramPayload, type Payload } from '../../payloads.ts';
import { JSONScalar } from '../../scalars.ts';
import { workspaceMember } from '../views/views.resolver.ts';

// Settings → Connected accounts → Telegram (api/routers/telegram.py): the
// member's personal Telegram account. The bot side, the webhook that
// completes a link, is REST (routes/telegram.ts).

const LINK_LIMIT = rateLimit({ limit: 10, windowSeconds: 60, scope: 'telegram_link' });

function ownMember(member: ActingMember): number {
  if (member.id === null) throw new RouteError(403, 'Support access cannot change connected accounts.');
  return member.id;
}

@Resolver()
export class TelegramResolver {
  @Query(() => JSONScalar, { description: "The member's Telegram connection." })
  async telegramConnection(@Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    return app.db.transaction(async (tx) => {
      const { member } = await workspaceMember(tx, user);
      return connectionInfo(tx, member.id, app.services.telegram.configured);
    });
  }

  @Mutation(() => TelegramPayload, { nullable: true, description: "Creates the link that connects the member's Telegram." })
  async telegramLinkCreate(@Ctx() context: GraphQLContext): Promise<Payload> {
    const { app } = context;
    await LINK_LIMIT.call(app, context.http, context.reply);
    const bot = app.services.telegram;
    if (!bot.configured) throw new RouteError(503, 'Telegram is not set up on this server yet.');
    const username = await bot.username();
    if (!username) throw new RouteError(503, 'Telegram is not reachable right now. Try again later.');
    // A fresh one-time link; an older unused one stops working.
    const token = randomBytes(24).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LINK_TTL_MS);
    await app.db.transaction(async (tx) => {
      const memberId = ownMember((await workspaceMember(tx, context.user)).member);
      await tx.delete(TelegramLinkTokenEntity, { memberId });
      await tx.insert(TelegramLinkTokenEntity, { memberId, tokenHash: tokenHash(token), createdAt: now, expiresAt });
    });
    return mutated(context, TelegramPayload, { url: `https://t.me/${username}?start=${token}`, expires_at: pythonIso(expiresAt) });
  }

  @Mutation(() => TelegramPayload, { nullable: true, description: "Disconnects the member's Telegram." })
  async telegramDisconnect(@Ctx() context: GraphQLContext): Promise<Payload> {
    await context.app.db.transaction(async (tx) => {
      const memberId = ownMember((await workspaceMember(tx, context.user)).member);
      await tx.delete(TelegramConnectionEntity, { memberId });
      await tx.delete(TelegramLinkTokenEntity, { memberId });
    });
    return mutated(context, TelegramPayload, noConnection(context.app.services.telegram.configured));
  }
}
