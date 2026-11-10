import React, { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { createTelegramLink, disconnectTelegram, telegramAccountName } from '@/lib/telegram';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/DropdownMenu';
import { Tooltip } from '@/ui/Tooltip';
import { toast } from '@/ui/toast';
import { useTelegramConnection } from './NotificationsSection';
import { useNotificationSettingsStore } from '@/models/notificationSettingsStore';
import { preferencesStyles } from './preferencesStyles';

/** How often the page asks whether Start was pressed, and for how long (the link's life). */
const LINK_POLL_MS = 2000;
const LINK_LIFETIME_MS = 10 * 60 * 1000;

/**
 * Settings → Connected accounts, as in Linear: one card per app with Connect ↗,
 * and once connected "Connected ↗" with a menu to disconnect. Telegram stands
 * where Linear has Slack.
 */
/** A Connect / Connected button; takes a trigger's ref and props through (React 19's ref prop). */
const ConnectButton = ({ label, ...props }: { label: string } & React.ComponentProps<'button'>) => (
  <button type="button" {...stylex.props(preferencesStyles.connectButton)} {...props}>
    {label}
    <BuyerlyIcon name="external" size={16} />
  </button>
);

export const ConnectedAccountsSection: React.FC = () => {
  const connection = useTelegramConnection();
  const loadTelegramConnection = useNotificationSettingsStore((state) => state.loadTelegramConnection);
  const setTelegramConnection = useNotificationSettingsStore((state) => state.setTelegramConnection);
  const loadNotificationChannels = useNotificationSettingsStore((state) => state.loadNotificationChannels);
  const [waitingSince, setWaitingSince] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wasConnected = useRef(connection.connected);

  // After Connect, watch for the person pressing Start in Telegram.
  useEffect(() => {
    if (waitingSince === null) return undefined;
    const timer = window.setInterval(() => {
      if (Date.now() - waitingSince > LINK_LIFETIME_MS) {
        setWaitingSince(null);
        return;
      }
      void loadTelegramConnection().catch(() => {});
    }, LINK_POLL_MS);
    return () => window.clearInterval(timer);
  }, [waitingSince, loadTelegramConnection]);

  useEffect(() => {
    if (connection.connected && !wasConnected.current) {
      setWaitingSince(null);
      // Connecting switched the Telegram channel on.
      void loadNotificationChannels(true);
    }
    wasConnected.current = connection.connected;
  }, [connection.connected, loadNotificationChannels]);

  const connect = async () => {
    // Opened now, while the click still counts, so the browser does not block it.
    const opened = window.open('', '_blank');
    try {
      const url = await createTelegramLink();
      if (opened) {
        opened.opener = null;
        opened.location.href = url;
      } else {
        window.location.href = url;
      }
      setWaitingSince(Date.now());
    } catch (error) {
      opened?.close();
      toast.error("Couldn't connect Telegram", error instanceof Error ? error.message : undefined);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      setTelegramConnection(await disconnectTelegram());
      setConfirmOpen(false);
      toast.show({
        tone: 'info',
        title: 'Disabled Telegram integration',
        description: 'You will no longer receive personal Telegram notifications.',
      });
    } catch (error) {
      toast.error("Couldn't disconnect Telegram", error instanceof Error ? error.message : undefined);
    }
    setBusy(false);
  };

  const account = connection.connected ? telegramAccountName(connection) : null;

  return (
    <>
      <div {...stylex.props(preferencesStyles.titleContainer, preferencesStyles.titleContainerWithNote)}>
        <h1 {...stylex.props(preferencesStyles.pageTitle)}>Connected accounts</h1>
        <p {...stylex.props(preferencesStyles.pageNote)}>Connect your user accounts to receive notifications in other apps</p>
      </div>
      <div {...stylex.props(preferencesStyles.section)}>
        <section {...stylex.props(preferencesStyles.cardContainer)} id="connection-telegram">
          <div {...stylex.props(preferencesStyles.rowItem, preferencesStyles.connectionRow)}>
            <span {...stylex.props(preferencesStyles.connectionMain)}>
              <span {...stylex.props(preferencesStyles.channelIcon)}>
                <BuyerlyIcon name="telegram" size={16} />
              </span>
              <span {...stylex.props(preferencesStyles.rowCopy)}>
                <span {...stylex.props(preferencesStyles.connectionTitle)}>
                  <span {...stylex.props(preferencesStyles.rowTitle)}>
                    Telegram
                    {account && <span {...stylex.props(preferencesStyles.connectionAccount)}> · {account}</span>}
                  </span>
                  {connection.connected && connection.error && (
                    <Tooltip
                      content="The bot is blocked, so notifications can't be delivered. Unblock it in Telegram and press Start."
                      side="top"
                    >
                      <span {...stylex.props(preferencesStyles.connectionAlert)} aria-label="Notifications can't be delivered">
                        <BuyerlyIcon name="warning" size={14} aria-hidden="true" />
                      </span>
                    </Tooltip>
                  )}
                </span>
                <span {...stylex.props(preferencesStyles.rowDesc, preferencesStyles.connectionRowDesc)}>Receive notifications in Telegram</span>
              </span>
            </span>
            {connection.connected ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><ConnectButton label="Connected" /></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setConfirmOpen(true)}>
                    Disconnect personal Telegram account
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : connection.available ? (
              <ConnectButton label="Connect" onClick={() => void connect()} />
            ) : (
              <Tooltip content="Telegram is not set up on this server yet" side="top">
                <span><ConnectButton label="Connect" disabled /></span>
              </Tooltip>
            )}
          </div>
        </section>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Disconnect personal Telegram account?"
        confirmLabel="Disconnect"
        tone="primary"
        busy={busy}
        onConfirm={() => void disconnect()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
};
