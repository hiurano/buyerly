import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { ApiError } from '@/lib/api';
import { fetchDeletedItems, TRASH_RETENTION_DAYS, type DeletedItem } from '@/lib/trash';
import { DataState } from '@/ui/DataState';
import { Button } from '@/ui/Button';
import {
  BuyerlyDataListRow,
  BuyerlyDataPrimaryCell,
  BuyerlyDataTable,
  buyerlyDataNameColumn,
  type BuyerlyDataListColumn,
} from '@/ui/BuyerlyDataList';
import { restoreFromTrash } from './ruleActions';
import { useRulesStore } from '@/models/rulesStore';

const COLUMNS: BuyerlyDataListColumn[] = [
  buyerlyDataNameColumn({ width: 'minmax(240px, 1fr)', statusVisible: false }),
  { id: 'kind', label: 'Type', width: '88px' },
  { id: 'deleted', label: 'Deleted', width: '96px' },
  { id: 'by', label: 'Deleted by', width: '160px' },
  { id: 'purge', label: 'Removed in', width: '104px', align: 'right' },
  { id: 'restore', label: '', width: '88px', align: 'right' },
];

const styles = stylex.create({
  cell: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 12,
    color: colors['--text-secondary'],
  },
  number: {
    fontVariantNumeric: 'tabular-nums',
  },
  purge: {
    textAlign: 'right',
    color: colors['--text-tertiary'],
  },
  restore: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
});

const DAY_MS = 24 * 60 * 60 * 1000;

function shortDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysLeft(purgeAt: string): string {
  const days = Math.max(0, Math.ceil((new Date(purgeAt).getTime() - Date.now()) / DAY_MS));
  return days === 1 ? '1 day' : `${days} days`;
}

/**
 * Linear's "Recently deleted": what was deleted in the last 30 days, newest
 * first. Restore puts an item back and it simply leaves this list; there is no
 * permanent delete, the retention window does that.
 */
export const RecentlyDeletedView: React.FC<{ onCountChange?: (count: number | null) => void }> = ({ onCountChange }) => {
  const rules = useRulesStore((state) => state.rules);
  const ruleLabels = useRulesStore((state) => state.ruleLabels);
  const [items, setItems] = useState<DeletedItem[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    try {
      const next = await fetchDeletedItems();
      if (current !== generation.current) return;
      setItems(next);
      setLoadState('ready');
    } catch (error) {
      if (current !== generation.current) return;
      setLoadError(error instanceof ApiError ? error.message : 'Could not reach the server. Please try again.');
      setLoadState('error');
    }
  }, []);

  // Live rules change on every delete, restore, undo and redo, so the list
  // follows them instead of keeping its own copy of the history.
  useEffect(() => {
    void load();
  }, [load, rules, ruleLabels]);

  // The page title shows the count beside it, as Linear's "Archived issues 3".
  useEffect(() => {
    onCountChange?.(loadState === 'ready' ? items.length : null);
  }, [items.length, loadState, onCountChange]);

  const restore = useCallback(async (item: DeletedItem) => {
    if (restoringId !== null) return;
    setRestoringId(item.id);
    const restored = await restoreFromTrash(item);
    if (restored) setItems((current) => current.filter((entry) => entry.id !== item.id));
    setRestoringId(null);
  }, [restoringId]);

  // `#` restores the row under the pointer, as in Linear.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '#' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const row = document.querySelector<HTMLElement>('[data-deleted-item-id]:hover')
        ?? (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-deleted-item-id]');
      const item = items.find((entry) => String(entry.id) === row?.dataset.deletedItemId);
      if (!item) return;
      event.preventDefault();
      void restore(item);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, restore]);

  if (loadState === 'loading' && items.length === 0) {
    return <DataState title="Loading recently deleted…" detail="Reading what was deleted in this workspace." />;
  }
  if (loadState === 'error') {
    return (
      <DataState
        title="Couldn't load recently deleted"
        detail={loadError}
        role="alert"
        actionLabel="Retry"
        onAction={() => void load()}
      />
    );
  }
  if (items.length === 0) {
    return (
      <DataState
        title="Nothing deleted"
        detail={`Rules and labels you delete stay here for ${TRASH_RETENTION_DAYS} days, and can be restored until then.`}
      />
    );
  }

  return (
    <BuyerlyDataTable columns={COLUMNS}>
      {items.map((item) => (
        <BuyerlyDataListRow
          key={item.id}
          layout="grid"
          columns={COLUMNS}
          data-deleted-item-id={item.id}
          tabIndex={0}
        >
          <BuyerlyDataPrimaryCell title={item.name} dimmed hint={item.name} />
          <span {...stylex.props(styles.cell)}>
            {item.kind === 'rule' ? 'Rule' : 'Label'}
          </span>
          <span {...stylex.props(styles.cell, styles.number)}>
            {shortDate(item.deleted_at)}
          </span>
          <span {...stylex.props(styles.cell)}>
            {item.deleted_by || '—'}
          </span>
          <span
            {...stylex.props(styles.cell, styles.number, styles.purge)}
            title={`Permanently deleted on ${shortDate(item.purge_at)}`}
          >
            {daysLeft(item.purge_at)}
          </span>
          <span {...stylex.props(styles.restore)}>
            <Button
              size="compact"
              disabled={restoringId !== null}
              aria-label={`Restore ${item.name}`}
              onClick={() => void restore(item)}
            >
              {restoringId === item.id ? 'Restoring…' : 'Restore'}
            </Button>
          </span>
        </BuyerlyDataListRow>
      ))}
    </BuyerlyDataTable>
  );
};
