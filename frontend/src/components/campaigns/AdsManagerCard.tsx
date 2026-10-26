import React from 'react';
import * as stylex from '@stylexjs/stylex';
import type { DeliveryControl } from '@/lib/delivery';
import { BuyerlyToggle } from '@/ui/BuyerlyToggle';
import { colors } from '@/styles/tokens.stylex';

const styles = stylex.create({
  // The ID and the Status switch, as Linear's issue ID and assignee.
  top: {
    display: 'flex',
    height: 20,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  identifier: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 12,
    fontWeight: 450,
    letterSpacing: '-0.24px',
    color: colors['--text-tertiary'],
  },
  name: {
    display: 'block',
    overflow: 'hidden',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: '16px',
    color: colors['--text-primary'],
  },
  nameDimmed: {
    color: colors['--text-tertiary'],
  },
  chipIcon: {
    display: 'flex',
    height: 14,
    width: 14,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

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
        <div {...stylex.props(styles.top)}>
          <span {...stylex.props(styles.identifier)}>{identifier}</span>
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
        {...stylex.props(styles.name, dimmed && styles.nameDimmed)}
        title={name}
      >
        {name}
      </span>
      {chips.length > 0 && (
        <div className="buyerly-board-chips">
          {chips.map((chip) => (
            <span key={chip.key} className="buyerly-board-chip" title={chip.label}>
              {chip.icon && <span {...stylex.props(styles.chipIcon)} aria-hidden="true">{chip.icon}</span>}
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
