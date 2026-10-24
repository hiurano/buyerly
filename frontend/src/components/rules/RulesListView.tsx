import React, { useMemo } from 'react';
import { RuleRow } from './RuleRow';
import { DataState } from '@/ui/DataState';
import { BuyerlyDataListGroup, BuyerlyDataTable } from '@/ui/BuyerlyDataList';
import { arrangeGroups, sortByColumn } from '@/ui/listView';
import { getRulesColumns } from './tableColumns';
import {
  NOT_ATTACHED_GROUP_ID,
  naturalRuleDirection,
  ruleActiveGrouping,
  ruleActiveRows,
  ruleGroupAccounts,
  ruleGroupsFor,
  useRulesView,
  type RuleListGroup,
} from './rulesViewModel';
import { useRulesStore, RuleItem } from '@/models/rulesStore';
import { useDialogStore } from '@/models/dialogStore';
import { useViewStore } from '@/models/viewStore';

interface RulesListViewProps {
  /** Filtered and already in the view's ordering and direction. */
  filteredRules: RuleItem[];
}

/** Header sorting for these columns; Manual and Status keep no header arrow. */
const SORTABLE = new Set(['name', 'lastRun', 'lastCheck', 'created']);

export const RulesListView: React.FC<RulesListViewProps> = ({ filteredRules }) => {
  const ruleLabels = useRulesStore((state) => state.ruleLabels);
  const ruleAccounts = useRulesStore((state) => state.ruleAccounts);
  const rulesCollapsedGroups = useViewStore((state) => state.rulesCollapsedGroups);
  const toggleRulesGroupCollapse = useViewStore((state) => state.toggleRulesGroupCollapse);
  const openCreateRuleModal = useDialogStore((state) => state.openCreateRuleModal);
  const { view, update } = useRulesView();
  const columns = getRulesColumns(view.properties);
  const accounts = useMemo(() => ruleGroupAccounts(ruleAccounts), [ruleAccounts]);
  const grouping = ruleActiveGrouping(view);
  const rowsGrouping = ruleActiveRows(view);

  /** Whether a group's "+" starts the rule with something: its label, or its ad account (#387). */
  const presets = (group: RuleListGroup, by: string) =>
    Boolean(group.labelId) || (by === 'account' && group.id !== NOT_ATTACHED_GROUP_ID);
  /** A group's "+": a rule with that label, or one that runs on that ad account. */
  const createIn = (group: RuleListGroup, by: string) => {
    if (group.labelId) return openCreateRuleModal(group.labelId);
    if (presets(group, by)) {
      return openCreateRuleModal(undefined, { accountId: group.id.replace(/^account-/, ''), scope: { level: 'account', ids: [] } });
    }
    return openCreateRuleModal();
  };
  const actionLabel = (group: RuleListGroup, by: string) =>
    group.labelId ? `Create rule labelled ${group.label}` : presets(group, by) ? `Create rule on ${group.label}` : 'Create rule in group';

  /**
   * Linear's sub-groups inside a group. Every grouping is a known set, so Show
   * empty groups shows empty sub-groups too. A sub-group's "+" starts from the
   * sub-group when it has a label or account to start with, else from the group.
   */
  const renderSubGroups = (group: RuleListGroup) => {
    if (rowsGrouping === 'none') return group.rows.map((rule) => <RuleRow key={`${group.id}:${rule.id}`} rule={rule} />);
    return ruleGroupsFor(rowsGrouping, group.rows, ruleLabels, accounts)
      .filter((sub) => sub.rows.length > 0 || view.showEmptyGroups)
      .map((sub) => {
        const key = `${group.id}/${sub.id}`;
        const [from, by]: [RuleListGroup, string] = presets(sub, rowsGrouping) ? [sub, rowsGrouping] : [group, grouping];
        return (
          <BuyerlyDataListGroup
            key={key}
            subGroup
            title={sub.label}
            count={sub.rows.length}
            dotColor={sub.dotColor}
            isCollapsed={rulesCollapsedGroups.includes(key)}
            onToggleCollapse={() => toggleRulesGroupCollapse(key)}
            actionLabel={actionLabel(from, by)}
            onAction={() => createIn(from, by)}
          >
            {sub.rows.map((rule) => <RuleRow key={`${key}:${rule.id}`} rule={rule} />)}
          </BuyerlyDataListGroup>
        );
      });
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
        actionLabel={actionLabel(group, grouping)}
        onAction={() => createIn(group, grouping)}
      >
        {renderSubGroups(group)}
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
