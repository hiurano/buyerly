import { Ctx, Query, Resolver } from 'type-graphql';
import { utcIsoSql } from '../../../audit/events.ts';
import { KIND_RULE, KIND_RULE_GROUP, purgeAtSql, purgeExpired } from '../../../trash/trash.ts';
import { userWorkspace } from '../../../workspaces/access.ts';
import type { GraphQLContext } from '../../context.ts';
import { JSONScalar } from '../../scalars.ts';

// Recently deleted (api/routers/trash.py list_deleted_items). Restoring an
// item re-attaches a rule to its ad accounts with the rules' compatibility
// check, so deletedItemRestore lives with the rules area (areas/rules).

interface DeletedItemRow {
  id: number;
  kind: string;
  entity_id: number;
  name: string;
  deleted_at: string;
  purge_at: string;
  deleted_by: string;
}

@Resolver()
export class TrashResolver {
  @Query(() => JSONScalar, { description: 'Recently deleted rules and labels.' })
  async deletedItems(@Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    const workspace = await app.db.transaction(async (tx) => {
      const found = await userWorkspace(tx, user);
      if (!found) throw new Error('No workspace for the deleted items');
      await purgeExpired(tx, found.id);
      return found;
    });
    const rows = await app.db.transaction((tx) => tx.query<DeletedItemRow[]>(
      `SELECT d.id, d.kind, d.entity_id, d.name,
              ${utcIsoSql('d.deleted_at')} AS deleted_at,
              ${utcIsoSql(purgeAtSql('d.deleted_at'))} AS purge_at,
              -- trash.py _person_label: full name, else username, else email.
              coalesce(nullif(u.full_name, ''), nullif(u.username, ''), nullif(u.email, ''), '') AS deleted_by
         FROM deleted_items d LEFT JOIN users u ON u.id = d.deleted_by_user_id
        WHERE d.workspace_id = $1
        ORDER BY d.deleted_at DESC, d.id DESC`,
      [workspace.id],
    ));
    // response_model's Literal["rule", "rule_group"]: any other kind is a 500.
    if (rows.some((row) => row.kind !== KIND_RULE && row.kind !== KIND_RULE_GROUP)) throw new Error('Unknown deleted item kind');
    return rows;
  }
}
