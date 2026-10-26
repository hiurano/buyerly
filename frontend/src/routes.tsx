import type React from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { App, WorkspaceApplication } from '@/App';
import { BuyerlyAppPages, BuyerlySettingsLayout, BuyerlySettingsRoute, pageComponentFor } from '@/components/layout/BuyerlyAppPages';
import { appRouter, buyerlyRouteTree, type BuyerlyRouteHandle } from '@/lib/routing';

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
