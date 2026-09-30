import React, { useRef, useState } from 'react';
import { auditEventSummary, auditEventTarget, auditEventTitle } from '@/lib/audit';
import { formatInboxAge, formatSnoozeTime, snoozeOptions, type InboxItem } from '@/lib/inbox';
import { parseSnoozeQuery } from '@/lib/snoozeQuery';
import {
  BuyerlyLogoAvatar,
  LinearClockOutlineIcon,
  LinearInboxDeleteIcon,
  LinearInboxUnreadIcon,
} from '@/icons/LinearIcons';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/ui/ContextMenu';
import { SubmenuArrow } from '@/ui/SubmenuArrow';

export interface InboxItemActions {
  onToggleRead: (item: InboxItem) => void;
  onDelete: (item: InboxItem) => void;
  onSnooze: (item: InboxItem, until: Date) => void;
  onCustomSnooze: (item: InboxItem) => void;
}

interface InboxItemRowProps extends InboxItemActions {
  item: InboxItem;
  isSelected: boolean;
  onSelect: () => void;
}

const MenuKey: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="font-sans text-[12px] font-[500] text-[var(--text-muted)]">{children}</kbd>
);

const SnoozeRow: React.FC<{ label: string; hint?: string; onSelect: () => void }> = ({ label, hint, onSelect }) => (
  <ContextMenuItem onSelect={onSelect}>
    <span className="flex items-center gap-2.5">
      <LinearClockOutlineIcon size={16} />
      {label}
    </span>
    {hint && <span className="text-[12px] text-[var(--text-tertiary)]">{hint}</span>}
  </ContextMenuItem>
);

/** Linear's right-click Snooze: a search on top ("Try: 4 pm, 2 days…"), the ready choices and Custom…. */
const SnoozeSubmenu: React.FC<{
  item: InboxItem;
  onSnooze: (item: InboxItem, until: Date) => void;
  onCustomSnooze: (item: InboxItem) => void;
}> = ({ item, onSnooze, onCustomSnooze }) => {
  const [query, setQuery] = useState('');
  const typed = query.trim().length > 0;
  const suggestions = typed ? parseSnoozeQuery(query) : [];
  const rowsRef = useRef<HTMLDivElement>(null);
  return (
    <ContextMenuSubContent
      sideOffset={-3}
      // The first choice stays level with Snooze; the search sits above it (36px + 1px line).
      alignOffset={-44}
      style={{ width: 'max-content', minWidth: '300px' }}
    >
      <div className="border-b border-[var(--color-border-primary)] px-[14px]">
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
          className="h-[36px] w-full bg-transparent pb-[9px] pt-[10px] text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
        />
      </div>
      <div ref={rowsRef} className="py-[6px]">
        {typed
          ? suggestions.map((row) => (
            <SnoozeRow key={row.id} label={row.label} hint={row.hint} onSelect={() => onSnooze(item, row.until)} />
          ))
          : (
            <>
              {snoozeOptions().map((option) => (
                <SnoozeRow
                  key={option.id}
                  label={option.label}
                  hint={formatSnoozeTime(option.until)}
                  onSelect={() => onSnooze(item, option.until)}
                />
              ))}
              <SnoozeRow label="Custom…" onSelect={() => onCustomSnooze(item)} />
            </>
          )}
      </div>
    </ContextMenuSubContent>
  );
};

/** Linear's notification row: avatar, title with the unread dot, then summary and age. */
export const InboxItemRow: React.FC<InboxItemRowProps> = ({
  item,
  isSelected,
  onSelect,
  onToggleRead,
  onDelete,
  onSnooze,
  onCustomSnooze,
}) => {
  const unread = !item.is_read;
  const titleColor = isSelected || unread ? 'text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)]';
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="option"
          tabIndex={-1}
          aria-selected={isSelected}
          data-inbox-event-id={item.id}
          onClick={onSelect}
          aria-label={`${unread ? 'Unread: ' : ''}${auditEventTitle(item)} for ${auditEventTarget(item)}`}
          className="group block cursor-default px-2.5 outline-none"
        >
          <div
            className={`flex h-[55px] items-center gap-3 rounded-[8px] px-2 ${
              isSelected
                ? 'bg-[var(--item-active-bg)]'
                : 'hover:bg-[var(--item-hover-bg)] group-data-[state=open]:bg-[var(--item-hover-bg)]'
            }`}
          >
            <BuyerlyLogoAvatar size={32} shape="circle" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-2.5">
              <div className={`flex min-w-0 items-center gap-1.5 ${titleColor}`}>
                {unread && (
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full bg-[var(--inbox-unread-dot)]"
                  />
                )}
                <span className="truncate text-[13px] font-medium leading-4">
                  {auditEventTitle(item)}
                </span>
              </div>
              <div className={`flex min-w-0 items-center gap-1.5 text-[12px] font-[450] leading-[15px] ${
                isSelected ? 'text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)]'
              }`}>
                <span className="min-w-0 flex-1 truncate">{auditEventSummary(item)}</span>
                {item.status === 'ERROR' && (
                  <span
                    aria-label="Error"
                    className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] bg-[var(--inbox-error-bg)] text-[10px] font-bold leading-none text-white"
                  >
                    !
                  </span>
                )}
                <span className="shrink-0">{formatInboxAge(item.created_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent style={{ width: '190px' }}>
        <ContextMenuItem onSelect={() => onToggleRead(item)}>
          <span className="flex items-center gap-2.5">
            <LinearInboxUnreadIcon size={16} />
            {unread ? 'Mark as read' : 'Mark as unread'}
          </span>
          <MenuKey>U</MenuKey>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onDelete(item)}>
          <span className="flex items-center gap-2.5">
            <LinearInboxDeleteIcon size={16} />
            Delete notification
          </span>
          <MenuKey>⌫</MenuKey>
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <span className="flex items-center gap-2.5">
              <LinearClockOutlineIcon size={16} />
              Snooze
            </span>
            <span className="flex items-center gap-2">
              <MenuKey>H</MenuKey>
              <SubmenuArrow />
            </span>
          </ContextMenuSubTrigger>
          <SnoozeSubmenu item={item} onSnooze={onSnooze} onCustomSnooze={onCustomSnooze} />
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  );
};
