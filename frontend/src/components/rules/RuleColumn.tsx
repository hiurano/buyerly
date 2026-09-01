import React from 'react';
import { RuleItem, useAppStore } from '@/store/useAppStore';
import { RuleCard } from './RuleCard';
import { Tooltip } from '@/ui/Tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/ui/DropdownMenu';

interface RuleColumnProps {
  id: string;
  title: string;
  rules: RuleItem[];
  isSystemColumn?: boolean;
  onAddRule?: () => void;
}

export const RuleColumn: React.FC<RuleColumnProps> = ({
  id,
  title,
  rules,
  isSystemColumn = false,
  onAddRule,
}) => {
  const { selectedRuleId, setSelectedRuleId, deleteRuleGroup, openCreateRuleModal } = useAppStore();

  const handleDefaultAdd = () => {
    if (onAddRule) {
      onAddRule();
    } else {
      openCreateRuleModal(isSystemColumn ? undefined : id);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '348px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {/* 1. Exact Linear Column Lane Background Gradient (Spans whole column 5px radius at top) */}
      <div
        style={{
          position: 'absolute',
          top: '4px',
          left: '4px',
          right: '4px',
          bottom: '0px',
          borderRadius: '5px 5px 0 0',
          backgroundImage: 'linear-gradient(var(--bg-sidebar), var(--bg-canvas))',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* 2. Exact Linear Column Header (348px x 50px) */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '348px',
          height: '50px',
          padding: '2px 12px 0 18px',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        {/* Left: Group Title + Counter */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span
            style={{
              fontSize: '13px',
              fontWeight: 500,
              lineHeight: '16px',
              color: 'var(--text-secondary)',
              marginLeft: '2px',
            }}
            className="truncate"
          >
            {title}
          </span>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 450,
              lineHeight: '16px',
              color: 'var(--text-tertiary)',
            }}
          >
            {rules.length}
          </span>
        </div>

        {/* Right: 2 Action Buttons ('...' and '+') */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
          }}
        >
          {/* '...' More Actions Button & Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Open menu"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  minWidth: '24px',
                  padding: '0',
                  border: '1px solid transparent',
                  borderRadius: '9999px',
                  background: 'transparent',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                }}
                className="hover:bg-[var(--item-hover-bg)] group outline-none"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="var(--text-tertiary)" className="group-hover:fill-[var(--text-primary)] transition-colors">
                  <path d="M3 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={4}>
              <DropdownMenuItem onClick={() => {}}>
                <span>Select all in column</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {}}>
                <span>Hide column</span>
              </DropdownMenuItem>
              {!isSystemColumn && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => deleteRuleGroup(id)}
                    className="text-[#f87171] hover:text-[#f87171] focus:text-[#f87171]"
                  >
                    <span>Delete group</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* '+' Add Button with Linear Tooltip */}
          <Tooltip
            side="bottom"
            sideOffset={8}
            content={
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-[450] text-[#e4e7e8] leading-[18px]">
                  Add rule...
                </span>
                <kbd className="inline-flex items-center justify-center min-w-[18px] h-[19px] px-1 rounded-[4px] border border-[#282b2d] text-[12px] font-normal text-[#9d9d9e] bg-transparent">
                  C
                </kbd>
              </div>
            }
          >
            <button
              type="button"
              onClick={handleDefaultAdd}
              aria-label="Add rule"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                minWidth: '24px',
                padding: '0',
                border: '1px solid transparent',
                borderRadius: '9999px',
                background: 'transparent',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
              }}
              className="hover:bg-[var(--item-hover-bg)] group outline-none"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="var(--text-tertiary)" className="group-hover:fill-[var(--text-primary)] transition-colors">
                <path d="M8.75 4C8.75 3.58579 8.41421 3.25 8 3.25C7.58579 3.25 7.25 3.58579 7.25 4V7.25H4C3.58579 7.25 3.25 7.58579 3.25 8C3.25 8.41421 3.58579 8.75 4 8.75H7.25V12C7.25 12.4142 7.58579 12.75 8 12.75C8.41421 12.75 8.75 12.4142 8.75 12V8.75H12C12.4142 8.75 12.75 8.41421 12.75 8C12.75 7.58579 12.4142 7.25 12 7.25H8.75V4Z" />
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* 3. Cards Scroll List (Exact 9px vertical gap to first card, 12px side padding) */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '9px 12px 16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {rules.map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            isSelected={rule.id === selectedRuleId}
            onSelect={() =>
              setSelectedRuleId(
                rule.id === selectedRuleId ? null : rule.id
              )
            }
          />
        ))}
      </div>
    </div>
  );
};
