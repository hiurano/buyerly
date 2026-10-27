import type React from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { App, WorkspaceApplication } from '@/App';
import { BuyerlyAppPages, BuyerlySettingsLayout, BuyerlySettingsRoute, pageComponentFor } from '@/components/layout/BuyerlyAppPages';
import { OVERLAY_CHUNK, SIGNED_OUT_CHUNK, preloadChunk, preloadPageChunk } from '@/components/layout/BuyerlyPageChunks';
import { appRouter, buyerlyRouteTree, currentRoute, type BuyerlyRouteHandle } from '@/lib/routing';

/** The layouts of the tree in lib/routing, by route id. */
const LAYOUTS: Record<string, React.ComponentType> = {
  root: App,
  workspace: WorkspaceApplication,
  settings: BuyerlySettingsLayout,
  pages: BuyerlyAppPages,
};

/** The screens outside the workspace (sign-in, invitations, Not found): the App draws them itself. */
const BuyerlyAppScreen: React.FC = () => null;

/**
 * The route tree with its components: a layout by id, a page by what its handle
 * opens; a Settings section is Settings itself, which reads its section from the address.
 */
function withComponents(routes: RouteObject[]): RouteObject[] {
  return routes.map((route) => {
    const opened = route.handle as BuyerlyRouteHandle | undefined;
    const Component = (route.id ? LAYOUTS[route.id] : undefined)
      ?? (opened && 'page' in opened
        ? (opened.page === 'preferences' ? BuyerlySettingsRoute : pageComponentFor(opened))
        : route.children ? undefined : BuyerlyAppScreen);
    return {
      ...route,
      ...(Component ? { Component } : {}),
      ...(route.children ? { children: withComponents(route.children) } : {}),
    } as RouteObject;
  });
}

/** Buyerly's router, as Linear's: React Router's data router over the browser's history. */
export const router = createBrowserRouter(withComponents(buyerlyRouteTree));
appRouter.current = router;

/**
 * The first page's code, asked for as the app starts (#494): the app renders
 * once it is in, so the page draws with the shell and asks for its data at
 * once, as when it was in the one bundle. Never rejects.
 */
export function firstPageCode(): Promise<void> {
  const route = currentRoute();
  if (route.kind !== 'workspace') return preloadChunk(SIGNED_OUT_CHUNK) ?? Promise.resolve();
  // The overlays too, side by side with it: their shortcuts (Ctrl/Cmd+K, O then a letter) work from the first frame.
  return Promise.all([preloadPageChunk(route.tab), preloadChunk(OVERLAY_CHUNK)]).then(() => undefined);
}
