import { Ctx, Query, Resolver } from 'type-graphql';
import { userWorkspacesList } from '../../../workspaces/access.ts';
import type { GraphQLContext } from '../../context.ts';
import { JSONScalar } from '../../scalars.ts';

// Workspaces (api/routers/workspaces.py, members.py). The rest of the area's
// fields move here with it.
@Resolver()
export class WorkspacesResolver {
  @Query(() => JSONScalar, { description: 'The workspaces the user belongs to.' })
  async workspaces(@Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    return app.db.transaction((tx) => userWorkspacesList(tx, user));
  }
}
