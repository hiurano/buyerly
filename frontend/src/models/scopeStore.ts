import { parseRoute } from '@/lib/routing';
import type { Workspace } from '@/lib/types';
import { pool } from './pool';
import { sync } from './sync';
import { makeStore, useStore } from './store';

/** The open workspace: which one, its name and the member's role in it. */
export class ScopeStore {
  workspaceScope: string | null = null;
  workspaceSlug: string | null = null;
  scopeGeneration = 0;
  workspaceName = 'buyerly';
  /** The member's role in the open workspace; admins and owners may set views' defaults for everyone. */
  workspaceRole: Workspace['role'] | null = null;
  readonly #resets: (() => void)[] = [];

  constructor() {
    makeStore(this);
  }

  /** What another store forgets when the workspace changes; theme, layout and display preferences survive. */
  onWorkspaceChange(reset: () => void) {
    this.#resets.push(reset);
  }

  setWorkspaceScope(scope: string | null, slug?: string) {
    if (this.workspaceScope === scope && this.workspaceSlug === (slug ?? null)) return;
    // The pool holds one workspace's data: another workspace, account or none never sees it (#488).
    const poolScope = scope === null ? null : `${scope}:${slug ?? ''}`;
    pool.reset(poolScope);
    // Its synced models fill the pool and keep it current (#507).
    sync.open(poolScope, slug ?? null);
    for (const reset of this.#resets) reset();
    this.workspaceName = 'buyerly';
    this.workspaceScope = scope;
    this.workspaceSlug = slug ?? null;
    this.scopeGeneration += 1;
  }

  /** A check that the workspace open now is still the one open when it was taken. */
  captureScope(): () => boolean {
    const { workspaceScope, workspaceSlug, scopeGeneration } = this;
    return () => {
      const current = parseRoute();
      return workspaceScope !== null && this.workspaceScope === workspaceScope
        && this.scopeGeneration === scopeGeneration && current.kind === 'workspace'
        && current.workspace === workspaceSlug;
    };
  }

  setWorkspaceName(name: string) {
    this.workspaceName = name;
  }

  setWorkspaceRole(role: Workspace['role'] | null) {
    this.workspaceRole = role;
  }
}

export const scopeStore = new ScopeStore();

export const useScopeStore = <T,>(select: (store: ScopeStore) => T): T => useStore(scopeStore, select);

/** Thrown by a write asked for after its workspace was left. */
export const OUT_OF_SCOPE = 'This workspace is no longer open.';
