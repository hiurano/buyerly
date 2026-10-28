import React, { useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { auditEventSummary, auditEventTarget, auditEventTitle } from '@/lib/audit';
import {
  formatInboxAge,
  formatInboxMoment,
  formatSnoozedFor,
  formatSnoozeTime,
  formatUnsnoozedAgo,
  matchesTyped,
  snoozeOptions,
  type InboxItem,
} from '@/lib/inbox';
import { parseSnoozeQuery } from '@/lib/snoozeQuery';
import {
  BuyerlyLogoAvatar,
  BuyerlyClockOutlineIcon,
  BuyerlyInboxDeleteIcon,
  BuyerlyInboxUnreadIcon,
  BuyerlyTrashIcon,
} from '@/icons/BuyerlyIcons';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/ui/ContextMenu';
import { SubmenuArrow } from '@/ui/SubmenuArrow';
import { colors } from '@/styles/tokens.stylex';

const truncate = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

const styles = stylex.create({
  menuKey: {
    fontFamily: '"Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: 12,
    fontWeight: 500,
    color: colors['--text-muted'],
  },
  menuLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  menuKeys: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  menuHint: {
    fontSize: 12,
    color: colors['--text-tertiary'],
  },
  snoozeSearch: {
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderColor: colors['--color-border-primary'],
    paddingLeft: 14,
    paddingRight: 14,
  },
  snoozeInput: {
    height: 36,
    width: '100%',
    backgroundColor: 'transparent',
    paddingBottom: 9,
    paddingTop: 10,
    fontSize: 13,
    color: colors['--text-primary'],
    outline: '2px solid transparent',
    outlineOffset: 2,
    '::placeholder': {
      color: colors['--text-muted'],
    },
  },
  snoozeRows: {
    paddingTop: 6,
    paddingBottom: 6,
  },
  row: {
    display: 'block',
    cursor: 'default',
    paddingLeft: 10,
    paddingRight: 10,
    outline: '2px solid transparent',
    outlineOffset: 2,
  },
  rowBody: {
    display: 'flex',
    minHeight: 55,
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 8,
    paddingLeft: 8,
    paddingRight: 8,
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
  },
  // Its right-click menu is open.
  rowBodyMenuOpen: {
    backgroundColor: colors['--item-hover-bg'],
  },
  rowBodySelected: {
    backgroundColor: colors['--item-active-bg'],
  },
  // The avatar stays level with the first two lines when a third one is added.
  avatar: {
    display: 'flex',
    height: 55,
    flexShrink: 0,
    alignItems: 'center',
  },
  lines: {
    display: 'flex',
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    flexDirection: 'column',
    gap: 2,
    paddingTop: 11,
    paddingBottom: 11,
  },
  line: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 6,
    color: colors['--text-tertiary'],
  },
  lineStrong: {
    color: colors['--text-secondary'],
  },
  unreadDot: {
    height: 8,
    width: 8,
    flexShrink: 0,
    borderRadius: 9999,
    backgroundColor: colors['--inbox-unread-dot'],
  },
  title: {
    ...truncate,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: '16px',
  },
  summaryLine: {
    fontSize: 12,
    fontWeight: 450,
    lineHeight: '15px',
  },
  summary: {
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    ...truncate,
  },
  error: {
    display: 'flex',
    height: 14,
    width: 14,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    backgroundColor: colors['--inbox-error-bg'],
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1,
    color: '#fff',
  },
  age: {
    flexShrink: 0,
  },
  snoozeLine: {
    display: 'flex',
    height: 22,
    alignItems: 'flex-end',
  },
  snoozeText: {
    ...truncate,
    fontSize: 12,
    fontWeight: 450,
    lineHeight: '15px',
    color: colors['--text-tertiary'],
  },
});

export interface InboxItemActions {
  onToggleRead: (item: InboxItem) => void;
  onDelete: (item: InboxItem) => void;
  onSnooze: (item: InboxItem, until: Date) => void;
  onCustomSnooze: (item: InboxItem) => void;
  onUnsnooze: (item: InboxItem) => void;
}

interface InboxItemRowProps extends InboxItemActions {
  item: InboxItem;
  isSelected: boolean;
  onSelect: () => void;
}

const MenuKey: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd {...stylex.props(styles.menuKey)}>{children}</kbd>
);

const SnoozeRow: React.FC<{
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  onSelect: () => void;
}> = ({ label, hint, icon, onSelect }) => (
  <ContextMenuItem onSelect={onSelect}>
    <span {...stylex.props(styles.menuLabel)}>
      {icon ?? <BuyerlyClockOutlineIcon size={16} />}
      {label}
    </span>
    {hint && <span {...stylex.props(styles.menuHint)}>{hint}</span>}
  </ContextMenuItem>
);

/**
 * Linear's right-click Snooze: a search on top ("Try: 4 pm, 2 days…"), then
 * Unsnooze for a snoozed one, the ready choices and Custom….
 */
const SnoozeSubmenu: React.FC<{
  item: InboxItem;
  onSnooze: (item: InboxItem, until: Date) => void;
  onCustomSnooze: (item: InboxItem) => void;
  onUnsnooze: (item: InboxItem) => void;
}> = ({ item, onSnooze, onCustomSnooze, onUnsnooze }) => {
  const [query, setQuery] = useState('');
  const typed = query.trim().length > 0;
  const suggestions = typed ? parseSnoozeQuery(query) : [];
  const rowsRef = useRef<HTMLDivElement>(null);
  const unsnoozeRow = item.snoozed_until && matchesTyped(UNSNOOZE_LABEL, query) && (
    <SnoozeRow
      label={UNSNOOZE_LABEL}
      hint={formatSnoozedFor(item.snoozed_until)}
      icon={<BuyerlyTrashIcon size={16} />}
      onSelect={() => onUnsnooze(item)}
    />
  );
  const customRow = matchesTyped('Custom…', query) && (
    <SnoozeRow label="Custom…" onSelect={() => onCustomSnooze(item)} />
  );
  return (
    <ContextMenuSubContent
      sideOffset={-3}
      // The first choice stays level with Snooze; the search sits above it (36px + 1px line).
      alignOffset={-44}
      style={{ width: 'max-content', minWidth: '300px' }}
    >
      <div {...stylex.props(styles.snoozeSearch)}>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Letters belong to the search, not to the menu's jump-to-item typing.
            if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') event.stopPropagation();
            if (event.key === 'Enter') {
              // Enter takes the first row; choosing it closes the menu like a click.
              event.preventDefault();
              rowsRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.click();
            }
          }}
          placeholder="Try: 4 pm, 2 days, in 5 weeks…"
          aria-label="Snooze until"
          {...stylex.props(styles.snoozeInput)}
        />
      </div>
      <div ref={rowsRef} {...stylex.props(styles.snoozeRows)}>
        {typed
          ? (
            <>
              {unsnoozeRow}
              {suggestions.map((row) => (
                <SnoozeRow key={row.id} label={row.label} hint={row.hint} onSelect={() => onSnooze(item, row.until)} />
              ))}
              {customRow}
            </>
          )
          : (
            <>
              {unsnoozeRow && (
                <>
                  {unsnoozeRow}
                  <ContextMenuSeparator />
                </>
              )}
              {snoozeOptions().map((option) => (
                <SnoozeRow
                  key={option.id}
                  label={option.label}
                  hint={formatSnoozeTime(option.until)}
                  onSelect={() => onSnooze(item, option.until)}
                />
              ))}
              {customRow}
            </>
          )}
      </div>
    </ContextMenuSubContent>
  );
};

const UNSNOOZE_LABEL = 'Unsnooze notification';

/** Linear's notification row: avatar, title with the unread dot, summary and age, then how long it is snoozed. */
export const InboxItemRow: React.FC<InboxItemRowProps> = ({
  item,
  isSelected,
  onSelect,
  onToggleRead,
  onDelete,
  onSnooze,
  onCustomSnooze,
  onUnsnooze,
}) => {
  const unread = !item.is_read;
  // Linear's third line: "Snoozed for 2d", or "Unsnoozed 2 minutes ago" until it is read.
  const snoozeLine = item.snoozed_until
    ? { text: formatSnoozedFor(item.snoozed_until), at: item.snoozed_until }
    : item.unsnoozed_at
      ? { text: formatUnsnoozedAgo(item.unsnoozed_at), at: item.unsnoozed_at }
      : null;
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <ContextMenu onOpenChange={setMenuOpen}>
      <ContextMenuTrigger asChild>
        <div
          role="option"
          tabIndex={-1}
          aria-selected={isSelected}
          data-inbox-event-id={item.id}
          onClick={onSelect}
          aria-label={`${unread ? 'Unread: ' : ''}${auditEventTitle(item)} for ${auditEventTarget(item)}`}
          {...stylex.props(styles.row)}
        >
          <div
            {...stylex.props(styles.rowBody, menuOpen && styles.rowBodyMenuOpen, isSelected && styles.rowBodySelected)}
          >
            <span {...stylex.props(styles.avatar)}>
              <BuyerlyLogoAvatar size={32} />
            </span>
            <div {...stylex.props(styles.lines)}>
              <div {...stylex.props(styles.line, (isSelected || unread) && styles.lineStrong)}>
                {unread && (
                  <span
                    aria-hidden="true"
                    {...stylex.props(styles.unreadDot)}
                  />
                )}
                <span {...stylex.props(styles.title)}>
                  {auditEventTitle(item)}
                </span>
              </div>
              <div {...stylex.props(styles.line, styles.summaryLine, isSelected && styles.lineStrong)}>
                <span {...stylex.props(styles.summary)}>{auditEventSummary(item)}</span>
                {item.status === 'ERROR' && (
                  <span
                    aria-label="Error"
                    {...stylex.props(styles.error)}
                  >
                    !
                  </span>
                )}
                <span {...stylex.props(styles.age)}>{formatInboxAge(item.created_at)}</span>
              </div>
              {snoozeLine && (
                <div {...stylex.props(styles.snoozeLine)}>
                  <span
                    title={formatInboxMoment(snoozeLine.at)}
                    {...stylex.props(styles.snoozeText)}
                  >
                    {snoozeLine.text}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent style={{ width: '190px' }}>
        <ContextMenuItem onSelect={() => onToggleRead(item)}>
          <span {...stylex.props(styles.menuLabel)}>
            <BuyerlyInboxUnreadIcon size={16} />
            {unread ? 'Mark as read' : 'Mark as unread'}
          </span>
          <MenuKey>U</MenuKey>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onDelete(item)}>
          <span {...stylex.props(styles.menuLabel)}>
            <BuyerlyInboxDeleteIcon size={16} />
            Delete notification
          </span>
          <MenuKey>⌫</MenuKey>
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <span {...stylex.props(styles.menuLabel)}>
              <BuyerlyClockOutlineIcon size={16} />
              Snooze
            </span>
            <span {...stylex.props(styles.menuKeys)}>
              <MenuKey>H</MenuKey>
              <SubmenuArrow />
            </span>
          </ContextMenuSubTrigger>
          <SnoozeSubmenu item={item} onSnooze={onSnooze} onCustomSnooze={onCustomSnooze} onUnsnooze={onUnsnooze} />
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  );
};

/** Linear's Focus group header: the group name and a caret that folds the group. */
export const InboxGroupHeader: React.FC<{ label: string; expanded: boolean; onToggle: () => void }> = ({
  label,
  expanded,
  onToggle,
}) => (
  <div className="buyerly-inbox-group">
    <button
      type="button"
      aria-expanded={expanded}
      className="buyerly-inbox-group-header"
      onClick={onToggle}
    >
      <span>{label}</span>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M7.00194 10.6239C6.66861 10.8183 6.25 10.5779 6.25 10.192V5.80802C6.25 5.42212 6.66861 5.18169 7.00194 5.37613L10.7596 7.56811C11.0904 7.76105 11.0904 8.23895 10.7596 8.43189L7.00194 10.6239Z"
        />
      </svg>
    </button>
  </div>
);
