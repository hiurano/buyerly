import { Arg, Ctx, Int, Mutation, Query, Resolver } from 'type-graphql';
import type { EntityManager } from 'typeorm';
import { rows } from '../../../database.ts';
import type { UserEntity } from '../../../entities/index.ts';
import { connectionAssets, discoverAccounts, importAccounts, listConnections, requestedAccountIds } from '../../../meta/connection-accounts.ts';
import { createMetaInvite, INVITE_DEFAULT_TTL_HOURS, MetaNotConfigured, oauthClient, startOAuth } from '../../../meta/connections.ts';
import { userWorkspaceMember, type ActingMember } from '../../../workspaces/access.ts';
import { mutated, type GraphQLContext } from '../../context.ts';
import { RouteError } from '../../errors.ts';
import { inputSchema } from '../../input.ts';
import { MetaConnectionPayload, MetaInvitePayload, MetaOAuthPayload, type Payload } from '../../payloads.ts';
import { limitField } from '../../rate-limit.ts';
import { JSONScalar } from '../../scalars.ts';

// Meta connections (api/meta_oauth.py, #611 stage 4): the list, reading a
// connection's ad accounts and adding them, invite links and the start of
// Facebook login. The callback and the invite landing page stay
// REST (routes/meta-oauth.ts).

interface CreateInvite {
  label?: string;
  expires_in_hours?: number;
}

// CreateMetaInviteRequest.
const CREATE_INVITE = inputSchema<CreateInvite>({
  type: 'object',
  additionalProperties: false,
  properties: {
    label: { type: 'string', maxLength: 100 },
    expires_in_hours: { type: 'integer', minimum: 1, maximum: 168 },
  },
});

// MetaAccountImportRequest.
const IMPORT = inputSchema<{ account_ids: string[] }>({
  type: 'object',
  additionalProperties: false,
  required: ['account_ids'],
  properties: {
    account_ids: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'string' } },
  },
});

// get_user_workspace_member + ensure_workspace_write_access.
async function writableWorkspace(tx: EntityManager, user: UserEntity, action: string): Promise<{ workspaceId: number; member: ActingMember }> {
  const found = await userWorkspaceMember(tx, user);
  if (!found) throw new RouteError(404, 'Workspace not found');
  if (found.member.role === 'guest') throw new RouteError(403, `Guests can't perform ${action}`);
  return { workspaceId: found.workspace.id, member: found.member };
}

// _workspace_connection: the connection in the caller's workspace; members see only their own.
export async function workspaceConnection(
  tx: EntityManager,
  user: UserEntity,
  connectionId: number,
  scope: { workspaceId: number; member: ActingMember },
): Promise<{ id: number }> {
  const admin = scope.member.role === 'owner' || scope.member.role === 'admin';
  const [connection] = await rows<{ id: number }>(
    tx,
    `SELECT id FROM meta_connections WHERE id = $1 AND workspace_id = $2 ${admin ? '' : 'AND owner_user_id = $3'}`,
    admin ? [connectionId, scope.workspaceId] : [connectionId, scope.workspaceId, user.id],
  );
  if (!connection) throw new RouteError(404, 'Meta connection not found');
  return connection;
}

const notConfigured = (error: unknown): never => {
  if (error instanceof MetaNotConfigured) throw new RouteError(503, error.detail);
  throw error;
};

@Resolver()
export class MetaResolver {
  @Query(() => JSONScalar, { description: "The workspace's Meta connections." })
  async metaConnections(@Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    return app.db.transaction(async (tx) => {
      const found = await userWorkspaceMember(tx, user);
      return listConnections(tx, user, found ? { workspaceId: found.workspace.id, member: found.member } : null);
    });
  }

  @Mutation(() => MetaConnectionPayload, { nullable: true, description: "Reads a Meta connection's ad accounts from Meta again." })
  async metaConnectionDiscover(@Arg('connectionId', () => Int) connectionId: number, @Ctx() context: GraphQLContext): Promise<Payload> {
    const { app, user } = context;
    await app.db.transaction(async (tx) => {
      const scope = await writableWorkspace(tx, user, 'changing the Meta connection');
      await workspaceConnection(tx, user, connectionId, scope);
      try {
        await discoverAccounts(app, tx, connectionId);
      } catch (error) {
        notConfigured(error);
      }
    });
    // As Python, the list is read again after the discovery is committed.
    const assets = await app.db.transaction(async (tx) => {
      const found = await userWorkspaceMember(tx, user);
      if (!found) throw new RouteError(404, 'Workspace not found');
      const scope = { workspaceId: found.workspace.id, member: found.member };
      await workspaceConnection(tx, user, connectionId, scope);
      return connectionAssets(tx, user, connectionId, scope);
    });
    return mutated(context, MetaConnectionPayload, assets);
  }

  @Mutation(() => MetaConnectionPayload, { nullable: true, description: 'Adds ad accounts of a Meta connection to the workspace.' })
  async metaConnectionImport(
    @Arg('connectionId', () => Int) connectionId: number,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const request = IMPORT.parse(input);
    const requested = requestedAccountIds(request.account_ids);
    const { app, user } = context;
    const result = await app.db.transaction(async (tx) => {
      const scope = await writableWorkspace(tx, user, 'changing the Meta connection');
      await workspaceConnection(tx, user, connectionId, scope);
      return importAccounts(app, tx, user, connectionId, scope, requested);
    });
    return mutated(context, MetaConnectionPayload, result);
  }

  @Mutation(() => MetaInvitePayload, { nullable: true, description: 'Creates a one-time link for someone else to connect their Facebook profile.' })
  async metaInviteCreate(@Arg('input', () => JSONScalar) input: unknown, @Ctx() context: GraphQLContext): Promise<Payload> {
    limitField(context, 'meta_invite_create', 20);
    const request = CREATE_INVITE.parse(input);
    const { app, user } = context;
    const invite = await app.db.transaction(async (tx) => {
      const { workspaceId } = await writableWorkspace(tx, user, 'creating a Meta invite link');
      return createMetaInvite(tx, user, workspaceId, app.config.webappUrl, {
        label: request.label ?? '',
        expires_in_hours: request.expires_in_hours ?? INVITE_DEFAULT_TTL_HOURS,
      });
    });
    return mutated(context, MetaInvitePayload, invite);
  }

  @Mutation(() => MetaOAuthPayload, { nullable: true, description: 'Starts Facebook login; returns the address to send the browser to.' })
  async metaOauthStart(
    @Arg('returnPath', () => String, { nullable: true, defaultValue: null }) returnPath: string | null,
    @Arg('reconnectConnectionId', () => Int, { nullable: true, defaultValue: null }) reconnectConnectionId: number | null,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    limitField(context, 'oauth_start', 10);
    const { app, user } = context;
    // The settings are checked first: _oauth_client() runs before the workspace lookup.
    try {
      oauthClient(app);
    } catch (error) {
      notConfigured(error);
    }
    const authorization = await app.db.transaction(async (tx) => {
      const scope = await writableWorkspace(tx, user, 'connecting a Facebook profile');
      if (reconnectConnectionId) await workspaceConnection(tx, user, reconnectConnectionId, scope);
      return startOAuth(app, tx, user, scope.workspaceId, returnPath ?? '/', reconnectConnectionId || null);
    });
    return mutated(context, MetaOAuthPayload, authorization);
  }
}
