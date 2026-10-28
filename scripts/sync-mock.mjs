// The sync engine's endpoints for the browser checks (#507): /api/sync/bootstrap
// and the /api/sync/ws socket. Routed on the page, they answer before a check's
// own `/api/**` handler on the context (and after one routed earlier on the page).
//
// By default bootstrap holds no models, so the pages read the check's REST
// mocks as before, and the socket stays open and quiet after `caught_up`.
// A check of the sync engine passes `models`, `lastSyncId` and `syncGroups`,
// then commits changes: `push` sends them over the open socket, `commit` only
// logs them, as when the socket is down; `drop` closes the socket, and the
// client's next socket gets what it missed from the log before `caught_up`.
//
// The sync hub runs in the page here (#498), not in its SharedWorker, so the routes reach it.
//
// It also answers the client API (/api/graphql, #509) with the check's REST mocks; see graphql-mock.mjs.
import { mockGraphqlAsRest } from './graphql-mock.mjs';

/** Routes the sync endpoints on a page; returns what a check drives them with. */
export async function mockSync(page, { models = {}, lastSyncId = 0, syncGroups = [] } = {}) {
  const state = {
    bootstraps: 0,
    /** Every socket opened, with the `since` it asked from. */
    sockets: [],
    /** Every change committed after bootstrap, as the server's change log. */
    log: [],
    lastSyncId,
  };
  await mockGraphqlAsRest(page);
  // A SharedWorker's requests and socket don't pass the page's routes: these checks run the
  // sync hub in the page, as a browser without SharedWorker does. shared-sync-browser.mjs checks the worker.
  await page.addInitScript(() => { window.buyerlySharedSync = false; });
  const delta = (actions) => JSON.stringify({ type: 'delta', actions, last_sync_id: actions[actions.length - 1].sync_id });
  await page.route('**/api/sync/bootstrap', (route) => {
    state.bootstraps += 1;
    return route.fulfill({ json: { last_sync_id: state.lastSyncId, sync_groups: syncGroups, models } });
  });
  await page.routeWebSocket('**/api/sync/ws**', (socket) => {
    const since = Number(new URL(socket.url()).searchParams.get('since'));
    state.sockets.push({ socket, since });
    const missed = state.log.filter((action) => action.sync_id > since);
    if (missed.length > 0) socket.send(delta(missed));
    socket.send(JSON.stringify({ type: 'caught_up', last_sync_id: Math.max(since, state.lastSyncId) }));
  });
  const commit = (actions) => {
    state.log.push(...actions);
    state.lastSyncId = Math.max(state.lastSyncId, ...actions.map((action) => action.sync_id));
  };
  return {
    state,
    commit,
    /** Commits changes and sends them over the newest socket, as the server does. */
    push(actions) {
      commit(actions);
      state.sockets[state.sockets.length - 1].socket.send(delta(actions));
    },
    /** Closes the newest socket: 4000 as a dropped connection, 4410 to ask for a bootstrap. */
    drop(code = 4000) {
      return state.sockets[state.sockets.length - 1].socket.close({ code, reason: 'dropped' });
    },
  };
}
