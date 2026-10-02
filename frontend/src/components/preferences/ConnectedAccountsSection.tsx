import React, { useEffect, useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { createTelegramLink, disconnectTelegram, telegramAccountName } from '@/lib/telegram';
import { LinearArrowUpRightIcon, TelegramIcon } from '@/icons/LinearIcons';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/DropdownMenu';
import { Tooltip } from '@/ui/Tooltip';
import { toast } from '@/ui/toast';
import { useTelegramConnection } from './NotificationsSection';

/** How often the page asks whether Start was pressed, and for how long (the link's life). */
const LINK_POLL_MS = 2000;
const LINK_LIFETIME_MS = 10 * 60 * 1000;

/**
 * Settings → Connected accounts, as in Linear: one card per app with Connect ↗,
 * and once connected "Connected ↗" with a menu to disconnect. Telegram stands
 * where Linear has Slack.
 */
export const ConnectedAccountsSection: React.FC = () => {
  const connection = useTelegramConnection();
  const { loadTelegramConnection, setTelegramConnection, loadNotificationChannels } = useAppStore();
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
    } finally {
      setBusy(false);
    }
  };

  const account = connection.connected ? telegramAccountName(connection) : null;
  const button = (label: string, props: React.ButtonHTMLAttributes<HTMLButtonElement> = {}) => (
    <button type="button" className="preferences-connect-button" {...props}>
      {label}
      <LinearArrowUpRightIcon size={16} />
    </button>
  );

  return (
    <>
      <div className="preferences-title-container preferences-title-container--with-note">
        <h1 className="preferences-page-title">Connected accounts</h1>
        <p className="preferences-page-note">Connect your user accounts to receive notifications in other apps</p>
      </div>
      <div className="preferences-section">
        <section className="preferences-card-container" id="connection-telegram">
          <div className="preferences-row-item preferences-connection-row">
            <span className="preferences-connection-main">
              <span className="preferences-channel-icon">
                <TelegramIcon size={16} />
              </span>
              <span className="preferences-row-copy preferences-connection-copy">
                <span className="preferences-connection-title">
                  <span className="preferences-row-title">
                    Telegram
                    {account && <span className="preferences-connection-account"> · {account}</span>}
                  </span>
                  {connection.connected && connection.error && (
                    <Tooltip
                      content="The bot is blocked, so notifications can't be delivered. Unblock it in Telegram and press Start."
                      side="top"
                    >
                      <span className="preferences-connection-alert" aria-label="Notifications can't be delivered">
                        <TriangleAlert size={14} aria-hidden="true" />
                      </span>
                    </Tooltip>
                  )}
                </span>
                <span className="preferences-row-desc">Receive notifications in Telegram</span>
              </span>
            </span>
            {connection.connected ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>{button('Connected')}</DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setConfirmOpen(true)}>
                    Disconnect personal Telegram account
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : connection.available ? (
              button('Connect', { onClick: () => void connect() })
            ) : (
              <Tooltip content="Telegram is not set up on this server yet" side="top">
                <span>{button('Connect', { disabled: true })}</span>
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
