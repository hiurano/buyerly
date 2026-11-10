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
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { BuyerlyLogoAvatar, BuyerlyDisclosureGlyph } from '@/icons/BuyerlyIcons';
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
import { withClassName } from '@/ui/withClassName';
import inboxItemRowCss from './InboxItemRow.module.css';

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
  // Linear's row sits 8px in from the list's edges (383.5px of a 399.5px list).
  row: {
    display: 'block',
    cursor: 'default',
    paddingLeft: 8,
    paddingRight: 8,
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
      ':hover': colors['--inbox-row-hover-bg'],
    },
  },
  // Its right-click menu is open.
  rowBodyMenuOpen: {
    backgroundColor: colors['--inbox-row-hover-bg'],
  },
  rowBodySelected: {
    backgroundColor: colors['--inbox-row-active-bg'],
  },
  // 12px from the row's top, so it stays level with the first two lines when a third one is added.
  avatar: {
    display: 'flex',
    flexShrink: 0,
    marginTop: 12,
  },
  lines: {
    display: 'flex',
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    flexDirection: 'column',
    gap: 2,
    paddingTop: 10,
    paddingBottom: 10,
  },
  // Linear's lines: the title's is 17px with the text centred, the summary's 16px with the text at its foot.
  line: {
    display: 'flex',
    height: 17,
    minWidth: 0,
    alignItems: 'center',
    gap: 6,
    color: colors['--text-tertiary'],
  },
  lineStrong: {
    color: colors['--text-secondary'],
  },
  // The open notification's row darkens its text a step, as Linear's does on its background.
  lineActiveTitle: {
    color: colors['--inbox-row-active-title'],
  },
  lineActive: {
    color: colors['--inbox-row-active-fg'],
  },
  // A pixel below the line's middle, as Linear's.
  unreadDot: {
    position: 'relative',
    top: 1,
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
    lineHeight: 'normal',
  },
  summaryLine: {
    height: 16,
    alignItems: 'flex-end',
    fontSize: 12,
    fontWeight: 450,
    lineHeight: 'normal',
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
  // Linear's Focus group header: a 28px band level with the rows, caret after the name.
  inboxGroup: {
    paddingLeft: 10,
    paddingRight: 10,
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    width: '100%',
    height: 28,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 10,
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'currentColor',
    borderRadius: 8,
    color: colors['--inbox-group-header-fg'],
    backgroundColor: colors['--inbox-group-header-bg'],
    fontSize: 12,
    fontWeight: 500,
    cursor: 'default',
  },
});

interface InboxItemActions {
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
      {icon ?? <BuyerlyIcon name="snooze" size={16} />}
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
      icon={<BuyerlyIcon name="delete" size={16} />}
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
              <div {...stylex.props(styles.line, unread && styles.lineStrong, isSelected && styles.lineActiveTitle)}>
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
              <div {...stylex.props(styles.line, styles.summaryLine, isSelected && styles.lineActive)}>
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
            <BuyerlyIcon name="unread" size={16} />
            {unread ? 'Mark as read' : 'Mark as unread'}
          </span>
          <MenuKey>U</MenuKey>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onDelete(item)}>
          <span {...stylex.props(styles.menuLabel)}>
            <BuyerlyIcon name="delete" size={16} />
            Delete notification
          </span>
          <MenuKey>⌫</MenuKey>
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <span {...stylex.props(styles.menuLabel)}>
              <BuyerlyIcon name="snooze" size={16} />
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
  <div {...withClassName(stylex.props(styles.inboxGroup), inboxItemRowCss.group, 'buyerly-inbox-group')}>
    <button
      type="button"
      aria-expanded={expanded}
      {...withClassName(stylex.props(styles.groupHeader), inboxItemRowCss.header, 'buyerly-inbox-group-header')}
      onClick={onToggle}
    >
      <span>{label}</span>
      <BuyerlyDisclosureGlyph />
    </button>
  </div>
);
