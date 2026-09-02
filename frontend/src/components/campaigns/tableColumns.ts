import { LinearDataListColumn } from '@/ui/LinearDataList';

export type AdsManagerTableTab = 'campaigns' | 'adsets' | 'ads';

const primaryColumn = (statusVisible: boolean): LinearDataListColumn => ({
  id: 'name',
  label: 'Name',
  width: 'minmax(260px, 1fr)',
  // The sortable header pill adds 6px of internal padding; compensate so its
  // label starts on the same pixel as the row title.
  headerInset: statusVisible ? 64 : 24,
  sortable: true,
});

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

    if (tab === 'campaigns') {
      if (properties.rules !== false) columns.push({ id: 'rules', label: 'Rules', width: '100px' });
      if (properties.group) columns.push({ id: 'group', label: 'Group', width: '140px' });
      if (properties.created) {
        columns.push({ id: 'created', label: 'Created', width: '80px', align: 'right', sortable: true });
      }
    }
  } else {
    columns.push(
      { id: 'ctr', label: 'CTR', width: '90px', align: 'right' },
      { id: 'cpc', label: 'CPC', width: '90px', align: 'right' }
    );
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

export const getAdsManagerTableMinWidth = (columns: LinearDataListColumn[]) => {
  const columnWidth = columns.reduce((total, column) => {
    if (column.width.startsWith('minmax')) return total + 260;
    return total + (Number.parseInt(column.width, 10) || 0);
  }, 0);
  return columnWidth + Math.max(columns.length - 1, 0) * 6 + 24;
};
