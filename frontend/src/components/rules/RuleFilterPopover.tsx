import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore, RuleFilters } from '@/store/useAppStore';
import {
  LinearSearchIcon,
  LinearCheckIcon,
} from '@/icons/LinearIcons';

interface RuleFilterPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  initialCategory?: keyof RuleFilters;
}

type FilterCategoryKey = keyof RuleFilters;

interface CategoryMeta {
  key: FilterCategoryKey;
  label: string;
  section: 'PROPERTIES' | 'TARGETING & METRICS';
  options: { id: string; label: string; subtext?: string }[];
}

export const RuleFilterPopover: React.FC<RuleFilterPopoverProps> = ({
  isOpen,
  onClose,
  anchorRef,
  initialCategory,
}) => {
  const {
    rulesFilters,
    toggleRulesFilterValue,
    ruleGroups,
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<FilterCategoryKey | null>(
    initialCategory || null
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [coords, setCoords] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Define Filter Categories & Options
  const categories: CategoryMeta[] = useMemo(() => {
    return [
      {
        key: 'status',
        label: 'Status',
        section: 'PROPERTIES',
        options: [
          { id: 'active', label: 'Active' },
          { id: 'paused', label: 'Paused' },
          { id: 'triggered', label: 'Triggered' },
        ],
      },
      {
        key: 'action',
        label: 'Action Type',
        section: 'PROPERTIES',
        options: [
          { id: 'pause', label: 'Stop & Pause', subtext: 'PAUSE ADSET, KILL' },
          { id: 'budget', label: 'Scale & Budget Bump', subtext: 'BUDGET +20%, SCALE' },
          { id: 'alert', label: 'Alerts & Notify', subtext: 'TELEGRAM ALERT' },
        ],
      },
      {
        key: 'group',
        label: 'Rule Group',
        section: 'PROPERTIES',
        options: [
          ...ruleGroups.map((g) => ({ id: g.id, label: g.name })),
          { id: 'ungrouped', label: 'Ungrouped' },
        ],
      },
      {
        key: 'scope',
        label: 'Scope / Target',
        section: 'TARGETING & METRICS',
        options: [
          { id: 'campaign', label: 'Campaign Level' },
          { id: 'adset', label: 'AdSet Level' },
          { id: 'ad', label: 'Ad Level' },
          { id: 'meta', label: 'Meta Only' },
          { id: 'tiktok', label: 'TikTok Only' },
        ],
      },
      {
        key: 'metric',
        label: 'Condition Metric',
        section: 'TARGETING & METRICS',
        options: [
          { id: 'spend', label: 'Spend' },
          { id: 'cpa', label: 'CPA' },
          { id: 'leads', label: 'Leads count' },
          { id: 'roi', label: 'ROI / ROAS' },
        ],
      },
    ];
  }, [ruleGroups]);

  // Position calculation
  useEffect(() => {
    if (isOpen && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
      setSearchQuery('');
      setActiveCategory(initialCategory || null);
      setActiveIndex(0);
      const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen, anchorRef, initialCategory]);

  // Click outside & Escape handling
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, anchorRef]);

  // Flattened Omnisearch results across all leaf values
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    const results: {
      categoryKey: FilterCategoryKey;
      categoryLabel: string;
      option: { id: string; label: string; subtext?: string };
    }[] = [];

    categories.forEach((cat) => {
      cat.options.forEach((opt) => {
        if (
          opt.label.toLowerCase().includes(query) ||
          (opt.subtext && opt.subtext.toLowerCase().includes(query)) ||
          cat.label.toLowerCase().includes(query)
        ) {
          results.push({
            categoryKey: cat.key,
            categoryLabel: cat.label,
            option: opt,
          });
        }
      });
    });

    return results;
  }, [searchQuery, categories]);

  // Category sub-options when in a category view
  const currentCategoryMeta = useMemo(() => {
    return categories.find((c) => c.key === activeCategory) || null;
  }, [categories, activeCategory]);

  const filteredSubOptions = useMemo(() => {
    if (!currentCategoryMeta) return [];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return currentCategoryMeta.options;
    return currentCategoryMeta.options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(query) ||
        (opt.subtext && opt.subtext.toLowerCase().includes(query))
    );
  }, [currentCategoryMeta, searchQuery]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (activeCategory) {
        setActiveCategory(null);
        setSearchQuery('');
        setActiveIndex(0);
      } else {
        onClose();
      }
      return;
    }

    if (e.key === 'Backspace' && searchQuery === '' && activeCategory) {
      e.preventDefault();
      setActiveCategory(null);
      setActiveIndex(0);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (searchQuery.trim()) {
        setActiveIndex((prev) => (prev + 1) % Math.max(1, searchResults.length));
      } else if (activeCategory) {
        setActiveIndex((prev) => (prev + 1) % Math.max(1, filteredSubOptions.length));
      } else {
        setActiveIndex((prev) => (prev + 1) % categories.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (searchQuery.trim()) {
        setActiveIndex((prev) => (prev - 1 + searchResults.length) % Math.max(1, searchResults.length));
      } else if (activeCategory) {
        setActiveIndex((prev) => (prev - 1 + filteredSubOptions.length) % Math.max(1, filteredSubOptions.length));
      } else {
        setActiveIndex((prev) => (prev - 1 + categories.length) % categories.length);
      }
    } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (searchQuery.trim()) {
        const item = searchResults[activeIndex];
        if (item) {
          toggleRulesFilterValue(item.categoryKey, item.option.id);
        }
      } else if (activeCategory) {
        const item = filteredSubOptions[activeIndex];
        if (item) {
          toggleRulesFilterValue(activeCategory, item.id);
        }
      } else {
        const cat = categories[activeIndex];
        if (cat) {
          setActiveCategory(cat.key);
          setSearchQuery('');
          setActiveIndex(0);
        }
      }
    } else if (e.key === 'ArrowLeft' && activeCategory) {
      e.preventDefault();
      setActiveCategory(null);
      setSearchQuery('');
      setActiveIndex(0);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top: `${coords.top}px`,
        right: `${coords.right}px`,
        width: '260px',
        backgroundColor: 'lch(12.72% 0.85 272)', // #18191B
        color: 'lch(100% 0 272)',
        border: '1px solid lch(21.36% 1.93 272)',
        borderRadius: '8px',
        boxShadow:
          '0 0 0 1px rgba(255,255,255,0.05), 0 4px 12px rgba(0,0,0,0.35), 0 16px 32px rgba(0,0,0,0.5)',
        zIndex: 9999,
        fontFamily:
          '"Inter Variable", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        userSelect: 'none',
        animation: 'linearPopoverScale 120ms cubic-bezier(0.16, 1, 0.3, 1)',
        transformOrigin: '100% 0px',
        overflow: 'hidden',
      }}
      className="outline-none"
    >
      {/* 1. Header with Search Input & Breadcrumbs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '36px',
          padding: '0 10px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          gap: '6px',
        }}
      >
        {activeCategory ? (
          <button
            type="button"
            onClick={() => {
              setActiveCategory(null);
              setSearchQuery('');
              setActiveIndex(0);
              inputRef.current?.focus();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '22px',
              padding: '0 4px',
              gap: '2px',
              fontSize: '11px',
              fontWeight: 500,
              color: 'lch(64.714% 1.425 272)',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
            className="hover:text-white hover:bg-white/[0.1]"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z" />
            </svg>
            <span>{currentCategoryMeta?.label}</span>
          </button>
        ) : (
          <div className="flex items-center text-[#8a8f98] shrink-0">
            <LinearSearchIcon size={13} />
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={activeCategory ? `Search ${currentCategoryMeta?.label.toLowerCase()}...` : 'Filter...'}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: '12px',
            color: '#ffffff',
            padding: 0,
          }}
          className="placeholder-[#8a8f98]"
        />
      </div>

      {/* 2. Body List */}
      <div
        style={{
          maxHeight: '320px',
          overflowY: 'auto',
          padding: '4px',
        }}
        className="space-y-0.5"
      >
        {/* A. Omnisearch Results */}
        {searchQuery.trim() && !activeCategory ? (
          searchResults.length === 0 ? (
            <div className="flex h-16 items-center justify-center text-[12px] text-[#8a8f98]">
              No filters found
            </div>
          ) : (
            searchResults.map((item, idx) => {
              const isSelected = (rulesFilters[item.categoryKey] || []).includes(item.option.id);
              const isHighlighted = activeIndex === idx;

              return (
                <div
                  key={`${item.categoryKey}-${item.option.id}`}
                  onClick={() => {
                    toggleRulesFilterValue(item.categoryKey, item.option.id);
                    inputRef.current?.focus();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    height: '28px',
                    padding: '0 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    backgroundColor: isHighlighted
                      ? 'rgba(255, 255, 255, 0.08)'
                      : 'transparent',
                    color: isHighlighted ? '#ffffff' : 'lch(91.178% 1.425 272)',
                  }}
                  className="hover:bg-white/[0.08] hover:text-white"
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="text-[#8a8f98] font-normal shrink-0">{item.categoryLabel} &gt;</span>
                    <span className="font-medium truncate text-white">{item.option.label}</span>
                  </div>
                  {isSelected && (
                    <div className="flex items-center justify-center text-[#5e6ad2] shrink-0 pl-1.5">
                      <LinearCheckIcon size={13} />
                    </div>
                  )}
                </div>
              );
            })
          )
        ) : activeCategory ? (
          /* B. Category Sub-Options List */
          filteredSubOptions.length === 0 ? (
            <div className="flex h-16 items-center justify-center text-[12px] text-[#8a8f98]">
              No matching options
            </div>
          ) : (
            filteredSubOptions.map((opt, idx) => {
              const isSelected = (rulesFilters[activeCategory] || []).includes(opt.id);
              const isHighlighted = activeIndex === idx;

              return (
                <div
                  key={opt.id}
                  onClick={() => {
                    toggleRulesFilterValue(activeCategory, opt.id);
                    inputRef.current?.focus();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    height: '28px',
                    padding: '0 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    backgroundColor: isHighlighted
                      ? 'rgba(255, 255, 255, 0.08)'
                      : 'transparent',
                    color: isHighlighted ? '#ffffff' : 'lch(91.178% 1.425 272)',
                  }}
                  className="hover:bg-white/[0.08] hover:text-white"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-medium truncate">{opt.label}</span>
                    {opt.subtext && (
                      <span className="text-[10px] text-[#8a8f98] truncate">{opt.subtext}</span>
                    )}
                  </div>
                  {isSelected && (
                    <div className="flex items-center justify-center text-[#5e6ad2] shrink-0 pl-1.5">
                      <LinearCheckIcon size={13} />
                    </div>
                  )}
                </div>
              );
            })
          )
        ) : (
          /* C. Root Categories List */
          <>
            {/* Section 1: PROPERTIES */}
            <div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold tracking-wider text-[#6b7280]">
              PROPERTIES
            </div>
            {categories
              .filter((c) => c.section === 'PROPERTIES')
              .map((cat) => {
                const appliedCount = (rulesFilters[cat.key] || []).length;
                const catIdx = categories.findIndex((c) => c.key === cat.key);
                const isHighlighted = activeIndex === catIdx;

                return (
                  <div
                    key={cat.key}
                    onClick={() => {
                      setActiveCategory(cat.key);
                      setSearchQuery('');
                      setActiveIndex(0);
                      inputRef.current?.focus();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      height: '28px',
                      padding: '0 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      backgroundColor: isHighlighted
                        ? 'rgba(255, 255, 255, 0.08)'
                        : 'transparent',
                      color: isHighlighted ? '#ffffff' : 'lch(91.178% 1.425 272)',
                    }}
                    className="hover:bg-white/[0.08] hover:text-white"
                  >
                    <span className="font-medium">{cat.label}</span>
                    <div className="flex items-center gap-1 text-[#8a8f98]">
                      {appliedCount > 0 && (
                        <span className="text-[11px] font-medium text-[#5e6ad2] bg-[#5e6ad2]/10 px-1.5 py-0.2 rounded-full">
                          {appliedCount}
                        </span>
                      )}
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z" />
                      </svg>
                    </div>
                  </div>
                );
              })}

            {/* Section 2: TARGETING & METRICS */}
            <div className="px-2 pt-2 pb-0.5 text-[10px] font-semibold tracking-wider text-[#6b7280]">
              TARGETING &amp; METRICS
            </div>
            {categories
              .filter((c) => c.section === 'TARGETING & METRICS')
              .map((cat) => {
                const appliedCount = (rulesFilters[cat.key] || []).length;
                const catIdx = categories.findIndex((c) => c.key === cat.key);
                const isHighlighted = activeIndex === catIdx;

                return (
                  <div
                    key={cat.key}
                    onClick={() => {
                      setActiveCategory(cat.key);
                      setSearchQuery('');
                      setActiveIndex(0);
                      inputRef.current?.focus();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      height: '28px',
                      padding: '0 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      backgroundColor: isHighlighted
                        ? 'rgba(255, 255, 255, 0.08)'
                        : 'transparent',
                      color: isHighlighted ? '#ffffff' : 'lch(91.178% 1.425 272)',
                    }}
                    className="hover:bg-white/[0.08] hover:text-white"
                  >
                    <span className="font-medium">{cat.label}</span>
                    <div className="flex items-center gap-1 text-[#8a8f98]">
                      {appliedCount > 0 && (
                        <span className="text-[11px] font-medium text-[#5e6ad2] bg-[#5e6ad2]/10 px-1.5 py-0.2 rounded-full">
                          {appliedCount}
                        </span>
                      )}
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z" />
                      </svg>
                    </div>
                  </div>
                );
              })}
          </>
        )}
      </div>
    </div>,
    document.body
  );
};
