import React, { useState } from 'react';

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

/** Linear's arrow: its head down while ascending (every column but the sorted one shows it dimmed), up while descending. */
const SortArrow: React.FC<{ direction: SortDirection }> = ({ direction }) => (
  <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
    <path
      d={direction === 'asc'
        ? 'M11.5361 10.2745C11.8024 10.0029 11.8249 9.56807 11.5762 9.26961C11.3275 8.97139 10.8961 8.91526 10.5811 9.12801L10.5195 9.17391L8.00001 11.2735L5.48048 9.17391L5.41895 9.12801C5.10388 8.91526 4.67252 8.97139 4.42384 9.26961C4.17512 9.56807 4.19758 10.0029 4.46387 10.2745L4.51954 10.3263L7.51954 12.8263C7.79767 13.058 8.20234 13.058 8.48048 12.8263L11.4805 10.3263L11.5361 10.2745Z'
        : 'M11.5361 5.7255C11.8024 5.9971 11.8249 6.43193 11.5762 6.73039C11.3275 7.02861 10.8961 7.08474 10.5811 6.87199L10.5195 6.82609L8.00001 4.7265L5.48048 6.82609L5.41895 6.87199C5.10388 7.08474 4.67252 7.02861 4.42384 6.73039C4.17512 6.43193 4.19758 5.9971 4.46387 5.7255L4.51954 5.6737L7.51954 3.1737C7.79767 2.942 8.20234 2.942 8.48048 3.1737L11.4805 5.6737L11.5361 5.7255Z'}
    />
    <path d="M8.75 12.25C8.75 12.6642 8.41421 13 8 13C7.58579 13 7.25 12.6642 7.25 12.25L7.25 3.75C7.25 3.33579 7.58579 3 8 3C8.41421 3 8.75 3.33579 8.75 3.75V12.25Z" />
  </svg>
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
