import { Arg, Ctx, Int, Mutation, Query, Resolver } from 'type-graphql';
import { rows } from '../../../database.ts';
import { ImageStorage } from '../../../uploads/images.ts';
import { userWorkspacesList } from '../../../workspaces/access.ts';
import { callerRole, refuseAndRecord } from '../../../workspaces/audit.ts';
import {
  CREATE_WORKSPACE,
  UPDATE_WORKSPACE,
  checkLogoOwner,
  dropLogoIfUnreferenced,
  insertWorkspace,
  newWorkspace,
  workspaceLogoUrl,
} from '../../../workspaces/create.ts';
import { allocateWorkspaceSlug, normalizeWorkspaceSlug, WorkspaceSlugUnavailable } from '../../../workspaces/slugs.ts';
import { mutated, type GraphQLContext } from '../../context.ts';
import { RouteError } from '../../errors.ts';
import { inputSchema } from '../../input.ts';
import { WorkspacePayload, type Payload } from '../../payloads.ts';
import { JSONScalar } from '../../scalars.ts';

// Workspaces (api/routers/workspaces.py).

const SWITCH = inputSchema<{ workspace_id?: number | null; slug?: string | null }>({
  type: 'object',
  properties: { workspace_id: { type: ['integer', 'null'] }, slug: { type: ['string', 'null'] } },
});

interface WorkspaceRow {
  id: number;
  slug: string;
  logo_url: string | null;
  owner_user_id: number;
}

const WORKSPACE = 'SELECT id, slug, logo_url, owner_user_id FROM workspaces WHERE id = $1';

@Resolver()
export class WorkspacesResolver {
  @Query(() => JSONScalar, { description: 'The workspaces the user belongs to.' })
  async workspaces(@Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    return app.db.transaction((tx) => userWorkspacesList(tx, user));
  }

  @Mutation(() => WorkspacePayload, { nullable: true, description: 'Creates a workspace.' })
  async workspaceCreate(@Arg('input', () => JSONScalar) input: unknown, @Ctx() context: GraphQLContext): Promise<Payload> {
    const req = CREATE_WORKSPACE.parse(input);
    const { app, user } = context;
    const fields = await newWorkspace(req, new ImageStorage(app.config.uploadsRoot), user.id);
    const item = await app.db.transaction(async (tx) => {
      const created = await insertWorkspace(tx, fields, user.id);
      await rows(
        tx,
        "UPDATE users SET active_workspace_id = $1, onboarding_completed = true, onboarding_step = 'completed' WHERE id = $2 RETURNING id",
        [created.id, user.id],
      );
      return created;
    });
    return mutated(context, WorkspacePayload, item);
  }

  @Mutation(() => WorkspacePayload, { nullable: true, description: "Changes a workspace's name, address or logo." })
  async workspaceUpdate(
    @Arg('id', () => Int) id: number,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const req = UPDATE_WORKSPACE.parse(input);
    const logo = workspaceLogoUrl(req.logo_url);
    const { app, user } = context;
    const images = new ImageStorage(app.config.uploadsRoot);
    const { oldLogo, newLogo } = await app.db.transaction(async (tx) => {
      const [ws] = await rows<WorkspaceRow>(tx, `${WORKSPACE} FOR UPDATE`, [id]);
      if (!ws) throw new RouteError(404, 'Workspace not found');
      const role = await callerRole(tx, user, id);
      if (role !== 'owner' && role !== 'admin') {
        await refuseAndRecord(tx, user, id, 'You do not have permission to edit this workspace', 'UPDATE_WORKSPACE', { id: String(id) });
      }
      const changes: Record<string, string> = {};
      if (req.name && req.name.trim()) changes.name = req.name.trim();
      // Settings → Workspace → URL. The old address stops working at once:
      // unlike Linear, Buyerly keeps no redirects from past slugs.
      if (req.slug !== null && req.slug !== undefined && normalizeWorkspaceSlug(req.slug) !== ws.slug) {
        try {
          changes.slug = await allocateWorkspaceSlug(tx, req.slug);
        } catch (error) {
          if (!(error instanceof WorkspaceSlugUnavailable)) throw error;
          throw new RouteError(409, error.message.includes('unavailable') ? error.message : 'That workspace URL is already taken');
        }
      }
      if (req.badge_color && req.badge_color.trim()) changes.badge_color = req.badge_color.trim();
      if (req.badge_text && req.badge_text.trim()) changes.badge_text = req.badge_text.trim();
      let logoUrl = ws.logo_url;
      if (logo !== null && logo !== undefined) {
        logoUrl = logo.trim();
        await checkLogoOwner(images, logoUrl, user.id);
        changes.logo_url = logoUrl;
      }
      const columns = Object.keys(changes);
      if (columns.length) {
        await rows(
          tx,
          `UPDATE workspaces SET ${columns.map((column, index) => `${column} = $${index + 2}`).join(', ')}, updated_at = now()
            WHERE id = $1 RETURNING id`,
          [id, ...columns.map((column) => changes[column])],
        );
      }
      return { oldLogo: ws.logo_url, newLogo: logoUrl };
    });
    if (oldLogo && oldLogo !== newLogo) await app.db.transaction((tx) => dropLogoIfUnreferenced(tx, images, oldLogo));
    const item = await app.db.transaction(async (tx) => (await userWorkspacesList(tx, user)).find((ws) => ws.id === id) ?? null);
    return mutated(context, WorkspacePayload, item);
  }

  @Mutation(() => WorkspacePayload, { nullable: true, description: 'Deletes a workspace.' })
  async workspaceDelete(@Arg('id', () => Int) id: number, @Ctx() context: GraphQLContext): Promise<Payload> {
    const { app, user } = context;
    const { next, oldLogo } = await app.db.transaction(async (tx) => {
      const [ws] = await rows<WorkspaceRow>(tx, WORKSPACE, [id]);
      if (!ws) throw new RouteError(404, 'Workspace not found');
      if (ws.owner_user_id !== user.id) {
        await refuseAndRecord(tx, user, id, 'Only the owner can delete a workspace', 'DELETE_WORKSPACE', { id: String(id) });
      }
      const [other] = await rows<{ workspace_id: number }>(
        tx,
        `SELECT m.workspace_id FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
          WHERE m.user_id = $1 AND m.workspace_id <> $2 LIMIT 1`,
        [user.id, id],
      );
      if (!other) throw new RouteError(400, 'You cannot delete your only workspace');
      await rows(tx, 'DELETE FROM workspace_members WHERE workspace_id = $1 RETURNING id', [id]);
      await rows(tx, 'DELETE FROM workspaces WHERE id = $1 RETURNING id', [id]);
      await rows(tx, 'UPDATE users SET active_workspace_id = $1 WHERE id = $2 RETURNING id', [other.workspace_id, user.id]);
      return { next: other.workspace_id, oldLogo: ws.logo_url };
    });
    if (oldLogo) await app.db.transaction((tx) => dropLogoIfUnreferenced(tx, new ImageStorage(app.config.uploadsRoot), oldLogo));
    return mutated(context, WorkspacePayload, { status: 'ok', message: 'Workspace deleted', next_workspace_id: next });
  }

  @Mutation(() => WorkspacePayload, { nullable: true, description: "Makes a workspace the user's active one." })
  async workspaceSwitch(@Arg('input', () => JSONScalar) input: unknown, @Ctx() context: GraphQLContext): Promise<Payload> {
    const req = SWITCH.parse(input);
    const { app, user } = context;
    const target = await app.db.transaction(async (tx) => {
      const [ws] = req.workspace_id
        ? await rows<{ id: number }>(tx, 'SELECT id FROM workspaces WHERE id = $1', [req.workspace_id])
        : req.slug
          ? await rows<{ id: number }>(tx, 'SELECT id FROM workspaces WHERE slug = $1', [req.slug])
          : [];
      if (!ws) throw new RouteError(404, 'Workspace not found');
      if (!(await callerRole(tx, user, ws.id))) {
        await refuseAndRecord(tx, user, ws.id, 'You do not have access to this workspace', 'SWITCH_WORKSPACE', { id: String(ws.id) });
      }
      await rows(tx, 'UPDATE users SET active_workspace_id = $1 WHERE id = $2 RETURNING id', [ws.id, user.id]);
      return ws.id;
    });
    // Listed for the user as the request found them, as Python's handler does.
    const active = await app.db.transaction(async (tx) => (await userWorkspacesList(tx, user)).find((ws) => ws.id === target) ?? null);
    return mutated(context, WorkspacePayload, { status: 'ok', active_workspace: active });
  }
}
