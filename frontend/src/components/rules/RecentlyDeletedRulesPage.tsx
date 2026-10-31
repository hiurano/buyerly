import React, { useState } from 'react';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { SidebarCollapsedNavigation } from '@/components/sidebar/SidebarCollapsedNavigation';
import { RecentlyDeletedView } from './RecentlyDeletedView';

const styles = stylex.create({
  root: {
    display: 'flex',
    height: '100%',
    width: '100%',
    userSelect: 'none',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  header: {
    display: 'flex',
    flexShrink: 0,
    flexDirection: 'column',
    width: '100%',
    backgroundColor: 'transparent',
  },
  // Linear's archive title bar: 44px, the title with its count beside it.
  titleBar: {
    display: 'flex',
    alignItems: 'center',
    height: 44,
    boxSizing: 'border-box',
    paddingLeft: 18,
    paddingRight: 8,
  },
  breadcrumb: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
  },
  parent: {
    borderRadius: 4,
    fontSize: 13,
    fontWeight: 500,
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
    },
    outline: '2px solid transparent',
    outlineOffset: 2,
    transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    transitionDuration: '150ms',
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
  },
  separator: {
    marginLeft: 4,
    marginRight: 4,
    flexShrink: 0,
    color: colors['--text-tertiary'],
  },
  title: {
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  count: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
    color: colors['--text-tertiary'],
  },
  content: {
    display: 'flex',
    minHeight: 0,
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
  },
});

interface RecentlyDeletedRulesPageProps {
  /** The address of the rules list, for the "Rules" crumb. */
  rulesPath: string;
  onOpenRules: () => void;
}

/**
 * Rules' Recently deleted, on its own address (/rules/recently-deleted), the
 * way Linear keeps deleted issues in the team archive rather than in a tab of
 * the list. Reached from Ctrl/Cmd+K, the "Deleted" toast and the toast for a
 * rule an address no longer finds.
 */
export const RecentlyDeletedRulesPage: React.FC<RecentlyDeletedRulesPageProps> = ({ rulesPath, onOpenRules }) => {
  const [count, setCount] = useState<number | null>(null);
  return (
    <div {...stylex.props(styles.root)}>
      <header {...stylex.props(styles.header)}>
        {/* --canvas-border is a whole border; StyleX would split the shorthand and lose it. */}
        <div {...stylex.props(styles.titleBar)} style={{ borderBottom: 'var(--canvas-border)' }}>
          <SidebarCollapsedNavigation />
          <nav aria-label="Breadcrumb" {...stylex.props(styles.breadcrumb)}>
            <a
              href={rulesPath}
              onClick={(event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                onOpenRules();
              }}
              {...stylex.props(styles.parent)}
            >
              Rules
            </a>
            <BuyerlyIcon name="chevron-right" size={14} aria-hidden="true" {...stylex.props(styles.separator)} />
            <h2
              aria-current="page"
              {...stylex.props(styles.title)}
            >
              Recently deleted
            </h2>
            {count !== null && count > 0 && (
              <span {...stylex.props(styles.count)}>
                {count}
              </span>
            )}
          </nav>
        </div>
      </header>
      <div {...stylex.props(styles.content)}>
        <RecentlyDeletedView onCountChange={setCount} />
      </div>
    </div>
  );
};
