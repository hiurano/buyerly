import React, { useRef } from 'react';

export interface LinearTabItem {
  id: string;
  label: string;
  count?: number;
  disabled?: boolean;
}

interface LinearTabsProps {
  tabs: LinearTabItem[];
  activeTabId: string;
  onChange: (id: string) => void;
  className?: string;
  'aria-label'?: string;
}

export const LinearTabs: React.FC<LinearTabsProps> = ({
  tabs,
  activeTabId,
  onChange,
  className = '',
  'aria-label': ariaLabel = 'Views',
}) => {
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const handleKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    let nextIndex = currentIndex;

    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    const nextTab = tabs[nextIndex];
    if (nextTab && !nextTab.disabled) {
      onChange(nextTab.id);
      tabRefs.current.get(nextTab.id)?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        height: '28px',
        gap: '6px',
        padding: '0px',
        margin: '0px',
        userSelect: 'none',
      }}
      className={`relative select-none ${className}`}
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) tabRefs.current.set(tab.id, el);
              else tabRefs.current.delete(tab.id);
            }}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            data-active={isActive ? 'true' : 'false'}
            type="button"
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className="linear-tab-capsule"
          >
            <span className="block truncate whitespace-nowrap">{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  marginLeft: '4px',
                  opacity: isActive ? 1 : 0.65,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

