import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/store/useAppStore';
import { LinearDisplayOptions } from '@/ui/LinearDisplayOptions';
import { orderGroups } from '@/ui/listView';
import { ruleGroupsFor, useRulesView } from './rulesViewModel';

interface RuleDisplayOptionsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export const RuleDisplayOptionsPopover: React.FC<RuleDisplayOptionsPopoverProps> = ({ isOpen, onClose, anchorRef }) => {
  const { rules, ruleGroups } = useAppStore();
  const { view, update, reset, displayChanged } = useRulesView();
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

  // Status and rule groups are fixed sets, so their empty groups can be shown and ordered.
  const groups = orderGroups(ruleGroupsFor(view.grouping, rules, ruleGroups), view);
  const hidden = view.hiddenGroups[view.grouping] ?? [];

  return createPortal(
    <div ref={popoverRef} className="linear-display-options-popover" style={{ top: coords.top, right: coords.right }}>
      <LinearDisplayOptions
        viewMode={view.layout}
        onViewModeChange={(layout) => update({ layout })}
        grouping={view.grouping}
        groupingOptions={[
          { value: 'none', label: 'No grouping' },
          { value: 'groups', label: 'Rule groups' },
          { value: 'status', label: 'Status' },
        ]}
        onGroupingChange={(grouping) => update({ grouping })}
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
        ordering={view.ordering}
        orderingOptions={[
          { value: 'manual', label: 'Manual' },
          { value: 'name', label: 'Name' },
          { value: 'lastRun', label: 'Last action' },
          { value: 'status', label: 'Status' },
        ]}
        onOrderingChange={(ordering) => update({ ordering })}
        direction={view.direction}
        onDirectionChange={(direction) => update({ direction })}
        // The board's columns are the rule groups themselves and always show.
        showEmptyGroups={view.grouping === 'none' || view.layout === 'board' ? undefined : view.showEmptyGroups}
        onShowEmptyGroupsChange={(showEmptyGroups) => update({ showEmptyGroups })}
        properties={{ status: 'Status', condition: 'Condition', action: 'Action', scope: 'Scope', lastCheck: 'Last check', lastRun: 'Last action' }}
        enabledProperties={view.properties}
        onToggleProperty={(key) => update({ properties: { ...view.properties, [key]: !view.properties[key] } })}
        onReset={displayChanged ? reset : undefined}
      />
    </div>,
    document.body
  );
};
