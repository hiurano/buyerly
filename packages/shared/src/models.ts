// The database's models as plain types (#611 stage 2): one interface per
// table, a field per column. The server's TypeORM entities (server/src/entities)
// implement them, so a column renamed on one side and not the other fails the
// typecheck. Fields are camelCase; the column names stay snake_case.
//
// Integers are numbers; BIGINT columns are strings, as node-postgres returns
// them, since they may exceed 2^53. Timestamps are Dates.

import type { JsonObject } from './json.ts';
import type { InboxDisplay, NotificationChannels, RuleCondition, ViewSettingsBlob } from './jsonb.ts';

/**
 * Latest secret-safe reliability snapshot for one workspace account.
 */
export interface AccountHealth {
  id: number;
  workspaceId: number;
  accountPk: number;
  status: string;
  cause: string;
  signals: JsonObject;
  consecutiveFailures: number;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorCode: string;
  lastErrorMessage: string;
  lastCheckedAt: Date;
  lastTransitionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Which kinds of an ad account's events reach one member's Inbox, Linear's bell on a project.
 *
 * Without rows for a member and account, Inbox keeps its own rule: the
 * account's lead gets its events, everyone does when nobody leads it. Once
 * the member picks in the bell, a row per kind says yes or no for them.
 */
export interface AccountNotificationSetting {
  id: number;
  memberId: number;
  accountId: string;
  kind: string;
  enabled: boolean;
  updatedAt: Date;
}

export interface Account {
  id: number;
  workspaceId: number | null;
  /** Facebook Ad Account ID (act_...) */
  accountId: string;
  /** Human-readable ad account name */
  name: string;
  /** Internal Buyerly name for the ad account; never overwritten by Meta data */
  customName: string;
  /** Editable internal owner note about the ad account */
  note: string;
  /** Deprecated plaintext manual token; cleared after migration */
  accessToken: string | null;
  /** Encrypted Meta OAuth connection used by this account */
  metaConnectionId: number | null;
  ownerUserId: number | null;
  /** Batch name (if the accounts were added as a batch) */
  batchName: string;
  /** ISO 4217 ad account currency from Meta */
  currency: string;
  /** Ad account time zone */
  timezoneName: string;
  /** Legacy: the previous date spend was detected */
  lastStartedDate: string;
  /** Last local date handled by the new-day notification */
  lastDayStartDate: string;
  /** JSON array of attached rule objects */
  activeRules: string;
  /** 1: ACTIVE, 2: DISABLED, 3: UNSETTLED */
  accountStatus: number;
  statusLabel: string;
  /** Whether automated stop rules are enabled */
  rulesEnabled: boolean;
  /** Whether the ad account is enabled in the system */
  isActive: boolean;
  createdAt: Date;
  /** Encrypted manual User/System User Access Token */
  accessTokenEncrypted: string | null;
  /** Declared primary conversion event: '', 'leads', 'registrations' or 'purchases' */
  primaryResult: string;
  /** Target cost per primary result in the ad account currency; NULL when undeclared */
  targetCostPerResult: number | null;
  /** The buyer responsible for the account, as a Linear project's lead; whoever connects it at first */
  leadUserId: number | null;
}

/**
 * Durable one-at-a-time claim for an idempotent audit action reversal.
 */
export interface ActionUndoState {
  id: number;
  originalEventId: number;
  ownerUserId: number | null;
  status: string;
  correlationId: string;
  attemptCount: number;
  expectedState: JsonObject;
  desiredState: JsonObject;
  lastError: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * PostgreSQL-backed shared inventory cache for Meta ad sets across worker and API.
 */
export interface AdsetInventoryCache {
  accountId: string;
  /** List of adsets: id, name, status, effective_status, daily_budget */
  adsetsPayload: JsonObject[];
  version: number;
  fetchedAt: Date;
  expiresAt: Date;
  updatedAt: Date;
}

/**
 * Normalized, workspace-isolated hierarchical metric fact store (Account -> Campaign -> AdSet -> Ad).
 */
export interface AnalyticsEntityFact {
  id: string;
  workspaceId: number;
  /** Meta Ad Account ID (act_...) */
  accountId: string;
  /** 'account', 'campaign', 'adset', 'ad' */
  entityLevel: string;
  /** Meta ID of the entity */
  entityId: string;
  entityName: string;
  parentEntityId: string;
  /** Ad account local date (YYYY-MM-DD) */
  date: string;
  currency: string;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  cpm: number;
  clicks: number;
  uniqueClicks: number;
  linkClicks: number;
  outboundClicks: number;
  landingPageViews: number;
  cpc: number;
  cpcLink: number | null;
  ctr: number;
  ctrLink: number | null;
  ctrOutbound: number | null;
  leads: number;
  registrations: number;
  purchases: number;
  costPerLead: number | null;
  costPerRegistration: number | null;
  costPerPurchase: number | null;
  costPerLandingPageView: number | null;
  rawActions: JsonObject[];
  status: string;
  effectiveStatus: string;
  dailyBudget: number;
  fetchedAt: Date;
  updatedAt: Date;
}

export interface AppSettings {
  id: number;
  /** Ad account polling interval (min) */
  pollIntervalMinutes: number;
  /** Maximum check interval for critical STOP rules (min) */
  criticalRuleIntervalMinutes: number;
  /** How many minutes a STOP condition must hold before the ad set is switched off */
  stopConfirmationMinutes: number;
  /** Cache lifetime for the ad set list and statuses (min) */
  inventoryCacheMinutes: number;
  /** Check interval for ad account currency, time zone and status (min) */
  accountHealthIntervalMinutes: number;
  /** Maximum Meta ad accounts read concurrently */
  maxConcurrentAccounts: number;
  /** Maximum Meta actions executed concurrently */
  maxConcurrentActions: number;
  /** Adaptive Meta API slow-down threshold (%) */
  usageSoftLimitPercent: number;
  /** Threshold for pausing non-critical Meta API requests (%) */
  usageHardLimitPercent: number;
  /** Automatically reduce frequency as quota usage grows */
  adaptivePollingEnabled: boolean;
  updatedAt: Date;
}

/**
 * Append-only product audit trail, independent from notification delivery.
 */
export interface AuditEvent {
  id: number;
  workspaceId: number | null;
  ownerUserId: number | null;
  actorType: string;
  actorId: string;
  category: string;
  eventType: string;
  status: string;
  accountId: string;
  accountName: string;
  /** Empty when the action was not on an ad set */
  adsetId: string;
  adsetName: string;
  ruleId: number | null;
  ruleName: string;
  action: string;
  message: string;
  beforeState: JsonObject;
  afterState: JsonObject;
  details: JsonObject;
  correlationId: string;
  revertsEventId: number | null;
  durationMs: number;
  createdAt: Date;
  /** Level of the entity the action was applied to: 'campaign', 'adset' or 'ad' */
  entityLevel: string;
  /** Meta ID of this entity */
  entityId: string;
  entityName: string;
}

/**
 * Small durable status snapshot shared by the worker and settings UI.
 */
export interface AutomationRuntimeState {
  stateKey: string;
  payload: JsonObject;
  updatedAt: Date;
}

/**
 * Durable worker schedule state that survives restart and deploy.
 */
export interface AutomationScheduleState {
  id: number;
  stateKey: string;
  ownerUserId: number | null;
  accountId: string;
  ruleKey: string;
  lastCheckedAt: number;
  updatedAt: Date;
}

/**
 * A deleted rule or rule group, kept restorable for a retention window.
 *
 * Deletion still removes the live row, so the worker, the rule engine and
 * every list query never see it. The snapshot holds exactly what deletion
 * removed — the row itself, its group memberships and, for a rule, the ad
 * account attachments — so a restore puts it back under the same id.
 */
export interface DeletedItem {
  id: number;
  workspaceId: number;
  /** 'rule' or 'rule_group' */
  kind: string;
  /** Id the entity had, and gets back on restore */
  entityId: number;
  name: string;
  snapshot: JsonObject;
  deletedByUserId: number | null;
  deletedAt: Date;
}

/**
 * One browser's Web Push subscription for a member's desktop notifications (#503).
 *
 * It lasts as long as the sign-in it was made in: logging out of that browser ends the web
 * session, and with it the notifications. The push service's 404 or 410 removes it too.
 */
export interface DesktopPushSubscription {
  id: number;
  memberId: number;
  webSessionId: string;
  /** The browser's push service address */
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
  createdAt: Date;
}

export interface EmailVerificationCode {
  id: number;
  /** Email of the code recipient */
  email: string;
  /** Legacy field; new OTP values are never stored in plaintext */
  code: string;
  /** Code expiry (UTC) */
  expiresAt: Date;
  /** Whether the code was used */
  isUsed: boolean;
  /** Number of failed code attempts */
  failedAttempts: number;
  createdAt: Date;
  /** HMAC-SHA256 of the verification code */
  codeHash: string;
  /** Code purpose: login/email_change/email_verification */
  purpose: string;
  /** Isolated scope of the one-time code */
  scope: string;
  /** The code was handed to the mail provider successfully */
  deliveredAt: Date | null;
  /** HMAC-SHA256 of the one-time sign-in link token */
  linkTokenHash: string | null;
  /** The invite that authorized this sign-in */
  inviteId: number | null;
}

/**
 * A page or record one member pinned to the sidebar's Favorites, as Linear's favorites.
 *
 * `path` is the app address inside the workspace, without its slug
 * ("team/TES/ads-manager/campaigns", "accounts/act_1001"), so a renamed
 * workspace keeps its favorites; `kind` picks the sidebar icon and `title`
 * is the name it had when starred, shown until the app knows a newer one.
 */
export interface Favorite {
  id: number;
  memberId: number;
  kind: string;
  path: string;
  title: string;
  position: number;
  createdAt: Date;
}

/**
 * One email about one Inbox notification to one member, so it is never sent twice.
 *
 * The row is written before the email goes out; sent_at stays empty if the
 * worker stopped in between, and that email is not retried.
 */
export interface InboxEmailDelivery {
  id: number;
  userId: number;
  auditEventId: number;
  email: string;
  createdAt: Date;
  sentAt: Date | null;
}

/**
 * One member's read, delete and snooze state for one audit event in Inbox.
 *
 * Deleting or snoozing only hides the event from this person's Inbox; the
 * audit event itself stays, so history and undo keep working.
 */
export interface InboxNotificationState {
  id: number;
  userId: number;
  auditEventId: number;
  isRead: boolean;
  deletedAt: Date | null;
  snoozedUntil: Date | null;
  updatedAt: Date;
}

/**
 * One desktop notification about one Inbox notification to one member, so it is never sent twice.
 */
export interface InboxPushDelivery {
  id: number;
  userId: number;
  auditEventId: number;
  createdAt: Date;
  sentAt: Date | null;
}

/**
 * One Telegram message about one Inbox notification to one member, so it is never sent twice.
 */
export interface InboxTelegramDelivery {
  id: number;
  userId: number;
  auditEventId: number;
  chatId: string;
  createdAt: Date;
  sentAt: Date | null;
}

/**
 * Latest safe discovery snapshot of an ad account visible to a connection.
 */
export interface MetaConnectionAsset {
  id: number;
  connectionId: number;
  ownerUserId: number;
  metaAccountId: string;
  name: string;
  businessId: string;
  businessName: string;
  accountStatus: number;
  currency: string;
  timezoneName: string;
  discoveredAt: Date;
}

/**
 * One-time secure invite link allowing a Facebook profile owner to connect their account
 * to a Buyerly workspace without sharing passwords, cookies, or plaintext tokens.
 */
export interface MetaConnectionInvite {
  id: number;
  /** Workspace the connected profile will be linked to */
  workspaceId: number;
  /** Buyerly user who generated this invite link */
  createdByUserId: number | null;
  /** SHA-256 hash of the raw invite token (never store plaintext) */
  tokenHash: string;
  /** Safe human-readable prefix for UI display, e.g. inv_fb_a1b2c3... */
  tokenPrefix: string;
  /** Admin-assigned human label, e.g. 'Buyer Ivan — Profile #3' */
  label: string;
  /** Lifecycle: pending | used | revoked | expired */
  status: string;
  /** Hard expiry after which the invite cannot be used */
  expiresAt: Date;
  /** Timestamp of successful OAuth completion */
  usedAt: Date | null;
  /** MetaConnection created as result of this invite */
  connectedMetaId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One encrypted Meta user authorization owned by one Buyerly user in a specific workspace.
 */
export interface MetaConnection {
  id: number;
  workspaceId: number;
  ownerUserId: number;
  providerUserId: string;
  providerUserName: string;
  accessTokenEncrypted: string;
  grantedScopes: string[];
  tokenExpiresAt: Date | null;
  status: string;
  lastError: string;
  lastValidatedAt: Date | null;
  connectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Short-lived, single-use OAuth state; the browser secret itself is never stored.
 */
export interface MetaOAuthState {
  id: number;
  stateHash: string;
  ownerUserId: number;
  returnPath: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  reconnectConnectionId: number | null;
  workspaceId: number;
  /** Invite that triggered this OAuth flow; null for direct connections */
  inviteId: number | null;
}

/**
 * Where one rule stands on one entity as of its latest check (#322).
 *
 * A snapshot, overwritten on every check, never a history: the Inbox keeps
 * the actions, this row answers "why is the rule quiet here right now".
 * The worker drops rows whose entity or rule left the account's check.
 */
export interface RuleEntityState {
  id: number;
  workspaceId: number;
  accountId: string;
  /** RulePreset id */
  ruleId: number;
  entityLevel: string;
  entityId: string;
  entityName: string;
  campaignId: string;
  state: string;
  detail: string;
  waitUntil: Date | null;
  yieldedToRuleId: number | null;
  yieldedToRuleName: string;
  checkedAt: Date;
  actedAt: Date | null;
}

/**
 * One-time marker so deleted examples are never silently recreated.
 *
 * Since examples version 2 (#386) a workspace gets one set, marked on the
 * workspace owner's row; older per-member rows only ever say "version 1".
 */
export interface RuleExamplesBootstrap {
  id: number;
  ownerUserId: number;
  version: number;
  createdAt: Date;
  workspaceId: number;
}

/**
 * One durable execution slot per account/ad set/rule/action combination.
 */
export interface RuleExecutionState {
  id: number;
  executionKey: string;
  ownerUserId: number | null;
  accountId: string;
  /** Empty when the slot is not about an ad set */
  adsetId: string;
  ruleKey: string;
  action: string;
  status: string;
  correlationId: string;
  lastAttemptAt: number;
  lastSuccessAt: number | null;
  beforeState: JsonObject;
  afterState: JsonObject;
  details: JsonObject;
  createdAt: Date;
  updatedAt: Date;
  entityLevel: string;
  entityId: string;
}

/**
 * A label on a rule; `created_at` is when the label was applied.
 */
export interface RuleGroupItem {
  id: number;
  groupId: number;
  presetId: number;
  position: number;
  createdAt: Date;
}

/**
 * A rule label, as Linear's issue labels (#383): a name, a color, a description.
 *
 * The table keeps its old name from when labels were rule groups; a rule
 * can carry any number of labels through `rule_group_items`.
 */
export interface RuleGroup {
  id: number;
  workspaceId: number | null;
  ownerUserId: number | null;
  name: string;
  description: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  /** Legacy group marker, kept only to color old snapshots; labels use `color` */
  icon: string;
  /** Label color as #rrggbb */
  color: string;
}

export interface RulePreset {
  id: number;
  workspaceId: number | null;
  ownerUserId: number | null;
  /** Preset name (e.g. 'Stop when CPL exceeds threshold') */
  name: string;
  /** 'turn_off', 'turn_on', 'notify_only', 'increase_budget', 'decrease_budget' */
  action: string;
  /** JSONB list of conditions */
  conditions: RuleCondition[];
  /** 'and' or 'or' - how conditions are combined */
  conditionLogic: string;
  /** Pause between firings (min, 0 = none) */
  cooldownMinutes: number;
  /** Worker check interval (min) */
  checkIntervalMinutes: number;
  notifyTg: boolean;
  /** Budget change, in percent */
  budgetChangePercent: number;
  /** Max daily budget in the ad account currency, 0 = no cap */
  budgetMaxDaily: number;
  createdAt: Date;
  updatedAt: Date;
  /** A disabled rule is never executed by the worker on any ad account */
  enabled: boolean;
  /** Execution level: 'adset', 'campaign' or 'ad'; metrics are read and the action is applied there */
  level: string;
}

export interface StoppedAdSet {
  id: number;
  accountId: string;
  adsetId: string;
  adsetName: string;
  /** Spend at switch-off time, in the ad account currency */
  stopSpend: number;
  /** Leads at switch-off time */
  stopLeads: number;
  /** Registrations at switch-off time */
  stopRegistrations: number;
  /** Whether the late conversion was handled (turned on/dismissed) */
  isResolved: boolean;
  stoppedAt: Date;
  updatedAt: Date;
}

/**
 * Durable, workspace/owner-isolated history of successful dashboard refreshes.
 */
export interface SummarySnapshot {
  id: number;
  workspaceId: number | null;
  ownerUserId: number | null;
  period: string;
  /** Safe summary JSONB with no access token */
  payload: JsonObject;
  schemaVersion: number;
  generatedAt: Date;
  createdAt: Date;
}

/**
 * One change to a synced model, as Linear's sync actions (#504); written by triggers, see database/sync_log.py.
 *
 * `id` is the order rows were written in; `sync_id` is the order they were
 * committed in, set at commit, and what clients catch up from.
 */
export interface SyncAction {
  id: string;
  /** Set when the write commits; NULL until then */
  syncId: string | null;
  /** Model name the client knows it by ('Team', 'Account', ...) */
  model: string;
  modelId: string;
  /** 'insert', 'update', 'archive' or 'delete' */
  action: string;
  /** The new row on insert, the changed fields on update or archive */
  data: JsonObject;
  /** Who receives it: workspace:<id>[:members], team:<id>, member:<id> */
  syncGroups: string[];
  createdAt: Date;
}

/**
 * An ad account a team works on; an account may belong to several teams.
 */
export interface TeamAccount {
  id: number;
  teamId: number;
  accountId: number;
  createdAt: Date;
}

/**
 * A document on a team's Home, as Linear's team Documents: a title and a Markdown body.
 */
export interface TeamDocument {
  id: number;
  teamId: number;
  title: string;
  content: string;
  createdByUserId: number | null;
  updatedByUserId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A workspace member on a team; leaving the workspace takes them off every team.
 */
export interface TeamMember {
  id: number;
  teamId: number;
  memberId: number;
  joinedAt: Date;
  /** Linear's team owner: runs the team without being a workspace admin; its creator at first */
  isOwner: boolean;
}

/**
 * A team inside a workspace, as Linear's Settings → Teams has them (#371).
 *
 * A team gathers workspace members and the ad accounts they work on; it
 * changes nobody's access. Retiring keeps it out of the active list;
 * deleting hides it for TEAM_RESTORE_DAYS, during which it can be restored.
 */
export interface Team {
  id: number;
  workspaceId: number;
  name: string;
  /** Identifier, as Linear's team key (e.g. 'BUY') */
  key: string;
  description: string;
  createdByUserId: number | null;
  createdAt: Date;
  updatedAt: Date;
  retiredAt: Date | null;
  deletedAt: Date | null;
  /** Linear's private team: only its members see it and its ad accounts */
  private: boolean;
}

/**
 * A member's personal Telegram account, linked from Settings → Connected accounts.
 *
 * As Linear's personal Slack account, it belongs to one member of one workspace.
 */
export interface TelegramConnection {
  id: number;
  memberId: number;
  /** Private chat with the bot */
  chatId: string;
  username: string | null;
  firstName: string | null;
  connectedAt: Date;
  /** Why the bot cannot message this account, e.g. it was blocked */
  deliveryError: string | null;
  deliveryErrorAt: Date | null;
}

/**
 * A one-time link that opens the bot and connects the member who asked for it.
 */
export interface TelegramLinkToken {
  id: number;
  memberId: number;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface User {
  id: number;
  /** Telegram user ID (for push notifications) */
  telegramId: string | null;
  /** User login (e.g. Artem) */
  username: string;
  fullName: string;
  /** First name */
  firstName: string;
  /** Last name */
  lastName: string;
  /** Normalized unique work email */
  email: string | null;
  /** Avatar URL or path */
  avatarUrl: string;
  /** Current onboarding step ('personal_details', 'workspace', 'invites', 'completed') */
  onboardingStep: string;
  /** Whether the user finished the full onboarding */
  onboardingCompleted: boolean;
  /** Legacy browser token; migrated to web_sessions and cleared */
  authToken: string | null;
  /** 'admin' or 'buyer' */
  role: string;
  /** Whether access is approved */
  isApproved: boolean;
  /** Active workspace ID */
  activeWorkspaceId: number | null;
  createdAt: Date;
  /** Date and time the email was confirmed (UTC) */
  emailVerifiedAt: Date | null;
  /** Newly requested email, pending OTP confirmation */
  unconfirmedEmail: string | null;
  /** Job title or role, as in Linear's Profile (0035) */
  title: string;
}

/**
 * One member's view of a list page, as Linear remembers each view per user (#385).
 *
 * `view_key` names the page ("rules", "ads-manager.campaigns", …); `settings`
 * holds its layout, grouping, ordering, direction, display properties and
 * filters. The server keeps the blob as given: each page knows its own shape.
 */
export interface ViewSetting {
  id: number;
  memberId: number;
  viewKey: string;
  settings: ViewSettingsBlob;
  updatedAt: Date;
}

export interface WebSession {
  id: string;
  userId: number;
  tokenHash: string;
  csrfHash: string;
  userAgent: string;
  ipAddress: string;
  createdAt: Date;
  expiresAt: Date;
  lastSeenAt: Date;
  rotatedAt: Date;
  revokedAt: Date | null;
  location: string;
}

export interface WorkspaceInvite {
  id: number;
  /** ID of the workspace being invited to */
  workspaceId: number;
  /** Unique secure invite token */
  token: string;
  /** Invitee email (for personal invites) */
  email: string | null;
  /** Role on joining: 'admin', 'member', 'guest' */
  role: string;
  /** ID of the user who created the invite */
  inviterUserId: number | null;
  /** Invite status ('pending', 'accepted', 'revoked', 'expired') */
  status: string;
  /** Maximum uses (1 = single use, 0 = unlimited) */
  maxUses: number;
  /** How many times the invite was actually used */
  usedCount: number;
  /** Invite expiry (UTC) */
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceMember {
  id: number;
  workspaceId: number;
  userId: number;
  /** Linear's roles: 'owner', 'admin', 'member', 'guest' */
  role: string;
  joinedAt: Date;
  /** Inbox events up to this moment count as read unless marked otherwise */
  inboxReadBefore: Date;
  /** Read Inbox events up to this moment are deleted for this member */
  inboxDeletedBefore: Date | null;
  /** This member's Inbox Display options; NULL keeps Linear's defaults */
  inboxDisplay: InboxDisplay | null;
  /** This member's Email notification settings; NULL keeps Linear's defaults */
  notificationChannels: NotificationChannels | null;
}

/**
 * Temporary, auditable privileged support/impersonation grant for platform superadmins.
 */
export interface WorkspaceSupportGrant {
  id: number;
  /** ID of the workspace granted temporary support access */
  workspaceId: number;
  /** ID of the platform administrator granted access */
  userId: number;
  /** Temporary workspace role for the session ('admin' or 'guest') */
  role: string;
  /** Mandatory justification for support/diagnostic access */
  reason: string;
  /** Support session expiry (UTC) */
  expiresAt: Date;
  createdAt: Date;
  /** Time the grant was revoked early (if revoked) */
  revokedAt: Date | null;
}

/**
 * A workspace's default view of a list page, Linear's "Set default for everyone" (#472).
 *
 * Same blob as `ViewSetting`, kept once per workspace and `view_key` and set by
 * an admin or owner. A member's own saved view still wins over it, key by key.
 */
export interface WorkspaceViewDefault {
  id: number;
  workspaceId: number;
  viewKey: string;
  settings: ViewSettingsBlob;
  updatedByUserId: number | null;
  updatedAt: Date;
}

export interface Workspace {
  id: number;
  /** Workspace name (e.g. 'Buyerly', 'Canada Traffic') */
  name: string;
  /** URL slug (e.g. 'buyerly', 'canada-traffic') */
  slug: string;
  /** Badge symbol or letter */
  badgeText: string;
  /** Badge color (#F5A300, #7C3AED, etc.) */
  badgeColor: string;
  /** Company logo URL or path */
  logoUrl: string;
  ownerUserId: number;
  createdAt: Date;
  updatedAt: Date;
}
