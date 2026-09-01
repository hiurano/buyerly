import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays,
  Check,
  ChevronRight,
  CircleDashed,
  Gauge,
  Hash,
  Layers3,
  Plus,
  Type,
  X,
} from 'lucide-react';
import {
  LinearBacklogDashedIcon,
  LinearBoltIcon,
  LinearFilterIcon,
} from '@/icons/LinearIcons';
import {
  FILTER_OPERATOR_LABELS,
  FilterClause,
  FilterFieldDefinition,
  FilterOption,
  getFilterValueAccessibleName,
  getFilterValueSummary,
  removeFilterClause,
  upsertFilterClause,
} from './filterModel';

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

const getChildPosition = (
  rowRect: DOMRect,
  rootPosition: MenuPosition,
  estimatedHeight: number
): MenuPosition => {
  const roomOnLeft = rootPosition.left + CHILD_OVERLAP - VIEWPORT_GAP;
  const preferredLeft =
    roomOnLeft >= CHILD_WIDTH
      ? rootPosition.left - CHILD_WIDTH + CHILD_OVERLAP
      : rootPosition.left + ROOT_WIDTH - CHILD_OVERLAP;

  return {
    left: clamp(preferredLeft, VIEWPORT_GAP, window.innerWidth - CHILD_WIDTH - VIEWPORT_GAP),
    top: clamp(rowRect.top - 44, VIEWPORT_GAP, window.innerHeight - estimatedHeight - VIEWPORT_GAP),
  };
};

const FilterFieldIcon: React.FC<{ fieldId: string; type: FilterFieldDefinition<unknown>['type'] }> = ({
  fieldId,
  type,
}) => {
  const props = { size: 15, strokeWidth: 1.8, 'aria-hidden': true } as const;
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
  React.PropsWithChildren<{ position: MenuPosition; width: number; label: string; strongShadow?: boolean }>
>(({ position, width, label, strongShadow = false, children }, ref) => (
  <div
    ref={ref}
    role="dialog"
    aria-label={label}
    style={{
      position: 'fixed',
      left: position.left,
      top: position.top,
      width,
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
      animation: 'linearPopoverScale 120ms cubic-bezier(0.16, 1, 0.3, 1)',
      transformOrigin: 'top right',
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

const MenuOption: React.FC<{
  label: string;
  icon?: React.ReactNode;
  meta?: React.ReactNode;
  highlighted: boolean;
  selected?: boolean;
  multiSelect?: boolean;
  onMouseEnter: () => void;
  onClick: (event: React.MouseEvent<HTMLDivElement>) => void;
}> = ({ label, icon, meta, highlighted, selected, multiSelect, onMouseEnter, onClick }) => (
  <div
    role="option"
    aria-selected={selected}
    onMouseEnter={onMouseEnter}
    onClick={onClick}
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
    <span style={{ minWidth: 0, flex: 1, paddingLeft: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', zIndex: 1 }}>
      {label}
    </span>
    {meta && (
      <span style={{ flexShrink: 0, color: MENU_MUTED, fontSize: 12, zIndex: 1 }}>
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
}: FilterMenuProps<T>) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const childRef = useRef<HTMLDivElement>(null);
  const rootInputRef = useRef<HTMLInputElement>(null);
  const childInputRef = useRef<HTMLInputElement>(null);
  const [rootPosition, setRootPosition] = useState<MenuPosition>({ left: 0, top: 0 });
  const [childPosition, setChildPosition] = useState<MenuPosition>({ left: 0, top: 0 });
  const [rootSearch, setRootSearch] = useState('');
  const [childSearch, setChildSearch] = useState('');
  const [activeFieldId, setActiveFieldId] = useState<string | null>(fieldId ?? null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [childHighlightedIndex, setChildHighlightedIndex] = useState(0);
  const [editorValue, setEditorValue] = useState('');

  const activeField = fields.find((field) => field.id === activeFieldId) ?? null;
  const activeClause = activeField
    ? clauses.find((clause) => clause.fieldId === activeField.id)
    : undefined;

  useEffect(() => {
    if (!isOpen || !anchorElement) return;
    const width = mode === 'root' ? ROOT_WIDTH : CHILD_WIDTH;

    const updatePosition = () => setRootPosition(getAnchorPosition(anchorElement, width));
    updatePosition();
    setRootSearch('');
    setChildSearch('');
    setHighlightedIndex(0);
    setChildHighlightedIndex(0);
    setActiveFieldId(fieldId ?? null);
    setEditorValue('');

    const focusTimer = window.setTimeout(() => {
      if (mode === 'root') rootInputRef.current?.focus();
      else childInputRef.current?.focus();
    }, 20);

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, anchorElement, fieldId, mode]);

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

  if (!isOpen || !anchorElement) return null;

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

  const openField = (field: FilterFieldDefinition<T>, row: HTMLElement) => {
    setActiveFieldId(field.id);
    setChildSearch('');
    setChildHighlightedIndex(0);
    setEditorValue(String(clauses.find((clause) => clause.fieldId === field.id)?.values[0] ?? ''));
    const optionCount = field.options?.length ?? 2;
    const estimatedHeight = Math.min(340, 50 + optionCount * 32);
    setChildPosition(getChildPosition(row.getBoundingClientRect(), rootPosition, estimatedHeight));
    window.setTimeout(() => childInputRef.current?.focus(), 20);
  };

  const activateRootEntry = (entry: RootEntry<T>, row?: HTMLElement) => {
    if (entry.kind === 'value' && entry.option) {
      applyOption(entry.field, entry.option);
      return;
    }
    if (row) openField(entry.field, row);
  };

  const handleRootKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setHighlightedIndex((index) =>
        (index + direction + Math.max(rootEntries.length, 1)) % Math.max(rootEntries.length, 1)
      );
      return;
    }
    if (event.key === 'Enter' || event.key === 'ArrowRight') {
      event.preventDefault();
      const entry = rootEntries[highlightedIndex];
      const row = rootRef.current?.querySelectorAll<HTMLElement>('[data-filter-root-option]')[highlightedIndex];
      if (entry) activateRootEntry(entry, row);
    }
  };

  const closeChild = () => {
    if (mode === 'root') {
      setActiveFieldId(null);
      rootInputRef.current?.focus();
    } else {
      onClose();
    }
  };

  const handleChildKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' || event.key === 'ArrowLeft') {
      event.preventDefault();
      closeChild();
      return;
    }
    if (event.key === 'Backspace' && childSearch === '' && mode === 'root') {
      event.preventDefault();
      closeChild();
      return;
    }
    if (activeField?.type === 'enum') {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        setChildHighlightedIndex((index) =>
          (index + direction + Math.max(childOptions.length, 1)) % Math.max(childOptions.length, 1)
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
          <SearchRow
            ref={childInputRef}
            label="Filter…"
            value={childSearch}
            onChange={(value) => {
              setChildSearch(value);
              setChildHighlightedIndex(0);
            }}
            onKeyDown={handleChildKeyDown}
          />
          <div role="listbox" aria-label={`${field.label} values`} style={{ maxHeight: 330, overflowY: 'auto', padding: '6px 0' }}>
            {childOptions.length === 0 ? (
              <div style={{ padding: '18px 14px', color: MENU_MUTED, textAlign: 'center' }}>No matching values</div>
            ) : (
              childOptions.map((option, index) => {
                const selected = currentValues.has(option.value);
                const showSeparator = index === selectedCount && selectedCount > 0 && selectedCount < childOptions.length;
                return (
                  <React.Fragment key={option.value}>
                    {showSeparator && <SectionSeparator />}
                    <MenuOption
                      label={option.label}
                      selected={selected}
                      multiSelect
                      highlighted={childHighlightedIndex === index}
                      onMouseEnter={() => setChildHighlightedIndex(index)}
                      onClick={() => applyOption(field, option)}
                      meta={
                        option.count === undefined
                          ? undefined
                          : `${option.count} ${option.count === 1 ? 'issue' : 'issues'}`
                      }
                    />
                  </React.Fragment>
                );
              })
            )}
          </div>
        </>
      );
    }

    return (
      <div style={{ padding: 10 }}>
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
            if (event.key === 'Escape' || event.key === 'ArrowLeft') closeChild();
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
          label={activeClause ? FILTER_OPERATOR_LABELS[activeClause.operator] : 'Operator'}
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
              label={FILTER_OPERATOR_LABELS[operator]}
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

  const renderRoot = () => (
    <MenuSurface ref={rootRef} position={rootPosition} width={ROOT_WIDTH} label="Add filter">
      <SearchRow
        ref={rootInputRef}
        label="Add Filter…"
        value={rootSearch}
        onChange={(value) => {
          setRootSearch(value);
          setHighlightedIndex(0);
        }}
        onKeyDown={handleRootKeyDown}
        shortcut="F"
      />
      <div role="listbox" aria-label="Filter properties" style={{ maxHeight: 'calc(100vh - 100px)', overflowY: 'auto', padding: '6px 0' }}>
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
            return (
              <React.Fragment key={entry.key}>
                {showSeparator && <SectionSeparator />}
                <div data-filter-root-option="true">
                  <MenuOption
                    label={entry.kind === 'value' && entry.option ? entry.option.label : entry.field.label}
                    highlighted={highlightedIndex === index || activeFieldId === entry.field.id}
                    selected={isValueSelected}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={(event) => activateRootEntry(entry, event.currentTarget)}
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
                        <ChevronRight size={12} strokeWidth={2} aria-hidden="true" />
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
    ? mode === 'operator'
      ? renderOperatorBody(activeField)
      : renderValueBody(activeField)
    : null;

  return createPortal(
    <>
      {mode === 'root' && renderRoot()}
      {activeField && childBody && (
        <MenuSurface
          ref={childRef}
          position={mode === 'root' ? childPosition : rootPosition}
          width={CHILD_WIDTH}
          label={mode === 'operator' ? `${activeField.label} operator` : `${activeField.label} values`}
          strongShadow
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
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export const LinearFilterButton = React.forwardRef<HTMLButtonElement, FilterButtonProps>(
  ({ active, open, onMouseDown, onClick }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={active ? 'Add another filter' : 'Add filter'}
      aria-haspopup="dialog"
      aria-expanded={open}
      onMouseDown={onMouseDown}
      onClick={onClick}
      className={`group relative flex h-[28px] w-[28px] items-center justify-center rounded-full border transition-all focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#8b8df8] ${
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
                {FILTER_OPERATOR_LABELS[clause.operator]}
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
