import type { AdsManagerEntity } from '@/store/useAppStore';
import { listViewDefaults, type ListViewSettings, type SortDirection } from '@/ui/listView';
import { useListView } from '@/ui/useListView';
import { metricsFor } from './adsManagerMetrics';

/**
 * Display properties of one level, in column order (#389): Delivery is the
 * switch before the name, then the parents, every figure of the level, Rules
 * and the Meta ID. A property a level lacks is never offered there.
 */
export function adsManagerProperties(entity: AdsManagerEntity): { id: string; label: string }[] {
  return [
    { id: 'status', label: 'Delivery' },
    ...(entity !== 'campaigns' ? [{ id: 'campaign', label: 'Campaign' }] : []),
    ...(entity === 'ads' ? [{ id: 'adSet', label: 'Ad set' }] : []),
    ...metricsFor(entity).map((metric) => ({ id: metric.id, label: metric.label })),
    ...(entity !== 'ads' ? [{ id: 'rules', label: 'Rules' }] : []),
    { id: 'id', label: 'ID' },
  ];
}

/** The short set a buyer reads every day; everything else is one switch away in Display properties. */
const DEFAULT_ON = new Set(['status', 'budget', 'spend', 'leads', 'cpl', 'rules']);
const DEFAULT_ON_ADS = new Set(['status', 'spend', 'leads', 'cpl', 'ctr', 'cpc']);

const defaultProperties = (entity: AdsManagerEntity) => Object.fromEntries(
  adsManagerProperties(entity).map(({ id }) => [id, (entity === 'ads' ? DEFAULT_ON_ADS : DEFAULT_ON).has(id)]),
);

/** Each Ads Manager level keeps its own view, as each Linear view does (#385). */
export const ADS_MANAGER_VIEW_DEFAULTS: Record<AdsManagerEntity, ListViewSettings> = {
  campaigns: listViewDefaults({
    grouping: 'none',
    ordering: 'manual',
    direction: 'desc',
    properties: defaultProperties('campaigns'),
  }),
  adsets: listViewDefaults({
    grouping: 'none',
    ordering: 'manual',
    direction: 'desc',
    properties: defaultProperties('adsets'),
  }),
  ads: listViewDefaults({
    grouping: 'none',
    ordering: 'manual',
    direction: 'desc',
    properties: defaultProperties('ads'),
  }),
};

export const adsManagerViewKey = (entity: AdsManagerEntity) => `ads-manager.${entity}`;

export const useAdsManagerView = (entity: AdsManagerEntity) =>
  useListView(adsManagerViewKey(entity), ADS_MANAGER_VIEW_DEFAULTS[entity]);

/** Names sort A→Z first, metrics largest first. */
export const naturalAdsManagerDirection = (ordering: string): SortDirection => (ordering === 'name' ? 'asc' : 'desc');

/** Groupings each level offers; a parent level is never grouped by itself. */
export function adsManagerGroupings(entity: AdsManagerEntity, hasAccountGroups: boolean) {
  return [
    { value: 'none', label: 'No grouping' },
    { value: 'status', label: 'Delivery' },
    ...(entity !== 'campaigns' ? [{ value: 'campaign', label: 'Campaign' }] : []),
    ...(entity === 'ads' ? [{ value: 'adSet', label: 'Ad set' }] : []),
    { value: 'rules', label: 'Rules' },
    ...(hasAccountGroups ? [{ value: 'groups', label: 'Account groups' }] : []),
  ];
}

/** Name, then every figure the table shows, as Linear orders by any visible property. */
export function adsManagerOrderings(entity: AdsManagerEntity, properties: Record<string, boolean>) {
  return [
    { value: 'manual', label: 'Default' },
    { value: 'name', label: 'Name' },
    ...metricsFor(entity)
      .filter((metric) => properties[metric.id])
      .map((metric) => ({ value: metric.id, label: metric.label })),
  ];
}
