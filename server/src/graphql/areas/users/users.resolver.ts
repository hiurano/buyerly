import { Arg, Ctx, Mutation, Resolver } from 'type-graphql';
import { UserEntity } from '../../../entities/index.ts';
import { ImageStorage } from '../../../uploads/images.ts';
import { mutated, type GraphQLContext } from '../../context.ts';
import { RouteError, invalidInput } from '../../errors.ts';
import { inputSchema } from '../../input.ts';
import { UserPayload } from '../../payloads.ts';
import type { Payload } from '../../payloads.ts';
import { JSONScalar } from '../../scalars.ts';

// The signed-in user's own profile (api/routers/auth.py update_profile; the
// REST route stays Python's until the client stops using it).

interface ProfileInput {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  title?: string | null;
  username?: string | null;
}

const text = (maxLength: number) => ({ type: ['string', 'null'], maxLength });

// api/schemas/auth.py UpdateProfileRequest.
const PROFILE = inputSchema<ProfileInput>({
  type: 'object',
  additionalProperties: false,
  properties: {
    full_name: text(120),
    first_name: text(100),
    last_name: text(100),
    email: text(255),
    avatar_url: text(500),
    // Linear's Profile caps the title at 128 characters and the username at 40.
    title: text(128),
    username: text(40),
  },
});

// Linear's rule and wording. It also keeps a username from looking like an
// email: both sign in through the same field.
const USERNAME = /^[A-Za-z0-9_.-]+$/;

// UpdateProfileRequest.validate_avatar_url.
function avatarUrl(value: string): string {
  const cleaned = value.trim();
  if (!cleaned) return '';
  if (/[<>"'\r\n\t\0]/.test(cleaned)) throw invalidInput(['Value error, avatar_url contains invalid characters']);
  if (cleaned.startsWith('//')) throw invalidInput(['Value error, Protocol-relative URLs are not supported']);
  if (cleaned.startsWith('/uploads/avatars/') || cleaned.startsWith('http://') || cleaned.startsWith('https://')) return cleaned;
  throw invalidInput(['Value error, avatar_url must start with https://, http:// or /uploads/avatars/']);
}

function profile(user: UserEntity): Record<string, unknown> {
  return {
    message: 'Profile updated',
    username: user.username,
    full_name: user.fullName,
    first_name: user.firstName,
    last_name: user.lastName,
    title: user.title,
    email: user.email,
    avatar_url: user.avatarUrl,
  };
}

@Resolver()
export class UsersResolver {
  @Mutation(() => UserPayload, { nullable: true, description: "Changes the user's name or username." })
  async userUpdate(@Arg('input', () => JSONScalar) input: unknown, @Ctx() context: GraphQLContext): Promise<Payload> {
    const req = PROFILE.parse(input);
    const avatar = req.avatar_url == null ? null : avatarUrl(req.avatar_url);
    const images = new ImageStorage(context.app.config.uploadsRoot);
    const userId = context.user.id;

    const { saved, oldAvatar } = await context.app.db.transaction(async (tx) => {
      const user = await tx.findOneBy(UserEntity, { id: userId });
      if (!user) throw new RouteError(404, 'User not found');
      const previousAvatar = user.avatarUrl;
      if (req.first_name != null) user.firstName = req.first_name.trim();
      if (req.last_name != null) user.lastName = req.last_name.trim();
      if (req.email != null) {
        const clean = req.email.trim() ? req.email.trim().toLowerCase() : null;
        const existing = (user.email ?? '').trim().toLowerCase() || null;
        if (clean !== existing) {
          throw new RouteError(400, 'Changing the email directly without confirmation is not allowed. Use the code verification flow.');
        }
      }
      if (avatar !== null) {
        if (avatar.startsWith('/uploads/avatars/') && !(await images.isOwned(avatar, 'avatars', userId))) {
          throw new RouteError(400, 'Avatar not found, or it belongs to another user');
        }
        user.avatarUrl = avatar;
      }
      if (req.full_name != null) {
        if (!req.full_name.trim()) throw new RouteError(400, 'Your full name cannot be empty.');
        user.fullName = req.full_name.trim();
      } else if (req.first_name != null || req.last_name != null) {
        user.fullName = `${user.firstName} ${user.lastName}`.trim();
      }
      if (req.title != null) user.title = req.title.trim();
      if (req.username != null) {
        const username = req.username.trim();
        if (!username) throw new RouteError(400, 'Your username cannot be empty.');
        if (!USERNAME.test(username)) {
          throw new RouteError(400, 'The username can only contain alpha-numeric characters in addition to - _ and .');
        }
        if (username !== user.username) {
          const [taken] = await tx.query<{ id: number }[]>(
            'SELECT id FROM users WHERE lower(username) = lower($1) AND id <> $2 LIMIT 1',
            [username, user.id],
          );
          if (taken) throw new RouteError(400, 'This username is already taken.');
          user.username = username;
        }
      }
      try {
        await tx.save(user);
      } catch (error) {
        // A concurrent sign-up took the name between the check and the write.
        if ((error as { code?: string }).code === '23505') throw new RouteError(400, 'This username is already taken.');
        throw error;
      }
      return { saved: user, oldAvatar: previousAvatar };
    });
    if (oldAvatar && oldAvatar !== saved.avatarUrl) await images.delete(oldAvatar, 'avatars', `avatar_${userId}_`);
    return mutated(context, UserPayload, profile(saved));
  }
}
