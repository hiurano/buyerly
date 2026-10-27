import { use } from 'react';
import type { ActiveTab } from '@/models/shellStore';

/**
 * A promise React can read with `use`: its state is set on it as it settles,
 * so code that came already renders in the same frame, without suspending.
 */
type Loading<T> = Promise<T> & { status?: 'pending' | 'fulfilled' | 'rejected'; value?: T; reason?: unknown };

/** Part of the app in its own file, as Linear splits its client into route and feature chunks (#494). */
export interface BuyerlyChunk<M> {
  /** The module, downloading on the first call; the same promise after. */
  load: () => Loading<M>;
}

function track<T>(promise: Promise<T>): Loading<T> {
  const loading = promise as Loading<T>;
  loading.status = 'pending';
  loading.then(
    (value) => { loading.status = 'fulfilled'; loading.value = value; },
    (reason: unknown) => { loading.status = 'rejected'; loading.reason = reason; },
  );
  return loading;
}

export function buyerlyChunk<M>(importModule: () => Promise<M>): BuyerlyChunk<M> {
  const state: { loading?: Loading<M> } = {};
  const load = () => {
    // A download that failed (offline, a new release) is tried again on the next open.
    if (!state.loading || state.loading.status === 'rejected') state.loading = track(importModule());
    return state.loading;
  };
  return { load };
}

/** The chunk's module; suspends while it downloads. */
export function useBuyerlyChunk<M>(chunk: BuyerlyChunk<M>): M {
  return use(chunk.load() as Promise<M>);
}

/**
 * Starts the chunk's download. Null when it is in, so a page held for its code
 * is held only while that is on its way; never rejects (the page shows the error).
 */
export function preloadChunk(chunk: BuyerlyChunk<unknown>): Promise<void> | null {
  const loading = chunk.load();
  if (loading.status === 'fulfilled') return null;
  return loading.then(() => undefined, () => undefined);
}

/** The pages' chunks, by the tab that shows them. */
export const PAGE_CHUNKS = {
  inbox: buyerlyChunk(() => import('@/components/inbox/InboxView')),
  accounts: buyerlyChunk(() => Promise.all([import('@/components/accounts/AccountsView'), import('@/components/accounts/AccountPage')])
    .then(([list, page]) => ({ ...list, ...page }))),
  campaigns: buyerlyChunk(() => import('@/components/campaigns/CampaignsView')),
  rules: buyerlyChunk(() => Promise.all([import('@/components/rules/RulesView'), import('@/components/rules/RecentlyDeletedRulesPage')])
    .then(([list, deleted]) => ({ ...list, ...deleted }))),
  team: buyerlyChunk(() => import('@/components/teams/TeamHomeView')),
  members: buyerlyChunk(() => import('@/components/workspace/WorkspaceMembersView')),
  teams: buyerlyChunk(() => import('@/components/workspace/WorkspaceTeamsView')),
  search: buyerlyChunk(() => import('@/components/search/SearchView')),
  preferences: buyerlyChunk(() => import('@/components/preferences/PreferencesView')),
};
// Every tab has one.
PAGE_CHUNKS satisfies Record<ActiveTab, unknown>;

/** Starts the download of a tab's page; null when it is in. */
export function preloadPageChunk(tab: ActiveTab): Promise<void> | null {
  return preloadChunk(PAGE_CHUNKS[tab]);
}

/**
 * Once the first page's code is in and the browser is idle, downloads the
 * others, so a page opened for the first time doesn't wait for its code, as
 * Linear prefetches its route chunks. One chunk per idle moment: running them
 * all at once held the main thread for half a second in dev.
 */
export function prefetchChunks(chunks: BuyerlyChunk<unknown>[], first: BuyerlyChunk<unknown>): () => void {
  const state = { cancel: () => {}, cancelled: false };
  const idle = () => new Promise<void>((resolve) => {
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(() => resolve(), { timeout: 2_000 });
      state.cancel = () => window.cancelIdleCallback(handle);
    } else {
      const handle = window.setTimeout(resolve, 200);
      state.cancel = () => window.clearTimeout(handle);
    }
  });
  void (async () => {
    await preloadChunk(first);
    for (const chunk of chunks) {
      await idle();
      if (state.cancelled) return;
      await preloadChunk(chunk);
    }
  })();
  return () => {
    state.cancelled = true;
    state.cancel();
  };
}

/** The screens before the workspace: sign-in, invitations, onboarding, Not found. */
export const SIGNED_OUT_CHUNK = buyerlyChunk(() => Promise.all([
  import('@/components/auth/LoginView'),
  import('@/components/auth/VerifyEmailLinkView'),
  import('@/components/auth/InviteView'),
  import('@/components/auth/NotFoundView'),
  import('@/components/auth/MetaConnectInviteView'),
  import('@/components/onboarding/CreateWorkspaceView'),
  import('@/components/onboarding/WelcomeView'),
]).then(([login, verify, invite, notFound, metaConnect, createWorkspace, welcome]) => ({
  ...login, ...verify, ...invite, ...notFound, ...metaConnect, ...createWorkspace, ...welcome,
})));

/** What opens over the pages: the command menu, its palettes, the rule window, the shortcuts. */
export const OVERLAY_CHUNK = buyerlyChunk(() => Promise.all([
  import('@/components/command/CommandMenu'),
  import('@/components/command/OpenPalette'),
  import('@/components/command/WorkspaceSwitcher'),
  import('@/components/help/BuyerlyShortcutsPanel'),
  import('@/components/rules/CreateRuleModal'),
  import('@/webmcp/ApprovalDialog'),
]).then(([commandMenu, openPalette, switcher, shortcuts, ruleWindow, approval]) => ({
  ...commandMenu, ...openPalette, ...switcher, ...shortcuts, ...ruleWindow, ...approval,
})));
