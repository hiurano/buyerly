import { BuyerlyDataListColumn, buyerlyDataNameColumn } from '@/ui/BuyerlyDataList';

/**
 * The Rules list's columns, in the order Display properties lists them (#390).
 * As Linear's lists, the default columns fit a 1024px window beside the sidebar:
 * the name and the text properties share the width, the name twice as much, and
 * each gives up width down to its minimum before anything scrolls.
 */
export const getRulesColumns = (properties: Record<string, boolean>): BuyerlyDataListColumn[] => {
  const columns: BuyerlyDataListColumn[] = [
    buyerlyDataNameColumn({ width: 'minmax(180px, 2fr)' }),
  ];

  if (properties.id) columns.push({ id: 'id', label: 'ID', width: '64px' });
  // Labels sit right after the name, where Linear's row shows its label pills.
  if (properties.labels !== false) columns.push({ id: 'labels', label: 'Labels', width: 'minmax(64px, 1fr)' });
  if (properties.condition !== false) columns.push({ id: 'condition', label: 'Condition', width: 'minmax(96px, 1.4fr)' });
  if (properties.action !== false) columns.push({ id: 'action', label: 'Action', width: 'minmax(72px, 0.8fr)' });
  if (properties.level) columns.push({ id: 'level', label: 'Applies to', width: '84px' });
  if (properties.scope !== false) columns.push({ id: 'scope', label: 'Scope', width: 'minmax(64px, 0.8fr)' });
  if (properties.check) columns.push({ id: 'check', label: 'Check', width: '96px' });
  if (properties.repeat) columns.push({ id: 'repeat', label: 'Repeat', width: '96px' });
  if (properties.lastCheck !== false) {
    columns.push({ id: 'lastCheck', label: 'Last check', width: '84px', align: 'right', sortable: true });
  }
  if (properties.lastRun !== false) {
    columns.push({ id: 'lastRun', label: 'Last action', width: '84px', align: 'right', sortable: true });
  }
  if (properties.created) columns.push({ id: 'created', label: 'Created', width: '84px', align: 'right', sortable: true });
  columns.push({ id: 'actions', label: '', width: '32px' });

  return columns;
};
