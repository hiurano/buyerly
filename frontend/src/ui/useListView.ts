import { useCallback, useEffect, useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { StoredView } from '@/lib/viewSettings';
import { sanitizeFilterClauses, type FilterClause } from '@/components/filters/filterModel';
import { displayDiffers, readListView, type ListViewSettings } from './listView';
import { toast } from './toast';

/** Only what differs from the page's defaults is kept, so a later default still reaches untouched views. */
function sparse(view: ListViewSettings, defaults: ListViewSettings): StoredView {
  const result: StoredView = {};
  for (const key of Object.keys(view) as (keyof ListViewSettings)[]) {
    if (JSON.stringify(view[key]) !== JSON.stringify(defaults[key])) result[key] = view[key];
  }
  return result;
}

/**
 * One list page's view (#385), saved on the server per member and workspace
 * under `key` — "rules", "ads-manager.campaigns" — as Linear remembers each
 * view. `defaults` must be stable (a module constant). The workspace's default
 * for the key, when an admin set one (Linear's "Set default for everyone",
 * #472), lies over the page's own; the member's view lies over both.
 *
 * - `update(patch)` changes the view and saves it;
 * - `reset()` brings the default Display options back and keeps the filters,
 *   as Linear's Reset does;
 * - `displayChanged` is true while Display options differ from the defaults
 *   (Linear's dot on the button and the footer with Reset);
 * - `setDefaultForEveryone()` makes these Display options, not the filters,
 *   the workspace's default; `canSetDefault` says whether this member may.
 */
export function useListView(key: string, defaults: ListViewSettings) {
  const stored = useAppStore((state) => state.viewSettings[key]);
  const workspaceDefault = useAppStore((state) => state.viewDefaults[key]);
  const loaded = useAppStore((state) => state.viewSettingsLoaded);
  const canSetDefault = useAppStore((state) => state.workspaceRole === 'owner' || state.workspaceRole === 'admin');
  const loadViewSettings = useAppStore((state) => state.loadViewSettings);
  const setViewSettings = useAppStore((state) => state.setViewSettings);
  const setViewDefault = useAppStore((state) => state.setViewDefault);

  useEffect(() => {
    if (!loaded) void loadViewSettings();
  }, [loaded, loadViewSettings]);

  const base = useMemo(() => readListView(workspaceDefault, defaults), [workspaceDefault, defaults]);
  const view = useMemo(() => readListView(stored, base), [stored, base]);

  const saveOver = useCallback((next: ListViewSettings, under: ListViewSettings) => {
    const diff = sparse(next, under);
    setViewSettings(key, Object.keys(diff).length ? diff : null);
  }, [key, setViewSettings]);

  const update = useCallback((patch: Partial<ListViewSettings>) => {
    const current = readListView(useAppStore.getState().viewSettings[key], base);
    saveOver(readListView({ ...current, ...patch }, base), base);
  }, [base, key, saveOver]);

  const reset = useCallback(() => {
    const current = readListView(useAppStore.getState().viewSettings[key], base);
    saveOver({ ...base, filters: current.filters }, base);
  }, [base, key, saveOver]);

  const setDefaultForEveryone = useCallback(async () => {
    const current = readListView(useAppStore.getState().viewSettings[key], base);
    // Display options only: as Linear's dot and Reset, filters stay each member's own.
    const display = sparse({ ...current, filters: defaults.filters }, defaults);
    try {
      await setViewDefault(key, display);
    } catch {
      toast.error("Couldn't set the default for everyone", 'Try again in a moment.');
      return;
    }
    // Now the default, so the member's own copy keeps only their filters.
    saveOver(current, readListView(display, defaults));
  }, [base, defaults, key, saveOver, setViewDefault]);

  return {
    view,
    loaded,
    update,
    reset,
    displayChanged: displayDiffers(view, base),
    canSetDefault,
    setDefaultForEveryone,
  };
}

/** The address's `?filter=`: null when it has none, the clauses it names otherwise. */
export function readFilterParam(param = 'filter'): unknown | null {
  try {
    const raw = new URLSearchParams(window.location.search).get(param);
    if (raw === null) return null;
    if (raw.length > 20000) return [];
    return JSON.parse(raw);
  } catch {
    // A broken link opens the list unfiltered.
    return [];
  }
}

export function writeFilterParam(value: unknown | null, param = 'filter') {
  const url = new URL(window.location.href);
  if (value === null) url.searchParams.delete(param);
  else url.searchParams.set(param, JSON.stringify(value));
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
}

/**
 * Filters live in the view and in the address, as Linear's do: a link with
 * `?filter=` wins and becomes the saved filter; an address without one gets
 * the saved filter back. Runs on arrival and on every navigation.
 */
export function useFiltersInAddress(
  filters: FilterClause[],
  setFilters: (clauses: FilterClause[]) => void,
  loaded: boolean,
  navigationKey: number,
) {
  useEffect(() => {
    if (!loaded) return;
    const fromAddress = readFilterParam();
    if (fromAddress !== null) {
      const clauses = sanitizeFilterClauses(fromAddress);
      if (JSON.stringify(clauses) !== JSON.stringify(filters)) setFilters(clauses);
      if (clauses.length === 0) writeFilterParam(null);
    } else if (filters.length > 0) {
      writeFilterParam(filters);
    }
    // Only arrival and navigation read the address; later changes write it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, navigationKey]);
}
