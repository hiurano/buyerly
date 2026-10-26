import { graphql } from './graphql';
import { toast } from '@/ui/toast';
import { makeStore, useStore } from '@/models/store';

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

/** The address inside the workspace that an app path names: "/ws/team/TES/rules" → "team/TES/rules". */
export function favoritePath(appPath: string, workspace: string): string {
  const prefix = `/${workspace}/`;
  const inside = appPath.startsWith(prefix) ? appPath.slice(prefix.length) : appPath.replace(/^\//, '');
  return inside.replace(/\/$/, '');
}

/** The page with a star is the one open; the command menu adds or removes it. */
export function toggleFavorite(input: FavoriteInput): Promise<void> {
  return favoritesStore.favorites.some((favorite) => favorite.path === input.path)
    ? favoritesStore.remove(input.path)
    : favoritesStore.add(input);
}

export class FavoritesStore {
  /** The workspace the list belongs to; another one starts empty. */
  workspace: string | null = null;
  favorites: Favorite[] = [];
  loaded = false;
  /** The open page's star, which the command menu offers as "Favorite page". */
  here: FavoriteInput | null = null;

  constructor() {
    makeStore(this);
  }

  setHere(here: FavoriteInput | null) {
    this.here = here;
  }

  async load(workspace: string) {
    if (this.workspace !== workspace) this.set({ workspace, favorites: [], loaded: false });
    try {
      const payload = await graphql<{ favorites?: Favorite[] }>('query Favorites { favorites }');
      if (this.workspace !== workspace) return;
      this.set({ favorites: Array.isArray(payload.favorites) ? payload.favorites : [], loaded: true });
    } catch {
      // The section stays hidden; starring still works once the server answers.
      if (this.workspace === workspace) this.set({ loaded: true });
    }
  }

  async add(input: FavoriteInput) {
    const { workspace, favorites } = this;
    if (favorites.some((favorite) => favorite.path === input.path)) return;
    // Shown at once at the end of the section, as Linear's; the server's id replaces this one.
    const pending: Favorite = { ...input, id: -Date.now(), position: (favorites[favorites.length - 1]?.position ?? 0) + 1 };
    this.set({ favorites: [...favorites, pending] });
    try {
      const { favorite: saved } = await graphql<{ favorite: Favorite }>(
        'mutation FavoriteCreate($input: JSON!) { favoriteCreate(input: $input) { success lastSyncId favorite } }',
        { input },
      );
      if (this.workspace !== workspace) return;
      this.set({ favorites: this.favorites.map((favorite) => (favorite.id === pending.id ? saved : favorite)) });
    } catch (error) {
      if (this.workspace !== workspace) return;
      this.set({ favorites: this.favorites.filter((favorite) => favorite.id !== pending.id) });
      toast.error("Couldn't add to favorites", error instanceof Error ? error.message : undefined);
    }
  }

  async remove(path: string) {
    const { workspace, favorites } = this;
    const target = favorites.find((favorite) => favorite.path === path);
    if (!target) return;
    this.set({ favorites: favorites.filter((favorite) => favorite.path !== path) });
    try {
      if (target.id > 0) {
        await graphql('mutation FavoriteDelete($id: Int!) { favoriteDelete(id: $id) { success lastSyncId } }', { id: target.id });
      }
    } catch (error) {
      if (this.workspace !== workspace) return;
      this.set({ favorites: [...this.favorites, target].sort((a, b) => a.position - b.position) });
      toast.error("Couldn't remove from favorites", error instanceof Error ? error.message : undefined);
    }
  }

  private set(patch: Partial<FavoritesStore>) {
    Object.assign(this, patch);
  }
}

export const favoritesStore = new FavoritesStore();

export const useFavorites = <T,>(select: (store: FavoritesStore) => T): T => useStore(favoritesStore, select);
