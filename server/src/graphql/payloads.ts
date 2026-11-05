import { Field, Float, ObjectType } from 'type-graphql';
import { JSONScalar } from './scalars.ts';

// Linear's `<Model>Payload` (api/client_api/schema.py _payload): whether the
// mutation worked, the sync id to wait for, and the record as JSON. Every
// payload type of the Python schema is declared here, whichever area returns
// it, so areas share them and the schema keeps Python's type names.

export interface Payload {
  success: boolean;
  lastSyncId: number;
  [entity: string]: unknown;
}

export type PayloadClass = (new () => Payload) & { entity: string | null };

function payload(name: string, entity: string | null = null): PayloadClass {
  @ObjectType(name)
  class Generated {
    static entity = entity;

    @Field(() => Boolean)
    success!: boolean;

    @Field(() => Float)
    lastSyncId!: number;

    [entity: string]: unknown;
  }
  if (entity) Field(() => JSONScalar, { nullable: true })(Generated.prototype, entity);
  return Generated;
}

export const SuccessPayload = payload('SuccessPayload');
export const AccountPayload = payload('AccountPayload', 'account');
export const AccountNotificationSettingPayload = payload('AccountNotificationSettingPayload', 'accountNotificationSetting');
export const AuditEventPayload = payload('AuditEventPayload', 'auditEvent');
export const DeletedItemPayload = payload('DeletedItemPayload', 'deletedItem');
export const DeliveryPayload = payload('DeliveryPayload', 'entity');
export const DesktopNotificationsPayload = payload('DesktopNotificationsPayload', 'desktopNotifications');
export const EmailChangePayload = payload('EmailChangePayload', 'emailChange');
export const FavoritePayload = payload('FavoritePayload', 'favorite');
export const InboxDisplayPayload = payload('InboxDisplayPayload', 'inboxDisplay');
export const InboxNotificationPayload = payload('InboxNotificationPayload', 'inboxNotification');
export const MetaConnectionPayload = payload('MetaConnectionPayload', 'metaConnection');
export const MetaInvitePayload = payload('MetaInvitePayload', 'metaInvite');
export const MetaOAuthPayload = payload('MetaOAuthPayload', 'authorization');
export const NotificationChannelsPayload = payload('NotificationChannelsPayload', 'notificationChannels');
export const OnboardingPayload = payload('OnboardingPayload', 'onboarding');
export const RulePayload = payload('RulePayload', 'rule');
export const RuleLabelPayload = payload('RuleLabelPayload', 'ruleLabel');
export const RulesPayload = payload('RulesPayload', 'rules');
export const SupportSessionPayload = payload('SupportSessionPayload', 'supportSession');
export const TeamPayload = payload('TeamPayload', 'team');
export const TeamDocumentPayload = payload('TeamDocumentPayload', 'teamDocument');
export const TelegramPayload = payload('TelegramPayload', 'telegram');
export const UserPayload = payload('UserPayload', 'user');
export const ViewSettingPayload = payload('ViewSettingPayload', 'viewSetting');
export const WorkspacePayload = payload('WorkspacePayload', 'workspace');
export const WorkspaceInvitePayload = payload('WorkspaceInvitePayload', 'workspaceInvite');
export const WorkspaceInviteLinkPayload = payload('WorkspaceInviteLinkPayload', 'workspaceInviteLink');
export const WorkspaceMemberPayload = payload('WorkspaceMemberPayload', 'workspaceMember');
