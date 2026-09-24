import { LinearDataListColumn } from '@/ui/LinearDataList';

export const getRulesColumns = (properties: Record<string, boolean>): LinearDataListColumn[] => {
  const columns: LinearDataListColumn[] = [
    {
      id: 'name',
      label: 'Name',
      width: 'minmax(280px, 1fr)',
      // Compensate for the sortable header pill's 6px internal padding.
      headerInset: properties.status !== false ? 64 : 24,
      sortable: true,
    },
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
