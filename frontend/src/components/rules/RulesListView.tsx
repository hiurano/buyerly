import React, { useState } from 'react';
import { RuleItem, useAppStore } from '@/store/useAppStore';
import { RuleRow } from './RuleRow';
import { RuleGroupHeader } from './RuleGroupHeader';
import { LinearDataListColumnHeader, LinearDataListStack, LinearDataListViewport } from '@/ui/LinearDataList';
import { getRulesColumns, getRulesTableMinWidth } from './tableColumns';

interface RulesListViewProps {
  filteredRules: RuleItem[];
}

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
  const tableMinWidth = getRulesTableMinWidth(columns);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const directionFactor = sortDirection === 'asc' ? 1 : -1;

  // 2. Apply Ordering
  if (rulesDisplayOrdering === 'name') {
    filteredRules = [...filteredRules].sort((a, b) => a.name.localeCompare(b.name) * directionFactor);
  } else if (rulesDisplayOrdering === 'status') {
    const statusOrder: Record<string, number> = { active: 1, triggered: 2, paused: 3 };
    filteredRules = [...filteredRules].sort(
      (a, b) => ((statusOrder[a.status] || 99) - (statusOrder[b.status] || 99)) * directionFactor
    );
  } else if (rulesDisplayOrdering === 'lastRun') {
    filteredRules = [...filteredRules].sort((a, b) => a.lastRun.localeCompare(b.lastRun) * directionFactor);
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

  const getGroupAccentLch = (iconType: string) => {
    switch (iconType) {
      case 'shield':
        return 'lch(12.756 12 150)';
      case 'rocket':
        return 'lch(12.756 14 300)';
      case 'flask':
        return 'lch(12.756 14 80)';
      case 'backlog':
      default:
        return 'lch(10.756 1.5 272)';
    }
  };

  // 3. Render content according to grouping mode
  return (
    <LinearDataListViewport horizontal>
      <div style={{ minWidth: `${tableMinWidth}px` }}>
        <LinearDataListColumnHeader
          columns={columns}
          minWidth={tableMinWidth}
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
        />
        <LinearDataListStack>
        {filteredRules.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-[13px] text-[#6b6f76]">
            No rules found
          </div>
        ) : rulesDisplayGrouping === 'none' ? (
          // Flat List
          filteredRules.map((rule) => <RuleRow key={rule.id} rule={rule} />)
        ) : rulesDisplayGrouping === 'status' ? (
          // Grouped by Status (Active, Triggered, Paused)
          (['active', 'triggered', 'paused'] as const).map((status) => {
            const statusRules = filteredRules.filter((r) => r.status === status);
            if (statusRules.length === 0) return null;

            const isCollapsed = rulesCollapsedGroups.includes(`status-${status}`);
            const statusTitle =
              status === 'active'
                ? 'Active rules'
                : status === 'triggered'
                ? 'Triggered rules'
                : 'Paused rules';

            const dotColor =
              status === 'active'
                ? 'rgb(52, 211, 153)'
                : status === 'triggered'
                ? 'rgb(251, 191, 36)'
                : 'rgb(156, 163, 175)';

            return (
              <div key={status}>
                <RuleGroupHeader
                  groupId={`status-${status}`}
                  groupName={statusTitle}
                  count={statusRules.length}
                  dotColor={dotColor}
                  accentLch={
                    status === 'active'
                      ? 'lch(12.756 12 150)'
                      : status === 'triggered'
                      ? 'lch(12.756 14 80)'
                      : 'lch(10.756 1.5 272)'
                  }
                  isCollapsed={isCollapsed}
                  onToggleCollapse={() => toggleRulesGroupCollapse(`status-${status}`)}
                  onAddRule={() => openCreateRuleModal()}
                />
                {!isCollapsed && (
                  <div className="space-y-0.5 pl-0 pt-0.5 pb-2">
                    {statusRules.map((rule) => (
                      <RuleRow key={rule.id} rule={rule} />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          // Grouped by Rule Groups (Default)
          <>
            {ruleGroups.map((group) => {
              const groupRules = filteredRules.filter(
                (r) => r.groupId === group.id || group.ruleIds.includes(r.id)
              );
              if (groupRules.length === 0) return null;

              const isCollapsed = rulesCollapsedGroups.includes(group.id);

              return (
                <div key={group.id}>
                  <RuleGroupHeader
                    groupId={group.id}
                    groupName={group.name}
                    count={groupRules.length}
                    dotColor={getGroupDotColor(group.icon)}
                    accentLch={getGroupAccentLch(group.icon)}
                    isCollapsed={isCollapsed}
                    onToggleCollapse={() => toggleRulesGroupCollapse(group.id)}
                    onAddRule={() => openCreateRuleModal(group.id)}
                  />
                  {!isCollapsed && (
                    <div className="space-y-0.5 pl-0 pt-0.5 pb-2">
                      {groupRules.map((rule) => (
                        <RuleRow key={rule.id} rule={rule} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Ungrouped rules (rules not matching any rule group) */}
            {(() => {
              const allGroupRuleIds = new Set(ruleGroups.flatMap((g) => g.ruleIds));
              const ungroupedRules = filteredRules.filter(
                (r) => !r.groupId && !allGroupRuleIds.has(r.id)
              );

              if (ungroupedRules.length === 0) return null;
              const isCollapsed = rulesCollapsedGroups.includes('ungrouped');

              return (
                <div>
                  <RuleGroupHeader
                    groupId="ungrouped"
                    groupName="Ungrouped rules"
                    count={ungroupedRules.length}
                    dotColor="rgb(148, 163, 184)"
                    accentLch="lch(10.756 1.5 272)"
                    isCollapsed={isCollapsed}
                    onToggleCollapse={() => toggleRulesGroupCollapse('ungrouped')}
                    onAddRule={() => openCreateRuleModal()}
                  />
                  {!isCollapsed && (
                    <div className="space-y-0.5 pl-0 pt-0.5 pb-2">
                      {ungroupedRules.map((rule) => (
                        <RuleRow key={rule.id} rule={rule} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}
        </LinearDataListStack>
      </div>
    </LinearDataListViewport>
  );
};
