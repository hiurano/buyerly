import type { SyncSocketMessage } from '@buyerly/shared';
import WebSocket from 'ws';
import type { Browser } from './browser.ts';
import type { Target } from './target.ts';

// A WebSocket client for the sync stream's contract tests
// (tests/test_sync_stream.py Socket): messages are queued as they come, and
// a close is reported by the next receive().

export class SocketClosed extends Error {
  constructor(
    readonly code: number,
    readonly reason: string,
  ) {
    super(`closed ${code} ${reason}`);
    this.name = 'SocketClosed';
  }
}

export class HandshakeRefused extends Error {
  constructor(readonly status: number) {
    super(`handshake refused with ${status}`);
    this.name = 'HandshakeRefused';
  }
}

export class TestSocket {
  private readonly messages: SyncSocketMessage[] = [];
  private closed: SocketClosed | null = null;
  private waiter: (() => void) | null = null;
  // Set-Cookie of the 101 response.
  setCookies: string[] = [];

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (data) => {
      this.messages.push(JSON.parse(textOf(data)) as SyncSocketMessage);
      this.waiter?.();
    });
    socket.on('close', (code, reason) => {
      this.closed = new SocketClosed(code, reason.toString());
      this.waiter?.();
    });
    socket.on('error', () => {});
  }

  static async open(url: string, headers: Record<string, string>): Promise<TestSocket> {
    const socket = new WebSocket(url, { headers, perMessageDeflate: false });
    const client = new TestSocket(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('upgrade', (response) => {
        const cookies = response.headers['set-cookie'];
        client.setCookies = cookies ?? [];
      });
      socket.once('open', () => resolve());
      socket.once('unexpected-response', (_request, response) => {
        reject(new HandshakeRefused(response.statusCode ?? 0));
        response.resume();
        socket.terminate();
      });
      socket.once('error', reject);
    });
    return client;
  }

  // The next message; throws SocketClosed once the server closed and nothing is left.
  async receive(timeoutMs = 5000): Promise<SyncSocketMessage> {
    const deadline = Date.now() + timeoutMs;
    while (!this.messages.length) {
      if (this.closed) throw this.closed;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`No message within ${timeoutMs} ms`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left);
        this.waiter = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      this.waiter = null;
    }
    return this.messages.shift()!;
  }

  // The next message of a type, skipping heartbeats; others fail the test.
  async receiveType<T extends SyncSocketMessage['type']>(type: T, timeoutMs = 5000): Promise<Extract<SyncSocketMessage, { type: T }>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const message = await this.receive(Math.max(1, deadline - Date.now()));
      if (message.type === type) return message as Extract<SyncSocketMessage, { type: T }>;
      if (message.type !== 'ping') throw new Error(`Expected ${type}, got ${JSON.stringify(message)}`);
    }
  }

  // The close the server sends next, ignoring messages before it.
  async closedWith(timeoutMs = 5000): Promise<SocketClosed> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        await this.receive(Math.max(1, deadline - Date.now()));
      } catch (error) {
        if (error instanceof SocketClosed) return error;
        throw error;
      }
    }
  }

  // Whether nothing but heartbeats came within `ms`.
  async silent(ms: number): Promise<boolean> {
    const deadline = Date.now() + ms;
    for (;;) {
      const left = deadline - Date.now();
      if (left <= 0) return true;
      try {
        const message = await this.receive(left);
        if (message.type !== 'ping') return false;
      } catch (error) {
        if (error instanceof SocketClosed) return false;
        return true;
      }
    }
  }

  send(message: unknown): void {
    this.socket.send(JSON.stringify(message));
  }

  close(): Promise<void> {
    if (this.closed) return Promise.resolve();
    return new Promise((resolve) => {
      this.socket.once('close', () => resolve());
      this.socket.close(1000);
    });
  }
}

// Opens /api/sync/ws as the browser's page would: its cookies, its address, the query.
export async function openSocket(
  target: Target,
  browser: Browser | null,
  query: Record<string, string | number>,
  headers: Record<string, string> = {},
): Promise<TestSocket> {
  const params = new URLSearchParams(Object.entries(query).map(([name, value]): [string, string] => [name, String(value)]));
  const url = await target.socketUrl(`/api/sync/ws${params.size ? `?${params.toString()}` : ''}`);
  const sent: Record<string, string> = { 'user-agent': 'Buyerly contract test', ...headers };
  if (browser) {
    sent['x-forwarded-for'] = browser.address;
    if (browser.cookies.size && !('cookie' in headers)) sent.cookie = [...browser.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
  return TestSocket.open(url, sent);
}

// A text frame's payload as ws hands it over: a Buffer, or its fragments.
function textOf(data: Buffer | ArrayBuffer | Buffer[]): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data as ArrayBuffer).toString('utf8');
}
