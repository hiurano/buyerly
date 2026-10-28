import { databaseName } from './localDatabase';
import { browserEnvironment, SyncHost } from './syncHub';
import type { HubMessage, TabMessage } from './syncProtocol';

/**
 * A tab's line to its workspace's sync hub (#498): the SharedWorker every tab
 * of the workspace shares, opened by the workspace's name, or a hub in the tab
 * itself where the browser has no SharedWorker (Chrome on Android) or its
 * worker can't start.
 *
 * Every few seconds the tab pings the worker; one that didn't answer the last
 * ping is gone (it crashed or was ended), and the tab opens another one and
 * joins it again (`onRestart`).
 */

/** How often a tab asks whether its worker is still there. */
export const PING_MS = 10_000;

/** This tab, as the hubs know it. */
export const tabId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

interface Channel {
  post(message: TabMessage): void;
  close(): void;
}

/** The hub of a tab without a SharedWorker: one per tab, as before (#507). */
let pageHost: SyncHost | null = null;

function inPage(receive: (message: HubMessage) => void): Channel {
  pageHost ??= new SyncHost(browserEnvironment());
  const host = pageHost;
  let open = true;
  const peer = { post: (message: HubMessage) => { if (open) receive(message); } };
  // Straight through, with no message in between: what the tab asks is sent in the same task, as before.
  return {
    post: (message) => host.receive(peer, message),
    close: () => { open = false; },
  };
}

/** The browser has SharedWorker; checks turn it off with `buyerlySharedSync = false` before the app loads. */
export const sharedWorkerAvailable = () => typeof SharedWorker === 'function'
  && (globalThis as { buyerlySharedSync?: boolean }).buyerlySharedSync !== false;

export class HubLink {
  readonly #scope: string;
  readonly #receive: (message: HubMessage) => void;
  readonly #onRestart: () => void;
  #channel: Channel | null = null;
  /** Posted before the worker's module was loaded. */
  #queued: TabMessage[] = [];
  #shared: boolean;
  #closed = false;
  #heartbeat: ReturnType<typeof setInterval> | null = null;
  #answered = true;

  constructor(scope: string, receive: (message: HubMessage) => void, onRestart: () => void) {
    this.#scope = scope;
    this.#receive = receive;
    this.#onRestart = onRestart;
    this.#shared = sharedWorkerAvailable();
    if (this.#shared) this.#openWorker();
    else this.#channel = inPage(receive);
  }

  /** Whether the hub is the shared worker's, for the checks. */
  get shared(): boolean {
    return this.#shared;
  }

  post(message: TabMessage) {
    if (this.#closed) return;
    if (this.#channel) this.#channel.post(message);
    else this.#queued.push(message);
  }

  close() {
    this.#closed = true;
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#heartbeat = null;
    this.#channel?.close();
    this.#channel = null;
    this.#queued = [];
  }

  #openWorker() {
    void import('./syncSharedWorker').then(({ openSharedWorker }) => {
      if (this.#closed) return;
      let worker: SharedWorker;
      try {
        worker = openSharedWorker(`buyerly-sync:${databaseName(this.#scope)}`);
      } catch {
        this.#fallBack();
        return;
      }
      const { port } = worker;
      const channel: Channel = { post: (message) => port.postMessage(message), close: () => port.close() };
      let heard = false;
      // A worker that never starts (its script failed) leaves the tab on a hub of its own.
      worker.onerror = () => {
        if (!heard && !this.#closed) this.#fallBack();
      };
      port.onmessage = (event: MessageEvent<HubMessage>) => {
        heard = true;
        if (this.#channel !== channel) return;
        if (event.data.type === 'pong') this.#answered = true;
        else this.#receive(event.data);
      };
      port.start();
      this.#channel = channel;
      this.#answered = true;
      for (const message of this.#queued.splice(0)) channel.post(message);
      if (this.#heartbeat === null) this.#heartbeat = setInterval(() => this.#ping(), PING_MS);
    }, () => this.#fallBack());
  }

  #ping() {
    if (!this.#channel || this.#closed) return;
    if (!this.#answered) {
      // The worker is gone: another one is opened and joined, and reads the local database again.
      this.#channel.close();
      this.#channel = null;
      this.#openWorker();
      this.#onRestart();
      return;
    }
    this.#answered = false;
    this.#channel.post({ type: 'ping', tab: tabId });
  }

  /** No SharedWorker after all: a hub in the tab, joined again as after a restart. */
  #fallBack() {
    if (this.#closed || !this.#shared) return;
    this.#shared = false;
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#heartbeat = null;
    this.#channel?.close();
    this.#channel = inPage(this.#receive);
    const queued = this.#queued.splice(0);
    if (queued.some((message) => message.type === 'join')) for (const message of queued) this.#channel.post(message);
    else this.#onRestart();
  }
}
