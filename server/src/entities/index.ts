// Every table's entity, for the DataSource (#611 stage 2). TypeORM reads the
// decorators' type metadata through reflect-metadata, so it loads first.
import 'reflect-metadata';

import { AccountHealthEntity } from './account-health.ts';
import { AccountNotificationSettingEntity } from './account-notification-setting.ts';
import { AccountEntity } from './account.ts';
import { ActionUndoStateEntity } from './action-undo-state.ts';
import { AdsetInventoryCacheEntity } from './adset-inventory-cache.ts';
import { AnalyticsEntityFactEntity } from './analytics-entity-fact.ts';
import { AppSettingsEntity } from './app-settings.ts';
import { AuditEventEntity } from './audit-event.ts';
import { AutomationRuntimeStateEntity } from './automation-runtime-state.ts';
import { AutomationScheduleStateEntity } from './automation-schedule-state.ts';
import { DeletedItemEntity } from './deleted-item.ts';
import { DesktopPushSubscriptionEntity } from './desktop-push-subscription.ts';
import { EmailVerificationCodeEntity } from './email-verification-code.ts';
import { FavoriteEntity } from './favorite.ts';
import { InboxEmailDeliveryEntity } from './inbox-email-delivery.ts';
import { InboxNotificationStateEntity } from './inbox-notification-state.ts';
import { InboxPushDeliveryEntity } from './inbox-push-delivery.ts';
import { InboxTelegramDeliveryEntity } from './inbox-telegram-delivery.ts';
import { MetaConnectionAssetEntity } from './meta-connection-asset.ts';
import { MetaConnectionInviteEntity } from './meta-connection-invite.ts';
import { MetaConnectionEntity } from './meta-connection.ts';
import { MetaOAuthStateEntity } from './meta-oauth-state.ts';
import { RuleEntityStateEntity } from './rule-entity-state.ts';
import { RuleExamplesBootstrapEntity } from './rule-examples-bootstrap.ts';
import { RuleExecutionStateEntity } from './rule-execution-state.ts';
import { RuleGroupItemEntity } from './rule-group-item.ts';
import { RuleGroupEntity } from './rule-group.ts';
import { RulePresetEntity } from './rule-preset.ts';
import { StoppedAdSetEntity } from './stopped-ad-set.ts';
import { SummarySnapshotEntity } from './summary-snapshot.ts';
import { SyncActionEntity } from './sync-action.ts';
import { TeamAccountEntity } from './team-account.ts';
import { TeamDocumentEntity } from './team-document.ts';
import { TeamMemberEntity } from './team-member.ts';
import { TeamEntity } from './team.ts';
import { TelegramConnectionEntity } from './telegram-connection.ts';
import { TelegramLinkTokenEntity } from './telegram-link-token.ts';
import { UserEntity } from './user.ts';
import { ViewSettingEntity } from './view-setting.ts';
import { WebSessionEntity } from './web-session.ts';
import { WorkspaceInviteEntity } from './workspace-invite.ts';
import { WorkspaceMemberEntity } from './workspace-member.ts';
import { WorkspaceSupportGrantEntity } from './workspace-support-grant.ts';
import { WorkspaceViewDefaultEntity } from './workspace-view-default.ts';
import { WorkspaceEntity } from './workspace.ts';

export { AccountHealthEntity } from './account-health.ts';
export { AccountNotificationSettingEntity } from './account-notification-setting.ts';
export { AccountEntity } from './account.ts';
export { ActionUndoStateEntity } from './action-undo-state.ts';
export { AdsetInventoryCacheEntity } from './adset-inventory-cache.ts';
export { AnalyticsEntityFactEntity } from './analytics-entity-fact.ts';
export { AppSettingsEntity } from './app-settings.ts';
export { AuditEventEntity } from './audit-event.ts';
export { AutomationRuntimeStateEntity } from './automation-runtime-state.ts';
export { AutomationScheduleStateEntity } from './automation-schedule-state.ts';
export { DeletedItemEntity } from './deleted-item.ts';
export { DesktopPushSubscriptionEntity } from './desktop-push-subscription.ts';
export { EmailVerificationCodeEntity } from './email-verification-code.ts';
export { FavoriteEntity } from './favorite.ts';
export { InboxEmailDeliveryEntity } from './inbox-email-delivery.ts';
export { InboxNotificationStateEntity } from './inbox-notification-state.ts';
export { InboxPushDeliveryEntity } from './inbox-push-delivery.ts';
export { InboxTelegramDeliveryEntity } from './inbox-telegram-delivery.ts';
export { MetaConnectionAssetEntity } from './meta-connection-asset.ts';
export { MetaConnectionInviteEntity } from './meta-connection-invite.ts';
export { MetaConnectionEntity } from './meta-connection.ts';
export { MetaOAuthStateEntity } from './meta-oauth-state.ts';
export { RuleEntityStateEntity } from './rule-entity-state.ts';
export { RuleExamplesBootstrapEntity } from './rule-examples-bootstrap.ts';
export { RuleExecutionStateEntity } from './rule-execution-state.ts';
export { RuleGroupItemEntity } from './rule-group-item.ts';
export { RuleGroupEntity } from './rule-group.ts';
export { RulePresetEntity } from './rule-preset.ts';
export { StoppedAdSetEntity } from './stopped-ad-set.ts';
export { SummarySnapshotEntity } from './summary-snapshot.ts';
export { SyncActionEntity } from './sync-action.ts';
export { TeamAccountEntity } from './team-account.ts';
export { TeamDocumentEntity } from './team-document.ts';
export { TeamMemberEntity } from './team-member.ts';
export { TeamEntity } from './team.ts';
export { TelegramConnectionEntity } from './telegram-connection.ts';
export { TelegramLinkTokenEntity } from './telegram-link-token.ts';
export { UserEntity } from './user.ts';
export { ViewSettingEntity } from './view-setting.ts';
export { WebSessionEntity } from './web-session.ts';
export { WorkspaceInviteEntity } from './workspace-invite.ts';
export { WorkspaceMemberEntity } from './workspace-member.ts';
export { WorkspaceSupportGrantEntity } from './workspace-support-grant.ts';
export { WorkspaceViewDefaultEntity } from './workspace-view-default.ts';
export { WorkspaceEntity } from './workspace.ts';

export const BUYERLY_ENTITIES = [
  AccountHealthEntity,
  AccountNotificationSettingEntity,
  AccountEntity,
  ActionUndoStateEntity,
  AdsetInventoryCacheEntity,
  AnalyticsEntityFactEntity,
  AppSettingsEntity,
  AuditEventEntity,
  AutomationRuntimeStateEntity,
  AutomationScheduleStateEntity,
  DeletedItemEntity,
  DesktopPushSubscriptionEntity,
  EmailVerificationCodeEntity,
  FavoriteEntity,
  InboxEmailDeliveryEntity,
  InboxNotificationStateEntity,
  InboxPushDeliveryEntity,
  InboxTelegramDeliveryEntity,
  MetaConnectionAssetEntity,
  MetaConnectionInviteEntity,
  MetaConnectionEntity,
  MetaOAuthStateEntity,
  RuleEntityStateEntity,
  RuleExamplesBootstrapEntity,
  RuleExecutionStateEntity,
  RuleGroupItemEntity,
  RuleGroupEntity,
  RulePresetEntity,
  StoppedAdSetEntity,
  SummarySnapshotEntity,
  SyncActionEntity,
  TeamAccountEntity,
  TeamDocumentEntity,
  TeamMemberEntity,
  TeamEntity,
  TelegramConnectionEntity,
  TelegramLinkTokenEntity,
  UserEntity,
  ViewSettingEntity,
  WebSessionEntity,
  WorkspaceInviteEntity,
  WorkspaceMemberEntity,
  WorkspaceSupportGrantEntity,
  WorkspaceViewDefaultEntity,
  WorkspaceEntity,
];
