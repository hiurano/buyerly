import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LinearBoltIcon } from '@/icons/LinearIcons';
import { useAppStore } from '@/store/useAppStore';
import type { RuleItem } from '@/store/useAppStore';

/** The level this picker attaches rules to. */
export type RuleTargetLevel = 'campaign' | 'adset';

interface RuleSelectorPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  /** The control it opened from; without one it sits centred, as a menu does. */
  anchorRect: DOMRect | null;
  level: RuleTargetLevel;
  /** One row's id, or every selected row of the level. */
  entityIds: string[];
  /** The key that opened it, shown in the field. */
  shortcut?: string;
}

/** Fingers get taller rows and no keyboard popping up over the list. */
const isCoarsePointer = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(hover: none) and (pointer: coarse)').matches;

/**
 * Rule picker follows the same interaction contract as Linear's label picker:
 * selected items first, multi-select without closing, search and keyboard navigation.
 * Over several rows, a rule on only some of them shows as mixed, and picking it
 * aims it at all of them.
 */
export const RuleSelectorPopover: React.FC<RuleSelectorPopoverProps> = ({
  isOpen,
  onClose,
  anchorRect,
  level,
  entityIds,
  shortcut,
}) => {
  const {
    rules,
    campaignAttachedRules,
    adSetAttachedRules,
    toggleRuleForEntities,
    attachedRuleScopes,
    attachmentError,
    clearAttachmentError,
    rulesLoadState,
    loadRules,
  } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const coarse = isCoarsePointer();

  const attachedByEntity =
    level === 'campaign' ? campaignAttachedRules : adSetAttachedRules;
  /** Rule id → how many of these rows it is aimed at. */
  const coverage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entityId of entityIds) {
      for (const ruleId of attachedByEntity[entityId] || []) {
        counts.set(ruleId, (counts.get(ruleId) ?? 0) + 1);
      }
    }
    return counts;
  }, [attachedByEntity, entityIds]);
  const filteredRules = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return rules.filter(
      (rule) =>
        rule.name.toLowerCase().includes(query) ||
        rule.identifier.toLowerCase().includes(query) ||
        rule.condition.toLowerCase().includes(query)
    );
  }, [rules, searchQuery]);

  const attachedRules = filteredRules.filter((rule) => coverage.has(rule.id));
  const unattachedRules = filteredRules.filter((rule) => !coverage.has(rule.id));
  const orderedRules = [...attachedRules, ...unattachedRules];

  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery('');
    setActiveIndex(-1);
    clearAttachmentError();
    if (isCoarsePointer()) return;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(focusTimer);
  }, [isOpen, clearAttachmentError]);

  // Ads Manager can be opened before the Rules screen ever was; the list is
  // read when a picker first needs it, not on every visit.
  useEffect(() => {
    if (!isOpen) return;
    const { rulesLoadState: state } = useAppStore.getState();
    if (state === 'idle' || state === 'error') void loadRules();
  }, [isOpen, loadRules]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (activeIndex >= orderedRules.length) setActiveIndex(-1);
  }, [activeIndex, orderedRules.length]);

  if (!isOpen || entityIds.length === 0) return null;

  const popoverWidth = 279;
  const rowHeight = coarse ? 44 : 32;
  const estimatedHeight = Math.min(44 + orderedRules.length * rowHeight + 16, 395);
  const margin = 8;
  let left: number;
  let top: number;

  if (anchorRect) {
    left = anchorRect.left;
    top = anchorRect.bottom + 6;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - popoverWidth - margin;
    }
    if (top + estimatedHeight > window.innerHeight - margin) {
      top = Math.max(margin, anchorRect.top - estimatedHeight - 6);
    }
  } else {
    left = (window.innerWidth - popoverWidth) / 2;
    top = Math.round(window.innerHeight * 0.13);
  }
  left = Math.max(margin, left);

  const thisNoun = level === 'campaign' ? 'campaign' : 'ad set';
  const otherNoun = level === 'campaign' ? 'ad sets' : 'campaigns';
  const nouns = (count: number) => `${count} ${thisNoun}${count === 1 ? '' : 's'}`;

  /**
   * What this rule is currently aimed at. A rule aimed at another level cannot
   * be re-aimed from here, so the note says where it lives instead.
   */
  const scopeNote = (rule: RuleItem): string => {
    const scope = attachedRuleScopes[rule.id];
    if (!scope) return '';
    if (scope.level === 'account') return 'Whole account';
    if (scope.level !== level) return `Specific ${otherNoun}`;
    const covered = coverage.get(rule.id) ?? 0;
    if (covered === 0) {
      return `${scope.ids.length} other ${thisNoun}${scope.ids.length === 1 ? '' : 's'}`;
    }
    if (covered < entityIds.length) return `${covered} of ${entityIds.length} selected`;
    if (scope.ids.length === covered) {
      return entityIds.length === 1 ? `This ${thisNoun}` : `These ${nouns(covered)}`;
    }
    return nouns(scope.ids.length);
  };

  const isLocked = (rule: RuleItem): boolean => {
    const scope = attachedRuleScopes[rule.id];
    return Boolean(scope) && scope.level !== level;
  };

  const toggleRule = (rule: RuleItem) => {
    void toggleRuleForEntities(level, entityIds, rule.id);
    if (!coarse) window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) =>
        orderedRules.length === 0 ? -1 : index < 0 ? 0 : (index + 1) % orderedRules.length
      );
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) =>
        orderedRules.length === 0
          ? -1
          : index < 0
          ? orderedRules.length - 1
          : (index - 1 + orderedRules.length) % orderedRules.length
      );
      return;
    }

    if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      toggleRule(orderedRules[activeIndex]);
    }
  };

  const optionId = (rule: RuleItem) => `${listId}-rule-${rule.id}`;

  const renderOption = (rule: RuleItem, index: number) => {
    const covered = coverage.get(rule.id) ?? 0;
    const isSelected = covered === entityIds.length;
    const isMixed = covered > 0 && !isSelected;
    const isActive = activeIndex === index;
    const locked = isLocked(rule);
    const note = scopeNote(rule);

    return (
      <li
        id={optionId(rule)}
        key={rule.id}
        role="option"
        aria-selected={isSelected}
        aria-checked={isMixed ? 'mixed' : isSelected}
        aria-disabled={locked}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => toggleRule(rule)}
        style={{
          position: 'relative',
          display: 'flex',
          height: rowHeight,
          alignItems: 'center',
          padding: '0 18px 0 14px',
          cursor: locked ? 'not-allowed' : 'pointer',
          opacity: locked ? 0.55 : 1,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: '0 6px',
            borderRadius: 8,
            backgroundColor: isActive ? 'var(--item-hover-bg)' : 'transparent',
            transition: 'background-color 80ms ease',
          }}
        />

        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            width: 16,
            height: 14,
            flexShrink: 0,
            alignItems: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 14,
              height: 14,
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
              borderRadius: 3,
              backgroundColor: isSelected || isMixed ? '#eab308' : 'transparent',
              border: isSelected || isMixed
                ? '1px solid #eab308'
                : '1px solid var(--checkbox-border-rest)',
              color: '#09090a',
            }}
          >
            {isSelected && (
              <svg width="10" height="9" viewBox="0 0 10 8" fill="currentColor" aria-hidden="true">
                <path d="M3.46975 5.70757L1.88358 4.1225C1.65832 3.8974 1.29423 3.8974 1.06897 4.1225C0.843675 4.34765 0.843675 4.7116 1.06897 4.93674L3.0648 6.93117C3.29006 7.15628 3.65414 7.15628 3.8794 6.93117L8.93103 1.88306C9.15633 1.65792 9.15633 1.29397 8.93103 1.06883C8.70578 0.843736 8.34172 0.843724 8.11646 1.06879L3.46975 5.70757Z" />
              </svg>
            )}
            {isMixed && (
              <svg width="8" height="2" viewBox="0 0 8 2" fill="currentColor" aria-hidden="true">
                <rect width="8" height="1.5" rx="0.75" />
              </svg>
            )}
          </div>
        </div>

        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            minWidth: 0,
            flex: 1,
            alignItems: 'center',
            paddingLeft: 6,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 16,
              height: 16,
              flexShrink: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LinearBoltIcon size={13} className="text-[#eab308]" />
          </div>
          <span
            style={{
              minWidth: 0,
              marginLeft: 5,
              overflow: 'hidden',
              color: 'var(--text-primary)',
              fontSize: 13,
              fontWeight: 400,
              lineHeight: '20px',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {rule.name}
          </span>
          {note && (
            <span
              style={{
                marginLeft: 8,
                flexShrink: 0,
                color: 'var(--text-tertiary)',
                fontSize: 11,
                lineHeight: '20px',
                whiteSpace: 'nowrap',
              }}
            >
              {note}
            </span>
          )}
        </div>
      </li>
    );
  };

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={entityIds.length === 1 ? `Rules for this ${thisNoun}` : `Rules for ${nouns(entityIds.length)}`}
      tabIndex={-1}
      data-animated-popover-container="true"
      data-menu-active="true"
      style={{
        position: 'fixed',
        left,
        top,
        width: popoverWidth,
        minWidth: 277,
        maxWidth: 500,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'visible',
        backgroundColor: 'var(--card-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--color-border-secondary)',
        borderRadius: 12,
        boxShadow: 'var(--dropdown-shadow)',
        zIndex: 9999,
        fontFamily:
          '"Inter Variable", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        animation: 'linearPopoverScale 120ms cubic-bezier(0.16, 1, 0.3, 1)',
        transformOrigin: anchorRect
          ? `${Math.min(
            popoverWidth - 2,
            Math.max(2, anchorRect.left - left + anchorRect.width / 2)
          )}px 18px`
          : 'center top',
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <form
        autoComplete="off"
        onSubmit={(event) => event.preventDefault()}
        style={{
          display: 'flex',
          height: 43,
          flexShrink: 0,
          alignItems: 'center',
          gap: 8,
          padding: '0 12px 0 14px',
          borderBottom: '1px solid var(--color-border-primary)',
        }}
      >
        <span className="sr-only" role="status" aria-live="polite">
          {searchQuery ? `${orderedRules.length} matching rules` : 'Showing all rules'}
        </span>
        <input
          ref={inputRef}
          type="search"
          value={searchQuery}
          placeholder="Change or add rules…"
          aria-label="Change or add rules…"
          aria-controls={listId}
          aria-activedescendant={
            activeIndex >= 0 ? optionId(orderedRules[activeIndex]) : undefined
          }
          autoComplete="off"
          spellCheck={false}
          maxLength={80}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={handleInputKeyDown}
          style={{
            width: 219,
            minWidth: 0,
            height: 36,
            flex: 1,
            padding: '10px 0 9px',
            border: 0,
            outline: 0,
            background: 'transparent',
            color: 'var(--text-primary)',
            caretColor: 'var(--text-primary)',
            font: '400 13px/17px inherit',
          }}
        />
        {shortcut && (
          <kbd
            style={{
              display: 'inline-flex',
              minWidth: 18,
              height: 19,
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              border: '1px solid var(--color-border-secondary)',
              borderRadius: 4,
              backgroundColor: 'var(--item-hover-bg)',
              color: 'var(--text-tertiary)',
              fontSize: 11,
              fontWeight: 500,
              lineHeight: '13px',
            }}
          >
            {shortcut}
          </kbd>
        )}
      </form>

      <div
        id={listId}
        role="listbox"
        aria-multiselectable="true"
        style={{ maxHeight: 340, overflowY: 'auto', padding: '2px 0' }}
      >
        <ul role="presentation" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {attachedRules.map((rule, index) => renderOption(rule, index))}

          {attachedRules.length > 0 && unattachedRules.length > 0 && (
            <li role="separator" style={{ height: 12, padding: '6px 0', boxSizing: 'border-box' }}>
              <div style={{ height: 1, borderBottom: '1px solid var(--color-border-primary)' }} />
            </li>
          )}

          {unattachedRules.map((rule, index) =>
            renderOption(rule, attachedRules.length + index)
          )}

          {orderedRules.length === 0 && (
            <li style={{ padding: '16px 14px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
              {rules.length > 0
                ? 'No rules found'
                : rulesLoadState === 'ready'
                  ? 'No rules yet. Create one on the Rules screen.'
                  : rulesLoadState === 'error'
                    ? "Couldn't load rules"
                    : 'Loading rules…'}
            </li>
          )}
        </ul>
      </div>

      {attachmentError && (
        <div
          role="alert"
          style={{
            flexShrink: 0,
            padding: '8px 14px',
            borderTop: '1px solid var(--color-border-primary)',
            color: 'var(--rules-action-stop-text)',
            fontSize: 12,
            lineHeight: '16px',
          }}
        >
          {attachmentError}
        </div>
      )}
    </div>,
    document.body
  );
};
