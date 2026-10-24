import { decodeInboxFilter, fetchInbox, inboxListKey, inboxPageKey, inboxTabShown, INBOX_PAGE_SIZE, type InboxQuery, type InboxTab } from '@/lib/inbox';
import { periodFromSearch } from '@/components/campaigns/adsManagerMetrics';
import { useAppStore, type ActiveTab } from '@/store/useAppStore';
import type { TeamItem } from '@/lib/teams';
import { pool, type Query } from './pool';
import { adAccountsQuery, connectionsQuery, hierarchyQuery, membersQuery, teamDocumentsQuery, teamsQuery } from './queries';

/** A page as the shell opens it: enough to know what it draws. */
export interface PageToOpen {
  tab: ActiveTab;
  teamKey: string | null;
  mine: boolean;
  inboxTab: InboxTab | null;
  /** The address's query when the page was opened (Ads Manager's `?period=`, Inbox's `?filter=`). */
  search: string;
}

/**
 * A promise React can read with `use`: its state is set on it as it settles,
 * so a page whose data came already is not held for another render.
 */
type Readiness = Promise<void> & { status?: 'pending' | 'fulfilled'; value?: void };

/**
 * Reads what the page draws in its first frame into the pool, as Linear loads
 * a view's models before it shows it (#490). Null when the pool holds it all:
 * the page can open at once. Never rejects; a page whose read failed opens and
 * says so itself.
 */
export function preloadPage(page: PageToOpen, workspaceId: number): Readiness | null {
  const waits: Promise<unknown>[] = [];
  const need = (query: Query<any>) => {
    if (!pool.has(query.key)) waits.push(pool.fetch(query));
  };
  const store = useAppStore.getState();
  const needViews = () => {
    if (!store.viewSettingsLoaded) waits.push(store.loadViewSettings());
  };
  const needTeams = () => {
    if (page.teamKey) need(teamsQuery(workspaceId));
  };

  if (page.tab === 'inbox') {
    const inbox = preloadInbox(page);
    if (inbox) waits.push(inbox);
  } else if (page.tab === 'accounts') {
    needViews();
    need(adAccountsQuery);
    need(teamsQuery(workspaceId));
    need(membersQuery(workspaceId));
    need(connectionsQuery);
  } else if (page.tab === 'campaigns') {
    needViews();
    if (!page.mine) needTeams();
    need(adAccountsQuery);
    need(connectionsQuery);
    need(hierarchyQuery(periodFromSearch(page.search)));
  } else if (page.tab === 'rules') {
    needViews();
    needTeams();
    if (store.rulesLoadState !== 'ready') waits.push(store.loadRules({ ifStale: true }));
  } else if (page.tab === 'team') {
    need(membersQuery(workspaceId));
    const teams = teamsQuery(workspaceId);
    const documents = (list: TeamItem[] | undefined) => {
      const team = list?.find((item) => item.key === page.teamKey);
      return team ? teamDocumentsQuery(workspaceId, team.id) : null;
    };
    if (pool.has(teams.key)) {
      const query = documents(pool.result<TeamItem[]>(teams.key).data);
      if (query) need(query);
    } else {
      waits.push(pool.fetch(teams).then(() => {
        const query = documents(pool.result<TeamItem[]>(teams.key).data);
        return query && !pool.has(query.key) ? pool.fetch(query) : undefined;
      }));
    }
  } else if (page.tab === 'members') {
    need(membersQuery(workspaceId));
  } else if (page.tab === 'teams') {
    need(teamsQuery(workspaceId));
  }

  if (waits.length === 0) return null;
  const ready: Readiness = Promise.all(waits).then(() => undefined, () => undefined);
  ready.status = 'pending';
  void ready.then(() => {
    ready.status = 'fulfilled';
    ready.value = undefined;
  });
  return ready;
}

/** Inbox's Display options, the saved filters and the list the address asks for. */
function preloadInbox(page: PageToOpen): Promise<void> | null {
  const store = useAppStore.getState();
  // Inbox draws the list the address's filters ask for first, as it does on any visit.
  const filters = decodeInboxFilter(new URLSearchParams(page.search).get('filter'));
  const key = () => {
    const { inboxDisplay } = useAppStore.getState();
    return inboxPageKey(inboxListKey(inboxDisplay, inboxTabShown(inboxDisplay, page.inboxTab)), filters);
  };
  if (store.inboxDisplayLoaded && store.viewSettingsLoaded && pool.has(key())) return null;
  const scope = pool.scope;
  return (async () => {
    await Promise.all([store.inboxDisplayLoaded ? null : store.loadInboxDisplay(), store.loadViewSettings()]);
    const pageKey = key();
    if (pool.has(pageKey)) return;
    const { inboxDisplay } = useAppStore.getState();
    const listQuery = JSON.parse(inboxListKey(inboxDisplay, inboxTabShown(inboxDisplay, page.inboxTab))) as Omit<InboxQuery, 'offset'>;
    const response = await fetchInbox({ offset: 0, limit: INBOX_PAGE_SIZE, ...listQuery, filters });
    // Another workspace opened meanwhile, or Inbox read the list itself.
    if (pool.scope !== scope || pool.has(pageKey)) return;
    pool.setValue({ key: pageKey }, { items: response.items, hasMore: response.has_more, hiddenByFilters: response.hidden_by_filters ?? 0 });
    useAppStore.getState().setInboxUnread(response);
  })();
}
