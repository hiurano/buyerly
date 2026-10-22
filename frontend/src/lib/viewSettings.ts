import { apiRequest } from './api';

/**
 * Each member's list views, kept on the server per workspace as Linear does
 * (#385). A page saves one small object under its own key — "rules",
 * "inbox", "ads-manager.campaigns" — and the server hands it back as given.
 */
export type StoredView = Record<string, unknown>;
export type StoredViews = Record<string, StoredView>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const viewsIn = (value: unknown): StoredViews =>
  isObject(value)
    ? Object.fromEntries(Object.entries(value).filter(([, view]) => isObject(view))) as StoredViews
    : {};

/** The member's own views, and the workspace's defaults under them (#472). */
export async function fetchViewSettings(): Promise<{ views: StoredViews; defaults: StoredViews }> {
  const payload = await apiRequest<{ views?: unknown; defaults?: unknown }>('/api/view-settings');
  return {
    views: viewsIn(isObject(payload) ? payload.views : null),
    defaults: viewsIn(isObject(payload) ? payload.defaults : null),
  };
}

export async function saveViewSettings(key: string, settings: StoredView): Promise<void> {
  await apiRequest(`/api/view-settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ settings }),
  });
}

/** Linear's "Set default for everyone" (#472), for admins and owners; an empty view clears it. */
export async function saveViewDefault(key: string, settings: StoredView): Promise<void> {
  await apiRequest(`/api/view-settings/${encodeURIComponent(key)}/default`, {
    method: 'PUT',
    body: JSON.stringify({ settings }),
  });
}

/** Linear's "Reset": the page goes back to its defaults. */
export async function deleteViewSettings(key: string): Promise<void> {
  await apiRequest(`/api/view-settings/${encodeURIComponent(key)}`, { method: 'DELETE' });
}
