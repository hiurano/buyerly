import { useEffect, useState } from 'react';
import type { AdsManagerEntity } from '@/store/useAppStore';
import type { FilterClause } from '@/components/filters/filterModel';
import type { QuickSelection } from './campaignViewModel';

type Filters = Record<AdsManagerEntity, FilterClause[]>;
const empty = (): Filters => ({ campaigns: [], adsets: [], ads: [] });
const operators = new Set(['is', 'is_not', 'includes_all', 'excludes_all', 'includes_any', 'excludes_any']);
function readFilters(): Filters {
  const result = empty();
  try {
    const raw = new URLSearchParams(window.location.search).get('filter');
    if (!raw || raw.length > 20000) return result;
    const value = JSON.parse(raw);
    for (const entity of ['campaigns', 'adsets', 'ads'] as const) {
      if (!Array.isArray(value?.[entity])) continue;
      result[entity] = value[entity].slice(0, 20).filter((clause: FilterClause) => clause
        && ['status', 'group', 'rule'].includes(clause.fieldId) && operators.has(clause.operator)
        && Array.isArray(clause.values) && clause.values.length <= 100
        && clause.values.every(item => typeof item === 'string' && item.length <= 200));
    }
  } catch { /* Invalid shared URLs use an unfiltered view. */ }
  return result;
}

export function useCampaignViewFilters(scope: string) {
  const [filters, setFilters] = useState(readFilters);
  const [quickState, setQuickState] = useState<{ scope: string; selection: QuickSelection | null } | null>(null);
  const key = `buyerly:quick-filter:${scope}`;
  let quick: QuickSelection | null = null;
  if (quickState?.scope === scope) quick = quickState.selection;
  else {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null');
      if (saved && ['status', 'group', 'rule'].includes(saved.fieldId) && typeof saved.value === 'string') quick = saved;
    } catch { /* Storage is optional. */ }
  }
  const setQuick = (selection: QuickSelection | null) => {
    setQuickState({ scope, selection });
    try { sessionStorage.setItem(key, JSON.stringify(selection)); } catch { /* Storage is optional. */ }
  };
  useEffect(() => {
    const onPopState = () => setFilters(readFilters());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const updateFilters = (entity: AdsManagerEntity, clauses: FilterClause[]) => {
    const next = { ...filters, [entity]: clauses };
    setFilters(next);
    const url = new URL(window.location.href);
    if (Object.values(next).some(items => items.length)) url.searchParams.set('filter', JSON.stringify(next));
    else url.searchParams.delete('filter');
    window.history.replaceState(window.history.state, '', url);
  };
  return { filters, updateFilters, quick, setQuick };
}
