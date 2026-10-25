import React, { useLayoutEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { withClassName } from '@/ui/withClassName';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './DropdownMenu';

export interface BuyerlyTabItem {
  id: string;
  label: string;
  count?: number;
  disabled?: boolean;
}

interface BuyerlyTabsProps {
  tabs: BuyerlyTabItem[];
  activeTabId: string;
  onChange: (id: string) => void;
  className?: string;
  /** StyleX overrides for the tab strip. */
  xstyle?: stylex.StyleXStyles;
  'aria-label'?: string;
  /**
   * A view's tabs, as in Linear's header: when they no longer fit their strip,
   * they all fold into one capsule with the active view's label and a chevron,
   * named "N more", that opens a menu of the views.
   */
  collapseOverflow?: boolean;
}

const styles = stylex.create({
  list: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 28,
    gap: 8,
    padding: 0,
    margin: 0,
    position: 'relative',
    userSelect: 'none',
  },
  // A view's tabs keep their natural width, so the strip can tell when they no longer fit.
  listMeasured: {
    width: 'max-content',
    flexShrink: 0,
  },
  // Folded: laid out for measuring, out of sight.
  listFolded: {
    position: 'absolute',
    left: 0,
    visibility: 'hidden',
  },
  label: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  count: {
    fontSize: 11,
    fontWeight: 500,
    marginLeft: 4,
    opacity: 0.65,
    fontVariantNumeric: 'tabular-nums',
  },
  countActive: {
    opacity: 1,
  },
  // Full toolbar height and 2px either side, so the capsules' ring and shadow are not clipped.
  frame: {
    position: 'relative',
    marginLeft: -2,
    marginRight: -2,
    display: 'flex',
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    alignItems: 'center',
    alignSelf: 'stretch',
    overflow: 'hidden',
    paddingLeft: 2,
    paddingRight: 2,
  },
  more: {
    flexShrink: 0,
  },
  chevron: {
    marginLeft: 6,
    flexShrink: 0,
  },
  menuActive: {
    color: colors['--text-primary'],
  },
  menuCount: {
    fontVariantNumeric: 'tabular-nums',
    color: colors['--text-tertiary'],
  },
});

const TabCount: React.FC<{ count?: number; active: boolean }> = ({ count, active }) =>
  typeof count === 'number' ? (
    <span {...stylex.props(styles.count, active && styles.countActive)}>
      {count}
    </span>
  ) : null;

export const BuyerlyTabs: React.FC<BuyerlyTabsProps> = ({
  tabs,
  activeTabId,
  onChange,
  className = '',
  xstyle,
  'aria-label': ariaLabel = 'Views',
  collapseOverflow = false,
}) => {
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const frameRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  // The tab strip keeps its natural width while folded, so it is measured the same way either way.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const list = listRef.current;
    if (!collapseOverflow || !frame || !list) return;
    const measure = () => setCollapsed(list.offsetWidth > frame.clientWidth - 4 + 0.5);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(list);
    return () => observer.disconnect();
  }, [collapseOverflow]);

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

  const folded = collapseOverflow && collapsed;
  const list = (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      aria-hidden={folded ? true : undefined}
      {...withClassName(stylex.props(styles.list, collapseOverflow && styles.listMeasured, folded && styles.listFolded, xstyle), className)}
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
            className="buyerly-tab-capsule"
          >
            <span {...stylex.props(styles.label)}>{tab.label}</span>
            <TabCount count={tab.count} active={isActive} />
          </button>
        );
      })}
    </div>
  );

  if (!collapseOverflow) return list;

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  return (
    // Full toolbar height and 2px either side, so the capsules' ring and shadow are not clipped.
    <div ref={frameRef} {...stylex.props(styles.frame)}>
      {list}
      {collapsed && activeTab && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-active="true"
              aria-label={`${tabs.length - 1} more`}
              {...withClassName(stylex.props(styles.more), 'buyerly-tab-capsule')}
            >
              <span {...stylex.props(styles.label)}>{activeTab.label}</span>
              <TabCount count={activeTab.count} active />
              <svg width="8" height="8" viewBox="0 0 12 8" fill="currentColor" aria-hidden="true" {...stylex.props(styles.chevron)}>
                <path d="M10.16.31 6 4.48 1.83.31A1.07 1.07 0 0 0 .31 1.83l4.93 4.93c.42.42 1.1.42 1.52 0l4.93-4.93A1.07 1.07 0 0 0 10.16.31Z" />
              </svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent aria-label={ariaLabel}>
            {tabs.map((tab) => (
              <DropdownMenuItem key={tab.id} disabled={tab.disabled} onSelect={() => onChange(tab.id)}>
                <span {...stylex.props(tab.id === activeTabId && styles.menuActive)}>{tab.label}</span>
                {typeof tab.count === 'number' && <span {...stylex.props(styles.menuCount)}>{tab.count}</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};
