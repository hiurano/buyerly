import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BuyerlyBellIcon, BuyerlyProjectIcon } from '@/icons/BuyerlyIcons';
import {
  ACCOUNT_NOTIFICATION_KINDS,
  ACCOUNT_NOTIFICATION_LABELS,
  loadAccountNotifications,
  saveAccountNotifications,
  type AccountNotificationKind,
} from '@/lib/accountNotifications';
import { toast } from '@/ui/toast';
import { Tooltip } from '@/ui/Tooltip';
import { useMenuExit } from '@/ui/useMenuExit';
import { BuyerlyToolbarButton } from '@/ui/BuyerlyToolbarButton';

const POPOVER_WIDTH = 334;

/**
 * Linear's bell on a project's header, for an ad account, measured on
 * 2026-10-24 in light and dark: a 28px round button with a 16px bell at the
 * header's end opens "Send inbox notifications for" the account, 4px under it
 * and flush with its right edge; one row per kind with a 14px checkbox. Each
 * click saves at once. Linear's Update schedule and Slack sections have no
 * counterpart here.
 */
export const BuyerlyAccountBell: React.FC<{ accountId: string; accountName: string }> = ({ accountId, accountName }) => {
  const [open, setOpen] = useState(false);
  const [kinds, setKinds] = useState<AccountNotificationKind[] | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const { isMounted, isClosing } = useMenuExit(open);
  // The last choice sent; an answer to an older one must not undo a newer click.
  const sent = useRef(0);

  useEffect(() => {
    setKinds(null);
    let live = true;
    loadAccountNotifications(accountId)
      .then((answer) => { if (live) setKinds(answer.kinds); })
      .catch(() => { if (live) setKinds([]); });
    return () => { live = false; };
  }, [accountId]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, left: Math.max(8, rect.right - POPOVER_WIDTH) });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!popoverRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  const toggle = (kind: AccountNotificationKind, on: boolean) => {
    if (!kinds) return;
    const before = kinds;
    const next = ACCOUNT_NOTIFICATION_KINDS.filter((item) => (item === kind ? on : kinds.includes(item)));
    setKinds(next);
    const request = ++sent.current;
    saveAccountNotifications(accountId, next)
      .then((answer) => { if (request === sent.current) setKinds(answer.kinds); })
      .catch((error) => {
        if (request === sent.current) setKinds(before);
        toast.error("Couldn't save notification settings", error instanceof Error ? error.message : undefined);
      });
  };

  return (
    <>
      <Tooltip content="Ad account notifications">
        <BuyerlyToolbarButton
          ref={buttonRef}
          placement="header"
          active={open}
          aria-label="Setup ad account notifications"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <BuyerlyBellIcon size={16} />
        </BuyerlyToolbarButton>
      </Tooltip>
      {isMounted && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Ad account notifications"
          className={`buyerly-bell-popover${isClosing ? ' buyerly-menu-exit' : ''}`}
          style={{ top: coords.top, left: coords.left }}
        >
          <section className="buyerly-bell-section">
            <h2 className="buyerly-bell-title">
              Send inbox notifications for
              <BuyerlyProjectIcon size={14} />
              <span className="buyerly-bell-name">{accountName}</span>
            </h2>
            <div className="buyerly-bell-rows">
              {ACCOUNT_NOTIFICATION_KINDS.map((kind) => {
                const id = `buyerly-bell-${kind}`;
                const checked = kinds?.includes(kind) ?? false;
                return (
                  <div key={kind} className="buyerly-bell-row">
                    <label htmlFor={id}>{ACCOUNT_NOTIFICATION_LABELS[kind]}</label>
                    <span className="buyerly-bell-box" data-checked={checked ? 'true' : 'false'}>
                      <input
                        id={id}
                        type="checkbox"
                        checked={checked}
                        disabled={kinds === null}
                        onChange={(event) => toggle(kind, event.target.checked)}
                      />
                      {checked && (
                        <svg width="10" height="9" viewBox="0 0 10 8" fill="currentColor" aria-hidden="true">
                          <path d="M3.46975 5.70757L1.88358 4.1225C1.65832 3.8974 1.29423 3.8974 1.06897 4.1225C0.843675 4.34765 0.843675 4.7116 1.06897 4.93674L3.0648 6.93117C3.29006 7.15628 3.65414 7.15628 3.8794 6.93117L8.93103 1.88306C9.15633 1.65792 9.15633 1.29397 8.93103 1.06883C8.70578 0.843736 8.34172 0.843724 8.11646 1.06879L3.46975 5.70757Z" />
                        </svg>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
};
