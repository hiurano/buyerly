import React from 'react';
import { RuleItem, useAppStore } from '@/store/useAppStore';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuSeparator,
} from '@/ui/ContextMenu';
import {
  LinearLabelIcon,
  LinearTrashIcon,
  LinearCheckIcon,
} from '@/icons/LinearIcons';
import { ruleActionTone } from '@/lib/rules';
import type { RuleActionTone } from '@/lib/rules';
import { ruleStatesTitle } from './RuleStatesDialog';
import { labelsOf } from './rulesViewModel';
import { RuleLabelPills } from './RuleLabelPills';

const ACTION_DOT_COLORS: Record<RuleActionTone, string> = {
  stop: 'var(--rules-action-stop-text)',
  positive: 'var(--rules-action-positive-text)',
  default: 'var(--rules-action-default-text)',
};

interface RuleCardProps {
  rule: RuleItem;
  isSelected: boolean;
  onSelect: () => void;
}

export const RuleCard: React.FC<RuleCardProps> = ({
  rule,
  isSelected,
  onSelect,
}) => {
  const { ruleLabels, setRuleLabels, requestDeletion, openEditRuleModal } = useAppStore();
  const cardLabels = labelsOf(rule, ruleLabels);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          // The board's card is the rule's row: a search result or link opens it here.
          data-row-id={rule.id}
          onClick={onSelect}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect();
            }
          }}
          data-is-active={isSelected ? 'true' : 'false'}
          style={{
            width: '100%',
            backgroundColor: isSelected ? 'var(--item-active-bg)' : 'var(--card-bg)',
            borderRadius: '8px',
            boxShadow: isSelected
              ? '0 0 0 1px var(--color-border-secondary), var(--canvas-shadow)'
              : '0 0 0 0.5px var(--board-card-ring), var(--canvas-shadow)',
            padding: '8px',
            cursor: 'pointer',
            transition: 'background-color 0.1s ease',
          }}
          className="flex flex-col justify-center select-none text-left outline-none hover:bg-[var(--item-hover-bg)] group"
        >
          {/* 1. Top Row: Issue ID */}
          <div className="flex items-center justify-between">
            <span
              style={{
                fontSize: '12px',
                fontWeight: 450,
                color: 'var(--text-tertiary)',
                letterSpacing: '-0.24px',
              }}
            >
              {rule.identifier}
            </span>
          </div>

          {/* 2. Title Row (Clean Title without icon) */}
          <div className="mt-1">
            <span
              style={{
                fontSize: '13px',
                fontWeight: 500,
                lineHeight: '16px',
                color: 'var(--text-primary)',
              }}
              className="line-clamp-2 block"
            >
              {rule.name}
            </span>
          </div>

          {/* 3. Badge / Tag Pills Row (24px height, 48px/pill radius, 1px #2f3132 border) */}
          <div className="flex items-center gap-1 mt-2.5 overflow-hidden">
            {/* Condition Badge */}
            <div
              style={{
                height: '24px',
                borderRadius: '9999px',
                border: '1px solid var(--rules-property-border)',
                padding: '0 8px',
                backgroundColor: 'var(--rules-property-bg)',
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: '12px',
                fontWeight: 450,
                color: 'var(--rules-property-text)',
              }}
              className="truncate max-w-[180px]"
              title={rule.condition}
            >
              {rule.condition}
            </div>

            {/* Action Badge */}
            <div
              style={{
                height: '24px',
                borderRadius: '9999px',
                border: '1px solid var(--rules-property-border)',
                padding: '0 8px',
                backgroundColor: 'var(--rules-property-bg)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                fontWeight: 450,
                color: 'var(--rules-property-text)',
              }}
              className="shrink-0"
            >
              <div
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: ACTION_DOT_COLORS[ruleActionTone(rule.actionKind)],
                }}
              />
              <span>{rule.action}</span>
            </div>
          </div>

          {cardLabels.length > 0 && <RuleLabelPills labels={cardLabels} className="mt-1.5" />}

          {/* 4. Bottom Metadata Row (Last check / Last action) */}
          <div
            style={{
              marginTop: '6px',
              fontSize: '12px',
              fontWeight: 450,
              color: 'var(--text-tertiary)',
            }}
          >
            Last check {rule.lastCheck} · Last action {rule.lastRun}
          </div>
        </div>
      </ContextMenuTrigger>

      {/* Linear Card Context Menu Popup */}
      <ContextMenuContent>
        <ContextMenuItem onClick={() => openEditRuleModal(rule.id)}>
          <div className="flex items-center gap-2">
            <span>Edit rule</span>
          </div>
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Labels, as Linear's card menu: each one on or off, the menu stays open. */}
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <div className="flex items-center gap-2">
              <LinearLabelIcon size={16} className="text-[var(--text-tertiary)]" />
              <span>Labels</span>
            </div>
            <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
              <kbd className="text-[12px] font-[500] font-sans">L</kbd>
              <span className="text-[10px]">▶</span>
            </div>
          </ContextMenuSubTrigger>

          <ContextMenuSubContent>
            {ruleLabels.length === 0 ? (
              <div className="px-3.5 py-2 text-[12px] text-[var(--text-muted)]">
                No labels yet. Create one in Settings → Rules → Labels.
              </div>
            ) : (
              ruleLabels.map((label) => {
                const on = rule.labelIds.includes(label.id);
                return (
                  <ContextMenuItem
                    key={label.id}
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onSelect={(event) => {
                      event.preventDefault();
                      void setRuleLabels(rule.id, on ? rule.labelIds.filter((id) => id !== label.id) : [...rule.labelIds, label.id]);
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
                      <span className="truncate">{label.name}</span>
                    </div>
                    {on && <LinearCheckIcon size={16} className="shrink-0 text-[var(--text-secondary)]" />}
                  </ContextMenuItem>
                );
              })
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        {/* Where the rule stands on each campaign it checks (#322). */}
        <ContextMenuItem onClick={() => useAppStore.getState().openRuleStates(rule.id)}>
          <div className="flex items-center gap-2">
            <span>{ruleStatesTitle(rule)}</span>
          </div>
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Delete Item */}
        <ContextMenuItem
          onClick={() => requestDeletion('rule', [rule.id])}
          className="text-[#e4e7e8] hover:text-white"
        >
          <div className="flex items-center gap-2">
            <LinearTrashIcon size={16} className="text-[#9d9d9e] group-hover:text-white group-data-[highlighted]:text-white" />
            <span>Delete</span>
          </div>
          <div className="flex items-center gap-1 text-[#9d9d9e]">
            <kbd className="text-[12px] font-[500] font-sans">Ctrl</kbd>
            <kbd className="text-[12px] font-[500] font-sans">Delete</kbd>
          </div>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
