import { graphql } from './graphql';
import type { InboxKind } from './inbox';

/** Inbox kinds an ad account's events can be; Team belongs to no account. */
export const ACCOUNT_NOTIFICATION_KINDS = [
  'urgent',
  'rule_alerts',
  'rule_actions',
  'assistant',
  'manual',
  'system',
] as const satisfies readonly InboxKind[];
export type AccountNotificationKind = typeof ACCOUNT_NOTIFICATION_KINDS[number];

/** Each kind as the bell lists it, in the words of Linear's "An issue is added to the project". */
export const ACCOUNT_NOTIFICATION_LABELS: Record<AccountNotificationKind, string> = {
  urgent: 'An error or a problem with the ad account',
  rule_alerts: 'A rule sends an alert',
  rule_actions: 'A rule pauses, resumes or changes a budget',
  assistant: 'The AI assistant makes a change',
  manual: 'Someone makes a change by hand',
  system: 'Other updates, such as syncs',
};

/**
 * The kinds of one ad account's events that reach my Inbox. `custom` is false
 * while Inbox's own rule decides: all of them for the lead, or for everyone
 * while nobody leads the account.
 */
export interface AccountNotifications {
  account_id: string;
  kinds: AccountNotificationKind[];
  custom: boolean;
}

export function loadAccountNotifications(accountId: string): Promise<AccountNotifications> {
  return graphql<AccountNotifications>(
    'query AccountNotificationSetting($accountId: String!) { accountNotificationSetting(accountId: $accountId) }',
    { accountId },
  );
}

export function saveAccountNotifications(accountId: string, kinds: AccountNotificationKind[]): Promise<AccountNotifications> {
  return graphql<{ accountNotificationSetting: AccountNotifications }>(
    `mutation AccountNotificationSettingUpdate($accountId: String!, $input: JSON!) {
      accountNotificationSettingUpdate(accountId: $accountId, input: $input) { success lastSyncId accountNotificationSetting }
    }`,
    { accountId, input: { kinds } },
  ).then((payload) => payload.accountNotificationSetting);
}
