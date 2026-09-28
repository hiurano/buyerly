import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { Workspace } from '@/lib/types';
import { workspaceTools } from './tools';
import type { ModelContext, WebMcpTool } from './types';

/** Opts one browser in while the build keeps WebMCP off: `localStorage.setItem('buyerly-webmcp', 'on')`. */
const OPT_IN_KEY = 'buyerly-webmcp';

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
  useEffect(() => {
    const modelContext = findModelContext();
    if (!modelContext || !webMcpEnabled()) return;
    const controller = new AbortController();
    const tools = workspaceTools({
      workspace: slug,
      canWrite: role !== 'viewer',
      inScope: useAppStore.getState().captureScope(),
      signal: controller.signal,
    });
    registerTools(modelContext, tools, controller.signal);
    return () => controller.abort();
  }, [slug, role]);
}
