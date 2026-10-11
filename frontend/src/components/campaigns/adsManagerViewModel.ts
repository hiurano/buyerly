import type { AdsManagerEntity } from '@/store/useAppStore';
import { listViewDefaults, type ListViewSettings, type SortDirection } from '@/ui/listView';
import { useListView } from '@/ui/useListView';

/** Each Ads Manager level keeps its own view, as each Linear view does (#385). */
export const ADS_MANAGER_VIEW_DEFAULTS: Record<AdsManagerEntity, ListViewSettings> = {
  campaigns: listViewDefaults({
    grouping: 'none',
    ordering: 'manual',
    direction: 'desc',
    properties: { status: true, budget: true, results: true, cpa: true, spend: true, rules: true },
  }),
  adsets: listViewDefaults({
    grouping: 'none',
    ordering: 'manual',
    direction: 'desc',
    properties: { status: true, budget: true, results: true, cpa: true, spend: true, rules: true },
  }),
  ads: listViewDefaults({
    grouping: 'none',
    ordering: 'manual',
    direction: 'desc',
    properties: { status: true, ctr: true, cpc: true, results: true, cpa: true, spend: true },
  }),
};

export const adsManagerViewKey = (entity: AdsManagerEntity) => `ads-manager.${entity}`;

export const useAdsManagerView = (entity: AdsManagerEntity) =>
  useListView(adsManagerViewKey(entity), ADS_MANAGER_VIEW_DEFAULTS[entity]);

/** Names sort A→Z first, metrics largest first. */
export const naturalAdsManagerDirection = (ordering: string): SortDirection => (ordering === 'name' ? 'asc' : 'desc');
