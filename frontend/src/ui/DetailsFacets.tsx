import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { BuyerlyChevronGlyph } from '@/icons/BuyerlyIcons';
import { colors } from '@/styles/tokens.stylex';
import { withClassName } from '@/ui/withClassName';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './DropdownMenu';
import detailsFacetsCss from './DetailsFacets.module.css';

const HOVER = '@media (any-hover: hover) and (any-pointer: fine)';

export interface DetailsFacetOption {
  value: string;
  label: string;
  count: number;
  icon?: React.ReactNode;
}

export interface DetailsFacetTab {
  id: string;
  label: string;
  options: DetailsFacetOption[];
}

/** One quick filter: a value of one tab's field, on top of the view's filters. */
interface DetailsFacetSelection {
  fieldId: string;
  value: string;
}

interface DetailsFacetsProps {
  tabs: DetailsFacetTab[];
  selection: DetailsFacetSelection | null;
  onSelect: (selection: DetailsFacetSelection | null) => void;
  /** Where the last open tab is kept for this browser tab. */
  storageKey: string;
  /** The listed things, plural: a row's hover link reads "See {noun}". */
  noun: string;
}

const styles = stylex.create({
  selectLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  current: {
    color: colors['--text-primary'],
  },
  /* Linear's quick-filter section (DetailsFacets): one card filling the pane, 8px from its right and bottom. */
  facets: {
    display: 'flex',
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
    flexDirection: 'column',
    marginTop: 0,
    marginRight: 8,
    marginBottom: 8,
    marginLeft: 0,
    padding: 12,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: colors['--details-pane-card-border'],
    borderRadius: 10,
    backgroundColor: colors['--details-pane-card-bg'],
    boxShadow: colors['--details-pane-card-shadow'],
    userSelect: 'none',
  },
  tabs: {
    marginBottom: 10,
  },
  tabsFolded: {
    height: 0,
    marginBottom: 0,
    overflow: 'hidden',
    visibility: 'hidden',
  },
  tablist: {
    display: 'flex',
    gap: 2,
    width: '100%',
    height: 32,
    borderRadius: 5,
    backgroundColor: colors['--details-tabs-bg'],
  },
  tab: {
    position: 'relative',
    display: 'inline-flex',
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    margin: 2,
    paddingLeft: 12,
    paddingRight: 12,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 9999,
    backgroundColor: {
      default: colors['--details-tab-bg'],
      ':hover': colors['--details-tab-hover-bg'],
    },
    color: {
      default: colors['--details-tab-fg'],
      ':hover': colors['--details-tab-hover-fg'],
    },
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    outlineStyle: {
      default: 'none',
      ':focus-visible': 'solid',
    },
    outlineWidth: {
      default: null,
      ':focus-visible': 1,
    },
    outlineColor: {
      default: null,
      ':focus-visible': colors['--focus-ring-color'],
    },
    outlineOffset: {
      default: null,
      ':focus-visible': -1,
    },
    cursor: 'pointer',
    transition: 'border 0.15s, background-color 0.15s, color 0.15s, opacity 0.15s',
  },
  tabSelected: {
    backgroundColor: colors['--details-tab-active-bg'],
    color: colors['--details-tab-active-fg'],
    cursor: 'default',
  },
  select: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
    height: 30,
    marginTop: 8,
    marginRight: 0,
    marginBottom: 10,
    marginLeft: 0,
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 10,
    paddingRight: 10,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 8,
    backgroundColor: colors['--details-select-bg'],
    color: colors['--details-select-fg'],
    fontSize: 13,
    fontWeight: 400,
    textAlign: 'left',
    outlineStyle: 'none',
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 1px ${colors['--focus-ring-color']}`,
    },
  },
  rows: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    height: 42,
    paddingLeft: 10,
    paddingRight: 10,
    borderRadius: 8,
    backgroundColor: {
      default: colors['--details-row-bg'],
      ':active': colors['--details-row-hover-bg'],
      [HOVER]: {
        default: null,
        ':hover': colors['--details-row-hover-bg'],
      },
    },
    outlineStyle: 'none',
    cursor: 'default',
    transition: 'opacity 0.15s',
    boxShadow: {
      default: null,
      ':focus-visible': `inset 0 0 0 1px ${colors['--focus-ring-color']}`,
    },
  },
  rowActive: {
    backgroundColor: colors['--details-row-active-bg'],
  },
  rowMuted: {
    opacity: 0.5,
  },
  rowContent: {
    position: 'relative',
    display: 'flex',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    alignSelf: 'stretch',
  },
  rowIcon: {
    display: 'inline-flex',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    height: 18,
  },
  rowName: {
    minWidth: 0,
    overflow: 'hidden',
    color: colors['--details-row-fg'],
    fontSize: 13,
    fontWeight: 450,
    lineHeight: '16px',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowLink: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    display: 'none',
    alignItems: 'center',
    paddingTop: 0,
    paddingRight: 8,
    paddingBottom: 0,
    paddingLeft: 35,
    color: colors['--details-row-link-fg'],
    fontSize: 12,
    fontWeight: 450,
    whiteSpace: 'nowrap',
    textAlign: 'right',
    maskImage: 'linear-gradient(to right, transparent, #000 25px)',
  },
  rowCount: {
    flexShrink: 0,
    minWidth: 'var(--details-facets-count-width, 1ch)',
    color: colors['--details-row-count-fg'],
    fontSize: 13,
    fontWeight: 450,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
  },
  empty: {
    paddingTop: 24,
    paddingBottom: 24,
    paddingLeft: 8,
    paddingRight: 8,
    color: colors['--text-tertiary'],
    fontSize: 13,
    textAlign: 'center',
  },
});

function readTab(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveTab(key: string, tab: string) {
  try {
    window.sessionStorage.setItem(key, tab);
  } catch { /* Storage is optional. */ }
}

/**
 * Linear's quick-filter section in a details pane (`QuickFilterTabs`, read
 * 2026-10-09): pill tabs over rows of values with their counts, in one card.
 * - it opens on the tab whose filter is set, else the tab last open here,
 *   else the first; switching tabs clears the filter the old tab set;
 * - when the tabs no longer fit the pane they fold into one select;
 * - a row filters the view to its value; hovering shows "See …", and the
 *   chosen row says "Clear filter" while the others fade.
 */
export function DetailsFacets({ tabs, selection, onSelect, storageKey, noun }: DetailsFacetsProps) {
  const ids = tabs.map((tab) => tab.id);
  const [activeTab, setActiveTab] = useState(() => {
    if (selection && ids.includes(selection.fieldId)) return selection.fieldId;
    const saved = readTab(storageKey);
    return saved && ids.includes(saved) ? saved : ids[0] ?? '';
  });
  const current = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  // A filter set elsewhere shows its tab; a tab that went away gives way to the first.
  const tabKey = ids.join('\n');
  useEffect(() => {
    const available = tabKey.split('\n');
    if (selection && available.includes(selection.fieldId) && selection.fieldId !== activeTab) setActiveTab(selection.fieldId);
    else if (!available.includes(activeTab) && available[0]) setActiveTab(available[0]);
  }, [activeTab, tabKey, selection]);

  const changeTab = (id: string) => {
    if (id === current?.id) return;
    if (selection && selection.fieldId === current?.id) onSelect(null);
    saveTab(storageKey, id);
    setActiveTab(id);
  };

  // The tabs keep their natural width; when that is more than the pane has, a select takes their place.
  const listRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState(false);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    const measure = () => setFolded(list.scrollWidth > list.clientWidth + 0.5);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [tabKey]);
  // Folded tabs stay laid out for measuring, but out of reach.
  useLayoutEffect(() => {
    tabsRef.current?.toggleAttribute('inert', folded);
  }, [folded]);

  const tabKeyDown = (event: React.KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    if (!next) return;
    changeTab(next.id);
    listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(next.id)}"]`)?.focus();
  };

  const digits = Math.max(1, ...(current?.options ?? []).map((option) => String(option.count).length));
  const chosen = selection && selection.fieldId === current?.id ? selection.value : null;

  return (
    <section {...stylex.props(styles.facets)} aria-label={current ? `${current.label} quick filters` : 'Quick filters'}>
      <div
        ref={tabsRef}
        {...stylex.props(styles.tabs, folded && styles.tabsFolded)}
        data-folded={folded ? 'true' : undefined}
        aria-hidden={folded || undefined}
      >
        <div ref={listRef} role="tablist" aria-label="Quick filter categories" {...stylex.props(styles.tablist)}>
          {tabs.map((tab, index) => {
            const active = tab.id === current?.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                data-tab-id={tab.id}
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                {...withClassName(stylex.props(styles.tab, active && styles.tabSelected), detailsFacetsCss.tab)}
                onClick={() => changeTab(tab.id)}
                onKeyDown={(event) => tabKeyDown(event, index)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      {folded && current && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" {...stylex.props(styles.select)}>
              <span {...stylex.props(styles.selectLabel)}>{current.label}</span>
              <BuyerlyChevronGlyph size={8} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" aria-label="Quick filter categories">
            {tabs.map((tab) => (
              <DropdownMenuItem key={tab.id} onSelect={() => changeTab(tab.id)}>
                <span {...stylex.props(tab.id === current.id && styles.current)}>{tab.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {current && (
        <div
          role="tabpanel"
          aria-label={current.label}
          {...stylex.props(styles.rows)}
          style={{ '--details-facets-count-width': `${digits}ch` } as React.CSSProperties}
        >
          {current.options.length ? current.options.map((option) => {
            const active = chosen === option.value;
            const status = chosen === null ? 'default' : active ? 'active' : 'muted';
            const toggle = () => onSelect(active ? null : { fieldId: current.id, value: option.value });
            return (
              <div
                key={option.value}
                role="button"
                tabIndex={0}
                aria-pressed={active}
                data-status={status}
                {...withClassName(
                  stylex.props(styles.row, status === 'active' && styles.rowActive, status === 'muted' && styles.rowMuted),
                  detailsFacetsCss.row,
                  'details-facets-row',
                )}
                onClick={(event) => {
                  toggle();
                  event.currentTarget.blur();
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  toggle();
                }}
              >
                <div {...stylex.props(styles.rowContent)}>
                  {option.icon && (
                    <span {...withClassName(stylex.props(styles.rowIcon), detailsFacetsCss.rowIcon)}>{option.icon}</span>
                  )}
                  <span {...stylex.props(styles.rowName)} title={option.label}>{option.label}</span>
                  <span {...withClassName(stylex.props(styles.rowLink), detailsFacetsCss.rowLink, 'details-facets-row-link')} aria-hidden="true">{active ? 'Clear filter' : `See ${noun}`}</span>
                </div>
                <span {...withClassName(stylex.props(styles.rowCount), 'details-facets-row-count')}>{option.count}</span>
              </div>
            );
          }) : <p {...stylex.props(styles.empty)}>No matching {noun}</p>}
        </div>
      )}
    </section>
  );
}
