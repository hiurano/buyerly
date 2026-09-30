import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ApiError } from '@/lib/api';
import {
  auditEventTarget,
  auditEventTitle,
  auditUndoHint,
  formatAuditTimestamp,
  auditEventTypeTitle,
  humanizeAuditValue,
  KNOWN_AUDIT_EVENT_TYPES,
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
  markInboxRead,
  snoozeInboxNotification,
  snoozeOptions,
  type InboxActionResponse,
  type InboxFacets,
  type InboxFacetValue,
  type InboxFilterClause,
  type InboxItem,
} from '@/lib/inbox';
import { LinearFilterButton, LinearFilterMenu, type FilterMenuMode } from '@/components/filters/LinearFilter';
import type { FilterClause, FilterFieldDefinition } from '@/components/filters/filterModel';
import { InboxFilterBar, InboxFilterFooter } from './InboxFilterBar';
import { InboxItemRow } from './InboxItemRow';
import { InboxDisplayOptionsPopover } from './InboxDisplayOptionsPopover';
import {
  BuyerlyLogoAvatar,
  LinearClockOutlineIcon,
  LinearDotsIcon,
  LinearEmptyInboxIllustration,
  LinearInboxDeleteIcon,
  LinearInboxUnreadIcon,
  LinearSidebarLeftToggleIcon,
  LinearSlidersIcon,
} from '@/icons/LinearIcons';
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
import { useAppStore } from '@/store/useAppStore';

type LoadState = 'loading' | 'ready' | 'error';
type ActionState = 'idle' | 'loading';

interface InboxViewProps {
  /** The notification open on the right, from the /<workspace>/inbox/<id> address. */
  openEventId?: string;
  onOpenEvent: (eventId: number | null) => void;
}

function requestErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

function MetadataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-[var(--color-border-primary)] py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[13px] text-[var(--text-muted)]">{label}</dt>
      <dd className="min-w-0 break-words text-[14px] text-[var(--text-secondary)]">{value}</dd>
    </div>
  );
}

const MenuKey: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="font-sans text-[12px] font-[500] text-[var(--text-muted)]">{children}</kbd>
);

/**
 * Linear's Inbox filter properties and their Buyerly counterparts: Project is
 * the ad account, Issue status type the event status. Issue priority has no
 * counterpart in ad events.
 */
const FILTER_FIELDS: Array<{
  id: string;
  field: InboxFilterClause['field'];
  label: string;
  pluralLabel: string;
  optionLabel: (value: InboxFacetValue) => string;
}> = [
  {
    id: 'notificationType',
    field: 'type',
    label: 'Notification type',
    pluralLabel: 'types',
    optionLabel: (value) => auditEventTypeTitle(value.value),
  },
  { id: 'from', field: 'from', label: 'From', pluralLabel: 'senders', optionLabel: (value) => value.label || value.value },
  {
    id: 'adAccount',
    field: 'account',
    label: 'Ad account',
    pluralLabel: 'ad accounts',
    optionLabel: (value) => (value.value ? value.label || value.value : 'No ad account'),
  },
  {
    id: 'eventStatus',
    field: 'status',
    label: 'Status',
    pluralLabel: 'statuses',
    optionLabel: (value) => humanizeAuditValue(value.value),
  },
];

const toMenuClause = (clause: InboxFilterClause): FilterClause => ({
  fieldId: FILTER_FIELDS.find((entry) => entry.field === clause.field)?.id ?? clause.field,
  operator: clause.operator,
  values: clause.values,
});

const fromMenuClauses = (clauses: FilterClause[]): InboxFilterClause[] =>
  clauses.flatMap((clause) => {
    const entry = FILTER_FIELDS.find((candidate) => candidate.id === clause.fieldId);
    if (!entry || (clause.operator !== 'is' && clause.operator !== 'is_not')) return [];
    return [{ field: entry.field, operator: clause.operator, values: clause.values.map(String) }];
  });

function inboxFilterFields(
  facets: InboxFacets | null,
  filters: InboxFilterClause[],
): FilterFieldDefinition<unknown>[] {
  return FILTER_FIELDS.map((entry) => {
    const present = facets?.[entry.field] ?? [];
    // A chosen value stays in the menu even when nothing matches it any more.
    const chosen = filters.find((clause) => clause.field === entry.field)?.values ?? [];
    const values = [
      ...present,
      ...chosen.filter((value) => !present.some((facet) => facet.value === value)).map((value) => ({ value, count: 0 })),
    ];
    return {
      id: entry.id,
      label: entry.label,
      section: 'inbox',
      type: 'enum',
      operators: ['is', 'is_not'],
      defaultOperator: 'is',
      getValue: () => null,
      pluralLabel: entry.pluralLabel,
      options: values.map((value) => ({ value: value.value, label: entry.optionLabel(value), count: value.count })),
      unmatchedCount: entry.field === 'type' && facets
        ? KNOWN_AUDIT_EVENT_TYPES.filter((type) => !values.some((value) => value.value === type)).length
        : undefined,
    };
  });
}

const headerButtonClass = (active = false) =>
  `flex h-7 w-7 shrink-0 items-center justify-center rounded-full outline-none transition-[border-color,background-color,color,opacity,fill,stroke] duration-150 ease-[ease] ${
    active
      ? 'bg-[var(--item-active-bg)] text-[var(--text-primary)]'
      : 'text-[var(--text-tertiary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]'
  }`;

export const InboxView: React.FC<InboxViewProps> = ({ openEventId, onOpenEvent }) => {
  const {
    isSidebarCollapsed,
    toggleSidebarCollapsed,
    setActiveTab,
    inboxUnreadCount,
    setInboxUnreadCount,
    inboxDisplay,
    setInboxDisplay,
  } = useAppStore();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [items, setItems] = useState<InboxItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [isDisplayOpen, setIsDisplayOpen] = useState(false);
  const [isSnoozeOpen, setIsSnoozeOpen] = useState(false);
  const [actionState, setActionState] = useState<ActionState>('idle');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const requestGenerationRef = useRef(0);
  const itemsRef = useRef<InboxItem[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const displayButtonRef = useRef<HTMLButtonElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  itemsRef.current = items;
  // Filters live in the address, as in Linear, so a filtered Inbox survives reloads and links.
  const [filters, setFilters] = useState<InboxFilterClause[]>(
    () => decodeInboxFilter(new URLSearchParams(window.location.search).get('filter')),
  );
  const [hiddenByFilters, setHiddenByFilters] = useState(0);
  const [facets, setFacets] = useState<InboxFacets | null>(null);
  const [filterMenu, setFilterMenu] = useState<{ mode: FilterMenuMode; anchor: HTMLElement; fieldId?: string } | null>(null);

  const selectedId = openEventId && /^\d+$/.test(openEventId) ? Number(openEventId) : null;
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const load = useCallback(async (quiet: boolean) => {
    const generation = ++requestGenerationRef.current;
    if (!quiet) setLoadState('loading');
    try {
      const response = await fetchInbox({
        offset: 0,
        // A background refresh keeps everything already scrolled into view.
        limit: Math.min(100, Math.max(INBOX_PAGE_SIZE, itemsRef.current.length)),
        ...inboxDisplay,
        filters,
      });
      if (generation !== requestGenerationRef.current) return;
      setItems(response.items);
      setHasMore(response.has_more);
      setHiddenByFilters(response.hidden_by_filters ?? 0);
      setInboxUnreadCount(response.unread_count);
      setLoadError('');
      setLoadState('ready');
    } catch (error) {
      if (generation !== requestGenerationRef.current || quiet) return;
      setLoadError(requestErrorMessage(error));
      setLoadState('error');
    }
  }, [filters, inboxDisplay, setInboxUnreadCount]);

  useEffect(() => {
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
      const response = await fetchInbox({ offset: itemsRef.current.length, ...inboxDisplay, filters });
      if (generation !== requestGenerationRef.current) return;
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...response.items.filter((item) => !known.has(item.id))];
      });
      setHasMore(response.has_more);
      setInboxUnreadCount(response.unread_count);
    } catch {
      // Scrolling again retries.
    } finally {
      setIsLoadingMore(false);
    }
  }, [filters, hasMore, inboxDisplay, isLoadingMore, loadState, setInboxUnreadCount]);

  const applyFilters = useCallback((next: InboxFilterClause[]) => {
    setFilters(next);
    const params = new URLSearchParams(window.location.search);
    if (next.length) params.set('filter', encodeInboxFilter(next));
    else params.delete('filter');
    const search = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${search ? `?${search}` : ''}`);
  }, []);

  const openFilterMenu = useCallback((mode: FilterMenuMode, anchor: HTMLElement, fieldId?: string) => {
    setIsDisplayOpen(false);
    setFilterMenu({ mode, anchor, fieldId });
    // Counts are read fresh each time, like Linear's "2 notifications" next to each value.
    fetchInboxFacets(inboxDisplay.unreadOnly, inboxDisplay.showSnoozed).then(setFacets).catch(() => {});
  }, [inboxDisplay.showSnoozed, inboxDisplay.unreadOnly]);

  const filterFields = useMemo(
    () => inboxFilterFields(facets, filters),
    [facets, filters],
  );
  const filterClauses = useMemo(() => filters.map(toMenuClause), [filters]);

  const applyResponse = useCallback(
    (response: InboxActionResponse) => setInboxUnreadCount(response.unread_count),
    [setInboxUnreadCount],
  );
  const reportError = useCallback((error: unknown) => setActionError(requestErrorMessage(error)), []);

  const openItem = useCallback((item: InboxItem | null) => {
    setActionMessage('');
    setActionError('');
    onOpenEvent(item ? item.id : null);
  }, [onOpenEvent]);

  /** After a notification leaves the list, Linear opens the next one. */
  const removeItem = useCallback((item: InboxItem) => {
    const current = itemsRef.current;
    const index = current.findIndex((entry) => entry.id === item.id);
    const remaining = current.filter((entry) => entry.id !== item.id);
    setItems(remaining);
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
        entry.id === item.id ? { ...entry, is_read: false, snoozed_until: until.toISOString() } : entry
      )));
    } else {
      removeItem(item);
    }
    snoozeInboxNotification(item.id, until).then(applyResponse).catch(reportError);
  }, [applyResponse, inboxDisplay.showSnoozed, removeItem, reportError]);

  const deleteAll = useCallback(async (onlyRead: boolean) => {
    try {
      applyResponse(await deleteAllInbox(onlyRead));
      openItem(null);
      setReloadToken((current) => current + 1);
    } catch (error) {
      reportError(error);
    }
  }, [applyResponse, openItem, reportError]);

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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector('[role="menu"], [role="dialog"], .linear-display-select-menu')) return;
      const current = itemsRef.current;
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
        setIsSnoozeOpen(true);
      } else if ((key === 'f' || key === 'F') && !event.shiftKey && filterButtonRef.current) {
        event.preventDefault();
        openFilterMenu('root', filterButtonRef.current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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
    } finally {
      setActionState('idle');
    }
  };

  const renderList = () => {
    if (loadState === 'loading') {
      return <div className="flex-1" aria-busy="true" aria-label="Loading notifications" />;
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
          <div className="flex-1">
            <InboxFilterFooter hiddenCount={hiddenByFilters} onClear={() => applyFilters([])} />
          </div>
        );
      }
      if (inboxDisplay.unreadOnly) {
        return (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
            <p className="text-[13px] font-medium text-[var(--text-tertiary)]">No unreads</p>
            <button
              type="button"
              onClick={() => setInboxDisplay({ unreadOnly: false })}
              className="text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Show all notifications
            </button>
          </div>
        );
      }
      return (
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="text-[13px] font-medium text-[var(--text-tertiary)]">No notifications</p>
        </div>
      );
    }
    return (
      <div
        ref={listRef}
        role="listbox"
        aria-label="Notifications"
        className="min-h-0 flex-1 overflow-y-auto py-2"
        onScroll={(event) => {
          const element = event.currentTarget;
          if (element.scrollHeight - element.scrollTop - element.clientHeight < 200) void loadMore();
        }}
      >
        {items.map((item) => (
          <InboxItemRow
            key={item.id}
            item={item}
            isSelected={item.id === selectedId}
            onSelect={() => openItem(item)}
            onToggleRead={toggleRead}
            onDelete={deleteItem}
            onSnooze={snoozeItem}
          />
        ))}
        {filters.length > 0 && (
          <InboxFilterFooter hiddenCount={hiddenByFilters} onClear={() => applyFilters([])} />
        )}
      </div>
    );
  };

  const unreadLabel = inboxUnreadCount === 1 ? '1 unread notification' : `${inboxUnreadCount} unread notifications`;

  return (
    <div className="flex h-full min-w-0 overflow-hidden bg-transparent">
      <section
        aria-label="Inbox"
        className={`${selectedItem ? 'hidden md:flex' : 'flex'} h-full min-w-0 w-full flex-col border-[var(--color-border-primary)] md:w-[34%] md:min-w-[240px] md:max-w-[400px] md:shrink-0 md:border-r`}
      >
        <header className="flex h-[44px] shrink-0 items-center gap-1 border-b border-[var(--color-border-primary)] px-2.5">
          {isSidebarCollapsed && (
            <Tooltip content="Open sidebar" shortcut="[" side="bottom" sideOffset={6}>
              <button
                type="button"
                onClick={toggleSidebarCollapsed}
                className="linear-icon-btn"
                aria-label="Open sidebar"
              >
                <LinearSidebarLeftToggleIcon size={14} isOpen={false} aria-hidden="true" />
              </button>
            </Tooltip>
          )}
          <h1 className="pl-2 pr-1 text-[13px] font-medium leading-4 text-[var(--text-secondary)]">Inbox</h1>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Notification actions" className={headerButtonClass()}>
                <LinearDotsIcon size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent style={{ width: '184px' }}>
              <DropdownMenuItem onSelect={() => void deleteAll(false)}>
                <span className="flex items-center gap-2.5">
                  <LinearInboxDeleteIcon size={16} />
                  Delete all
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void deleteAll(true)}>
                <span className="flex items-center gap-2.5">
                  <LinearInboxDeleteIcon size={16} />
                  Delete all read
                </span>
                <MenuKey>⇧ ⌫</MenuKey>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setActiveTab('preferences')}>
                <span className="flex items-center gap-2.5">
                  <LinearSlidersIcon size={16} />
                  Go to settings
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex-1" />
          <Tooltip content={inboxDisplay.unreadOnly ? 'Show all notifications' : 'Show unreads only'}>
            <button
              type="button"
              aria-label="Show unreads only"
              aria-pressed={inboxDisplay.unreadOnly}
              onClick={() => setInboxDisplay({ unreadOnly: !inboxDisplay.unreadOnly })}
              className={headerButtonClass(inboxDisplay.unreadOnly)}
            >
              <LinearInboxUnreadIcon size={16} />
            </button>
          </Tooltip>
          <Tooltip content="Filter" shortcut="F">
            <LinearFilterButton
              ref={filterButtonRef}
              active={filters.length > 0}
              open={Boolean(filterMenu)}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                if (filterMenu) setFilterMenu(null);
                else openFilterMenu('root', event.currentTarget);
              }}
            />
          </Tooltip>
          <Tooltip content="Display options" shortcut="V">
            <button
              ref={displayButtonRef}
              type="button"
              aria-label="Display options"
              aria-expanded={isDisplayOpen}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => setIsDisplayOpen((current) => !current)}
              className={headerButtonClass(isDisplayOpen)}
            >
              <LinearSlidersIcon size={14} />
            </button>
          </Tooltip>
          <InboxDisplayOptionsPopover
            isOpen={isDisplayOpen}
            onClose={() => setIsDisplayOpen(false)}
            anchorRef={displayButtonRef}
          />
        </header>

        <InboxFilterBar
          fields={filterFields}
          clauses={filterClauses}
          onChange={(next) => applyFilters(fromMenuClauses(next))}
          onOpenMenu={openFilterMenu}
        />
        <LinearFilterMenu
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
          rootPlaceholder={filterMenu?.anchor === filterButtonRef.current ? 'Add Filter…' : 'Filter notifications by…'}
        />

        {renderList()}
      </section>

      <section
        aria-label="Notification"
        className={`${selectedItem ? 'flex' : 'hidden md:flex'} h-full min-w-0 flex-1 flex-col overflow-hidden`}
      >
        {selectedItem ? (
          <>
            <header className="flex h-[44px] shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border-primary)] px-2.5 sm:px-4">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => openItem(null)}
                  className="linear-icon-btn md:hidden"
                  aria-label="Back to Inbox"
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                </button>
                <span className="truncate text-[13px] font-medium text-[var(--text-secondary)]">
                  {auditEventTitle(selectedItem)} · {auditEventTarget(selectedItem)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <DropdownMenu open={isSnoozeOpen} onOpenChange={setIsSnoozeOpen}>
                  <Tooltip content="Snooze notification" shortcut="H">
                    <DropdownMenuTrigger asChild>
                      <button type="button" aria-label="Snooze notification" className={headerButtonClass(isSnoozeOpen)}>
                        <LinearClockOutlineIcon size={16} />
                      </button>
                    </DropdownMenuTrigger>
                  </Tooltip>
                  <DropdownMenuContent
                    align="end"
                    style={{ width: '320px' }}
                    // Focus back on the button would pop its tooltip and eat the next Escape.
                    onCloseAutoFocus={(event) => event.preventDefault()}
                  >
                    {snoozeOptions().map((option) => (
                      <DropdownMenuItem key={option.id} onSelect={() => snoozeItem(selectedItem, option.until)}>
                        <span className="flex items-center gap-2.5">
                          <LinearClockOutlineIcon size={16} />
                          {option.label}
                        </span>
                        <span className="text-[12px] text-[var(--text-tertiary)]">{formatSnoozeTime(option.until)}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Tooltip content="Delete notification" shortcut="⌫">
                  <button
                    type="button"
                    aria-label="Delete notification"
                    onClick={() => deleteItem(selectedItem)}
                    className={headerButtonClass()}
                  >
                    <LinearInboxDeleteIcon size={16} />
                  </button>
                </Tooltip>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
              <article className="mx-auto max-w-[720px]">
                <div className="flex items-start gap-3.5">
                  <BuyerlyLogoAvatar size={40} shape="rounded" />
                  <div className="min-w-0">
                    <h2 className="break-words text-[22px] font-medium leading-7 tracking-[-0.015em] text-[var(--text-primary)]">
                      {auditEventTitle(selectedItem)}
                    </h2>
                    <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">
                      {formatAuditTimestamp(selectedItem.created_at)}
                      {selectedItem.snoozed_until && ` · Snoozed until ${formatSnoozeTime(new Date(selectedItem.snoozed_until))}`}
                    </p>
                  </div>
                </div>

                <p className="mt-6 text-[14px] leading-relaxed text-[var(--text-secondary)]">
                  {selectedItem.message || 'No additional message was recorded for this event.'}
                </p>

                <dl className="mt-7 border-t border-[var(--color-border-primary)]">
                  <MetadataRow label="Target" value={auditEventTarget(selectedItem)} />
                  {selectedItem.entity_level && <MetadataRow label="Entity level" value={humanizeAuditValue(selectedItem.entity_level)} />}
                  {selectedItem.account_name && <MetadataRow label="Ad account" value={selectedItem.account_name} />}
                  {selectedItem.rule_name && <MetadataRow label="Rule" value={selectedItem.rule_name} />}
                  <MetadataRow label="Status" value={humanizeAuditValue(selectedItem.display_status)} />
                  <MetadataRow label="Category" value={humanizeAuditValue(selectedItem.category)} />
                  <MetadataRow label="Event type" value={humanizeAuditValue(selectedItem.event_type)} />
                  {selectedItem.duration_ms !== null && <MetadataRow label="Duration" value={`${selectedItem.duration_ms} ms`} />}
                </dl>

                {(selectedItem.can_undo || selectedItem.is_reverted) && (
                  <section className="mt-7 rounded-[var(--control-border-radius)] border border-[var(--color-border-primary)] bg-[var(--card-bg)] p-4" aria-labelledby="inbox-undo-heading">
                    <h3 id="inbox-undo-heading" className="text-[14px] font-medium text-[var(--text-primary)]">Undo</h3>
                    <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-tertiary)]">
                      {selectedItem.is_reverted
                        ? 'This action has already been undone.'
                        : auditUndoHint(selectedItem)}
                    </p>
                    {selectedItem.can_undo && (
                      <Button
                        variant="primary"
                        className="mt-4 text-[14px]"
                        onClick={handleUndo}
                        disabled={actionState === 'loading'}
                      >
                        {actionState === 'loading' ? 'Undoing…' : 'Undo action'}
                      </Button>
                    )}
                  </section>
                )}

                {actionMessage && <p className="mt-4 text-[14px] text-[var(--text-secondary)]" role="status">{actionMessage}</p>}
                {actionError && <p className="mt-4 text-[14px] text-[var(--text-primary)]" role="alert">{actionError}</p>}
              </article>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
            <LinearEmptyInboxIllustration />
            <p className="text-[13px] font-medium text-[var(--text-tertiary)]">
              {inboxUnreadCount > 0 ? unreadLabel : 'No notification selected'}
            </p>
            {actionError && <p className="text-[13px] text-[var(--text-primary)]" role="alert">{actionError}</p>}
          </div>
        )}
      </section>
    </div>
  );
};
