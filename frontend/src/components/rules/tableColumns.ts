import { LinearDataListColumn, linearDataNameColumn } from '@/ui/LinearDataList';

export const getRulesColumns = (properties: Record<string, boolean>): LinearDataListColumn[] => {
  const columns: LinearDataListColumn[] = [
    linearDataNameColumn({ width: 'minmax(260px, 1fr)', statusVisible: properties.status !== false }),
  ];

  if (properties.condition !== false) columns.push({ id: 'condition', label: 'Condition', width: '220px' });
  if (properties.action !== false) columns.push({ id: 'action', label: 'Action', width: '140px' });
  if (properties.scope !== false) columns.push({ id: 'scope', label: 'Scope', width: '170px' });
  if (properties.lastRun !== false) {
    columns.push({ id: 'lastRun', label: 'Last run', width: '80px', align: 'right', sortable: true });
  }
  columns.push({ id: 'actions', label: '', width: '32px' });

  return columns;
};
