import React from 'react';

export const LINEAR_DATA_LIST = {
  toolbarHeight: 43,
  rowHeight: 44,
  groupHeaderHeight: 36,
  radius: 8,
  rowGap: 2,
  rowPaddingX: 12,
  columnGap: 6,
  toolbarPaddingLeft: 8,
  toolbarPaddingRight: 10,
  viewportPaddingX: 8,
  viewportPaddingY: 4,
} as const;

export interface LinearDataListColumn {
  id: string;
  label: string;
  width: string;
  align?: 'left' | 'right';
  sortable?: boolean;
  headerInset?: number;
}

export const getLinearDataListTemplate = (columns: LinearDataListColumn[]) =>
  columns.map((column) => column.width).join(' ');

export const LinearDataListToolbar: React.FC<React.PropsWithChildren<{ className?: string }>> = ({
  children,
  className = '',
}) => (
  <div
    className={`flex shrink-0 items-center justify-between ${className}`}
    style={{
      height: `${LINEAR_DATA_LIST.toolbarHeight}px`,
      paddingLeft: `${LINEAR_DATA_LIST.toolbarPaddingLeft}px`,
      paddingRight: `${LINEAR_DATA_LIST.toolbarPaddingRight}px`,
      boxSizing: 'border-box',
    }}
  >
    {children}
  </div>
);

export const LinearDataListViewport: React.FC<
  React.PropsWithChildren<{
    className?: string;
    horizontal?: boolean;
  }>
> = ({ children, className = '', horizontal = false }) => (
  <div
    className={`min-w-0 flex-1 overflow-y-auto ${horizontal ? 'overflow-x-auto' : 'overflow-x-hidden'} ${className}`}
    style={{
      padding: `${LINEAR_DATA_LIST.viewportPaddingY}px ${LINEAR_DATA_LIST.viewportPaddingX}px`,
    }}
  >
    {children}
  </div>
);

export const LinearDataListStack: React.FC<React.PropsWithChildren<{ className?: string }>> = ({
  children,
  className = '',
}) => (
  <div className={`flex flex-col ${className}`} style={{ gap: `${LINEAR_DATA_LIST.rowGap}px` }}>
    {children}
  </div>
);

interface LinearDataListRowProps extends React.HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  height?: number;
  layout?: 'flex' | 'grid';
  columns?: LinearDataListColumn[];
}

export const LinearDataListRow = React.forwardRef<HTMLDivElement, LinearDataListRowProps>(
  ({ selected = false, height = LINEAR_DATA_LIST.rowHeight, layout = 'flex', columns, className = '', style, children, ...props }, ref) => (
    <div
      ref={ref}
      role="row"
      data-selected={selected ? 'true' : 'false'}
      aria-selected={selected}
      className={`group/row relative ${layout === 'grid' ? 'grid' : 'flex'} w-full select-none items-center outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--focus-ring-color)] ${
        selected
          ? 'bg-[var(--row-selected-bg)]'
          : 'bg-transparent hover:bg-[var(--data-row-hover-bg)]'
      } ${className}`}
      style={{
        minHeight: `${height}px`,
        borderRadius: `${LINEAR_DATA_LIST.radius}px`,
        paddingInline: `${LINEAR_DATA_LIST.rowPaddingX}px`,
        gap: layout === 'grid' ? `${LINEAR_DATA_LIST.columnGap}px` : undefined,
        gridTemplateColumns: columns ? getLinearDataListTemplate(columns) : undefined,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  )
);
LinearDataListRow.displayName = 'LinearDataListRow';

interface LinearDataListColumnHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  columns: LinearDataListColumn[];
  minWidth?: number;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (columnId: string) => void;
}

export const LinearDataListColumnHeader: React.FC<LinearDataListColumnHeaderProps> = ({
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
      gap: `${LINEAR_DATA_LIST.columnGap}px`,
      paddingInline: `${LINEAR_DATA_LIST.rowPaddingX}px`,
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

interface LinearDataListGroupHeaderProps {
  title: string;
  count: number;
  dotColor?: string;
  description?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const LinearDataListGroupHeader: React.FC<LinearDataListGroupHeaderProps> = ({
  title,
  count,
  dotColor = 'rgb(148, 163, 184)',
  description,
  isCollapsed = false,
  onToggleCollapse,
  actionLabel = 'Create item in group',
  onAction,
  className = '',
}) => (
  <div
    className={`sticky top-[-4px] z-[2] flex items-center ${className}`}
    style={{
      height: `${LINEAR_DATA_LIST.groupHeaderHeight}px`,
      borderRadius: `${LINEAR_DATA_LIST.radius}px`,
      background: 'var(--rules-group-bg, var(--card-bg))',
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

      <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
      </span>

      <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">{title}</span>
      <span className="shrink-0 font-mono text-[11px] text-[var(--text-muted)]">{count}</span>
      {description && <span className="truncate text-[11px] text-[var(--text-muted)]">{description}</span>}
      <span className="flex-1" />

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
