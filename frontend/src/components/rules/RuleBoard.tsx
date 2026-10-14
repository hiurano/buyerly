import React, { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { RuleItem, useAppStore } from '@/store/useAppStore';
import { arrangeGroups } from '@/ui/listView';
import { toast } from '@/ui/toast';
import { RuleColumn } from './RuleColumn';
import { RuleCard } from './RuleCard';
import {
  RULE_GROUPINGS,
  ruleGroupAccounts,
  ruleGroupsFor,
  useRulesView,
  type RuleListGroup,
} from './rulesViewModel';

/** A card's drag handle: the whole card, once the pointer has moved a little, so a click still opens it. */
const DraggableCard: React.FC<React.PropsWithChildren<{ id: string; disabled: boolean }>> = ({ id, disabled, children }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // The card itself is the focusable button; the wrapper only carries the drag.
      tabIndex={-1}
      role="presentation"
      data-rule-drag={disabled ? undefined : id}
      style={{ opacity: isDragging ? 0.4 : 1, outline: 'none' }}
    >
      {children}
    </div>
  );
};

const DroppableColumn: React.FC<React.PropsWithChildren<{ id: string; disabled: boolean }>> = ({ id, disabled, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div ref={setNodeRef} data-board-column={id} data-drop-over={isOver ? 'true' : undefined} className="h-full">
      {children}
    </div>
  );
};

/**
 * Rules as Linear's Board (#390): the columns are the grouping's groups
 * (Columns = Grouping), every one shown, in the member's group order. By
 * label or status a card moves between columns, which changes that value:
 * into a label it trades the label it came from for the new one, into "No
 * label" it drops that label, into Active or Paused it switches the rule.
 */
export const RuleBoard: React.FC<{ rules: RuleItem[] }> = ({ rules }) => {
  const { ruleLabels, ruleAccounts, selectedRuleId, setSelectedRuleId, setRuleLabels, toggleRuleStatus } = useAppStore();
  const { view } = useRulesView();
  const accounts = useMemo(() => ruleGroupAccounts(ruleAccounts), [ruleAccounts]);
  const grouping = RULE_GROUPINGS.some((option) => option.value === view.grouping) ? view.grouping : 'none';
  const groups: RuleListGroup[] = grouping === 'none'
    ? [{ id: 'all', label: 'All rules', dotColor: '', rows: rules }]
    : arrangeGroups(ruleGroupsFor(grouping, rules, ruleLabels, accounts), { ...view, showEmptyGroups: true });
  const [dragging, setDragging] = useState<{ rule: RuleItem; from: RuleListGroup } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const movable = groups.some((group) => group.drop);

  const dragKey = (group: RuleListGroup, rule: RuleItem) => `${group.id}::${rule.id}`;
  const find = (key: string) => {
    const [groupId, ruleId] = key.split('::');
    const from = groups.find((group) => group.id === groupId);
    const rule = from?.rows.find((row) => row.id === ruleId);
    return from && rule ? { from, rule } : null;
  };

  const onDragStart = (event: DragStartEvent) => setDragging(find(String(event.active.id)));

  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const source = find(String(event.active.id));
    const target = groups.find((group) => group.id === event.over?.id);
    if (!source || !target?.drop || target.id === source.from.id) return;
    const { rule, from } = source;
    if (target.drop.kind === 'label') {
      const fromLabel = from.drop?.kind === 'label' ? from.drop.labelId : null;
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
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="flex h-full items-start gap-0 pb-2">
        {groups.map((group) => (
          <DroppableColumn key={group.id} id={group.id} disabled={!group.drop}>
            <RuleColumn
              title={group.label}
              dotColor={group.dotColor || undefined}
              rules={group.rows}
              labelId={group.labelId}
              renderCard={(rule) => (
                <DraggableCard key={dragKey(group, rule)} id={dragKey(group, rule)} disabled={!movable || !group.drop}>
                  <RuleCard
                    rule={rule}
                    isSelected={rule.id === selectedRuleId}
                    onSelect={() => setSelectedRuleId(rule.id === selectedRuleId ? null : rule.id)}
                  />
                </DraggableCard>
              )}
            />
          </DroppableColumn>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div style={{ transform: 'rotate(1.5deg)', boxShadow: 'var(--dropdown-shadow)', borderRadius: 8 }}>
            <RuleCard rule={dragging.rule} isSelected={false} onSelect={() => undefined} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};
