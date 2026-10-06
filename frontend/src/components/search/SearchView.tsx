import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Wallet, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { apiRequest } from '@/lib/api';
import { pathForTab } from '@/lib/routing';
import {
  clearRecentSearches,
  parseSearchParams,
  readRecentSearches,
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
import { LinearFilterButton, LinearFilterMenu, type FilterMenuMode } from '@/components/filters/LinearFilter';
import type { FilterClause, FilterFieldDefinition } from '@/components/filters/filterModel';
import { InboxFilterBar } from '@/components/inbox/InboxFilterBar';
import { SidebarCollapsedNavigation } from '@/components/sidebar/SidebarCollapsedNavigation';
import { LinearSearchIcon, LinearSlidersIcon, LinearStatusCircleIcon } from '@/icons/LinearIcons';
import { LinearSelect } from '@/ui/LinearDisplayOptions';
import { LinearToggle } from '@/ui/LinearToggle';
import { LinearTabs } from '@/ui/LinearTabs';
import { Tooltip } from '@/ui/Tooltip';
import { useMenuExit } from '@/ui/useMenuExit';

/** Something else holds the keyboard while it is open: a dialog, a menu, a select. */
const OPEN_LAYER_SELECTOR = [
  '[role="dialog"]:not(.linear-menu-exit)',
  '[role="alertdialog"]',
  '[role="menu"]:not([data-state="closed"])',
  '.linear-display-select-menu',
  '[cmdk-root]',
].join(', ');

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) return !['checkbox', 'radio', 'button'].includes(target.type);
  return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

const headerButtonClass = (active = false) =>
  `flex h-7 w-7 shrink-0 items-center justify-center rounded-full outline-none transition-[border-color,background-color,color,opacity,fill,stroke] duration-150 ease-[ease] ${
    active
      ? 'bg-[var(--item-active-bg)] text-[var(--text-primary)]'
      : 'text-[var(--text-tertiary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]'
  }`;

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
function statusLabel(result: SearchResult): string {
  if (result.kind === 'account' || !result.status) return '';
  if (result.kind === 'rule') return RULE_STATUS_LABELS[result.status] ?? '';
  return humanizeMetaStatus(result.status);
}

/** Campaigns, ad sets and ads carry the day Buyerly first synced them, not a time. */
const isDayOnly = (result: SearchResult) => result.kind !== 'rule' && result.kind !== 'account';

/** The short age on the right, as Linear's "5d": whole days for a day, Linear's units for a moment. */
function formatAge(result: SearchResult, now: Date = new Date()): string {
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
function formatAgeTitle(result: SearchResult): string {
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
    parts.push(<strong key={found} className="font-bold text-[var(--text-primary)]">{name.slice(found, found + needle.length)}</strong>);
    position = found + needle.length;
  }
  parts.push(name.slice(position));
  return parts;
}

/** A result's mark: its delivery or run state, or a wallet for an ad account. */
export const StatusMark: React.FC<{ result: SearchResult }> = ({ result }) => {
  if (result.kind === 'account') return <Wallet size={14} strokeWidth={1.75} className="text-[var(--text-tertiary)]" />;
  const status = searchStatusOf(result);
  if (status === 'active' || status === 'paused') return <LinearStatusCircleIcon status={status} size={14} />;
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" stroke="var(--text-tertiary)" strokeWidth="1.5" />
      <path d="M5 9l4-4" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
};

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
      if (target instanceof Element && target.closest('.linear-display-select-menu')) return;
      if (!popoverRef.current?.contains(target) && !anchorRef.current?.contains(target)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.linear-display-select-menu')) {
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
      className={isClosing ? 'linear-display-options-popover linear-menu-exit' : 'linear-display-options-popover'}
      style={{ top: coords.top, left: coords.left }}
    >
      <section className="linear-display-main-section">
        <div className="linear-display-row">
          <span>Ordering</span>
          <LinearSelect
            value={order}
            options={[
              { value: 'relevance', label: 'Most relevant' },
              { value: 'updated', label: 'Last updated' },
            ]}
            onChange={(value) => onChange({ order: value as SearchOrder })}
          />
        </div>
      </section>
      <section className="linear-display-options-section">
        <div className="linear-display-row">
          <span>Include deleted</span>
          <LinearToggle
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const params = useMemo(() => parseSearchParams(window.location.search), [navigationKey]);
  const offered = searchFiltersFor(params.tab);
  // A filter the tab does not offer never reaches the server, as Linear's Projects tab drops issue filters.
  const applied = useMemo<SearchParams>(() => ({
    ...params,
    statuses: offered.status ? params.statuses : [],
    accounts: offered.account ? params.accounts : [],
  }), [offered.account, offered.status, params]);
  const requestKey = JSON.stringify(applied);
  const scope = useAppStore((state) => state.workspaceScope);
  const lastAppTab = useAppStore((state) => state.lastAppTab);
  const campaignFilterTab = useAppStore((state) => state.campaignFilterTab);

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
    const inScope = useAppStore.getState().captureScope();
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
    const inScope = useAppStore.getState().captureScope();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const goTo = useCallback((result: SearchResult) => navigate(searchResultPath(slug, result)), [navigate, slug]);

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
      } else if ((key === 'v' || key === 'V') && !event.shiftKey) {
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
          <div className="px-2 py-3">
            <div className="flex h-8 items-center justify-between px-3">
              <h2 className="text-[12px] font-medium text-[var(--text-tertiary)]">Recent searches</h2>
              <button
                type="button"
                onClick={() => {
                  clearRecentSearches(scope);
                  setRecent([]);
                }}
                className="rounded-[6px] px-1.5 py-0.5 text-[12px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]"
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
                    className="flex h-9 w-full items-center gap-2.5 rounded-[6px] px-3 text-left text-[13px] text-[var(--text-secondary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]"
                  >
                    <span className="shrink-0 text-[var(--text-tertiary)]" aria-hidden="true"><LinearSearchIcon size={14} /></span>
                    <span className="min-w-0 truncate">{query}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      }
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 pb-16 text-center">
          <SearchIllustration />
          <h2 className="mt-2 text-[15px] font-medium text-[var(--text-primary)]">Search</h2>
          <p className="text-[13px] text-[var(--text-tertiary)]">Find campaigns, ad sets, ads, rules and ad accounts.</p>
        </div>
      );
    }
    if (current.status === 'loading') {
      return <p role="status" className="sr-only">{`Searching ${workspace.name}…`}</p>;
    }
    if (current.status === 'error') {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 pb-16 text-center">
          <p role="alert" className="text-[13px] text-[var(--text-secondary)]">{`Couldn't search ${workspace.name}. ${current.message}`}</p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="h-7 rounded-full border border-[var(--color-border-secondary)] px-3 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]"
          >
            Retry search
          </button>
        </div>
      );
    }
    if (results.length === 0) {
      return (
        <div className="flex h-full items-center justify-center px-6 pb-16 text-center">
          <p role="status" className="text-[13px] text-[var(--text-tertiary)]">{`No results found for "${current.response.query}"`}</p>
        </div>
      );
    }
    return (
      <>
        <p role="status" className="sr-only">{`${results.length} ${results.length === 1 ? 'result' : 'results'} in ${workspace.name}.`}</p>
        <ul aria-label="Search results" className="py-1">
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
                  className="mx-2 flex h-10 min-w-0 items-center gap-2.5 rounded-[6px] px-3 text-[13px] text-[var(--text-secondary)] outline-none hover:bg-[var(--item-hover-bg)] focus-visible:bg-[var(--item-hover-bg)] data-[active=true]:bg-[var(--item-active-bg)]"
                >
                  <span data-search-kind="" className="w-[72px] shrink-0 truncate text-[12px] text-[var(--text-tertiary)]">{SEARCH_KIND_LABELS[result.kind]}</span>
                  <span className="flex shrink-0 items-center" aria-hidden="true"><StatusMark result={result} /></span>
                  <span className="min-w-0 flex-1 truncate">
                    <span data-search-name="" className="text-[var(--text-primary)]">{highlight(result.name, params.query)}</span>
                    {result.parent_name && (
                      <span className="ml-2 hidden text-[12px] text-[var(--text-tertiary)] sm:inline">{result.parent_name}</span>
                    )}
                    {status && <span className="sr-only">{`, ${status}`}</span>}
                  </span>
                  {showAccount && result.account_name && (
                    <span className="hidden max-w-[180px] shrink-0 truncate text-[12px] text-[var(--text-tertiary)] md:inline">
                      {result.account_name}
                    </span>
                  )}
                  {age && (
                    <Tooltip content={formatAgeTitle(result)}>
                      <span className="w-[40px] shrink-0 text-right text-[12px] tabular-nums text-[var(--text-tertiary)]">{age}</span>
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
    <div className="flex h-full min-w-0 overflow-hidden bg-transparent">
      <section
        aria-label="Search"
        className={`${preview ? 'hidden md:flex md:w-[400px] md:shrink-0 md:border-r' : 'flex flex-1'} h-full min-w-0 flex-col border-[var(--color-border-primary)]`}
      >
        <header className="flex h-[52px] shrink-0 items-center gap-1 border-b border-[var(--color-border-primary)] px-2.5">
          <SidebarCollapsedNavigation />
          <form
            role="search"
            className="flex min-w-0 flex-1 items-center gap-2 pl-2"
            onSubmit={(event) => {
              event.preventDefault();
              runSearch(draft);
            }}
          >
            <span className="shrink-0 text-[var(--text-tertiary)]" aria-hidden="true"><LinearSearchIcon size={16} /></span>
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
              className="h-9 min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
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

        <div className="flex shrink-0 items-center gap-2 px-3 py-2">
          <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]">
            <LinearTabs
              aria-label="Search in"
              // As wide as its tabs: on a phone they scroll sideways instead of shrinking to "Ca…".
              className="w-max"
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
            <Tooltip content="Filter" shortcut="F" disabled={Boolean(filterMenu)}>
              <LinearFilterButton
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
          <Tooltip content="Display options" shortcut="V" disabled={isDisplayOpen}>
            <button
              ref={displayButtonRef}
              type="button"
              aria-label="Display options"
              aria-expanded={isDisplayOpen}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => setIsDisplayOpen((open) => !open)}
              className={headerButtonClass(isDisplayOpen)}
            >
              <LinearSlidersIcon size={14} />
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
        <LinearFilterMenu
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
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {renderBody()}
        </div>
      </section>

      {preview && (
        <section aria-label="Preview" className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-[52px] shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border-primary)] px-2.5 sm:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <button type="button" onClick={() => setPreviewOpen(false)} className="linear-icon-btn md:hidden" aria-label="Back to results">
                <ArrowLeft size={16} aria-hidden="true" />
              </button>
              <span className="flex shrink-0 items-center" aria-hidden="true"><StatusMark result={preview} /></span>
              <span className="truncate text-[13px] font-medium text-[var(--text-secondary)]">{preview.name}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => goTo(preview)}
                className="h-7 whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]"
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
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
            <article className="mx-auto max-w-[720px]">
              <p className="text-[12px] text-[var(--text-tertiary)]">{SEARCH_KIND_LABELS[preview.kind]}</p>
              <h2 className="mt-1 break-words text-[22px] font-medium leading-7 tracking-[-0.015em] text-[var(--text-primary)]">
                {preview.name}
              </h2>
              <dl className="mt-7 border-t border-[var(--color-border-primary)] text-[13px]">
                {[
                  ['Status', statusLabel(preview)],
                  [preview.kind === 'ad' ? 'Ad set' : 'Campaign', preview.parent_name],
                  ['Ad account', preview.kind === 'account' ? '' : preview.account_name],
                  [preview.kind === 'rule' ? 'Rule ID' : 'Meta ID', preview.id],
                  [isDayOnly(preview) ? 'First synced' : preview.kind === 'rule' ? 'Updated' : 'Added', formatAgeTitle(preview).replace(/^.* on /, '')],
                ].filter(([, value]) => value).map(([label, value]) => (
                  <div key={label} className="flex gap-4 border-b border-[var(--color-border-primary)] py-2.5">
                    <dt className="w-[120px] shrink-0 text-[var(--text-tertiary)]">{label}</dt>
                    <dd className="min-w-0 break-words text-[var(--text-secondary)]">{value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          </div>
        </section>
      )}
    </div>
  );
};
