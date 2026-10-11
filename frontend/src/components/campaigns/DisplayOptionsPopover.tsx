import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LinearDisplayOptions, type DisplayGroupOption } from '@/ui/LinearDisplayOptions';
import { orderGroups } from '@/ui/listView';
import type { AdsManagerEntity } from '@/store/useAppStore';
import { useAdsManagerView } from './adsManagerViewModel';

interface DisplayOptionsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  entity: AdsManagerEntity;
  hasAccountGroups: boolean;
  /** Every group of the current grouping, in their natural order, for Group ordering. */
  groups: DisplayGroupOption[];
}

export const DisplayOptionsPopover: React.FC<DisplayOptionsPopoverProps> = ({ isOpen, onClose, anchorRef, entity, hasAccountGroups, groups }) => {
  const { view, update, reset, displayChanged } = useAdsManagerView(entity);
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
    ...(supportsBudget ? { rules: 'Rules' } : {}),
  };
  const orderingOptions = [
    { value: 'manual', label: 'Default' },
    { value: 'name', label: 'Name' },
    { value: 'spend', label: 'Spend' },
    { value: 'results', label: 'Results' },
    { value: 'cpa', label: 'CPA' },
    ...(supportsBudget ? [{ value: 'budget', label: 'Budget' }] : []),
  ];
  const ordering = orderingOptions.some((option) => option.value === view.ordering) ? view.ordering : 'manual';
  const grouping = !hasAccountGroups && view.grouping === 'groups' ? 'none' : view.grouping;
  const hidden = view.hiddenGroups[view.grouping] ?? [];

  return createPortal(
    <div ref={popoverRef} className="linear-display-options-popover" style={{ top: coords.top, right: coords.right }}>
      <LinearDisplayOptions
        viewMode={view.layout}
        onViewModeChange={(layout) => update({ layout })}
        grouping={grouping}
        groupingOptions={[
          { value: 'none', label: 'No grouping' },
          { value: 'status', label: 'Status' },
          ...(hasAccountGroups ? [{ value: 'groups', label: 'Account groups' }] : []),
          { value: 'rules', label: 'Rules' },
        ]}
        onGroupingChange={(value) => update({ grouping: value })}
        groupOrdering={{
          groups: orderGroups(groups, view),
          hidden,
          onReorder: (ids) => update({ groupOrder: { ...view.groupOrder, [view.grouping]: ids } }),
          onToggleHidden: (id) => update({
            hiddenGroups: {
              ...view.hiddenGroups,
              [view.grouping]: hidden.includes(id) ? hidden.filter((entry) => entry !== id) : [...hidden, id],
            },
          }),
        }}
        ordering={ordering}
        orderingOptions={orderingOptions}
        onOrderingChange={(value) => update({ ordering: value })}
        direction={view.direction}
        onDirectionChange={(direction) => update({ direction })}
        // Delivery status is a fixed set of states; rules and groups only list what has rows.
        showEmptyGroups={grouping === 'status' ? view.showEmptyGroups : undefined}
        onShowEmptyGroupsChange={(showEmptyGroups) => update({ showEmptyGroups })}
        properties={liveProperties}
        enabledProperties={view.properties}
        onToggleProperty={(key) => update({ properties: { ...view.properties, [key]: !view.properties[key] } })}
        onReset={displayChanged ? reset : undefined}
        showViewModes={false}
        showGrouping
      />
    </div>,
    document.body
  );
};
