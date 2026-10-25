import { createContext, useContext } from 'react';
import { useAddress } from '@/lib/routing';
import { useShellStore } from '@/models/shellStore';
import { useViewStore, type AdsManagerEntity } from '@/models/viewStore';

/**
 * What the page on screen was opened for: its team, its Ads Manager level and
 * its address. While the next page gets ready the store and the address have
 * already moved on (#490); the page still on screen reads these instead, so it
 * stays as it was until the next one takes its place.
 */
export interface BuyerlyPageScope {
  teamKey: string | null;
  entity: AdsManagerEntity;
  pathname: string;
}

export const BuyerlyPageScopeContext = createContext<BuyerlyPageScope | null>(null);

/** The team whose page is on screen; outside the page (the sidebar), the store's. */
export function usePageTeamKey(): string | null {
  const scope = useContext(BuyerlyPageScopeContext);
  const current = useShellStore((state) => state.activeTeamKey);
  return scope ? scope.teamKey : current;
}

/** Ads Manager's level on screen. */
export function usePageEntity(): AdsManagerEntity {
  const scope = useContext(BuyerlyPageScopeContext);
  const current = useViewStore((state) => state.campaignFilterTab);
  return scope ? scope.entity : current;
}

/** The address of the page on screen. */
export function usePagePathname(): string {
  const scope = useContext(BuyerlyPageScopeContext);
  const { pathname } = useAddress();
  return scope ? scope.pathname : pathname;
}
