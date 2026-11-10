import React, { useLayoutEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { BuyerlyChevronGlyph } from '@/icons/BuyerlyIcons';
import { colors, type as typeTokens } from '@/styles/tokens.stylex';
import { withClassName } from '@/ui/withClassName';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './DropdownMenu';
import css from './BuyerlyTabs.module.css';

const HOVER = '@media (any-hover: hover) and (any-pointer: fine)';
const TOUCH = '@media (hover: none) and (pointer: coarse)';

interface BuyerlyTabItem {
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
    // Linear's view tabs sit 4px apart (Issues, Projects, a project's tabs; measured 01.11).
    gap: 4,
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
  tab: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: {
      default: 28,
      [TOUCH]: 32,
    },
    minWidth: 28,
    maxWidth: 200,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 10,
    paddingRight: 10,
    margin: 0,
    boxSizing: 'border-box',
    borderRadius: 9999,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: 'transparent',
    fontFamily: typeTokens['--font-regular'],
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 'normal',
    letterSpacing: 'normal',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    outlineWidth: { default: 0, ':focus-visible': 1 },
    outlineStyle: { default: 'none', ':focus-visible': 'solid' },
    outlineColor: { default: null, ':focus-visible': colors['--focus-ring-color'] },
    outlineOffset: { default: null, ':focus-visible': -1 },
    cursor: 'default',
    transition: 'border 0.15s, background-color 0.15s, color 0.15s, opacity 0.15s',
  },
  tabInactive: {
    backgroundColor: {
      default: colors['--inbox-tab-bg'],
      ':active': colors['--header-button-hover-bg'],
      [HOVER]: {
        default: null,
        ':hover': colors['--header-button-hover-bg'],
      },
    },
    color: {
      default: colors['--text-tertiary'],
      ':active': colors['--text-secondary'],
      [HOVER]: {
        default: null,
        ':hover': colors['--text-secondary'],
      },
    },
    /* As Linear's: hover and press land at once, only leaving fades over 0.15s. */
    transitionDuration: {
      default: null,
      ':active': '0s',
      [HOVER]: {
        default: null,
        ':hover': '0s',
      },
    },
  },
  tabActive: {
    backgroundColor: colors['--tab-active-bg'],
    color: colors['--text-primary'],
    cursor: 'default',
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
    let nextIndex: number;

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
            {...withClassName(
              stylex.props(styles.tab, isActive ? styles.tabActive : styles.tabInactive),
              css.tab,
              'buyerly-tab-capsule',
            )}
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
              {...withClassName(stylex.props(styles.tab, styles.tabActive, styles.more), css.tab, 'buyerly-tab-capsule')}
            >
              <span {...stylex.props(styles.label)}>{activeTab.label}</span>
              <TabCount count={activeTab.count} active />
              <BuyerlyChevronGlyph size={8} {...stylex.props(styles.chevron)} />
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
