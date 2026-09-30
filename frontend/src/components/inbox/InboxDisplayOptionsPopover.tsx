import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { InboxOrdering } from '@/lib/inbox';
import { useAppStore } from '@/store/useAppStore';
import { LinearSelect } from '@/ui/LinearDisplayOptions';
import { useMenuExit } from '@/ui/useMenuExit';

interface InboxDisplayOptionsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

const Switch: React.FC<{ label: string; checked: boolean; onChange: (value: boolean) => void }> = ({
  label,
  checked,
  onChange,
}) => (
  <div className="linear-display-row">
    <span>{label}</span>
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      className="linear-display-switch"
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  </div>
);

/**
 * Linear's Inbox display options without priority inbox and grouping, which
 * have nothing to sort by in ad events: ordering, then the two list toggles.
 */
export const InboxDisplayOptionsPopover: React.FC<InboxDisplayOptionsPopoverProps> = ({
  isOpen,
  onClose,
  anchorRef,
}) => {
  const { inboxDisplay, setInboxDisplay } = useAppStore();
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
    >
      <section className="linear-display-main-section">
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
        <Switch
          label="Show snoozed"
          checked={inboxDisplay.showSnoozed}
          onChange={(value) => setInboxDisplay({ showSnoozed: value })}
        />
        <Switch
          label="Show unread first"
          checked={inboxDisplay.unreadFirst}
          onChange={(value) => setInboxDisplay({ unreadFirst: value })}
        />
      </section>
    </div>,
    document.body,
  );
};
