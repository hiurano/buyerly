import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LinearDisplayOptions, type DisplayGroupOption } from '@/ui/LinearDisplayOptions';
import { orderGroups, toggleHiddenGroup } from '@/ui/listView';
import type { AdsManagerEntity } from '@/store/useAppStore';
import {
  adsManagerActiveGrouping,
  adsManagerActiveRows,
  adsManagerGroupings,
  adsManagerOrderings,
  adsManagerProperties,
  useAdsManagerView,
} from './adsManagerViewModel';

interface DisplayOptionsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  entity: AdsManagerEntity;
  /** My campaigns' own view rather than Campaigns'. */
  mine?: boolean;
  /** Every group of the current grouping, in their natural order, for Group ordering. */
  groups: DisplayGroupOption[];
}

export const DisplayOptionsPopover: React.FC<DisplayOptionsPopoverProps> = ({ isOpen, onClose, anchorRef, entity, mine = false, groups }) => {
  const { view, update, reset, displayChanged } = useAdsManagerView(entity, mine);
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

  // Every column the level can show (#389), in column order.
  const liveProperties = Object.fromEntries(adsManagerProperties(entity).map(({ id, label }) => [id, label]));
  const orderingOptions = adsManagerOrderings(entity, view.properties);
  const board = view.layout === 'board';
  const allGroupings = adsManagerGroupings(entity);
  // A board's Columns, as Linear's, has no "No grouping"; its Rows does.
  const groupingOptions = board ? allGroupings.filter((option) => option.value !== 'none') : allGroupings;
  const ordering = orderingOptions.some((option) => option.value === view.ordering) ? view.ordering : 'manual';
  const grouping = adsManagerActiveGrouping(entity, view);
  const rows = adsManagerActiveRows(entity, view);
  const groupingView = { ...view, grouping };
  const hidden = view.hiddenGroups[grouping] ?? [];

  return createPortal(
    <div ref={popoverRef} className="linear-display-options-popover" style={{ top: coords.top, right: coords.right }}>
      <LinearDisplayOptions
        viewMode={view.layout}
        onViewModeChange={(layout) => update({ layout })}
        grouping={grouping}
        groupingOptions={groupingOptions}
        onGroupingChange={(value) => update({ grouping: value })}
        groupOrdering={{
          groups: orderGroups(groups, groupingView),
          hidden,
          onReorder: (ids) => update({ groupOrder: { ...view.groupOrder, [grouping]: ids } }),
          onToggleHidden: (id) => update(toggleHiddenGroup(groupingView, id)),
        }}
        subGrouping={board ? rows : undefined}
        subGroupingOptions={board ? allGroupings : undefined}
        onSubGroupingChange={(value) => update({ subGrouping: value })}
        ordering={ordering}
        orderingOptions={orderingOptions}
        onOrderingChange={(value) => update({ ordering: value })}
        direction={view.direction}
        onDirectionChange={(direction) => update({ direction })}
        // Status is a fixed set of states; accounts and rules only list what has rows.
        // On the board any empty column waits in Hidden columns until this shows it.
        showEmptyGroups={board || grouping === 'status' ? view.showEmptyGroups : undefined}
        onShowEmptyGroupsChange={(showEmptyGroups) => update({ showEmptyGroups })}
        showEmptySubGroups={board && rows !== 'none' ? view.showEmptySubGroups : undefined}
        onShowEmptySubGroupsChange={(showEmptySubGroups) => update({ showEmptySubGroups })}
        // The board's columns and rows already show these, as Linear greys Status on a board by Status.
        inactiveProperties={board ? [grouping, rows] : undefined}
        properties={liveProperties}
        enabledProperties={view.properties}
        onToggleProperty={(key) => update({ properties: { ...view.properties, [key]: !view.properties[key] } })}
        onReset={displayChanged ? reset : undefined}
        showGrouping
      />
    </div>,
    document.body
  );
};
