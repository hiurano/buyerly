import type { NonEmptyArray } from 'type-graphql';
import { AccountsResolver } from './accounts/accounts.resolver.ts';
import { AdSetsResolver } from './accounts/adsets.resolver.ts';
import { AnalyticsResolver } from './accounts/analytics.resolver.ts';
import { TeamsResolver } from './teams/teams.resolver.ts';
import { UsersResolver } from './users/users.resolver.ts';
import { InvitesResolver } from './workspaces/invites.resolver.ts';
import { MembersResolver } from './workspaces/members.resolver.ts';
import { OnboardingResolver } from './onboarding/onboarding.resolver.ts';
import { HealthResolver } from './admin/health.resolver.ts';
import { SupportResolver } from './admin/support.resolver.ts';
import { AuditResolver } from './audit/audit.resolver.ts';
import { TrashResolver } from './audit/trash.resolver.ts';
import { FavoritesResolver } from './views/favorites.resolver.ts';
import { ViewsResolver } from './views/views.resolver.ts';
import { NotificationChannelsResolver } from './notifications/channels.resolver.ts';
import { InboxResolver } from './notifications/inbox.resolver.ts';
import { DesktopNotificationsResolver } from './notifications/desktop.resolver.ts';
import { TelegramResolver } from './notifications/telegram.resolver.ts';
import { WorkspacesResolver } from './workspaces/workspaces.resolver.ts';
import { RuleLabelsResolver } from './rules/labels.resolver.ts';
import { RulesResolver } from './rules/rules.resolver.ts';
import { RuleAttachmentsResolver } from './rules/attachments.resolver.ts';

// Every area's resolvers: the one place a new area is registered. An area
// lives in its own folder (areas/<area>/<area>.resolver.ts, plus whatever
// helpers it needs) and adds its class here; nothing else changes. A field
// keeps the Python field's name, arguments, types and description
// (test/graphql/schema.test.ts compares them), and the root fields served
// here are no longer forwarded to the Python API (graphql/routing.ts).
export const RESOLVERS: NonEmptyArray<new () => object> = [
  MembersResolver,
  InvitesResolver,
  OnboardingResolver,
  TeamsResolver,
  UsersResolver,
  WorkspacesResolver,
  ViewsResolver,
  FavoritesResolver,
  AuditResolver,
  TrashResolver,
  NotificationChannelsResolver,
  DesktopNotificationsResolver,
  TelegramResolver,
  InboxResolver,
  AccountsResolver,
  AdSetsResolver,
  AnalyticsResolver,
  RuleLabelsResolver,
  RulesResolver,
  RuleAttachmentsResolver,
  SupportResolver,
  HealthResolver,
];
