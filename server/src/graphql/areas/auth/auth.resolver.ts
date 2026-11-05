import { Arg, Ctx, Mutation, Query, Resolver } from 'type-graphql';
import {
  endAllSessions,
  endSession,
  logout,
  requestEmailChange,
  userProfile,
  verifyEmailChange,
  webSessions,
} from '../../../routes/auth.ts';
import { mutated, type GraphQLContext } from '../../context.ts';
import { inputSchema } from '../../input.ts';
import { limitField } from '../../rate-limit.ts';
import { EmailChangePayload, SuccessPayload, type Payload } from '../../payloads.ts';
import { JSONScalar } from '../../scalars.ts';

// The signed-in account (api/routers/auth.py): profile, browser sessions,
// logging out and changing the email, named as Linear's client API names
// them (viewer, authenticationSessions, logout, logoutSession,
// logoutAllSessions). Signing in stays REST until it moves too (decision 55).

const REQUEST_EMAIL_CHANGE = inputSchema<{ new_email: string }>({
  type: 'object',
  required: ['new_email'],
  properties: { new_email: { type: 'string', minLength: 3, maxLength: 255 } },
});

const VERIFY_EMAIL_CHANGE = inputSchema<{ code: string }>({
  type: 'object',
  required: ['code'],
  properties: { code: { type: 'string', minLength: 1, maxLength: 20 } },
});

function auth(context: GraphQLContext) {
  return context.http.auth!;
}

@Resolver()
export class AuthResolver {
  @Query(() => JSONScalar, { description: "The signed-in user's profile and the workspaces they belong to." })
  async viewer(@Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    return app.db.transaction((tx) => userProfile(tx, user.id));
  }

  @Query(() => JSONScalar, { description: "The user's signed-in browsers, most recently used first." })
  async authenticationSessions(@Ctx() context: GraphQLContext): Promise<unknown> {
    return webSessions(context.app, auth(context));
  }

  @Mutation(() => SuccessPayload, { nullable: true, description: "Logs this account out of this browser; the browser's other accounts stay." })
  async logout(@Ctx() context: GraphQLContext): Promise<Payload> {
    await logout(context.app, context.reply, auth(context));
    return mutated(context, SuccessPayload);
  }

  @Mutation(() => SuccessPayload, { nullable: true, description: "Ends one of the user's sessions." })
  async logoutSession(@Arg('sessionId', () => String) sessionId: string, @Ctx() context: GraphQLContext): Promise<Payload> {
    await endSession(context.app, context.reply, auth(context), sessionId);
    return mutated(context, SuccessPayload);
  }

  @Mutation(() => SuccessPayload, { nullable: true, description: "Ends every session of the user; with keepCurrent, all but this one." })
  async logoutAllSessions(
    @Ctx() context: GraphQLContext,
    @Arg('keepCurrent', () => Boolean, { defaultValue: false }) keepCurrent: boolean,
  ): Promise<Payload> {
    await endAllSessions(context.app, context.reply, auth(context), keepCurrent);
    return mutated(context, SuccessPayload);
  }

  @Mutation(() => EmailChangePayload, { nullable: true, description: 'Mails a code that attaches or changes the email of the user.' })
  async userEmailChangeRequest(@Arg('input', () => JSONScalar) input: unknown, @Ctx() context: GraphQLContext): Promise<Payload> {
    limitField(context, 'email_change_req', 5);
    const req = REQUEST_EMAIL_CHANGE.parse(input);
    return mutated(context, EmailChangePayload, await requestEmailChange(context.app, context.user.id, req.new_email));
  }

  @Mutation(() => EmailChangePayload, { nullable: true, description: 'Confirms the code and makes the new email the user\'s own.' })
  async userEmailChangeVerify(@Arg('input', () => JSONScalar) input: unknown, @Ctx() context: GraphQLContext): Promise<Payload> {
    limitField(context, 'verify_email_code', 10);
    const req = VERIFY_EMAIL_CHANGE.parse(input);
    return mutated(context, EmailChangePayload, await verifyEmailChange(context.app, context.http, context.user.id, req.code));
  }
}
