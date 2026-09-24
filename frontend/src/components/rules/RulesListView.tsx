import React, { useState } from 'react';
import { RuleItem, useAppStore } from '@/store/useAppStore';
import { RuleRow } from './RuleRow';
import { DataState } from '@/ui/DataState';
import { LinearDataListGroup, LinearDataTable } from '@/ui/LinearDataList';
import { getRulesColumns } from './tableColumns';

interface RulesListViewProps {
  filteredRules: RuleItem[];
}

const getGroupDotColor = (iconType: string) => {
  switch (iconType) {
    case 'shield':
      return 'rgb(52, 211, 153)'; // emerald
    case 'rocket':
      return 'rgb(192, 132, 252)'; // purple
    case 'flask':
      return 'rgb(251, 191, 36)'; // amber
    case 'backlog':
    default:
      return 'rgb(148, 163, 184)'; // slate
  }
};

export const RulesListView: React.FC<RulesListViewProps> = ({ filteredRules }) => {
  const {
    ruleGroups,
    rulesDisplayGrouping,
    rulesDisplayOrdering,
    setRulesDisplayOrdering,
    rulesDisplayProperties,
    rulesCollapsedGroups,
    toggleRulesGroupCollapse,
    openCreateRuleModal,
  } = useAppStore();
  const columns = getRulesColumns(rulesDisplayProperties);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const directionFactor = sortDirection === 'asc' ? 1 : -1;

  if (rulesDisplayOrdering === 'name') {
    filteredRules = [...filteredRules].sort((a, b) => a.name.localeCompare(b.name) * directionFactor);
  } else if (rulesDisplayOrdering === 'status') {
    const statusOrder: Record<string, number> = { active: 1, paused: 2 };
    filteredRules = [...filteredRules].sort(
      (a, b) => ((statusOrder[a.status] || 99) - (statusOrder[b.status] || 99)) * directionFactor
    );
  } else if (rulesDisplayOrdering === 'lastRun') {
    // Sort on the raw timestamp: the visible label is relative text like "3h ago".
    filteredRules = [...filteredRules].sort(
      (a, b) =>
        ((Date.parse(b.preset.last_run_at) || 0) - (Date.parse(a.preset.last_run_at) || 0)) *
        directionFactor,
    );
  }

  const renderGroup = (id: string, title: string, dotColor: string, rules: RuleItem[], groupId?: string) => {
    if (rules.length === 0) return null;
    return (
      <LinearDataListGroup
        key={id}
        title={title}
        count={rules.length}
        dotColor={dotColor}
        isCollapsed={rulesCollapsedGroups.includes(id)}
        onToggleCollapse={() => toggleRulesGroupCollapse(id)}
        actionLabel="Create rule in group"
        onAction={() => openCreateRuleModal(groupId)}
      >
        {rules.map((rule) => <RuleRow key={rule.id} rule={rule} />)}
      </LinearDataListGroup>
    );
  };

  const renderRows = () => {
    if (filteredRules.length === 0) {
      return <DataState title="No rules found" detail="No rules match the current filters." />;
    }
    if (rulesDisplayGrouping === 'none') {
      return filteredRules.map((rule) => <RuleRow key={rule.id} rule={rule} />);
    }
    if (rulesDisplayGrouping === 'status') {
      return (
        <>
          {renderGroup('status-active', 'Active rules', 'rgb(52, 211, 153)', filteredRules.filter((r) => r.status === 'active'))}
          {renderGroup('status-paused', 'Paused rules', 'rgb(156, 163, 175)', filteredRules.filter((r) => r.status === 'paused'))}
        </>
      );
    }
    const allGroupRuleIds = new Set(ruleGroups.flatMap((g) => g.ruleIds));
    return (
      <>
        {ruleGroups.map((group) => renderGroup(
          group.id,
          group.name,
          getGroupDotColor(group.icon),
          filteredRules.filter((r) => r.groupId === group.id || group.ruleIds.includes(r.id)),
          group.id,
        ))}
        {/* Rules that belong to no rule group. */}
        {renderGroup(
          'ungrouped',
          'Ungrouped rules',
          'rgb(148, 163, 184)',
          filteredRules.filter((r) => !r.groupId && !allGroupRuleIds.has(r.id)),
        )}
      </>
    );
  };

  return (
    <LinearDataTable
      columns={columns}
      sortKey={rulesDisplayOrdering === 'manual' || rulesDisplayOrdering === 'status' ? undefined : rulesDisplayOrdering}
      sortDirection={sortDirection}
      onSort={(columnId) => {
        if (rulesDisplayOrdering === columnId) {
          setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
        } else {
          setRulesDisplayOrdering(columnId as 'name' | 'lastRun');
          setSortDirection(columnId === 'name' ? 'asc' : 'desc');
        }
      }}
    >
      {renderRows()}
    </LinearDataTable>
  );
};
