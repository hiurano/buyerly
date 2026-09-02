import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/store/useAppStore';
import type { CampaignGroup } from '@/store/useAppStore';

interface LabelSelectorPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRect: DOMRect | null;
  campaignId: string;
  selectedGroupIds: string[];
}

/**
 * Campaign label picker matched to Linear's list-view label picker:
 * selected labels first, multi-select without closing, search, keyboard navigation,
 * and a 279px floating dialog with 32px option rows.
 */
export const LabelSelectorPopover: React.FC<LabelSelectorPopoverProps> = ({
  isOpen,
  onClose,
  anchorRect,
  campaignId,
  selectedGroupIds,
}) => {
  const { campaignGroups, toggleCampaignGroup } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const selectedIds = useMemo(() => new Set(selectedGroupIds), [selectedGroupIds]);
  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return campaignGroups.filter((group) => group.name.toLowerCase().includes(query));
  }, [campaignGroups, searchQuery]);

  const selectedGroups = filteredGroups.filter((group) => selectedIds.has(group.id));
  const unselectedGroups = filteredGroups.filter((group) => !selectedIds.has(group.id));
  const orderedGroups = [...selectedGroups, ...unselectedGroups];

  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery('');
    setActiveIndex(-1);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(focusTimer);
  }, [isOpen]);

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
    if (activeIndex >= orderedGroups.length) setActiveIndex(-1);
  }, [activeIndex, orderedGroups.length]);

  if (!isOpen || !anchorRect) return null;

  const popoverWidth = 279;
  const estimatedHeight = Math.min(44 + orderedGroups.length * 32 + 16, 395);
  const margin = 8;
  let left = anchorRect.left;
  let top = anchorRect.bottom + 6;

  if (left + popoverWidth > window.innerWidth - margin) {
    left = window.innerWidth - popoverWidth - margin;
  }
  if (top + estimatedHeight > window.innerHeight - margin) {
    top = Math.max(margin, anchorRect.top - estimatedHeight - 6);
  }

  const toggleGroup = (group: CampaignGroup) => {
    toggleCampaignGroup(campaignId, group.id);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) =>
        orderedGroups.length === 0 ? -1 : index < 0 ? 0 : (index + 1) % orderedGroups.length
      );
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) =>
        orderedGroups.length === 0
          ? -1
          : index < 0
          ? orderedGroups.length - 1
          : (index - 1 + orderedGroups.length) % orderedGroups.length
      );
      return;
    }

    if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      toggleGroup(orderedGroups[activeIndex]);
    }
  };

  const renderOption = (group: CampaignGroup, index: number) => {
    const isSelected = selectedIds.has(group.id);
    const isActive = activeIndex === index;
    const optionId = `campaign-label-${campaignId}-${group.id}`;

    return (
      <li
        id={optionId}
        key={group.id}
        role="option"
        aria-selected={isSelected}
        aria-checked={isSelected}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => toggleGroup(group)}
        style={{
          position: 'relative',
          display: 'flex',
          height: 32,
          alignItems: 'center',
          padding: '0 18px 0 14px',
          cursor: 'pointer',
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
              backgroundColor: isSelected ? '#eab308' : 'transparent',
              border: isSelected
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
              height: 9,
              flexShrink: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                display: 'block',
                width: 9,
                height: 9,
                borderRadius: '50%',
                backgroundColor: group.color,
              }}
            />
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
            {group.name}
          </span>
        </div>
      </li>
    );
  };

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
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
        backgroundColor: 'var(--card-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--color-border-secondary)',
        borderRadius: 12,
        boxShadow: 'var(--dropdown-shadow)',
        zIndex: 9999,
        overflow: 'visible',
        display: 'flex',
        flexDirection: 'column',
        fontFamily:
          '"Inter Variable", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        animation: 'linearPopoverScale 120ms cubic-bezier(0.16, 1, 0.3, 1)',
        transformOrigin: `${Math.min(popoverWidth - 2, Math.max(2, anchorRect.left - left + anchorRect.width / 2))}px 18px`,
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
          {searchQuery ? `${orderedGroups.length} matching labels` : 'Showing all labels'}
        </span>
        <input
          ref={inputRef}
          type="search"
          value={searchQuery}
          placeholder="Change or add labels…"
          aria-label="Change or add labels…"
          aria-controls={`campaign-label-list-${campaignId}`}
          aria-activedescendant={
            activeIndex >= 0 ? `campaign-label-${campaignId}-${orderedGroups[activeIndex].id}` : undefined
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
          L
        </kbd>
      </form>

      <div
        id={`campaign-label-list-${campaignId}`}
        role="listbox"
        aria-multiselectable="true"
        style={{ maxHeight: 340, overflowY: 'auto', padding: '2px 0' }}
      >
        <ul role="presentation" className="m-0 list-none p-0">
          {selectedGroups.map((group, index) => renderOption(group, index))}

          {selectedGroups.length > 0 && unselectedGroups.length > 0 && (
            <li role="separator" style={{ height: 12, padding: '6px 0', boxSizing: 'border-box' }}>
              <div style={{ height: 1, borderBottom: '1px solid var(--color-border-primary)' }} />
            </li>
          )}

          {unselectedGroups.map((group, index) =>
            renderOption(group, selectedGroups.length + index)
          )}

          {orderedGroups.length === 0 && (
            <li className="px-[14px] py-4 text-center text-xs text-[var(--text-muted)]">
              No labels found
            </li>
          )}
        </ul>
      </div>
    </div>,
    document.body
  );
};
