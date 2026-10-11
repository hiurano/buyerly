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

export async function fetchViewSettings(): Promise<StoredViews> {
  const payload = await apiRequest<{ views?: unknown }>('/api/view-settings');
  const views = isObject(payload) && isObject(payload.views) ? payload.views : {};
  return Object.fromEntries(Object.entries(views).filter(([, value]) => isObject(value))) as StoredViews;
}

export async function saveViewSettings(key: string, settings: StoredView): Promise<void> {
  await apiRequest(`/api/view-settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ settings }),
  });
}

/** Linear's "Reset": the page goes back to its defaults. */
export async function deleteViewSettings(key: string): Promise<void> {
  await apiRequest(`/api/view-settings/${encodeURIComponent(key)}`, { method: 'DELETE' });
}
