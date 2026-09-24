import { LinearDataListColumn, linearDataNameColumn } from '@/ui/LinearDataList';

export type AdsManagerTableTab = 'campaigns' | 'adsets' | 'ads';

const primaryColumn = (statusVisible: boolean) =>
  linearDataNameColumn({ width: 'minmax(260px, 1fr)', statusVisible });

export const getAdsManagerColumns = (
  tab: AdsManagerTableTab,
  properties: Record<string, boolean>
): LinearDataListColumn[] => {
  const columns: LinearDataListColumn[] = [primaryColumn(properties.status !== false)];

  if (tab === 'campaigns' || tab === 'adsets') {
    if (properties.budget !== false) {
      columns.push({ id: 'budget', label: 'Budget', width: '110px', align: 'right', sortable: true });
    }

    if (properties.results !== false || properties.cpa !== false) {
      const resultsVisible = properties.results !== false;
      const cpaVisible = properties.cpa !== false;
      columns.push({
        id: resultsVisible ? 'results' : 'cpa',
        label: resultsVisible && cpaVisible ? 'Results / CPA' : resultsVisible ? 'Results' : 'CPA',
        width: '145px',
        align: 'right',
        sortable: true,
      });
    }

    if (properties.spend !== false) {
      columns.push({ id: 'spend', label: 'Spend', width: '100px', align: 'right', sortable: true });
    }
    if (properties.roi !== false) {
      columns.push({ id: 'roi', label: 'ROI', width: '90px', align: 'right', sortable: true });
    }

    if (properties.rules !== false) columns.push({ id: 'rules', label: 'Rules', width: '100px' });

    if (tab === 'campaigns') {
      if (properties.group) columns.push({ id: 'group', label: 'Group', width: '140px' });
      if (properties.created) {
        columns.push({ id: 'created', label: 'Created', width: '80px', align: 'right', sortable: true });
      }
    }
  } else {
    if (properties.ctr !== false) {
      columns.push({ id: 'ctr', label: 'CTR', width: '90px', align: 'right' });
    }
    if (properties.cpc !== false) {
      columns.push({ id: 'cpc', label: 'CPC', width: '90px', align: 'right' });
    }
    if (properties.results !== false || properties.cpa !== false) {
      const resultsVisible = properties.results !== false;
      const cpaVisible = properties.cpa !== false;
      columns.push({
        id: resultsVisible ? 'results' : 'cpa',
        label: resultsVisible && cpaVisible ? 'Results / CPA' : resultsVisible ? 'Results' : 'CPA',
        width: '145px',
        align: 'right',
        sortable: true,
      });
    }
    if (properties.spend !== false) {
      columns.push({ id: 'spend', label: 'Spend', width: '100px', align: 'right', sortable: true });
    }
  }

  return columns;
};
