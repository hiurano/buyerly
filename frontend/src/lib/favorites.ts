import { graphql } from './graphql';
import { reaction } from 'mobx';
import { pool, type ListQuery } from '@/models/pool';
import { transactions } from '@/models/transactions';
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

/** The member's favorites in the pool: their order is the server's, a new one last. */
const favoritesQuery: ListQuery<Favorite> = {
  kind: 'list',
  key: 'favorites',
  type: 'favorite',
  load: async () => {
    const payload = await graphql<{ favorites?: Favorite[] }>('query Favorites { favorites }');
    return Array.isArray(payload.favorites) ? payload.favorites : [];
  },
  id: (favorite) => favorite.id,
};

let standIns = 0;

export class FavoritesStore {
  /** The workspace the list belongs to; another one starts empty. */
  workspace: string | null = null;
  /** As the pool shows them, with the stars still being written (#508). */
  favorites: Favorite[] = [];
  loaded = false;
  /** The open page's star, which the command menu offers as "Favorite page". */
  here: FavoriteInput | null = null;

  constructor() {
    makeStore(this);
    reaction(
      () => pool.result<Favorite[]>(favoritesQuery.key).data,
      (favorites) => this.set({ favorites: favorites ?? [] }),
    );
  }

  setHere(here: FavoriteInput | null) {
    this.here = here;
  }

  async load(workspace: string) {
    if (this.workspace !== workspace) this.set({ workspace, loaded: false });
    // The section stays hidden after a failure; starring still works once the server answers.
    await pool.fetch(favoritesQuery);
    if (this.workspace === workspace) this.set({ loaded: true });
  }

  /** Shown at once at the end of the section, as Linear's; the server's id replaces the stand-in's. */
  async add(input: FavoriteInput) {
    const { favorites } = this;
    if (favorites.some((favorite) => favorite.path === input.path)) return;
    const standIn: Favorite = { ...input, id: -(standIns += 1), position: (favorites[favorites.length - 1]?.position ?? 0) + 1 };
    await transactions.commit({
      label: "Couldn't add to favorites",
      mutation: 'mutation FavoriteCreate($input: JSON!) { favoriteCreate(input: $input) { success lastSyncId favorite } }',
      variables: { input },
      changes: [{ kind: 'insert', type: 'favorite', id: String(standIn.id), record: { ...standIn }, list: favoritesQuery.key }],
      created: 'favorite',
    }).catch(() => {});
  }

  /** Gone from the section at once; back if the server refuses. */
  async remove(path: string) {
    const target = this.favorites.find((favorite) => favorite.path === path);
    if (!target) return;
    await transactions.commit({
      label: "Couldn't remove from favorites",
      mutation: 'mutation FavoriteDelete($id: Int!) { favoriteDelete(id: $id) { success lastSyncId } }',
      variables: { id: target.id },
      changes: [{ kind: 'delete', type: 'favorite', id: String(target.id) }],
    }).catch(() => {});
  }

  private set(patch: Partial<FavoritesStore>) {
    Object.assign(this, patch);
  }
}

export const favoritesStore = new FavoritesStore();

export const useFavorites = <T,>(select: (store: FavoritesStore) => T): T => useStore(favoritesStore, select);
