import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/store/useAppStore';
import { LinearDisplayOptions } from '@/ui/LinearDisplayOptions';

interface RuleDisplayOptionsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export const RuleDisplayOptionsPopover: React.FC<RuleDisplayOptionsPopoverProps> = ({ isOpen, onClose, anchorRef }) => {
  const store = useAppStore();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, right: 0 });

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 5, right: window.innerWidth - rect.right });
  }, [isOpen, anchorRef]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (target instanceof Element && target.closest('.linear-display-select-menu')) return;
      if (!popoverRef.current?.contains(target) && !anchorRef.current?.contains(target)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.linear-display-select-menu')) onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen) return null;

  return createPortal(
    <div ref={popoverRef} className="linear-display-options-popover" style={{ top: coords.top, right: coords.right }}>
      <LinearDisplayOptions
        viewMode={store.rulesViewMode}
        onViewModeChange={store.setRulesViewMode}
        grouping={store.rulesDisplayGrouping}
        groupingOptions={[
          { value: 'none', label: 'No grouping' },
          { value: 'groups', label: 'Rule groups' },
          { value: 'status', label: 'Status' },
        ]}
        onGroupingChange={(value) => store.setRulesDisplayGrouping(value as typeof store.rulesDisplayGrouping)}
        ordering={store.rulesDisplayOrdering}
        orderingOptions={[
          { value: 'manual', label: 'Manual' },
          { value: 'name', label: 'Name' },
          { value: 'lastRun', label: 'Last run' },
          { value: 'status', label: 'Status' },
        ]}
        onOrderingChange={(value) => store.setRulesDisplayOrdering(value as typeof store.rulesDisplayOrdering)}
        properties={{ status: 'Status', condition: 'Condition', action: 'Action', scope: 'Scope', lastRun: 'Last run' }}
        enabledProperties={store.rulesDisplayProperties}
        onToggleProperty={store.toggleRulesDisplayProperty}
      />
    </div>,
    document.body
  );
};
