import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { BuyerlyDisclosureGlyph } from '@/icons/BuyerlyIcons';
import { colors } from '@/styles/tokens.stylex';
import { rowMarker } from '@/ui/markers.stylex';
import { withClassName } from '@/ui/withClassName';

export const BUYERLY_DATA_LIST = {
  toolbarHeight: 43.5,
  rowHeight: 44,
  rowHeightComfortable: 56,
  groupHeaderHeight: 36,
  radius: 8,
  rowGap: 2,
  rowPaddingX: 12,
  columnGap: 6,
  toolbarPaddingLeft: 8,
  toolbarPaddingRight: 11,
  viewportPaddingX: 8,
  viewportPaddingY: 4,
} as const;

export interface BuyerlyDataListColumn {
  id: string;
  label: string;
  width: string;
  align?: 'left' | 'right';
  sortable?: boolean;
  headerInset?: number;
}

export const getLinearDataListTemplate = (columns: BuyerlyDataListColumn[]) =>
  columns.map((column) => column.width).join(' ');

/**
 * The Name column every entity table starts with. Its header label is inset to
 * start on the same pixel as the row title, past the selection slot and, when
 * shown, the status toggle; the sortable header pill adds 6px of its own.
 */
export const buyerlyDataNameColumn = ({
  width,
  statusVisible = true,
  label = 'Name',
}: {
  width: string;
  statusVisible?: boolean;
  label?: string;
}): BuyerlyDataListColumn => ({
  id: 'name',
  label,
  width,
  headerInset: statusVisible ? 64 : 24,
  sortable: true,
});

/**
 * The narrowest width at which every column keeps its declared size. A
 * `minmax(Npx, …)` column counts as N; the viewport scrolls horizontally below it.
 */
export const getLinearDataListMinWidth = (columns: BuyerlyDataListColumn[]) => {
  const columnWidth = columns.reduce((total, column) => {
    const minimum = /^minmax\((\d+)px/.exec(column.width);
    return total + (minimum ? Number(minimum[1]) : Number.parseInt(column.width, 10) || 0);
  }, 0);
  return (
    columnWidth
    + Math.max(columns.length - 1, 0) * BUYERLY_DATA_LIST.columnGap
    + BUYERLY_DATA_LIST.rowPaddingX * 2
  );
};

/** The app's monospace stack. */
const MONO = '"Berkeley Mono", "JetBrains Mono", monospace';

const truncate = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

const colorTransition = {
  transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
  transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
  transitionDuration: '150ms',
} as const;

const styles = stylex.create({
  toolbar: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'space-between',
    height: BUYERLY_DATA_LIST.toolbarHeight,
    paddingLeft: BUYERLY_DATA_LIST.toolbarPaddingLeft,
    paddingRight: BUYERLY_DATA_LIST.toolbarPaddingRight,
    boxSizing: 'border-box',
  },
  viewport: {
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    overflowY: 'auto',
    overflowX: 'hidden',
    paddingTop: BUYERLY_DATA_LIST.viewportPaddingY,
    paddingBottom: BUYERLY_DATA_LIST.viewportPaddingY,
    paddingLeft: BUYERLY_DATA_LIST.viewportPaddingX,
    paddingRight: BUYERLY_DATA_LIST.viewportPaddingX,
  },
  viewportHorizontal: {
    overflowX: 'auto',
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: BUYERLY_DATA_LIST.rowGap,
  },
  groupRows: {
    paddingTop: 2,
    paddingBottom: 8,
  },
  // A sub-group's last row runs straight into the next sub-group, as Linear's; the group closes with the gap.
  subGroupRows: {
    paddingTop: 2,
  },
  row: {
    position: 'relative',
    display: 'flex',
    width: '100%',
    userSelect: 'none',
    alignItems: 'center',
    borderRadius: BUYERLY_DATA_LIST.radius,
    paddingLeft: BUYERLY_DATA_LIST.rowPaddingX,
    paddingRight: BUYERLY_DATA_LIST.rowPaddingX,
    backgroundColor: {
      default: 'transparent',
      ':hover': colors['--data-row-hover-bg'],
    },
    outlineStyle: {
      default: 'solid',
      ':focus-visible': 'solid',
    },
    outlineWidth: {
      default: 2,
      ':focus-visible': 1,
    },
    outlineColor: {
      default: 'transparent',
      ':focus-visible': colors['--focus-ring-color'],
    },
    outlineOffset: 2,
  },
  rowGrid: {
    display: 'grid',
    gap: BUYERLY_DATA_LIST.columnGap,
  },
  rowSelected: {
    backgroundColor: {
      default: colors['--row-selected-bg'],
      ':hover': colors['--row-selected-hover-bg'],
    },
  },
  columnHeader: {
    display: 'grid',
    height: 32,
    alignItems: 'center',
    fontSize: 12,
    fontWeight: 400,
    color: colors['--text-muted'],
    gap: BUYERLY_DATA_LIST.columnGap,
    paddingLeft: BUYERLY_DATA_LIST.rowPaddingX,
    paddingRight: BUYERLY_DATA_LIST.rowPaddingX,
  },
  columnCell: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    textAlign: 'left',
  },
  columnCellRight: {
    justifyContent: 'flex-end',
    textAlign: 'right',
  },
  sortButton: {
    display: 'inline-flex',
    height: 24,
    minWidth: 0,
    alignItems: 'center',
    gap: 4,
    borderRadius: 9999,
    paddingLeft: 6,
    paddingRight: 6,
    fontSize: 12,
    fontWeight: 450,
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-secondary'],
    },
    ...colorTransition,
  },
  sortButtonActive: {
    color: colors['--text-secondary'],
  },
  sortAscending: {
    transform: 'rotate(180deg)',
  },
  truncate,
  columnLabel: {
    ...truncate,
    fontSize: 12,
    fontWeight: 450,
    color: colors['--text-tertiary'],
  },
  // A plain label over figures ends where a sort pill's text does, 6px in.
  columnLabelRight: {
    paddingRight: 6,
  },
  groupHeader: {
    position: 'sticky',
    top: -4,
    zIndex: 2,
    display: 'flex',
    alignItems: 'center',
    height: BUYERLY_DATA_LIST.groupHeaderHeight,
    borderRadius: BUYERLY_DATA_LIST.radius,
    isolation: 'isolate',
  },
  subGroupHeader: {
    position: 'relative',
    top: null,
    zIndex: null,
  },
  groupHeaderBody: {
    display: 'flex',
    height: '100%',
    minWidth: 0,
    width: '100%',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  toggleSlot: {
    display: 'flex',
    height: 28,
    width: 28,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggle: {
    display: 'flex',
    height: 20,
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    color: colors['--text-tertiary'],
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
    ...colorTransition,
  },
  toggleIcon: {
    fill: 'currentColor',
    transform: 'rotate(90deg)',
    transitionProperty: 'transform',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    transitionDuration: '150ms',
  },
  toggleIconCollapsed: {
    transform: 'rotate(0deg)',
  },
  groupIcon: {
    display: 'flex',
    height: 16,
    width: 16,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    color: colors['--text-tertiary'],
  },
  groupDot: {
    height: 8,
    width: 8,
    borderRadius: 9999,
  },
  groupTitle: {
    ...truncate,
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  groupCount: {
    flexShrink: 0,
    fontFamily: MONO,
    fontSize: 11,
    color: colors['--text-muted'],
  },
  subGroupCount: {
    color: colors['--text-tertiary'],
  },
  groupDescription: {
    ...truncate,
    fontSize: 11,
    color: colors['--text-muted'],
  },
  spacer: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
  },
  subGroupLine: {
    height: 0.5,
    minWidth: 0,
    backgroundColor: colors['--list-subgroup-line'],
  },
  // Linear's group "+": always shown, a 24px round button with a 14px icon, 8px from the edge (2026-10-24).
  groupAction: {
    display: 'flex',
    height: 24,
    width: 24,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: 'transparent',
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
    color: {
      default: colors['--sidebar-item-fg'],
      ':hover': colors['--text-primary'],
    },
    ...colorTransition,
  },
  primaryCell: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 12,
  },
  primaryCellSticky: {
    position: 'sticky',
    left: 0,
    zIndex: 1,
    ...colorTransition,
  },
  primaryText: {
    display: 'flex',
    minWidth: 0,
    flexDirection: 'column',
  },
  primaryLine: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 8,
  },
  primaryTitle: {
    ...truncate,
    minWidth: 0,
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  primaryTitleDimmed: {
    color: colors['--text-tertiary'],
  },
  // Linear sits a figure in a 6px-padded pill: it ends under its header label and 12px from the next column.
  metric: {
    minWidth: 0,
    paddingRight: 6,
    textAlign: 'right',
  },
  metricValue: {
    ...truncate,
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 450,
    color: colors['--text-secondary'],
  },
  metricValueEmphasis: {
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  // The caller's valueClassName sets the weight and colour.
  metricValueCustom: {
    fontWeight: null,
    color: null,
  },
  metricSuffix: {
    marginLeft: 4,
    color: colors['--text-muted'],
  },
  metricCaption: {
    marginTop: 2,
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    fontSize: 11,
    lineHeight: '16px',
    color: colors['--text-muted'],
    fontVariantNumeric: 'tabular-nums',
  },
});

export const BuyerlyDataListToolbar: React.FC<React.PropsWithChildren<{ className?: string; xstyle?: stylex.StyleXStyles }>> = ({
  children,
  className = '',
  xstyle,
}) => (
  <div {...withClassName(stylex.props(styles.toolbar, xstyle), className)}>
    {children}
  </div>
);

export const BuyerlyDataListViewport: React.FC<
  React.PropsWithChildren<{
    className?: string;
    horizontal?: boolean;
  }>
> = ({ children, className = '', horizontal = false }) => (
  <div {...withClassName(stylex.props(styles.viewport, horizontal && styles.viewportHorizontal), className)}>
    {children}
  </div>
);

export const BuyerlyDataListStack: React.FC<React.PropsWithChildren<{ className?: string; xstyle?: stylex.StyleXStyles }>> = ({
  children,
  className = '',
  xstyle,
}) => (
  <div {...withClassName(stylex.props(styles.stack, xstyle), className)}>
    {children}
  </div>
);

interface BuyerlyDataListRowProps extends React.HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  height?: number;
  layout?: 'flex' | 'grid';
  columns?: BuyerlyDataListColumn[];
  /** Styles from the parent, applied last. */
  xstyle?: stylex.StyleXStyles;
}

export const BuyerlyDataListRow = React.forwardRef<HTMLDivElement, BuyerlyDataListRowProps>(
  ({ selected = false, height = BUYERLY_DATA_LIST.rowHeight, layout = 'flex', columns, className = '', xstyle, style, children, ...props }, ref) => (
    <div
      ref={ref}
      role="row"
      data-selected={selected ? 'true' : 'false'}
      aria-selected={selected}
      {...withClassName(
        stylex.props(styles.row, layout === 'grid' && styles.rowGrid, selected && styles.rowSelected, rowMarker, xstyle),
        `buyerly-data-row ${className}`.trim(),
      )}
      style={{
        minHeight: `${height}px`,
        gridTemplateColumns: columns ? getLinearDataListTemplate(columns) : undefined,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  )
);
BuyerlyDataListRow.displayName = 'BuyerlyDataListRow';

interface BuyerlyDataListColumnHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  columns: BuyerlyDataListColumn[];
  minWidth?: number;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (columnId: string) => void;
}

export const BuyerlyDataListColumnHeader: React.FC<BuyerlyDataListColumnHeaderProps> = ({
  columns,
  minWidth,
  sortKey,
  sortDirection = 'desc',
  onSort,
  className = '',
  style,
  ...props
}) => (
  <div
    role="row"
    {...withClassName(stylex.props(styles.columnHeader), className)}
    style={{
      gridTemplateColumns: getLinearDataListTemplate(columns),
      minWidth: minWidth ? `${minWidth}px` : undefined,
      ...style,
    }}
    {...props}
  >
    {columns.map((column) => {
      const isActive = sortKey === column.id;
      return (
        <div
          key={column.id}
          role="columnheader"
          aria-sort={isActive ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined}
          {...stylex.props(styles.columnCell, column.align === 'right' && styles.columnCellRight)}
          style={{ paddingLeft: column.headerInset ? `${column.headerInset}px` : undefined }}
        >
          {column.sortable && onSort ? (
            <button
              type="button"
              aria-label={`Order by ${column.label}`}
              onClick={() => onSort(column.id)}
              {...stylex.props(styles.sortButton, isActive && styles.sortButtonActive)}
            >
              <span {...stylex.props(styles.truncate)}>{column.label}</span>
              {isActive && (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  {...stylex.props(sortDirection === 'asc' && styles.sortAscending)}
                >
                  <path d="M2.5 3.75 5 6.25l2.5-2.5" />
                </svg>
              )}
            </button>
          ) : (
            <span {...stylex.props(styles.columnLabel, column.align === 'right' && styles.columnLabelRight)}>{column.label}</span>
          )}
        </div>
      );
    })}
  </div>
);

interface BuyerlyDataListGroupHeaderProps {
  title: string;
  count: number;
  dotColor?: string;
  /** In place of the dot, e.g. Ad accounts' icon on an account's group, as Linear's project groups. */
  icon?: React.ReactNode;
  description?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  /** A label's color, washed into the header from the left as Linear does for label groups. */
  tint?: string;
  /**
   * Linear's sub-group inside a group: same row, but on the list's own
   * background, not sticky, with a hairline running to the right edge.
   */
  subGroup?: boolean;
}

const GROUP_HEADER_BG = 'var(--rules-group-bg, var(--card-bg))';

export const BuyerlyDataListGroupHeader: React.FC<BuyerlyDataListGroupHeaderProps> = ({
  title,
  count,
  dotColor = 'rgb(148, 163, 184)',
  icon,
  description,
  isCollapsed = false,
  onToggleCollapse,
  actionLabel = 'Create item in group',
  onAction,
  className = '',
  tint,
  subGroup = false,
}) => (
  <div
    {...withClassName(
      stylex.props(styles.groupHeader, subGroup && styles.subGroupHeader),
      `buyerly-data-group-header${subGroup ? ' buyerly-data-subgroup-header' : ''} ${className}`.trim(),
    )}
    style={{
      background: subGroup
        ? undefined
        : tint
          ? `linear-gradient(90deg, color-mix(in srgb, ${tint} 8%, ${GROUP_HEADER_BG}) 0%, ${GROUP_HEADER_BG} 100%)`
          : GROUP_HEADER_BG,
    }}
  >
    <div {...stylex.props(styles.groupHeaderBody)}>
      <div {...stylex.props(styles.toggleSlot)}>
        {onToggleCollapse && (
          <button
            type="button"
            aria-label={isCollapsed ? 'Expand group' : 'Collapse group'}
            aria-expanded={!isCollapsed}
            onClick={onToggleCollapse}
            {...stylex.props(styles.toggle)}
          >
            <BuyerlyDisclosureGlyph {...stylex.props(styles.toggleIcon, isCollapsed && styles.toggleIconCollapsed)} />
          </button>
        )}
      </div>

      <span {...stylex.props(styles.groupIcon)} aria-hidden="true">
        {icon ?? <span {...stylex.props(styles.groupDot)} style={{ backgroundColor: dotColor }} />}
      </span>

      <span {...withClassName(stylex.props(styles.groupTitle), 'buyerly-data-group-title')}>{title}</span>
      <span {...stylex.props(styles.groupCount, subGroup && styles.subGroupCount)}>{count}</span>
      {description && <span {...stylex.props(styles.groupDescription)}>{description}</span>}
      {subGroup
        ? <span {...stylex.props(styles.spacer, styles.subGroupLine)} aria-hidden="true" />
        : <span {...stylex.props(styles.spacer)} />}

      {onAction && (
        <button
          type="button"
          aria-label={actionLabel}
          onClick={(event) => {
            event.stopPropagation();
            onAction();
          }}
          {...stylex.props(styles.groupAction)}
        >
          <BuyerlyIcon name="add" size={14} />
        </button>
      )}
    </div>
  </div>
);

interface BuyerlyDataListGroupProps extends Omit<BuyerlyDataListGroupHeaderProps, 'className'> {
  children: React.ReactNode;
}

/** A group header and its rows; the rows are left out while the group is collapsed. */
export const BuyerlyDataListGroup: React.FC<BuyerlyDataListGroupProps> = ({ children, ...header }) => (
  <div>
    <BuyerlyDataListGroupHeader {...header} />
    {!header.isCollapsed && (
      <BuyerlyDataListStack xstyle={header.subGroup ? styles.subGroupRows : styles.groupRows}>{children}</BuyerlyDataListStack>
    )}
  </div>
);

interface BuyerlyDataTableProps
  extends Pick<BuyerlyDataListColumnHeaderProps, 'columns' | 'sortKey' | 'sortDirection' | 'onSort'> {
  children: React.ReactNode;
  /** Rendered above the column header at viewport width, e.g. an action notice. */
  before?: React.ReactNode;
  /** Rendered below the rows at table width, e.g. a filter summary. */
  after?: React.ReactNode;
  className?: string;
}

/**
 * The one table surface for entity lists: a horizontally scrollable viewport,
 * a sortable column header and the row stack, all sharing one minimum width.
 */
export const BuyerlyDataTable: React.FC<BuyerlyDataTableProps> = ({
  columns,
  sortKey,
  sortDirection,
  onSort,
  before,
  after,
  className,
  children,
}) => {
  const minWidth = getLinearDataListMinWidth(columns);
  return (
    <BuyerlyDataListViewport className={className} horizontal>
      {before}
      <div style={{ minWidth: `${minWidth}px` }}>
        <BuyerlyDataListColumnHeader
          columns={columns}
          minWidth={minWidth}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={onSort}
        />
        <BuyerlyDataListStack>{children}</BuyerlyDataListStack>
        {after}
      </div>
    </BuyerlyDataListViewport>
  );
};

interface BuyerlyDataPrimaryCellProps {
  /** Selection checkbox and status control, in that order. */
  leading?: React.ReactNode;
  title: React.ReactNode;
  /** Pills or badges that follow the title on the same line. */
  badge?: React.ReactNode;
  /** An inactive entity keeps its row but recedes. */
  dimmed?: boolean;
  /** Full name and Meta ID on hover; the row itself shows only the name. */
  hint?: string;
  /** Pins the cell while the table scrolls horizontally. */
  sticky?: boolean;
}

/** The Name cell: leading controls, a truncating title and an optional badge. */
export const BuyerlyDataPrimaryCell: React.FC<BuyerlyDataPrimaryCellProps> = ({
  leading,
  title,
  badge,
  dimmed = false,
  hint,
  sticky = false,
}) => (
  <div {...withClassName(stylex.props(styles.primaryCell, sticky && styles.primaryCellSticky), sticky ? 'buyerly-data-sticky' : undefined)}>
    {leading}
    <div {...stylex.props(styles.primaryText)} title={hint}>
      <div {...stylex.props(styles.primaryLine)}>
        <span {...stylex.props(styles.primaryTitle, dimmed && styles.primaryTitleDimmed)}>
          {title}
        </span>
        {badge}
      </div>
    </div>
  </div>
);

interface BuyerlyDataMetricCellProps {
  value: React.ReactNode;
  /** Secondary figure on the same line, e.g. cost beside a result count. */
  suffix?: React.ReactNode;
  /** A second line under the value: pace, verdict or comparison basis. */
  caption?: React.ReactNode;
  /** The row's decision metric reads in primary text. */
  emphasis?: boolean;
  /** Overrides the value color for a semantic tone. */
  valueClassName?: string;
  /** The same in StyleX, applied last. */
  valueXstyle?: stylex.StyleXStyles;
}

/** A right-aligned number with tabular figures and an optional caption. */
export const BuyerlyDataMetricCell: React.FC<BuyerlyDataMetricCellProps> = ({
  value,
  suffix,
  caption,
  emphasis = false,
  valueClassName,
  valueXstyle,
}) => (
  <div {...stylex.props(styles.metric)}>
    <div
      {...withClassName(
        stylex.props(
          styles.metricValue,
          emphasis && styles.metricValueEmphasis,
          valueClassName !== undefined && styles.metricValueCustom,
          valueXstyle,
        ),
        `buyerly-data-metric-value ${valueClassName ?? ''}`.trim(),
      )}
    >
      {value}
      {suffix && <span {...stylex.props(styles.metricSuffix)}>{suffix}</span>}
    </div>
    {caption && (
      <div {...stylex.props(styles.metricCaption)}>
        {caption}
      </div>
    )}
  </div>
);
