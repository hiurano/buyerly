import React from 'react';
import { useAppStore, RuleFilters } from '@/store/useAppStore';
import { LinearPlusIcon } from '@/icons/LinearIcons';

interface ActiveRuleFilterBarProps {
  onOpenFilter: (category?: keyof RuleFilters) => void;
}

export const ActiveRuleFilterBar: React.FC<ActiveRuleFilterBarProps> = ({
  onOpenFilter,
}) => {
  const {
    rulesFilters,
    removeRulesFilter,
    clearAllRulesFilters,
    ruleGroups,
  } = useAppStore();

  const activeCategories = (Object.keys(rulesFilters) as (keyof RuleFilters)[]).filter(
    (cat) => (rulesFilters[cat] || []).length > 0
  );

  if (activeCategories.length === 0) return null;

  const getCategoryLabel = (category: keyof RuleFilters) => {
    switch (category) {
      case 'status':
        return 'Status';
      case 'action':
        return 'Action';
      case 'group':
        return 'Group';
      case 'scope':
        return 'Scope';
      case 'metric':
        return 'Metric';
      default:
        return category;
    }
  };

  const getValueLabel = (category: keyof RuleFilters, value: string) => {
    if (category === 'group') {
      if (value === 'ungrouped') return 'Ungrouped';
      const group = ruleGroups.find((g) => g.id === value);
      return group ? group.name : value;
    }
    if (category === 'action') {
      if (value === 'pause') return 'Pause & Kill';
      if (value === 'budget') return 'Scale & Bump';
      if (value === 'alert') return 'Alerts';
    }
    if (category === 'scope') {
      if (value === 'campaign') return 'Campaign Level';
      if (value === 'adset') return 'AdSet Level';
      if (value === 'ad') return 'Ad Level';
      if (value === 'meta') return 'Meta Only';
      if (value === 'tiktok') return 'TikTok Only';
    }
    if (category === 'metric') {
      if (value === 'spend') return 'Spend';
      if (value === 'cpa') return 'CPA';
      if (value === 'leads') return 'Leads';
      if (value === 'roi') return 'ROI';
    }
    if (category === 'status') {
      return value.charAt(0).toUpperCase() + value.slice(1);
    }
    return value;
  };

  return (
    <div
      style={{
        height: '34px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
      }}
      className="flex items-center gap-1.5 px-2.5 overflow-x-auto shrink-0 select-none"
    >
      {/* Active Filter Pills */}
      {activeCategories.map((category) => {
        const values = rulesFilters[category] || [];
        return values.map((val) => (
          <div
            key={`${category}-${val}`}
            onClick={() => onOpenFilter(category)}
            style={{
              height: '24px',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '9999px',
              padding: '0 8px',
              fontSize: '12px',
              fontWeight: 450,
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
            className="hover:bg-white/[0.1] hover:border-white/[0.18]"
          >
            <span className="text-[#8a8f98] font-normal">{getCategoryLabel(category)}:</span>
            <span className="font-medium text-[#e3e5e7]">{getValueLabel(category, val)}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeRulesFilter(category, val);
              }}
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'transparent',
                color: '#8a8f98',
                cursor: 'pointer',
                padding: 0,
                marginLeft: '2px',
              }}
              className="hover:text-white hover:bg-white/[0.12]"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
              </svg>
            </button>
          </div>
        ));
      })}

      {/* + Filter button */}
      <button
        type="button"
        onClick={() => onOpenFilter()}
        style={{
          height: '24px',
          padding: '0 8px',
          fontSize: '12px',
          fontWeight: 450,
          color: '#8a8f98',
          border: '1px dashed rgba(255, 255, 255, 0.15)',
          borderRadius: '9999px',
          backgroundColor: 'transparent',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'all 0.15s ease',
        }}
        className="hover:text-white hover:border-white/[0.3] hover:bg-white/[0.04]"
      >
        <LinearPlusIcon size={12} />
        <span>Filter</span>
      </button>

      {/* Clear all */}
      <button
        type="button"
        onClick={clearAllRulesFilters}
        style={{
          fontSize: '12px',
          fontWeight: 450,
          color: '#8a8f98',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          padding: '0 4px',
          marginLeft: '4px',
          whiteSpace: 'nowrap',
        }}
        className="hover:text-white hover:underline"
      >
        Clear all
      </button>
    </div>
  );
};
