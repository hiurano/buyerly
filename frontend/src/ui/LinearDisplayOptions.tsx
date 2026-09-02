import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LinearBoardIcon, LinearListIcon } from '@/icons/LinearIcons';

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

const LinearSelect: React.FC<LinearSelectProps> = ({ value, options, onChange, onOpenChange }) => {
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
  properties: Record<string, string>;
  enabledProperties: Record<string, boolean>;
  onToggleProperty: (value: string) => void;
  showEmptyGroups?: boolean;
  onShowEmptyGroupsChange?: (value: boolean) => void;
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
  properties,
  enabledProperties,
  onToggleProperty,
  showEmptyGroups,
  onShowEmptyGroupsChange,
}) => {
  const groupingLabel = viewMode === 'board' ? 'Columns' : 'Grouping';
  const subGroupingLabel = viewMode === 'board' ? 'Rows' : 'Sub-grouping';
  const optionsLabel = viewMode === 'board' ? 'Board options' : 'List options';
  const showEmptyLabel = viewMode === 'board' ? 'Show empty columns' : 'Show empty groups';

  return (
    <>
      <section className="linear-display-main-section">
        <div role="tablist" className="linear-display-tabs">
          {(['list', 'board'] as const).map((mode) => (
            <div className="linear-display-tab-slot" key={mode}>
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
            </div>
          ))}
        </div>

        <div className="linear-display-row">
          <span>{groupingLabel}</span>
          <div className="linear-display-row-controls">
            <LinearSelect value={grouping} options={groupingOptions} onChange={onGroupingChange} />
            <button type="button" className="linear-display-order-button" aria-label="Group ordering">
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path fill="currentColor" d="M3 3.75h7.8L9.35 2.3l.9-.9 3 3-3 3-.9-.9 1.45-1.45H3v-1.3Zm10 7.2H5.2l1.45-1.45-.9-.9-3 3 3 3 .9-.9-1.45-1.45H13v-1.3Z" />
              </svg>
            </button>
          </div>
        </div>

        {subGrouping !== undefined && subGroupingOptions && onSubGroupingChange && (
          <div className="linear-display-row">
            <span>{subGroupingLabel}</span>
            <LinearSelect value={subGrouping} options={subGroupingOptions} onChange={onSubGroupingChange} />
          </div>
        )}

        <div className="linear-display-row">
          <span>Ordering</span>
          <LinearSelect value={ordering} options={orderingOptions} onChange={onOrderingChange} />
        </div>
      </section>

      <section className="linear-display-options-section">
        <div className="linear-display-section-title">{optionsLabel}</div>
        {showEmptyGroups !== undefined && onShowEmptyGroupsChange && (
          <div className="linear-display-row">
            <span>{showEmptyLabel}</span>
            <button
              type="button"
              role="switch"
              aria-checked={showEmptyGroups}
              className="linear-display-switch"
              onClick={() => onShowEmptyGroupsChange(!showEmptyGroups)}
            >
              <span />
            </button>
          </div>
        )}
        <div className="linear-display-properties-label">Display properties</div>
        <div className="linear-display-properties">
          {Object.entries(properties).map(([key, label]) => (
            <button
              type="button"
              key={key}
              aria-pressed={!!enabledProperties[key]}
              className="linear-display-property"
              onClick={() => onToggleProperty(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>
    </>
  );
};
