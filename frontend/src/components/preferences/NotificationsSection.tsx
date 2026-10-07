import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
import { useAppStore } from '@/store/useAppStore';
import { LinearFilterMenu, type FilterMenuMode } from '@/components/filters/LinearFilter';
import type { FilterClause } from '@/components/filters/filterModel';
import { InboxFilterChip } from '@/components/inbox/InboxFilterBar';
import { fromMenuClauses, inboxFilterFields, toMenuClause } from '@/components/inbox/inboxFilterFields';
import {
  LinearDotsIcon,
  LinearEmailIcon,
  LinearFilterIcon,
  LinearPencilIcon,
  LinearPlusIcon,
  LinearTrashIcon,
  TelegramIcon,
} from '@/icons/LinearIcons';
import { Button } from '@/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import { LinearToggle } from '@/ui/LinearToggle';
import { Tooltip } from '@/ui/Tooltip';

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
  const { inboxDisplay, inboxDisplayLoaded, loadInboxDisplay, setInboxDisplay } = useAppStore();
  useEffect(() => {
    if (!inboxDisplayLoaded) void loadInboxDisplay();
  }, [inboxDisplayLoaded, loadInboxDisplay]);
  return { inboxDisplay, setInboxDisplay };
}

function useNotificationChannels() {
  const {
    notificationChannels, notificationChannelsLoaded, loadNotificationChannels, setChannelNotifications,
    setNotificationChannels,
  } = useAppStore();
  useEffect(() => {
    if (!notificationChannelsLoaded) void loadNotificationChannels();
  }, [notificationChannelsLoaded, loadNotificationChannels]);
  return { notificationChannels, setChannelNotifications, setNotificationChannels };
}

/** The member's personal Telegram account, loaded once per workspace. */
export function useTelegramConnection() {
  const { telegramConnection, telegramConnectionLoaded, loadTelegramConnection } = useAppStore();
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
      <span className="preferences-channel-icon">{icon}</span>
      <span className="preferences-row-copy">
        <span className="preferences-row-title">{name}</span>
        <span className="preferences-row-desc preferences-channel-status">
          <span
            className={`preferences-channel-dot${status.enabled ? ' preferences-channel-dot--on' : ''}`}
            aria-hidden="true"
          />
          {status.text}
        </span>
      </span>
      {onOpen && <ChevronRight size={16} aria-hidden="true" className="preferences-row-chevron" />}
    </>
  );
  return onOpen ? (
    <button type="button" className="preferences-row-item preferences-row-link" onClick={onOpen}>
      {content}
    </button>
  ) : (
    <div className="preferences-row-item">{content}</div>
  );
};

/** Settings → Notifications, as in Linear: Inbox, Push notifications with Email and Telegram, then Other updates. */
export const NotificationsSection: React.FC<{
  onOpenPriority: () => void;
  onOpenEmail: () => void;
  onOpenTelegram: () => void;
}> = ({
  onOpenPriority,
  onOpenEmail,
  onOpenTelegram,
}) => {
  const { inboxDisplay, setInboxDisplay } = useInboxDisplay();
  const { notificationChannels, setNotificationChannels } = useNotificationChannels();
  const telegramConnection = useTelegramConnection();
  const { email, telegram } = notificationChannels;
  const priorityRowContent = (
    <>
      <span className="preferences-row-copy">
        <span className="preferences-row-title">Priority notifications</span>
        <span className="preferences-row-desc">Choose which notifications are treated as priority</span>
      </span>
      <span className="preferences-row-control">
        <span className="preferences-row-value">{plural(inboxDisplay.priorityKinds.length, 'type')}</span>
        <ChevronRight size={16} aria-hidden="true" className="preferences-row-chevron" />
      </span>
    </>
  );
  return (
    <>
      <div className="preferences-title-container">
        <h1 className="preferences-page-title">Notifications</h1>
      </div>
      <div className="preferences-section preferences-section--notifications">
        <div className="preferences-section-header">
          <h3 className="preferences-section-title">Inbox</h3>
        </div>
        <p className="preferences-section-note preferences-section-note--notifications">Manage how notifications are organized in your inbox</p>
        <section className="preferences-card-container preferences-card-container--divided">
          <div className="preferences-row-item">
            <div className="preferences-row-copy">
              <span className="preferences-row-title">Priority inbox</span>
              <span className="preferences-row-desc">Separate important notifications from the rest of your inbox</span>
            </div>
            <LinearToggle
              label="Priority inbox"
              checked={inboxDisplay.priorityInbox}
              onChange={(value) => setInboxDisplay({ priorityInbox: value })}
            />
          </div>
          {inboxDisplay.priorityInbox ? (
            <button type="button" className="preferences-row-item preferences-row-link" onClick={onOpenPriority}>
              {priorityRowContent}
            </button>
          ) : (
            // Linear dims the row and opens nothing until Priority inbox is on.
            <Tooltip content="Enable priority inbox to customize priority types" side="bottom" sideOffset={8}>
              <div className="preferences-row-item preferences-row-item--disabled">{priorityRowContent}</div>
            </Tooltip>
          )}
        </section>
      </div>
      <div className="preferences-section preferences-section--notifications">
        <div className="preferences-section-header">
          <h3 className="preferences-section-title">Push notifications</h3>
        </div>
        <p className="preferences-section-note preferences-section-note--notifications">
          Choose which notifications are pushed to your devices. All notifications will still appear in your inbox.
        </p>
        <section className="preferences-card-container preferences-card-container--divided">
          <ChannelRow
            name="Email"
            icon={<LinearEmailIcon size={16} />}
            status={channelStatus(email.enabled, email.kinds)}
            onOpen={onOpenEmail}
          />
          {/* Telegram stands where Linear has Slack: Disabled until a personal account is connected. */}
          <ChannelRow
            name="Telegram"
            icon={<TelegramIcon size={16} />}
            status={channelStatus(telegramConnection.connected && telegram.enabled, telegram.kinds)}
            onOpen={onOpenTelegram}
          />
        </section>
      </div>
      {/* Linear's Updates from Linear holds Changelog, Marketing and Other updates;
          Buyerly has only Other updates → Invite accepted, so the note goes too. */}
      <div className="preferences-section preferences-section--notifications">
        <div className="preferences-section-header preferences-section-header--group">
          <h3 className="preferences-section-title">Updates from Buyerly</h3>
        </div>
        <div className="preferences-section-header preferences-section-header--sub">
          <h4 className="preferences-section-title preferences-section-title--sub">Other updates</h4>
        </div>
        <section className="preferences-card-container preferences-card-container--divided">
          <div className="preferences-row-item">
            <div className="preferences-row-copy">
              <span className="preferences-row-title">Invite accepted</span>
              <span className="preferences-row-desc">Email when invitees accept an invite</span>
            </div>
            <LinearToggle
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
  onBack: () => void;
  onOpenPriority: () => void;
}> = ({ channel, title, enableTitle, enableDescription, accountCard, notice, onBack, onOpenPriority }) => {
  const { inboxDisplay } = useInboxDisplay();
  const { notificationChannels, setChannelNotifications } = useNotificationChannels();
  const settings = notificationChannels[channel];
  const update = (patch: Parameters<typeof setChannelNotifications>[1]) => setChannelNotifications(channel, patch);
  const connected = !accountCard;
  const enabled = connected && settings.enabled;
  const priorityOnly = inboxDisplay.priorityInbox && settings.priorityOnly;
  // Linear: switching the channel on with every type off switches every type on.
  const toggleChannel = (value: boolean) => update(
    value && settings.kinds.length === 0 ? { enabled: value, kinds: [...INBOX_KINDS] } : { enabled: value },
  );
  const toggleKind = (kind: InboxKind, on: boolean) => update({
    kinds: INBOX_KINDS.filter((entry) => (entry === kind ? on : settings.kinds.includes(entry))),
  });
  const kindsDisabled = !enabled || priorityOnly;

  const priorityRow = (
    <div
      className={`preferences-row-item${enabled && inboxDisplay.priorityInbox ? '' : ' preferences-row-item--disabled'}`}
    >
      <div className="preferences-row-copy">
        <span className="preferences-row-title">Only deliver priority notifications</span>
        <span className="preferences-row-desc">
          Uses your{' '}
          <button type="button" className="preferences-inline-link" onClick={onOpenPriority}>
            priority notification settings
          </button>
        </span>
      </div>
      <LinearToggle
        label="Only deliver priority notifications"
        checked={priorityOnly}
        disabled={!enabled || !inboxDisplay.priorityInbox}
        onChange={(value) => update({ priorityOnly: value })}
      />
    </div>
  );

  return (
    <>
      <button type="button" className="preferences-breadcrumb" onClick={onBack}>
        <ChevronLeft size={14} aria-hidden="true" />
        Notifications
      </button>
      <div className="preferences-title-container">
        <h1 className="preferences-page-title">{title}</h1>
      </div>
      {notice && <div className="preferences-section preferences-section--sub">{notice}</div>}
      <div className="preferences-section preferences-section--sub">
        {accountCard ?? (
          <section className="preferences-card-container preferences-card-container--divided">
            <div className="preferences-row-item">
              <div className="preferences-row-copy">
                <span className="preferences-row-title">{enableTitle}</span>
                <span className="preferences-row-desc">{enableDescription}</span>
              </div>
              <LinearToggle label={enableTitle} checked={settings.enabled} onChange={toggleChannel} />
            </div>
            {inboxDisplay.priorityInbox ? priorityRow : (
              <Tooltip content="Priority inbox isn't enabled" side="bottom" sideOffset={8}>
                {priorityRow}
              </Tooltip>
            )}
          </section>
        )}
      </div>
      <div className="preferences-section preferences-section--sub">
        <div className="preferences-section-header preferences-section-header--sub">
          <h3 className="preferences-section-title preferences-section-title--sub">General notifications</h3>
        </div>
        <section className="preferences-card-container preferences-card-container--divided">
          {INBOX_KINDS.map((kind) => {
            const row = (
              <div key={kind} className={`preferences-row-item${kindsDisabled ? ' preferences-row-item--disabled' : ''}`}>
                <div className="preferences-row-copy">
                  <span className="preferences-row-title">{INBOX_KIND_LABELS[kind]}</span>
                  <span className="preferences-row-desc">{KIND_DESCRIPTIONS[kind]}</span>
                </div>
                <LinearToggle
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

/** Linear's "Personal Slack account not connected" card, leading to Connected accounts. */
const AccountCard: React.FC<{ title: string; onOpenConnections: () => void }> = ({ title, onOpenConnections }) => (
  <section className="preferences-card-container">
    <button type="button" className="preferences-row-item preferences-row-link" onClick={onOpenConnections}>
      <span className="preferences-row-copy">
        <span className="preferences-row-title">{title}</span>
      </span>
      <span className="preferences-row-control">
        <span className="preferences-row-value">Connected accounts</span>
        <ChevronRight size={16} aria-hidden="true" className="preferences-row-chevron" />
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
      <button type="button" className="preferences-breadcrumb" onClick={onBack}>
        <ChevronLeft size={14} aria-hidden="true" />
        Notifications
      </button>
      <div className="preferences-title-container preferences-title-container--with-note">
        <h1 className="preferences-page-title">Priority notifications</h1>
        <p className="preferences-page-note">Choose which notifications are treated as priority</p>
      </div>
      <div className="preferences-section">
        <section className="preferences-card-container preferences-card-container--divided">
          {INBOX_KINDS.map((kind) => (
            <div key={kind} className={`preferences-row-item${enabled ? '' : ' preferences-row-item--disabled'}`}>
              <div className="preferences-row-copy">
                <span className="preferences-row-title">{INBOX_KIND_LABELS[kind]}</span>
                <span className="preferences-row-desc">{KIND_DESCRIPTIONS[kind]}</span>
              </div>
              <LinearToggle
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
    <div className="preferences-filter-row" aria-label="Custom filter">
      <span className="preferences-filter-include">Include</span>
      <div className="preferences-filter-chips">
        {draft.length === 0 ? (
          <button
            type="button"
            className="preferences-filter-button"
            onClick={(event) => openMenu('root', event.currentTarget)}
          >
            <LinearFilterIcon size={14} />
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
                className="preferences-filter-icon-button"
                onClick={(event) => openMenu('root', event.currentTarget)}
              >
                <LinearPlusIcon size={14} />
              </button>
            )}
          </>
        )}
      </div>
      <div className="preferences-filter-actions">
        <Button size="compact" onClick={stopEditing}>Cancel</Button>
        <Button size="compact" variant="primary" disabled={fromMenuClauses(draft).length === 0} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );

  return (
    <div className="preferences-section">
      <div className="preferences-section-header">
        <h3 className="preferences-section-title">Custom filters</h3>
      </div>
      <p className="preferences-section-note">Include additional notifications in your Priority inbox</p>
      <section className="preferences-card-container preferences-card-container--divided" aria-label="Custom filters">
        <div className="preferences-filter-row">
          {rules.length === 0 ? (
            <span className="preferences-filter-count preferences-filter-count--empty">No custom filters</span>
          ) : (
            <span className="preferences-filter-count">{plural(rules.length, 'custom filter')}</span>
          )}
          {editing === null && (rules.length === 0 ? (
            <button type="button" className="preferences-filter-add" onClick={() => startEditing('new')}>
              Add filter
            </button>
          ) : (
            <button
              type="button"
              aria-label="Add filter"
              className="preferences-filter-icon-button"
              onClick={() => startEditing('new')}
            >
              <LinearPlusIcon size={14} />
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
      <LinearFilterMenu
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
    <div className="preferences-filter-row preferences-filter-row--saved">
      <span className="preferences-filter-include">Include</span>
      <div className="preferences-filter-chips">
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
              className="preferences-filter-icon-button preferences-filter-actions-trigger"
            >
              <LinearDotsIcon size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <span className="flex items-center gap-2.5">
                <LinearPencilIcon size={14} />
                Edit
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDelete}>
              <span className="flex items-center gap-2.5">
                <LinearTrashIcon size={14} />
                Delete
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};
