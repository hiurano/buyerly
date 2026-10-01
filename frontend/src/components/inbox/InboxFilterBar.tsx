import React from 'react';
import { Plus, X } from 'lucide-react';
import type { FilterMenuMode } from '@/components/filters/LinearFilter';
import {
  filterOperatorLabel,
  getFilterValueAccessibleName,
  getFilterValueSummary,
  removeFilterClause,
  type FilterClause,
  type FilterFieldDefinition,
} from '@/components/filters/filterModel';

interface InboxFilterBarProps {
  fields: FilterFieldDefinition<unknown>[];
  clauses: FilterClause[];
  onChange: (clauses: FilterClause[]) => void;
  onOpenMenu: (mode: FilterMenuMode, anchor: HTMLElement, fieldId?: string) => void;
}

const segment = 'flex h-[22px] items-center px-1.5 bg-[var(--inbox-filter-chip-bg)] outline-none';

interface InboxFilterChipProps {
  field: FilterFieldDefinition<unknown>;
  clause: FilterClause;
  /** Without it the chip only shows the condition, as in a saved custom filter. */
  onOpenMenu?: (mode: FilterMenuMode, anchor: HTMLElement, fieldId?: string) => void;
  onRemove?: () => void;
}

/** One Linear filter chip: property, operator, values and remove. */
export const InboxFilterChip: React.FC<InboxFilterChipProps> = ({ field, clause, onOpenMenu, onRemove }) => (
  <div className="flex h-6 max-w-full items-center gap-px overflow-hidden rounded-[8px] border border-[var(--color-border-tertiary)] bg-[var(--color-border-tertiary)] text-[12px] leading-[18px]">
    <span className={`${segment} min-w-0 shrink truncate text-[var(--text-secondary)]`}>{field.label}</span>
    {onOpenMenu ? (
      <>
        <button
          type="button"
          onClick={(event) => onOpenMenu('operator', event.currentTarget, field.id)}
          className={`${segment} shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]`}
        >
          {filterOperatorLabel(clause.operator, clause.values.length)}
        </button>
        <button
          type="button"
          aria-label={getFilterValueAccessibleName(field, clause)}
          onClick={(event) => onOpenMenu('value', event.currentTarget, field.id)}
          className={`${segment} min-w-0 shrink truncate text-[var(--text-secondary)] hover:text-[var(--text-primary)]`}
        >
          <span className="truncate">{getFilterValueSummary(field, clause)}</span>
        </button>
      </>
    ) : (
      <>
        <span className={`${segment} shrink-0 text-[var(--text-tertiary)]`}>
          {filterOperatorLabel(clause.operator, clause.values.length)}
        </span>
        <span className={`${segment} min-w-0 shrink truncate text-[var(--text-secondary)]`}>
          {getFilterValueSummary(field, clause)}
        </span>
      </>
    )}
    {onRemove && (
      <button
        type="button"
        aria-label="Remove filter"
        onClick={onRemove}
        className={`${segment} w-6 shrink-0 justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]`}
      >
        <X size={12} strokeWidth={1.8} aria-hidden="true" />
      </button>
    )}
  </div>
);

/**
 * Linear's Inbox filter box under the header: one chip per property
 * (name, operator, values, remove), wrapping, with "+" on its own line.
 */
export const InboxFilterBar: React.FC<InboxFilterBarProps> = ({ fields, clauses, onChange, onOpenMenu }) => {
  if (clauses.length === 0) return null;
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  return (
    <div
      aria-label="Active filters"
      className="mx-2 mt-2 flex shrink-0 flex-col gap-1 rounded-[8px] border border-[var(--color-border-primary)] bg-[var(--inbox-filter-bg)] p-2.5"
    >
      <div className="flex flex-wrap gap-1">
        {clauses.map((clause) => {
          const field = fieldsById.get(clause.fieldId);
          if (!field) return null;
          return (
            <InboxFilterChip
              key={clause.fieldId}
              field={field}
              clause={clause}
              onOpenMenu={onOpenMenu}
              onRemove={() => onChange(removeFilterClause(clauses, field.id))}
            />
          );
        })}
      </div>
      <button
        type="button"
        aria-label="Add another filter"
        onClick={(event) => onOpenMenu('root', event.currentTarget)}
        className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]"
      >
        <Plus size={14} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  );
};

/** Under the list, as in Linear: how many the filters hide, and a way out. */
export const InboxFilterFooter: React.FC<{ hiddenCount: number; onClear: () => void }> = ({ hiddenCount, onClear }) => (
  <div className="flex flex-col items-center gap-2 px-6 pb-4 pt-5 text-center text-[12px]">
    {hiddenCount > 0 && (
      <p className="text-[var(--text-tertiary)]">
        <span className="font-medium text-[var(--text-secondary)]">
          {hiddenCount} {hiddenCount === 1 ? 'notification' : 'notifications'}
        </span>{' '}
        hidden by filters
      </p>
    )}
    <button
      type="button"
      onClick={onClear}
      className="flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2 font-medium text-[var(--text-secondary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]"
    >
      Clear Filters
      <X size={12} strokeWidth={1.8} aria-hidden="true" />
    </button>
  </div>
);
