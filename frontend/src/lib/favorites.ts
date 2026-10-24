import { create } from 'zustand';
import { apiRequest } from './api';
import { toast } from '@/ui/toast';

/**
 * Each member's favorites, Linear's star and the sidebar's Favorites section,
 * kept on the server per workspace. A favorite is the app address inside the
 * workspace, without its slug ("team/TES/rules", "accounts/act_1001"), and
 * the name it had when starred.
 */
export type FavoriteKind = 'page' | 'account' | 'campaign' | 'adset' | 'ad' | 'rule';

export interface Favorite {
  id: number;
  kind: FavoriteKind;
  path: string;
  title: string;
  position: number;
}

export interface FavoriteInput {
  kind: FavoriteKind;
  path: string;
  title: string;
}

interface FavoritesState {
  /** The workspace the list belongs to; another one starts empty. */
  workspace: string | null;
  favorites: Favorite[];
  loaded: boolean;
  /** The open page's star, which the command menu offers as "Favorite page". */
  here: FavoriteInput | null;
  load: (workspace: string) => Promise<void>;
  add: (input: FavoriteInput) => Promise<void>;
  remove: (path: string) => Promise<void>;
}

/** The address inside the workspace that an app path names: "/ws/team/TES/rules" → "team/TES/rules". */
export function favoritePath(appPath: string, workspace: string): string {
  const prefix = `/${workspace}/`;
  const inside = appPath.startsWith(prefix) ? appPath.slice(prefix.length) : appPath.replace(/^\//, '');
  return inside.replace(/\/$/, '');
}

/** The page with a star is the one open; the command menu adds or removes it. */
export function toggleFavorite(input: FavoriteInput): Promise<void> {
  const state = useFavorites.getState();
  return state.favorites.some((favorite) => favorite.path === input.path) ? state.remove(input.path) : state.add(input);
}

export const useFavorites = create<FavoritesState>((set, get) => ({
  workspace: null,
  favorites: [],
  loaded: false,
  here: null,

  load: async (workspace) => {
    if (get().workspace !== workspace) set({ workspace, favorites: [], loaded: false });
    try {
      const payload = await apiRequest<{ favorites?: Favorite[] }>('/api/favorites');
      if (get().workspace !== workspace) return;
      set({ favorites: Array.isArray(payload.favorites) ? payload.favorites : [], loaded: true });
    } catch {
      // The section stays hidden; starring still works once the server answers.
      if (get().workspace === workspace) set({ loaded: true });
    }
  },

  add: async (input) => {
    const { workspace, favorites } = get();
    if (favorites.some((favorite) => favorite.path === input.path)) return;
    // Shown at once at the end of the section, as Linear's; the server's id replaces this one.
    const pending: Favorite = { ...input, id: -Date.now(), position: (favorites[favorites.length - 1]?.position ?? 0) + 1 };
    set({ favorites: [...favorites, pending] });
    try {
      const saved = await apiRequest<Favorite>('/api/favorites', { method: 'POST', body: JSON.stringify(input) });
      if (get().workspace !== workspace) return;
      set((state) => ({ favorites: state.favorites.map((favorite) => (favorite.id === pending.id ? saved : favorite)) }));
    } catch (error) {
      if (get().workspace !== workspace) return;
      set((state) => ({ favorites: state.favorites.filter((favorite) => favorite.id !== pending.id) }));
      toast.error("Couldn't add to favorites", error instanceof Error ? error.message : undefined);
    }
  },

  remove: async (path) => {
    const { workspace, favorites } = get();
    const target = favorites.find((favorite) => favorite.path === path);
    if (!target) return;
    set({ favorites: favorites.filter((favorite) => favorite.path !== path) });
    try {
      if (target.id > 0) await apiRequest(`/api/favorites/${target.id}`, { method: 'DELETE' });
    } catch (error) {
      if (get().workspace !== workspace) return;
      set((state) => ({ favorites: [...state.favorites, target].sort((a, b) => a.position - b.position) }));
      toast.error("Couldn't remove from favorites", error instanceof Error ? error.message : undefined);
    }
  },
}));
