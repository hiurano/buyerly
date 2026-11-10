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
import * as stylex from '@stylexjs/stylex';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './DropdownMenu';
import { Tooltip } from './Tooltip';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { BuyerlyDisclosureGlyph } from '@/icons/BuyerlyIcons';
import { colors } from '@/styles/tokens.stylex';
import { withClassName } from '@/ui/withClassName';

const styles = stylex.create({
  scroll: {
    height: '100%',
    minHeight: 0,
    overflow: 'auto',
  },
  board: {
    display: 'flex',
    alignItems: 'stretch',
    width: 'max-content',
    minWidth: '100%',
    minHeight: '100%',
    paddingLeft: 4,
  },
  grid: {
    display: 'grid',
    position: 'relative',
    minHeight: '100%',
  },
  /** The column's lane: the sidebar tone fading into the canvas, 4px in from each side. */
  columnBg: {
    margin: '4px 4px 0',
    borderRadius: '5px 5px 0 0',
    backgroundImage: `linear-gradient(${colors['--bg-sidebar']}, ${colors['--bg-canvas']})`,
    pointerEvents: 'none',
  },
  columnHeader: {
    position: 'sticky',
    top: 0,
    zIndex: 3,
    isolation: 'isolate',
    // Opaque, so cards scroll under it; the lane's top tone is drawn again behind the title.
    backgroundColor: colors['--bg-canvas'],
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 50,
    padding: '2px 12px 0 18px',
    userSelect: 'none',
    '::before': {
      content: "''",
      position: 'absolute',
      inset: '4px 4px 0',
      zIndex: -1,
      borderRadius: '5px 5px 0 0',
      backgroundColor: colors['--bg-sidebar'],
    },
  },
  /** A column's or a lane's title: its icon, its name and the count. */
  title: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    display: 'flex',
    width: 16,
    height: 16,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    color: colors['--text-tertiary'],
  },
  columnName: {
    marginLeft: 2,
    overflow: 'hidden',
    fontSize: 13,
    fontWeight: 500,
    lineHeight: '16px',
    color: colors['--text-secondary'],
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  count: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: 450,
    lineHeight: '16px',
    color: colors['--text-tertiary'],
  },
  columnActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  iconButton: {
    display: 'inline-flex',
    width: 24,
    height: 24,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 9999,
    backgroundColor: {
      default: 'transparent',
      ':hover': colors['--item-hover-bg'],
      '[data-state="open"]': colors['--item-hover-bg'],
    },
    backgroundPosition: '0 0',
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
      '[data-state="open"]': colors['--text-primary'],
    },
    cursor: 'pointer',
    outlineStyle: 'none',
    transition: 'background-color 0.15s ease, color 0.15s ease',
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 1px ${colors['--focus-ring-color']}`,
    },
  },
  chevron: {
    fill: 'currentColor',
    transition: 'transform 0.15s ease',
  },
  chevronOpen: {
    transform: 'rotate(90deg)',
  },
  chevronClosed: {
    transform: 'rotate(0deg)',
  },
  /** A row: a 35px band across every column, held under the column headers. */
  lane: {
    position: 'sticky',
    top: 50,
    zIndex: 2,
    display: 'flex',
    alignItems: 'center',
    height: 35,
    margin: '0 4px',
    paddingLeft: 4,
    borderRadius: 8,
    backgroundColor: colors['--board-lane-bg'],
    userSelect: 'none',
  },
  laneTitle: {
    position: 'sticky',
    left: 8,
  },
  cell: {
    position: 'relative',
    zIndex: 1,
    minWidth: 0,
    padding: '9px 12px 8px',
    borderRadius: {
      default: null,
      '[data-drop-over]': 8,
    },
    backgroundColor: {
      default: null,
      '[data-drop-over]': colors['--item-hover-bg'],
    },
  },
  cardSlot: {
    padding: '0 1px 8px',
    outlineStyle: 'none',
  },
  overlay: {
    borderRadius: 8,
    boxShadow: colors['--dropdown-shadow'],
    transform: 'rotate(1.5deg)',
  },
  /** Linear's "Hidden columns": a 350px lane on the right, one 37px row per column. */
  hidden: {
    display: 'flex',
    width: 350,
    flexShrink: 0,
    flexDirection: 'column',
    paddingRight: 12,
  },
  hiddenHeader: {
    position: 'sticky',
    top: 0,
    zIndex: 3,
    display: 'flex',
    alignItems: 'center',
    height: 50,
    backgroundColor: colors['--bg-canvas'],
  },
  hiddenToggle: {
    display: 'inline-flex',
    height: 24,
    alignItems: 'center',
    gap: 2,
    padding: '0 8px 0 6px',
    borderRadius: 9999,
    backgroundColor: {
      default: 'transparent',
      ':hover': colors['--item-hover-bg'],
    },
    backgroundPosition: '0 0',
    fontSize: 12,
    fontWeight: 500,
    color: colors['--text-secondary'],
    cursor: 'pointer',
    outlineStyle: 'none',
  },
  hiddenList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  hiddenRow: {
    display: 'flex',
    width: '100%',
    height: 37,
    alignItems: 'center',
    gap: 12,
    padding: '4px 12px',
    borderRadius: 8,
    backgroundColor: {
      default: colors['--card-bg'],
      ':is(button):hover': colors['--item-hover-bg'],
      '[data-drop-over]': colors['--item-hover-bg'],
    },
    boxShadow: colors['--canvas-shadow'],
    textAlign: 'left',
    userSelect: 'none',
    cursor: {
      default: null,
      ':is(button)': 'pointer',
    },
  },
  hiddenName: {
    overflow: 'hidden',
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-secondary'],
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

/**
 * Linear's Board (measured on linear.app 2026-10-22, light and dark): 348px
 * columns under a 50px sticky header, 322px cards 8px apart, Rows as 35px
 * sticky bands across every column, and a "Hidden columns" lane on the
 * right for the columns the member hid or that are empty.
 */
interface BoardColumn<T> {
  id: string;
  label: string;
  icon?: React.ReactNode;
  rows: T[];
}

interface BoardHiddenColumn {
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

interface BoardMove<T> {
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
  <BuyerlyDisclosureGlyph {...stylex.props(styles.chevron, open ? styles.chevronOpen : styles.chevronClosed)} />
);

const PlusIcon = () => (
  <BuyerlyIcon name="add" size={14} />
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
      {...stylex.props(styles.cardSlot)}
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
      {...stylex.props(styles.cell)}
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
    <div {...withClassName(stylex.props(styles.board), 'buyerly-board')}>
      <div
        {...stylex.props(styles.grid)}
        style={{ gridTemplateColumns: `repeat(${columns.length}, 348px)`, gridTemplateRows: rowTemplate }}
      >
        {columns.map((column, index) => (
          <div key={`bg-${column.id}`} {...stylex.props(styles.columnBg)} style={{ gridColumn: index + 1, gridRow: '1 / -1' }} />
        ))}

        {columns.map((column, index) => (
          <div key={`head-${column.id}`} {...withClassName(stylex.props(styles.columnHeader), 'buyerly-board-column-header')} style={{ gridColumn: index + 1, gridRow: 1 }}>
            <div {...stylex.props(styles.title)}>
              {column.icon && <span {...stylex.props(styles.icon)} aria-hidden="true">{column.icon}</span>}
              <span {...withClassName(stylex.props(styles.columnName), 'buyerly-board-column-name')}>{column.label}</span>
              <span {...stylex.props(styles.count)}>{column.rows.length}</span>
            </div>
            <div {...stylex.props(styles.columnActions)}>
              {onHideColumn && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" {...stylex.props(styles.iconButton)} aria-label={`${column.label} menu`}>
                      <BuyerlyIcon name="more" size={14} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onHideColumn(column.id)}>Hide column</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {add && (
                <Tooltip content={add.label} shortcut={add.shortcut} side="bottom" sideOffset={8}>
                  <button type="button" {...stylex.props(styles.iconButton)} aria-label={add.label} onClick={() => add.run(column.id)}>
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
                <div {...withClassName(stylex.props(styles.lane), 'buyerly-board-lane')} style={{ gridColumn: '1 / -1', gridRow: cellsRow - 1 }}>
                  <div {...stylex.props(styles.title, styles.laneTitle)}>
                    <button
                      type="button"
                      {...stylex.props(styles.iconButton)}
                      aria-label={collapsed ? `Expand ${lane.label}` : `Collapse ${lane.label}`}
                      aria-expanded={!collapsed}
                      onClick={() => setCollapsedLanes((state) => ({ ...state, [lane.id]: !collapsed }))}
                    >
                      <Chevron open={!collapsed} />
                    </button>
                    {lane.icon && <span {...stylex.props(styles.icon)} aria-hidden="true">{lane.icon}</span>}
                    <span {...withClassName(stylex.props(styles.columnName), 'buyerly-board-column-name')}>{lane.label}</span>
                    <span {...stylex.props(styles.count)}>{count}</span>
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
                        <div key={id} {...stylex.props(styles.cardSlot)}>{renderCard(row, column.id)}</div>
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
        <div {...stylex.props(styles.hidden)}>
          <div {...stylex.props(styles.hiddenHeader)}>
            <button
              type="button"
              {...stylex.props(styles.hiddenToggle)}
              aria-expanded={hiddenOpen}
              onClick={() => setHiddenOpen((open) => !open)}
            >
              <Chevron open={hiddenOpen} />
              Hidden columns
            </button>
          </div>
          {hiddenOpen && (
            <div {...stylex.props(styles.hiddenList)}>
              {hiddenColumns.map((column) => {
                const content = (
                  <>
                    {column.icon && <span {...stylex.props(styles.icon)} aria-hidden="true">{column.icon}</span>}
                    <span {...stylex.props(styles.hiddenName)}>{column.label}</span>
                    {column.count > 0 && <span {...stylex.props(styles.count)}>{column.count}</span>}
                  </>
                );
                const row = (over: boolean) => (column.hiddenByMember && onShowColumn ? (
                  <Tooltip content="Show column" side="left">
                    <button
                      type="button"
                      {...withClassName(stylex.props(styles.hiddenRow), 'buyerly-board-hidden-row')}
                      data-drop-over={over || undefined}
                      onClick={() => onShowColumn(column.id)}
                    >
                      {content}
                    </button>
                  </Tooltip>
                ) : (
                  <div {...withClassName(stylex.props(styles.hiddenRow), 'buyerly-board-hidden-row')} data-drop-over={over || undefined}>{content}</div>
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
    <div {...stylex.props(styles.scroll)}>
      {move ? (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          {board}
          <DragOverlay dropAnimation={null}>
            {dragging !== null && <div {...stylex.props(styles.overlay)}>{move.renderOverlay(dragging)}</div>}
          </DragOverlay>
        </DndContext>
      ) : board}
    </div>
  );
}
