import React from 'react';
import { auditEventSummary, auditEventTarget, auditEventTitle } from '@/lib/audit';
import { formatInboxAge, formatSnoozeTime, snoozeOptions, type InboxItem } from '@/lib/inbox';
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

export interface InboxItemActions {
  onToggleRead: (item: InboxItem) => void;
  onDelete: (item: InboxItem) => void;
  onSnooze: (item: InboxItem, until: Date) => void;
}

interface InboxItemRowProps extends InboxItemActions {
  item: InboxItem;
  isSelected: boolean;
  onSelect: () => void;
}

const MenuKey: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="font-sans text-[12px] font-[500] text-[var(--text-muted)]">{children}</kbd>
);

/** Linear's notification row: avatar, title with the unread dot, then summary and age. */
export const InboxItemRow: React.FC<InboxItemRowProps> = ({
  item,
  isSelected,
  onSelect,
  onToggleRead,
  onDelete,
  onSnooze,
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
            <MenuKey>H</MenuKey>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent style={{ width: '300px', padding: '6px 0px' }}>
            {snoozeOptions().map((option) => (
              <ContextMenuItem key={option.id} onSelect={() => onSnooze(item, option.until)}>
                <span>{option.label}</span>
                <span className="text-[12px] text-[var(--text-tertiary)]">{formatSnoozeTime(option.until)}</span>
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  );
};
