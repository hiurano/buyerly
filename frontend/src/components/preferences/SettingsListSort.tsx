import React, { useState } from 'react';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';

export type SortDirection = 'asc' | 'desc';

export interface ListSort<K extends string> {
  key: K;
  direction: SortDirection;
}

/** Linear's list headers: a list opens sorted by Name, ascending; a header sorts by its column, a second click reverses it. */
export function useListSort<K extends string>(initial: K) {
  const [sort, setSort] = useState<ListSort<K>>({ key: initial, direction: 'asc' });
  const toggle = (key: K) => setSort((current) => (
    current.key === key
      ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' }
  ));
  return [sort, toggle] as const;
}

type SortValue = string | number | null | undefined;

/** A sorted copy: text by locale, numbers by size, empty values last either way. */
export function sortedBy<T>(rows: T[], value: (row: T) => SortValue, direction: SortDirection): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const leftEmpty = left === null || left === undefined || left === '';
    const rightEmpty = right === null || right === undefined || right === '';
    if (leftEmpty || rightEmpty) return leftEmpty === rightEmpty ? 0 : leftEmpty ? 1 : -1;
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * sign;
    return String(left).localeCompare(String(right), undefined, { sensitivity: 'base', numeric: true }) * sign;
  });
}

/** The sort arrow, as Linear's: its head down while ascending (every column but the sorted one shows it dimmed), up while descending. */
const SortArrow: React.FC<{ direction: SortDirection }> = ({ direction }) => (
  <BuyerlyIcon name={direction === 'asc' ? 'arrow-down' : 'arrow-up'} size={12} />
);

/** A column header that sorts its list, as Linear's settings tables. */
export function SortHeader<K extends string>({
  label,
  column,
  sort,
  onSort,
  className,
}: {
  label: string;
  column: K;
  sort: ListSort<K>;
  onSort: (key: K) => void;
  className?: string;
}) {
  const active = sort.key === column;
  const order = sort.direction === 'asc' ? 'ascending' : 'descending';
  return (
    <span role="columnheader" aria-sort={active ? order : 'none'} className={className}>
      <button
        type="button"
        className="settings-list-sort"
        data-active={active ? 'true' : undefined}
        aria-label={`Order by ${label}${active ? `, sorted ${order}` : ''}`}
        onClick={() => onSort(column)}
      >
        {label}
        <SortArrow direction={active ? sort.direction : 'asc'} />
      </button>
    </span>
  );
}
