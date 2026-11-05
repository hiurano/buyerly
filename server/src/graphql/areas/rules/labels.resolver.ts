import { randomInt } from 'node:crypto';
import { Arg, Ctx, Int, Mutation, Query, Resolver } from 'type-graphql';
import type { EntityManager } from 'typeorm';
import { utcIsoSql } from '../../../audit/events.ts';
import { rows } from '../../../database.ts';
import { KIND_RULE_GROUP, moveToTrash, purgeExpired } from '../../../trash/trash.ts';
import { userWorkspace } from '../../../workspaces/access.ts';
import { mutated, type GraphQLContext } from '../../context.ts';
import { INTERNAL_ERROR, RouteError } from '../../errors.ts';
import { inputSchema } from '../../input.ts';
import { RuleLabelPayload, type Payload } from '../../payloads.ts';
import { JSONScalar } from '../../scalars.ts';
import { ensureWriteAccess, scopeOf } from '../accounts/scope.ts';
import { strip, words } from '../accounts/text.ts';
import { ensureRuleExamples } from './examples.ts';

// Rule labels (api/routers/rules.py /rule-labels, #383): a name unique in the
// workspace whatever the case, a color from Linear's palette and a
// description. Deleting one takes it off every rule and keeps it in Recently
// deleted; the rules stay.

// core/rule_labels.py LABEL_COLORS, in Linear's picker order.
const LABEL_COLORS = [
  '#95a2b3', '#5e6ad2', '#26b5ce', '#4cb782', '#f2c94c',
  '#f2994a', '#f7c8c1', '#eb5757', '#bb87fc', '#4ea7fc',
];

const COLOR = { type: ['string', 'null'], pattern: '^#[0-9a-fA-F]{6}$' };

interface LabelCreate { name: string; color?: string | null; description?: string }
interface LabelUpdate { name?: string | null; color?: string | null; description?: string | null }

// api/schemas/rules.py RuleLabelCreateRequest / RuleLabelUpdateRequest (extra="forbid").
const CREATE = inputSchema<LabelCreate>({
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 80 },
    color: COLOR,
    description: { type: 'string', maxLength: 500 },
  },
});

const UPDATE = inputSchema<LabelUpdate>({
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: ['string', 'null'], minLength: 1, maxLength: 80 },
    color: COLOR,
    description: { type: ['string', 'null'], maxLength: 500 },
  },
});

interface LabelRow {
  id: number;
  name: string;
  color: string | null;
  description: string | null;
  icon: string | null;
  position: number;
  owner_user_id: number | null;
  created_at_iso: string;
  created_at_python: string | null;
}

const LABEL_COLUMNS = `id, name, color, description, icon, position, owner_user_id,
  ${utcIsoSql('created_at')} AS created_at_iso,
  CASE WHEN created_at IS NULL THEN NULL ELSE to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
    || CASE WHEN extract(microseconds FROM created_at)::bigint % 1000000 = 0 THEN ''
            ELSE to_char(created_at AT TIME ZONE 'UTC', '.US') END || '+00:00' END AS created_at_python`;

// deps.py _clean_rule_label_name.
function cleanName(value: string): string {
  const name = words(value).join(' ');
  if (!name) throw new RouteError(400, 'Enter a label name.');
  return name;
}

// deps.py _ensure_unique_label_name: lower() on both sides, as SQL lower() and
// Python's str.lower() agree on the names people type.
async function ensureUniqueName(tx: EntityManager, workspaceId: number, name: string, exceptId: number | null = null): Promise<void> {
  const [taken] = await rows(
    tx,
    `SELECT id FROM rule_groups WHERE workspace_id = $1 AND lower(name) = $2 ${exceptId === null ? '' : 'AND id <> $3'} LIMIT 1`,
    exceptId === null ? [workspaceId, name.toLowerCase()] : [workspaceId, name.toLowerCase(), exceptId],
  );
  if (taken) throw new RouteError(409, `A label named "${name}" already exists.`);
}

async function workspaceLabel(tx: EntityManager, workspaceId: number, labelId: number): Promise<LabelRow> {
  const [label] = await rows<LabelRow>(tx, `SELECT ${LABEL_COLUMNS} FROM rule_groups WHERE id = $1 AND workspace_id = $2`, [labelId, workspaceId]);
  if (!label) throw new RouteError(404, 'Label not found.');
  return label;
}

// deps.py _rule_label_responses: each label with how many rules carry it and
// when it was last put on one.
export async function labelResponses(tx: EntityManager, labels: LabelRow[]): Promise<Record<string, unknown>[]> {
  const ids = labels.map((label) => label.id);
  const usage = new Map<number, { rule_count: number; last_applied_at: string }>();
  if (ids.length) {
    const found = await rows<{ group_id: number; rule_count: string; last_applied_at: string }>(
      tx,
      `SELECT group_id, count(id) AS rule_count, ${utcIsoSql('max(created_at)')} AS last_applied_at
         FROM rule_group_items WHERE group_id = ANY($1::int[]) GROUP BY group_id`,
      [ids],
    );
    for (const row of found) usage.set(row.group_id, { rule_count: Number(row.rule_count), last_applied_at: row.last_applied_at });
  }
  return labels.map((label) => ({
    id: label.id,
    name: label.name,
    color: label.color || '#95a2b3',
    description: label.description || '',
    rule_count: usage.get(label.id)?.rule_count ?? 0,
    last_applied_at: usage.get(label.id)?.last_applied_at ?? '',
    created_at: label.created_at_iso,
  }));
}

@Resolver()
export class RuleLabelsResolver {
  @Query(() => JSONScalar, { description: "The workspace's rule labels with their rule counts." })
  async ruleLabels(@Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    const workspace = await app.db.transaction((tx) => userWorkspace(tx, user));
    // get_user_workspace answered None: the Python handler fails on ws.id.
    if (!workspace) throw INTERNAL_ERROR();
    await ensureRuleExamples(app.db, user, workspace.id);
    return app.db.transaction(async (tx) => labelResponses(
      tx,
      await rows<LabelRow>(tx, `SELECT ${LABEL_COLUMNS} FROM rule_groups WHERE workspace_id = $1 ORDER BY lower(name) ASC, id ASC`, [workspace.id]),
    ));
  }

  @Mutation(() => RuleLabelPayload, { nullable: true, description: 'Creates a rule label.' })
  async ruleLabelCreate(@Arg('input', () => JSONScalar) input: unknown, @Ctx() context: GraphQLContext): Promise<Payload> {
    const req = CREATE.parse(input);
    const record = await context.app.db.transaction(async (tx) => {
      const scope = await scopeOf(tx, context.user);
      ensureWriteAccess(scope, 'creating labels');
      const name = cleanName(req.name);
      await ensureUniqueName(tx, scope.workspaceId, name);
      const color = (req.color ?? LABEL_COLORS[randomInt(LABEL_COLORS.length)]).toLowerCase();
      const [label] = await rows<LabelRow>(
        tx,
        `INSERT INTO rule_groups (workspace_id, owner_user_id, name, description, color, position, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 0, clock_timestamp(), clock_timestamp())
         RETURNING ${LABEL_COLUMNS}`,
        [scope.workspaceId, context.user.id, name, strip(req.description ?? ''), color],
      );
      return (await labelResponses(tx, [label]))[0];
    });
    return mutated(context, RuleLabelPayload, record);
  }

  @Mutation(() => RuleLabelPayload, { nullable: true, description: 'Changes a rule label.' })
  async ruleLabelUpdate(
    @Arg('id', () => Int) id: number,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const req = UPDATE.parse(input);
    const record = await context.app.db.transaction(async (tx) => {
      const scope = await scopeOf(tx, context.user);
      ensureWriteAccess(scope, 'editing labels');
      const label = await workspaceLabel(tx, scope.workspaceId, id);
      let { name, color, description } = label;
      if (req.name != null) {
        name = cleanName(req.name);
        await ensureUniqueName(tx, scope.workspaceId, name, label.id);
      }
      if (req.color != null) color = req.color.toLowerCase();
      if (req.description != null) description = strip(req.description);
      // The ORM writes (and bumps updated_at) only when a value changed.
      if (name === label.name && color === label.color && description === label.description) {
        return (await labelResponses(tx, [label]))[0];
      }
      const [updated] = await rows<LabelRow>(
        tx,
        `UPDATE rule_groups SET name = $1, color = $2, description = $3, updated_at = clock_timestamp()
          WHERE id = $4 RETURNING ${LABEL_COLUMNS}`,
        [name, color, description, label.id],
      );
      return (await labelResponses(tx, [updated]))[0];
    });
    return mutated(context, RuleLabelPayload, record);
  }

  @Mutation(() => RuleLabelPayload, { nullable: true, description: 'Moves a rule label to Recently deleted.' })
  async ruleLabelDelete(@Arg('id', () => Int) id: number, @Ctx() context: GraphQLContext): Promise<Payload> {
    const record = await context.app.db.transaction(async (tx) => {
      const scope = await scopeOf(tx, context.user);
      ensureWriteAccess(scope, 'deleting labels');
      const label = await workspaceLabel(tx, scope.workspaceId, id);
      const items = await rows<{ preset_id: number; position: number }>(
        tx, 'SELECT preset_id, position FROM rule_group_items WHERE group_id = $1 ORDER BY id', [label.id],
      );
      await purgeExpired(tx, scope.workspaceId);
      // core/trash.py group_snapshot.
      const trashed = await moveToTrash(tx, {
        workspaceId: scope.workspaceId,
        kind: KIND_RULE_GROUP,
        entityId: label.id,
        name: label.name,
        snapshot: {
          group: {
            name: label.name,
            description: label.description,
            color: label.color,
            icon: label.icon,
            position: label.position,
            owner_user_id: label.owner_user_id,
          },
          created_at: label.created_at_python,
          items,
        },
        deletedByUserId: context.user.id,
      });
      await rows(tx, 'DELETE FROM rule_group_items WHERE group_id = $1', [label.id]);
      await rows(tx, 'DELETE FROM rule_groups WHERE id = $1', [label.id]);
      return { success: true, message: 'Label deleted. Its rules were kept.', deleted_item_id: trashed.id };
    });
    return mutated(context, RuleLabelPayload, record);
  }
}
