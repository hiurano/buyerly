import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays,
  Check,
  Circle,
  CircleDashed,
  Gauge,
  Hash,
  Layers3,
  Plus,
  Type,
  UserRound,
  X,
} from 'lucide-react';
import {
  BuyerlyLogoAvatar,
  LinearBacklogDashedIcon,
  LinearBoltIcon,
  LinearFilterIcon,
  LinearInboxUnreadIcon,
  LinearProjectCubeIcon,
} from '@/icons/LinearIcons';
import {
  FILTER_OPERATOR_LABELS,
  FilterClause,
  filterOperatorLabel,
  FilterFieldDefinition,
  FilterOption,
  type FilterOptionAvatar,
  getFilterValueAccessibleName,
  getFilterValueSummary,
  removeFilterClause,
  upsertFilterClause,
} from './filterModel';
import { useMenuExit } from '@/ui/useMenuExit';
import { SubmenuArrow } from '@/ui/SubmenuArrow';

const MENU_SURFACE = 'var(--card-bg)';
const MENU_BORDER = 'var(--filter-menu-border)';
const MENU_DIVIDER = 'var(--filter-menu-divider)';
const MENU_TEXT = 'var(--filter-menu-text)';
const MENU_TEXT_ACTIVE = 'var(--filter-menu-text-active)';
const MENU_MUTED = 'var(--filter-menu-muted)';
const ROOT_WIDTH = 262;
const CHILD_WIDTH = 230;
const VIEWPORT_GAP = 8;
const CHILD_OVERLAP = 3;
// Measured in Linear: a submenu gets its own search field from five values on
// (Priority, Status), not with one to three (Project, Labels, Notification type).
const CHILD_SEARCH_MIN_OPTIONS = 5;
const SEARCH_ROW_HEIGHT = 37;
const LIST_PADDING = 6;

// Opened from the keyboard (F), Linear highlights the first row; opened with the
// mouse, nothing is highlighted until the pointer or an arrow key picks a row.
let lastInputWasKeyboard = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', () => { lastInputWasKeyboard = true; }, true);
  window.addEventListener('pointerdown', () => { lastInputWasKeyboard = false; }, true);
}

interface Point {
  x: number;
  y: number;
}

const sign = (a: Point, b: Point, c: Point) => (a.x - c.x) * (b.y - c.y) - (b.x - c.x) * (a.y - c.y);

const isInTriangle = (point: Point, a: Point, b: Point, c: Point) => {
  const d1 = sign(point, a, b);
  const d2 = sign(point, b, c);
  const d3 = sign(point, c, a);
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNegative && hasPositive);
};

/**
 * Linear keeps the open submenu while the pointer heads for it, even across
 * other rows: the move from `from` to `to` stays inside the triangle between
 * `from` and the submenu's near edge.
 */
const isMovingTowardSubmenu = (from: Point, to: Point, submenu: DOMRect) => {
  const edgeX = submenu.left >= from.x ? submenu.left : submenu.right;
  return isInTriangle(to, from, { x: edgeX, y: submenu.top }, { x: edgeX, y: submenu.bottom });
};

export type FilterMenuMode = 'root' | 'operator' | 'value';

interface FilterMenuProps<T> {
  isOpen: boolean;
  mode: FilterMenuMode;
  anchorElement: HTMLElement | null;
  fields: FilterFieldDefinition<T>[];
  clauses: FilterClause[];
  onChange: (clauses: FilterClause[]) => void;
  onClose: () => void;
  fieldId?: string;
  /** Singular and plural noun for option counts, e.g. ["notification", "notifications"]. */
  countNoun?: [string, string];
  childWidth?: number;
  rootPlaceholder?: string;
}

interface MenuPosition {
  left: number;
  top: number;
}

interface RootEntry<T> {
  key: string;
  kind: 'field' | 'value';
  field: FilterFieldDefinition<T>;
  option?: FilterOption;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

const getAnchorPosition = (anchor: HTMLElement, width: number): MenuPosition => {
  const rect = anchor.getBoundingClientRect();
  const left = clamp(rect.left, 10, window.innerWidth - width - 10);
  const preferredTop = rect.bottom + 4.5;
  const top = clamp(preferredTop, VIEWPORT_GAP, window.innerHeight - 220);
  return { left, top };
};

// Linear scales the menu from the point under the trigger, 4.5px above its top edge.
const getTransformOrigin = (anchor: HTMLElement, position: MenuPosition) => {
  const rect = anchor.getBoundingClientRect();
  return `${Math.max(0, rect.left - position.left)}px ${rect.bottom - position.top}px`;
};

/**
 * As in Linear: the submenu opens to the right of the menu and flips left only
 * when it does not fit, with its first value level with the hovered row.
 */
const getChildPosition = (
  rowTop: number,
  rootPosition: MenuPosition,
  size: { width: number; height: number },
  hasSearch: boolean,
): MenuPosition => {
  const rightLeft = rootPosition.left + ROOT_WIDTH - CHILD_OVERLAP;
  const left =
    rightLeft + size.width <= window.innerWidth - VIEWPORT_GAP
      ? rightLeft
      : rootPosition.left - size.width + CHILD_OVERLAP;
  const top = rowTop - 1 - LIST_PADDING - (hasSearch ? SEARCH_ROW_HEIGHT : 0);
  return {
    left: clamp(left, VIEWPORT_GAP, window.innerWidth - size.width - VIEWPORT_GAP),
    top: clamp(top, VIEWPORT_GAP, window.innerHeight - size.height - VIEWPORT_GAP),
  };
};

const FilterFieldIcon: React.FC<{ fieldId: string; type: FilterFieldDefinition<unknown>['type'] }> = ({
  fieldId,
  type,
}) => {
  const props = { size: 15, strokeWidth: 1.8, 'aria-hidden': true } as const;
  if (fieldId === 'notificationType') return <LinearInboxUnreadIcon size={14} />;
  if (fieldId === 'from') return <UserRound {...props} />;
  if (fieldId === 'adAccount') return <LinearProjectCubeIcon size={14} />;
  if (fieldId === 'eventStatus') return <Circle {...props} />;
  if (fieldId === 'status') return <LinearBacklogDashedIcon size={14} />;
  if (fieldId.includes('group') || fieldId.includes('campaign') || fieldId.includes('adSet')) {
    return <Layers3 {...props} />;
  }
  if (fieldId.includes('rule') || fieldId.includes('action')) return <LinearBoltIcon size={14} />;
  if (type === 'number') return <Gauge {...props} />;
  if (type === 'date') return <CalendarDays {...props} />;
  if (type === 'text') return <Type {...props} />;
  return <Hash {...props} />;
};

const MenuSurface = React.forwardRef<
  HTMLDivElement,
  React.PropsWithChildren<{
    position: MenuPosition;
    /** A number fixes the width; "content" sizes to the values, as Linear's submenus do. */
    width: number | 'content';
    minWidth?: number;
    label: string;
    strongShadow?: boolean;
    /** Entering and leaving animation; submenus appear at once. */
    motion?: 'enter' | 'exit' | 'none';
    transformOrigin?: string;
  }>
>(({ position, width, minWidth, label, strongShadow = false, motion = 'none', transformOrigin, children }, ref) => (
  <div
    ref={ref}
    role="dialog"
    aria-label={label}
    className={motion === 'enter' ? 'linear-menu-enter' : motion === 'exit' ? 'linear-menu-exit' : undefined}
    style={{
      position: 'fixed',
      left: position.left,
      top: position.top,
      width: width === 'content' ? 'max-content' : width,
      minWidth,
      maxWidth: width === 'content' ? 400 : undefined,
      boxSizing: 'border-box',
      maxHeight: `calc(100vh - ${VIEWPORT_GAP * 2}px)`,
      overflow: 'hidden',
      border: `1px solid ${MENU_BORDER}`,
      borderRadius: 12,
      backgroundColor: MENU_SURFACE,
      color: MENU_TEXT,
      boxShadow: strongShadow ? 'var(--filter-menu-strong-shadow)' : 'var(--filter-menu-shadow)',
      zIndex: 10000,
      fontFamily:
        '"Inter Variable", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", "Linear Thai", sans-serif',
      fontSize: 13,
      fontWeight: 450,
      lineHeight: '19.5px',
      transformOrigin,
    }}
  >
    {children}
  </div>
));
MenuSurface.displayName = 'MenuSurface';

const SearchRow = React.forwardRef<
  HTMLInputElement,
  {
    label: string;
    value: string;
    onChange: (value: string) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
    shortcut?: string;
  }
>(({ label, value, onChange, onKeyDown, shortcut }, ref) => (
  <div
    style={{
      display: 'flex',
      height: 37,
      alignItems: 'center',
      gap: 8,
      padding: '0 12px 0 14px',
      borderBottom: `1px solid ${MENU_DIVIDER}`,
    }}
  >
    <input
      ref={ref}
      role="searchbox"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      placeholder={label}
      style={{
        width: '100%',
        height: 36,
        padding: '10px 0 9px',
        border: 0,
        outline: 0,
        background: 'transparent',
        color: MENU_TEXT,
        font: 'inherit',
        lineHeight: '19.5px',
        fontWeight: 450,
      }}
    />
    {shortcut && (
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          width: 18,
          height: 19,
          flexShrink: 0,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 2,
          border: `1px solid ${MENU_DIVIDER}`,
          borderRadius: 4,
          color: MENU_MUTED,
          fontSize: 11,
          lineHeight: '13px',
        }}
      >
        {shortcut}
      </span>
    )}
  </div>
));
SearchRow.displayName = 'SearchRow';

/**
 * Linear's avatar under From: 16px round in the menu, 14px in a chip. A person
 * shows their photo or initials; an agent (our rules) a disc in the text color
 * with its mark at 10px in the menu's color; Buyerly its logo.
 */
export const FilterOptionAvatarImage: React.FC<{ avatar: FilterOptionAvatar; label: string; size: number }> = ({
  avatar,
  label,
  size,
}) => {
  if (avatar.kind === 'buyerly') {
    return (
      <span data-filter-avatar="buyerly" aria-hidden="true" style={{ display: 'inline-flex' }}>
        <BuyerlyLogoAvatar size={size} shape="circle" />
      </span>
    );
  }
  const box: React.CSSProperties = {
    display: 'inline-flex',
    width: size,
    height: size,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
  };
  if (avatar.kind === 'rule') {
    return (
      <span data-filter-avatar="rule" aria-hidden="true" style={{ ...box, backgroundColor: MENU_TEXT, color: MENU_SURFACE }}>
        <LinearBoltIcon size={Math.round(size * 0.625)} />
      </span>
    );
  }
  if (avatar.url) {
    return (
      <img
        data-filter-avatar="user"
        src={avatar.url}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{ ...box, objectFit: 'cover' }}
      />
    );
  }
  // The letter comes from CSS so it stays out of the option's text.
  return (
    <span
      data-filter-avatar="user"
      data-initial={label.trim().slice(0, 1)}
      className="filter-avatar-initial"
      aria-hidden="true"
      style={{
        ...box,
        backgroundColor: 'var(--action-primary)',
        color: '#fff',
        fontSize: Math.round(size * 0.5),
        fontWeight: 600,
        lineHeight: 1,
        textTransform: 'uppercase',
      }}
    />
  );
};

const MenuOption: React.FC<{
  label: string;
  icon?: React.ReactNode;
  meta?: React.ReactNode;
  badge?: string;
  avatar?: FilterOptionAvatar;
  highlighted: boolean;
  selected?: boolean;
  multiSelect?: boolean;
  expanded?: boolean;
  onMouseEnter?: () => void;
  onClick: (event: React.MouseEvent<HTMLDivElement>) => void;
}> = ({ label, icon, meta, badge, avatar, highlighted, selected, multiSelect, expanded, onMouseEnter, onClick }) => (
  <div
    role="option"
    aria-selected={selected}
    aria-expanded={expanded}
    onMouseEnter={onMouseEnter}
    onClick={onClick}
    // Keep focus in the search field so Escape and arrows keep working after a click.
    onMouseDown={(event) => event.preventDefault()}
    style={{
      display: 'flex',
      height: 32,
      alignItems: 'center',
      position: 'relative',
      gap: 0,
      padding: '0 18px 0 14px',
      backgroundColor: 'transparent',
      color: highlighted ? MENU_TEXT_ACTIVE : MENU_TEXT,
      cursor: 'default',
      lineHeight: '19.5px',
    }}
  >
    {highlighted && (
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: '0 6px',
          borderRadius: 8,
          backgroundColor: 'var(--filter-menu-highlight)',
          zIndex: 0,
        }}
      />
    )}
    {multiSelect && (
      <span
        role="checkbox"
        aria-checked={Boolean(selected)}
        style={{
          // As in Linear, the box shows on the highlighted row and on selected ones.
          visibility: selected || highlighted ? 'visible' : 'hidden',
          display: 'inline-flex',
          width: 14,
          height: 14,
          marginLeft: 1,
          flexShrink: 0,
          alignItems: 'center',
          justifyContent: 'center',
          border: selected ? '1px solid var(--filter-checkbox-selected)' : '1px solid var(--filter-checkbox-border)',
          borderRadius: 3,
          backgroundColor: selected ? 'var(--filter-checkbox-selected)' : 'transparent',
          color: '#fff',
          zIndex: 1,
        }}
      >
        {selected && <Check size={10} strokeWidth={2.5} aria-hidden="true" />}
      </span>
    )}
    {!multiSelect && (
      <span
        style={{
          display: 'inline-flex',
          width: 16,
          flexShrink: 0,
          alignItems: 'center',
          justifyContent: 'center',
          color: selected ? 'lch(73% 35 290)' : MENU_MUTED,
          zIndex: 1,
        }}
      >
        {selected ? <Check size={14} strokeWidth={2.2} aria-hidden="true" /> : icon}
      </span>
    )}
    {avatar && (
      // Linear's From row: checkbox, avatar 30px from the row's edge, name 8px after it.
      <span style={{ display: 'inline-flex', marginLeft: 7, zIndex: 1 }}>
        <FilterOptionAvatarImage avatar={avatar} label={label} size={16} />
      </span>
    )}
    <span style={{ minWidth: 0, flex: badge ? '0 1 auto' : 1, paddingLeft: avatar ? 8 : 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', zIndex: 1 }}>
      {label}
    </span>
    {badge && (
      // Linear's "Agent" tag under From: 8px after the name, 16px tall, 12px/500, outlined, radius 6.
      <span
        style={{
          display: 'inline-flex',
          flexShrink: 0,
          alignItems: 'center',
          height: 16,
          boxSizing: 'border-box',
          marginLeft: 8,
          marginRight: 'auto',
          padding: '0 6px',
          border: '1px solid var(--filter-badge-border)',
          borderRadius: 6,
          color: MENU_MUTED,
          fontSize: 12,
          fontWeight: 500,
          lineHeight: '16px',
          zIndex: 1,
        }}
      >
        {badge}
      </span>
    )}
    {meta && (
      <span style={{ flexShrink: 0, marginLeft: 12, color: MENU_MUTED, fontSize: 12, zIndex: 1 }}>
        {meta}
      </span>
    )}
  </div>
);

const SectionSeparator = () => (
  <div style={{ display: 'flex', height: 12, alignItems: 'center' }} aria-hidden="true">
    <span style={{ width: '100%', height: 1, backgroundColor: MENU_DIVIDER }} />
  </div>
);

export const LinearFilterMenu = <T,>({
  isOpen,
  mode,
  anchorElement,
  fields,
  clauses,
  onChange,
  onClose,
  fieldId,
  countNoun = ['issue', 'issues'],
  childWidth = CHILD_WIDTH,
  rootPlaceholder = 'Add Filter…',
}: FilterMenuProps<T>) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const childRef = useRef<HTMLDivElement>(null);
  const rootInputRef = useRef<HTMLInputElement>(null);
  const childInputRef = useRef<HTMLInputElement>(null);
  const childListRef = useRef<HTMLDivElement>(null);
  const lastPointerRef = useRef<Point | null>(null);
  const [rootPosition, setRootPosition] = useState<MenuPosition>({ left: 0, top: 0 });
  const [transformOrigin, setTransformOrigin] = useState('0 0');
  const [childRowTop, setChildRowTop] = useState(0);
  const [childPosition, setChildPosition] = useState<MenuPosition>({ left: 0, top: 0 });
  const [rootSearch, setRootSearch] = useState('');
  const [childSearch, setChildSearch] = useState('');
  const [activeFieldId, setActiveFieldId] = useState<string | null>(fieldId ?? null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [childHighlightedIndex, setChildHighlightedIndex] = useState(0);
  const [editorValue, setEditorValue] = useState('');
  // Stays mounted after the parent closes the menu, for Linear's closing fade.
  const { isMounted, isClosing } = useMenuExit(isOpen);
  const shownModeRef = useRef(mode);
  if (isOpen) shownModeRef.current = mode;
  const shownMode = shownModeRef.current;

  const activeField = fields.find((field) => field.id === activeFieldId) ?? null;
  const activeClause = activeField
    ? clauses.find((clause) => clause.fieldId === activeField.id)
    : undefined;
  const childHasSearch =
    shownMode !== 'root' ||
    (activeField?.type === 'enum' && (activeField.options?.length ?? 0) >= CHILD_SEARCH_MIN_OPTIONS);

  useLayoutEffect(() => {
    if (!isOpen || !anchorElement) return;
    const width = mode === 'root' ? ROOT_WIDTH : childWidth;

    const updatePosition = () => {
      const position = getAnchorPosition(anchorElement, width);
      setRootPosition(position);
      setTransformOrigin(getTransformOrigin(anchorElement, position));
    };
    updatePosition();
    setRootSearch('');
    setChildSearch('');
    setHighlightedIndex(mode === 'root' && !lastInputWasKeyboard ? -1 : 0);
    setChildHighlightedIndex(0);
    setActiveFieldId(fieldId ?? null);
    setEditorValue('');
    lastPointerRef.current = null;

    const focusTimer = window.setTimeout(() => {
      if (mode === 'root') rootInputRef.current?.focus();
      else (childInputRef.current ?? childListRef.current)?.focus();
    }, 20);

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, anchorElement, fieldId, mode, childWidth]);

  useLayoutEffect(() => {
    if (shownMode !== 'root' || !activeFieldId || !childRef.current) return;
    const { offsetWidth: width, offsetHeight: height } = childRef.current;
    setChildPosition(getChildPosition(childRowTop, rootPosition, { width, height }, childHasSearch));
  }, [shownMode, activeFieldId, childRowTop, rootPosition, childHasSearch]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !childRef.current?.contains(target) &&
        !anchorElement?.contains(target)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen, anchorElement, onClose]);

  const rootEntries = useMemo<RootEntry<T>[]>(() => {
    const query = rootSearch.trim().toLocaleLowerCase();
    if (!query) {
      return fields.map((field) => ({ key: field.id, kind: 'field', field }));
    }

    const matches: RootEntry<T>[] = [];
    fields.forEach((field) => {
      const matchesField = [field.label, ...(field.keywords ?? [])]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query);
      if (matchesField) matches.push({ key: field.id, kind: 'field', field });

      field.options?.forEach((option) => {
        const matchesValue = [option.label, ...(option.keywords ?? [])]
          .join(' ')
          .toLocaleLowerCase()
          .includes(query);
        if (matchesValue) {
          matches.push({
            key: `${field.id}:${option.value}`,
            kind: 'value',
            field,
            option,
          });
        }
      });
    });
    return matches;
  }, [fields, rootSearch]);

  const childOptions = useMemo(() => {
    if (!activeField?.options) return [];
    const query = childSearch.trim().toLocaleLowerCase();
    const selectedValues = new Set((activeClause?.values ?? []).map(String));
    const matches = activeField.options.filter((option) =>
      [option.label, ...(option.keywords ?? [])]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query)
    );
    return [...matches].sort((left, right) => {
      const leftSelected = selectedValues.has(left.value) ? 1 : 0;
      const rightSelected = selectedValues.has(right.value) ? 1 : 0;
      return rightSelected - leftSelected;
    });
  }, [activeField, activeClause, childSearch]);

  if (!isMounted) return null;
  if (isOpen && !anchorElement) return null;

  const applyOption = (field: FilterFieldDefinition<T>, option: FilterOption) => {
    const current = clauses.find((clause) => clause.fieldId === field.id);
    const currentValues = current?.values ?? [];
    const isSelected = currentValues.map(String).includes(option.value);
    const nextValues = isSelected
      ? currentValues.filter((value) => String(value) !== option.value)
      : [...currentValues, option.value];

    if (nextValues.length === 0) {
      onChange(removeFilterClause(clauses, field.id));
    } else {
      onChange(
        upsertFilterClause(clauses, {
          fieldId: field.id,
          operator: current?.operator ?? field.defaultOperator,
          values: nextValues,
        })
      );
    }
  };

  const rootRowAt = (index: number) =>
    rootRef.current?.querySelectorAll<HTMLElement>('[data-filter-root-option]')[index];

  // Unscaled, so a submenu opened while the menu is still growing lands level with its row.
  const rowTopOf = (row: HTMLElement) =>
    rootPosition.top + 1 + row.offsetTop - (row.closest('[role="listbox"]')?.scrollTop ?? 0);

  /**
   * Linear opens a property's values as soon as its row is hovered or reached
   * with the arrows; a click, Enter or → also moves the keyboard into them.
   */
  const openField = (field: FilterFieldDefinition<T>, row: HTMLElement, focusChild: boolean) => {
    if (field.id !== activeFieldId) {
      setActiveFieldId(field.id);
      setChildSearch('');
      setEditorValue(String(clauses.find((clause) => clause.fieldId === field.id)?.values[0] ?? ''));
      setChildRowTop(rowTopOf(row));
    }
    setChildHighlightedIndex(focusChild ? 0 : -1);
    if (focusChild) {
      window.setTimeout(() => (childInputRef.current ?? childListRef.current)?.focus(), 0);
    } else if (document.activeElement !== rootInputRef.current) {
      rootInputRef.current?.focus();
    }
  };

  const previewRootEntry = (index: number) => {
    const entry = rootEntries[index];
    const row = rootRowAt(index);
    if (entry?.kind === 'field' && row) openField(entry.field, row, false);
    else setActiveFieldId(null);
  };

  const activateRootEntry = (entry: RootEntry<T>, row?: HTMLElement) => {
    if (entry.kind === 'value' && entry.option) {
      applyOption(entry.field, entry.option);
      return;
    }
    if (row) openField(entry.field, row, true);
  };

  const handleRootPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = { x: event.clientX, y: event.clientY };
    const previous = lastPointerRef.current;
    lastPointerRef.current = point;
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-filter-root-option]');
    const index = Number(row?.dataset.index);
    const entry = rootEntries[index];
    if (!row || !entry) return;
    const isOpenField = entry.kind === 'field' && entry.field.id === activeFieldId;
    if (index === highlightedIndex && (isOpenField || entry.kind === 'value')) return;
    const submenu = childRef.current?.getBoundingClientRect();
    if (activeFieldId && !isOpenField && previous && submenu && isMovingTowardSubmenu(previous, point, submenu)) {
      return;
    }
    setHighlightedIndex(index);
    previewRootEntry(index);
  };

  const handleRootKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const count = rootEntries.length;
      if (count === 0) return;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const next =
        highlightedIndex < 0
          ? direction === 1 ? 0 : count - 1
          : (highlightedIndex + direction + count) % count;
      setHighlightedIndex(next);
      previewRootEntry(next);
      return;
    }
    if (event.key === 'Enter' || event.key === 'ArrowRight') {
      event.preventDefault();
      const index = Math.max(highlightedIndex, 0);
      const entry = rootEntries[index];
      if (entry) {
        setHighlightedIndex(index);
        activateRootEntry(entry, rootRowAt(index));
      }
    }
  };

  const closeChild = () => {
    if (shownMode === 'root') {
      setActiveFieldId(null);
      rootInputRef.current?.focus();
    } else {
      onClose();
    }
  };

  const handleChildKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      closeChild();
      return;
    }
    if (event.key === 'Backspace' && childSearch === '' && shownMode === 'root') {
      event.preventDefault();
      closeChild();
      return;
    }
    if (activeField?.type === 'enum') {
      const count = childOptions.length;
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && count > 0) {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        setChildHighlightedIndex((index) =>
          index < 0 ? (direction === 1 ? 0 : count - 1) : (index + direction + count) % count
        );
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const option = childOptions[childHighlightedIndex];
        if (option) applyOption(activeField, option);
      }
    }
  };

  const applyEditorValue = () => {
    if (!activeField || editorValue.trim() === '') return;
    const current = clauses.find((clause) => clause.fieldId === activeField.id);
    const value = activeField.type === 'number' ? Number(editorValue) : editorValue.trim();
    if (activeField.type === 'number' && !Number.isFinite(value)) return;
    onChange(
      upsertFilterClause(clauses, {
        fieldId: activeField.id,
        operator: current?.operator ?? activeField.defaultOperator,
        values: [value],
      })
    );
    onClose();
  };

  const renderValueBody = (field: FilterFieldDefinition<T>) => {
    if (field.type === 'enum') {
      const currentValues = new Set((activeClause?.values ?? []).map(String));
      const selectedCount = childOptions.filter((option) => currentValues.has(option.value)).length;
      return (
        <>
          {childHasSearch && (
            <SearchRow
              ref={childInputRef}
              label={shownMode === 'value' ? field.label : 'Filter…'}
              value={childSearch}
              onChange={(value) => {
                setChildSearch(value);
                setChildHighlightedIndex(0);
              }}
              onKeyDown={handleChildKeyDown}
            />
          )}
          <div
            ref={childListRef}
            role="listbox"
            aria-label={`${field.label} values`}
            // Without a search field the list itself takes the keyboard, as in Linear.
            tabIndex={childHasSearch ? undefined : -1}
            onKeyDown={childHasSearch ? undefined : handleChildKeyDown}
            style={{ maxHeight: 330, overflowY: 'auto', padding: `${LIST_PADDING}px 0`, outline: 'none' }}
          >
            {childOptions.length === 0 ? (
              <div style={{ padding: '6px 14px', color: MENU_MUTED }}>No matching options</div>
            ) : (
              childOptions.map((option, index) => {
                const selected = currentValues.has(option.value);
                const showSeparator = index === selectedCount && selectedCount > 0 && selectedCount < childOptions.length;
                return (
                  <React.Fragment key={option.value}>
                    {showSeparator && <SectionSeparator />}
                    <MenuOption
                      label={option.label}
                      badge={option.badge}
                      avatar={option.avatar}
                      selected={selected}
                      multiSelect
                      highlighted={childHighlightedIndex === index}
                      onMouseEnter={() => setChildHighlightedIndex(index)}
                      onClick={() => applyOption(field, option)}
                      meta={
                        option.count === undefined
                          ? undefined
                          : `${option.count} ${option.count === 1 ? countNoun[0] : countNoun[1]}`
                      }
                    />
                  </React.Fragment>
                );
              })
            )}
          </div>
          {field.unmatchedCount ? (
            <>
              <SectionSeparator />
              <div style={{ display: 'flex', height: 32, alignItems: 'center', gap: 8, padding: '0 14px 6px', color: MENU_TEXT }}>
                <FilterFieldIcon fieldId={field.id} type={field.type as FilterFieldDefinition<unknown>['type']} />
                {field.unmatchedCount} {field.unmatchedCount === 1 ? 'option' : 'options'} not matching any {countNoun[1]}
              </div>
            </>
          ) : null}
        </>
      );
    }

    return (
      <div style={{ width: shownMode === 'root' ? CHILD_WIDTH : undefined, padding: 10 }}>
        <label style={{ display: 'block', marginBottom: 7, color: MENU_MUTED, fontSize: 12 }}>
          {field.label}
        </label>
        <input
          ref={childInputRef}
          aria-label={field.label}
          type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
          step={field.type === 'number' ? 'any' : undefined}
          value={editorValue}
          onChange={(event) => setEditorValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
            if (event.key === 'ArrowLeft' && event.currentTarget.selectionStart === 0) closeChild();
            if (event.key === 'Enter') applyEditorValue();
          }}
          placeholder={field.placeholder ?? 'Enter a value…'}
          style={{
            width: '100%',
            height: 32,
            border: `1px solid ${MENU_BORDER}`,
            borderRadius: 7,
            padding: '0 9px',
            outline: 0,
            backgroundColor: 'var(--item-hover-bg)',
            color: MENU_TEXT,
            font: 'inherit',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 9 }}>
          <button
            type="button"
            onClick={applyEditorValue}
            disabled={editorValue.trim() === ''}
            style={{
              height: 26,
              padding: '0 10px',
              border: `1px solid ${MENU_BORDER}`,
              borderRadius: 9999,
              backgroundColor: 'var(--tab-active-bg)',
              color: editorValue.trim() ? MENU_TEXT : MENU_MUTED,
              font: 'inherit',
              fontSize: 12,
              cursor: editorValue.trim() ? 'pointer' : 'default',
            }}
          >
            Apply
          </button>
        </div>
      </div>
    );
  };

  const renderOperatorBody = (field: FilterFieldDefinition<T>) => {
    const query = childSearch.trim().toLocaleLowerCase();
    const operators = field.operators.filter((operator) =>
      FILTER_OPERATOR_LABELS[operator].toLocaleLowerCase().includes(query)
    );
    return (
      <>
        <SearchRow
          ref={childInputRef}
          label={activeClause ? filterOperatorLabel(activeClause.operator, activeClause.values.length) : 'Operator'}
          value={childSearch}
          onChange={(value) => {
            setChildSearch(value);
            setChildHighlightedIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              const direction = event.key === 'ArrowDown' ? 1 : -1;
              setChildHighlightedIndex((index) =>
                (index + direction + Math.max(operators.length, 1)) % Math.max(operators.length, 1)
              );
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              const operator = operators[childHighlightedIndex];
              if (operator && activeClause) {
                onChange(upsertFilterClause(clauses, { ...activeClause, operator }));
                onClose();
              }
            }
          }}
        />
        <div role="listbox" aria-label={`${field.label} operators`} style={{ padding: '6px 0' }}>
          {operators.map((operator, index) => (
            <MenuOption
              key={operator}
              label={filterOperatorLabel(operator, activeClause?.values.length ?? 0)}
              selected={activeClause?.operator === operator}
              highlighted={childHighlightedIndex === index}
              onMouseEnter={() => setChildHighlightedIndex(index)}
              onClick={() => {
                if (activeClause) onChange(upsertFilterClause(clauses, { ...activeClause, operator }));
                onClose();
              }}
            />
          ))}
        </div>
      </>
    );
  };

  const menuMotion = isClosing ? 'exit' : 'enter';

  const renderRoot = () => (
    <MenuSurface
      ref={rootRef}
      position={rootPosition}
      width={ROOT_WIDTH}
      label="Add filter"
      motion={menuMotion}
      transformOrigin={transformOrigin}
    >
      <SearchRow
        ref={rootInputRef}
        label={rootPlaceholder}
        value={rootSearch}
        onChange={(value) => {
          setRootSearch(value);
          setHighlightedIndex(0);
          setActiveFieldId(null);
        }}
        onKeyDown={handleRootKeyDown}
        shortcut="F"
      />
      <div
        role="listbox"
        aria-label="Filter properties"
        onPointerMove={handleRootPointerMove}
        style={{ maxHeight: 'calc(100vh - 100px)', overflowY: 'auto', padding: `${LIST_PADDING}px 0` }}
      >
        {rootEntries.length === 0 ? (
          <div style={{ padding: '18px 14px', color: MENU_MUTED, textAlign: 'center' }}>No filters found</div>
        ) : (
          rootEntries.map((entry, index) => {
            const previousSection = rootEntries[index - 1]?.field.section;
            const showSeparator = !rootSearch && index > 0 && previousSection !== entry.field.section;
            const clause = clauses.find((candidate) => candidate.fieldId === entry.field.id);
            const isValueSelected =
              entry.kind === 'value' && entry.option
                ? clause?.values.map(String).includes(entry.option.value)
                : false;
            const isOpenField = entry.kind === 'field' && activeFieldId === entry.field.id;
            return (
              <React.Fragment key={entry.key}>
                {showSeparator && <SectionSeparator />}
                <div data-filter-root-option="true" data-index={index}>
                  <MenuOption
                    label={entry.kind === 'value' && entry.option ? entry.option.label : entry.field.label}
                    highlighted={highlightedIndex === index || isOpenField}
                    selected={isValueSelected}
                    expanded={entry.kind === 'field' ? isOpenField : undefined}
                    onClick={(event) => {
                      setHighlightedIndex(index);
                      activateRootEntry(entry, event.currentTarget);
                    }}
                    icon={
                      <FilterFieldIcon
                        fieldId={entry.field.id}
                        type={entry.field.type as FilterFieldDefinition<unknown>['type']}
                      />
                    }
                    meta={
                      entry.kind === 'value' && entry.option ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span>{entry.field.label}</span>
                          {entry.option.count !== undefined && <span>{entry.option.count}</span>}
                        </span>
                      ) : (
                        <SubmenuArrow />
                      )
                    }
                  />
                </div>
              </React.Fragment>
            );
          })
        )}
      </div>
    </MenuSurface>
  );

  const childBody = activeField
    ? shownMode === 'operator'
      ? renderOperatorBody(activeField)
      : renderValueBody(activeField)
    : null;
  const isSubmenu = shownMode === 'root';

  return createPortal(
    <>
      {isSubmenu && renderRoot()}
      {/* A submenu vanishes at once when the menu closes; a menu opened from a chip fades like any other. */}
      {activeField && childBody && !(isSubmenu && isClosing) && (
        <MenuSurface
          ref={childRef}
          position={isSubmenu ? childPosition : rootPosition}
          width={isSubmenu ? 'content' : childWidth}
          minWidth={isSubmenu ? (childHasSearch ? CHILD_WIDTH : 175) : undefined}
          label={shownMode === 'operator' ? `${activeField.label} operator` : `${activeField.label} values`}
          strongShadow
          motion={isSubmenu ? 'none' : menuMotion}
          transformOrigin={isSubmenu ? undefined : transformOrigin}
        >
          {childBody}
        </MenuSurface>
      )}
    </>,
    document.body
  );
};

interface FilterButtonProps {
  active: boolean;
  open: boolean;
  onMouseDown?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export const LinearFilterButton = React.forwardRef<HTMLButtonElement, FilterButtonProps>(
  ({ active, open, onMouseDown, onPointerDown, onClick }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={active ? 'Add another filter' : 'Add filter'}
      aria-haspopup="dialog"
      aria-expanded={open}
      onPointerDown={onPointerDown}
      onMouseDown={onMouseDown}
      onClick={onClick}
      className={`linear-header-target group relative flex h-[28px] w-[28px] items-center justify-center rounded-full border transition-[border-color,background-color,color,opacity,fill,stroke] duration-150 ease-[ease] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#8b8df8] ${
        open || active
          ? 'border-transparent bg-[var(--filter-trigger-active-bg)] text-[var(--text-primary)]'
          : 'border-transparent bg-[var(--filter-trigger-bg)] text-[var(--text-tertiary)] hover:bg-[var(--filter-trigger-active-bg)] hover:text-[var(--text-primary)]'
      }`}
    >
      <LinearFilterIcon size={14} />
    </button>
  )
);
LinearFilterButton.displayName = 'LinearFilterButton';

interface ActiveFilterFormulaProps<T> {
  fields: FilterFieldDefinition<T>[];
  clauses: FilterClause[];
  onChange: (clauses: FilterClause[]) => void;
  onOpenMenu: (mode: FilterMenuMode, anchor: HTMLElement, fieldId?: string) => void;
}

export const ActiveFilterFormula = <T,>({
  fields,
  clauses,
  onChange,
  onOpenMenu,
}: ActiveFilterFormulaProps<T>) => {
  if (clauses.length === 0) return null;
  const fieldsById = new Map(fields.map((field) => [field.id, field]));

  return (
    <div
      aria-label="Active filters"
      style={{
        display: 'flex',
        minHeight: 44,
        margin: '0 8px 4px',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 8,
        backgroundColor: 'var(--item-hover-bg)',
      }}
    >
      <div style={{ display: 'flex', minWidth: 0, flex: 1, alignItems: 'center', gap: 7, overflowX: 'auto' }}>
        {clauses.map((clause) => {
          const field = fieldsById.get(clause.fieldId);
          if (!field) return null;
          return (
            <div
              key={clause.fieldId}
              style={{
                display: 'inline-flex',
                height: 22,
                flexShrink: 0,
                alignItems: 'center',
                overflow: 'hidden',
                border: '1px solid var(--color-border-secondary)',
                borderRadius: 7.5,
                backgroundColor: 'var(--card-bg)',
                fontSize: 12,
              }}
            >
              <span style={{ display: 'inline-flex', height: 22, alignItems: 'center', gap: 5, padding: '0 6px', color: 'var(--text-primary)' }}>
                <FilterFieldIcon
                  fieldId={field.id}
                  type={field.type as FilterFieldDefinition<unknown>['type']}
                />
                {field.label}
              </span>
              <button
                type="button"
                onClick={(event) => onOpenMenu('operator', event.currentTarget, field.id)}
                style={{ height: 22, padding: '0 6px', border: 0, borderLeft: '1px solid var(--color-border-secondary)', background: 'transparent', color: MENU_MUTED, font: 'inherit', cursor: 'pointer' }}
              >
                {filterOperatorLabel(clause.operator, clause.values.length)}
              </button>
              <button
                type="button"
                aria-label={getFilterValueAccessibleName(field, clause)}
                onClick={(event) => onOpenMenu('value', event.currentTarget, field.id)}
                style={{ height: 22, maxWidth: 180, padding: '0 6px', overflow: 'hidden', border: 0, borderLeft: '1px solid var(--color-border-secondary)', background: 'transparent', color: 'var(--text-primary)', font: 'inherit', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
              >
                {getFilterValueSummary(field, clause)}
              </button>
              <button
                type="button"
                aria-label={`Remove ${field.label} filter`}
                onClick={() => onChange(removeFilterClause(clauses, field.id))}
                style={{ display: 'inline-flex', width: 24, height: 22, alignItems: 'center', justifyContent: 'center', padding: 0, border: 0, borderLeft: '1px solid var(--color-border-secondary)', background: 'transparent', color: MENU_MUTED, cursor: 'pointer' }}
              >
                <X size={12} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          aria-label="Add another filter"
          onClick={(event) => onOpenMenu('root', event.currentTarget)}
          style={{ display: 'inline-flex', width: 24, height: 24, flexShrink: 0, alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 9999, background: 'transparent', color: MENU_MUTED, cursor: 'pointer' }}
          className="hover:bg-[var(--item-active-bg)] hover:text-[var(--text-primary)]"
        >
          <Plus size={13} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        aria-label="Clear all filters"
        onClick={() => onChange([])}
        style={{ height: 24, flexShrink: 0, padding: '0 8px', border: '1px solid transparent', borderRadius: 9999, background: 'transparent', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer' }}
        className="hover:bg-[var(--item-active-bg)]"
      >
        Clear
      </button>
    </div>
  );
};

export const FilteredEmptyState: React.FC<{
  noun: string;
  hiddenCount: number;
  onClear: () => void;
}> = ({ noun, hiddenCount, onClear }) => (
  <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 text-center">
    <CircleDashed size={22} strokeWidth={1.5} className="text-[var(--text-tertiary)]" aria-hidden="true" />
    <div className="text-[13px] font-medium text-[var(--text-primary)]">No {noun} matching the filters</div>
    <div className="text-[12px] text-[var(--text-tertiary)]">{hiddenCount} hidden by filters</div>
    <button
      type="button"
      onClick={onClear}
      className="h-7 rounded-full px-3 text-[12px] text-[var(--text-primary)] hover:bg-[var(--item-hover-bg)]"
    >
      Clear Filters
    </button>
  </div>
);
