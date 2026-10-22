import React, { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './DropdownMenu';
import { Tooltip } from './Tooltip';
import { LinearDotsIcon } from '@/icons/LinearIcons';

/**
 * Linear's Board (measured on linear.app 2026-10-22, light and dark): 348px
 * columns under a 50px sticky header, 322px cards 8px apart, Rows as 35px
 * sticky bands across every column, and a "Hidden columns" lane on the
 * right for the columns the member hid or that are empty.
 */
export interface BoardColumn<T> {
  id: string;
  label: string;
  icon?: React.ReactNode;
  rows: T[];
}

export interface BoardHiddenColumn {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count: number;
  /** Hidden with "Hide column" (it comes back from the lane), rather than only empty. */
  hiddenByMember: boolean;
}

/** One of Rows' bands: the same columns, each holding only this band's cards. */
export interface BoardLane<T> {
  id: string;
  label: string;
  icon?: React.ReactNode;
  cells: Record<string, T[]>;
}

export interface BoardMove<T> {
  /** Whether cards can be dropped into this column, and (without `canDrag`) dragged out of it. */
  canMove: (columnId: string) => boolean;
  /** Whether this card can be picked up at all, e.g. only what may really change. */
  canDrag?: (row: T, columnId: string) => boolean;
  onMove: (row: T, fromColumnId: string, toColumnId: string) => void;
  /** The card under the pointer while it is dragged. */
  renderOverlay: (row: T) => React.ReactNode;
}

interface BuyerlyBoardProps<T> {
  columns: BoardColumn<T>[];
  hiddenColumns?: BoardHiddenColumn[];
  /** Rows (Linear's swimlanes); without them every column is one cell. */
  lanes?: BoardLane<T>[];
  rowKey: (row: T) => string;
  renderCard: (row: T, columnId: string) => React.ReactNode;
  /** The column's "…" menu: Hide column. */
  onHideColumn?: (columnId: string) => void;
  /** A member-hidden column's row in the lane brings it back. */
  onShowColumn?: (columnId: string) => void;
  /** The column's "+", as Linear's "Create new issue" in that column. */
  add?: { label: string; shortcut?: string; run: (columnId: string) => void };
  move?: BoardMove<T>;
}

const Chevron: React.FC<{ open: boolean }> = ({ open }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    aria-hidden="true"
    className="buyerly-board-chevron"
    style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
  >
    <path d="M7.00194 10.6239C6.66861 10.8183 6.25 10.5779 6.25 10.192V5.80802C6.25 5.42212 6.66861 5.18169 7.00194 5.37613L10.7596 7.56811C11.0904 7.76105 11.0904 8.23895 10.7596 8.43189L7.00194 10.6239Z" />
  </svg>
);

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8.75 4C8.75 3.58579 8.41421 3.25 8 3.25C7.58579 3.25 7.25 3.58579 7.25 4V7.25H4C3.58579 7.25 3.25 7.58579 3.25 8C3.25 8.41421 3.58579 8.75 4 8.75H7.25V12C7.25 12.4142 7.58579 12.75 8 12.75C8.41421 12.75 8.75 12.4142 8.75 12V8.75H12C12.4142 8.75 12.75 8.41421 12.75 8C12.75 7.58579 12.4142 7.25 12 7.25H8.75V4Z" />
  </svg>
);

const cellKey = (laneId: string, columnId: string) => `${laneId}::${columnId}`;
const dragKey = (laneId: string, columnId: string, rowId: string) => `${laneId}::${columnId}::${rowId}`;

/** A card's drag handle: the whole card, once the pointer has moved a little, so a click still works. */
const DraggableCard: React.FC<React.PropsWithChildren<{ id: string; disabled: boolean }>> = ({ id, disabled, children }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // The card itself is focusable; the wrapper only carries the drag.
      tabIndex={-1}
      role="presentation"
      className="buyerly-board-card-slot"
      data-board-drag={disabled ? undefined : id}
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      {children}
    </div>
  );
};

const DroppableCell: React.FC<React.PropsWithChildren<{
  id: string;
  columnId: string;
  label: string;
  disabled: boolean;
  style: React.CSSProperties;
}>> = ({ id, columnId, label, disabled, style, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={label}
      className="buyerly-board-cell"
      data-board-cell={id}
      data-board-column={columnId}
      data-drop-over={isOver || undefined}
      style={style}
    >
      {children}
    </div>
  );
};

/** A hidden column still takes a dropped card, as Linear's lane does: the card then shows the column again. */
const DroppableHidden: React.FC<{ id: string; disabled: boolean; children: (over: boolean) => React.ReactNode }> = ({
  id,
  disabled,
  children,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: `hidden::${id}`, disabled });
  return <div ref={setNodeRef} data-board-hidden-column={id}>{children(isOver)}</div>;
};

export function BuyerlyBoard<T>({
  columns,
  hiddenColumns = [],
  lanes,
  rowKey,
  renderCard,
  onHideColumn,
  onShowColumn,
  add,
  move,
}: BuyerlyBoardProps<T>) {
  const [collapsedLanes, setCollapsedLanes] = useState<Record<string, boolean>>({});
  const [hiddenOpen, setHiddenOpen] = useState(true);
  const [dragging, setDragging] = useState<T | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Without Rows every column is one cell of a single, unnamed band.
  const bands: BoardLane<T>[] = lanes ?? [{
    id: 'all',
    label: '',
    cells: Object.fromEntries(columns.map((column) => [column.id, column.rows])),
  }];
  const rowTemplate = [
    '50px',
    ...bands.flatMap(() => (lanes ? ['35px', 'auto'] : ['auto'])),
    // The last row takes what is left, so the columns reach the bottom.
    '1fr',
  ].join(' ');

  const find = (key: string) => {
    const [laneId, columnId, rowId] = key.split('::');
    const row = bands.find((lane) => lane.id === laneId)?.cells[columnId]?.find((candidate) => rowKey(candidate) === rowId);
    return row === undefined ? null : { columnId, row };
  };

  const onDragStart = (event: DragStartEvent) => setDragging(find(String(event.active.id))?.row ?? null);
  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const source = find(String(event.active.id));
    const target = event.over ? String(event.over.id).split('::')[1] : undefined;
    if (!move || !source || !target || target === source.columnId || !move.canMove(target)) return;
    move.onMove(source.row, source.columnId, target);
  };

  const board = (
    <div className="buyerly-board">
      <div
        className="buyerly-board-grid"
        style={{ gridTemplateColumns: `repeat(${columns.length}, 348px)`, gridTemplateRows: rowTemplate }}
      >
        {columns.map((column, index) => (
          <div key={`bg-${column.id}`} className="buyerly-board-column-bg" style={{ gridColumn: index + 1, gridRow: '1 / -1' }} />
        ))}

        {columns.map((column, index) => (
          <div key={`head-${column.id}`} className="buyerly-board-column-header" style={{ gridColumn: index + 1, gridRow: 1 }}>
            <div className="buyerly-board-column-title">
              {column.icon && <span className="buyerly-board-icon" aria-hidden="true">{column.icon}</span>}
              <span className="buyerly-board-column-name">{column.label}</span>
              <span className="buyerly-board-count">{column.rows.length}</span>
            </div>
            <div className="buyerly-board-column-actions">
              {onHideColumn && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="buyerly-board-icon-button" aria-label={`${column.label} menu`}>
                      <LinearDotsIcon size={14} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onHideColumn(column.id)}>Hide column</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {add && (
                <Tooltip content={add.label} shortcut={add.shortcut} side="bottom" sideOffset={8}>
                  <button type="button" className="buyerly-board-icon-button" aria-label={add.label} onClick={() => add.run(column.id)}>
                    <PlusIcon />
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
        ))}

        {bands.map((lane, laneIndex) => {
          const cellsRow = lanes ? 3 + laneIndex * 2 : 2;
          const collapsed = Boolean(lanes && collapsedLanes[lane.id]);
          const count = Object.values(lane.cells).reduce((total, rows) => total + rows.length, 0);
          return (
            <React.Fragment key={lane.id}>
              {lanes && (
                <div className="buyerly-board-lane" style={{ gridColumn: '1 / -1', gridRow: cellsRow - 1 }}>
                  <div className="buyerly-board-lane-title">
                    <button
                      type="button"
                      className="buyerly-board-icon-button"
                      aria-label={collapsed ? `Expand ${lane.label}` : `Collapse ${lane.label}`}
                      aria-expanded={!collapsed}
                      onClick={() => setCollapsedLanes((state) => ({ ...state, [lane.id]: !collapsed }))}
                    >
                      <Chevron open={!collapsed} />
                    </button>
                    {lane.icon && <span className="buyerly-board-icon" aria-hidden="true">{lane.icon}</span>}
                    <span className="buyerly-board-column-name">{lane.label}</span>
                    <span className="buyerly-board-count">{count}</span>
                  </div>
                </div>
              )}
              {!collapsed && columns.map((column, index) => {
                const rows = lane.cells[column.id] ?? [];
                const movable = Boolean(move?.canMove(column.id));
                return (
                  <DroppableCell
                    key={cellKey(lane.id, column.id)}
                    id={cellKey(lane.id, column.id)}
                    columnId={column.id}
                    label={lanes ? `${column.label}, ${lane.label}` : column.label}
                    disabled={!movable}
                    style={{ gridColumn: index + 1, gridRow: cellsRow }}
                  >
                    {rows.map((row) => {
                      const id = dragKey(lane.id, column.id, rowKey(row));
                      const draggable = move?.canDrag ? move.canDrag(row, column.id) : movable;
                      return move ? (
                        <DraggableCard key={id} id={id} disabled={!draggable}>{renderCard(row, column.id)}</DraggableCard>
                      ) : (
                        <div key={id} className="buyerly-board-card-slot">{renderCard(row, column.id)}</div>
                      );
                    })}
                  </DroppableCell>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>

      {hiddenColumns.length > 0 && (
        <div className="buyerly-board-hidden">
          <div className="buyerly-board-hidden-header">
            <button
              type="button"
              className="buyerly-board-hidden-toggle"
              aria-expanded={hiddenOpen}
              onClick={() => setHiddenOpen((open) => !open)}
            >
              <Chevron open={hiddenOpen} />
              Hidden columns
            </button>
          </div>
          {hiddenOpen && (
            <div className="buyerly-board-hidden-list">
              {hiddenColumns.map((column) => {
                const content = (
                  <>
                    {column.icon && <span className="buyerly-board-icon" aria-hidden="true">{column.icon}</span>}
                    <span className="buyerly-board-hidden-name">{column.label}</span>
                    {column.count > 0 && <span className="buyerly-board-count">{column.count}</span>}
                  </>
                );
                const row = (over: boolean) => (column.hiddenByMember && onShowColumn ? (
                  <Tooltip content="Show column" side="left">
                    <button
                      type="button"
                      className="buyerly-board-hidden-row"
                      data-drop-over={over || undefined}
                      onClick={() => onShowColumn(column.id)}
                    >
                      {content}
                    </button>
                  </Tooltip>
                ) : (
                  <div className="buyerly-board-hidden-row" data-drop-over={over || undefined}>{content}</div>
                ));
                return move ? (
                  <DroppableHidden key={column.id} id={column.id} disabled={!move.canMove(column.id)}>{row}</DroppableHidden>
                ) : (
                  <React.Fragment key={column.id}>{row(false)}</React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="buyerly-board-scroll">
      {move ? (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          {board}
          <DragOverlay dropAnimation={null}>
            {dragging !== null && <div className="buyerly-board-overlay">{move.renderOverlay(dragging)}</div>}
          </DragOverlay>
        </DndContext>
      ) : board}
    </div>
  );
}
