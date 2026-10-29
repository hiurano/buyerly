import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import { BuyerlyCheckGlyph } from '@/icons/BuyerlyIcons';
import { useRulesStore, type CampaignGroup } from '@/models/rulesStore';
import { pickerStyles } from './pickerStyles';

const styles = stylex.create({
  dotSlot: {
    display: 'flex',
    width: 16,
    height: 9,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    display: 'block',
    width: 9,
    height: 9,
    borderRadius: '50%',
  },
  emptyText: {
    lineHeight: '16px',
  },
});

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
  const campaignGroups = useRulesStore((state) => state.campaignGroups);
  const toggleCampaignGroup = useRulesStore((state) => state.toggleCampaignGroup);
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
        {...stylex.props(pickerStyles.option)}
      >
        <div aria-hidden="true" {...stylex.props(pickerStyles.highlight, isActive && pickerStyles.highlightActive)} />

        <div {...stylex.props(pickerStyles.checkSlot)}>
          <div {...stylex.props(pickerStyles.check, isSelected && pickerStyles.checkSelected)}>
            {isSelected && (
              <BuyerlyCheckGlyph />
            )}
          </div>
        </div>

        <div {...stylex.props(pickerStyles.label)}>
          <div {...stylex.props(styles.dotSlot)}>
            <span {...stylex.props(styles.dot)} style={{ backgroundColor: group.color }} />
          </div>
          <span {...stylex.props(pickerStyles.name)}>
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
      {...stylex.props(pickerStyles.popover)}
      style={{
        left,
        top,
        transformOrigin: `${Math.min(popoverWidth - 2, Math.max(2, anchorRect.left - left + anchorRect.width / 2))}px 18px`,
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <form
        autoComplete="off"
        onSubmit={(event) => event.preventDefault()}
        {...stylex.props(pickerStyles.search)}
      >
        <span {...stylex.props(pickerStyles.srOnly)} role="status" aria-live="polite">
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
          {...stylex.props(pickerStyles.input)}
        />
        <kbd {...stylex.props(pickerStyles.shortcut)}>
          L
        </kbd>
      </form>

      <div
        id={`campaign-label-list-${campaignId}`}
        role="listbox"
        aria-multiselectable="true"
        {...stylex.props(pickerStyles.listbox)}
      >
        <ul role="presentation" {...stylex.props(pickerStyles.list)}>
          {selectedGroups.map((group, index) => renderOption(group, index))}

          {selectedGroups.length > 0 && unselectedGroups.length > 0 && (
            <li role="separator" {...stylex.props(pickerStyles.separator)}>
              <div {...stylex.props(pickerStyles.separatorLine)} />
            </li>
          )}

          {unselectedGroups.map((group, index) =>
            renderOption(group, selectedGroups.length + index)
          )}

          {orderedGroups.length === 0 && (
            <li {...stylex.props(pickerStyles.empty, styles.emptyText)}>
              No labels found
            </li>
          )}
        </ul>
      </div>
    </div>,
    document.body
  );
};
