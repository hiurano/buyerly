import type { NonEmptyArray } from 'type-graphql';
import { AccountsResolver } from './accounts/accounts.resolver.ts';
import { AdSetsResolver } from './accounts/adsets.resolver.ts';
import { TeamsResolver } from './teams/teams.resolver.ts';
import { UsersResolver } from './users/users.resolver.ts';
import { MembersResolver } from './workspaces/members.resolver.ts';
import { AuditResolver } from './audit/audit.resolver.ts';
import { TrashResolver } from './audit/trash.resolver.ts';
import { FavoritesResolver } from './views/favorites.resolver.ts';
import { ViewsResolver } from './views/views.resolver.ts';
import { WorkspacesResolver } from './workspaces/workspaces.resolver.ts';

// Every area's resolvers: the one place a new area is registered. An area
// lives in its own folder (areas/<area>/<area>.resolver.ts, plus whatever
// helpers it needs) and adds its class here; nothing else changes. A field
// keeps the Python field's name, arguments, types and description
// (test/graphql/schema.test.ts compares them), and the root fields served
// here are no longer forwarded to the Python API (graphql/routing.ts).
export const RESOLVERS: NonEmptyArray<new () => object> = [
  MembersResolver,
  TeamsResolver,
  UsersResolver,
  WorkspacesResolver,
  ViewsResolver,
  FavoritesResolver,
  AuditResolver,
  TrashResolver,
  AccountsResolver,
  AdSetsResolver,
];
