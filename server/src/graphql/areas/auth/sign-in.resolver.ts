import type {
  RequestTemporaryPasswordRequest,
  VerifyEmailLinkRequest,
  VerifyTemporaryPasswordRequest,
} from '@buyerly/shared';
import { Arg, Ctx, Mutation, Query, Resolver } from 'type-graphql';
import {
  REQUEST_TEMPORARY_PASSWORD,
  VERIFY_EMAIL_LINK,
  VERIFY_TEMPORARY_PASSWORD,
  browserAccounts,
  requestLoginCode,
  verifyLoginCode,
  verifyLoginLink,
} from '../../../routes/auth.ts';
import { publicMetaInviteInfo } from '../../../meta/connections.ts';
import { publicInviteInfo } from '../../../routes/invites.ts';
import type { GraphQLContext } from '../../context.ts';
import { inputSchema } from '../../input.ts';
import { limitField } from '../../rate-limit.ts';
import { JSONScalar } from '../../scalars.ts';

// Signing in and what the pages before it read (api/routers/auth.py,
// members.get_public_invite_info), named as Linear's client API names them
// where it has them (emailUserAccountAuthChallenge, emailTokenUserAccountAuth,
// availableUsers). These are the public fields (graphql/public.ts): they run
// without a session, so they read nothing of `context.user`.

const CHALLENGE = inputSchema<RequestTemporaryPasswordRequest>(REQUEST_TEMPORARY_PASSWORD);
const CODE = inputSchema<VerifyTemporaryPasswordRequest>(VERIFY_TEMPORARY_PASSWORD);
const LINK = inputSchema<VerifyEmailLinkRequest>(VERIFY_EMAIL_LINK);

// The input's field that names the account, for its own rate-limit counter.
function named(input: unknown, field: string): string {
  const value = input && typeof input === 'object' ? (input as Record<string, unknown>)[field] : undefined;
  return typeof value === 'string' ? value : '';
}

@Resolver()
export class SignInResolver {
  @Query(() => JSONScalar, { description: 'Every account signed in to this browser, in the order they were added.' })
  async availableUsers(@Ctx() context: GraphQLContext): Promise<unknown> {
    return browserAccounts(context.app, context.http, context.reply);
  }

  @Query(() => JSONScalar, { description: 'What an invite link offers, for the page shown before signing in.' })
  async workspaceInviteDetails(@Arg('token', () => String) token: string, @Ctx() context: GraphQLContext): Promise<unknown> {
    limitField(context, 'invite_info', 30);
    return publicInviteInfo(context.app, token);
  }

  @Query(() => JSONScalar, { description: 'What a Meta connection invite link offers, for the page shown before connecting.' })
  async metaInviteDetails(@Arg('token', () => String) token: string, @Ctx() context: GraphQLContext): Promise<unknown> {
    limitField(context, 'meta_invite_public', 30);
    return context.app.db.transaction((tx) => publicMetaInviteInfo(tx, token));
  }

  @Mutation(() => JSONScalar, { description: 'Mails a sign-in code and link; a new address without an invite passes Turnstile first.' })
  async emailUserAccountAuthChallenge(@Arg('input', () => JSONScalar) input: unknown, @Ctx() context: GraphQLContext): Promise<unknown> {
    limitField(context, 'otp_req', 5, 60, named(input, 'email'));
    return requestLoginCode(context.app, context.http, CHALLENGE.parse(input));
  }

  @Mutation(() => JSONScalar, { description: 'Signs in with the emailed code, creating the account on first sign-in.' })
  async emailTokenUserAccountAuth(@Arg('input', () => JSONScalar) input: unknown, @Ctx() context: GraphQLContext): Promise<unknown> {
    limitField(context, 'verify_login_otp', 10, 60, named(input, 'email'));
    return verifyLoginCode(context.app, context.http, context.reply, CODE.parse(input));
  }

  @Mutation(() => JSONScalar, { description: 'Signs in with the emailed one-time link.' })
  async emailLinkUserAccountAuth(@Arg('input', () => JSONScalar) input: unknown, @Ctx() context: GraphQLContext): Promise<unknown> {
    limitField(context, 'verify_login_link', 10, 60, named(input, 'token'));
    return verifyLoginLink(context.app, context.http, context.reply, LINK.parse(input).token);
  }
}
