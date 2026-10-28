import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { ArrowLeft } from 'lucide-react';
import { ApiError } from '@/lib/api';
import {
  auditEventPaths,
  auditEventTarget,
  auditEventTitle,
  auditUndoHint,
  formatAuditTimestamp,
  humanizeAuditValue,
  undoAuditEvent,
} from '@/lib/audit';
import {
  INBOX_PAGE_SIZE,
  decodeInboxFilter,
  deleteAllInbox,
  deleteInboxNotification,
  encodeInboxFilter,
  fetchInbox,
  fetchInboxFacets,
  formatSnoozeTime,
  groupInboxItems,
  inboxListKey,
  inboxPageKey,
  inboxTabShown,
  markInboxRead,
  sanitizeInboxFilters,
  snoozeInboxNotification,
  type InboxActionResponse,
  type InboxFacets,
  type InboxFilterClause,
  type InboxItem,
  type InboxPage,
  type InboxQuery,
  type InboxTab,
} from '@/lib/inbox';
import { BuyerlyFilterButton, BuyerlyFilterMenu, type FilterMenuMode } from '@/components/filters/BuyerlyFilter';
import { InboxFilterBar, InboxFilterFooter } from './InboxFilterBar';
import { fromMenuClauses, inboxFilterFields, toMenuClause } from './inboxFilterFields';
import { InboxGroupHeader, InboxItemRow } from './InboxItemRow';
import { InboxDisplayOptionsPopover } from './InboxDisplayOptionsPopover';
import { SnoozeCalendarDialog } from './SnoozeCalendarDialog';
import { SNOOZE_SEARCH_HINT, SnoozePalette } from './SnoozePalette';
import { usePageCommands } from '@/components/command/pageCommands';
import {
  BuyerlyLogoAvatar,
  BuyerlyClockOutlineIcon,
  BuyerlyDotsIcon,
  BuyerlyEmptyInboxIllustration,
  BuyerlyInboxDeleteIcon,
  BuyerlyInboxUnreadIcon,
  BuyerlySlidersIcon,
} from '@/icons/BuyerlyIcons';
import { Button } from '@/ui/Button';
import { DataState } from '@/ui/DataState';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import { Tooltip } from '@/ui/Tooltip';
import { BuyerlySplitResizer, useSplitListWidth } from '@/ui/BuyerlySplitResizer';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { afterPaint, pool } from '@/models/pool';
import { usePoolValue } from '@/models/usePool';
import { SidebarCollapsedNavigation } from '@/components/sidebar/SidebarCollapsedNavigation';
import { usePagePathname } from '@/lib/pageScope';
import { useViewStore, viewStore } from '@/models/viewStore';
import { useInboxStore } from '@/models/inboxStore';
import { useScopeStore } from '@/models/scopeStore';
import * as stylex from '@stylexjs/stylex';
import { colors, radii } from '@/styles/tokens.stylex';
import { withClassName } from '@/ui/withClassName';
import { openSettings } from '@/lib/routing';
import { BuyerlyDisplayOptionsButton, BuyerlyToolbarButton } from '@/ui/BuyerlyToolbarButton';

type LoadState = 'loading' | 'ready' | 'error';
type ActionState = 'idle' | 'loading';

interface InboxViewProps {
  /** The notification open on the right, from the /<workspace>/inbox[/<tab>]/<id> address. */
  openEventId?: string;
  /** Priority inbox tab from the address: /<workspace>/inbox/priority or /other, as in Linear. */
  inboxTab: InboxTab | null;
  onNavigate: (tab: InboxTab | null, eventId: number | null) => void;
  /** Opens a record address elsewhere in the app: a rule, a campaign, an ad set. */
  onOpenRecord: (path: string) => void;
}

/** Linear's Inbox list: 300px at least, at most half the canvas, 400px until dragged. */
const INBOX_LIST_MIN_WIDTH = 300;
const INBOX_SPLIT_QUERY = '(min-width: 768px)';
/** How long after G the next letter is a go-to, as the App's shortcuts read it. */
const GO_TO_PREFIX_WINDOW_MS = 1500;

function requestErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

const WIDE = '@media (min-width: 640px)';
const SPLIT = '@media (min-width: 768px)';

const truncate = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

const styles = stylex.create({
  metadataRow: {
    display: 'grid',
    gridTemplateColumns: {
      default: null,
      [WIDE]: '140px minmax(0, 1fr)',
    },
    gap: {
      default: 4,
      [WIDE]: 16,
    },
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderColor: colors['--color-border-primary'],
    paddingTop: 12,
    paddingBottom: 12,
  },
  metadataLabel: {
    fontSize: 13,
    color: colors['--text-muted'],
  },
  metadataValue: {
    minWidth: 0,
    overflowWrap: 'break-word',
    fontSize: 14,
    color: colors['--text-secondary'],
  },
  recordLink: {
    color: colors['--text-primary'],
    textDecorationLine: 'underline',
    textDecorationColor: {
      default: colors['--color-border-secondary'],
      ':hover': colors['--text-tertiary'],
    },
    textUnderlineOffset: 2,
    outline: '2px solid transparent',
    outlineOffset: 2,
    borderRadius: {
      default: null,
      ':focus-visible': 2,
    },
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
  },
  menuKey: {
    fontFamily: '"Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: 12,
    fontWeight: 500,
    color: colors['--text-muted'],
  },
  menuLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  fill: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
  },
  empty: {
    display: 'flex',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 24,
    paddingRight: 24,
  },
  emptyStack: {
    flexDirection: 'column',
    gap: 20,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-tertiary'],
  },
  showAll: {
    fontSize: 13,
    fontWeight: 500,
    color: {
      default: colors['--text-secondary'],
      ':hover': colors['--text-primary'],
    },
  },
  list: {
    minHeight: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    overflowY: 'auto',
    paddingTop: 8,
    paddingBottom: 8,
  },
  root: {
    position: 'relative',
    display: 'flex',
    height: '100%',
    minWidth: 0,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  // Beside the notification from 768px, at the width the split keeps in --inbox-list-width.
  inboxList: {
    display: 'flex',
    height: '100%',
    minWidth: 0,
    width: {
      default: '100%',
      [SPLIT]: 'var(--inbox-list-width)',
    },
    maxWidth: {
      default: null,
      [SPLIT]: 'var(--inbox-list-width)',
    },
    flexShrink: {
      default: null,
      [SPLIT]: 0,
    },
    flexDirection: 'column',
  },
  // A phone shows the list or the notification, not both.
  hiddenUntilSplit: {
    display: {
      default: 'none',
      [SPLIT]: 'flex',
    },
  },
  header: {
    display: 'flex',
    height: 44,
    flexShrink: 0,
    alignItems: 'center',
    gap: 4,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderColor: colors['--color-border-primary'],
    paddingLeft: 10,
    paddingRight: 10,
  },
  title: {
    paddingLeft: 8,
    paddingRight: 4,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: '16px',
    color: colors['--text-secondary'],
  },
  notification: {
    display: 'flex',
    height: '100%',
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  notificationHeader: {
    justifyContent: 'space-between',
    gap: 12,
    paddingLeft: {
      default: 10,
      [WIDE]: 16,
    },
    paddingRight: {
      default: 10,
      [WIDE]: 16,
    },
  },
  notificationTitle: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 8,
  },
  back: {
    display: {
      default: null,
      [SPLIT]: 'none',
    },
  },
  notificationName: {
    ...truncate,
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-secondary'],
  },
  notificationActions: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: 4,
  },
  scroll: {
    minHeight: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    overflowY: 'auto',
    paddingLeft: {
      default: 16,
      [WIDE]: 32,
    },
    paddingRight: {
      default: 16,
      [WIDE]: 32,
    },
    paddingTop: {
      default: 24,
      [WIDE]: 32,
    },
    paddingBottom: {
      default: 24,
      [WIDE]: 32,
    },
  },
  article: {
    marginLeft: 'auto',
    marginRight: 'auto',
    maxWidth: 720,
  },
  lead: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 14,
  },
  leadText: {
    minWidth: 0,
  },
  heading: {
    overflowWrap: 'break-word',
    fontSize: 22,
    fontWeight: 500,
    lineHeight: '28px',
    letterSpacing: '-0.015em',
    color: colors['--text-primary'],
  },
  timestamp: {
    marginTop: 4,
    fontSize: 13,
    color: colors['--text-tertiary'],
  },
  message: {
    marginTop: 24,
    fontSize: 14,
    lineHeight: 1.625,
    color: colors['--text-secondary'],
  },
  metadata: {
    marginTop: 28,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderColor: colors['--color-border-primary'],
  },
  undo: {
    marginTop: 28,
    borderRadius: radii['--control-border-radius'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-primary'],
    backgroundColor: colors['--card-bg'],
    paddingTop: 16,
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 16,
  },
  undoTitle: {
    fontSize: 14,
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  undoHint: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 1.625,
    color: colors['--text-tertiary'],
  },
  undoButton: {
    marginTop: 16,
    fontSize: 14,
  },
  outcome: {
    marginTop: 16,
    fontSize: 14,
    color: colors['--text-secondary'],
  },
  outcomeError: {
    color: colors['--text-primary'],
  },
  nothingSelected: {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingLeft: 24,
    paddingRight: 24,
    textAlign: 'center',
  },
  nothingSelectedError: {
    fontSize: 13,
    color: colors['--text-primary'],
  },
});

function MetadataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div {...stylex.props(styles.metadataRow)}>
      <dt {...stylex.props(styles.metadataLabel)}>{label}</dt>
      <dd {...stylex.props(styles.metadataValue)}>{value}</dd>
    </div>
  );
}

/** A metadata value that opens its record, in place like any app link; Ctrl/Cmd+click opens a new tab. */
function RecordLink({ path, label, onOpen }: { path: string; label: string; onOpen: (path: string) => void }) {
  return (
    <a
      href={path}
      onClick={(event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        onOpen(path);
      }}
      {...stylex.props(styles.recordLink)}
    >
      {label}
    </a>
  );
}

const MenuKey: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd {...stylex.props(styles.menuKey)}>{children}</kbd>
);

const OPEN_LAYER_SELECTOR = [
  '[role="menu"]:not([data-state="closed"])',
  '[role="dialog"]:not(.buyerly-menu-exit)',
  '.buyerly-display-select-menu',
].join(', ');

/** Notifications the filters hide; an older API leaves the count out. */
const hiddenByFiltersOf = (response: { hidden_by_filters?: number | null }) => response.hidden_by_filters ?? 0;

const InboxViewContent: React.FC<InboxViewProps> = ({ openEventId, inboxTab, onNavigate, onOpenRecord }) => {
  const workspaceSlug = useScopeStore((state) => state.workspaceSlug);
  const inboxUnreadCount = useInboxStore((state) => state.inboxUnreadCount);
  const inboxPriorityUnreadCount = useInboxStore((state) => state.inboxPriorityUnreadCount);
  const setInboxUnread = useInboxStore((state) => state.setInboxUnread);
  const inboxDisplay = useInboxStore((state) => state.inboxDisplay);
  const inboxDisplayLoaded = useInboxStore((state) => state.inboxDisplayLoaded);
  const inboxDisplayKept = useInboxStore((state) => state.inboxDisplayKept);
  const loadInboxDisplay = useInboxStore((state) => state.loadInboxDisplay);
  const setInboxDisplay = useInboxStore((state) => state.setInboxDisplay);
  const viewSettingsLoaded = useViewStore((state) => state.viewSettingsLoaded);
  const loadViewSettings = useViewStore((state) => state.loadViewSettings);
  const setViewSettings = useViewStore((state) => state.setViewSettings);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [items, setItems] = useState<InboxItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [isDisplayOpen, setIsDisplayOpen] = useState(false);
  // H and the header clock open the same palette; only the search hint differs.
  const [snoozePalette, setSnoozePalette] = useState<'key' | 'button' | null>(null);
  const [customSnoozeItem, setCustomSnoozeItem] = useState<InboxItem | null>(null);
  const [actionState, setActionState] = useState<ActionState>('idle');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const requestGenerationRef = useRef(0);
  const itemsRef = useRef<InboxItem[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const displayButtonRef = useRef<HTMLButtonElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePagePathname();
  useLayoutEffect(() => {
    itemsRef.current = items;
  });
  // Filters live in the address, as in Linear, so a filtered Inbox survives reloads and links.
  const [filters, setFilters] = useState<InboxFilterClause[]>(
    () => decodeInboxFilter(new URLSearchParams(window.location.search).get('filter')),
  );
  const [hiddenByFilters, setHiddenByFilters] = useState(0);
  const [facets, setFacets] = useState<InboxFacets | null>(null);
  const [filterMenu, setFilterMenu] = useState<{ mode: FilterMenuMode; anchor: HTMLElement; fieldId?: string; fromFilterButton: boolean } | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());
  // Read state as each notification was first seen, so Focus groups hold still
  // while notifications are read, as in Linear.
  const [readOnFirstSeen, setReadOnFirstSeen] = useState<ReadonlyMap<number, boolean>>(() => new Map());
  const unseen = items.filter((item) => !readOnFirstSeen.has(item.id));
  if (unseen.length > 0) setReadOnFirstSeen(new Map([...readOnFirstSeen, ...unseen.map((item) => [item.id, item.is_read] as const)]));

  // With priority inbox on, Linear always shows one of its two tabs.
  const activeTab = inboxTabShown(inboxDisplay, inboxTab);
  const tabRef = useRef(activeTab);
  useLayoutEffect(() => {
    tabRef.current = activeTab;
  });
  // Only what changes the list reloads it; Badge count, for one, does not.
  const queryKey = inboxListKey(inboxDisplay, activeTab);
  const listQuery = useMemo(() => JSON.parse(queryKey) as Omit<InboxQuery, 'offset'>, [queryKey]);

  // The list as last shown for these options and filters, held in the pool (#488): an Inbox
  // already visited draws it in its first frame, set here while rendering, before anything is painted.
  const pageKey = inboxPageKey(queryKey, filters);
  const held = usePoolValue<InboxPage>(pageKey);
  const [itemsKey, setItemsKey] = useState<string | null>(null);
  if (itemsKey !== pageKey && held) {
    setItemsKey(pageKey);
    setItems(held.items);
    setHasMore(held.hasMore);
    setHiddenByFilters(held.hiddenByFilters);
    setLoadError('');
    setLoadState('ready');
  }
  // Every change to the list on screen, a read or a mark, goes back to the pool.
  useEffect(() => {
    if (itemsKey === pageKey && loadState === 'ready') pool.setValue({ key: pageKey }, { items, hasMore, hiddenByFilters });
  }, [hasMore, hiddenByFilters, items, itemsKey, loadState, pageKey]);

  // Wider than md the list and the notification sit side by side, the list resizable as in Linear.
  // Destructured: the React Compiler takes a whole object holding a ref for one (#492).
  const {
    containerRef: splitContainerRef, width: splitWidth, minWidth: splitMinWidth, maxWidth: splitMaxWidth,
    setWidth: setSplitWidth, saveWidth: saveSplitWidth,
  } = useSplitListWidth('buyerly-inbox-list-width', INBOX_LIST_MIN_WIDTH);
  const splitShown = useMediaQuery(INBOX_SPLIT_QUERY);

  const selectedId = openEventId && /^\d+$/.test(openEventId) ? Number(openEventId) : null;
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );
  const selectedPaths = selectedItem && workspaceSlug ? auditEventPaths(workspaceSlug, selectedItem) : {};

  useEffect(() => {
    if (!inboxDisplayLoaded) void loadInboxDisplay();
  }, [inboxDisplayLoaded, loadInboxDisplay]);

  // Turning priority inbox on opens /inbox/priority, turning it off /inbox, as in Linear;
  // never on the local database's copy of the options, which may be older than the address (#496).
  useEffect(() => {
    if (!inboxDisplayLoaded || inboxDisplayKept) return;
    if (inboxDisplay.priorityInbox && !inboxTab) onNavigate('priority', selectedId);
    else if (!inboxDisplay.priorityInbox && inboxTab) onNavigate(null, selectedId);
  }, [inboxDisplay.priorityInbox, inboxDisplayKept, inboxDisplayLoaded, inboxTab, onNavigate, selectedId]);

  // The saved filters (#385): an address without `?filter=` gets them back, a link with one replaces them.
  useEffect(() => {
    if (!viewSettingsLoaded) void loadViewSettings();
  }, [loadViewSettings, viewSettingsLoaded]);
  const [filtersSettled, setFiltersSettled] = useState(false);

  const load = useCallback(async (quiet: boolean) => {
    // The list waits for the member's saved Display options and filters, so it is not drawn twice.
    if (!inboxDisplayLoaded || !filtersSettled) return;
    const key = pageKey;
    const generation = ++requestGenerationRef.current;
    if (!quiet) setLoadState('loading');
    try {
      const response = await fetchInbox({
        offset: 0,
        // A background refresh keeps everything already scrolled into view.
        limit: Math.min(100, Math.max(INBOX_PAGE_SIZE, itemsRef.current.length)),
        ...listQuery,
        filters,
      });
      if (generation !== requestGenerationRef.current) return;
      if (!quiet) setReadOnFirstSeen(new Map());
      // Current from now: Inbox opened again within STALE_AFTER_MS asks nothing.
      pool.setValue({ key }, { items: response.items, hasMore: response.has_more, hiddenByFilters: hiddenByFiltersOf(response) }, { read: true });
      setItems(response.items);
      setItemsKey(key);
      setHasMore(response.has_more);
      setHiddenByFilters(hiddenByFiltersOf(response));
      setInboxUnread(response);
      setLoadError('');
      setLoadState('ready');
    } catch (error) {
      if (generation !== requestGenerationRef.current || quiet) return;
      setLoadError(requestErrorMessage(error));
      setLoadState('error');
    }
  }, [filters, filtersSettled, inboxDisplayLoaded, listQuery, pageKey, setInboxUnread]);

  useEffect(() => {
    // Held and read a moment ago: drawn as it is, as the pool's other pages are.
    if (reloadToken === 0 && pool.current(pageKey)) return undefined;
    // Held: already drawn, read again behind it once it is painted.
    if (pool.has(pageKey)) {
      let active = true;
      afterPaint(() => {
        if (active) void load(true);
      });
      return () => {
        active = false;
        requestGenerationRef.current += 1;
      };
    }
    itemsRef.current = [];
    void load(false);
    return () => {
      requestGenerationRef.current += 1;
    };
  }, [load, reloadToken]);

  useEffect(() => {
    const interval = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || loadState !== 'ready') return;
    const generation = requestGenerationRef.current;
    setIsLoadingMore(true);
    try {
      const response = await fetchInbox({ offset: itemsRef.current.length, ...listQuery, filters });
      if (generation === requestGenerationRef.current) {
        setItems((current) => {
          const known = new Set(current.map((item) => item.id));
          return [...current, ...response.items.filter((item) => !known.has(item.id))];
        });
        setHasMore(response.has_more);
        setInboxUnread(response);
      }
    } catch {
      // Scrolling again retries.
    }
    setIsLoadingMore(false);
  }, [filters, hasMore, isLoadingMore, listQuery, loadState, setInboxUnread]);

  const applyFilters = useCallback((next: InboxFilterClause[]) => {
    setFilters(next);
    setViewSettings('inbox', next.length ? { filters: next } : null);
    const params = new URLSearchParams(window.location.search);
    if (next.length) params.set('filter', encodeInboxFilter(next));
    else params.delete('filter');
    const search = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${search ? `?${search}` : ''}`);
  }, [setViewSettings]);

  // Once the saved filters are in: below applyFilters, which it calls.
  useEffect(() => {
    if (!viewSettingsLoaded || filtersSettled) return;
    setFiltersSettled(true);
    const saved = sanitizeInboxFilters(viewStore.viewSettings.inbox?.filters);
    if (new URLSearchParams(window.location.search).get('filter') !== null) {
      if (JSON.stringify(saved) !== JSON.stringify(filters)) {
        setViewSettings('inbox', filters.length ? { filters } : null);
      }
    } else if (saved.length) {
      applyFilters(saved);
    }
    // Settled once per arrival; later changes save as they happen.
  }, [viewSettingsLoaded]);

  const openFilterMenu = useCallback((mode: FilterMenuMode, anchor: HTMLElement, fieldId?: string) => {
    setIsDisplayOpen(false);
    setFilterMenu({ mode, anchor, fieldId, fromFilterButton: anchor === filterButtonRef.current });
    // Counts are read fresh each time, like Linear's "2 notifications" next to each value.
    fetchInboxFacets(listQuery.unreadOnly, listQuery.showSnoozed, listQuery).then(setFacets).catch(() => {});
  }, [listQuery]);

  const filterFields = useMemo(
    () => inboxFilterFields(facets, filters),
    [facets, filters],
  );
  const filterClauses = useMemo(() => filters.map(toMenuClause), [filters]);

  const applyResponse = useCallback(
    (response: InboxActionResponse) => setInboxUnread(response),
    [setInboxUnread],
  );

  const groups = useMemo(
    () => groupInboxItems(items, inboxDisplay.grouping, (item) => readOnFirstSeen.get(item.id) ?? item.is_read),
    [inboxDisplay.grouping, items, readOnFirstSeen],
  );
  // The order J/K and "open the next one" follow: groups top to bottom, collapsed ones skipped.
  const visibleItems = useMemo(
    () => (groups ? groups.flatMap((group) => (collapsedGroups.has(group.id) ? [] : group.items)) : items),
    [collapsedGroups, groups, items],
  );
  const visibleRef = useRef(visibleItems);
  useLayoutEffect(() => {
    visibleRef.current = visibleItems;
  });
  const toggleGroup = useCallback((id: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const reportError = useCallback((error: unknown) => setActionError(requestErrorMessage(error)), []);

  const openItem = useCallback((item: InboxItem | null) => {
    setActionMessage('');
    setActionError('');
    onNavigate(tabRef.current, item ? item.id : null);
  }, [onNavigate]);

  /** After a notification leaves the list, Linear opens the next one. */
  const removeItem = useCallback((item: InboxItem) => {
    const visible = visibleRef.current;
    const index = visible.findIndex((entry) => entry.id === item.id);
    const remaining = visible.filter((entry) => entry.id !== item.id);
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    if (item.id === selectedId) {
      openItem(remaining[Math.min(index, remaining.length - 1)] ?? null);
    }
  }, [openItem, selectedId]);

  const setRead = useCallback((item: InboxItem, read: boolean) => {
    if (item.is_read === read) return;
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, is_read: read } : entry)));
    markInboxRead(item.id, read).then(applyResponse).catch(reportError);
  }, [applyResponse, reportError]);

  const toggleRead = useCallback((item: InboxItem) => setRead(item, !item.is_read), [setRead]);

  const deleteItem = useCallback((item: InboxItem) => {
    removeItem(item);
    deleteInboxNotification(item.id).then(applyResponse).catch(reportError);
  }, [applyResponse, removeItem, reportError]);

  const snoozeItem = useCallback((item: InboxItem, until: Date) => {
    if (inboxDisplay.showSnoozed) {
      setItems((current) => current.map((entry) => (
        entry.id === item.id ? { ...entry, snoozed_until: until.toISOString(), unsnoozed_at: null } : entry
      )));
    } else {
      removeItem(item);
    }
    snoozeInboxNotification(item.id, until).then(applyResponse).catch(reportError);
  }, [applyResponse, inboxDisplay.showSnoozed, removeItem, reportError]);

  // Linear's Unsnooze leaves the notification where it is, read or unread as it was.
  const unsnoozeItem = useCallback((item: InboxItem) => {
    setItems((current) => current.map((entry) => (
      entry.id === item.id ? { ...entry, snoozed_until: null } : entry
    )));
    snoozeInboxNotification(item.id, null).then(applyResponse).catch(reportError);
  }, [applyResponse, reportError]);

  const closeSnoozePalette = useCallback((open: boolean) => {
    if (!open) setSnoozePalette(null);
  }, []);

  const snoozeSelected = useCallback((until: Date) => {
    if (selectedItem) snoozeItem(selectedItem, until);
  }, [selectedItem, snoozeItem]);

  const customSnoozeSelected = useCallback(() => setCustomSnoozeItem(selectedItem), [selectedItem]);

  const unsnoozeSelected = useCallback(() => {
    if (selectedItem) unsnoozeItem(selectedItem);
  }, [selectedItem, unsnoozeItem]);

  const deleteAll = useCallback(async (onlyRead: boolean) => {
    try {
      applyResponse(await deleteAllInbox(onlyRead));
      openItem(null);
      setReloadToken((current) => current + 1);
    } catch (error) {
      reportError(error);
    }
  }, [applyResponse, openItem, reportError]);

  // Linear's command menu opens with "Notifications" in Inbox.
  usePageCommands({
    heading: 'Notifications',
    commands: [
      { id: 'delete-all-notifications', label: 'Delete all notifications', icon: <BuyerlyInboxDeleteIcon size={16} />, run: () => void deleteAll(false) },
      { id: 'delete-read-notifications', label: 'Delete all read notifications', icon: <BuyerlyInboxDeleteIcon size={16} />, shortcut: 'Shift ⌫', run: () => void deleteAll(true) },
    ],
  });

  // Opening a notification reads it, as in Linear. Only on opening: U on the
  // open one must leave it unread.
  const autoReadIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!selectedItem) {
      if (selectedId === null) autoReadIdRef.current = null;
      return;
    }
    if (autoReadIdRef.current === selectedItem.id) return;
    autoReadIdRef.current = selectedItem.id;
    if (!selectedItem.is_read) setRead(selectedItem, true);
  }, [selectedId, selectedItem, setRead]);

  useEffect(() => {
    if (selectedId === null) return;
    listRef.current
      ?.querySelector(`[data-inbox-event-id="${selectedId}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  useEffect(() => {
    // The letter after G goes somewhere (G K: Ad accounts), as in Linear; it never moves in the list.
    let goToPressedAt = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      // A menu still fading out after closing no longer holds the keyboard.
      if (document.querySelector(OPEN_LAYER_SELECTOR)) return;
      if (event.key === 'g' || event.key === 'G') {
        goToPressedAt = Date.now();
        return;
      }
      if (Date.now() - goToPressedAt < GO_TO_PREFIX_WINDOW_MS) {
        goToPressedAt = 0;
        return;
      }
      const current = visibleRef.current;
      const index = current.findIndex((item) => item.id === selectedId);
      const selected = index >= 0 ? current[index] : null;
      const key = event.key;
      if (key === 'ArrowDown' || key === 'j' || key === 'J') {
        const next = current[index + 1] ?? (index < 0 ? current[0] : null);
        if (next) {
          event.preventDefault();
          openItem(next);
        }
      } else if (key === 'ArrowUp' || key === 'k' || key === 'K') {
        const previous = index > 0 ? current[index - 1] : index < 0 ? current[0] : null;
        if (previous) {
          event.preventDefault();
          openItem(previous);
        }
      } else if (key === 'Escape' && selected) {
        event.preventDefault();
        openItem(null);
      } else if ((key === 'Backspace' || key === 'Delete') && event.shiftKey) {
        event.preventDefault();
        void deleteAll(true);
      } else if ((key === 'Backspace' || key === 'Delete') && selected) {
        event.preventDefault();
        deleteItem(selected);
      } else if ((key === 'u' || key === 'U') && selected) {
        event.preventDefault();
        toggleRead(selected);
      } else if ((key === 'h' || key === 'H') && selected) {
        event.preventDefault();
        setSnoozePalette('key');
      } else if ((key === 'f' || key === 'F') && !event.shiftKey && filterButtonRef.current) {
        event.preventDefault();
        openFilterMenu('root', filterButtonRef.current);
      } else if ((key === 'v' || key === 'V') && event.shiftKey) {
        // Shift V opens Display options on every list, as in Linear (checked live 17.10).
        event.preventDefault();
        setFilterMenu(null);
        setIsDisplayOpen(true);
      }
    };
    // Capture phase: a Radix menu fading out after a choice still listens for Escape
    // and would swallow it; open menus are skipped above, so they keep their keys.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [deleteAll, deleteItem, openFilterMenu, openItem, selectedId, toggleRead]);

  const handleUndo = async () => {
    if (!selectedItem?.can_undo || actionState === 'loading') return;
    setActionState('loading');
    setActionMessage('');
    setActionError('');
    try {
      const result = await undoAuditEvent(selectedItem.id);
      setActionMessage(result.message);
      void load(true);
    } catch (error) {
      reportError(error);
    }
    setActionState('idle');
  };

  const renderList = () => {
    if (loadState === 'loading') {
      return <div {...stylex.props(styles.fill)} aria-busy="true" aria-label="Loading notifications" />;
    }
    if (loadState === 'error') {
      return (
        <DataState
          role="alert"
          title="Couldn't load Inbox"
          detail={loadError}
          actionLabel="Try again"
          onAction={() => setReloadToken((current) => current + 1)}
        />
      );
    }
    if (items.length === 0) {
      if (filters.length) {
        return (
          <div {...stylex.props(styles.fill)}>
            <InboxFilterFooter hiddenCount={hiddenByFilters} onClear={() => applyFilters([])} />
          </div>
        );
      }
      if (inboxDisplay.unreadOnly) {
        return (
          <div {...stylex.props(styles.empty, styles.emptyStack)}>
            <p {...stylex.props(styles.emptyText)}>No unreads</p>
            <button
              type="button"
              onClick={() => setInboxDisplay({ unreadOnly: false })}
              {...stylex.props(styles.showAll)}
            >
              Show all notifications
            </button>
          </div>
        );
      }
      return (
        <div {...stylex.props(styles.empty)}>
          <p {...stylex.props(styles.emptyText)}>No notifications</p>
        </div>
      );
    }
    return (
      <div
        ref={listRef}
        role="listbox"
        aria-label="Notifications"
        {...stylex.props(styles.list)}
        onScroll={(event) => {
          const element = event.currentTarget;
          if (element.scrollHeight - element.scrollTop - element.clientHeight < 200) void loadMore();
        }}
      >
        {(groups ?? [{ id: '', label: '', items }]).map((group) => {
          const collapsed = collapsedGroups.has(group.id);
          return (
            <React.Fragment key={group.id}>
              {groups && (
                <InboxGroupHeader
                  label={group.label}
                  expanded={!collapsed}
                  onToggle={() => toggleGroup(group.id)}
                />
              )}
              {!collapsed && group.items.map((item) => (
                <InboxItemRow
                  key={item.id}
                  item={item}
                  isSelected={item.id === selectedId}
                  onSelect={() => openItem(item)}
                  onToggleRead={toggleRead}
                  onDelete={deleteItem}
                  onSnooze={snoozeItem}
                  onCustomSnooze={setCustomSnoozeItem}
                  onUnsnooze={unsnoozeItem}
                />
              ))}
            </React.Fragment>
          );
        })}
        {filters.length > 0 && (
          <InboxFilterFooter hiddenCount={hiddenByFilters} onClear={() => applyFilters([])} />
        )}
      </div>
    );
  };

  const unreadLabel = inboxUnreadCount === 1 ? '1 unread notification' : `${inboxUnreadCount} unread notifications`;

  return (
    <div ref={splitContainerRef} {...stylex.props(styles.root)}>
      <section
        aria-label="Inbox"
        {...withClassName(stylex.props(styles.inboxList, selectedItem && styles.hiddenUntilSplit), 'inbox-list')}
        style={{ '--inbox-list-width': `${splitWidth}px` } as React.CSSProperties}
      >
        <header {...stylex.props(styles.header)}>
          <SidebarCollapsedNavigation />
          <h1 {...stylex.props(styles.title)}>Inbox</h1>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <BuyerlyToolbarButton placement="header" aria-label="Notification actions">
                <BuyerlyDotsIcon size={14} />
              </BuyerlyToolbarButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent style={{ width: '184px' }}>
              <DropdownMenuItem onSelect={() => void deleteAll(false)}>
                <span {...stylex.props(styles.menuLabel)}>
                  <BuyerlyInboxDeleteIcon size={16} />
                  Delete all
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void deleteAll(true)}>
                <span {...stylex.props(styles.menuLabel)}>
                  <BuyerlyInboxDeleteIcon size={16} />
                  Delete all read
                </span>
                <MenuKey>⇧ ⌫</MenuKey>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {/* Linear's Inbox settings link opens the notification settings, not Preferences. */}
              <DropdownMenuItem
                onSelect={() => {
                  openSettings('notifications');
                }}
              >
                <span {...stylex.props(styles.menuLabel)}>
                  <BuyerlySlidersIcon size={16} />
                  Go to settings
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div {...stylex.props(styles.fill)} />
          <Tooltip content={inboxDisplay.unreadOnly ? 'Show all notifications' : 'Show unreads only'}>
            <BuyerlyToolbarButton
              placement="header"
              active={inboxDisplay.unreadOnly}
              aria-label="Show unreads only"
              aria-pressed={inboxDisplay.unreadOnly}
              onClick={() => setInboxDisplay({ unreadOnly: !inboxDisplay.unreadOnly })}
            >
              <BuyerlyInboxUnreadIcon size={16} />
            </BuyerlyToolbarButton>
          </Tooltip>
          <BuyerlyFilterButton
            placement="header"
            ref={filterButtonRef}
            hasFilters={filters.length > 0}
            open={Boolean(filterMenu)}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              if (filterMenu) setFilterMenu(null);
              else openFilterMenu('root', event.currentTarget);
            }}
          />
          <BuyerlyDisplayOptionsButton
            placement="header"
            ref={displayButtonRef}
            open={isDisplayOpen}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => setIsDisplayOpen((current) => !current)}
          />
          <InboxDisplayOptionsPopover
            isOpen={isDisplayOpen}
            onClose={() => setIsDisplayOpen(false)}
            anchorRef={displayButtonRef}
          />
        </header>

        {activeTab && (
          <nav aria-label="Priority inbox" className="buyerly-inbox-tabs">
            {(['priority', 'other'] as const).map((tab) => {
              const count = tab === 'priority' ? inboxPriorityUnreadCount : inboxUnreadCount - inboxPriorityUnreadCount;
              return (
                <a
                  key={tab}
                  href={`${pathname.split('/inbox')[0]}/inbox/${tab}`}
                  aria-current={activeTab === tab ? 'page' : undefined}
                  className="buyerly-inbox-tab"
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate(tab, null);
                  }}
                >
                  {tab === 'priority' ? 'Priority' : 'Other'}
                  {count > 0 && <span className="buyerly-inbox-tab-count">{count}</span>}
                </a>
              );
            })}
          </nav>
        )}

        <InboxFilterBar
          fields={filterFields}
          clauses={filterClauses}
          onChange={(next) => applyFilters(fromMenuClauses(next))}
          onOpenMenu={openFilterMenu}
        />
        <BuyerlyFilterMenu
          isOpen={Boolean(filterMenu)}
          mode={filterMenu?.mode ?? 'root'}
          anchorElement={filterMenu?.anchor ?? null}
          fieldId={filterMenu?.fieldId}
          fields={filterFields}
          clauses={filterClauses}
          onChange={(next) => applyFilters(fromMenuClauses(next))}
          onClose={() => setFilterMenu(null)}
          countNoun={['notification', 'notifications']}
          childWidth={311}
          rootPlaceholder={filterMenu?.fromFilterButton ? 'Add Filter…' : 'Filter notifications by…'}
        />

        {renderList()}
      </section>

      {splitShown && (
        <BuyerlySplitResizer
          width={splitWidth}
          minWidth={splitMinWidth}
          maxWidth={splitMaxWidth}
          onResize={setSplitWidth}
          onResizeEnd={saveSplitWidth}
        />
      )}

      <section
        aria-label="Notification"
        {...stylex.props(styles.notification, !selectedItem && styles.hiddenUntilSplit)}
      >
        {selectedItem ? (
          <>
            <header {...stylex.props(styles.header, styles.notificationHeader)}>
              <div {...stylex.props(styles.notificationTitle)}>
                <button
                  type="button"
                  onClick={() => openItem(null)}
                  {...withClassName(stylex.props(styles.back), 'buyerly-icon-btn buyerly-header-target')}
                  aria-label="Back to Inbox"
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                </button>
                <span {...stylex.props(styles.notificationName)}>
                  {auditEventTitle(selectedItem)} · {auditEventTarget(selectedItem)}
                </span>
              </div>
              <div {...stylex.props(styles.notificationActions)}>
                <Tooltip content="Snooze notification" shortcut="H" disabled={snoozePalette !== null}>
                  <BuyerlyToolbarButton
                    placement="header"
                    active={snoozePalette !== null}
                    aria-label="Snooze notification"
                    onClick={() => setSnoozePalette('button')}
                  >
                    <BuyerlyClockOutlineIcon size={16} />
                  </BuyerlyToolbarButton>
                </Tooltip>
                <SnoozePalette
                  open={snoozePalette !== null}
                  onOpenChange={closeSnoozePalette}
                  notificationLabel={`${auditEventTitle(selectedItem)}: ${auditEventTarget(selectedItem)}`}
                  placeholder={snoozePalette === 'button' ? SNOOZE_SEARCH_HINT : 'Snooze notification until…'}
                  snoozedUntil={selectedItem.snoozed_until}
                  onSnooze={snoozeSelected}
                  onCustom={customSnoozeSelected}
                  onUnsnooze={unsnoozeSelected}
                />
                <Tooltip content="Delete notification" shortcut="⌫">
                  <BuyerlyToolbarButton
                    placement="header"
                    aria-label="Delete notification"
                    onClick={() => deleteItem(selectedItem)}
                  >
                    <BuyerlyInboxDeleteIcon size={16} />
                  </BuyerlyToolbarButton>
                </Tooltip>
              </div>
            </header>

            <div {...stylex.props(styles.scroll)}>
              <article {...stylex.props(styles.article)}>
                <div {...stylex.props(styles.lead)}>
                  <BuyerlyLogoAvatar size={40} />
                  <div {...stylex.props(styles.leadText)}>
                    <h2 {...stylex.props(styles.heading)}>
                      {auditEventTitle(selectedItem)}
                    </h2>
                    <p {...stylex.props(styles.timestamp)}>
                      {formatAuditTimestamp(selectedItem.created_at)}
                      {selectedItem.snoozed_until && ` · Snoozed until ${formatSnoozeTime(new Date(selectedItem.snoozed_until))}`}
                    </p>
                  </div>
                </div>

                <p {...stylex.props(styles.message)}>
                  {selectedItem.message || 'No additional message was recorded for this event.'}
                </p>

                <dl {...stylex.props(styles.metadata)}>
                  <MetadataRow
                    label="Target"
                    value={selectedPaths.entity
                      ? <RecordLink path={selectedPaths.entity} label={auditEventTarget(selectedItem)} onOpen={onOpenRecord} />
                      : auditEventTarget(selectedItem)}
                  />
                  {selectedItem.entity_level && <MetadataRow label="Entity level" value={humanizeAuditValue(selectedItem.entity_level)} />}
                  {selectedPaths.campaign && (
                    <MetadataRow
                      label="Campaign"
                      value={(
                        <RecordLink
                          path={selectedPaths.campaign}
                          label={selectedItem.entity_level === 'campaign' ? auditEventTarget(selectedItem) : 'Open campaign'}
                          onOpen={onOpenRecord}
                        />
                      )}
                    />
                  )}
                  {selectedItem.account_name && <MetadataRow label="Ad account" value={selectedItem.account_name} />}
                  {(selectedItem.rule_name || selectedPaths.rule) && (
                    <MetadataRow
                      label="Rule"
                      value={selectedPaths.rule
                        ? <RecordLink path={selectedPaths.rule} label={selectedItem.rule_name || `Rule ${selectedItem.rule_id}`} onOpen={onOpenRecord} />
                        : selectedItem.rule_name}
                    />
                  )}
                  <MetadataRow label="Status" value={humanizeAuditValue(selectedItem.display_status)} />
                  <MetadataRow label="Category" value={humanizeAuditValue(selectedItem.category)} />
                  <MetadataRow label="Event type" value={humanizeAuditValue(selectedItem.event_type)} />
                  {selectedItem.duration_ms !== null && <MetadataRow label="Duration" value={`${selectedItem.duration_ms} ms`} />}
                </dl>

                {(selectedItem.can_undo || selectedItem.is_reverted) && (
                  <section {...stylex.props(styles.undo)} aria-labelledby="inbox-undo-heading">
                    <h3 id="inbox-undo-heading" {...stylex.props(styles.undoTitle)}>Undo</h3>
                    <p {...stylex.props(styles.undoHint)}>
                      {selectedItem.is_reverted
                        ? 'This action has already been undone.'
                        : auditUndoHint(selectedItem)}
                    </p>
                    {selectedItem.can_undo && (
                      <Button
                        variant="primary"
                        xstyle={styles.undoButton}
                        onClick={handleUndo}
                        disabled={actionState === 'loading'}
                      >
                        {actionState === 'loading' ? 'Undoing…' : 'Undo action'}
                      </Button>
                    )}
                  </section>
                )}

                {actionMessage && <p {...stylex.props(styles.outcome)} role="status">{actionMessage}</p>}
                {actionError && <p {...stylex.props(styles.outcome, styles.outcomeError)} role="alert">{actionError}</p>}
              </article>
            </div>
          </>
        ) : (
          <div {...stylex.props(styles.nothingSelected)}>
            <BuyerlyEmptyInboxIllustration />
            <p {...stylex.props(styles.emptyText)}>
              {inboxUnreadCount > 0 ? unreadLabel : 'No notification selected'}
            </p>
            {actionError && <p {...stylex.props(styles.nothingSelectedError)} role="alert">{actionError}</p>}
          </div>
        )}
      </section>
      <SnoozeCalendarDialog
        open={customSnoozeItem !== null}
        onOpenChange={(open) => { if (!open) setCustomSnoozeItem(null); }}
        onApply={(until) => {
          if (customSnoozeItem) snoozeItem(customSnoozeItem, until);
          setCustomSnoozeItem(null);
        }}
      />
    </div>
  );
};

/** Draws the pool's models as they change (#488). */
export const InboxView = observer(InboxViewContent);
