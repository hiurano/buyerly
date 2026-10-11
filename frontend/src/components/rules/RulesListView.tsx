import React from 'react';
import { RuleItem, useAppStore } from '@/store/useAppStore';
import { RuleRow } from './RuleRow';
import { DataState } from '@/ui/DataState';
import { LinearDataListGroup, LinearDataTable } from '@/ui/LinearDataList';
import { arrangeGroups, sortByColumn } from '@/ui/listView';
import { getRulesColumns } from './tableColumns';
import { naturalRuleDirection, ruleGroupsFor, useRulesView } from './rulesViewModel';

interface RulesListViewProps {
  /** Filtered and already in the view's ordering and direction. */
  filteredRules: RuleItem[];
}

export const RulesListView: React.FC<RulesListViewProps> = ({ filteredRules }) => {
  const { ruleLabels, rulesCollapsedGroups, toggleRulesGroupCollapse, openCreateRuleModal } = useAppStore();
  const { view, update } = useRulesView();
  const columns = getRulesColumns(view.properties);

  const renderRows = () => {
    if (filteredRules.length === 0) {
      return <DataState title="No rules found" detail="No rules match the current filters." />;
    }
    if (view.grouping !== 'status' && view.grouping !== 'labels') {
      return filteredRules.map((rule) => <RuleRow key={rule.id} rule={rule} />);
    }
    return arrangeGroups(ruleGroupsFor(view.grouping, filteredRules, ruleLabels), view).map((group) => (
      <LinearDataListGroup
        key={group.id}
        title={group.label}
        count={group.rows.length}
        dotColor={group.dotColor}
        tint={group.tint}
        isCollapsed={rulesCollapsedGroups.includes(group.id)}
        onToggleCollapse={() => toggleRulesGroupCollapse(group.id)}
        actionLabel={group.labelId ? `New rule labelled ${group.label}` : 'New rule'}
        onAction={() => openCreateRuleModal(group.labelId)}
      >
        {group.rows.map((rule) => <RuleRow key={rule.id} rule={rule} />)}
      </LinearDataListGroup>
    ));
  };

  return (
    <LinearDataTable
      columns={columns}
      sortKey={view.ordering === 'manual' || view.ordering === 'status' ? undefined : view.ordering}
      sortDirection={view.direction}
      onSort={(columnId) => update(sortByColumn(view, columnId, naturalRuleDirection(columnId)))}
    >
      {renderRows()}
    </LinearDataTable>
  );
};
