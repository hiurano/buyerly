import React, { useMemo } from 'react';
import { RuleItem, useAppStore } from '@/store/useAppStore';
import { arrangeBoardColumns, boardGrouping, toggleHiddenGroup } from '@/ui/listView';
import { BuyerlyBoard } from '@/ui/BuyerlyBoard';
import { toast } from '@/ui/toast';
import { RuleCard } from './RuleCard';
import {
  RULE_BOARD_FALLBACK,
  RULE_GROUPINGS,
  ruleGroupAccounts,
  ruleGroupsFor,
  useRulesView,
  type RuleListGroup,
} from './rulesViewModel';

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
);

/**
 * Rules as Linear's Board (#390): the columns are the grouping's groups, in
 * the member's group order; hidden and empty ones wait in "Hidden columns".
 * By label or status a card moves between columns, which changes that value:
 * into a label it trades the label it came from for the new one, into "No
 * label" it drops that label, into Active or Paused it switches the rule.
 */
export const RuleBoard: React.FC<{ rules: RuleItem[] }> = ({ rules }) => {
  const { ruleLabels, ruleAccounts, selectedRuleId, setSelectedRuleId, setRuleLabels, toggleRuleStatus, openCreateRuleModal } = useAppStore();
  const { view, update } = useRulesView();
  const accounts = useMemo(() => ruleGroupAccounts(ruleAccounts), [ruleAccounts]);
  const saved = RULE_GROUPINGS.some((option) => option.value === view.grouping) ? view.grouping : 'none';
  const boardView = { ...view, grouping: boardGrouping(saved, RULE_BOARD_FALLBACK) };
  const { shown, hidden } = arrangeBoardColumns(ruleGroupsFor(boardView.grouping, rules, ruleLabels, accounts), boardView);
  // A card can also drop on a hidden column's row in the lane.
  const groupOf = (id: string): RuleListGroup | undefined =>
    [...shown, ...hidden.map(({ group }) => group)].find((group) => group.id === id);

  const card = (rule: RuleItem) => (
    <RuleCard
      rule={rule}
      isSelected={rule.id === selectedRuleId}
      onSelect={() => setSelectedRuleId(rule.id === selectedRuleId ? null : rule.id)}
    />
  );

  const onMove = (rule: RuleItem, fromId: string, toId: string) => {
    const from = groupOf(fromId);
    const target = groupOf(toId);
    if (!target?.drop) return;
    if (target.drop.kind === 'label') {
      const fromLabel = from?.drop?.kind === 'label' ? from.drop.labelId : null;
      const toLabel = target.drop.labelId;
      const kept = rule.labelIds.filter((id) => id !== fromLabel && id !== toLabel);
      void setRuleLabels(rule.id, toLabel ? [...kept, toLabel] : kept);
      return;
    }
    const enable = target.drop.enabled;
    if (rule.needsReview && enable) {
      toast.error("Couldn't turn the rule on", rule.reviewReason || 'Open it and save it again before switching it on.');
      return;
    }
    if ((rule.status === 'active') !== enable) void toggleRuleStatus(rule.id);
  };

  return (
    <BuyerlyBoard
      columns={shown.map((group) => ({ id: group.id, label: group.label, icon: <Dot color={group.dotColor} />, rows: group.rows }))}
      hiddenColumns={hidden.map(({ group, hiddenByMember }) => ({
        id: group.id,
        label: group.label,
        icon: <Dot color={group.dotColor} />,
        count: group.rows.length,
        hiddenByMember,
      }))}
      rowKey={(rule) => rule.id}
      renderCard={card}
      onHideColumn={(id) => update(toggleHiddenGroup(boardView, id))}
      onShowColumn={(id) => update(toggleHiddenGroup(boardView, id))}
      add={{ label: 'Add rule...', shortcut: 'C', run: (id) => openCreateRuleModal(groupOf(id)?.labelId) }}
      move={shown.some((group) => group.drop) || hidden.some(({ group }) => group.drop) ? {
        canMove: (id) => Boolean(groupOf(id)?.drop),
        onMove,
        renderOverlay: card,
      } : undefined}
    />
  );
};
