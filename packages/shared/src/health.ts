// The server's health answer. Read by the API's proxy check, the deploy smoke
// test and, later, the client's new-version check.
export interface ServerHealth {
  status: 'alive' | 'ready' | 'not_ready';
  // The release sha the server runs, or "local" outside a release build.
  version: string;
}
