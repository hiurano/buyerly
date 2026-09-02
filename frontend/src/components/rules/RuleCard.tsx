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
  LinearHalfStatusIcon,
  LinearTrashIcon,
  LinearCheckIcon,
} from '@/icons/LinearIcons';

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
  const { ruleGroups, addRuleToGroup, deleteRule } = useAppStore();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          onClick={onSelect}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect();
            }
          }}
          data-is-active={isSelected ? 'true' : 'false'}
          style={{
            width: '319px',
            backgroundColor: isSelected ? 'var(--item-active-bg)' : 'var(--card-bg)',
            borderRadius: '8px',
            boxShadow: isSelected
              ? '0 0 0 1px var(--color-border-secondary), var(--canvas-shadow)'
              : '0 0 0 1px var(--card-border), var(--canvas-shadow)',
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
                  backgroundColor: rule.action.includes('PAUSE')
                    ? '#f87171'
                    : rule.action.includes('BUDGET')
                    ? '#34d399'
                    : '#60a5fa',
                }}
              />
              <span>{rule.action}</span>
            </div>
          </div>

          {/* 4. Bottom Metadata Row (Created / Last Run) */}
          <div
            style={{
              marginTop: '6px',
              fontSize: '12px',
              fontWeight: 450,
              color: 'var(--text-tertiary)',
            }}
          >
            Last run {rule.lastRun}
          </div>
        </div>
      </ContextMenuTrigger>

      {/* Linear Card Context Menu Popup */}
      <ContextMenuContent>
        {/* Status / Group Cascading Submenu */}
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <div className="flex items-center gap-2">
              <LinearHalfStatusIcon size={16} className="text-[#9d9d9e] group-hover:text-white group-data-[highlighted]:text-white" />
              <span>Group</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#9d9d9e]">
              <kbd className="text-[12px] font-[500] font-sans">G</kbd>
              <span className="text-[10px]">▶</span>
            </div>
          </ContextMenuSubTrigger>

          <ContextMenuSubContent>
            {/* Search / Title Header */}
            <div className="h-[37px] px-3.5 border-b border-[#282b2d] flex items-center">
              <span className="text-[13px] text-[#e2e4e9] font-normal">Change group…</span>
            </div>

            {/* List of Groups */}
            <div className="py-1.5">
              {ruleGroups.map((group, index) => {
                const isSelectedGroup = rule.groupId === group.id || group.ruleIds.includes(rule.id);
                return (
                  <ContextMenuItem
                    key={group.id}
                    onClick={() => addRuleToGroup(group.id, rule.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate">{group.name}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isSelectedGroup && (
                        <LinearCheckIcon size={16} className="text-[#95a2b3]" />
                      )}
                      <kbd className="text-[12px] font-[500] font-sans text-[#95a2b3]">
                        {index + 1}
                      </kbd>
                    </div>
                  </ContextMenuItem>
                );
              })}
            </div>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        {/* Delete Item */}
        <ContextMenuItem
          onClick={() => deleteRule(rule.id)}
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
