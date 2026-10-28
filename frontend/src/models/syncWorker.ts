import { browserEnvironment, PEER_TIMEOUT_MS, SyncHost } from './syncHub';
import type { HubMessage, TabMessage } from './syncProtocol';

/**
 * The SharedWorker every tab of a workspace shares (#498), as Linear's: it
 * holds the workspace's sync hub, so the tabs have one socket and one writer
 * of the local database between them. A tab opens it by the workspace's name
 * (syncTransport.ts); the browser ends it when the last tab is gone.
 */

// The app's TypeScript knows the DOM's globals, not a SharedWorker's: this is the one it needs.
const scope = globalThis as unknown as { onconnect: ((event: MessageEvent) => void) | null };

const host = new SyncHost(browserEnvironment());

scope.onconnect = (event) => {
  const port = event.ports[0];
  const peer = { post: (message: HubMessage) => port.postMessage(message) };
  port.onmessage = (message: MessageEvent<TabMessage>) => host.receive(peer, message.data);
  port.start();
};

// A tab that closed without a word (it crashed) is let go after a while.
setInterval(() => host.sweep(), PEER_TIMEOUT_MS / 5);
