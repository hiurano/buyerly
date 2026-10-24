import { boardGrouping, listViewDefaults, type ListViewSettings, type SortDirection } from '@/ui/listView';
import { useListView } from '@/ui/useListView';
import { metricsFor } from './adsManagerMetrics';
import { type AdsManagerEntity } from '@/models/viewStore';

/**
 * Display properties of one level, in column order (#389): Status is the
 * delivery switch before the name, then the parents, every figure of the level, Rules
 * and the Meta ID. A property a level lacks is never offered there.
 */
export function adsManagerProperties(entity: AdsManagerEntity): { id: string; label: string }[] {
  return [
    { id: 'status', label: 'Status' },
    { id: 'account', label: 'Ad account' },
    ...(entity !== 'campaigns' ? [{ id: 'campaign', label: 'Campaign' }] : []),
    ...(entity === 'ads' ? [{ id: 'adSet', label: 'Ad set' }] : []),
    ...metricsFor(entity).map((metric) => ({ id: metric.id, label: metric.label })),
    ...(entity !== 'ads' ? [{ id: 'rules', label: 'Rules' }] : []),
    { id: 'id', label: 'ID' },
  ];
}

/** The short set a buyer reads every day; everything else is one switch away in Display properties. */
const DEFAULT_ON = new Set(['status', 'account', 'budget', 'spend', 'leads', 'cpl', 'rules']);
const DEFAULT_ON_ADS = new Set(['status', 'account', 'spend', 'leads', 'cpl', 'ctr', 'cpc']);

const defaultProperties = (entity: AdsManagerEntity) => Object.fromEntries(
  adsManagerProperties(entity).map(({ id }) => [id, (entity === 'ads' ? DEFAULT_ON_ADS : DEFAULT_ON).has(id)]),
);

/**
 * Each Ads Manager level keeps its own view, as each Linear view does (#385).
 * Every ad account is on screen at once, grouped by account: a group's figures
 * share one currency, and a buyer reads limits and billing per account.
 */
export const ADS_MANAGER_VIEW_DEFAULTS: Record<AdsManagerEntity, ListViewSettings> = {
  campaigns: listViewDefaults({
    grouping: 'account',
    ordering: 'manual',
    direction: 'desc',
    properties: defaultProperties('campaigns'),
  }),
  adsets: listViewDefaults({
    grouping: 'account',
    ordering: 'manual',
    direction: 'desc',
    properties: defaultProperties('adsets'),
  }),
  ads: listViewDefaults({
    grouping: 'account',
    ordering: 'manual',
    direction: 'desc',
    properties: defaultProperties('ads'),
  }),
};

/** My campaigns keeps views of its own, as Linear's My issues does beside a team's Issues. */
export const adsManagerViewKey = (entity: AdsManagerEntity, mine = false) =>
  `${mine ? 'my-campaigns' : 'ads-manager'}.${entity}`;

export const useAdsManagerView = (entity: AdsManagerEntity, mine = false) =>
  useListView(adsManagerViewKey(entity, mine), ADS_MANAGER_VIEW_DEFAULTS[entity]);

/** Names sort A→Z first, metrics largest first. */
export const naturalAdsManagerDirection = (ordering: string): SortDirection => (ordering === 'name' ? 'asc' : 'desc');

/** Groupings each level offers; a parent level is never grouped by itself. */
export function adsManagerGroupings(entity: AdsManagerEntity) {
  return [
    { value: 'none', label: 'No grouping' },
    { value: 'account', label: 'Ad account' },
    { value: 'status', label: 'Status' },
    ...(entity !== 'campaigns' ? [{ value: 'campaign', label: 'Campaign' }] : []),
    ...(entity === 'ads' ? [{ value: 'adSet', label: 'Ad set' }] : []),
    { value: 'rules', label: 'Rules' },
  ];
}

/**
 * The grouping on screen: a saved one the level offers, else none — and on
 * a board never none, as Linear's Columns: then the columns are Status.
 */
export function adsManagerActiveGrouping(entity: AdsManagerEntity, view: Pick<ListViewSettings, 'grouping' | 'layout'>): string {
  const saved = adsManagerGroupings(entity).some((option) => option.value === view.grouping) ? view.grouping : 'none';
  return view.layout === 'board' ? boardGrouping(saved, 'status') : saved;
}

/**
 * Sub-grouping, the board's Rows (Linear's swimlanes): one setting for both
 * layouts, so Ctrl/Cmd+B keeps it. A list grouped by nothing has no sub-groups.
 */
export function adsManagerActiveRows(
  entity: AdsManagerEntity,
  view: Pick<ListViewSettings, 'grouping' | 'subGrouping' | 'layout'>,
): string {
  const grouping = adsManagerActiveGrouping(entity, view);
  // Rows by the columns' own property (saved before Linear's swap) band nothing.
  if (grouping === 'none' || view.subGrouping === grouping) return 'none';
  return adsManagerGroupings(entity).some((option) => option.value === view.subGrouping) ? view.subGrouping : 'none';
}

/** The filter field a grouping groups by; its value is also the Display property it stands for. */
export const adsManagerGroupingField = (grouping: string) => (grouping === 'rules' ? 'rule' : grouping);

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
