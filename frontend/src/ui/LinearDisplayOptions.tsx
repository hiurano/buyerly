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
import { LinearBoardIcon, LinearListIcon } from '@/icons/LinearIcons';
import { LinearToggle } from './LinearToggle';
import { Tooltip } from './Tooltip';
import { LAYOUT_SHORTCUT } from './useLayoutShortcut';

export type DisplayOption = { value: string; label: string };

interface LinearSelectProps {
  value: string;
  options: DisplayOption[];
  onChange: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
}

const Chevron = () => (
  <svg width="10" height="5" viewBox="0 0 10 5" aria-hidden="true">
    <path fill="currentColor" d="M1.7.5a.7.7 0 0 0-1 1l3.6 3.1a1 1 0 0 0 1.4 0l3.6-3.1a.7.7 0 1 0-1-1L5 3.35 1.7.5Z" />
  </svg>
);

const Check = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
    <path fill="currentColor" d="M4.3 7.24a.75.75 0 0 0-1.1 1.02l3.25 3.5a.75.75 0 0 0 1.13-.04l5.25-6.5a.75.75 0 1 0-1.16-.94l-4.71 5.83L4.3 7.24Z" />
  </svg>
);

export const LinearSelect: React.FC<LinearSelectProps> = ({ value, options, onChange, onOpenChange }) => {
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
        className="linear-display-select"
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
          className="linear-display-select-menu"
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
                className="linear-display-select-option"
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


interface LinearMultiSelectProps {
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
export const LinearMultiSelect: React.FC<LinearMultiSelectProps> = ({ values, options, onChange, ariaLabel, footer }) => {
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
        className="linear-display-select"
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
          className="linear-display-select-menu linear-display-check-menu"
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
                className="linear-display-check-option"
                onClick={() => onChange(
                  isSelected
                    ? values.filter((value) => value !== option.value)
                    : options.map((entry) => entry.value).filter((value) => value === option.value || values.includes(value)),
                )}
              >
                <span className="linear-display-checkbox" data-checked={isSelected || undefined} aria-hidden="true">
                  {isSelected && <Check />}
                </span>
                <span>{option.label}</span>
              </button>
            );
          })}
          {footer && (
            <>
              <div role="separator" className="linear-display-check-divider" />
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="linear-display-check-option"
                onClick={() => {
                  setOpen(false);
                  footer.onSelect();
                }}
              >
                <span className="linear-display-check-icon" aria-hidden="true">{footer.icon}</span>
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

/** Linear's Direction icons: "Descending" draws the long bar on top, "Ascending" at the bottom. */
const DirectionIcon: React.FC<{ direction: 'asc' | 'desc' }> = ({ direction }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    {direction === 'desc' ? (
      <>
        <path fillRule="evenodd" clipRule="evenodd" d="M8.23 3.674a.75.75 0 0 1-.961 1.152l-1.77-1.475V14.25a.75.75 0 0 1-1.5 0V3.351L2.23 4.826a.75.75 0 1 1-.96-1.152l3-2.5a.75.75 0 0 1 .96 0z" />
        <path fillRule="evenodd" clipRule="evenodd" d="M6.999 7.25a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1-.75-.75M6.999 10.25a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75M6.999 13.25a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75" />
      </>
    ) : (
      <>
        <path fillRule="evenodd" clipRule="evenodd" d="M8.23 12.326a.75.75 0 1 0-.96-1.152L5.5 12.649V1.75a.75.75 0 0 0-1.5 0v10.899l-1.77-1.475a.75.75 0 1 0-.96 1.152l3 2.5a.75.75 0 0 0 .96 0z" />
        <path fillRule="evenodd" clipRule="evenodd" d="M7 8.75c0 .414.336.75.75.75h6.5a.75.75 0 0 0 0-1.5h-6.5a.75.75 0 0 0-.75.75M7 5.75c0 .414.336.75.75.75h4.5a.75.75 0 0 0 0-1.5h-4.5a.75.75 0 0 0-.75.75M7 2.75c0 .414.336.75.75.75h1.5a.75.75 0 1 0 0-1.5h-1.5a.75.75 0 0 0-.75.75" />
      </>
    )}
  </svg>
);

const GroupOrderingIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M8.16958 11.524C7.90741 11.8445 7.95488 12.3163 8.27505 12.5787L11.025 14.8287C11.3013 15.0547 11.698 15.0547 11.9743 14.8287L14.7243 12.5787C15.0449 12.3164 15.092 11.8446 14.8297 11.524C14.5674 11.2039 14.0955 11.1564 13.775 11.4186L12.2506 12.6666V4.74961C12.2506 4.33554 11.9147 3.99984 11.5006 3.99961C11.0864 3.99961 10.7506 4.3354 10.7506 4.74961V12.6676L9.22427 11.4186C8.90371 11.1567 8.43176 11.2036 8.16958 11.524Z" />
    <path fillRule="evenodd" clipRule="evenodd" d="M1.27603 3.41953C0.955449 3.68183 0.908263 4.15364 1.17056 4.47422C1.43291 4.79449 1.90477 4.84188 2.22524 4.57969L3.75063 3.33164L3.75063 11.2496C3.75088 11.6636 4.08657 11.9996 4.50063 11.9996C4.91451 11.9994 5.25039 11.6635 5.25063 11.2496L5.25063 3.33164L6.77603 4.57969C7.09658 4.84166 7.5685 4.79462 7.83071 4.47422C8.09292 4.15375 8.04553 3.68188 7.72524 3.41953L4.97524 1.16953C4.69897 0.943489 4.3023 0.943489 4.02603 1.16953L1.27603 3.41953Z" />
  </svg>
);

const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    <path d="M5.67382 11.4801C5.93899 11.7983 6.41191 11.8413 6.73012 11.5761C7.04833 11.311 7.09132 10.8381 6.82615 10.5198L5.35128 8.75L12.25 8.75C12.6642 8.75 13 8.41421 13 8C13 7.58579 12.6642 7.25 12.25 7.25L5.35125 7.25L6.82615 5.48012C7.09132 5.16191 7.04833 4.68899 6.73012 4.42381C6.41191 4.15864 5.93899 4.20163 5.67382 4.51984L3.17382 7.51984C2.94204 7.79798 2.94204 8.20198 3.17382 8.48012L5.67382 11.4801Z" />
  </svg>
);

const DragHandleIcon = () => (
  <svg width="6" height="10" viewBox="0 0 6 10" aria-hidden="true" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M1 8a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM1 4a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM1 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
  </svg>
);

const EyeIcon: React.FC<{ hidden: boolean }> = ({ hidden }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    {hidden ? (
      <>
        <path d="M11.237 12.297c1.738-.8 3.085-2.227 3.705-3.962a1.001 1.001 0 0 0 0-.674C13.972 4.953 11.232 3 8 3a7.621 7.621 0 0 0-4.569 1.493l1.734 1.734c.122-.17.263-.33.42-.477A3.544 3.544 0 0 1 8 4.818c.905 0 1.774.335 2.414.932.64.597 1 1.406 1 2.25 0 .844-.36 1.653-1 2.25-.215.2-.456.371-.715.51l1.538 1.537ZM9.645 12.827 8 11.182a3.543 3.543 0 0 1-2.414-.932 3.076 3.076 0 0 1-.991-2.473L2.33 5.512a6.688 6.688 0 0 0-1.272 2.153 1 1 0 0 0 0 .674C2.028 11.047 4.769 13 8 13a7.85 7.85 0 0 0 1.646-.173Z" />
        <path d="M8.653 9.713c.27-.09.52-.234.726-.427.366-.341.572-.804.572-1.286s-.206-.945-.572-1.286A2.025 2.025 0 0 0 8 6.182c-.517 0-1.013.191-1.38.532a1.818 1.818 0 0 0-.408.559l2.44 2.44Z" />
        <path d="M1.22 1.22a.75.75 0 0 1 1.06 0l12 12a.75.75 0 1 1-1.06 1.06l-12-12a.75.75 0 0 1 0-1.06Z" />
      </>
    ) : (
      <>
        <path d="M8.00006 9.81818C8.51738 9.81818 9.01352 9.62662 9.37932 9.28565C9.74512 8.94467 9.95063 8.48221 9.95063 8C9.95063 7.51779 9.74512 7.05533 9.37932 6.71435C9.01352 6.37338 8.51738 6.18182 8.00006 6.18182C7.48274 6.18182 6.9866 6.37338 6.6208 6.71435C6.255 7.05533 6.04949 7.51779 6.04949 8C6.04949 8.48221 6.255 8.94467 6.6208 9.28565C6.9866 9.62662 7.48274 9.81818 8.00006 9.81818Z" />
        <path fillRule="evenodd" clipRule="evenodd" d="M1.05799 7.66485C2.02547 4.95515 4.76732 3 8.00071 3C11.2322 3 13.9727 4.95333 14.9415 7.66061C15.0195 7.88 15.0195 8.11636 14.9415 8.33515C13.9747 11.0448 11.2322 13 7.99941 13C4.76797 13 2.02677 11.0467 1.05864 8.33939C0.980453 8.12045 0.980453 7.88379 1.05864 7.66485H1.05799ZM11.4136 8C11.4136 8.84387 11.0539 9.65318 10.4138 10.2499C9.77361 10.8466 8.90538 11.1818 8.00006 11.1818C7.09475 11.1818 6.22651 10.8466 5.58636 10.2499C4.9462 9.65318 4.58657 8.84387 4.58657 8C4.58657 7.15613 4.9462 6.34682 5.58636 5.75011C6.22651 5.15341 7.09475 4.81818 8.00006 4.81818C8.90538 4.81818 9.77361 5.15341 10.4138 5.75011C11.0539 6.34682 11.4136 7.15613 11.4136 8Z" />
      </>
    )}
  </svg>
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
      className="linear-display-group-row"
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <div className="linear-display-group-handle" aria-label={`Move ${group.label}`} {...attributes} {...listeners}>
        <DragHandleIcon />
      </div>
      <div className="linear-display-group-label" data-hidden={hidden || undefined}>
        {group.icon && <span className="linear-display-group-icon" aria-hidden="true">{group.icon}</span>}
        <span>{group.label}</span>
      </div>
      <button
        type="button"
        className="linear-display-order-button"
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
      <section className="linear-display-group-header">
        <button type="button" className="linear-display-order-button" aria-label="Back" onClick={onBack}>
          <BackIcon />
        </button>
        <span>Group ordering</span>
      </section>
      <section className="linear-display-group-list" aria-label="Group ordering">
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


interface LinearDisplayOptionsProps {
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
}

export const LinearDisplayOptions: React.FC<LinearDisplayOptionsProps> = ({
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
      <section className="linear-display-main-section">
        {showViewModes && <div role="tablist" className="linear-display-tabs">
          {(['list', 'board'] as const).map((mode) => (
            <div className="linear-display-tab-slot" key={mode}>
              <Tooltip content="Toggle layout view" shortcut={LAYOUT_SHORTCUT}>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === mode}
                aria-label={mode === 'list' ? 'List' : 'Board'}
                data-state={viewMode === mode ? 'active' : 'inactive'}
                tabIndex={viewMode === mode ? 0 : -1}
                className="linear-display-tab"
                onClick={() => onViewModeChange(mode)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    onViewModeChange(mode === 'list' ? 'board' : 'list');
                  }
                }}
              >
                {mode === 'list' ? <LinearListIcon size={16} /> : <LinearBoardIcon size={16} />}
                <span>{mode === 'list' ? 'List' : 'Board'}</span>
              </button>
              </Tooltip>
            </div>
          ))}
        </div>}

        {showGrouping && <div className="linear-display-row">
          <span>{groupingLabel}</span>
          <div className="linear-display-row-controls">
            <LinearSelect value={grouping} options={groupingOptions} onChange={onGroupingChange} />
            {canOrderGroups && (
              <Tooltip content="Group ordering">
                <button
                  type="button"
                  className="linear-display-order-button"
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
          <div className="linear-display-row">
            <span>{subGroupingLabel}</span>
            <LinearSelect value={subGrouping} options={subGroupingOptions} onChange={onSubGroupingChange} />
          </div>
        )}

        <div className="linear-display-row">
          <span>Ordering</span>
          <div className="linear-display-row-controls">
            <LinearSelect value={ordering} options={orderingOptions} onChange={onOrderingChange} />
            {direction && onDirectionChange && ordering !== 'manual' && (
              <Tooltip content={direction === 'asc' ? 'Ascending' : 'Descending'}>
                <button
                  type="button"
                  className="linear-display-order-button"
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

      <section className="linear-display-options-section">
        <div className="linear-display-section-title">{optionsLabel}</div>
        {showEmptyGroups !== undefined && onShowEmptyGroupsChange && (
          <div className="linear-display-row">
            <span>{showEmptyLabel}</span>
            <LinearToggle
              label={showEmptyLabel}
              checked={showEmptyGroups}
              onChange={onShowEmptyGroupsChange}
            />
          </div>
        )}
        {showEmptySubGroups !== undefined && onShowEmptySubGroupsChange && (
          <div className="linear-display-row">
            <span>Show empty rows</span>
            <LinearToggle
              label="Show empty rows"
              checked={showEmptySubGroups}
              onChange={onShowEmptySubGroupsChange}
            />
          </div>
        )}
        <div className="linear-display-properties-label">Display properties</div>
        <div className="linear-display-properties">
          {Object.entries(properties).map(([key, label]) => {
            const inactive = inactiveProperties.includes(key);
            return (
              <button
                type="button"
                key={key}
                aria-pressed={!inactive && !!enabledProperties[key]}
                disabled={inactive}
                className="linear-display-property"
                onClick={() => onToggleProperty(key)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {onReset && (
        <section className="linear-display-footer">
          <button type="button" className="linear-display-footer-button" aria-label="Reset to default" onClick={onReset}>
            Reset
          </button>
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
  show ? <span className="linear-display-changed-dot" data-display-changed="true" aria-hidden="true" /> : null;
