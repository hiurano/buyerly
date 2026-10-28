import { graphql } from './graphql';

/**
 * Settings → Notifications → Desktop (#503), as Linear's: browser notifications
 * through the service worker (sw/sw.ts), even while no tab is open. Turning the
 * channel on asks for the browser's permission, subscribes this browser to Web
 * Push with the server's key and hands the subscription to the server; turning
 * it off forgets this browser. Logging out ends it on the server.
 */
export interface DesktopNotificationsState {
  /** The server can send them (it has a VAPID key) and this browser can show them. */
  available: boolean;
  /** The browser's choice: 'denied' blocks the channel until changed in its site settings. */
  permission: NotificationPermission;
  /** This browser gets the member's desktop notifications. */
  subscribed: boolean;
}

export const NO_DESKTOP_NOTIFICATIONS: DesktopNotificationsState = {
  available: false,
  permission: 'default',
  subscribed: false,
};

interface DesktopPayload { available: boolean; public_key: string | null; subscribed: boolean; browser_in_use?: boolean }

function browserSupports(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function permission(): NotificationPermission {
  return browserSupports() ? Notification.permission : 'default';
}

/** The worker's registration; none in the dev server, which registers no worker. */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!browserSupports()) return null;
  return (await navigator.serviceWorker.getRegistration('/')) ?? null;
}

async function browserSubscription(): Promise<PushSubscription | null> {
  return (await (await registration())?.pushManager.getSubscription()) ?? null;
}

function decodeKey(key: string): Uint8Array<ArrayBuffer> {
  const base64 = (key + '='.repeat((4 - (key.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function sameKey(subscription: PushSubscription, key: Uint8Array): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((byte, index) => byte === key[index]);
}

async function fetchState(endpoint: string | null): Promise<DesktopPayload> {
  return graphql<DesktopPayload>(
    'query DesktopNotifications($endpoint: String) { desktopNotifications(endpoint: $endpoint) }',
    { endpoint },
  );
}

function stateFrom(payload: DesktopPayload, hasRegistration: boolean): DesktopNotificationsState {
  return {
    available: payload.available && Boolean(payload.public_key) && hasRegistration,
    permission: permission(),
    subscribed: payload.subscribed,
  };
}

export async function fetchDesktopNotifications(): Promise<DesktopNotificationsState> {
  const worker = await registration();
  const subscription = (await worker?.pushManager.getSubscription()) ?? null;
  return stateFrom(await fetchState(subscription?.endpoint ?? null), worker !== null);
}

/**
 * Asks for permission (only now, as in Linear), subscribes this browser and
 * tells the server, which turns the channel on. Without permission nothing changes.
 */
export async function turnOnDesktopNotifications(): Promise<DesktopNotificationsState> {
  const worker = await registration();
  const { public_key: publicKey } = await fetchState(null);
  if (!worker || !publicKey) return { ...NO_DESKTOP_NOTIFICATIONS, permission: permission() };
  const answer = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (answer !== 'granted') return { available: true, permission: answer, subscribed: false };
  const key = decodeKey(publicKey);
  let subscription = await worker.pushManager.getSubscription();
  // Subscribed with another server key (a key change): that one can never be sent to.
  if (subscription && !sameKey(subscription, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const saved = await graphql<{ desktopNotifications: DesktopPayload }>(
    `mutation DesktopNotificationsSubscribe($input: JSON!) {
      desktopNotificationsSubscribe(input: $input) { success lastSyncId desktopNotifications }
    }`,
    { input: subscription.toJSON() },
  );
  return stateFrom(saved.desktopNotifications, true);
}

/** This browser stops getting them; its push subscription ends unless another account here uses it. */
export async function turnOffDesktopNotifications(): Promise<DesktopNotificationsState> {
  const subscription = await browserSubscription();
  if (!subscription) return { available: true, permission: permission(), subscribed: false };
  const saved = await graphql<{ desktopNotifications: DesktopPayload }>(
    `mutation DesktopNotificationsUnsubscribe($input: JSON!) {
      desktopNotificationsUnsubscribe(input: $input) { success lastSyncId desktopNotifications }
    }`,
    { input: { endpoint: subscription.endpoint } },
  );
  if (!saved.desktopNotifications.browser_in_use) await subscription.unsubscribe().catch(() => false);
  return stateFrom(saved.desktopNotifications, true);
}
