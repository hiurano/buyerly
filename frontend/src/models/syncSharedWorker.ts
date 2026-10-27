/**
 * Opens the workspace's SharedWorker (#498). Its own module, loaded only where
 * the browser has SharedWorker: `import.meta.url` is what the bundler follows
 * to the worker's script, and the node checks can't read it.
 */
export function openSharedWorker(name: string): SharedWorker {
  return new SharedWorker(new URL('./syncWorker.ts', import.meta.url), { type: 'module', name });
}
