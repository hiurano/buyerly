import React, { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { InboxItemRow } from './InboxItemRow';
import { Tooltip } from '@/ui/Tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/ui/DropdownMenu';
import {
  LinearDotsIcon,
  LinearFilterIcon,
  LinearSlidersIcon,
  LinearEmptyInboxIllustration,
  BuyerlyLogoAvatar,
  LinearClockOutlineIcon,
  LinearInboxDeleteIcon,
  LinearInboxCheckmarkIcon,
} from '@/icons/LinearIcons';

export const InboxView: React.FC = () => {
  const {
    notifications,
    selectedNotificationId,
    setSelectedNotificationId,
    markAllNotificationsAsRead,
    deleteAllNotifications,
    deleteAllReadNotifications,
  } = useAppStore();

  // Keyboard shortcuts for Inbox: Alt+U (Mark all as read), Shift+Backspace (Delete all read)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if (e.altKey && (e.code === 'KeyU' || e.key === 'u' || e.key === 'U' || e.key === 'г' || e.key === 'Г')) {
        e.preventDefault();
        markAllNotificationsAsRead();
      } else if (e.shiftKey && (e.code === 'Backspace' || e.key === 'Backspace' || e.code === 'Delete')) {
        e.preventDefault();
        deleteAllReadNotifications();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [markAllNotificationsAsRead, deleteAllReadNotifications]);

  const selectedNotification = notifications.find(
    (n) => n.id === selectedNotificationId
  );

  return (
    <div className="flex h-full w-full select-none overflow-hidden bg-transparent">
      {/* 1. Left Column: Notification List Pane (400px fixed width) */}
      <div className="flex h-full w-[400px] shrink-0 flex-col border-r border-[#191a1c]">
        {/* Left Column Header (44px, padding: 0 8px 0 16px) */}
        <header
          style={{
            height: '44px',
            paddingLeft: '16px',
            paddingRight: '8px',
          }}
          className="flex shrink-0 items-center justify-between"
        >
          {/* Left Title (13px, weight 500, line-height 16px) + 3-dots button with 8px gap */}
          <div className="flex items-center" style={{ gap: '8px' }}>
            <h2
              style={{
                fontSize: '13px',
                fontWeight: 500,
                lineHeight: '16px',
                color: 'lch(90.155% 1.2 272 / 1)',
                paddingLeft: '0px',
              }}
            >
              Inbox
            </h2>

            {/* Notification Actions Dropdown Menu */}
            <DropdownMenu>
              <Tooltip content="Notification actions">
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Notification actions"
                    className="linear-icon-btn"
                  >
                    <span className="flex h-[14px] w-[14px] items-center justify-center">
                      <LinearDotsIcon size={14} />
                    </span>
                  </button>
                </DropdownMenuTrigger>
              </Tooltip>

              <DropdownMenuContent
                align="start"
                sideOffset={4}
                className="w-[192px] min-w-[190px]"
              >
                <div className="h-[6px] w-full" />

                {/* 1. Mark all as read */}
                <DropdownMenuItem onClick={markAllNotificationsAsRead}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[#9d9d9e] group-hover:text-white transition-colors">
                      <LinearInboxCheckmarkIcon size={16} />
                    </span>
                    <span className="truncate">Mark all as read</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-[3px]">
                    <kbd className="font-sans text-[12px] font-[500] leading-[13.2px] text-[#9d9d9e] bg-transparent border-none p-0 m-0">
                      Alt
                    </kbd>
                    <kbd className="font-sans text-[12px] font-[500] leading-[13.2px] text-[#9d9d9e] bg-transparent border-none p-0 m-0">
                      U
                    </kbd>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {/* 2. Delete all */}
                <DropdownMenuItem onClick={deleteAllNotifications}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[#9d9d9e] group-hover:text-white transition-colors">
                      <LinearInboxDeleteIcon size={16} />
                    </span>
                    <span className="truncate">Delete all</span>
                  </div>
                </DropdownMenuItem>

                {/* 3. Delete all read */}
                <DropdownMenuItem onClick={deleteAllReadNotifications}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[#9d9d9e] group-hover:text-white transition-colors">
                      <LinearInboxDeleteIcon size={16} />
                    </span>
                    <span className="truncate">Delete all read</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-[3px]">
                    <kbd className="font-sans text-[12px] font-[500] leading-[13.2px] text-[#9d9d9e] bg-transparent border-none p-0 m-0">
                      ⇧
                    </kbd>
                    <kbd className="font-sans text-[12px] font-[500] leading-[13.2px] text-[#9d9d9e] bg-transparent border-none p-0 m-0">
                      ⌫
                    </kbd>
                  </div>
                </DropdownMenuItem>

                <div className="h-[6px] w-full" />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Right Header Buttons: Filter + Display Options (28x28px, 6px gap) */}
          <div className="flex items-center" style={{ gap: '6px' }}>
            <Tooltip content="Add filter" shortcut="F">
              <button
                type="button"
                aria-label="Add filter"
                className="linear-icon-btn"
              >
                <span className="flex h-[14px] w-[14px] items-center justify-center">
                  <LinearFilterIcon size={14} />
                </span>
              </button>
            </Tooltip>

            <Tooltip content="Display options" shortcut="D">
              <button
                type="button"
                aria-label="Display options"
                className="linear-icon-btn"
              >
                <span className="flex h-[14px] w-[14px] items-center justify-center">
                  <LinearSlidersIcon size={14} />
                </span>
              </button>
            </Tooltip>
          </div>
        </header>

        {/* Notification List Scroll Area (paddingTop: 8px) */}
        <div style={{ paddingTop: '8px', paddingBottom: '8px' }} className="flex-1 overflow-y-auto">
          {notifications.map((item) => (
            <InboxItemRow
              key={item.id}
              item={item}
              isSelected={item.id === selectedNotificationId}
              onSelect={() =>
                setSelectedNotificationId(
                  item.id === selectedNotificationId ? null : item.id
                )
              }
            />
          ))}
        </div>
      </div>

      {/* 2. Right Column: Detail & Empty State Pane */}
      <div className="flex flex-1 flex-col overflow-hidden bg-transparent">
        {selectedNotification ? (
          <div className="flex h-full flex-col overflow-hidden">
            {/* Top Action Bar (44px, Linear header style) */}
            <div
              style={{
                height: '44px',
                paddingLeft: '24px',
                paddingRight: '16px',
                borderBottom: '1px solid lch(9.84% 1.48 272)',
              }}
              className="flex shrink-0 items-center justify-between"
            >
              {/* Breadcrumb */}
              <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#94969b]">
                <span className="hover:text-white cursor-pointer transition-colors">Buyerly</span>
                <span className="text-[#52525b]">›</span>
                <span className="text-[#ffffff]">{selectedNotification.title}</span>
              </div>

              {/* Action Buttons: Snooze (H), Delete (⌫ / E) */}
              <div className="flex items-center" style={{ gap: '6px' }}>
                <Tooltip content="Snooze notification" shortcut="H">
                  <button
                    type="button"
                    aria-label="Snooze notification"
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '9999px',
                      backgroundColor: 'transparent',
                      border: '1px solid transparent',
                      color: 'lch(61.803% 1.2 272 / 1)',
                      transition: 'border 0.15s, background-color 0.15s, color 0.15s, opacity 0.15s',
                    }}
                    className="flex items-center justify-center outline-none hover:bg-[lch(14.006_0.593_272)] hover:text-white"
                  >
                    <span className="flex h-[14px] w-[14px] items-center justify-center">
                      <LinearClockOutlineIcon size={14} />
                    </span>
                  </button>
                </Tooltip>

                <Tooltip content="Delete notification" shortcut="⌫">
                  <button
                    type="button"
                    aria-label="Delete notification"
                    onClick={() => {
                      if (selectedNotification) {
                        useAppStore.getState().archiveNotification(selectedNotification.id);
                      }
                    }}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '9999px',
                      backgroundColor: 'transparent',
                      border: '1px solid transparent',
                      color: 'lch(61.803% 1.2 272 / 1)',
                      transition: 'border 0.15s, background-color 0.15s, color 0.15s, opacity 0.15s',
                    }}
                    className="flex items-center justify-center outline-none hover:bg-[lch(14.006_0.593_272)] hover:text-white"
                  >
                    <span className="flex h-[14px] w-[14px] items-center justify-center">
                      <LinearInboxDeleteIcon size={14} />
                    </span>
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* Main Detail Content Area */}
            <div className="flex-1 overflow-y-auto p-8">
              <div className="max-w-[680px]">
                {/* Header with Anubis Logo & Title */}
                <div className="flex items-start gap-3.5 mb-5">
                  <BuyerlyLogoAvatar size={40} shape="rounded" />
                  <div>
                    <h1
                      style={{
                        fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
                        fontSize: '22px',
                        fontWeight: 550,
                        letterSpacing: '-0.015em',
                        color: '#ffffff',
                        lineHeight: '28px',
                      }}
                      className="mb-1"
                    >
                      {selectedNotification.title}
                    </h1>
                    <div
                      style={{
                        fontSize: '12px',
                        fontWeight: 450,
                        color: 'lch(60.621% 1.2 272 / 1)',
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <span className="text-[#e2e3e5] font-medium">Buyerly</span>
                      <span>•</span>
                      <span>{selectedNotification.timestamp} ago</span>
                    </div>
                  </div>
                </div>

                {/* Body Paragraph */}
                <div
                  style={{
                    fontFamily: '"Inter Variable", -apple-system, sans-serif',
                    fontSize: '14px',
                    lineHeight: '1.65',
                    color: 'lch(90.155% 1.2 272 / 1)',
                  }}
                  className="mb-8 space-y-3"
                >
                  <p>{selectedNotification.contentBody}</p>
                </div>

                {/* Clean Typography Sections (No boxes, no borders, no icons) */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[14px] font-semibold text-white mb-1.5">Automated Rules Engine</h3>
                    <p className="text-[13px] leading-relaxed text-[#94969b]">
                      Protect your ad budget with instant stop-loss triggers when CPA exceeds limits, and auto-scale budgets on top performers.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[14px] font-semibold text-white mb-1.5">Live Campaign Telemetry</h3>
                    <p className="text-[13px] leading-relaxed text-[#94969b]">
                      Inspect real-time daily spend, leads, CPA, ROI, and funnel conversion rates right inside the dedicated context sidebar.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[14px] font-semibold text-white mb-1.5">Lightning Speed Navigation</h3>
                    <p className="text-[13px] leading-relaxed text-[#94969b]">
                      Navigate like a pro with <kbd className="px-1.5 py-0.5 rounded border border-[#323237] text-[11px] bg-[#1a1b1d] text-white font-mono">G</kbd> then <kbd className="px-1.5 py-0.5 rounded border border-[#323237] text-[11px] bg-[#1a1b1d] text-white font-mono">C</kbd> for Campaigns, and <kbd className="px-1.5 py-0.5 rounded border border-[#323237] text-[11px] bg-[#1a1b1d] text-white font-mono">Ctrl</kbd> <kbd className="px-1.5 py-0.5 rounded border border-[#323237] text-[11px] bg-[#1a1b1d] text-white font-mono">I</kbd> to toggle details.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Empty State: Exact Linear 97.5x100 illustration and 24px gap */
          <div
            style={{ gap: '24px' }}
            className="flex h-full w-full flex-col items-center justify-center select-none"
          >
            <LinearEmptyInboxIllustration />
            <span
              style={{
                fontSize: '13px',
                fontWeight: 500,
                lineHeight: '16px',
                color: 'lch(61.803% 1.2 272 / 1)',
              }}
            >
              No notification selected
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
