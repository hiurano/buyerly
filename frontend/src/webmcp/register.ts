import { useEffect, useSyncExternalStore } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { Workspace } from '@/lib/types';
import { workspaceTools } from './tools';
import type { ModelContext, WebMcpTool } from './types';

/** Opts one browser in while the build keeps WebMCP off: Settings → Preferences, or `localStorage.setItem('buyerly-webmcp', 'on')`. */
const OPT_IN_KEY = 'buyerly-webmcp';
const OPT_IN_EVENT = 'buyerly-webmcp-change';

/**
 * Chrome 150 moved the entry point from `navigator` to `document` and warns
 * whenever the old one is read, so `navigator` is only a fallback.
 */
export function findModelContext(): ModelContext | null {
  const modelContext = document.modelContext ?? navigator.modelContext;
  return modelContext && typeof modelContext.registerTool === 'function' ? modelContext : null;
}

/** Off in production until the tools pass a manual check: built with VITE_WEBMCP=1, or opted in above. */
export function webMcpEnabled(): boolean {
  if (import.meta.env.VITE_WEBMCP === '1') return true;
  try {
    return window.localStorage.getItem(OPT_IN_KEY) === 'on';
  } catch {
    return false;
  }
}

/** Turns the tools on or off in this browser; every open workspace re-registers at once. */
export function setWebMcpEnabled(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(OPT_IN_KEY, 'on');
    else window.localStorage.removeItem(OPT_IN_KEY);
  } catch {
    // Storage is blocked: the switch cannot stick in this browser.
  }
  window.dispatchEvent(new Event(OPT_IN_EVENT));
}

function subscribeToOptIn(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === OPT_IN_KEY || event.key === null) onChange();
  };
  window.addEventListener(OPT_IN_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(OPT_IN_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** Whether the tools are on here, following the switch in this and other tabs. */
export function useWebMcpEnabled(): boolean {
  return useSyncExternalStore(subscribeToOptIn, webMcpEnabled, () => false);
}

/** Every tool lives until `signal` aborts. */
export function registerTools(modelContext: ModelContext, tools: WebMcpTool[], signal: AbortSignal): void {
  const report = (name: string, error: unknown) => {
    // Aborting a registration still in flight rejects it: that is the unregistration.
    if (signal.aborted) return;
    console.warn(`Buyerly could not offer the ${name} tool to the browser's AI agent.`, error);
  };
  for (const tool of tools) {
    try {
      Promise.resolve(modelContext.registerTool(tool, { signal })).catch((error) => report(tool.name, error));
    } catch (error) {
      report(tool.name, error);
      continue;
    }
    if (typeof modelContext.unregisterTool === 'function') {
      signal.addEventListener('abort', () => {
        try {
          modelContext.unregisterTool?.(tool.name);
        } catch {
          // Already gone: this browser unregistered it through the signal.
        }
      }, { once: true });
    }
  }
}

/**
 * Offers the open workspace's tools to the browser's AI agent. The component
 * using this remounts per workspace and session, so the tools of a workspace
 * never outlive it: an agent cannot aim a change at a workspace the person
 * has left.
 */
export function useWebMcpTools(workspace: Pick<Workspace, 'slug' | 'role'>): void {
  const { slug, role } = workspace;
  const enabled = useWebMcpEnabled();
  useEffect(() => {
    const modelContext = findModelContext();
    if (!modelContext || !enabled) return;
    const controller = new AbortController();
    const tools = workspaceTools({
      workspace: slug,
      canWrite: role !== 'viewer',
      inScope: useAppStore.getState().captureScope(),
      signal: controller.signal,
    });
    registerTools(modelContext, tools, controller.signal);
    return () => controller.abort();
  }, [slug, role, enabled]);
}
