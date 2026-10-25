import React, { useMemo } from 'react';
import * as stylex from '@stylexjs/stylex';
import { arrangeBoardColumns, toggleHiddenGroup } from '@/ui/listView';
import { BuyerlyBoard, type BoardLane } from '@/ui/BuyerlyBoard';
import { toast } from '@/ui/toast';
import { RuleCard } from './RuleCard';
import {
  ruleActiveGrouping,
  ruleActiveRows,
  ruleGroupAccounts,
  ruleGroupsFor,
  useRulesView,
  type RuleListGroup,
} from './rulesViewModel';
import { useRulesStore, RuleItem } from '@/models/rulesStore';
import { useDialogStore } from '@/models/dialogStore';
import { useSelectionStore } from '@/models/selectionStore';

const styles = stylex.create({
  dot: {
    height: 8,
    width: 8,
    borderRadius: 9999,
  },
});

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <span {...stylex.props(styles.dot)} style={{ backgroundColor: color }} />
);

/**
 * Rules as Linear's Board (#390): the columns are the grouping's groups, in
 * the member's group order; hidden and empty ones wait in "Hidden columns".
 * By label or status a card moves between columns, which changes that value:
 * into a label it trades the label it came from for the new one, into "No
 * label" it drops that label, into Active or Paused it switches the rule.
 * Rows band the columns; only the column a card lands in decides what changes.
 */
export const RuleBoard: React.FC<{ rules: RuleItem[] }> = ({ rules }) => {
  const ruleLabels = useRulesStore((state) => state.ruleLabels);
  const ruleAccounts = useRulesStore((state) => state.ruleAccounts);
  const selectedRuleId = useSelectionStore((state) => state.selectedRuleId);
  const setSelectedRuleId = useSelectionStore((state) => state.setSelectedRuleId);
  const setRuleLabels = useRulesStore((state) => state.setRuleLabels);
  const toggleRuleStatus = useRulesStore((state) => state.toggleRuleStatus);
  const openCreateRuleModal = useDialogStore((state) => state.openCreateRuleModal);
  const { view, update } = useRulesView();
  const accounts = useMemo(() => ruleGroupAccounts(ruleAccounts), [ruleAccounts]);
  const boardView = { ...view, grouping: ruleActiveGrouping(view) };
  const rowsGrouping = ruleActiveRows(view);
  const { shown, hidden } = arrangeBoardColumns(ruleGroupsFor(boardView.grouping, rules, ruleLabels, accounts), boardView);
  // Every grouping is a known set, so Show empty rows can show any band without cards.
  const lanes: BoardLane<RuleItem>[] | undefined = rowsGrouping === 'none'
    ? undefined
    : ruleGroupsFor(rowsGrouping, rules, ruleLabels, accounts)
      .filter((lane) => lane.rows.length > 0 || view.showEmptySubGroups)
      .map((lane) => ({
        id: lane.id,
        label: lane.label,
        icon: <Dot color={lane.dotColor} />,
        cells: Object.fromEntries(shown.map((column) => [column.id, column.rows.filter((rule) => lane.rows.includes(rule))])),
      }));
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
      lanes={lanes}
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
