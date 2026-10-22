import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/store/useAppStore';
import { BuyerlyDisplayOptions } from '@/ui/BuyerlyDisplayOptions';
import { orderGroups, toggleHiddenGroup } from '@/ui/listView';
import {
  RULE_GROUPINGS,
  RULE_GROUPING_PROPERTY,
  RULE_ORDERINGS,
  RULE_PROPERTIES,
  ruleActiveGrouping,
  ruleActiveRows,
  ruleGroupAccounts,
  ruleGroupsFor,
  useRulesView,
} from './rulesViewModel';

interface RuleDisplayOptionsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export const RuleDisplayOptionsPopover: React.FC<RuleDisplayOptionsPopoverProps> = ({ isOpen, onClose, anchorRef }) => {
  const { rules, ruleLabels, ruleAccounts } = useAppStore();
  const { view, update, reset, displayChanged } = useRulesView();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  const accounts = useMemo(() => ruleGroupAccounts(ruleAccounts), [ruleAccounts]);

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 5, right: window.innerWidth - rect.right });
  }, [isOpen, anchorRef]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (target instanceof Element && target.closest('.buyerly-display-select-menu')) return;
      if (!popoverRef.current?.contains(target) && !anchorRef.current?.contains(target)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.buyerly-display-select-menu')) onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen) return null;

  const board = view.layout === 'board';
  // A board's Columns, as Linear's, has no "No grouping"; its Rows does.
  const grouping = ruleActiveGrouping(view);
  const rows = ruleActiveRows(view);
  const groupingView = { ...view, grouping };
  // Every grouping is a known set, so its empty groups can be shown and ordered.
  const groups = orderGroups(ruleGroupsFor(grouping, rules, ruleLabels, accounts), groupingView);
  const hidden = view.hiddenGroups[grouping] ?? [];
  const ordering = RULE_ORDERINGS.some((option) => option.value === view.ordering) ? view.ordering : 'manual';

  return createPortal(
    <div ref={popoverRef} className="buyerly-display-options-popover" style={{ top: coords.top, right: coords.right }}>
      <BuyerlyDisplayOptions
        viewMode={view.layout}
        onViewModeChange={(layout) => update({ layout })}
        grouping={grouping}
        groupingOptions={board ? RULE_GROUPINGS.filter((option) => option.value !== 'none') : RULE_GROUPINGS}
        onGroupingChange={(next) => update({ grouping: next })}
        groupOrdering={{
          groups: groups.map((group) => ({
            id: group.id,
            label: group.label,
            icon: <span className="details-facets-dot" style={{ backgroundColor: group.dotColor }} />,
          })),
          hidden,
          onReorder: (ids) => update({ groupOrder: { ...view.groupOrder, [grouping]: ids } }),
          onToggleHidden: (id) => update(toggleHiddenGroup(groupingView, id)),
        }}
        // Sub-grouping splits groups, so a list grouped by nothing doesn't offer it.
        subGrouping={grouping !== 'none' ? rows : undefined}
        subGroupingOptions={grouping !== 'none' ? RULE_GROUPINGS : undefined}
        onSubGroupingChange={(next) => update({ subGrouping: next })}
        ordering={ordering}
        orderingOptions={RULE_ORDERINGS}
        onOrderingChange={(next) => update({ ordering: next })}
        direction={view.direction}
        onDirectionChange={(direction) => update({ direction })}
        // On the board this is Show empty columns; the others wait in Hidden columns.
        showEmptyGroups={grouping === 'none' ? undefined : view.showEmptyGroups}
        onShowEmptyGroupsChange={(showEmptyGroups) => update({ showEmptyGroups })}
        showEmptySubGroups={board && rows !== 'none' ? view.showEmptySubGroups : undefined}
        onShowEmptySubGroupsChange={(showEmptySubGroups) => update({ showEmptySubGroups })}
        // The board's columns and rows already show these, as on the Campaigns board.
        inactiveProperties={board ? [grouping, rows].map((value) => RULE_GROUPING_PROPERTY[value]).filter(Boolean) : undefined}
        properties={Object.fromEntries(RULE_PROPERTIES.map((property) => [property.id, property.label]))}
        enabledProperties={view.properties}
        onToggleProperty={(key) => update({ properties: { ...view.properties, [key]: !view.properties[key] } })}
        onReset={displayChanged ? reset : undefined}
      />
    </div>,
    document.body
  );
};
