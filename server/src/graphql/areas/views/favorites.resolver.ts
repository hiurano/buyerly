import { Arg, Ctx, Int, Mutation, Query, Resolver } from 'type-graphql';
import { FavoriteEntity } from '../../../entities/index.ts';
import type { ActingMember } from '../../../workspaces/access.ts';
import { mutated, type GraphQLContext } from '../../context.ts';
import { RouteError } from '../../errors.ts';
import { FavoritePayload, SuccessPayload, type Payload } from '../../payloads.ts';
import { JSONScalar } from '../../scalars.ts';
import { ValueError, model, string } from './body.ts';
import { workspaceMember } from './views.resolver.ts';

// Each member's favorites, Linear's star and the sidebar's Favorites section
// (api/routers/favorites.py). A favorite is an app address inside the
// workspace plus the name it had when starred; the server resolves neither.

const FAVORITE_KINDS = new Set(['page', 'account', 'campaign', 'adset', 'ad', 'rule']);
// "team/TES/ads-manager/campaigns", "accounts/act_1001": no leading slash, no "..".
const FAVORITE_PATH_PATTERN = /^[A-Za-z0-9_%~.-]+(\/[A-Za-z0-9_%~.-]+)*$/;
const MAX_FAVORITES_PER_MEMBER = 100;

// Python's str.strip(): whitespace as str.isspace() knows it.
const SPACE = '[\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]';
const STRIP = new RegExp(`^${SPACE}+|${SPACE}+$`, 'g');
const strip = (value: string): string => value.replace(STRIP, '');

const FAVORITE = model({
  kind: string((value) => {
    if (!FAVORITE_KINDS.has(value)) throw new ValueError('Unknown kind of favorite.');
    return value;
  }),
  path: string((value) => {
    // re.match with `$`: a final newline still matches.
    if (value.length > 300 || !FAVORITE_PATH_PATTERN.test(value.replace(/\n$/, '')) || value.split('/').includes('..')) {
      throw new ValueError('Not an address in the workspace.');
    }
    return value;
  }),
  title: string((value) => {
    const title = strip(value);
    // len() counts code points.
    if (!title || [...title].length > 200) throw new ValueError('A favorite needs a name of at most 200 characters.');
    return title;
  }),
});

function favorite(row: FavoriteEntity): Record<string, unknown> {
  return { id: row.id, kind: row.kind, path: row.path, title: row.title, position: row.position };
}

function writable(member: ActingMember): number {
  // Support access without a membership row sees no favorites and keeps none.
  if (member.id === null) throw new RouteError(403, 'Support access cannot keep favorites.');
  return member.id;
}

@Resolver()
export class FavoritesResolver {
  @Query(() => JSONScalar, { description: "The member's favorites in sidebar order." })
  async favorites(@Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    return app.db.transaction(async (tx) => {
      const { member } = await workspaceMember(tx, user);
      if (member.id === null) return { favorites: [] };
      const rows = await tx.find(FavoriteEntity, { where: { memberId: member.id }, order: { position: 'ASC', id: 'ASC' } });
      return { favorites: rows.map(favorite) };
    });
  }

  @Mutation(() => FavoritePayload, {
    nullable: true,
    description: 'Stars a page or record; starring it again returns the favorite it already is.',
  })
  async favoriteCreate(@Arg('input', () => JSONScalar) input: unknown, @Ctx() context: GraphQLContext): Promise<Payload> {
    const req = FAVORITE(input);
    const row = await context.app.db.transaction(async (tx) => {
      const memberId = writable((await workspaceMember(tx, context.user)).member);
      const existing = await tx.findOneBy(FavoriteEntity, { memberId, path: req.path });
      if (existing) return existing;
      const [{ count, last }] = await tx.query<{ count: number; last: number | null }[]>(
        'SELECT count(id)::int AS count, max(position) AS last FROM favorites WHERE member_id = $1',
        [memberId],
      );
      if (count >= MAX_FAVORITES_PER_MEMBER) throw new RouteError(400, 'Too many favorites.');
      return tx.save(tx.create(FavoriteEntity, {
        memberId,
        kind: req.kind,
        path: req.path,
        title: req.title,
        // New favorites go to the end of the section, as Linear's.
        position: (last || 0) + 1,
        createdAt: new Date(),
      }));
    });
    return mutated(context, FavoritePayload, favorite(row));
  }

  @Mutation(() => SuccessPayload, { nullable: true, description: 'Unstars a favorite; succeeds when it was already gone.' })
  async favoriteDelete(@Arg('id', () => Int) id: number, @Ctx() context: GraphQLContext): Promise<Payload> {
    await context.app.db.transaction(async (tx) => {
      const memberId = writable((await workspaceMember(tx, context.user)).member);
      await tx.delete(FavoriteEntity, { id, memberId });
    });
    return mutated(context, SuccessPayload);
  }
}
