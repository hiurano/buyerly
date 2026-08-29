import React from 'react';
import { NotificationItem } from '@/store/useAppStore';
import { BuyerlyLogoAvatar } from '@/icons/LinearIcons';

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
  return (
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
        backgroundColor: isSelected ? 'lch(13.845% 1.3 272 / 1)' : 'transparent',
        paddingLeft: '16px',
        paddingRight: '16px',
      }}
      className="group flex cursor-pointer select-none items-center transition-colors duration-100 hover:bg-white/[0.04] outline-none"
    >
      {/* 32x32 Buyerly Logo Avatar (Gold Anubis) */}
      <div className="flex shrink-0 items-center justify-center">
        <BuyerlyLogoAvatar size={32} shape="circle" />
      </div>

      {/* Text Container with exact 12px gap from avatar */}
      <div
        style={{ marginLeft: '12px' }}
        className="flex min-w-0 flex-1 flex-col justify-center"
      >
        {/* Title Line (13px, weight 500, line-height 16px) */}
        <div className="flex items-center min-w-0">
          {/* 8px Accent Dot for Unread Notifications */}
          {!item.isRead && (
            <span
              style={{
                width: '8px',
                height: '8px',
                marginRight: '6px',
              }}
              className="flex shrink-0 items-center justify-center"
            >
              <span className="h-2 w-2 rounded-full bg-[#5e69d1]" />
            </span>
          )}

          <span
            style={{
              fontSize: '13px',
              fontWeight: item.isRead ? 450 : 500,
              lineHeight: '16px',
              letterSpacing: '-0.1px',
              color: isSelected
                ? '#ffffff'
                : item.isRead
                ? 'lch(61.803% 1.2 272 / 1)' // Muted secondary (#949597)
                : '#ffffff',                // Bright primary (#ffffff)
            }}
            className="truncate"
          >
            {item.title}
          </span>
        </div>

        {/* Subtitle & Timestamp Line (exact 3.5px top margin, 12px font, weight 450, line-height 15px) */}
        <div
          style={{ marginTop: '3.5px' }}
          className="flex items-center justify-between gap-2"
        >
          <span
            style={{
              fontSize: '12px',
              fontWeight: 450,
              lineHeight: '15px',
              color: 'lch(65.078% 1.425 272 / 1)',
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
              color: 'lch(65.078% 1.425 272 / 1)',
            }}
            className="shrink-0"
          >
            {item.timestamp}
          </span>
        </div>
      </div>
    </div>
  );
};
