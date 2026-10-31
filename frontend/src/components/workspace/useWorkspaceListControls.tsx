import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActiveFilterFormula,
  BuyerlyFilterButton,
  BuyerlyFilterMenu,
  type FilterMenuMode,
} from '@/components/filters/BuyerlyFilter';
import { applyFilterClauses, type FilterClause, type FilterFieldDefinition } from '@/components/filters/filterModel';
import { BuyerlyDisplayOptions, type DisplayOption } from '@/ui/BuyerlyDisplayOptions';
import { BuyerlyDisplayOptionsPopover } from '@/ui/BuyerlyDisplayOptionsPopover';
import { BuyerlyDisplayOptionsButton } from '@/ui/BuyerlyToolbarButton';
import { useFiltersInAddress, useListView, writeFilterParam } from '@/ui/useListView';
import type { ListViewSettings } from '@/ui/listView';

interface OpenFilterMenu {
  mode: FilterMenuMode;
  anchor: HTMLElement;
  fieldId?: string;
}

interface WorkspaceListControlsOptions<T> {
  /** The saved view's key, e.g. "members". */
  viewKey: string;
  /** A module constant, as useListView wants. */
  defaults: ListViewSettings;
  /** Changes on every navigation, so a `?filter=` link is read again. */
  navigationKey: number;
  fields: FilterFieldDefinition<T>[];
  items: T[];
  countNoun: [string, string];
  orderingOptions: DisplayOption[];
  properties: Record<string, string>;
  /** Switches kept in the view's properties, on unless turned off: id → label. */
  toggles?: Record<string, string>;
  /** False where Linear's view has Display options only, as a team's Members tab. */
  filter?: boolean;
  /** False while the list is not on screen (another tab of the page): Shift V and F do nothing. */
  enabled?: boolean;
}

/**
 * Linear's Filter and Display options on a workspace list without groups
 * (Members, Teams): the saved view, the filters it holds and the address's
 * `?filter=`, the two toolbar buttons with their menu and popover, the active
 * filter formula under the toolbar, and Shift V / F as on every list.
 */
export function useWorkspaceListControls<T>({
  viewKey,
  defaults,
  navigationKey,
  fields,
  items,
  countNoun,
  orderingOptions,
  properties,
  toggles = {},
  filter = true,
  enabled = true,
}: WorkspaceListControlsOptions<T>) {
  const { view, update, loaded, reset, displayChanged, canSetDefault, setDefaultForEveryone } = useListView(viewKey, defaults);
  const [isDisplayOpen, setIsDisplayOpen] = useState(false);
  const [openFilterMenu, setOpenFilterMenu] = useState<OpenFilterMenu | null>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const displayButtonRef = useRef<HTMLButtonElement>(null);

  const setFilters = (clauses: FilterClause[]) => {
    update({ filters: clauses });
    writeFilterParam(clauses.length ? clauses : null);
  };
  const filters = useFiltersInAddress(view.filters, (clauses) => update({ filters: clauses }), loaded, navigationKey);
  const filtered = useMemo(() => (filter ? applyFilterClauses(items, fields, filters) : items), [filter, items, fields, filters]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if ((event.key === 'v' || event.key === 'V') && event.shiftKey) {
        event.preventDefault();
        setOpenFilterMenu(null);
        setIsDisplayOpen((open) => !open);
      } else if ((event.key === 'f' || event.key === 'F') && filterButtonRef.current) {
        event.preventDefault();
        setIsDisplayOpen(false);
        const anchor = filterButtonRef.current;
        setOpenFilterMenu((current) => (current ? null : { mode: 'root', anchor }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);

  const buttons = (
    <>
      {filter && <BuyerlyFilterButton
        ref={filterButtonRef}
        hasFilters={filters.length > 0}
        open={Boolean(openFilterMenu)}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          const anchor = event.currentTarget;
          setIsDisplayOpen(false);
          setOpenFilterMenu((current) => (current ? null : { mode: 'root', anchor }));
        }}
      />}
      <BuyerlyDisplayOptionsButton
        ref={displayButtonRef}
        open={isDisplayOpen}
        changed={displayChanged}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => {
          setOpenFilterMenu(null);
          setIsDisplayOpen((open) => !open);
        }}
      />
      <BuyerlyDisplayOptionsPopover isOpen={isDisplayOpen} onClose={() => setIsDisplayOpen(false)} anchorRef={displayButtonRef}>
        <BuyerlyDisplayOptions
          viewMode="list"
          onViewModeChange={() => {}}
          showViewModes={false}
          showGrouping={false}
          showOptionsTitle={false}
          toggles={Object.entries(toggles).map(([id, label]) => ({
            id,
            label,
            checked: view.properties[id] !== false,
            onChange: (checked) => update({ properties: { ...view.properties, [id]: checked } }),
          }))}
          grouping="none"
          groupingOptions={[]}
          onGroupingChange={() => {}}
          ordering={view.ordering}
          orderingOptions={orderingOptions}
          onOrderingChange={(ordering) => update({ ordering })}
          direction={view.direction}
          onDirectionChange={(direction) => update({ direction })}
          properties={properties}
          enabledProperties={view.properties}
          onToggleProperty={(key) => update({ properties: { ...view.properties, [key]: !view.properties[key] } })}
          onReset={displayChanged ? reset : undefined}
          onSetDefault={displayChanged && canSetDefault ? () => void setDefaultForEveryone() : undefined}
        />
      </BuyerlyDisplayOptionsPopover>
    </>
  );

  const formula = filter && (
    <ActiveFilterFormula
      fields={fields}
      clauses={filters}
      onChange={setFilters}
      onOpenMenu={(mode, anchor, fieldId) => setOpenFilterMenu({ mode, anchor, fieldId })}
    />
  );

  const menu = filter && (
    <BuyerlyFilterMenu
      isOpen={Boolean(openFilterMenu)}
      mode={openFilterMenu?.mode ?? 'root'}
      anchorElement={openFilterMenu?.anchor ?? null}
      fieldId={openFilterMenu?.fieldId}
      fields={fields}
      clauses={filters}
      onChange={setFilters}
      onClose={() => setOpenFilterMenu(null)}
      items={items}
      countNoun={countNoun}
    />
  );

  return {
    view,
    update,
    filters,
    clearFilters: () => setFilters([]),
    filtered,
    buttons,
    formula,
    menu,
  };
}
