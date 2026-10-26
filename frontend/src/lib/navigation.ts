import { useMemo } from 'react';
import { currentRoute, openAppPath, pathForTab, useRoute, type Route } from '@/lib/routing';
import { shellStore, useShellStore, type ActiveTab, type AppTab } from '@/models/shellStore';
import { viewStore, type AdsManagerEntity } from '@/models/viewStore';

/*
 * Moving between the app's pages, as the sidebar, G … and the command menu do.
 * The address says which page is open (#495); the stores only remember the
 * app page Settings and search were opened from, and Ads Manager's last level.
 */

const isAppTab = (tab: ActiveTab): tab is AppTab => tab !== 'preferences' && tab !== 'search';

/** An app page's place: its tab, team and whether it is My campaigns. */
export interface AppPlace {
  tab: AppTab;
  teamKey: string | null;
  mine: boolean;
}

/** The app page a route opens, or null for Settings and search. */
export function appPlaceOf(route: Route): AppPlace | null {
  if (route.kind !== 'workspace' || !isAppTab(route.tab)) return null;
  return { tab: route.tab, teamKey: route.teamKey ?? null, mine: Boolean(route.mine) };
}

/**
 * The page on screen for the sidebar and the shortcuts: its tab, and the team
 * of the app page it is or (Settings, search) was opened from.
 */
export function useCurrentPage(): { tab: ActiveTab | null; teamKey: string | null; mine: boolean } {
  const route = useRoute();
  const lastAppPlace = useShellStore((state) => state.lastAppPlace);
  const place = appPlaceOf(route) ?? lastAppPlace;
  const tab = route.kind === 'workspace' ? route.tab : null;
  return useMemo(() => ({ tab, teamKey: place.teamKey, mine: place.mine }), [tab, place.teamKey, place.mine]);
}

/**
 * Opens an app page of the workspace on screen, as the sidebar and G … do. The
 * team and My campaigns stay as they are unless given; the page on screen
 * stays when it is already that page (a notification or an account open under it).
 */
export function openTab(tab: AppTab, options: { teamKey?: string | null; mine?: boolean; entity?: AdsManagerEntity } = {}): void {
  const route = currentRoute();
  if (route.kind !== 'workspace') return;
  const from = appPlaceOf(route) ?? shellStore.lastAppPlace;
  const mine = tab === 'campaigns' && (options.mine ?? (options.teamKey === undefined && from.mine));
  const teamKey = mine ? null : options.teamKey !== undefined ? options.teamKey : from.teamKey;
  const entity = options.entity ?? viewStore.campaignFilterTab;
  if (
    route.tab === tab && (route.teamKey ?? null) === teamKey && Boolean(route.mine) === mine
    && (tab !== 'campaigns' || route.entity === entity)
  ) return;
  const path = pathForTab(route.workspace, tab, entity, 'preferences', '', undefined, teamKey, mine);
  // The filters and period follow to the next level; an old link's ad account stays behind.
  const query = new URLSearchParams(window.location.search);
  query.delete('account');
  const keepQuery = route.tab === 'campaigns' && tab === 'campaigns' && query.toString();
  openAppPath(keepQuery ? `${path}?${query}` : path);
}

/** Back to the app page Settings or search was opened from. */
export function openLastAppPage(): void {
  const { tab, teamKey, mine } = shellStore.lastAppPlace;
  openTab(tab, { teamKey, mine });
}

