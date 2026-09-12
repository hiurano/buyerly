import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { ApiError } from '@/lib/api';
import type { AuditEventItem, AuditEventListResponse, AuditInboxFilter } from '@/lib/audit';
import {
  auditEventTarget,
  auditEventTitle,
  fetchAuditEvents,
  formatAuditTimestamp,
  humanizeAuditValue,
  undoAuditEvent,
} from '@/lib/audit';
import { InboxItemRow } from './InboxItemRow';
import {
  BuyerlyLogoAvatar,
  LinearEmptyInboxIllustration,
  LinearSidebarLeftToggleIcon,
} from '@/icons/LinearIcons';
import { Button } from '@/ui/Button';
import { DataState } from '@/ui/DataState';
import { Input } from '@/ui/Input';
import { LinearDataListStack } from '@/ui/LinearDataList';
import { LinearLabelPill } from '@/ui/LinearLabelPill';
import { LinearTabs } from '@/ui/LinearTabs';
import { Tooltip } from '@/ui/Tooltip';
import { useAppStore } from '@/store/useAppStore';

type LoadState = 'loading' | 'ready' | 'error';
type ActionState = 'idle' | 'loading';

function requestErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

function MetadataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-[var(--color-border-primary)] py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[13px] text-[var(--text-muted)]">{label}</dt>
      <dd className="min-w-0 break-words text-[14px] text-[var(--text-secondary)]">{value}</dd>
    </div>
  );
}

function statusDot(status: string): string {
  const normalized = status.toUpperCase();
  if (normalized === 'SUCCESS') return 'var(--text-primary)';
  if (normalized === 'REVERTED') return 'var(--text-muted)';
  return 'var(--text-tertiary)';
}

export const InboxView: React.FC = () => {
  const { isSidebarCollapsed, toggleSidebarCollapsed } = useAppStore();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [response, setResponse] = useState<AuditEventListResponse | null>(null);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<AuditInboxFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [actionState, setActionState] = useState<ActionState>('idle');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const requestGenerationRef = useRef(0);

  const loadEvents = useCallback(async () => {
    const generation = ++requestGenerationRef.current;
    setLoadState('loading');
    setLoadError('');
    try {
      const nextResponse = await fetchAuditEvents({ page, filter, search });
      if (generation !== requestGenerationRef.current) return;
      setResponse(nextResponse);
      setSelectedEventId((current) =>
        nextResponse.items.some((item) => item.id === current) ? current : null,
      );
      setLoadState('ready');
    } catch (error) {
      if (generation !== requestGenerationRef.current) return;
      setLoadError(requestErrorMessage(error));
      setSelectedEventId(null);
      setLoadState('error');
    }
  }, [filter, page, search, reloadToken]);

  useEffect(() => {
    void loadEvents();
    return () => {
      requestGenerationRef.current += 1;
    };
  }, [loadEvents]);

  const events = response?.items ?? [];
  const selectedEvent = useMemo(
    () => events.find((item) => item.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );
  const statusCounts = response?.status_counts ?? {};
  const allCount = Object.entries(statusCounts).reduce(
    (total, [status, count]) => status === 'REVERTED' ? total : total + count,
    0,
  );

  const selectFilter = (id: string) => {
    setFilter(id as AuditInboxFilter);
    setPage(1);
    setSelectedEventId(null);
    setActionMessage('');
    setActionError('');
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
    setSelectedEventId(null);
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearch('');
    setPage(1);
    setSelectedEventId(null);
  };

  const selectEvent = (event: AuditEventItem) => {
    setSelectedEventId(event.id);
    setActionMessage('');
    setActionError('');
  };

  const handleUndo = async () => {
    if (!selectedEvent?.can_undo || actionState === 'loading') return;
    setActionState('loading');
    setActionMessage('');
    setActionError('');
    try {
      const result = await undoAuditEvent(selectedEvent.id);
      setActionMessage(result.message);
      setReloadToken((current) => current + 1);
    } catch (error) {
      setActionError(requestErrorMessage(error));
    } finally {
      setActionState('idle');
    }
  };

  const renderList = () => {
    if (loadState === 'loading') {
      return <DataState title="Loading workspace events…" detail="Reading the latest activity from this workspace." />;
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
    if (events.length === 0) {
      const filtered = filter !== 'all' || Boolean(search);
      return (
        <DataState
          title={filtered ? 'No matching events' : 'No workspace events yet'}
          detail={filtered
            ? 'Try another status or search term.'
            : 'Rule runs and other recorded workspace activity will appear here.'}
          actionLabel={filtered ? 'Clear filters' : undefined}
          onAction={filtered ? () => {
            setFilter('all');
            clearSearch();
          } : undefined}
        />
      );
    }
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <LinearDataListStack className="p-2">
          {events.map((item) => (
            <InboxItemRow
              key={item.id}
              item={item}
              isSelected={item.id === selectedEventId}
              onSelect={() => selectEvent(item)}
            />
          ))}
        </LinearDataListStack>
      </div>
    );
  };

  return (
    <div className="flex h-full min-w-0 overflow-hidden bg-transparent">
      <section
        aria-label="Workspace event list"
        className={`${selectedEvent ? 'hidden md:flex' : 'flex'} h-full min-w-0 w-full flex-col border-[var(--color-border-primary)] md:w-[400px] md:shrink-0 md:border-r`}
      >
        <header className="flex min-h-11 shrink-0 items-center gap-2 px-3">
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
          <div className="min-w-0">
            <h1 className="text-[14px] font-medium text-[var(--text-primary)]">Inbox</h1>
            <p className="truncate text-[12px] text-[var(--text-muted)]">Workspace activity</p>
          </div>
        </header>

        <div className="border-y border-[var(--color-border-primary)] px-3 py-2">
          <form className="flex min-w-0 items-center gap-2" onSubmit={submitSearch} role="search">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={15} aria-hidden="true" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search workspace events"
                aria-label="Search workspace events"
                className="w-full pl-9"
              />
            </div>
            <Button type="submit" className="h-9 text-[14px]">Search</Button>
          </form>
          {search && (
            <div className="mt-2 flex items-center justify-between gap-2 text-[13px] text-[var(--text-tertiary)]">
              <span className="min-w-0 truncate">Results for “{search}”</span>
              <button type="button" onClick={clearSearch} className="shrink-0 text-[14px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                Clear
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto border-b border-[var(--color-border-primary)] px-3 py-2">
          <LinearTabs
            tabs={[
              { id: 'all', label: 'All', count: allCount },
              { id: 'error', label: 'Errors', count: statusCounts.ERROR ?? 0 },
              { id: 'reverted', label: 'Reverted', count: statusCounts.REVERTED ?? 0 },
            ]}
            activeTabId={filter}
            onChange={selectFilter}
            aria-label="Inbox event status"
          />
        </div>

        {renderList()}

        {loadState === 'ready' && events.length > 0 && response && (
          <footer className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-t border-[var(--color-border-primary)] px-3">
            <span className="text-[12px] text-[var(--text-muted)]">
              Page {response.page} of {response.total_pages} · {response.total} events
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="compact"
                className="text-[14px]"
                disabled={page <= 1}
                onClick={() => {
                  setPage((current) => Math.max(1, current - 1));
                  setSelectedEventId(null);
                }}
              >
                Previous
              </Button>
              <Button
                size="compact"
                className="text-[14px]"
                disabled={page >= response.total_pages}
                onClick={() => {
                  setPage((current) => current + 1);
                  setSelectedEventId(null);
                }}
              >
                Next
              </Button>
            </div>
          </footer>
        )}
      </section>

      <section
        aria-label="Workspace event details"
        className={`${selectedEvent ? 'flex' : 'hidden md:flex'} h-full min-w-0 flex-1 flex-col overflow-hidden`}
      >
        {selectedEvent ? (
          <>
            <header className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border-primary)] px-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedEventId(null)}
                  className="linear-icon-btn md:hidden"
                  aria-label="Back to workspace events"
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                </button>
                <span className="truncate text-[14px] font-medium text-[var(--text-primary)]">
                  {auditEventTarget(selectedEvent)}
                </span>
              </div>
              <LinearLabelPill
                label={humanizeAuditValue(selectedEvent.display_status)}
                dotColor={statusDot(selectedEvent.display_status)}
              />
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
              <article className="mx-auto max-w-[720px]">
                <div className="flex items-start gap-3.5">
                  <BuyerlyLogoAvatar size={40} shape="rounded" />
                  <div className="min-w-0">
                    <h2 className="break-words text-[22px] font-medium leading-7 tracking-[-0.015em] text-[var(--text-primary)]">
                      {auditEventTitle(selectedEvent)}
                    </h2>
                    <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">
                      {formatAuditTimestamp(selectedEvent.created_at)}
                    </p>
                  </div>
                </div>

                <p className="mt-6 text-[14px] leading-relaxed text-[var(--text-secondary)]">
                  {selectedEvent.message || 'No additional message was recorded for this event.'}
                </p>

                <dl className="mt-7 border-t border-[var(--color-border-primary)]">
                  <MetadataRow label="Target" value={auditEventTarget(selectedEvent)} />
                  {selectedEvent.entity_level && <MetadataRow label="Entity level" value={humanizeAuditValue(selectedEvent.entity_level)} />}
                  {selectedEvent.account_name && <MetadataRow label="Ad account" value={selectedEvent.account_name} />}
                  {selectedEvent.rule_name && <MetadataRow label="Rule" value={selectedEvent.rule_name} />}
                  <MetadataRow label="Category" value={humanizeAuditValue(selectedEvent.category)} />
                  <MetadataRow label="Event type" value={humanizeAuditValue(selectedEvent.event_type)} />
                  {selectedEvent.duration_ms !== null && <MetadataRow label="Duration" value={`${selectedEvent.duration_ms} ms`} />}
                </dl>

                {(selectedEvent.can_undo || selectedEvent.is_reverted) && (
                  <section className="mt-7 rounded-[var(--control-border-radius)] border border-[var(--color-border-primary)] bg-[var(--card-bg)] p-4" aria-labelledby="inbox-undo-heading">
                    <h3 id="inbox-undo-heading" className="text-[14px] font-medium text-[var(--text-primary)]">Undo</h3>
                    <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-tertiary)]">
                      {selectedEvent.is_reverted
                        ? 'This action has already been undone.'
                        : 'Buyerly will ask Meta to restore the state recorded before this action.'}
                    </p>
                    {selectedEvent.can_undo && (
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
            <div>
              <h2 className="text-[14px] font-medium text-[var(--text-primary)]">Select a workspace event</h2>
              <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">Event details and eligible actions will appear here.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
