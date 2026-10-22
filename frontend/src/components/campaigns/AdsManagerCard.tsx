import React from 'react';
import type { DeliveryControl } from '@/lib/delivery';
import { BuyerlyToggle } from '@/ui/BuyerlyToggle';

export interface CardChip {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

export interface CardFigure {
  key: string;
  label: string;
  value: string;
}

interface AdsManagerCardProps {
  id: string;
  name: string;
  /** Meta's ID on top, as Linear's issue ID; absent when Display properties turns it off. */
  identifier?: string;
  /** Singular noun for the switch's tooltip, e.g. "ad set". */
  noun: string;
  status: 'active' | 'paused' | 'unknown';
  statusLabel: string;
  /** Present when the Status switch shows; without `delivery.onChange` it only reads. */
  delivery?: DeliveryControl | 'read-only';
  chips: CardChip[];
  figures: CardFigure[];
  selected: boolean;
  /** A write to Meta is on its way: the card waits, dimmed, until it lands. */
  busy?: boolean;
  onToggleSelected: () => void;
}

/**
 * A campaign, ad set or ad on the board, as Linear's issue card: the ID with
 * the Status switch where Linear puts the assignee, the name, then the
 * Display properties as chips — the parents and rules, then each figure.
 */
export const AdsManagerCard: React.FC<AdsManagerCardProps> = ({
  id,
  name,
  identifier,
  noun,
  status,
  statusLabel,
  delivery,
  chips,
  figures,
  selected,
  busy = false,
  onToggleSelected,
}) => {
  const dimmed = status === 'paused';
  const control = delivery && delivery !== 'read-only' ? delivery : undefined;
  const showSwitch = Boolean(delivery) && status !== 'unknown';
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={name}
      data-row-id={id}
      data-selected={selected || undefined}
      data-busy={busy || undefined}
      aria-busy={busy || undefined}
      className="buyerly-board-card"
      onClick={onToggleSelected}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggleSelected();
        }
      }}
    >
      {(identifier || showSwitch) && (
        <div className="flex h-5 items-center justify-between gap-2">
          <span className="truncate text-[12px] font-[450] tracking-[-0.24px] text-[var(--text-tertiary)]">{identifier}</span>
          {showSwitch && (
            // The switch acts on Meta; it never selects the card.
            <span onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
              <BuyerlyToggle
                checked={control ? control.status === 'active' : status === 'active'}
                busy={control?.busy}
                onChange={control?.onChange}
                disabled={!control}
                tooltipContent={control
                  ? (control.status === 'active' ? `Turn this ${noun} off` : `Turn this ${noun} on`)
                  : `${statusLabel}. Controls are not available for this account`}
              />
            </span>
          )}
        </div>
      )}
      <span
        className="line-clamp-2 block text-[13px] font-medium leading-4"
        style={{ color: dimmed ? 'var(--text-tertiary)' : 'var(--text-primary)' }}
        title={name}
      >
        {name}
      </span>
      {chips.length > 0 && (
        <div className="buyerly-board-chips">
          {chips.map((chip) => (
            <span key={chip.key} className="buyerly-board-chip" title={chip.label}>
              {chip.icon && <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center" aria-hidden="true">{chip.icon}</span>}
              <span>{chip.label}</span>
            </span>
          ))}
        </div>
      )}
      {figures.length > 0 && (
        <div className="buyerly-board-chips">
          {figures.map((figure) => (
            <span key={figure.key} className="buyerly-board-chip">
              <span className="buyerly-board-chip-label">{figure.label}</span>
              <span>{figure.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
