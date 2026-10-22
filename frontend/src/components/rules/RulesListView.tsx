import React, { useMemo } from 'react';
import { RuleItem, useAppStore } from '@/store/useAppStore';
import { RuleRow } from './RuleRow';
import { DataState } from '@/ui/DataState';
import { BuyerlyDataListGroup, BuyerlyDataTable } from '@/ui/BuyerlyDataList';
import { arrangeGroups, sortByColumn } from '@/ui/listView';
import { getRulesColumns } from './tableColumns';
import {
  NOT_ATTACHED_GROUP_ID,
  RULE_GROUPINGS,
  naturalRuleDirection,
  ruleGroupAccounts,
  ruleGroupsFor,
  useRulesView,
  type RuleListGroup,
} from './rulesViewModel';

interface RulesListViewProps {
  /** Filtered and already in the view's ordering and direction. */
  filteredRules: RuleItem[];
}

/** Header sorting for these columns; Manual and Status keep no header arrow. */
const SORTABLE = new Set(['name', 'lastRun', 'lastCheck', 'created']);

export const RulesListView: React.FC<RulesListViewProps> = ({ filteredRules }) => {
  const { ruleLabels, ruleAccounts, rulesCollapsedGroups, toggleRulesGroupCollapse, openCreateRuleModal } = useAppStore();
  const { view, update } = useRulesView();
  const columns = getRulesColumns(view.properties);
  const accounts = useMemo(() => ruleGroupAccounts(ruleAccounts), [ruleAccounts]);
  const grouping = RULE_GROUPINGS.some((option) => option.value === view.grouping) ? view.grouping : 'none';

  /** A group's "+": a rule with that label, or one that runs on that ad account (#387). */
  const createIn = (group: RuleListGroup) => {
    if (group.labelId) return openCreateRuleModal(group.labelId);
    if (grouping === 'account' && group.id !== NOT_ATTACHED_GROUP_ID) {
      return openCreateRuleModal(undefined, { accountId: group.id.replace(/^account-/, ''), scope: { level: 'account', ids: [] } });
    }
    return openCreateRuleModal();
  };

  const renderRows = () => {
    if (filteredRules.length === 0) {
      return <DataState title="No rules found" detail="No rules match the current filters." />;
    }
    if (grouping === 'none') {
      return filteredRules.map((rule) => <RuleRow key={rule.id} rule={rule} />);
    }
    return arrangeGroups(ruleGroupsFor(grouping, filteredRules, ruleLabels, accounts), view).map((group) => (
      <BuyerlyDataListGroup
        key={group.id}
        title={group.label}
        count={group.rows.length}
        dotColor={group.dotColor}
        tint={group.tint}
        isCollapsed={rulesCollapsedGroups.includes(group.id)}
        onToggleCollapse={() => toggleRulesGroupCollapse(group.id)}
        actionLabel={group.labelId ? `Create rule labelled ${group.label}` : grouping === 'account' ? `Create rule on ${group.label}` : 'Create rule in group'}
        onAction={() => createIn(group)}
      >
        {group.rows.map((rule) => <RuleRow key={`${group.id}:${rule.id}`} rule={rule} />)}
      </BuyerlyDataListGroup>
    ));
  };

  return (
    <BuyerlyDataTable
      columns={columns}
      sortKey={SORTABLE.has(view.ordering) ? view.ordering : undefined}
      sortDirection={view.direction}
      onSort={(columnId) => update(sortByColumn(view, columnId, naturalRuleDirection(columnId)))}
    >
      {renderRows()}
    </BuyerlyDataTable>
  );
};
