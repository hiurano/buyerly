import { LinearDataListColumn, linearDataNameColumn } from '@/ui/LinearDataList';

/** The Rules list's columns, in the order Display properties lists them (#390). */
export const getRulesColumns = (properties: Record<string, boolean>): LinearDataListColumn[] => {
  const columns: LinearDataListColumn[] = [
    linearDataNameColumn({ width: 'minmax(260px, 1fr)', statusVisible: properties.status !== false }),
  ];

  if (properties.id) columns.push({ id: 'id', label: 'ID', width: '64px' });
  // Labels sit right after the name, where Linear's row shows its label pills.
  if (properties.labels !== false) columns.push({ id: 'labels', label: 'Labels', width: '180px' });
  if (properties.condition !== false) columns.push({ id: 'condition', label: 'Condition', width: '220px' });
  if (properties.action !== false) columns.push({ id: 'action', label: 'Action', width: '140px' });
  if (properties.level) columns.push({ id: 'level', label: 'Applies to', width: '84px' });
  if (properties.scope !== false) columns.push({ id: 'scope', label: 'Scope', width: '170px' });
  if (properties.check) columns.push({ id: 'check', label: 'Check', width: '96px' });
  if (properties.repeat) columns.push({ id: 'repeat', label: 'Repeat', width: '96px' });
  if (properties.lastCheck !== false) {
    columns.push({ id: 'lastCheck', label: 'Last check', width: '90px', align: 'right', sortable: true });
  }
  if (properties.lastRun !== false) {
    columns.push({ id: 'lastRun', label: 'Last action', width: '90px', align: 'right', sortable: true });
  }
  if (properties.created) columns.push({ id: 'created', label: 'Created', width: '84px', align: 'right', sortable: true });
  columns.push({ id: 'actions', label: '', width: '32px' });

  return columns;
};
