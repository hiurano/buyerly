import React, { useState } from 'react';
import { Button } from '@/ui/Button';
import { DataState } from '@/ui/DataState';
import { Tooltip } from '@/ui/Tooltip';

/**
 * Linear's Teams table: Name, Visibility, Members, Issues, Created; Buyerly
 * counts ad accounts, not issues. A phone keeps Name and Members.
 */
const ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_72px] sm:grid-cols-[minmax(0,2.4fr)_minmax(88px,1fr)_72px_64px_72px] items-center gap-3';

/**
 * Settings → Administration → Teams, laid out as Linear's: "Filter by name…",
 * the Active filter and Create team over the table (no Export CSV). Buyerly
 * has no teams yet (hiurano/buyerly#371), so the table says so and Create
 * team stays off with a reason.
 */
export const TeamsSection: React.FC = () => {
  const [query, setQuery] = useState('');

  return (
    <>
      <div className="preferences-title-container">
        <h1 className="preferences-page-title">Teams</h1>
      </div>

      <div className="flex items-center gap-2">
        <label className="relative flex h-8 w-[244px] min-w-0 max-w-full flex-1 items-center sm:flex-none">
          <span className="sr-only">Filter by name…</span>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="pointer-events-none absolute left-2.5 fill-[var(--text-tertiary)]">
            <path d="M7 1.5a5.5 5.5 0 0 1 4.38 8.82l3.15 3.15a.75.75 0 1 1-1.06 1.06l-3.15-3.15A5.5 5.5 0 1 1 7 1.5Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name…"
            className="h-8 w-full rounded-[6px] border border-[var(--color-border-secondary)] bg-transparent pl-8 pr-2 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--action-primary)]"
          />
        </label>
        <Tooltip content="Teams are coming soon">
          <span className="inline-flex">
            <Button disabled aria-label="Show teams: Active" className="gap-1.5">
              Active
              <svg width="9" height="5" viewBox="0 0 9 5" fill="currentColor" aria-hidden="true">
                <path d="M1.915.557a.667.667 0 0 0-.943.943l2.862 2.862a.942.942 0 0 0 1.333 0L8.028 1.5a.667.667 0 0 0-.943-.943L4.5 3.14 1.915.557Z" />
              </svg>
            </Button>
          </span>
        </Tooltip>
        <div className="flex-1" />
        <Tooltip content="Teams are coming soon">
          <span className="inline-flex">
            <Button variant="primary" disabled>Create team</Button>
          </span>
        </Tooltip>
      </div>

      <div className="mt-6 text-[13px]" role="table" aria-label="Teams">
        <div role="row" className={`${ROW_GRID} h-8 px-2 text-[12px] font-medium text-[var(--text-secondary)]`}>
          <span role="columnheader">Name</span>
          <span role="columnheader" className="hidden sm:block">Visibility</span>
          <span role="columnheader">Members</span>
          <span role="columnheader" className="hidden sm:block">Accounts</span>
          <span role="columnheader" className="hidden sm:block">Created</span>
        </div>
      </div>
      <DataState
        title={query.trim() ? 'No teams found' : 'No teams yet'}
        detail="Teams are coming soon. Until then, everyone in the workspace works with all of its ad accounts and rules."
      />
    </>
  );
};
