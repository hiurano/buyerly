import React from 'react';
import { Plus, X } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { FilterOptionAvatarImage, type FilterMenuMode } from '@/components/filters/BuyerlyFilter';
import {
  filterOperatorLabel,
  getFilterValueAccessibleName,
  getFilterValueSummary,
  removeFilterClause,
  type FilterClause,
  type FilterFieldDefinition,
} from '@/components/filters/filterModel';
import { colors } from '@/styles/tokens.stylex';

interface InboxFilterBarProps {
  fields: FilterFieldDefinition<unknown>[];
  clauses: FilterClause[];
  onChange: (clauses: FilterClause[]) => void;
  onOpenMenu: (mode: FilterMenuMode, anchor: HTMLElement, fieldId?: string) => void;
}

const truncate = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

const styles = stylex.create({
  avatar: {
    marginRight: 4,
    display: 'inline-flex',
    flexShrink: 0,
  },
  // Segments 1px apart on the border colour, as Linear's chip.
  chip: {
    display: 'flex',
    height: 24,
    maxWidth: '100%',
    alignItems: 'center',
    gap: 1,
    overflow: 'hidden',
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-tertiary'],
    backgroundColor: colors['--color-border-tertiary'],
    fontSize: 12,
    lineHeight: '18px',
  },
  segment: {
    display: 'flex',
    height: 22,
    alignItems: 'center',
    paddingLeft: 6,
    paddingRight: 6,
    backgroundColor: colors['--inbox-filter-chip-bg'],
    outline: '2px solid transparent',
    outlineOffset: 2,
  },
  // The property and the values give way first.
  segmentText: {
    minWidth: 0,
    flexShrink: 1,
    ...truncate,
    color: colors['--text-secondary'],
  },
  segmentFixed: {
    flexShrink: 0,
  },
  operator: {
    color: colors['--text-tertiary'],
  },
  operatorButton: {
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
    },
  },
  valueButton: {
    color: {
      default: colors['--text-secondary'],
      ':hover': colors['--text-primary'],
    },
  },
  remove: {
    width: 24,
    justifyContent: 'center',
    color: {
      default: colors['--text-secondary'],
      ':hover': colors['--text-primary'],
    },
  },
  truncate,
  bar: {
    marginLeft: 8,
    marginRight: 8,
    marginTop: 8,
    display: 'flex',
    flexShrink: 0,
    flexDirection: 'column',
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-primary'],
    backgroundColor: colors['--inbox-filter-bg'],
    paddingTop: 10,
    paddingRight: 10,
    paddingBottom: 10,
    paddingLeft: 10,
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  add: {
    display: 'flex',
    height: 24,
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    color: {
      default: colors['--text-secondary'],
      ':hover': colors['--text-primary'],
    },
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
  },
  footer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    paddingTop: 20,
    paddingRight: 24,
    paddingBottom: 16,
    paddingLeft: 24,
    textAlign: 'center',
    fontSize: 12,
  },
  hidden: {
    color: colors['--text-tertiary'],
  },
  hiddenCount: {
    fontWeight: 500,
    color: colors['--text-secondary'],
  },
  clear: {
    display: 'flex',
    height: 24,
    alignItems: 'center',
    gap: 6,
    whiteSpace: 'nowrap',
    borderRadius: 9999,
    paddingLeft: 8,
    paddingRight: 8,
    fontWeight: 500,
    color: {
      default: colors['--text-secondary'],
      ':hover': colors['--text-primary'],
    },
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
  },
});

interface InboxFilterChipProps {
  field: FilterFieldDefinition<unknown>;
  clause: FilterClause;
  /** Without it the chip only shows the condition, as in a saved custom filter. */
  onOpenMenu?: (mode: FilterMenuMode, anchor: HTMLElement, fieldId?: string) => void;
  onRemove?: () => void;
}

/** Linear's chip shows the one chosen person's 14px avatar 4px before the name. */
function valueAvatar(field: FilterFieldDefinition<unknown>, clause: FilterClause) {
  if (clause.values.length !== 1) return null;
  const option = field.options?.find((entry) => entry.value === String(clause.values[0]));
  return option?.avatar ? (
    <span {...stylex.props(styles.avatar)}>
      <FilterOptionAvatarImage avatar={option.avatar} label={option.label} size={14} />
    </span>
  ) : null;
}

/** One Linear filter chip: property, operator, values and remove. */
export const InboxFilterChip: React.FC<InboxFilterChipProps> = ({ field, clause, onOpenMenu, onRemove }) => (
  <div {...stylex.props(styles.chip)}>
    <span {...stylex.props(styles.segment, styles.segmentText)}>{field.label}</span>
    {onOpenMenu ? (
      <>
        <button
          type="button"
          onClick={(event) => onOpenMenu('operator', event.currentTarget, field.id)}
          {...stylex.props(styles.segment, styles.segmentFixed, styles.operatorButton)}
        >
          {filterOperatorLabel(clause.operator, clause.values.length)}
        </button>
        <button
          type="button"
          aria-label={getFilterValueAccessibleName(field, clause)}
          onClick={(event) => onOpenMenu('value', event.currentTarget, field.id)}
          {...stylex.props(styles.segment, styles.segmentText, styles.valueButton)}
        >
          {valueAvatar(field, clause)}
          <span {...stylex.props(styles.truncate)}>{getFilterValueSummary(field, clause)}</span>
        </button>
      </>
    ) : (
      <>
        <span {...stylex.props(styles.segment, styles.segmentFixed, styles.operator)}>
          {filterOperatorLabel(clause.operator, clause.values.length)}
        </span>
        <span {...stylex.props(styles.segment, styles.segmentText)}>
          {valueAvatar(field, clause)}
          <span {...stylex.props(styles.truncate)}>{getFilterValueSummary(field, clause)}</span>
        </span>
      </>
    )}
    {onRemove && (
      <button
        type="button"
        aria-label="Remove filter"
        onClick={onRemove}
        {...stylex.props(styles.segment, styles.segmentFixed, styles.remove)}
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
      {...stylex.props(styles.bar)}
    >
      <div {...stylex.props(styles.chips)}>
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
        {...stylex.props(styles.add)}
      >
        <Plus size={14} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  );
};

/** Under the list, as in Linear: how many the filters hide, and a way out. */
export const InboxFilterFooter: React.FC<{ hiddenCount: number; onClear: () => void }> = ({ hiddenCount, onClear }) => (
  <div {...stylex.props(styles.footer)}>
    {hiddenCount > 0 && (
      <p {...stylex.props(styles.hidden)}>
        <span {...stylex.props(styles.hiddenCount)}>
          {hiddenCount} {hiddenCount === 1 ? 'notification' : 'notifications'}
        </span>{' '}
        hidden by filters
      </p>
    )}
    <button
      type="button"
      onClick={onClear}
      {...stylex.props(styles.clear)}
    >
      Clear Filters
      <X size={12} strokeWidth={1.8} aria-hidden="true" />
    </button>
  </div>
);
