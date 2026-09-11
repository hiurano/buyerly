import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/store/useAppStore';
import { LinearDisplayOptions } from '@/ui/LinearDisplayOptions';
import type { AdsManagerEntity } from '@/store/useAppStore';

interface DisplayOptionsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  entity: AdsManagerEntity;
}

export const DisplayOptionsPopover: React.FC<DisplayOptionsPopoverProps> = ({ isOpen, onClose, anchorRef, entity }) => {
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

  const supportsBudget = entity !== 'ads';
  const liveProperties = {
    status: 'Status',
    ...(supportsBudget ? { budget: 'Budget' } : {}),
    ...(entity === 'ads' ? { ctr: 'CTR', cpc: 'CPC' } : {}),
    results: 'Results',
    cpa: 'CPA',
    spend: 'Spend',
  };
  const orderingOptions = [
    { value: 'manual', label: 'Default' },
    { value: 'name', label: 'Name' },
    { value: 'spend', label: 'Spend' },
    { value: 'results', label: 'Results' },
    { value: 'cpa', label: 'CPA' },
    ...(supportsBudget ? [{ value: 'budget', label: 'Budget' }] : []),
  ];
  const ordering = orderingOptions.some((option) => option.value === store.displayOrdering)
    ? store.displayOrdering
    : 'manual';

  return createPortal(
    <div ref={popoverRef} className="linear-display-options-popover" style={{ top: coords.top, right: coords.right }}>
      <LinearDisplayOptions
        viewMode={store.campaignsViewMode}
        onViewModeChange={store.setCampaignsViewMode}
        grouping={store.displayGrouping}
        groupingOptions={[]}
        onGroupingChange={(value) => store.setDisplayGrouping(value as typeof store.displayGrouping)}
        ordering={ordering}
        orderingOptions={orderingOptions}
        onOrderingChange={(value) => store.setDisplayOrdering(value as typeof store.displayOrdering)}
        properties={liveProperties}
        enabledProperties={store.displayProperties}
        onToggleProperty={store.toggleDisplayProperty}
        showViewModes={false}
        showGrouping={false}
      />
    </div>,
    document.body
  );
};
