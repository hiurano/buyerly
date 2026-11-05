import { Arg, Ctx, Mutation, Query, Resolver } from 'type-graphql';
import type { EntityManager } from 'typeorm';
import { rows } from '../../../database.ts';
import { UserEntity } from '../../../entities/index.ts';
import { ImageStorage } from '../../../uploads/images.ts';
import { userWorkspace, userWorkspacesList } from '../../../workspaces/access.ts';
import { recordEvent } from '../../../workspaces/audit.ts';
import { CREATE_WORKSPACE, insertWorkspace, newWorkspace } from '../../../workspaces/create.ts';
import { normalizeWorkspaceSlug, RESERVED_WORKSPACE_SLUGS } from '../../../workspaces/slugs.ts';
import { mutated, type GraphQLContext } from '../../context.ts';
import { RouteError, invalidInput } from '../../errors.ts';
import { inputSchema } from '../../input.ts';
import { OnboardingPayload, type Payload } from '../../payloads.ts';
import { limitField } from '../../rate-limit.ts';
import { JSONScalar } from '../../scalars.ts';
import { insertInvite, sendInvitation } from '../workspaces/invites.resolver.ts';

// Onboarding: the new user's name, first workspace and teammates
// (api/routers/onboarding.py). The logo is uploaded over REST
// (routes/uploads.ts) and attached here by its URL.

// PersonalDetailsRequest.
const DETAILS = inputSchema<{ first_name: string; last_name?: string }>({
  type: 'object',
  required: ['first_name'],
  properties: { first_name: { type: 'string', minLength: 1, maxLength: 60 }, last_name: { type: 'string', maxLength: 60 } },
});

// OnboardingBulkInvitesRequest.
const INVITES = inputSchema<{ invites?: { email: string; role?: string }[] }>({
  type: 'object',
  properties: {
    invites: {
      type: 'array',
      items: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string', minLength: 3, maxLength: 255 }, role: { type: 'string', pattern: '^(admin|member|guest)$' } },
      },
    },
  },
});

async function freshUser(tx: EntityManager, id: number, lock = false): Promise<UserEntity> {
  return tx.findOneOrFail(UserEntity, { where: { id }, ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
}

// The owner of the active workspace, with a name, may finish onboarding.
async function onboardingOwner(tx: EntityManager, user: UserEntity, noWorkspace: [number, string], notOwner: string) {
  const ws = await userWorkspace(tx, user);
  if (!ws) throw new RouteError(...noWorkspace);
  const [member] = await rows<{ role: string }>(tx, 'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [ws.id, user.id]);
  if (member?.role !== 'owner') throw new RouteError(403, notOwner);
  if (!user.firstName && !user.fullName) throw new RouteError(409, 'Set up your profile first');
  return ws;
}

async function complete(tx: EntityManager, userId: number): Promise<void> {
  await rows(tx, "UPDATE users SET onboarding_step = 'completed', onboarding_completed = true WHERE id = $1 RETURNING id", [userId]);
}

@Resolver()
export class OnboardingResolver {
  @Query(() => JSONScalar, { description: 'Whether a workspace address is free.' })
  async workspaceSlugCheck(@Arg('slug', () => String) slug: string, @Ctx() context: GraphQLContext): Promise<unknown> {
    limitField(context, 'check_slug', 30);
    const length = Array.from(slug).length;
    if (length < 2) throw invalidInput(['String should have at least 2 characters']);
    if (length > 60) throw invalidInput(['String should have at most 60 characters']);
    const raw = slug.trim().toLowerCase();
    const cleaned = normalizeWorkspaceSlug(raw);
    if (!cleaned || cleaned.length < 2) {
      return { slug: raw, available: false, message: 'The slug must be at least 2 characters (Latin letters, digits, hyphen)' };
    }
    if (RESERVED_WORKSPACE_SLUGS.has(cleaned)) return { slug: cleaned, available: false, message: 'That slug is reserved by the system' };
    const taken = await context.app.db.transaction((tx) => rows(tx, 'SELECT id FROM workspaces WHERE slug = $1', [cleaned]));
    if (taken.length) return { slug: cleaned, available: false, message: 'That workspace address is already taken' };
    return { slug: cleaned, available: true, message: 'Address available' };
  }

  @Mutation(() => OnboardingPayload, { nullable: true, description: "Saves the new user's name." })
  async onboardingPersonalDetailsUpdate(@Arg('input', () => JSONScalar) input: unknown, @Ctx() context: GraphQLContext): Promise<Payload> {
    const req = DETAILS.parse(input);
    const firstName = req.first_name.trim();
    const lastName = (req.last_name ?? '').trim();
    if (!firstName) throw new RouteError(400, 'Name is required');
    const { app, user } = context;
    const status = await app.db.transaction(async (tx) => {
      await tx.update(UserEntity, { id: user.id }, { firstName, lastName, fullName: `${firstName} ${lastName}`.trim() });
      const person = await freshUser(tx, user.id);
      const workspaces = await userWorkspacesList(tx, person);
      const active = workspaces.find((ws) => ws.is_active) ?? workspaces[0] ?? null;
      let step = 'completed';
      if (!active) step = 'workspace';
      else {
        const [member] = await rows<{ role: string }>(tx, 'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [active.id, user.id]);
        if (member?.role === 'owner') step = 'invites';
      }
      const completed = step === 'completed';
      await tx.update(UserEntity, { id: user.id }, { onboardingStep: step, onboardingCompleted: completed });
      return {
        onboarding_step: step,
        onboarding_completed: completed,
        user: {
          id: null,
          username: person.username || '',
          full_name: person.fullName || '',
          first_name: person.firstName || '',
          last_name: person.lastName || '',
          title: person.title || '',
          email: person.email,
          email_verified: Boolean(person.emailVerifiedAt),
          unconfirmed_email: person.unconfirmedEmail,
          avatar_url: person.avatarUrl || '',
          role: person.role,
          is_approved: person.isApproved,
          onboarding_step: step,
          onboarding_completed: completed,
          active_workspace: active,
          workspaces,
        },
        active_workspace: active,
      };
    });
    return mutated(context, OnboardingPayload, status);
  }

  @Mutation(() => OnboardingPayload, { nullable: true, description: "Creates the new user's first workspace." })
  async onboardingWorkspaceCreate(@Arg('input', () => JSONScalar) input: unknown, @Ctx() context: GraphQLContext): Promise<Payload> {
    const req = CREATE_WORKSPACE.parse(input);
    const { app, user } = context;
    const fields = await newWorkspace(req, new ImageStorage(app.config.uploadsRoot), user.id);
    const item = await app.db.transaction(async (tx) => {
      // The user lock makes two different first-workspace submissions serial.
      const person = await freshUser(tx, user.id, true);
      if (!person.isApproved) throw new RouteError(403, 'Your account is awaiting administrator approval.');
      const [membership] = await rows(tx, 'SELECT id FROM workspace_members WHERE user_id = $1 LIMIT 1', [user.id]);
      if (membership) throw new RouteError(409, 'This user already has a workspace');
      const created = await insertWorkspace(tx, fields, user.id);
      await rows(
        tx,
        "UPDATE users SET active_workspace_id = $1, onboarding_step = 'personal_details', onboarding_completed = false WHERE id = $2 RETURNING id",
        [created.id, user.id],
      );
      return created;
    });
    return mutated(context, OnboardingPayload, item);
  }

  @Mutation(() => OnboardingPayload, { nullable: true, description: 'Invites teammates during onboarding.' })
  async onboardingInvitesSend(@Arg('input', () => JSONScalar) input: unknown, @Ctx() context: GraphQLContext): Promise<Payload> {
    const req = INVITES.parse(input);
    const { app, user } = context;
    const result = await app.db.transaction(async (tx) => {
      const person = await freshUser(tx, user.id);
      const ws = await onboardingOwner(
        tx, person, [400, 'No active workspace found for creating invites'], 'Only the owner can invite the team at this step',
      );
      const invites: Record<string, unknown>[] = [];
      for (const item of req.invites ?? []) {
        const email = item.email.trim().toLowerCase();
        if (!email || !email.includes('@')) continue;
        const invite = await insertInvite(tx, person, { workspaceId: ws.id, email, role: item.role ?? 'member', maxUses: 1, expiresInDays: 7 });
        invites.push({
          id: invite.id,
          workspace_id: ws.id,
          workspace_name: ws.name,
          token: invite.token,
          invite_url: `/invite/${invite.token}`,
          email: invite.email,
          role: invite.role,
          status: invite.status,
          max_uses: invite.max_uses,
          used_count: invite.used_count,
          inviter_name: person.fullName || person.username || 'The team',
          expires_at: invite.expires_at,
          created_at: invite.created_at,
        });
        const sent = await sendInvitation(context, invite, ws.name, person.fullName || person.username || 'A colleague');
        await recordEvent(tx, {
          workspaceId: ws.id, user: person, category: 'WORKSPACE_INVITE', eventType: 'INVITE_SEND', status: sent ? 'SUCCESS' : 'FAILED',
          message: `Invite delivery to ${email}: ${sent ? 'success' : 'error'}`, details: { invite_id: invite.id, email },
        });
      }
      await complete(tx, user.id);
      return { sent_count: invites.length, invites, onboarding_completed: true, redirect_url: '/' };
    });
    return mutated(context, OnboardingPayload, result);
  }

  @Mutation(() => OnboardingPayload, { nullable: true, description: 'Skips the rest of onboarding.' })
  async onboardingSkip(@Ctx() context: GraphQLContext): Promise<Payload> {
    const { app, user } = context;
    await app.db.transaction(async (tx) => {
      const person = await freshUser(tx, user.id);
      await onboardingOwner(tx, person, [409, 'Create a workspace first'], 'This step is available to the workspace owner only');
      await complete(tx, user.id);
    });
    return mutated(context, OnboardingPayload, { status: 'ok', onboarding_completed: true, redirect_url: '/' });
  }
}
