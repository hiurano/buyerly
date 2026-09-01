import React from 'react';
import { NotificationItem, useAppStore } from '@/store/useAppStore';
import {
  BuyerlyLogoAvatar,
  LinearInboxUnreadIcon,
  LinearInboxCheckmarkIcon,
  LinearInboxDeleteIcon,
} from '@/icons/LinearIcons';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '@/ui/ContextMenu';

interface InboxItemRowProps {
  item: NotificationItem;
  isSelected: boolean;
  onSelect: () => void;
}

export const InboxItemRow: React.FC<InboxItemRowProps> = ({
  item,
  isSelected,
  onSelect,
}) => {
  const { toggleNotificationReadStatus, archiveNotification } = useAppStore();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          onClick={onSelect}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect();
            }
          }}
          data-active={isSelected ? 'true' : 'false'}
          style={{
            height: '55px',
            borderRadius: '8px',
            backgroundColor: isSelected ? 'var(--item-active-bg)' : 'transparent',
            paddingLeft: '8px',
            paddingRight: '8px',
            marginLeft: '8px',
            marginRight: '8px',
          }}
          className="group flex cursor-pointer select-none items-center transition-colors duration-100 hover:bg-[var(--item-hover-bg)] outline-none"
        >
          {/* 32x32 Buyerly Logo Avatar with 14x14 Action Badge */}
          <div className="relative flex shrink-0 items-center justify-center">
            <BuyerlyLogoAvatar size={32} shape="circle" />
            <div
              style={{
                position: 'absolute',
                bottom: '-2px',
                right: '-2px',
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                backgroundColor: 'var(--item-hover-bg)',
                border: '1.5px solid var(--card-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: item.isRead ? 'var(--text-tertiary)' : '#eab308',
                }}
              />
            </div>
          </div>

          {/* Text Container with exact 10px gap from avatar */}
          <div
            style={{ marginLeft: '10px' }}
            className="flex min-w-0 flex-1 flex-col justify-center"
          >
            {/* Title Line (13px, weight 500 unread / 450 read, line-height 16px) */}
            <div className="flex items-center min-w-0">
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: item.isRead ? 450 : 500,
                  lineHeight: '16px',
                  letterSpacing: '-0.1px',
                  color: isSelected
                    ? 'var(--text-primary)'
                    : item.isRead
                    ? 'var(--text-tertiary)'
                    : 'var(--text-primary)',
                }}
                className="truncate"
              >
                {item.title}
              </span>
            </div>

            {/* Subtitle & Timestamp Line (exact 2px top margin, 12px font, weight 450) */}
            <div
              style={{ marginTop: '2px' }}
              className="flex items-center justify-between gap-2"
            >
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 450,
                  lineHeight: '15px',
                  color: 'var(--text-tertiary)',
                }}
                className="truncate flex-1"
              >
                {item.preview}
              </span>

              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 450,
                  lineHeight: '15px',
                  color: 'var(--text-tertiary)',
                }}
                className="shrink-0"
              >
                {item.timestamp}
              </span>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-[192px] min-w-[191px]">
        <div className="h-[6px] w-full" />

        {/* 1. Mark as unread / Mark as read */}
        <ContextMenuItem
          onClick={(e) => {
            e.stopPropagation();
            toggleNotificationReadStatus(item.id);
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[#9d9d9e] group-hover:text-[var(--text-primary)] transition-colors">
              {item.isRead ? (
                <LinearInboxUnreadIcon size={16} />
              ) : (
                <LinearInboxCheckmarkIcon size={16} />
              )}
            </span>
            <span className="truncate">
              {item.isRead ? 'Mark as unread' : 'Mark as read'}
            </span>
          </div>
          <div className="flex shrink-0 items-center">
            <kbd className="font-sans text-[12px] font-[500] leading-[13.2px] text-[#9d9d9e] bg-transparent border-none p-0 m-0">
              U
            </kbd>
          </div>
        </ContextMenuItem>

        {/* 2. Delete notification */}
        <ContextMenuItem
          onClick={(e) => {
            e.stopPropagation();
            archiveNotification(item.id);
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[#9d9d9e] group-hover:text-[var(--text-primary)] transition-colors">
              <LinearInboxDeleteIcon size={16} />
            </span>
            <span className="truncate">Delete notification</span>
          </div>
          <div className="flex shrink-0 items-center">
            <kbd className="font-sans text-[12px] font-[500] leading-[13.2px] text-[#9d9d9e] bg-transparent border-none p-0 m-0">
              ⌫
            </kbd>
          </div>
        </ContextMenuItem>

        <div className="h-[6px] w-full" />
      </ContextMenuContent>
    </ContextMenu>
  );
};
