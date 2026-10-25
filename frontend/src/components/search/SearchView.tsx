import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, X } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { withClassName } from '@/ui/withClassName';
import { apiRequest } from '@/lib/api';
import { pathForTab, searchAt } from '@/lib/routing';
import {
  clearRecentSearches,
  parseSearchParams,
  readRecentSearches,
  rememberOpenedRecord,
  rememberSearch,
  searchFiltersFor,
  searchPagePath,
  searchResultPath,
  searchStatusOf,
  searchWorkspace,
  takeSearchReturnPath,
  SEARCH_KIND_LABELS,
  SEARCH_STATUS_LABELS,
  SEARCH_TABS,
  type SearchOrder,
  type SearchParams,
  type SearchResponse,
  type SearchResult,
  type SearchStatus,
  type SearchTab,
} from '@/lib/search';
import type { MetaAccount, Workspace } from '@/lib/types';
import { eligibleMetaAccounts, humanizeMetaStatus } from '@/components/campaigns/liveCampaigns';
import { BuyerlyFilterButton, BuyerlyFilterMenu, type FilterMenuMode } from '@/components/filters/BuyerlyFilter';
import type { FilterClause, FilterFieldDefinition } from '@/components/filters/filterModel';
import { InboxFilterBar } from '@/components/inbox/InboxFilterBar';
import { SidebarCollapsedNavigation } from '@/components/sidebar/SidebarCollapsedNavigation';
import { BuyerlyProjectIcon, BuyerlySearchIcon, BuyerlySlidersIcon, BuyerlyStatusCircleIcon } from '@/icons/BuyerlyIcons';
import { BuyerlySelect } from '@/ui/BuyerlyDisplayOptions';
import { BuyerlyToggle } from '@/ui/BuyerlyToggle';
import { BuyerlyTabs } from '@/ui/BuyerlyTabs';
import { Tooltip } from '@/ui/Tooltip';
import { useMenuExit } from '@/ui/useMenuExit';
import { scopeStore, useScopeStore } from '@/models/scopeStore';
import { useShellStore } from '@/models/shellStore';
import { useViewStore } from '@/models/viewStore';

const styles = stylex.create({
  match: {
    fontWeight: 700,
    color: colors['--text-primary'],
  },
  primary: {
    color: colors['--text-primary'],
  },
  tertiary: {
    color: colors['--text-tertiary'],
  },
  fixed: {
    flexShrink: 0,
  },
  grow: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
  },
  truncate: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  /** Read by screen readers only, as Tailwind's sr-only. */
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  facts: {
    borderTopWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-primary'],
    fontSize: 13,
  },
  fact: {
    display: 'flex',
    gap: 16,
    borderBottomWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-primary'],
    paddingTop: 10,
    paddingBottom: 10,
  },
  factLabel: {
    flexShrink: 0,
    color: colors['--text-tertiary'],
  },
  factValue: {
    minWidth: 0,
    userSelect: 'text',
    overflowWrap: 'break-word',
    color: colors['--text-secondary'],
  },
  recent: {
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 12,
    paddingBottom: 12,
  },
  recentHeader: {
    display: 'flex',
    height: 32,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 12,
    paddingRight: 12,
  },
  recentTitle: {
    fontSize: 12,
    fontWeight: 500,
    color: colors['--text-tertiary'],
  },
  clearHistory: {
    borderRadius: 6,
    paddingLeft: 6,
    paddingRight: 6,
    paddingTop: 2,
    paddingBottom: 2,
    fontSize: 12,
    fontWeight: 500,
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
    },
  },
  recentRow: {
    display: 'flex',
    height: 36,
    width: '100%',
    alignItems: 'center',
    gap: 10,
    borderRadius: 6,
    paddingLeft: 12,
    paddingRight: 12,
    textAlign: 'left',
    fontSize: 13,
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
    color: {
      default: colors['--text-secondary'],
      ':hover': colors['--text-primary'],
    },
  },
  /** The page's empty state and errors, centred a little above the middle. */
  empty: {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingLeft: 24,
    paddingRight: 24,
    paddingBottom: 64,
    textAlign: 'center',
  },
  emptyTitle: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  note: {
    fontSize: 13,
    color: colors['--text-tertiary'],
  },
  alert: {
    fontSize: 13,
    color: colors['--text-secondary'],
  },
  retry: {
    height: 28,
    borderRadius: 9999,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    paddingLeft: 12,
    paddingRight: 12,
    fontSize: 12,
    fontWeight: 500,
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
    color: {
      default: colors['--text-secondary'],
      ':hover': colors['--text-primary'],
    },
  },
  noResults: {
    display: 'flex',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 24,
    paddingRight: 24,
    paddingBottom: 64,
    textAlign: 'center',
  },
  results: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  result: {
    marginLeft: 8,
    marginRight: 8,
    display: 'flex',
    height: 40,
    minWidth: 0,
    alignItems: 'center',
    gap: 10,
    borderRadius: 6,
    paddingLeft: 12,
    paddingRight: 12,
    fontSize: 13,
    color: colors['--text-secondary'],
    outline: '2px solid transparent',
    outlineOffset: 2,
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
      ':focus-visible': colors['--item-hover-bg'],
    },
  },
  /** The row ↑/↓ reached, under the cursor or not. */
  resultActive: {
    backgroundColor: colors['--item-active-bg'],
  },
  kind: {
    width: 72,
    flexShrink: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 12,
    color: colors['--text-tertiary'],
  },
  mark: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
  },
  parent: {
    marginLeft: 8,
    display: {
      default: 'none',
      '@media (min-width: 640px)': 'inline',
    },
    fontSize: 12,
    color: colors['--text-tertiary'],
  },
  account: {
    display: {
      default: 'none',
      '@media (min-width: 768px)': 'inline',
    },
    maxWidth: 180,
    flexShrink: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 12,
    color: colors['--text-tertiary'],
  },
  age: {
    width: 40,
    flexShrink: 0,
    textAlign: 'right',
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    color: colors['--text-tertiary'],
  },
  page: {
    display: 'flex',
    height: '100%',
    minWidth: 0,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  search: {
    height: '100%',
    minWidth: 0,
    flexDirection: 'column',
    borderStyle: 'solid',
    borderColor: colors['--color-border-primary'],
  },
  searchFull: {
    display: 'flex',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
  },
  /** Beside the preview the results keep 400px; on a phone the preview takes the page. */
  searchBeside: {
    display: {
      default: 'none',
      '@media (min-width: 768px)': 'flex',
    },
    width: {
      default: null,
      '@media (min-width: 768px)': 400,
    },
    flexShrink: {
      default: null,
      '@media (min-width: 768px)': 0,
    },
    borderRightWidth: {
      default: null,
      '@media (min-width: 768px)': 1,
    },
  },
  header: {
    display: 'flex',
    height: 52,
    flexShrink: 0,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-primary'],
  },
  searchHeader: {
    gap: 4,
    paddingLeft: 10,
    paddingRight: 10,
  },
  form: {
    display: 'flex',
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 8,
  },
  input: {
    height: 36,
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    backgroundColor: 'transparent',
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-primary'],
    outline: '2px solid transparent',
    outlineOffset: 2,
    '::placeholder': {
      color: colors['--text-muted'],
    },
  },
  toolbar: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  tabs: {
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    overflowX: 'auto',
    scrollbarWidth: 'none',
  },
  /** As wide as its tabs: on a phone they scroll sideways instead of shrinking to "Ca…". */
  tabStrip: {
    width: 'max-content',
  },
  list: {
    minHeight: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    overflowY: 'auto',
  },
  preview: {
    display: 'flex',
    height: '100%',
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  previewHeader: {
    justifyContent: 'space-between',
    gap: 12,
    paddingLeft: {
      default: 10,
      '@media (min-width: 640px)': 16,
    },
    paddingRight: {
      default: 10,
      '@media (min-width: 640px)': 16,
    },
  },
  previewTitle: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 8,
  },
  /** Back to the results, on a phone, where the preview takes the page. */
  back: {
    display: {
      default: null,
      '@media (min-width: 768px)': 'none',
    },
  },
  previewName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-secondary'],
  },
  previewActions: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: 4,
  },
  goTo: {
    height: 28,
    whiteSpace: 'nowrap',
    borderRadius: 9999,
    paddingLeft: 10,
    paddingRight: 10,
    fontSize: 12,
    fontWeight: 500,
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
    color: {
      default: colors['--text-secondary'],
      ':hover': colors['--text-primary'],
    },
  },
  previewBody: {
    minHeight: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    overflowY: 'auto',
    paddingLeft: {
      default: 16,
      '@media (min-width: 640px)': 32,
    },
    paddingRight: {
      default: 16,
      '@media (min-width: 640px)': 32,
    },
    paddingTop: {
      default: 24,
      '@media (min-width: 640px)': 32,
    },
    paddingBottom: {
      default: 24,
      '@media (min-width: 640px)': 32,
    },
  },
  article: {
    marginLeft: 'auto',
    marginRight: 'auto',
    maxWidth: 720,
  },
  articleKind: {
    fontSize: 12,
    color: colors['--text-tertiary'],
  },
  articleTitle: {
    marginTop: 4,
    overflowWrap: 'break-word',
    fontSize: 22,
    fontWeight: 500,
    lineHeight: '28px',
    letterSpacing: '-0.015em',
    color: colors['--text-primary'],
  },
  articleFacts: {
    marginTop: 28,
  },
});

/** Something else holds the keyboard while it is open: a dialog, a menu, a select. */
const OPEN_LAYER_SELECTOR = [
  '[role="dialog"]:not(.buyerly-menu-exit)',
  '[role="alertdialog"]',
  '[role="menu"]:not([data-state="closed"])',
  '.buyerly-display-select-menu',
  '[cmdk-root]',
].join(', ');

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) return !['checkbox', 'radio', 'button'].includes(target.type);
  return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

const headerButtonClass = (active = false) =>
  `buyerly-header-button buyerly-header-button--header buyerly-header-target${active ? ' buyerly-header-button--active' : ''}`;

/** The answer on screen always belongs to the search in the address, never to an earlier one. */
type SearchState =
  | { status: 'loading'; key: string }
  | { status: 'ready'; key: string; response: SearchResponse }
  | { status: 'error'; key: string; message: string };

const resultKey = (result: SearchResult) => `${result.kind}:${result.id}`;

const RULE_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  paused: 'Paused',
  needs_review: 'Needs review',
};

/** Delivery or run state in words, never by colour alone. */
export function statusLabel(result: SearchResult): string {
  if (result.kind === 'account' || !result.status) return '';
  if (result.kind === 'rule') return RULE_STATUS_LABELS[result.status] ?? '';
  return humanizeMetaStatus(result.status);
}

/** Campaigns, ad sets and ads carry the day Buyerly first synced them, not a time. */
const isDayOnly = (result: SearchResult) => result.kind !== 'rule' && result.kind !== 'account';

/** The short age on the right, as Linear's "5d": whole days for a day, Linear's units for a moment. */
export function formatAge(result: SearchResult, now: Date = new Date()): string {
  if (!result.updated_at) return '';
  const date = new Date(result.updated_at);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.floor(Math.max(0, now.getTime() - date.getTime()) / 60_000);
  if (!isDayOnly(result) && minutes < 60) return minutes < 1 ? 'now' : `${minutes}m`;
  if (!isDayOnly(result) && minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  const days = Math.floor(minutes / (24 * 60));
  if (isDayOnly(result) && days < 1) return 'today';
  if (days < 7) return `${days}d`;
  if (days < 35) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

/** The hover title on the age, as Linear's "Updated on Sat Aug 29, 7:57 AM". */
export function formatAgeTitle(result: SearchResult): string {
  if (!result.updated_at) return '';
  const date = new Date(result.updated_at);
  const day = new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: isDayOnly(result) ? 'UTC' : undefined,
  }).format(date).replace(/,/g, '');
  if (isDayOnly(result)) return `First synced on ${day}`;
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
  return `${result.kind === 'rule' ? 'Updated' : 'Added'} on ${day}, ${time}`;
}

/** The name with every match in bold, as Linear's results show it. */
function highlight(name: string, query: string): React.ReactNode {
  const needle = query.toLowerCase();
  if (!needle) return name;
  const parts: React.ReactNode[] = [];
  const haystack = name.toLowerCase();
  let position = 0;
  for (let found = haystack.indexOf(needle); found >= 0; found = haystack.indexOf(needle, position)) {
    if (found > position) parts.push(name.slice(position, found));
    parts.push(<strong key={found} {...stylex.props(styles.match)}>{name.slice(found, found + needle.length)}</strong>);
    position = found + needle.length;
  }
  parts.push(name.slice(position));
  return parts;
}

/** A result's mark: its delivery or run state, or a cube for an ad account. */
export const StatusMark: React.FC<{ result: SearchResult }> = ({ result }) => {
  if (result.kind === 'account') return <BuyerlyProjectIcon size={14} {...stylex.props(styles.tertiary)} />;
  const status = searchStatusOf(result);
  if (status === 'active' || status === 'paused') return <BuyerlyStatusCircleIcon status={status} size={14} />;
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" stroke="var(--text-tertiary)" strokeWidth="1.5" />
      <path d="M5 9l4-4" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
};

/** A record's facts under its name: the search page's preview and the "Open …" palettes' Quick look. */
export const SearchResultFacts: React.FC<{ result: SearchResult; xstyle?: stylex.StyleXStyles; labelWidth?: number }> = ({
  result,
  xstyle,
  labelWidth = 120,
}) => (
  <dl {...stylex.props(styles.facts, xstyle)}>
    {[
      ['Status', statusLabel(result)],
      [result.kind === 'ad' ? 'Ad set' : 'Campaign', result.parent_name],
      ['Ad account', result.kind === 'account' ? '' : result.account_name],
      [result.kind === 'rule' ? 'Rule ID' : 'Meta ID', result.id],
      [isDayOnly(result) ? 'First synced' : result.kind === 'rule' ? 'Updated' : 'Added', formatAgeTitle(result).replace(/^.* on /, '')],
    ].filter(([, value]) => value).map(([label, value]) => (
      <div key={label} {...stylex.props(styles.fact)}>
        <dt {...stylex.props(styles.factLabel)} style={{ width: labelWidth }}>{label}</dt>
        <dd {...stylex.props(styles.factValue)}>{value}</dd>
      </div>
    ))}
  </dl>
);

/** Linear's empty search: small record marks around a magnifier. */
const SearchIllustration: React.FC = () => (
  <svg width="96" height="80" viewBox="0 0 96 80" fill="none" aria-hidden="true">
    {[[8, 10], [30, 4], [62, 6], [80, 22], [4, 40], [76, 50], [14, 62], [56, 66]].map(([x, y]) => (
      <rect key={`${x}-${y}`} x={x} y={y} width="12" height="12" rx="3.5" stroke="var(--text-tertiary)" strokeWidth="1.25" opacity="0.6" />
    ))}
    <circle cx="44" cy="36" r="15" stroke="var(--text-tertiary)" strokeWidth="2" />
    <path d="M55 47l10 10" stroke="var(--text-tertiary)" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

interface SearchDisplayOptionsProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  order: SearchOrder;
  includeDeleted: boolean;
  onChange: (next: Partial<SearchParams>) => void;
}

/** Linear's search Display options: Ordering and Include archived — deleted, for Meta. */
const SearchDisplayOptions: React.FC<SearchDisplayOptionsProps> = ({
  isOpen, onClose, anchorRef, order, includeDeleted, onChange,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const { isMounted, isClosing } = useMenuExit(isOpen);

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 5, left: Math.max(8, rect.right - 302) });
  }, [isOpen, anchorRef]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (target instanceof Element && target.closest('.buyerly-display-select-menu')) return;
      if (!popoverRef.current?.contains(target) && !anchorRef.current?.contains(target)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.buyerly-display-select-menu')) {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [isOpen, onClose, anchorRef]);

  if (!isMounted) return null;
  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Display options"
      className={isClosing ? 'buyerly-display-options-popover buyerly-menu-exit' : 'buyerly-display-options-popover'}
      style={{ top: coords.top, left: coords.left }}
    >
      <section className="buyerly-display-main-section">
        <div className="buyerly-display-row">
          <span>Ordering</span>
          <BuyerlySelect
            value={order}
            options={[
              { value: 'relevance', label: 'Most relevant' },
              { value: 'updated', label: 'Last updated' },
            ]}
            onChange={(value) => onChange({ order: value as SearchOrder })}
          />
        </div>
      </section>
      <section className="buyerly-display-options-section">
        <div className="buyerly-display-row">
          <span>Include deleted</span>
          <BuyerlyToggle
            label="Include deleted"
            checked={includeDeleted}
            onChange={(value) => onChange({ includeDeleted: value })}
          />
        </div>
      </section>
    </div>,
    document.body,
  );
};

interface SearchViewProps {
  workspace: Workspace;
  /** Opens an address in the app; `replace` keeps history from repeating it. */
  navigate: (path: string, replace?: boolean) => void;
  /** Changes on every navigation, so the page rereads its address. */
  navigationKey: number;
}

/**
 * Linear's search page at /<workspace>/search: a field over the whole panel,
 * tabs by kind, Filter and Display options. It searches on Enter, lists what
 * GET /api/search found in one flat list, previews the row ↑/↓ reach and
 * opens a result on its own row in Ads Manager or Rules. The first Esc closes
 * the preview, the second goes back to where search was opened from.
 */
export const SearchView: React.FC<SearchViewProps> = ({ workspace, navigate, navigationKey }) => {
  const slug = workspace.slug;
  const params = useMemo(() => parseSearchParams(searchAt(navigationKey)), [navigationKey]);
  const offered = searchFiltersFor(params.tab);
  // A filter the tab does not offer never reaches the server, as Linear's Projects tab drops issue filters.
  const applied = useMemo<SearchParams>(() => ({
    ...params,
    statuses: offered.status ? params.statuses : [],
    accounts: offered.account ? params.accounts : [],
  }), [offered.account, offered.status, params]);
  const requestKey = JSON.stringify(applied);
  const scope = useScopeStore((state) => state.workspaceScope);
  const lastAppTab = useShellStore((state) => state.lastAppTab);
  const campaignFilterTab = useViewStore((state) => state.campaignFilterTab);

  const [draft, setDraft] = useState(params.query);
  const [recent, setRecent] = useState<string[]>(() => readRecentSearches(scope));
  const [search, setSearch] = useState<SearchState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [accounts, setAccounts] = useState<MetaAccount[]>([]);
  const [filterMenu, setFilterMenu] = useState<{ mode: FilterMenuMode; anchor: HTMLElement; fieldId?: string } | null>(null);
  const [isDisplayOpen, setIsDisplayOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const displayButtonRef = useRef<HTMLButtonElement>(null);

  // The field follows the address: Back, Forward and a recent search fill it in.
  useEffect(() => setDraft(params.query), [params.query]);
  useEffect(() => setRecent(readRecentSearches(scope)), [scope]);

  useEffect(() => {
    const inScope = scopeStore.captureScope();
    apiRequest<MetaAccount[]>('/api/accounts')
      .then((items) => { if (inScope()) setAccounts(eligibleMetaAccounts(items)); })
      .catch(() => {});
  }, [slug]);

  useEffect(() => {
    setActiveKey(null);
    setPreviewOpen(false);
    if (!applied.query) {
      setSearch(null);
      return undefined;
    }
    setSearch({ status: 'loading', key: requestKey });
    const controller = new AbortController();
    const inScope = scopeStore.captureScope();
    searchWorkspace(applied, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted && inScope()) setSearch({ status: 'ready', key: requestKey, response });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || !inScope()) return;
        const message = error instanceof Error && error.message ? error.message : 'Something went wrong.';
        setSearch({ status: 'error', key: requestKey, message });
      });
    return () => controller.abort();
    // `requestKey` stands for `applied`.
  }, [requestKey, attempt]);

  const current = !applied.query ? null : search?.key === requestKey ? search : { status: 'loading' as const, key: requestKey };
  const results = useMemo(() => (current?.status === 'ready' ? current.response.results : []), [current]);
  const active = results.find((result) => resultKey(result) === activeKey) ?? null;
  const preview = previewOpen ? active : null;

  const update = useCallback((next: Partial<SearchParams>) => {
    navigate(searchPagePath(slug, { ...params, ...next }), true);
  }, [navigate, params, slug]);

  const runSearch = (text: string) => {
    const query = text.trim();
    // A recent search fills the field at once, not a render after the address.
    setDraft(query);
    if (query) setRecent(rememberSearch(scope, query));
    update({ query });
  };

  const leave = useCallback(() => {
    navigate(takeSearchReturnPath() ?? pathForTab(slug, lastAppTab, campaignFilterTab));
  }, [campaignFilterTab, lastAppTab, navigate, slug]);

  const goTo = useCallback((result: SearchResult) => {
    rememberOpenedRecord(scope, result);
    navigate(searchResultPath(slug, result));
  }, [navigate, scope, slug]);

  /** ↑/↓ walk the results and open the preview, as in Linear. */
  const move = useCallback((step: 1 | -1) => {
    if (results.length === 0) return false;
    const index = results.findIndex((result) => resultKey(result) === activeKey);
    const nextIndex = index < 0 ? (step === 1 ? 0 : results.length - 1) : Math.min(results.length - 1, Math.max(0, index + step));
    setActiveKey(resultKey(results[nextIndex]));
    setPreviewOpen(true);
    return true;
  }, [activeKey, results]);

  useEffect(() => {
    if (!activeKey) return;
    listRef.current?.querySelector(`[data-search-result="${CSS.escape(activeKey)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeKey]);

  const openFilterMenu = useCallback((mode: FilterMenuMode, anchor: HTMLElement, fieldId?: string) => {
    setIsDisplayOpen(false);
    setFilterMenu({ mode, anchor, fieldId });
  }, []);
  const hasFilters = offered.status || offered.account;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.querySelector(OPEN_LAYER_SELECTOR)) return;
      const key = event.key;
      if (key === 'Escape') {
        event.preventDefault();
        if (previewOpen) setPreviewOpen(false);
        else leave();
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        if (move(key === 'ArrowDown' ? 1 : -1)) event.preventDefault();
      } else if (key === 'Enter' && active && (event.target === document.body || (event.target as Element).closest?.('[data-search-result]'))) {
        // Only the list's Enter: a focused button keeps its own.
        event.preventDefault();
        goTo(active);
      } else if ((key === 'f' || key === 'F') && !event.shiftKey && hasFilters && filterButtonRef.current) {
        event.preventDefault();
        openFilterMenu('root', filterButtonRef.current);
      } else if ((key === 'v' || key === 'V') && event.shiftKey) {
        event.preventDefault();
        setFilterMenu(null);
        setIsDisplayOpen(true);
      }
    };
    // Capture phase: a menu's own Esc closes it before this would see the menu gone
    // and leave the page; open menus are skipped above, so they keep their keys.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [active, goTo, hasFilters, leave, move, openFilterMenu, previewOpen]);

  const statusClause = applied.statuses.length > 0 ? [{ fieldId: 'status', operator: 'is' as const, values: applied.statuses }] : [];
  const accountClause = applied.accounts.length > 0 ? [{ fieldId: 'adAccount', operator: 'is' as const, values: applied.accounts }] : [];
  const filterClauses: FilterClause[] = [...statusClause, ...accountClause];
  const filterFields: FilterFieldDefinition<unknown>[] = [
    ...(offered.status ? [{
      id: 'status',
      label: 'Status',
      section: 'search',
      type: 'enum' as const,
      operators: ['is' as const],
      defaultOperator: 'is' as const,
      getValue: () => null,
      pluralLabel: 'statuses',
      options: (Object.keys(SEARCH_STATUS_LABELS) as SearchStatus[]).map((value) => ({
        value,
        label: SEARCH_STATUS_LABELS[value],
        icon: value === 'active' ? 'status-active' as const : value === 'paused' ? 'status-paused' as const : 'dot' as const,
      })),
    }] : []),
    ...(offered.account ? [{
      id: 'adAccount',
      label: 'Ad account',
      section: 'search',
      type: 'enum' as const,
      operators: ['is' as const],
      defaultOperator: 'is' as const,
      getValue: () => null,
      pluralLabel: 'ad accounts',
      options: [
        ...accounts.map((account) => ({
          value: account.account_id,
          label: account.custom_name?.trim() || account.name.trim() || account.account_id,
          keywords: [account.account_id],
        })),
        // A chosen ad account stays in the menu even when it is no longer monitored.
        ...applied.accounts
          .filter((id) => !accounts.some((account) => account.account_id === id))
          .map((id) => ({ value: id, label: id })),
      ],
    }] : []),
  ];
  const applyFilters = (clauses: FilterClause[]) => {
    const values = (fieldId: string) => clauses.find((clause) => clause.fieldId === fieldId)?.values.map(String) ?? [];
    update({ statuses: values('status') as SearchStatus[], accounts: values('adAccount') });
  };

  const tab = SEARCH_TABS.find((item) => item.id === params.tab) ?? SEARCH_TABS[0];
  const showAccount = !preview;

  const renderBody = () => {
    if (!current) {
      if (recent.length > 0) {
        return (
          <div {...stylex.props(styles.recent)}>
            <div {...stylex.props(styles.recentHeader)}>
              <h2 {...stylex.props(styles.recentTitle)}>Recent searches</h2>
              <button
                type="button"
                onClick={() => {
                  clearRecentSearches(scope);
                  setRecent([]);
                }}
                {...stylex.props(styles.clearHistory)}
              >
                Clear History
              </button>
            </div>
            <ul aria-label="Recent searches">
              {recent.map((query) => (
                <li key={query}>
                  <button
                    type="button"
                    onClick={() => runSearch(query)}
                    {...stylex.props(styles.recentRow)}
                  >
                    <span {...stylex.props(styles.fixed, styles.tertiary)} aria-hidden="true"><BuyerlySearchIcon size={14} /></span>
                    <span {...stylex.props(styles.truncate)}>{query}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      }
      return (
        <div {...stylex.props(styles.empty)}>
          <SearchIllustration />
          <h2 {...stylex.props(styles.emptyTitle)}>Search</h2>
          <p {...stylex.props(styles.note)}>Find campaigns, ad sets, ads, rules and ad accounts.</p>
        </div>
      );
    }
    if (current.status === 'loading') {
      return <p role="status" {...stylex.props(styles.srOnly)}>{`Searching ${workspace.name}…`}</p>;
    }
    if (current.status === 'error') {
      return (
        <div {...stylex.props(styles.empty)}>
          <p role="alert" {...stylex.props(styles.alert)}>{`Couldn't search ${workspace.name}. ${current.message}`}</p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            {...stylex.props(styles.retry)}
          >
            Retry search
          </button>
        </div>
      );
    }
    if (results.length === 0) {
      return (
        <div {...stylex.props(styles.noResults)}>
          <p role="status" {...stylex.props(styles.note)}>{`No results found for "${current.response.query}"`}</p>
        </div>
      );
    }
    return (
      <>
        <p role="status" {...stylex.props(styles.srOnly)}>{`${results.length} ${results.length === 1 ? 'result' : 'results'} in ${workspace.name}.`}</p>
        <ul aria-label="Search results" {...stylex.props(styles.results)}>
          {results.map((result) => {
            const key = resultKey(result);
            const status = statusLabel(result);
            const age = formatAge(result);
            return (
              <li key={key}>
                <a
                  href={searchResultPath(slug, result)}
                  data-search-result={key}
                  data-active={key === activeKey ? 'true' : undefined}
                  onClick={(event) => {
                    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
                    event.preventDefault();
                    goTo(result);
                  }}
                  onFocus={() => setActiveKey(key)}
                  {...stylex.props(styles.result, key === activeKey && styles.resultActive)}
                >
                  <span data-search-kind="" {...stylex.props(styles.kind)}>{SEARCH_KIND_LABELS[result.kind]}</span>
                  <span {...stylex.props(styles.mark)} aria-hidden="true"><StatusMark result={result} /></span>
                  <span {...stylex.props(styles.truncate, styles.grow)}>
                    <span data-search-name="" {...stylex.props(styles.primary)}>{highlight(result.name, params.query)}</span>
                    {result.parent_name && (
                      <span {...stylex.props(styles.parent)}>{result.parent_name}</span>
                    )}
                    {status && <span {...stylex.props(styles.srOnly)}>{`, ${status}`}</span>}
                  </span>
                  {showAccount && result.account_name && (
                    <span {...stylex.props(styles.account)}>
                      {result.account_name}
                    </span>
                  )}
                  {age && (
                    <Tooltip content={formatAgeTitle(result)}>
                      <span {...stylex.props(styles.age)}>{age}</span>
                    </Tooltip>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      </>
    );
  };

  return (
    <div {...stylex.props(styles.page)}>
      <section
        aria-label="Search"
        {...stylex.props(styles.search, preview ? styles.searchBeside : styles.searchFull)}
      >
        <header {...stylex.props(styles.header, styles.searchHeader)}>
          <SidebarCollapsedNavigation />
          <form
            role="search"
            {...stylex.props(styles.form)}
            onSubmit={(event) => {
              event.preventDefault();
              runSearch(draft);
            }}
          >
            <span {...stylex.props(styles.fixed, styles.tertiary)} aria-hidden="true"><BuyerlySearchIcon size={16} /></span>
            <input
              ref={inputRef}
              data-search-page-input=""
              autoFocus
              type="text"
              aria-label="Search workspace"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && move(event.key === 'ArrowDown' ? 1 : -1)) {
                  event.preventDefault();
                } else if (event.key === 'Enter' && previewOpen && active && draft.trim() === params.query) {
                  // Enter on an open preview opens the record, as Linear's Go to.
                  event.preventDefault();
                  goTo(active);
                }
              }}
              placeholder={tab.placeholder}
              {...stylex.props(styles.input)}
            />
            {draft && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setDraft('');
                  update({ query: '' });
                  inputRef.current?.focus();
                }}
                className={headerButtonClass()}
              >
                <X size={14} strokeWidth={1.8} aria-hidden="true" />
              </button>
            )}
          </form>
        </header>

        <div {...stylex.props(styles.toolbar)}>
          <div {...stylex.props(styles.tabs)}>
            <BuyerlyTabs
              aria-label="Search in"
              // As wide as its tabs: on a phone they scroll sideways instead of shrinking to "Ca…".
              xstyle={styles.tabStrip}
              tabs={SEARCH_TABS.map(({ id, label }) => ({ id, label }))}
              activeTabId={params.tab}
              onChange={(id) => {
                const next = searchFiltersFor(id as SearchTab);
                update({
                  tab: id as SearchTab,
                  statuses: next.status ? params.statuses : [],
                  accounts: next.account ? params.accounts : [],
                });
              }}
            />
          </div>
          {hasFilters && (
            <Tooltip content="Add Filter" shortcut="F" disabled={Boolean(filterMenu)}>
              <BuyerlyFilterButton
                variant="header"
                ref={filterButtonRef}
                active={filterClauses.length > 0}
                open={Boolean(filterMenu)}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  if (filterMenu) setFilterMenu(null);
                  else openFilterMenu('root', event.currentTarget);
                }}
              />
            </Tooltip>
          )}
          <Tooltip content="Show display options" shortcut="Shift V" disabled={isDisplayOpen}>
            <button
              ref={displayButtonRef}
              type="button"
              aria-label="Display options"
              aria-expanded={isDisplayOpen}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => setIsDisplayOpen((open) => !open)}
              className={headerButtonClass(isDisplayOpen)}
            >
              <BuyerlySlidersIcon size={14} />
            </button>
          </Tooltip>
          <SearchDisplayOptions
            isOpen={isDisplayOpen}
            onClose={() => setIsDisplayOpen(false)}
            anchorRef={displayButtonRef}
            order={params.order}
            includeDeleted={params.includeDeleted}
            onChange={update}
          />
        </div>

        <InboxFilterBar fields={filterFields} clauses={filterClauses} onChange={applyFilters} onOpenMenu={openFilterMenu} />
        <BuyerlyFilterMenu
          isOpen={Boolean(filterMenu)}
          mode={filterMenu?.mode ?? 'root'}
          anchorElement={filterMenu?.anchor ?? null}
          fieldId={filterMenu?.fieldId}
          fields={filterFields}
          clauses={filterClauses}
          onChange={applyFilters}
          onClose={() => setFilterMenu(null)}
          countNoun={['result', 'results']}
          childWidth={260}
          rootPlaceholder="Add Filter…"
        />

        <div
          ref={listRef}
          aria-busy={current?.status === 'loading'}
          {...stylex.props(styles.list)}
        >
          {renderBody()}
        </div>
      </section>

      {preview && (
        <section aria-label="Preview" {...stylex.props(styles.preview)}>
          <header {...stylex.props(styles.header, styles.previewHeader)}>
            <div {...stylex.props(styles.previewTitle)}>
              <button type="button" onClick={() => setPreviewOpen(false)} {...withClassName(stylex.props(styles.back), 'buyerly-icon-btn')} aria-label="Back to results">
                <ArrowLeft size={16} aria-hidden="true" />
              </button>
              <span {...stylex.props(styles.mark)} aria-hidden="true"><StatusMark result={preview} /></span>
              <span {...stylex.props(styles.previewName)}>{preview.name}</span>
            </div>
            <div {...stylex.props(styles.previewActions)}>
              <button
                type="button"
                onClick={() => goTo(preview)}
                {...stylex.props(styles.goTo)}
              >
                {`Go to ${SEARCH_KIND_LABELS[preview.kind].toLowerCase()}`}
              </button>
              <Tooltip content="Close preview" shortcut="Esc">
                <button type="button" aria-label="Close preview" onClick={() => setPreviewOpen(false)} className={headerButtonClass()}>
                  <X size={14} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
          </header>
          <div {...stylex.props(styles.previewBody)}>
            <article {...stylex.props(styles.article)}>
              <p {...stylex.props(styles.articleKind)}>{SEARCH_KIND_LABELS[preview.kind]}</p>
              <h2 {...stylex.props(styles.articleTitle)}>
                {preview.name}
              </h2>
              <SearchResultFacts result={preview} xstyle={styles.articleFacts} />
            </article>
          </div>
        </section>
      )}
    </div>
  );
};
