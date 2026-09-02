import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/store/useAppStore';
import { LinearDisplayOptions } from '@/ui/LinearDisplayOptions';

interface DisplayOptionsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export const DisplayOptionsPopover: React.FC<DisplayOptionsPopoverProps> = ({ isOpen, onClose, anchorRef }) => {
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
        viewMode={store.campaignsViewMode}
        onViewModeChange={store.setCampaignsViewMode}
        grouping={store.displayGrouping}
        groupingOptions={[
          { value: 'none', label: 'No grouping' },
          { value: 'groups', label: 'Campaign groups' },
          { value: 'status', label: 'Status' },
          { value: 'rules', label: 'Rules' },
        ]}
        onGroupingChange={(value) => store.setDisplayGrouping(value as typeof store.displayGrouping)}
        subGrouping={store.displaySubGrouping}
        subGroupingOptions={[
          { value: 'none', label: 'No grouping' },
          { value: 'status', label: 'Status' },
          { value: 'rules', label: 'Rules' },
        ]}
        onSubGroupingChange={(value) => store.setDisplaySubGrouping(value as typeof store.displaySubGrouping)}
        ordering={store.displayOrdering}
        orderingOptions={[
          { value: 'manual', label: 'Manual' },
          { value: 'name', label: 'Name' },
          { value: 'spend', label: 'Spend' },
          { value: 'roi', label: 'ROI' },
          { value: 'results', label: 'Results' },
          { value: 'budget', label: 'Budget' },
          { value: 'cpa', label: 'CPA' },
          { value: 'created', label: 'Created' },
        ]}
        onOrderingChange={(value) => store.setDisplayOrdering(value as typeof store.displayOrdering)}
        showEmptyGroups={store.showEmptyGroups}
        onShowEmptyGroupsChange={store.setShowEmptyGroups}
        properties={{ status: 'Status', budget: 'Budget', results: 'Results', cpa: 'CPA', spend: 'Spend', roi: 'ROI', rules: 'Rules', group: 'Group', created: 'Created' }}
        enabledProperties={store.displayProperties}
        onToggleProperty={store.toggleDisplayProperty}
      />
    </div>,
    document.body
  );
};
