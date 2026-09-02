import React, { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { InboxItemRow } from './InboxItemRow';
import { Tooltip } from '@/ui/Tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/ui/DropdownMenu';
import {
  LinearDotsIcon,
  LinearFilterIcon,
  LinearSlidersIcon,
  LinearEmptyInboxIllustration,
  BuyerlyLogoAvatar,
  LinearClockOutlineIcon,
  LinearInboxDeleteIcon,
  LinearSidebarLeftToggleIcon,
} from '@/icons/LinearIcons';

export const InboxView: React.FC = () => {
  const {
    notifications,
    selectedNotificationId,
    setSelectedNotificationId,
    markAllNotificationsAsRead,
    deleteAllNotifications,
    deleteAllReadNotifications,
    isSidebarCollapsed,
    toggleSidebarCollapsed,
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
      {/* 1. Left Column: Linear's 400px notification list pane. */}
      <div className="flex h-full w-[400px] shrink-0 flex-col border-r border-[var(--color-border-primary)]">
        {/* Left Column Header (44px, Linear title inset: 14px) */}
        <header
          style={{
            height: '44px',
            paddingLeft: '14px',
            paddingRight: '8px',
          }}
          className="flex shrink-0 items-center justify-between"
        >
          {/* Left Title (13px, weight 500, line-height 16px) + 3-dots button with 4px gap */}
          <div className="flex items-center" style={{ gap: '4px' }}>
            <div
              style={{
                width: isSidebarCollapsed ? '28px' : '0px',
                opacity: isSidebarCollapsed ? 1 : 0,
                transform: isSidebarCollapsed ? 'scale(1)' : 'scale(0.85)',
                marginRight: isSidebarCollapsed ? '2px' : '0px',
                pointerEvents: isSidebarCollapsed ? 'auto' : 'none',
                overflow: 'hidden',
                transition:
                  'width 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), margin-right 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              className="flex shrink-0 items-center justify-center"
            >
              <Tooltip content="Open sidebar" shortcut="[" side="bottom" sideOffset={6}>
                <button
                  type="button"
                  onClick={toggleSidebarCollapsed}
                  className="linear-icon-btn"
                  aria-label="Open sidebar"
                >
                  <LinearSidebarLeftToggleIcon size={14} isOpen={false} aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
            <h2
              style={{
                fontSize: '13px',
                fontWeight: 500,
                lineHeight: '16px',
                letterSpacing: '-0.01em',
                color: 'var(--text-primary)',
                paddingLeft: '0px',
              }}
            >
              Inbox
            </h2>

            {/* Notification Actions Dropdown Menu */}
            <DropdownMenu>
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

              <DropdownMenuContent
                align="start"
                sideOffset={4}
                className="w-[192px] min-w-[190px]"
              >
                <div className="h-[6px] w-full" />

                {/* 1. Delete all */}
                <DropdownMenuItem onClick={deleteAllNotifications}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[#9d9d9e] group-hover:text-[var(--text-primary)] transition-colors">
                      <LinearInboxDeleteIcon size={16} />
                    </span>
                    <span className="truncate">Delete all</span>
                  </div>
                </DropdownMenuItem>

                {/* 2. Delete all read */}
                <DropdownMenuItem onClick={deleteAllReadNotifications}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[#9d9d9e] group-hover:text-[var(--text-primary)] transition-colors">
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
                borderBottom: '1px solid var(--color-border-primary)',
              }}
              className="flex shrink-0 items-center justify-between"
            >
              {/* Breadcrumb */}
              <div className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-tertiary)]">
                <span className="hover:text-[var(--text-primary)] cursor-pointer transition-colors">Buyerly</span>
                <span className="text-[var(--text-muted)]">›</span>
                <span className="text-[var(--text-primary)]">{selectedNotification.title}</span>
              </div>

              {/* Action Buttons: Snooze (H), Delete (⌫ / E) */}
              <div className="flex items-center" style={{ gap: '6px' }}>
                <Tooltip content="Snooze notification" shortcut="H">
                  <button
                    type="button"
                    aria-label="Snooze notification"
                    className="linear-icon-btn"
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
                    className="linear-icon-btn"
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
                        color: 'var(--text-primary)',
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
                        color: 'var(--text-tertiary)',
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <span className="text-[var(--text-primary)] font-medium">Buyerly</span>
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
                    color: 'var(--text-secondary)',
                  }}
                  className="mb-8 space-y-3"
                >
                  <p>{selectedNotification.contentBody}</p>
                </div>

                {/* Clean Typography Sections */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-1.5">Automated Rules Engine</h3>
                    <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                      Protect your ad budget with instant stop-loss triggers when CPA exceeds limits, and auto-scale budgets on top performers.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-1.5">Live Campaign Telemetry</h3>
                    <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                      Inspect real-time daily spend, leads, CPA, ROI, and funnel conversion rates right inside the dedicated context sidebar.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-1.5">Lightning Speed Navigation</h3>
                    <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                      Navigate like a pro with <kbd className="px-1.5 py-0.5 rounded border border-[var(--color-border-secondary)] text-[11px] bg-[var(--item-hover-bg)] text-[var(--text-primary)] font-mono">G</kbd> then <kbd className="px-1.5 py-0.5 rounded border border-[var(--color-border-secondary)] text-[11px] bg-[var(--item-hover-bg)] text-[var(--text-primary)] font-mono">C</kbd> for Campaigns, and <kbd className="px-1.5 py-0.5 rounded border border-[var(--color-border-secondary)] text-[11px] bg-[var(--item-hover-bg)] text-[var(--text-primary)] font-mono">Ctrl</kbd> <kbd className="px-1.5 py-0.5 rounded border border-[var(--color-border-secondary)] text-[11px] bg-[var(--item-hover-bg)] text-[var(--text-primary)] font-mono">I</kbd> to toggle details.
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
                color: 'var(--text-tertiary)',
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
