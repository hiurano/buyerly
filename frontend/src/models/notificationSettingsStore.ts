import {
  DEFAULT_NOTIFICATION_CHANNELS,
  fetchNotificationChannels,
  saveNotificationChannels,
  type ChannelNotifications,
  type NotificationChannel,
  type NotificationChannels,
} from '@/lib/notificationChannels';
import { NO_TELEGRAM_CONNECTION, fetchTelegramConnection, type TelegramConnection } from '@/lib/telegram';
import { scopeStore } from './scopeStore';
import { makeStore, useStore } from './store';

/** Settings → Notifications: each channel's choices and the Telegram connection, saved per member. */
export class NotificationSettingsStore {
  notificationChannels: NotificationChannels = DEFAULT_NOTIFICATION_CHANNELS;
  notificationChannelsLoaded = false;
  telegramConnection: TelegramConnection = NO_TELEGRAM_CONNECTION;
  telegramConnectionLoaded = false;
  #channelsSave: Promise<unknown> = Promise.resolve();

  constructor() {
    makeStore(this);
    scopeStore.onWorkspaceChange(() => {
      this.notificationChannels = DEFAULT_NOTIFICATION_CHANNELS;
      this.notificationChannelsLoaded = false;
      this.telegramConnection = NO_TELEGRAM_CONNECTION;
      this.telegramConnectionLoaded = false;
    });
  }

  /** `reload` fetches again, e.g. after connecting Telegram switched its channel on. */
  async loadNotificationChannels(reload = false) {
    const inScope = scopeStore.captureScope();
    if (reload) {
      // Let pending saves land first, so the fresh copy includes them.
      await this.#channelsSave;
      this.setChannelsLoaded(false);
    }
    let channels = DEFAULT_NOTIFICATION_CHANNELS;
    try {
      channels = await fetchNotificationChannels();
    } catch {
      // Settings still open, with Linear's defaults.
    }
    // A choice made while this was loading wins over the saved one.
    if (inScope() && !this.notificationChannelsLoaded) this.showChannels(channels);
  }

  setChannelNotifications(channel: NotificationChannel, patch: Partial<ChannelNotifications>) {
    const current = this.notificationChannels;
    this.setNotificationChannels({ [channel]: { ...current[channel], ...patch } });
  }

  setNotificationChannels(patch: Partial<NotificationChannels>) {
    const notificationChannels = { ...this.notificationChannels, ...patch };
    this.showChannels(notificationChannels);
    const inScope = scopeStore.captureScope();
    // Saved in order, like Display options, and never into a workspace opened since.
    this.#channelsSave = this.#channelsSave
      .then(() => (inScope() ? saveNotificationChannels(notificationChannels) : undefined))
      .catch(() => {
        // The choice still applies until the page is reloaded.
      });
  }

  async loadTelegramConnection(): Promise<TelegramConnection> {
    const inScope = scopeStore.captureScope();
    const connection = await fetchTelegramConnection();
    if (inScope()) this.setTelegramConnection(connection);
    return connection;
  }

  setTelegramConnection(connection: TelegramConnection) {
    this.telegramConnection = connection;
    this.telegramConnectionLoaded = true;
  }

  private setChannelsLoaded(loaded: boolean) {
    this.notificationChannelsLoaded = loaded;
  }

  private showChannels(channels: NotificationChannels) {
    this.notificationChannels = channels;
    this.notificationChannelsLoaded = true;
  }
}

export const notificationSettingsStore = new NotificationSettingsStore();

export const useNotificationSettingsStore = <T,>(select: (store: NotificationSettingsStore) => T): T =>
  useStore(notificationSettingsStore, select);
