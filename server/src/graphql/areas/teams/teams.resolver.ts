import { Arg, Ctx, Int, Mutation, Query, Resolver } from 'type-graphql';
import type { EntityManager } from 'typeorm';
import { rows } from '../../../database.ts';
import { isUniqueViolation } from '../../../workspaces/sql.ts';
import { mutated, type GraphQLContext } from '../../context.ts';
import { RouteError, invalidInput } from '../../errors.ts';
import { inputSchema } from '../../input.ts';
import { TeamDocumentPayload, TeamPayload, type Payload } from '../../payloads.ts';
import { JSONScalar } from '../../scalars.ts';
import {
  DOCUMENT_COLUMNS,
  TEAM_COLUMNS,
  cleanKey,
  cleanName,
  ensureUnique,
  loadTeam,
  purgeExpired,
  requireTeamContent,
  requireTeamManager,
  teamItem,
  teamItems,
  workspaceRole,
  type TeamDocumentItem,
  type TeamRow,
} from './teams.ts';

// Teams, their members, ad accounts and documents (api/routers/teams.py).

const text = (maxLength: number) => ({ type: 'string', maxLength });
const optionalText = (maxLength: number) => ({ type: ['string', 'null'], maxLength });

// api/schemas/teams.py request models; pydantic ignores fields it doesn't know.
const CREATE = inputSchema<{ name: string; key: string; description?: string; private?: boolean }>({
  type: 'object',
  required: ['name', 'key'],
  properties: { name: text(48), key: text(7), description: text(255), private: { type: 'boolean' } },
});
const UPDATE = inputSchema<{ name?: string | null; key?: string | null; description?: string | null; private?: boolean | null }>({
  type: 'object',
  properties: {
    name: optionalText(48),
    key: optionalText(7),
    description: optionalText(255),
    private: { type: ['boolean', 'null'] },
  },
});
const ids = (key: string, maxItems: number) => inputSchema<Record<string, number[]>>({
  type: 'object',
  required: [key],
  properties: { [key]: { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems } },
});
const MEMBERS = ids('user_ids', 500);
const ACCOUNTS = ids('account_ids', 1000);
const OWNER = inputSchema<{ is_owner: boolean }>({
  type: 'object',
  required: ['is_owner'],
  properties: { is_owner: { type: 'boolean' } },
});
const DOCUMENT = inputSchema<{ title?: string | null; content?: string | null }>({
  type: 'object',
  properties: { title: optionalText(255), content: optionalText(200_000) },
});

const STATUS = /^(all|active|retired|deleted)$/;

// _commit_unique: two admins saving the same name at once; the index decides, the loser gets a 409.
async function uniquely<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isUniqueViolation(error)) throw new RouteError(409, 'A team with this name or identifier already exists');
    throw error;
  }
}

async function loadDocument(tx: EntityManager, teamId: number, documentId: number): Promise<TeamDocumentItem> {
  const [document] = await rows<TeamDocumentItem>(tx, `SELECT ${DOCUMENT_COLUMNS} FROM team_documents WHERE id = $1 AND team_id = $2`, [documentId, teamId]);
  if (!document) throw new RouteError(404, 'Document not found');
  return document;
}

@Resolver()
export class TeamsResolver {
  @Query(() => JSONScalar, { description: "The workspace's teams, active or retired." })
  async teams(
    @Arg('workspaceId', () => Int) workspaceId: number,
    @Arg('status', () => String, { nullable: true, defaultValue: null }) status: string | null,
    @Ctx() { app, user }: GraphQLContext,
  ): Promise<unknown> {
    const filter = status ?? 'all';
    if (!STATUS.test(filter)) throw invalidInput([`String should match pattern '${STATUS.source}'`]);
    return app.db.transaction(async (tx) => {
      const member = await workspaceRole(tx, user, workspaceId);
      await purgeExpired(tx, workspaceId);
      let where = 't.deleted_at IS NULL';
      let order = 'lower(t.name) ASC, t.id ASC';
      if (filter === 'deleted') {
        where = 't.deleted_at IS NOT NULL';
        order = 't.deleted_at DESC';
      } else if (filter === 'active') where += ' AND t.retired_at IS NULL';
      else if (filter === 'retired') where += ' AND t.retired_at IS NOT NULL';
      const teams = await rows<TeamRow>(tx, `SELECT ${TEAM_COLUMNS} FROM teams t WHERE t.workspace_id = $1 AND ${where} ORDER BY ${order}`, [workspaceId]);
      const items = await teamItems(tx, teams, user);
      // As Linear's: a private team shows to its members, and to admins in Settings so they can join it;
      // a guest sees only the teams they're on.
      const manager = member.role === 'owner' || member.role === 'admin';
      return items.filter((item) => item.is_member || (member.role !== 'guest' && (!item.private || manager)));
    });
  }

  @Query(() => JSONScalar, { description: "A team's documents." })
  async teamDocuments(
    @Arg('workspaceId', () => Int) workspaceId: number,
    @Arg('teamId', () => Int) teamId: number,
    @Ctx() { app, user }: GraphQLContext,
  ): Promise<unknown> {
    return app.db.transaction(async (tx) => {
      const member = await workspaceRole(tx, user, workspaceId);
      const team = await loadTeam(tx, workspaceId, teamId);
      await requireTeamContent(tx, member, team);
      return rows<TeamDocumentItem>(tx, `SELECT ${DOCUMENT_COLUMNS} FROM team_documents WHERE team_id = $1 ORDER BY updated_at DESC, id DESC`, [team.id]);
    });
  }

  @Mutation(() => TeamPayload, { nullable: true, description: 'Creates a team.' })
  async teamCreate(
    @Arg('workspaceId', () => Int) workspaceId: number,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const req = CREATE.parse(input);
    const { app, user } = context;
    const item = await uniquely(() => app.db.transaction(async (tx) => {
      const member = await workspaceRole(tx, user, workspaceId);
      if (member.role === 'guest') throw new RouteError(403, "Guests can't create teams");
      const name = cleanName(req.name);
      const key = cleanKey(req.key);
      await ensureUnique(tx, workspaceId, name, key);
      const [team] = await rows<{ id: number }>(
        tx,
        `INSERT INTO teams (workspace_id, name, key, description, created_by_user_id, private, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now(), now()) RETURNING id`,
        [workspaceId, name, key, (req.description ?? '').trim(), user.id, req.private ?? false],
      );
      // A support session's member is not a real row: it creates the team without joining it.
      if (member.id !== null) {
        await rows(tx, 'INSERT INTO team_members (team_id, member_id, is_owner, joined_at) VALUES ($1, $2, true, now()) RETURNING id', [team.id, member.id]);
      }
      return teamItem(tx, team.id, workspaceId, user);
    }));
    return mutated(context, TeamPayload, item);
  }

  @Mutation(() => TeamPayload, { nullable: true, description: 'Changes a team.' })
  async teamUpdate(
    @Arg('workspaceId', () => Int) workspaceId: number,
    @Arg('id', () => Int) id: number,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const req = UPDATE.parse(input);
    const { app, user } = context;
    const item = await uniquely(() => app.db.transaction(async (tx) => {
      const member = await workspaceRole(tx, user, workspaceId);
      const team = await loadTeam(tx, workspaceId, id);
      await requireTeamManager(tx, member, team.id);
      const name = req.name != null ? cleanName(req.name) : team.name;
      const key = req.key != null ? cleanKey(req.key) : team.key;
      await ensureUnique(tx, workspaceId, name, key, team.id);
      await rows(
        tx,
        `UPDATE teams SET name = $2, key = $3, description = coalesce($4, description), private = coalesce($5, private), updated_at = now()
          WHERE id = $1 RETURNING id`,
        [team.id, name, key, req.description != null ? req.description.trim() : null, req.private ?? null],
      );
      return teamItem(tx, team.id, workspaceId, user);
    }));
    return mutated(context, TeamPayload, item);
  }

  @Mutation(() => TeamPayload, { nullable: true, description: 'Retires a team.' })
  async teamRetire(
    @Arg('workspaceId', () => Int) workspaceId: number,
    @Arg('id', () => Int) id: number,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const { app, user } = context;
    const item = await app.db.transaction(async (tx) => {
      const member = await workspaceRole(tx, user, workspaceId);
      const team = await loadTeam(tx, workspaceId, id);
      await requireTeamManager(tx, member, team.id);
      await rows(tx, 'UPDATE teams SET retired_at = now(), updated_at = now() WHERE id = $1 AND retired_at IS NULL RETURNING id', [team.id]);
      return teamItem(tx, team.id, workspaceId, user);
    });
    return mutated(context, TeamPayload, item);
  }

  @Mutation(() => TeamPayload, { nullable: true, description: 'Brings a retired team back.' })
  async teamRestore(
    @Arg('workspaceId', () => Int) workspaceId: number,
    @Arg('id', () => Int) id: number,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const { app, user } = context;
    // Linear's Restore team: a retired team becomes active, a deleted one comes back as it was.
    const item = await uniquely(() => app.db.transaction(async (tx) => {
      const member = await workspaceRole(tx, user, workspaceId);
      await purgeExpired(tx, workspaceId);
      const team = await loadTeam(tx, workspaceId, id, 'any');
      await requireTeamManager(tx, member, team.id);
      if (team.deleted_at !== null) {
        await ensureUnique(tx, workspaceId, team.name, team.key.toUpperCase(), team.id);
        await rows(tx, 'UPDATE teams SET deleted_at = NULL, updated_at = now() WHERE id = $1 RETURNING id', [team.id]);
      } else {
        await rows(tx, 'UPDATE teams SET retired_at = NULL, updated_at = now() WHERE id = $1 AND retired_at IS NOT NULL RETURNING id', [team.id]);
      }
      return teamItem(tx, team.id, workspaceId, user);
    }));
    return mutated(context, TeamPayload, item);
  }

  @Mutation(() => TeamPayload, { nullable: true, description: 'Deletes a team.' })
  async teamDelete(
    @Arg('workspaceId', () => Int) workspaceId: number,
    @Arg('id', () => Int) id: number,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const { app, user } = context;
    const result = await app.db.transaction(async (tx) => {
      const member = await workspaceRole(tx, user, workspaceId);
      const team = await loadTeam(tx, workspaceId, id);
      await requireTeamManager(tx, member, team.id);
      await rows(tx, 'UPDATE teams SET deleted_at = now(), updated_at = now() WHERE id = $1 RETURNING id', [team.id]);
      const deleted = await loadTeam(tx, workspaceId, id, 'deleted');
      return { status: 'ok', restorable_until: deleted.restorable_until };
    });
    return mutated(context, TeamPayload, result);
  }

  @Mutation(() => TeamPayload, { nullable: true, description: 'Adds workspace members to a team.' })
  async teamMembersAdd(
    @Arg('workspaceId', () => Int) workspaceId: number,
    @Arg('teamId', () => Int) teamId: number,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const wanted = [...new Set(MEMBERS.parse(input).user_ids)];
    const { app, user } = context;
    // Any member may add themselves, as Linear's "Join a team"; adding others takes a team owner or an
    // admin. Guests join only when someone who runs the team adds them; a private team only by invitation.
    const item = await app.db.transaction(async (tx) => {
      const member = await workspaceRole(tx, user, workspaceId);
      const team = await loadTeam(tx, workspaceId, teamId);
      if (wanted.length !== 1 || wanted[0] !== user.id || member.role === 'guest' || team.private) {
        await requireTeamManager(tx, member, team.id);
      }
      const found = await rows<{ id: number }>(tx, 'SELECT id FROM workspace_members WHERE workspace_id = $1 AND user_id = ANY($2) ORDER BY id', [workspaceId, wanted]);
      if (found.length !== wanted.length) throw new RouteError(400, 'Only members of this workspace can join its teams');
      // Someone adding the same people a moment earlier leaves them on the team either way.
      for (const row of found) {
        await rows(tx, 'INSERT INTO team_members (team_id, member_id, is_owner, joined_at) VALUES ($1, $2, false, now()) ON CONFLICT DO NOTHING RETURNING id', [team.id, row.id]);
      }
      return teamItem(tx, team.id, workspaceId, user);
    });
    return mutated(context, TeamPayload, item);
  }

  @Mutation(() => TeamPayload, { nullable: true, description: 'Takes a member off a team.' })
  async teamMemberRemove(
    @Arg('workspaceId', () => Int) workspaceId: number,
    @Arg('teamId', () => Int) teamId: number,
    @Arg('userId', () => Int) userId: number,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const { app, user } = context;
    // Anyone may take themselves off a team (Linear's Leave team…).
    const item = await app.db.transaction(async (tx) => {
      const member = await workspaceRole(tx, user, workspaceId);
      const team = await loadTeam(tx, workspaceId, teamId);
      if (userId !== user.id) await requireTeamManager(tx, member, team.id);
      const [target] = await rows<{ id: number }>(tx, 'SELECT id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [workspaceId, userId]);
      if (!target) throw new RouteError(404, 'Member not found in this workspace');
      const removed = await rows(tx, 'DELETE FROM team_members WHERE team_id = $1 AND member_id = $2 RETURNING id', [team.id, target.id]);
      if (!removed.length) throw new RouteError(404, 'Not a member of this team');
      return teamItem(tx, team.id, workspaceId, user);
    });
    return mutated(context, TeamPayload, item);
  }

  @Mutation(() => TeamPayload, { nullable: true, description: 'Makes a team member a team owner, or not.' })
  async teamMemberUpdate(
    @Arg('workspaceId', () => Int) workspaceId: number,
    @Arg('teamId', () => Int) teamId: number,
    @Arg('userId', () => Int) userId: number,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const req = OWNER.parse(input);
    const { app, user } = context;
    const item = await app.db.transaction(async (tx) => {
      const member = await workspaceRole(tx, user, workspaceId);
      const team = await loadTeam(tx, workspaceId, teamId);
      await requireTeamManager(tx, member, team.id);
      const [row] = await rows<{ id: number; role: string }>(
        tx,
        `SELECT tm.id, wm.role FROM team_members tm JOIN workspace_members wm ON wm.id = tm.member_id
          WHERE tm.team_id = $1 AND wm.user_id = $2`,
        [team.id, userId],
      );
      if (!row) throw new RouteError(404, 'Not a member of this team');
      if (req.is_owner && row.role === 'guest') throw new RouteError(400, "Guests can't be team owners");
      await rows(tx, 'UPDATE team_members SET is_owner = $2 WHERE id = $1 AND is_owner IS DISTINCT FROM $2 RETURNING id', [row.id, req.is_owner]);
      return teamItem(tx, team.id, workspaceId, user);
    });
    return mutated(context, TeamPayload, item);
  }

  @Mutation(() => TeamPayload, { nullable: true, description: 'Puts ad accounts on a team.' })
  async teamAccountsAdd(
    @Arg('workspaceId', () => Int) workspaceId: number,
    @Arg('teamId', () => Int) teamId: number,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const wanted = [...new Set(ACCOUNTS.parse(input).account_ids)];
    const { app, user } = context;
    // Only this workspace's own ad accounts; those already on the team are skipped.
    const item = await app.db.transaction(async (tx) => {
      const member = await workspaceRole(tx, user, workspaceId);
      const team = await loadTeam(tx, workspaceId, teamId);
      await requireTeamManager(tx, member, team.id);
      const found = await rows<{ id: number }>(tx, 'SELECT id FROM accounts WHERE workspace_id = $1 AND id = ANY($2) ORDER BY id', [workspaceId, wanted]);
      if (found.length !== wanted.length) throw new RouteError(400, "Only this workspace's ad accounts can be added to its teams");
      for (const account of found) {
        await rows(tx, 'INSERT INTO team_accounts (team_id, account_id, created_at) VALUES ($1, $2, now()) ON CONFLICT DO NOTHING RETURNING id', [team.id, account.id]);
      }
      return teamItem(tx, team.id, workspaceId, user);
    });
    return mutated(context, TeamPayload, item);
  }

  @Mutation(() => TeamPayload, { nullable: true, description: 'Takes an ad account off a team.' })
  async teamAccountRemove(
    @Arg('workspaceId', () => Int) workspaceId: number,
    @Arg('teamId', () => Int) teamId: number,
    @Arg('accountId', () => Int) accountId: number,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const { app, user } = context;
    const item = await app.db.transaction(async (tx) => {
      const member = await workspaceRole(tx, user, workspaceId);
      const team = await loadTeam(tx, workspaceId, teamId);
      await requireTeamManager(tx, member, team.id);
      const removed = await rows(tx, 'DELETE FROM team_accounts WHERE team_id = $1 AND account_id = $2 RETURNING id', [team.id, accountId]);
      if (!removed.length) throw new RouteError(404, 'This ad account is not on the team');
      return teamItem(tx, team.id, workspaceId, user);
    });
    return mutated(context, TeamPayload, item);
  }

  @Mutation(() => TeamDocumentPayload, { nullable: true, description: 'Creates a team document.' })
  async teamDocumentCreate(
    @Arg('workspaceId', () => Int) workspaceId: number,
    @Arg('teamId', () => Int) teamId: number,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const req = DOCUMENT.parse(input);
    const { app, user } = context;
    const document = await app.db.transaction(async (tx) => {
      const member = await workspaceRole(tx, user, workspaceId);
      const team = await loadTeam(tx, workspaceId, teamId);
      await requireTeamContent(tx, member, team);
      const [created] = await rows<TeamDocumentItem>(
        tx,
        `INSERT INTO team_documents (team_id, title, content, created_by_user_id, updated_by_user_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4, now(), now()) RETURNING ${DOCUMENT_COLUMNS}`,
        [team.id, (req.title ?? '').trim(), req.content ?? '', user.id],
      );
      return created;
    });
    return mutated(context, TeamDocumentPayload, document);
  }

  @Mutation(() => TeamDocumentPayload, { nullable: true, description: 'Changes a team document.' })
  async teamDocumentUpdate(
    @Arg('workspaceId', () => Int) workspaceId: number,
    @Arg('teamId', () => Int) teamId: number,
    @Arg('id', () => Int) id: number,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const req = DOCUMENT.parse(input);
    const { app, user } = context;
    const document = await app.db.transaction(async (tx) => {
      const member = await workspaceRole(tx, user, workspaceId);
      const team = await loadTeam(tx, workspaceId, teamId);
      await requireTeamContent(tx, member, team);
      await loadDocument(tx, team.id, id);
      const [updated] = await rows<TeamDocumentItem>(
        tx,
        `UPDATE team_documents SET title = coalesce($2, title), content = coalesce($3, content),
                updated_by_user_id = $4, updated_at = now()
          WHERE id = $1 RETURNING ${DOCUMENT_COLUMNS}`,
        [id, req.title != null ? req.title.trim() : null, req.content ?? null, user.id],
      );
      return updated;
    });
    return mutated(context, TeamDocumentPayload, document);
  }

  @Mutation(() => TeamDocumentPayload, { nullable: true, description: 'Deletes a team document.' })
  async teamDocumentDelete(
    @Arg('workspaceId', () => Int) workspaceId: number,
    @Arg('teamId', () => Int) teamId: number,
    @Arg('id', () => Int) id: number,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const { app, user } = context;
    await app.db.transaction(async (tx) => {
      const member = await workspaceRole(tx, user, workspaceId);
      const team = await loadTeam(tx, workspaceId, teamId);
      await requireTeamContent(tx, member, team);
      await loadDocument(tx, team.id, id);
      await rows(tx, 'DELETE FROM team_documents WHERE id = $1 RETURNING id', [id]);
    });
    return mutated(context, TeamDocumentPayload, { status: 'ok' });
  }
}
