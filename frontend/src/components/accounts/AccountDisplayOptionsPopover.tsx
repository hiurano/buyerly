import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MetaAccount } from '@/lib/types';
import { LinearDisplayOptions } from '@/ui/LinearDisplayOptions';
import { orderGroups } from '@/ui/listView';
import {
  ACCOUNT_GROUPING_OPTIONS,
  ACCOUNT_ORDERING_OPTIONS,
  ACCOUNT_PROPERTY_LABELS,
  accountGroupsFor,
  type AccountLeadOption,
  type AccountTeam,
} from './accountsModel';
import { useAccountsView } from './accountsData';

interface AccountDisplayOptionsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  accounts: MetaAccount[];
  teams: AccountTeam[];
  leads: AccountLeadOption[];
}

/** Display options of the Ad accounts list: the shared mechanics of #385, with only what a buyer needs. */
export const AccountDisplayOptionsPopover: React.FC<AccountDisplayOptionsPopoverProps> = ({
  isOpen,
  onClose,
  anchorRef,
  accounts,
  teams,
  leads,
}) => {
  const { view, update, reset, displayChanged } = useAccountsView();
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

  const groups = orderGroups(accountGroupsFor(view.grouping, accounts, teams, leads), view);
  const hidden = view.hiddenGroups[view.grouping] ?? [];

  return createPortal(
    <div ref={popoverRef} className="linear-display-options-popover" style={{ top: coords.top, right: coords.right }}>
      <LinearDisplayOptions
        viewMode="list"
        onViewModeChange={() => {}}
        showViewModes={false}
        grouping={view.grouping}
        groupingOptions={ACCOUNT_GROUPING_OPTIONS}
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
        orderingOptions={ACCOUNT_ORDERING_OPTIONS}
        onOrderingChange={(ordering) => update({ ordering })}
        direction={view.direction}
        onDirectionChange={(direction) => update({ direction })}
        showEmptyGroups={view.grouping === 'none' ? undefined : view.showEmptyGroups}
        onShowEmptyGroupsChange={(showEmptyGroups) => update({ showEmptyGroups })}
        properties={ACCOUNT_PROPERTY_LABELS}
        enabledProperties={view.properties}
        onToggleProperty={(key) => update({ properties: { ...view.properties, [key]: !view.properties[key] } })}
        onReset={displayChanged ? reset : undefined}
      />
    </div>,
    document.body,
  );
};
