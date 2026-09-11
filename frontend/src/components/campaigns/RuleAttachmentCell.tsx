import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { LinearBoltIcon } from '@/icons/LinearIcons';
import { RuleSelectorPopover } from './RuleSelectorPopover';
import type { RuleTargetLevel } from './RuleSelectorPopover';

interface RuleAttachmentCellProps {
  level: RuleTargetLevel;
  entityId: string;
  attachedRuleIds: string[];
  /** Called before the picker opens, so the row can take focus. */
  onOpen?: () => void;
}

/** Lets the row's keyboard shortcut open the picker the cell owns. */
export interface RuleAttachmentCellHandle {
  open: () => void;
}

const LABEL_FONT = '"Inter Variable", "SF Pro Display", -apple-system, sans-serif';

/**
 * The Rules cell of a campaign or ad set row: how many rules are aimed at this
 * entity, and the picker to change that. Shared so both levels stay identical.
 */
export const RuleAttachmentCell = forwardRef<
  RuleAttachmentCellHandle,
  RuleAttachmentCellProps
>(({ level, entityId, attachedRuleIds, onOpen }, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const cellRef = useRef<HTMLDivElement>(null);

  const attachedCount = attachedRuleIds.length;

  const open = (event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
      setAnchorRect(event.currentTarget.getBoundingClientRect());
    } else if (cellRef.current) {
      setAnchorRect(cellRef.current.getBoundingClientRect());
    }
    onOpen?.();
    setIsOpen(true);
  };

  useImperativeHandle(ref, () => ({ open: () => open() }), []);

  return (
    <div ref={cellRef} className="flex min-w-0 items-center">
      {attachedCount > 0 ? (
        <button
          type="button"
          onClick={open}
          style={{
            height: '22px',
            padding: '0 8px',
            borderRadius: '9999px',
            backgroundColor: 'var(--item-hover-bg)',
            border: '1px solid var(--color-border-secondary)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            cursor: 'pointer',
            outline: 'none',
            transition: 'border-color 0.15s, background-color 0.15s',
          }}
        >
          <div className="flex h-3.5 w-3.5 items-center justify-center flex-shrink-0">
            <LinearBoltIcon size={12} className="text-[#eab308]" />
          </div>
          <span
            style={{
              fontFamily: LABEL_FONT,
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}
          >
            {attachedCount} {attachedCount === 1 ? 'rule' : 'rules'}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={open}
          style={{
            height: '22px',
            padding: '0 8px',
            borderRadius: '9999px',
            backgroundColor: 'transparent',
            border: '1px dashed var(--color-border-secondary)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            cursor: 'pointer',
            outline: 'none',
            transition: 'opacity 0.15s, border-color 0.15s, background-color 0.15s, color 0.15s',
          }}
          className="opacity-0 group-hover/row:opacity-100 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--color-border-secondary)] hover:bg-[var(--item-hover-bg)]"
          title="Add rule (R)"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          >
            <line x1="5" y1="2" x2="5" y2="8" />
            <line x1="2" y1="5" x2="8" y2="5" />
          </svg>
          <span
            style={{
              fontFamily: LABEL_FONT,
              fontSize: '12px',
              fontWeight: 500,
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}
          >
            Rule
          </span>
        </button>
      )}

      <RuleSelectorPopover
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRect={anchorRect}
        level={level}
        entityId={entityId}
      />
    </div>
  );
});

RuleAttachmentCell.displayName = 'RuleAttachmentCell';
