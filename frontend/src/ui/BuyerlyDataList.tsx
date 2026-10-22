import React from 'react';

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

export const BuyerlyDataListToolbar: React.FC<React.PropsWithChildren<{ className?: string }>> = ({
  children,
  className = '',
}) => (
  <div
    className={`flex shrink-0 items-center justify-between ${className}`}
    style={{
      height: `${BUYERLY_DATA_LIST.toolbarHeight}px`,
      paddingLeft: `${BUYERLY_DATA_LIST.toolbarPaddingLeft}px`,
      paddingRight: `${BUYERLY_DATA_LIST.toolbarPaddingRight}px`,
      boxSizing: 'border-box',
    }}
  >
    {children}
  </div>
);

export const BuyerlyDataListViewport: React.FC<
  React.PropsWithChildren<{
    className?: string;
    horizontal?: boolean;
  }>
> = ({ children, className = '', horizontal = false }) => (
  <div
    className={`min-w-0 flex-1 overflow-y-auto ${horizontal ? 'overflow-x-auto' : 'overflow-x-hidden'} ${className}`}
    style={{
      padding: `${BUYERLY_DATA_LIST.viewportPaddingY}px ${BUYERLY_DATA_LIST.viewportPaddingX}px`,
    }}
  >
    {children}
  </div>
);

export const BuyerlyDataListStack: React.FC<React.PropsWithChildren<{ className?: string }>> = ({
  children,
  className = '',
}) => (
  <div className={`flex flex-col ${className}`} style={{ gap: `${BUYERLY_DATA_LIST.rowGap}px` }}>
    {children}
  </div>
);

interface BuyerlyDataListRowProps extends React.HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  height?: number;
  layout?: 'flex' | 'grid';
  columns?: BuyerlyDataListColumn[];
}

export const BuyerlyDataListRow = React.forwardRef<HTMLDivElement, BuyerlyDataListRowProps>(
  ({ selected = false, height = BUYERLY_DATA_LIST.rowHeight, layout = 'flex', columns, className = '', style, children, ...props }, ref) => (
    <div
      ref={ref}
      role="row"
      data-selected={selected ? 'true' : 'false'}
      aria-selected={selected}
      className={`buyerly-data-row group/row relative ${layout === 'grid' ? 'grid' : 'flex'} w-full select-none items-center outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--focus-ring-color)] ${
        selected
          ? 'bg-[var(--row-selected-bg)] hover:bg-[var(--row-selected-hover-bg)]'
          : 'bg-transparent hover:bg-[var(--data-row-hover-bg)]'
      } ${className}`}
      style={{
        minHeight: `${height}px`,
        borderRadius: `${BUYERLY_DATA_LIST.radius}px`,
        paddingInline: `${BUYERLY_DATA_LIST.rowPaddingX}px`,
        gap: layout === 'grid' ? `${BUYERLY_DATA_LIST.columnGap}px` : undefined,
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
    className={`grid h-8 items-center text-[12px] font-normal text-[var(--text-muted)] ${className}`}
    style={{
      gridTemplateColumns: getLinearDataListTemplate(columns),
      minWidth: minWidth ? `${minWidth}px` : undefined,
      gap: `${BUYERLY_DATA_LIST.columnGap}px`,
      paddingInline: `${BUYERLY_DATA_LIST.rowPaddingX}px`,
      ...style,
    }}
    {...props}
  >
    {columns.map((column) => {
      const isActive = sortKey === column.id;
      const justify = column.align === 'right' ? 'justify-end text-right' : 'justify-start text-left';
      return (
        <div
          key={column.id}
          role="columnheader"
          aria-sort={isActive ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined}
          className={`flex min-w-0 items-center ${justify}`}
          style={{ paddingLeft: column.headerInset ? `${column.headerInset}px` : undefined }}
        >
          {column.sortable && onSort ? (
            <button
              type="button"
              aria-label={`Order by ${column.label}`}
              onClick={() => onSort(column.id)}
              className={`inline-flex h-6 min-w-0 items-center gap-1 rounded-full px-1.5 text-[12px] font-[450] transition-colors hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-secondary)] ${
                isActive ? 'text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)]'
              }`}
            >
              <span className="truncate">{column.label}</span>
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
                  className={sortDirection === 'asc' ? 'rotate-180' : ''}
                >
                  <path d="M2.5 3.75 5 6.25l2.5-2.5" />
                </svg>
              )}
            </button>
          ) : (
            <span className="truncate text-[12px] font-[450] text-[var(--text-tertiary)]">{column.label}</span>
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
    className={`${subGroup ? 'buyerly-data-subgroup-header relative' : 'sticky top-[-4px] z-[2]'} flex items-center ${className}`}
    style={{
      height: `${BUYERLY_DATA_LIST.groupHeaderHeight}px`,
      borderRadius: `${BUYERLY_DATA_LIST.radius}px`,
      background: subGroup
        ? undefined
        : tint
          ? `linear-gradient(90deg, color-mix(in srgb, ${tint} 8%, ${GROUP_HEADER_BG}) 0%, ${GROUP_HEADER_BG} 100%)`
          : GROUP_HEADER_BG,
      isolation: 'isolate',
    }}
  >
    <div className="group/header flex h-full min-w-0 w-full items-center gap-2 pr-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center">
        {onToggleCollapse && (
          <button
            type="button"
            aria-label={isCollapsed ? 'Expand group' : 'Collapse group'}
            aria-expanded={!isCollapsed}
            onClick={onToggleCollapse}
            className="flex h-5 w-5 items-center justify-center rounded-full text-[var(--text-tertiary)] transition-colors hover:bg-[var(--item-hover-bg)]"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="fill-current transition-transform duration-150"
              style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}
            >
              <path d="M7.00194 10.6239C6.66861 10.8183 6.25 10.5779 6.25 10.192V5.80802C6.25 5.42212 6.66861 5.18169 7.00194 5.37613L10.7596 7.56811C11.0904 7.76105 11.0904 8.23895 10.7596 8.43189L7.00194 10.6239Z" />
            </svg>
          </button>
        )}
      </div>

      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-tertiary)]" aria-hidden="true">
        {icon ?? <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />}
      </span>

      <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">{title}</span>
      <span className={`shrink-0 font-mono text-[11px] ${subGroup ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-muted)]'}`}>{count}</span>
      {description && <span className="truncate text-[11px] text-[var(--text-muted)]">{description}</span>}
      {subGroup
        ? <span className="h-[0.5px] min-w-0 flex-1 bg-[var(--list-subgroup-line)]" aria-hidden="true" />
        : <span className="flex-1" />}

      {onAction && (
        <button
          type="button"
          aria-label={actionLabel}
          onClick={(event) => {
            event.stopPropagation();
            onAction();
          }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] opacity-0 transition-all hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] group-hover/header:opacity-100"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8.75 4C8.75 3.58579 8.41421 3.25 8 3.25C7.58579 3.25 7.25 3.58579 7.25 4V7.25H4C3.58579 7.25 3.25 7.58579 3.25 8C3.25 8.41421 3.58579 8.75 4 8.75H7.25V12C7.25 12.4142 7.58579 12.75 8 12.75C8.41421 12.75 8.75 12.4142 8.75 12V8.75H12C12.4142 8.75 12.75 8.41421 12.75 8C12.75 7.58579 12.4142 7.25 12 7.25H8.75V4Z" />
          </svg>
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
      // A sub-group's last row runs straight into the next sub-group, as Linear's; the group closes with the gap.
      <BuyerlyDataListStack className={header.subGroup ? 'pt-0.5' : 'pb-2 pt-0.5'}>{children}</BuyerlyDataListStack>
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
  <div
    className={`flex min-w-0 items-center gap-3 ${
      sticky
        ? 'buyerly-data-sticky sticky left-0 z-[1] transition-colors'
        : ''
    }`}
  >
    {leading}
    <div className="flex min-w-0 flex-col" title={hint}>
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`min-w-0 truncate text-[13px] font-medium ${
            dimmed ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'
          }`}
        >
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
}

/** A right-aligned number with tabular figures and an optional caption. */
export const BuyerlyDataMetricCell: React.FC<BuyerlyDataMetricCellProps> = ({
  value,
  suffix,
  caption,
  emphasis = false,
  valueClassName,
}) => (
  <div className="min-w-0 text-right">
    <div
      className={`truncate whitespace-nowrap text-[12px] tabular-nums ${
        valueClassName ?? (emphasis
          ? 'font-medium text-[var(--text-primary)]'
          : 'font-[450] text-[var(--text-secondary)]')
      }`}
    >
      {value}
      {suffix && <span className="ml-1 text-[var(--text-muted)]">{suffix}</span>}
    </div>
    {caption && (
      <div className="mt-0.5 flex min-w-0 items-center justify-end gap-1.5 text-[11px] leading-4 text-[var(--text-muted)] tabular-nums">
        {caption}
      </div>
    )}
  </div>
);
