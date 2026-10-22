import { LinearDataListColumn, linearDataNameColumn } from '@/ui/LinearDataList';
import { metricsFor } from './adsManagerMetrics';

export type AdsManagerTableTab = 'campaigns' | 'adsets' | 'ads';

const primaryColumn = (statusVisible: boolean, width: string) =>
  linearDataNameColumn({ width, statusVisible });

/**
 * The columns a level shows, in the order Display properties lists them
 * (#389). On a phone Spend follows a narrower name, so the two stay on screen
 * beside the pinned Rules cell while the rest of the figures scroll.
 */
export const getAdsManagerColumns = (
  tab: AdsManagerTableTab,
  properties: Record<string, boolean>,
  options: { spendFirst?: boolean; groupedByAccount?: boolean } = {},
): LinearDataListColumn[] => {
  const phone = Boolean(options.spendFirst);
  const columns: LinearDataListColumn[] = [
    primaryColumn(properties.status !== false, phone ? 'minmax(150px, 1fr)' : 'minmax(260px, 1fr)'),
  ];

  // Grouped by account, the group names it; as Linear drops the project from rows grouped by project.
  if (properties.account && !options.groupedByAccount) columns.push({ id: 'account', label: 'Ad account', width: '160px' });
  if (tab !== 'campaigns' && properties.campaign) columns.push({ id: 'campaign', label: 'Campaign', width: '160px' });
  if (tab === 'ads' && properties.adSet) columns.push({ id: 'adSet', label: 'Ad set', width: '160px' });

  for (const metric of metricsFor(tab)) {
    if (properties[metric.id]) {
      columns.push({ id: metric.id, label: metric.label, width: metric.width, align: 'right', sortable: true });
    }
  }

  // Rules attach to campaigns and ad sets only; ads take none.
  if (tab === 'campaigns' || tab === 'adsets') {
    if (properties.rules) columns.push({ id: 'rules', label: 'Rules', width: '100px' });
  }
  if (properties.id) columns.push({ id: 'id', label: 'ID', width: '150px' });

  const spend = columns.findIndex((column) => column.id === 'spend');
  if (phone && spend > 0) {
    const [column] = columns.splice(spend, 1);
    columns.splice(1, 0, { ...column, width: '90px' });
  }
  return columns;
};
