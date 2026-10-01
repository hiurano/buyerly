import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  INBOX_KINDS,
  INBOX_KIND_LABELS,
  type InboxBadgeCount,
  type InboxGrouping,
  type InboxKind,
  type InboxOrdering,
} from '@/lib/inbox';
import { useAppStore } from '@/store/useAppStore';
import { LinearPlusIcon } from '@/icons/LinearIcons';
import { LinearMultiSelect, LinearSelect } from '@/ui/LinearDisplayOptions';
import { LinearToggle } from '@/ui/LinearToggle';
import { useMenuExit } from '@/ui/useMenuExit';

interface InboxDisplayOptionsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

const SwitchRow: React.FC<{ label: string; checked: boolean; onChange: (value: boolean) => void }> = ({
  label,
  checked,
  onChange,
}) => (
  <div className="linear-display-row">
    <span>{label}</span>
    <LinearToggle label={label} checked={checked} onChange={onChange} />
  </div>
);

/**
 * Linear's Inbox display options: priority inbox with what goes in it and what
 * the badge counts, then grouping and ordering, then the two list toggles.
 */
export const InboxDisplayOptionsPopover: React.FC<InboxDisplayOptionsPopoverProps> = ({
  isOpen,
  onClose,
  anchorRef,
}) => {
  const { inboxDisplay, setInboxDisplay, setActiveTab, setSettingsSection } = useAppStore();
  const customFilters = inboxDisplay.priorityRules.length;
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const { isMounted, isClosing } = useMenuExit(isOpen);

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 5, left: Math.max(8, rect.right - 302) });
  }, [isOpen, anchorRef]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (target instanceof Element && target.closest('.linear-display-select-menu')) return;
      if (!popoverRef.current?.contains(target) && !anchorRef.current?.contains(target)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.linear-display-select-menu')) {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [isOpen, onClose, anchorRef]);

  if (!isMounted) return null;

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Display options"
      className={isClosing ? 'linear-display-options-popover linear-menu-exit' : 'linear-display-options-popover'}
      style={{ top: coords.top, left: coords.left }}
      data-wide={inboxDisplay.priorityInbox || undefined}
    >
      <section className="linear-display-main-section">
        <SwitchRow
          label="Enable priority inbox"
          checked={inboxDisplay.priorityInbox}
          onChange={(value) => setInboxDisplay({ priorityInbox: value })}
        />
        {inboxDisplay.priorityInbox && (
          <>
            <div className="linear-display-row">
              <span>Include in priority inbox</span>
              <LinearMultiSelect
                ariaLabel="Priority notification options"
                values={inboxDisplay.priorityKinds}
                options={INBOX_KINDS.map((kind) => ({ value: kind, label: INBOX_KIND_LABELS[kind] }))}
                onChange={(values) => setInboxDisplay({ priorityKinds: values as InboxKind[] })}
                footer={{
                  label: customFilters > 0
                    ? `${customFilters} custom filter${customFilters === 1 ? '' : 's'}`
                    : 'Add custom filters',
                  icon: <LinearPlusIcon size={14} />,
                  // Linear opens Settings → Notifications → Priority notifications.
                  onSelect: () => {
                    onClose();
                    setSettingsSection('priority-notifications');
                    setActiveTab('preferences');
                  },
                }}
              />
            </div>
            <div className="linear-display-row">
              <span>Badge count</span>
              <LinearSelect
                value={inboxDisplay.badgeCount}
                options={[
                  { value: 'all', label: 'Priority & Other' },
                  { value: 'priority', label: 'Priority only' },
                  { value: 'none', label: 'None' },
                ]}
                onChange={(value) => setInboxDisplay({ badgeCount: value as InboxBadgeCount })}
              />
            </div>
          </>
        )}
      </section>
      <section className="linear-display-options-section">
        <div className="linear-display-row">
          <span>Group unreads by</span>
          <LinearSelect
            value={inboxDisplay.grouping}
            options={[
              { value: 'none', label: 'No grouping' },
              { value: 'focus', label: 'Focus' },
            ]}
            onChange={(value) => setInboxDisplay({ grouping: value as InboxGrouping })}
          />
        </div>
        <div className="linear-display-row">
          <span>Ordering</span>
          <LinearSelect
            value={inboxDisplay.ordering}
            options={[
              { value: 'newest', label: 'Newest' },
              { value: 'oldest', label: 'Oldest' },
            ]}
            onChange={(value) => setInboxDisplay({ ordering: value as InboxOrdering })}
          />
        </div>
      </section>
      <section className="linear-display-options-section">
        <SwitchRow
          label="Show snoozed"
          checked={inboxDisplay.showSnoozed}
          onChange={(value) => setInboxDisplay({ showSnoozed: value })}
        />
        <SwitchRow
          label="Show unread first"
          checked={inboxDisplay.unreadFirst}
          onChange={(value) => setInboxDisplay({ unreadFirst: value })}
        />
      </section>
    </div>,
    document.body,
  );
};
