import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { BuyerlyCheckGlyph } from '@/icons/BuyerlyIcons';
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
          <BuyerlyIcon name="bell" size={16} />
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
              <BuyerlyIcon name="ad-accounts" size={14} />
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
                        <BuyerlyCheckGlyph />
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
