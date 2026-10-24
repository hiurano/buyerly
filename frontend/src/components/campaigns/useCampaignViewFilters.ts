import { useEffect, useState } from 'react';
import { sanitizeFilterClauses, type FilterClause } from '@/components/filters/filterModel';
import { readFilterParam, writeFilterParam } from '@/ui/useListView';
import { migrateAdsManagerClauses, type QuickSelection } from './campaignViewModel';
import { useAdsManagerView } from './adsManagerViewModel';
import { type AdsManagerEntity } from '@/models/viewStore';

type Filters = Record<AdsManagerEntity, FilterClause[]>;
const ENTITIES: AdsManagerEntity[] = ['campaigns', 'adsets', 'ads'];

/** `?filter=` holds every level's filters in one object, so one link shares them all. */
function filtersFromAddress(): Filters | null {
  const value = readFilterParam();
  if (value === null) return null;
  const source = typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    campaigns: migrateAdsManagerClauses(sanitizeFilterClauses(source.campaigns)),
    adsets: migrateAdsManagerClauses(sanitizeFilterClauses(source.adsets)),
    ads: migrateAdsManagerClauses(sanitizeFilterClauses(source.ads)),
  };
}

function writeAddress(filters: Filters) {
  writeFilterParam(ENTITIES.some((entity) => filters[entity].length) ? filters : null);
}

/**
 * Ads Manager's filters, one set per level: saved with each level's view on
 * the server (#385) and kept in the address so a link shares them. A link
 * with `?filter=` wins and becomes the saved filters; an address without one
 * gets the saved filters back. `navigationKey` changes on every navigation,
 * Back and Forward included.
 */
/** The quick filter this tab last had, if storage holds a valid one. */
function readQuick(key: string): QuickSelection | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (saved && ['status', 'account', 'group', 'rule', 'campaign'].includes(saved.fieldId) && typeof saved.value === 'string') return saved;
  } catch { /* Storage is optional. */ }
  return null;
}

export function useCampaignViewFilters(scope: string, navigationKey: number, mine = false) {
  const views = {
    campaigns: useAdsManagerView('campaigns', mine),
    adsets: useAdsManagerView('adsets', mine),
    ads: useAdsManagerView('ads', mine),
  };
  const loaded = views.campaigns.loaded;
  const filters: Filters = {
    campaigns: migrateAdsManagerClauses(views.campaigns.view.filters),
    adsets: migrateAdsManagerClauses(views.adsets.view.filters),
    ads: migrateAdsManagerClauses(views.ads.view.filters),
  };

  useEffect(() => {
    if (!loaded) return;
    const fromAddress = filtersFromAddress();
    if (fromAddress) {
      for (const entity of ENTITIES) {
        if (JSON.stringify(fromAddress[entity]) !== JSON.stringify(filters[entity])) {
          views[entity].update({ filters: fromAddress[entity] });
        }
      }
      writeAddress(fromAddress);
    } else {
      writeAddress(filters);
    }
    // Only arrival and navigation read the address; later changes write it.
  }, [loaded, navigationKey]);

  const [quickState, setQuickState] = useState<{ scope: string; selection: QuickSelection | null } | null>(null);
  const key = `buyerly:quick-filter:${scope}`;
  const quick = quickState?.scope === scope ? quickState.selection : readQuick(key);
  const setQuick = (selection: QuickSelection | null) => {
    setQuickState({ scope, selection });
    try { sessionStorage.setItem(key, JSON.stringify(selection)); } catch { /* Storage is optional. */ }
  };

  const updateFilters = (entity: AdsManagerEntity, clauses: FilterClause[]) => {
    views[entity].update({ filters: clauses });
    writeAddress({ ...filters, [entity]: clauses });
  };
  return { filters, updateFilters, quick, setQuick };
}
