import { Arg, Ctx, Mutation, Query, Resolver } from 'type-graphql';
import type { EntityManager } from 'typeorm';
import type { JsonObject } from '@buyerly/shared';
import { ViewSettingEntity, WorkspaceViewDefaultEntity, type UserEntity } from '../../../entities/index.ts';
import { userWorkspaceMember, type ActingMember } from '../../../workspaces/access.ts';
import { mutated, type GraphQLContext } from '../../context.ts';
import { RouteError } from '../../errors.ts';
import { SuccessPayload, ViewSettingPayload, type Payload } from '../../payloads.ts';
import { JSONScalar } from '../../scalars.ts';
import { ValueError, dictionary, model, pythonJsonLength } from './body.ts';

// Each member's list views and the workspace's defaults (api/routers/views.py,
// #385, #472). The server stores a small JSON object per key and does not
// know a page's shape.

// "rules", "inbox", "ads-manager.campaigns", "ad-accounts"…
const VIEW_KEY_PATTERN = /^[a-z][a-z0-9-]{0,31}(\.[a-z0-9-]{1,31})?$/;
const MAX_VIEW_BYTES = 16_384;
const MAX_VIEWS_PER_MEMBER = 100;
const MAX_DEFAULTS_PER_WORKSPACE = 100;

const VIEW = model({
  settings: dictionary<JsonObject>((value) => {
    if (pythonJsonLength(value) > MAX_VIEW_BYTES) {
      throw new ValueError(`View settings must be under ${Math.floor(MAX_VIEW_BYTES / 1024)} KB`);
    }
    return value as JsonObject;
  }),
});

function viewKey(key: string): string {
  // re.match anchors at the start only; `$` also matches before a final newline.
  if (!VIEW_KEY_PATTERN.test(key.replace(/\n$/, ''))) throw new RouteError(404, 'Unknown view.');
  return key;
}

// views.py _workspace_member; favorites share it.
export async function workspaceMember(tx: EntityManager, user: UserEntity): Promise<{ workspaceId: number; member: ActingMember }> {
  const found = await userWorkspaceMember(tx, user);
  if (!found) throw new RouteError(404, 'Workspace not found.');
  return { workspaceId: found.workspace.id, member: found.member };
}

function writable(member: ActingMember): number {
  // Support access without a membership row sees the defaults and keeps nothing.
  if (member.id === null) throw new RouteError(403, 'Support access cannot change views.');
  return member.id;
}

function objects(rows: { viewKey: string; settings: unknown }[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    if (row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings)) result[row.viewKey] = row.settings;
  }
  return result;
}

@Resolver()
export class ViewsResolver {
  @Query(() => JSONScalar, { description: "The member's saved view options and the workspace's defaults." })
  async viewSettings(@Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    return app.db.transaction(async (tx) => {
      const { workspaceId, member } = await workspaceMember(tx, user);
      const defaults = await tx.find(WorkspaceViewDefaultEntity, { where: { workspaceId }, order: { id: 'ASC' } });
      const views = member.id === null ? [] : await tx.find(ViewSettingEntity, { where: { memberId: member.id }, order: { id: 'ASC' } });
      return { views: objects(views), defaults: objects(defaults) };
    });
  }

  @Mutation(() => ViewSettingPayload, { nullable: true, description: "Saves the member's options for a view." })
  async viewSettingUpdate(
    @Arg('key', () => String) key: string,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const { settings } = VIEW(input);
    const name = viewKey(key);
    await context.app.db.transaction(async (tx) => {
      const memberId = writable((await workspaceMember(tx, context.user)).member);
      let stored = await tx.findOneBy(ViewSettingEntity, { memberId, viewKey: name });
      if (!stored) {
        if ((await tx.countBy(ViewSettingEntity, { memberId })) >= MAX_VIEWS_PER_MEMBER) {
          throw new RouteError(400, 'Too many saved views.');
        }
        stored = tx.create(ViewSettingEntity, { memberId, viewKey: name });
      }
      stored.settings = settings;
      stored.updatedAt = new Date();
      await tx.save(stored);
    });
    return mutated(context, ViewSettingPayload, { view_key: name, settings });
  }

  @Mutation(() => SuccessPayload, { nullable: true, description: "Resets the member's options for a view to the workspace's default." })
  async viewSettingReset(@Arg('key', () => String) key: string, @Ctx() context: GraphQLContext): Promise<Payload> {
    const name = viewKey(key);
    await context.app.db.transaction(async (tx) => {
      const memberId = writable((await workspaceMember(tx, context.user)).member);
      await tx.delete(ViewSettingEntity, { memberId, viewKey: name });
    });
    return mutated(context, SuccessPayload);
  }

  @Mutation(() => ViewSettingPayload, { nullable: true, description: "Saves a view's options as the workspace's default." })
  async workspaceViewDefaultUpdate(
    @Arg('key', () => String) key: string,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    // Linear's "Set default for everyone": admins and owners only. An empty view clears it.
    const { settings } = VIEW(input);
    const name = viewKey(key);
    const user = context.user;
    const saved = await context.app.db.transaction(async (tx) => {
      const { workspaceId, member } = await workspaceMember(tx, user);
      writable(member);
      if (member.role !== 'owner' && member.role !== 'admin') {
        throw new RouteError(403, "Only admins can set a view's default for everyone.");
      }
      const stored = await tx.findOneBy(WorkspaceViewDefaultEntity, { workspaceId, viewKey: name });
      if (Object.keys(settings).length === 0) {
        if (stored) await tx.remove(stored);
        return {};
      }
      const row = stored ?? (await (async () => {
        if ((await tx.countBy(WorkspaceViewDefaultEntity, { workspaceId })) >= MAX_DEFAULTS_PER_WORKSPACE) {
          throw new RouteError(400, 'Too many default views.');
        }
        return tx.create(WorkspaceViewDefaultEntity, { workspaceId, viewKey: name });
      })());
      row.settings = settings;
      row.updatedByUserId = user.id;
      row.updatedAt = new Date();
      await tx.save(row);
      return settings;
    });
    return mutated(context, ViewSettingPayload, { view_key: name, settings: saved });
  }
}
