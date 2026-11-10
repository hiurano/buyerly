import React, { useEffect, useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  INBOX_KINDS,
  INBOX_KIND_LABELS,
  fetchInboxFacets,
  fetchInboxSenders,
  type InboxFacets,
  type InboxFilterClause,
  type InboxKind,
  type InboxPriorityRule,
  type InboxSender,
} from '@/lib/inbox';
import { channelStatus, type NotificationChannel } from '@/lib/notificationChannels';
import { telegramAccountName } from '@/lib/telegram';
import { BuyerlyFilterMenu, type FilterMenuMode } from '@/components/filters/BuyerlyFilter';
import type { FilterClause } from '@/components/filters/filterModel';
import { InboxFilterChip } from '@/components/inbox/InboxFilterBar';
import { fromMenuClauses, inboxFilterFields, toMenuClause } from '@/components/inbox/inboxFilterFields';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { Button } from '@/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import { BuyerlyToggle } from '@/ui/BuyerlyToggle';
import { Tooltip } from '@/ui/Tooltip';
import { withClassName } from '@/ui/withClassName';
import { useInboxStore } from '@/models/inboxStore';
import { useNotificationSettingsStore } from '@/models/notificationSettingsStore';
import { preferencesStyles } from './preferencesStyles';
import css from './Preferences.module.css';

const styles = stylex.create({
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
});

/** What each kind holds, in place of Linear's descriptions of its notification types. */
const KIND_DESCRIPTIONS: Record<InboxKind, string> = {
  urgent: 'Errors, expired Meta access and ad account problems',
  rule_alerts: 'Alerts from rules that only notify',
  rule_actions: 'Stops, budget changes and other actions taken by rules',
  assistant: 'Changes made through the AI assistant',
  manual: 'Changes made by hand',
  team: 'Invitations and support access',
  system: 'Everything else Buyerly reports',
};

/** Linear's custom filters use two properties: Notification type and From. */
const RULE_FIELDS = ['type', 'from'] as const;

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function useInboxDisplay() {
  const inboxDisplay = useInboxStore((state) => state.inboxDisplay);
  const inboxDisplayLoaded = useInboxStore((state) => state.inboxDisplayLoaded);
  const loadInboxDisplay = useInboxStore((state) => state.loadInboxDisplay);
  const setInboxDisplay = useInboxStore((state) => state.setInboxDisplay);
  useEffect(() => {
    if (!inboxDisplayLoaded) void loadInboxDisplay();
  }, [inboxDisplayLoaded, loadInboxDisplay]);
  return { inboxDisplay, setInboxDisplay };
}

function useNotificationChannels() {
  const notificationChannels = useNotificationSettingsStore((state) => state.notificationChannels);
  const notificationChannelsLoaded = useNotificationSettingsStore((state) => state.notificationChannelsLoaded);
  const loadNotificationChannels = useNotificationSettingsStore((state) => state.loadNotificationChannels);
  const setChannelNotifications = useNotificationSettingsStore((state) => state.setChannelNotifications);
  const setNotificationChannels = useNotificationSettingsStore((state) => state.setNotificationChannels);
  useEffect(() => {
    if (!notificationChannelsLoaded) void loadNotificationChannels();
  }, [notificationChannelsLoaded, loadNotificationChannels]);
  return { notificationChannels, setChannelNotifications, setNotificationChannels };
}

/** Desktop notifications in this browser: whether they can work and whether it gets them. */
function useDesktopNotifications() {
  const desktop = useNotificationSettingsStore((state) => state.desktop);
  const desktopLoaded = useNotificationSettingsStore((state) => state.desktopLoaded);
  const desktopBusy = useNotificationSettingsStore((state) => state.desktopBusy);
  const loadDesktop = useNotificationSettingsStore((state) => state.loadDesktop);
  const setDesktopOn = useNotificationSettingsStore((state) => state.setDesktopOn);
  useEffect(() => {
    if (!desktopLoaded) void loadDesktop();
  }, [desktopLoaded, loadDesktop]);
  return { desktop, desktopBusy, setDesktopOn };
}

/** The member's personal Telegram account, loaded once per workspace. */
export function useTelegramConnection() {
  const telegramConnection = useNotificationSettingsStore((state) => state.telegramConnection);
  const telegramConnectionLoaded = useNotificationSettingsStore((state) => state.telegramConnectionLoaded);
  const loadTelegramConnection = useNotificationSettingsStore((state) => state.loadTelegramConnection);
  useEffect(() => {
    if (!telegramConnectionLoaded) void loadTelegramConnection().catch(() => {});
  }, [telegramConnectionLoaded, loadTelegramConnection]);
  return telegramConnection;
}

/** Linear's channel row: icon tile, name, a green or grey dot with the status, chevron. */
const ChannelRow: React.FC<{
  name: string;
  icon: React.ReactNode;
  status: { text: string; enabled: boolean };
  onOpen?: () => void;
}> = ({ name, icon, status, onOpen }) => {
  const content = (
    <>
      <span {...withClassName(stylex.props(preferencesStyles.channelIcon), 'preferences-channel-icon')}>{icon}</span>
      <span {...withClassName(stylex.props(preferencesStyles.rowCopy), 'preferences-row-copy')}>
        <span {...withClassName(stylex.props(preferencesStyles.rowTitle), 'preferences-row-title')}>{name}</span>
        <span {...stylex.props(preferencesStyles.rowDesc, preferencesStyles.channelStatus)}>
          <span
            {...stylex.props(preferencesStyles.channelDot, status.enabled && preferencesStyles.channelDotOn)}
            aria-hidden="true"
          />
          {status.text}
        </span>
      </span>
      {onOpen && <BuyerlyIcon name="chevron-right" size={16} aria-hidden="true" {...stylex.props(preferencesStyles.rowChevron)} />}
    </>
  );
  return onOpen ? (
    <button
      type="button"
      {...withClassName(stylex.props(preferencesStyles.rowItem, preferencesStyles.rowLink), css.rowItem)}
      onClick={onOpen}
    >
      {content}
    </button>
  ) : (
    <div {...withClassName(stylex.props(preferencesStyles.rowItem), css.rowItem)}>{content}</div>
  );
};

/** Settings → Notifications, as in Linear: Inbox, Push notifications with Desktop, Email and Telegram, then Other updates. */
export const NotificationsSection: React.FC<{
  onOpenPriority: () => void;
  onOpenDesktop: () => void;
  onOpenEmail: () => void;
  onOpenTelegram: () => void;
}> = ({
  onOpenPriority,
  onOpenDesktop,
  onOpenEmail,
  onOpenTelegram,
}) => {
  const { inboxDisplay, setInboxDisplay } = useInboxDisplay();
  const { notificationChannels, setNotificationChannels } = useNotificationChannels();
  const telegramConnection = useTelegramConnection();
  const { desktop: desktopHere } = useDesktopNotifications();
  const { desktop, email, telegram } = notificationChannels;
  const priorityRowContent = (disabled: boolean) => (
    <>
      <span {...stylex.props(preferencesStyles.rowCopy, disabled && preferencesStyles.rowCopyDisabled)}>
        <span {...stylex.props(preferencesStyles.rowTitle)}>Priority notifications</span>
        <span {...stylex.props(preferencesStyles.rowDesc)}>Choose which notifications are treated as priority</span>
      </span>
      <span {...stylex.props(preferencesStyles.rowControl, preferencesStyles.rowControlLink)}>
        {/* Linear counts each custom filter as a type too, and says "0 types" with none. */}
        <span {...stylex.props(preferencesStyles.rowValue, preferencesStyles.rowValueLink)}>
          {plural(inboxDisplay.priorityKinds.length + inboxDisplay.priorityRules.length, 'type')}
        </span>
        <BuyerlyIcon name="chevron-right" size={16} aria-hidden="true" {...stylex.props(preferencesStyles.rowChevron, preferencesStyles.rowChevronInControl)} />
      </span>
    </>
  );
  return (
    <>
      <div {...stylex.props(preferencesStyles.titleContainer)}>
        <h1 {...stylex.props(preferencesStyles.pageTitle)}>Notifications</h1>
      </div>
      <div {...stylex.props(preferencesStyles.section)}>
        <div {...stylex.props(preferencesStyles.sectionHeader)}>
          <h3 {...stylex.props(preferencesStyles.sectionTitle)}>Inbox</h3>
        </div>
        <p {...stylex.props(preferencesStyles.sectionNote, preferencesStyles.sectionNoteNotifications)}>Manage how notifications are organized in your inbox</p>
        <section {...withClassName(stylex.props(preferencesStyles.cardContainer), css.cardDivided)}>
          <div {...withClassName(stylex.props(preferencesStyles.rowItem), css.rowItem)}>
            <div {...stylex.props(preferencesStyles.rowCopy)}>
              <span {...stylex.props(preferencesStyles.rowTitle)}>Priority inbox</span>
              <span {...stylex.props(preferencesStyles.rowDesc)}>Separate important notifications from the rest of your inbox</span>
            </div>
            <BuyerlyToggle
              size="settings"
              label="Priority inbox"
              checked={inboxDisplay.priorityInbox}
              onChange={(value) => setInboxDisplay({ priorityInbox: value })}
            />
          </div>
          {inboxDisplay.priorityInbox ? (
            <button
              type="button"
              {...withClassName(stylex.props(preferencesStyles.rowItem, preferencesStyles.rowLink), css.rowItem)}
              onClick={onOpenPriority}
            >
              {priorityRowContent(false)}
            </button>
          ) : (
            // Linear dims the row and opens nothing until Priority inbox is on.
            <Tooltip content="Enable priority inbox to customize priority types" side="bottom" sideOffset={8}>
              <div {...withClassName(stylex.props(preferencesStyles.rowItem), css.rowItem, 'preferences-row-item--disabled')}>
                {priorityRowContent(true)}
              </div>
            </Tooltip>
          )}
        </section>
      </div>
      <div {...stylex.props(preferencesStyles.section)}>
        <div {...stylex.props(preferencesStyles.sectionHeader)}>
          <h3 {...stylex.props(preferencesStyles.sectionTitle)}>Push notifications</h3>
        </div>
        <p {...stylex.props(preferencesStyles.sectionNote, preferencesStyles.sectionNoteNotifications)}>
          Choose which notifications are pushed to your devices. All notifications will still appear in your inbox.
        </p>
        <section {...withClassName(stylex.props(preferencesStyles.cardContainer), css.cardDivided)}>
          {/* Linear lists Desktop first; it is on only in a browser that gets them. */}
          <ChannelRow
            name="Desktop"
            icon={<BuyerlyIcon name="desktop" size={16} />}
            status={channelStatus(desktopHere.subscribed && desktop.enabled, desktop.kinds)}
            onOpen={onOpenDesktop}
          />
          <ChannelRow
            name="Email"
            icon={<BuyerlyIcon name="email" size={16} />}
            status={channelStatus(email.enabled, email.kinds)}
            onOpen={onOpenEmail}
          />
          {/* Telegram stands where Linear has Slack: Disabled until a personal account is connected. */}
          <ChannelRow
            name="Telegram"
            icon={<BuyerlyIcon name="telegram" size={16} />}
            status={channelStatus(telegramConnection.connected && telegram.enabled, telegram.kinds)}
            onOpen={onOpenTelegram}
          />
        </section>
      </div>
      {/* Linear's Updates from Linear holds Changelog, Marketing and Other updates;
          Buyerly has only Other updates → Invite accepted, so the note goes too. */}
      <div {...stylex.props(preferencesStyles.section)}>
        <div {...stylex.props(preferencesStyles.sectionHeader, preferencesStyles.sectionHeaderGroup)}>
          <h3 {...stylex.props(preferencesStyles.sectionTitle)}>Updates from Buyerly</h3>
        </div>
        <div {...stylex.props(preferencesStyles.sectionHeader, preferencesStyles.sectionHeaderSub)}>
          <h4 {...stylex.props(preferencesStyles.sectionTitle, preferencesStyles.sectionTitleSub)}>Other updates</h4>
        </div>
        <section {...withClassName(stylex.props(preferencesStyles.cardContainer), css.cardDivided)}>
          <div {...withClassName(stylex.props(preferencesStyles.rowItem), css.rowItem)}>
            <div {...stylex.props(preferencesStyles.rowCopy)}>
              <span {...stylex.props(preferencesStyles.rowTitle)}>Invite accepted</span>
              <span {...stylex.props(preferencesStyles.rowDesc)}>Email when invitees accept an invite</span>
            </div>
            <BuyerlyToggle
              size="settings"
              label="Invite accepted"
              checked={notificationChannels.inviteAccepted}
              onChange={(value) => setNotificationChannels({ inviteAccepted: value })}
            />
          </div>
        </section>
      </div>
    </>
  );
};

/** A push channel's page in Settings → Notifications, as Linear's Email and Slack pages. */
const ChannelNotificationsSection: React.FC<{
  channel: NotificationChannel;
  title: string;
  enableTitle: string;
  enableDescription: string;
  /** Linear's Slack page: until the account is connected, a card in place of the switches. */
  accountCard?: React.ReactNode;
  /** Shown above the switches while the channel cannot deliver. */
  notice?: React.ReactNode;
  /** Desktop's switch is this browser's: on only where it is subscribed, and switching asks the browser first. */
  channelSwitch?: { checked: boolean; disabled: boolean; onChange: (value: boolean) => void };
  onBack: () => void;
  onOpenPriority: () => void;
}> = ({ channel, title, enableTitle, enableDescription, accountCard, notice, channelSwitch, onBack, onOpenPriority }) => {
  const { inboxDisplay } = useInboxDisplay();
  const { notificationChannels, setChannelNotifications } = useNotificationChannels();
  const settings = notificationChannels[channel];
  const update = (patch: Parameters<typeof setChannelNotifications>[1]) => setChannelNotifications(channel, patch);
  const connected = !accountCard;
  const enabled = connected && (channelSwitch ? channelSwitch.checked : settings.enabled);
  const priorityOnly = inboxDisplay.priorityInbox && settings.priorityOnly;
  // Linear: switching the channel on with every type off switches every type on.
  const toggleChannel = (value: boolean) => update(
    value && settings.kinds.length === 0 ? { enabled: value, kinds: [...INBOX_KINDS] } : { enabled: value },
  );
  const toggleKind = (kind: InboxKind, on: boolean) => update({
    kinds: INBOX_KINDS.filter((entry) => (entry === kind ? on : settings.kinds.includes(entry))),
  });
  const kindsDisabled = !enabled || priorityOnly;
  const priorityOff = !enabled || !inboxDisplay.priorityInbox;

  const priorityRow = (
    <div
      {...withClassName(
        stylex.props(preferencesStyles.rowItem),
        css.rowItem,
        priorityOff ? 'preferences-row-item--disabled' : undefined,
      )}
    >
      <div {...stylex.props(preferencesStyles.rowCopy, priorityOff && preferencesStyles.rowCopyDisabled)}>
        <span {...stylex.props(preferencesStyles.rowTitle)}>Only deliver priority notifications</span>
        <span {...stylex.props(preferencesStyles.rowDesc)}>
          Uses your{' '}
          <button type="button" {...stylex.props(preferencesStyles.inlineLink)} onClick={onOpenPriority}>
            priority notification settings
          </button>
        </span>
      </div>
      <BuyerlyToggle
        size="settings"
        label="Only deliver priority notifications"
        checked={priorityOnly}
        disabled={priorityOff}
        onChange={(value) => update({ priorityOnly: value })}
      />
    </div>
  );

  return (
    <>
      <button type="button" {...withClassName(stylex.props(preferencesStyles.breadcrumb), 'preferences-breadcrumb')} onClick={onBack}>
        <BuyerlyIcon name="chevron-left" size={14} aria-hidden="true" />
        Notifications
      </button>
      <div {...stylex.props(preferencesStyles.titleContainer)}>
        <h1 {...stylex.props(preferencesStyles.pageTitle)}>{title}</h1>
      </div>
      {notice && <div {...stylex.props(preferencesStyles.section, preferencesStyles.sectionSub)}>{notice}</div>}
      <div {...stylex.props(preferencesStyles.section, preferencesStyles.sectionSub)}>
        {accountCard ?? (
          <section {...withClassName(stylex.props(preferencesStyles.cardContainer), css.cardDivided)}>
            <div {...withClassName(stylex.props(preferencesStyles.rowItem), css.rowItem)}>
              <div {...stylex.props(preferencesStyles.rowCopy)}>
                <span {...stylex.props(preferencesStyles.rowTitle)}>{enableTitle}</span>
                <span {...stylex.props(preferencesStyles.rowDesc)}>{enableDescription}</span>
              </div>
              <BuyerlyToggle
                size="settings"
                label={enableTitle}
                checked={channelSwitch ? channelSwitch.checked : settings.enabled}
                disabled={channelSwitch?.disabled}
                onChange={channelSwitch ? channelSwitch.onChange : toggleChannel}
              />
            </div>
            {inboxDisplay.priorityInbox ? priorityRow : (
              <Tooltip content="Priority inbox isn't enabled" side="bottom" sideOffset={8}>
                {priorityRow}
              </Tooltip>
            )}
          </section>
        )}
      </div>
      <div {...stylex.props(preferencesStyles.section, preferencesStyles.sectionSub)}>
        <div {...stylex.props(preferencesStyles.sectionHeader, preferencesStyles.sectionHeaderSub)}>
          <h3 {...stylex.props(preferencesStyles.sectionTitle, preferencesStyles.sectionTitleSub)}>General notifications</h3>
        </div>
        <section {...withClassName(stylex.props(preferencesStyles.cardContainer), css.cardDivided)}>
          {INBOX_KINDS.map((kind) => {
            const row = (
              <div
                key={kind}
                {...withClassName(
                  stylex.props(preferencesStyles.rowItem),
                  css.rowItem,
                  kindsDisabled ? 'preferences-row-item--disabled' : undefined,
                )}
              >
                <div {...stylex.props(preferencesStyles.rowCopy, kindsDisabled && preferencesStyles.rowCopyDisabled)}>
                  <span {...stylex.props(preferencesStyles.rowTitle)}>{INBOX_KIND_LABELS[kind]}</span>
                  <span {...stylex.props(preferencesStyles.rowDesc)}>{KIND_DESCRIPTIONS[kind]}</span>
                </div>
                <BuyerlyToggle
                  size="settings"
                  label={INBOX_KIND_LABELS[kind]}
                  checked={settings.kinds.includes(kind)}
                  disabled={kindsDisabled}
                  onChange={(value) => toggleKind(kind, value)}
                />
              </div>
            );
            return enabled && priorityOnly ? (
              <Tooltip key={kind} content="Only priority notifications are delivered for this channel." side="bottom" sideOffset={8}>
                {row}
              </Tooltip>
            ) : row;
          })}
        </section>
      </div>
    </>
  );
};

/** Settings → Notifications → Email, as in Linear without its digest settings. */
export const EmailNotificationsSection: React.FC<{
  email: string | null;
  onBack: () => void;
  onOpenPriority: () => void;
}> = ({ email, onBack, onOpenPriority }) => (
  <ChannelNotificationsSection
    channel="email"
    title="Email"
    enableTitle="Enable email notifications"
    enableDescription={`Email notifications to ${email}`}
    onBack={onBack}
    onOpenPriority={onOpenPriority}
  />
);

/** A line in a card: why the channel cannot deliver here. */
const NoticeCard: React.FC<{ title: string; description?: string }> = ({ title, description }) => (
  <section {...stylex.props(preferencesStyles.cardContainer)}>
    <div {...stylex.props(preferencesStyles.rowItem)}>
      <span {...stylex.props(preferencesStyles.rowCopy)}>
        <span {...stylex.props(preferencesStyles.rowTitle)}>{title}</span>
        {description && <span {...stylex.props(preferencesStyles.rowDesc)}>{description}</span>}
      </span>
    </div>
  </section>
);

/**
 * Settings → Notifications → Desktop, as Linear's: notifications in this browser,
 * even when Buyerly is closed. The browser asks for permission only when the switch is turned on.
 */
export const DesktopNotificationsSection: React.FC<{
  onBack: () => void;
  onOpenPriority: () => void;
}> = ({ onBack, onOpenPriority }) => {
  const { desktop, desktopBusy, setDesktopOn } = useDesktopNotifications();
  const { notificationChannels } = useNotificationChannels();
  const blocked = desktop.permission === 'denied';
  let notice: React.ReactNode;
  if (!desktop.available) {
    notice = (
      <NoticeCard
        title="Desktop notifications aren't available in this browser"
        description="Open Buyerly in a browser that supports notifications, such as Chrome, Edge, Firefox or Safari."
      />
    );
  } else if (blocked) {
    notice = (
      <NoticeCard
        title="Notifications are blocked for Buyerly in this browser"
        description="Allow notifications for this site in the browser's settings, then turn them on here."
      />
    );
  }
  return (
    <ChannelNotificationsSection
      channel="desktop"
      title="Desktop"
      enableTitle="Enable desktop notifications"
      enableDescription="Receive notifications in this browser, even when Buyerly is closed"
      notice={notice}
      channelSwitch={{
        checked: desktop.subscribed && notificationChannels.desktop.enabled,
        // Turning off always works; turning on needs a browser that can and may show them.
        disabled: desktopBusy || (!desktop.subscribed && (!desktop.available || blocked)),
        onChange: (value) => void setDesktopOn(value),
      }}
      onBack={onBack}
      onOpenPriority={onOpenPriority}
    />
  );
};

/** Linear's "Personal Slack account not connected" card, leading to Connected accounts. */
const AccountCard: React.FC<{ title: string; onOpenConnections: () => void }> = ({ title, onOpenConnections }) => (
  <section {...stylex.props(preferencesStyles.cardContainer)}>
    <button
      type="button"
      {...withClassName(stylex.props(preferencesStyles.rowItem, preferencesStyles.rowLink), css.rowItem)}
      onClick={onOpenConnections}
    >
      <span {...stylex.props(preferencesStyles.rowCopy)}>
        <span {...stylex.props(preferencesStyles.rowTitle)}>{title}</span>
      </span>
      <span {...stylex.props(preferencesStyles.rowControl, preferencesStyles.rowControlLink)}>
        <span {...stylex.props(preferencesStyles.rowValue, preferencesStyles.rowValueLink)}>Connected accounts</span>
        <BuyerlyIcon name="chevron-right" size={16} aria-hidden="true" {...stylex.props(preferencesStyles.rowChevron, preferencesStyles.rowChevronInControl)} />
      </span>
    </button>
  </section>
);

/** Settings → Notifications → Telegram, in place of Linear's Slack page. */
export const TelegramNotificationsSection: React.FC<{
  onBack: () => void;
  onOpenPriority: () => void;
  onOpenConnections: () => void;
}> = ({ onBack, onOpenPriority, onOpenConnections }) => {
  const connection = useTelegramConnection();
  const account = telegramAccountName(connection);
  return (
    <ChannelNotificationsSection
      channel="telegram"
      title="Telegram"
      enableTitle="Enable Telegram notifications"
      enableDescription={account ? `Telegram notifications to ${account}` : 'Telegram bot notifications'}
      accountCard={connection.connected ? undefined : (
        <AccountCard title="Personal Telegram account not connected" onOpenConnections={onOpenConnections} />
      )}
      notice={connection.connected && connection.error ? (
        <AccountCard title="Notifications can't be delivered: the bot is blocked" onOpenConnections={onOpenConnections} />
      ) : undefined}
      onBack={onBack}
      onOpenPriority={onOpenPriority}
    />
  );
};

/** Settings → Notifications → Priority notifications: kinds, then custom filters. */
export const PriorityNotificationsSection: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { inboxDisplay, setInboxDisplay } = useInboxDisplay();
  // Opened by its link with Priority inbox off, Linear shows the types dimmed and no custom filters.
  const enabled = inboxDisplay.priorityInbox;
  const toggleKind = (kind: InboxKind, on: boolean) => setInboxDisplay({
    priorityKinds: INBOX_KINDS.filter((entry) => (entry === kind ? on : inboxDisplay.priorityKinds.includes(entry))),
  });
  return (
    <>
      <button type="button" {...withClassName(stylex.props(preferencesStyles.breadcrumb), 'preferences-breadcrumb')} onClick={onBack}>
        <BuyerlyIcon name="chevron-left" size={14} aria-hidden="true" />
        Notifications
      </button>
      <div {...stylex.props(preferencesStyles.titleContainer, preferencesStyles.titleContainerWithNote)}>
        <h1 {...stylex.props(preferencesStyles.pageTitle)}>Priority notifications</h1>
        <p {...stylex.props(preferencesStyles.pageNote)}>Choose which notifications are treated as priority</p>
      </div>
      <div {...stylex.props(preferencesStyles.section)}>
        <section {...withClassName(stylex.props(preferencesStyles.cardContainer), css.cardDivided)}>
          {INBOX_KINDS.map((kind) => (
            <div
              key={kind}
              {...withClassName(
                stylex.props(preferencesStyles.rowItem),
                css.rowItem,
                enabled ? undefined : 'preferences-row-item--disabled',
              )}
            >
              <div {...stylex.props(preferencesStyles.rowCopy, !enabled && preferencesStyles.rowCopyDisabled)}>
                <span {...stylex.props(preferencesStyles.rowTitle)}>{INBOX_KIND_LABELS[kind]}</span>
                <span {...stylex.props(preferencesStyles.rowDesc)}>{KIND_DESCRIPTIONS[kind]}</span>
              </div>
              <BuyerlyToggle
                size="settings"
                label={INBOX_KIND_LABELS[kind]}
                checked={inboxDisplay.priorityKinds.includes(kind)}
                disabled={!enabled}
                onChange={(value) => toggleKind(kind, value)}
              />
            </div>
          ))}
        </section>
      </div>
      {enabled && (
        <CustomFilters
          rules={inboxDisplay.priorityRules}
          onChange={(priorityRules) => setInboxDisplay({ priorityRules })}
        />
      )}
    </>
  );
};

/** Which custom filter is open in the editor: a saved one by index, or a new one. */
type Editing = number | 'new' | null;

const CustomFilters: React.FC<{
  rules: InboxPriorityRule[];
  onChange: (rules: InboxPriorityRule[]) => void;
}> = ({ rules, onChange }) => {
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState<FilterClause[]>([]);
  const [facets, setFacets] = useState<InboxFacets | null>(null);
  const [senders, setSenders] = useState<InboxSender[] | null>(null);
  const [menu, setMenu] = useState<{ mode: FilterMenuMode; anchor: HTMLElement; fieldId?: string } | null>(null);

  useEffect(() => {
    // Every notification, snoozed or read, offers its type and counts it.
    fetchInboxFacets(false, true).then(setFacets).catch(() => {});
    // Linear's From lists everyone in the workspace, without counts, so a
    // filter can name someone nothing has come from yet.
    fetchInboxSenders().then(setSenders).catch(() => {});
  }, []);

  // One clause per property with every value in use, so saved filters keep their labels.
  const fields = useMemo(() => {
    const inUse: InboxFilterClause[] = RULE_FIELDS.map((field) => ({
      field,
      operator: 'is',
      values: [...new Set([...rules.flat(), ...fromMenuClauses(draft)]
        .filter((clause) => clause.field === field)
        .flatMap((clause) => clause.values))],
    }));
    return inboxFilterFields(facets, inUse, RULE_FIELDS, senders);
  }, [draft, facets, rules, senders]);

  const startEditing = (target: Exclude<Editing, null>) => {
    setDraft(target === 'new' ? [] : rules[target].map(toMenuClause));
    setEditing(target);
  };
  const stopEditing = () => {
    setEditing(null);
    setDraft([]);
    setMenu(null);
  };
  const save = () => {
    const rule = fromMenuClauses(draft).filter(
      (clause): clause is InboxPriorityRule[number] =>
        (clause.field === 'type' || clause.field === 'from') && clause.values.length > 0,
    );
    if (rule.length === 0) return;
    onChange(editing === 'new' || editing === null
      ? [...rules, rule]
      : rules.map((current, index) => (index === editing ? rule : current)));
    stopEditing();
  };
  const openMenu = (mode: FilterMenuMode, anchor: HTMLElement, fieldId?: string) =>
    setMenu({ mode, anchor, fieldId });

  const editor = (
    <div {...withClassName(stylex.props(preferencesStyles.filterRow), css.filterRow)} aria-label="Custom filter">
      <span {...stylex.props(preferencesStyles.filterInclude)}>Include</span>
      <div {...stylex.props(preferencesStyles.filterChips)}>
        {draft.length === 0 ? (
          <button
            type="button"
            {...stylex.props(preferencesStyles.filterButton)}
            onClick={(event) => openMenu('root', event.currentTarget)}
          >
            <BuyerlyIcon name="filter" size={14} />
            Filter
          </button>
        ) : (
          <>
            {draft.map((clause) => {
              const field = fields.find((entry) => entry.id === clause.fieldId);
              return field ? (
                <InboxFilterChip
                  key={clause.fieldId}
                  field={field}
                  clause={clause}
                  onOpenMenu={openMenu}
                  onRemove={() => setDraft(draft.filter((entry) => entry.fieldId !== clause.fieldId))}
                />
              ) : null;
            })}
            {draft.length < RULE_FIELDS.length && (
              <button
                type="button"
                aria-label="Add another filter"
                {...stylex.props(preferencesStyles.filterIconButton)}
                onClick={(event) => openMenu('root', event.currentTarget)}
              >
                <BuyerlyIcon name="add" size={14} />
              </button>
            )}
          </>
        )}
      </div>
      <div {...stylex.props(preferencesStyles.filterActions)}>
        <Button size="compact" onClick={stopEditing}>Cancel</Button>
        <Button size="compact" variant="primary" disabled={fromMenuClauses(draft).length === 0} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );

  return (
    <div {...stylex.props(preferencesStyles.section)}>
      <div {...stylex.props(preferencesStyles.sectionHeader)}>
        <h3 {...stylex.props(preferencesStyles.sectionTitle)}>Custom filters</h3>
      </div>
      <p {...stylex.props(preferencesStyles.sectionNote)}>Include additional notifications in your Priority inbox</p>
      <section {...withClassName(stylex.props(preferencesStyles.cardContainer), css.cardDivided)} aria-label="Custom filters">
        <div {...withClassName(stylex.props(preferencesStyles.filterRow), css.filterRow)}>
          {rules.length === 0 ? (
            <span {...stylex.props(preferencesStyles.filterCount, preferencesStyles.filterCountEmpty)}>No custom filters</span>
          ) : (
            <span {...stylex.props(preferencesStyles.filterCount)}>{plural(rules.length, 'custom filter')}</span>
          )}
          {editing === null && (rules.length === 0 ? (
            <button type="button" {...stylex.props(preferencesStyles.filterAdd)} onClick={() => startEditing('new')}>
              Add filter
            </button>
          ) : (
            <button
              type="button"
              aria-label="Add filter"
              {...stylex.props(preferencesStyles.filterIconButton)}
              onClick={() => startEditing('new')}
            >
              <BuyerlyIcon name="add" size={14} />
            </button>
          ))}
        </div>
        {rules.map((rule, index) => (editing === index ? (
          <React.Fragment key={index}>{editor}</React.Fragment>
        ) : (
          <SavedFilter
            key={index}
            rule={rule}
            fields={fields}
            canEdit={editing === null}
            onEdit={() => startEditing(index)}
            onDelete={() => onChange(rules.filter((_, current) => current !== index))}
          />
        )))}
        {editing === 'new' && editor}
      </section>
      <BuyerlyFilterMenu
        isOpen={Boolean(menu)}
        mode={menu?.mode ?? 'root'}
        anchorElement={menu?.anchor ?? null}
        fieldId={menu?.fieldId}
        fields={fields}
        clauses={draft}
        onChange={setDraft}
        onClose={() => setMenu(null)}
        countNoun={['notification', 'notifications']}
        childWidth={311}
        rootPlaceholder="Filter notifications by…"
      />
    </div>
  );
};

const SavedFilter: React.FC<{
  rule: InboxPriorityRule;
  fields: ReturnType<typeof inboxFilterFields>;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ rule, fields, canEdit, onEdit, onDelete }) => {
  return (
    <div {...withClassName(stylex.props(preferencesStyles.filterRow), `${css.filterRow} ${css.filterRowSaved}`)}>
      <span {...stylex.props(preferencesStyles.filterInclude)}>Include</span>
      <div {...stylex.props(preferencesStyles.filterChips)}>
        {rule.map((clause) => {
          const menuClause = toMenuClause(clause);
          const field = fields.find((entry) => entry.id === menuClause.fieldId);
          return field ? <InboxFilterChip key={menuClause.fieldId} field={field} clause={menuClause} /> : null;
        })}
      </div>
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Custom filter actions"
              {...withClassName(
                stylex.props(preferencesStyles.filterIconButton, preferencesStyles.filterActionsTrigger),
                css.filterActionsTrigger,
              )}
            >
              <BuyerlyIcon name="more" size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <span {...stylex.props(styles.menuItem)}>
                <BuyerlyIcon name="edit" size={14} />
                Edit
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDelete}>
              <span {...stylex.props(styles.menuItem)}>
                <BuyerlyIcon name="delete" size={14} />
                Delete
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};
