import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/store/useAppStore';
import { LinearDisplayOptions } from '@/ui/LinearDisplayOptions';
import { orderGroups } from '@/ui/listView';
import {
  RULE_GROUPINGS,
  RULE_ORDERINGS,
  RULE_PROPERTIES,
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

  // Every grouping is a known set, so its empty groups can be shown and ordered.
  const groups = orderGroups(ruleGroupsFor(view.grouping, rules, ruleLabels, accounts), view);
  const hidden = view.hiddenGroups[view.grouping] ?? [];
  const grouping = RULE_GROUPINGS.some((option) => option.value === view.grouping) ? view.grouping : 'none';
  const ordering = RULE_ORDERINGS.some((option) => option.value === view.ordering) ? view.ordering : 'manual';

  return createPortal(
    <div ref={popoverRef} className="linear-display-options-popover" style={{ top: coords.top, right: coords.right }}>
      <LinearDisplayOptions
        viewMode={view.layout}
        onViewModeChange={(layout) => update({ layout })}
        grouping={grouping}
        groupingOptions={RULE_GROUPINGS}
        onGroupingChange={(next) => update({ grouping: next })}
        groupOrdering={{
          groups: groups.map((group) => ({
            id: group.id,
            label: group.label,
            icon: <span className="details-facets-dot" style={{ backgroundColor: group.dotColor }} />,
          })),
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
        orderingOptions={RULE_ORDERINGS}
        onOrderingChange={(next) => update({ ordering: next })}
        direction={view.direction}
        onDirectionChange={(direction) => update({ direction })}
        // The board shows every column of its grouping, empty ones too.
        showEmptyGroups={grouping === 'none' || view.layout === 'board' ? undefined : view.showEmptyGroups}
        onShowEmptyGroupsChange={(showEmptyGroups) => update({ showEmptyGroups })}
        properties={Object.fromEntries(RULE_PROPERTIES.map((property) => [property.id, property.label]))}
        enabledProperties={view.properties}
        onToggleProperty={(key) => update({ properties: { ...view.properties, [key]: !view.properties[key] } })}
        onReset={displayChanged ? reset : undefined}
      />
    </div>,
    document.body
  );
};
