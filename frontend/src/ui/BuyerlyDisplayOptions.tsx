import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { BuyerlyChevronGlyph } from '@/icons/BuyerlyIcons';
import { BuyerlyToggle } from './BuyerlyToggle';
import { Tooltip } from './Tooltip';
import { LAYOUT_SHORTCUT } from './useLayoutShortcut';

export type DisplayOption = { value: string; label: string };

interface BuyerlySelectProps {
  value: string;
  options: DisplayOption[];
  onChange: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
}

const Chevron = () => (
  <BuyerlyChevronGlyph />
);

const Check = () => (
  <BuyerlyIcon name="check" size={14} />
);

export const BuyerlySelect: React.FC<BuyerlySelectProps> = ({ value, options, onChange, onOpenChange }) => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 5, right: window.innerWidth - rect.right });
  }, [open]);

  useEffect(() => {
    onOpenChange?.(open);
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onOpenChange]);

  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        className="buyerly-display-select"
        data-open={open || undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label}</span>
        <Chevron />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className="buyerly-display-select-menu"
          style={{ top: coords.top, right: coords.right }}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                key={option.value}
                className="buyerly-display-select-option"
                onClick={() => {
                  onChange(option.value);
                  close();
                }}
              >
                <span>{option.label}</span>
                {isSelected && <Check />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
};

interface BuyerlyMultiSelectProps {
  values: string[];
  options: DisplayOption[];
  onChange: (values: string[]) => void;
  ariaLabel: string;
  /** A last row under a divider, such as Linear's "Add custom filters". */
  footer?: { label: string; icon: React.ReactNode; onSelect: () => void };
}

/**
 * Linear's checkbox dropdown in Display options ("Include in priority inbox"):
 * "All" when everything is ticked, "N selected" otherwise, and the menu stays
 * open while boxes are ticked.
 */
export const BuyerlyMultiSelect: React.FC<BuyerlyMultiSelectProps> = ({ values, options, onChange, ariaLabel, footer }) => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 5, right: window.innerWidth - rect.right });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const label = values.length === options.length ? 'All' : `${values.length} selected`;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="buyerly-display-select"
        data-open={open || undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{label}</span>
        <Chevron />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-multiselectable="true"
          aria-label={ariaLabel}
          className="buyerly-display-select-menu buyerly-display-check-menu"
          style={{ top: coords.top, right: coords.right }}
        >
          {options.map((option) => {
            const isSelected = values.includes(option.value);
            return (
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                key={option.value}
                className="buyerly-display-check-option"
                onClick={() => onChange(
                  isSelected
                    ? values.filter((value) => value !== option.value)
                    : options.map((entry) => entry.value).filter((value) => value === option.value || values.includes(value)),
                )}
              >
                <span className="buyerly-display-checkbox" data-checked={isSelected || undefined} aria-hidden="true">
                  {isSelected && <Check />}
                </span>
                <span>{option.label}</span>
              </button>
            );
          })}
          {footer && (
            <>
              <div role="separator" className="buyerly-display-check-divider" />
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="buyerly-display-check-option"
                onClick={() => {
                  setOpen(false);
                  footer.onSelect();
                }}
              >
                <span className="buyerly-display-check-icon" aria-hidden="true">{footer.icon}</span>
                <span>{footer.label}</span>
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
};

/** Ordering direction, as Linear's: "Descending" puts the long bar on top, "Ascending" at the bottom. */
const DirectionIcon: React.FC<{ direction: 'asc' | 'desc' }> = ({ direction }) => (
  <BuyerlyIcon name={direction === 'desc' ? 'sort-descending' : 'sort-ascending'} size={16} />
);

const GroupOrderingIcon = () => (
  <BuyerlyIcon name="group-ordering" size={16} />
);

const BackIcon = () => (
  <BuyerlyIcon name="arrow-left" size={14} />
);

const DragHandleIcon = () => (
  <svg width="6" height="10" viewBox="0 0 6 10" aria-hidden="true" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M1 8a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM1 4a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM1 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
  </svg>
);

const EyeIcon: React.FC<{ hidden: boolean }> = ({ hidden }) => (
  <BuyerlyIcon name={hidden ? 'hide' : 'show'} size={14} />
);

export interface DisplayGroupOption {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface GroupOrderingProps {
  groups: DisplayGroupOption[];
  hidden: string[];
  onReorder: (ids: string[]) => void;
  onToggleHidden: (id: string) => void;
}

const SortableGroupRow: React.FC<{ group: DisplayGroupOption; hidden: boolean; onToggleHidden: () => void }> = ({
  group,
  hidden,
  onToggleHidden,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id });
  return (
    <div
      ref={setNodeRef}
      className="buyerly-display-group-row"
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <div className="buyerly-display-group-handle" aria-label={`Move ${group.label}`} {...attributes} {...listeners}>
        <DragHandleIcon />
      </div>
      <div className="buyerly-display-group-label" data-hidden={hidden || undefined}>
        {group.icon && <span className="buyerly-display-group-icon" aria-hidden="true">{group.icon}</span>}
        <span>{group.label}</span>
      </div>
      <button
        type="button"
        className="buyerly-display-order-button"
        aria-label={hidden ? 'Show group' : 'Hide group'}
        aria-pressed={hidden}
        onClick={onToggleHidden}
      >
        <EyeIcon hidden={hidden} />
      </button>
    </div>
  );
};

/** Linear's Group ordering panel: drag a group by its handle, hide it with the eye. */
const GroupOrderingPanel: React.FC<GroupOrderingProps & { onBack: () => void }> = ({
  groups,
  hidden,
  onReorder,
  onToggleHidden,
  onBack,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = groups.map((group) => group.id);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };
  return (
    <>
      <section className="buyerly-display-group-header">
        <button type="button" className="buyerly-display-order-button" aria-label="Back" onClick={onBack}>
          <BackIcon />
        </button>
        <span>Group ordering</span>
      </section>
      <section className="buyerly-display-group-list" aria-label="Group ordering">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {groups.map((group) => (
              <SortableGroupRow
                key={group.id}
                group={group}
                hidden={hidden.includes(group.id)}
                onToggleHidden={() => onToggleHidden(group.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </section>
    </>
  );
};

interface BuyerlyDisplayOptionsProps {
  viewMode: 'list' | 'board';
  onViewModeChange: (mode: 'list' | 'board') => void;
  grouping: string;
  groupingOptions: DisplayOption[];
  onGroupingChange: (value: string) => void;
  subGrouping?: string;
  subGroupingOptions?: DisplayOption[];
  onSubGroupingChange?: (value: string) => void;
  ordering: string;
  orderingOptions: DisplayOption[];
  onOrderingChange: (value: string) => void;
  /** With a handler, Linear's Direction button sits before Ordering. */
  direction?: 'asc' | 'desc';
  onDirectionChange?: (direction: 'asc' | 'desc') => void;
  /** Without it (or with no grouping) the Group ordering button is left out. */
  groupOrdering?: GroupOrderingProps;
  /** The reporting window, in a block of its own as Linear's "Completed issues". */
  period?: string;
  periodOptions?: DisplayOption[];
  onPeriodChange?: (value: string) => void;
  properties: Record<string, string>;
  enabledProperties: Record<string, boolean>;
  onToggleProperty: (value: string) => void;
  showEmptyGroups?: boolean;
  onShowEmptyGroupsChange?: (value: boolean) => void;
  /** Board's "Show empty rows", once Rows is set. */
  showEmptySubGroups?: boolean;
  onShowEmptySubGroupsChange?: (value: boolean) => void;
  /**
   * Properties the board already shows as its columns or rows: greyed out
   * and off, as Linear's Status chip on a board by Status.
   */
  inactiveProperties?: string[];
  showViewModes?: boolean;
  showGrouping?: boolean;
  /** Linear's footer once the view differs from its default: Reset brings the default back. */
  onReset?: () => void;
  /** Linear's "Set default for everyone" beside Reset, for admins and owners (#472). */
  onSetDefault?: () => void;
}

export const BuyerlyDisplayOptions: React.FC<BuyerlyDisplayOptionsProps> = ({
  viewMode,
  onViewModeChange,
  grouping,
  groupingOptions,
  onGroupingChange,
  subGrouping,
  subGroupingOptions,
  onSubGroupingChange,
  ordering,
  orderingOptions,
  onOrderingChange,
  direction,
  onDirectionChange,
  groupOrdering,
  period,
  periodOptions,
  onPeriodChange,
  properties,
  enabledProperties,
  onToggleProperty,
  showEmptyGroups,
  onShowEmptyGroupsChange,
  showEmptySubGroups,
  onShowEmptySubGroupsChange,
  inactiveProperties = [],
  showViewModes = true,
  showGrouping = true,
  onReset,
  onSetDefault,
}) => {
  const [panel, setPanel] = useState<'main' | 'groups'>('main');
  const groupingLabel = viewMode === 'board' ? 'Columns' : 'Grouping';
  const subGroupingLabel = viewMode === 'board' ? 'Rows' : 'Sub-grouping';
  const optionsLabel = viewMode === 'board' ? 'Board options' : 'List options';
  const showEmptyLabel = viewMode === 'board' ? 'Show empty columns' : 'Show empty groups';
  const canOrderGroups = Boolean(groupOrdering) && grouping !== 'none' && (groupOrdering?.groups.length ?? 0) > 0;

  useEffect(() => {
    if (!canOrderGroups) setPanel('main');
  }, [canOrderGroups]);

  if (panel === 'groups' && groupOrdering && canOrderGroups) {
    return <GroupOrderingPanel {...groupOrdering} onBack={() => setPanel('main')} />;
  }

  return (
    <>
      <section className="buyerly-display-main-section">
        {showViewModes && <div role="tablist" className="buyerly-display-tabs">
          {(['list', 'board'] as const).map((mode) => (
            <div className="buyerly-display-tab-slot" key={mode}>
              <Tooltip content="Toggle layout view" shortcut={LAYOUT_SHORTCUT}>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === mode}
                aria-label={mode === 'list' ? 'List' : 'Board'}
                data-state={viewMode === mode ? 'active' : 'inactive'}
                tabIndex={viewMode === mode ? 0 : -1}
                className="buyerly-display-tab"
                onClick={() => onViewModeChange(mode)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    onViewModeChange(mode === 'list' ? 'board' : 'list');
                  }
                }}
              >
                {mode === 'list' ? <BuyerlyIcon name="list" size={16} /> : <BuyerlyIcon name="board" size={16} />}
                <span>{mode === 'list' ? 'List' : 'Board'}</span>
              </button>
              </Tooltip>
            </div>
          ))}
        </div>}

        {showGrouping && <div className="buyerly-display-row">
          <span>{groupingLabel}</span>
          <div className="buyerly-display-row-controls">
            <BuyerlySelect value={grouping} options={groupingOptions} onChange={onGroupingChange} />
            {canOrderGroups && (
              <Tooltip content="Group ordering">
                <button
                  type="button"
                  className="buyerly-display-order-button"
                  aria-label="Group ordering"
                  onClick={() => setPanel('groups')}
                >
                  <GroupOrderingIcon />
                </button>
              </Tooltip>
            )}
          </div>
        </div>}

        {showGrouping && subGrouping !== undefined && subGroupingOptions && onSubGroupingChange && (
          <div className="buyerly-display-row">
            <span>{subGroupingLabel}</span>
            <BuyerlySelect value={subGrouping} options={subGroupingOptions} onChange={onSubGroupingChange} />
          </div>
        )}

        <div className="buyerly-display-row">
          <span>Ordering</span>
          <div className="buyerly-display-row-controls">
            <BuyerlySelect value={ordering} options={orderingOptions} onChange={onOrderingChange} />
            {direction && onDirectionChange && ordering !== 'manual' && (
              <Tooltip content={direction === 'asc' ? 'Ascending' : 'Descending'}>
                <button
                  type="button"
                  className="buyerly-display-order-button"
                  aria-label="Direction"
                  data-direction={direction}
                  onClick={() => onDirectionChange(direction === 'asc' ? 'desc' : 'asc')}
                >
                  <DirectionIcon direction={direction} />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      </section>

      {period !== undefined && periodOptions && onPeriodChange && (
        <section className="buyerly-display-view-section">
          <div className="buyerly-display-row">
            <span>Period</span>
            <BuyerlySelect value={period} options={periodOptions} onChange={onPeriodChange} />
          </div>
        </section>
      )}

      <section className="buyerly-display-options-section">
        <div className="buyerly-display-section-title">{optionsLabel}</div>
        {showEmptyGroups !== undefined && onShowEmptyGroupsChange && (
          <div className="buyerly-display-row">
            <span>{showEmptyLabel}</span>
            <BuyerlyToggle
              label={showEmptyLabel}
              checked={showEmptyGroups}
              onChange={onShowEmptyGroupsChange}
            />
          </div>
        )}
        {showEmptySubGroups !== undefined && onShowEmptySubGroupsChange && (
          <div className="buyerly-display-row">
            <span>Show empty rows</span>
            <BuyerlyToggle
              label="Show empty rows"
              checked={showEmptySubGroups}
              onChange={onShowEmptySubGroupsChange}
            />
          </div>
        )}
        <div className="buyerly-display-properties-label">Display properties</div>
        <div className="buyerly-display-properties">
          {Object.entries(properties).map(([key, label]) => {
            const inactive = inactiveProperties.includes(key);
            return (
              <button
                type="button"
                key={key}
                aria-pressed={!inactive && !!enabledProperties[key]}
                disabled={inactive}
                className="buyerly-display-property"
                onClick={() => onToggleProperty(key)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {(onReset || onSetDefault) && (
        <section className="buyerly-display-footer">
          {onReset && (
            <button type="button" className="buyerly-display-footer-button" aria-label="Reset to default" onClick={onReset}>
              Reset
            </button>
          )}
          {onSetDefault && (
            <button type="button" className="buyerly-display-footer-button buyerly-display-footer-button--accent" onClick={onSetDefault}>
              Set default for everyone
            </button>
          )}
        </section>
      )}
    </>
  );
};

/**
 * Linear's mark on the Display options button while the view differs from
 * its default: a 7px accent dot at the icon's top right.
 */
export const DisplayOptionsChangedDot: React.FC<{ show: boolean }> = ({ show }) =>
  show ? <span className="buyerly-display-changed-dot" data-display-changed="true" aria-hidden="true" /> : null;
