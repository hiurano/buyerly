import React from 'react';
import * as stylex from '@stylexjs/stylex';
import type { DeliveryControl } from '@/lib/delivery';
import { colors } from '@/styles/tokens.stylex';
import { withClassName } from '@/ui/withClassName';
import { DeliveryStatusControl, rowDeliveryState } from './DeliveryStatusControl';
import css from './AdsManagerCard.module.css';

const styles = stylex.create({
  // The card, as Linear's issue card: its surface, its states and the 8px gap between its parts.
  card: {
    display: 'flex',
    width: '100%',
    flexDirection: 'column',
    gap: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: {
      default: colors['--card-bg'],
      ':hover': colors['--item-hover-bg'],
      '[data-selected]': colors['--item-active-bg'],
    },
    boxShadow: {
      default: `0 0 0 0.5px ${colors['--board-card-ring']}, ${colors['--canvas-shadow']}`,
      ':focus-visible': `0 0 0 1px ${colors['--focus-ring-color']}, ${colors['--canvas-shadow']}`,
      '[data-selected]': `0 0 0 1px ${colors['--color-border-secondary']}, ${colors['--canvas-shadow']}`,
      '[data-selected]:focus-visible': `0 0 0 1px ${colors['--focus-ring-color']}, ${colors['--canvas-shadow']}`,
    },
    opacity: {
      default: null,
      '[data-busy]': 0.6,
    },
    cursor: {
      default: 'pointer',
      '[data-busy]': 'progress',
    },
    textAlign: 'left',
    outlineStyle: 'none',
    userSelect: 'none',
    transition: 'background-color 0.1s ease',
  },
  // The card's properties, as Linear's 24px chips.
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  chip: {
    display: 'inline-flex',
    maxWidth: '100%',
    height: 24,
    alignItems: 'center',
    gap: 5,
    padding: '0 8px',
    borderWidth: 1,
    borderColor: colors['--rules-property-border'],
    borderRadius: 9999,
    backgroundColor: colors['--rules-property-bg'],
    fontSize: 12,
    fontWeight: 450,
    color: colors['--rules-property-text'],
    whiteSpace: 'nowrap',
  },
  chipLabel: {
    color: colors['--text-tertiary'],
  },
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

interface CardFigure {
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
  /** Meta's `effective_status`, which the status icon shows. */
  effectiveStatus?: string;
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
  effectiveStatus,
  statusLabel,
  delivery,
  chips,
  figures,
  selected,
  busy = false,
  onToggleSelected,
}) => {
  const control = delivery && delivery !== 'read-only' ? delivery : undefined;
  // Linear's status icon has a shape for every state, unknown too.
  const showSwitch = Boolean(delivery);
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
      {...stylex.props(styles.card)}
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
            // The status acts on Meta; it never selects the card.
            <span onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
              <DeliveryStatusControl
                noun={noun}
                state={rowDeliveryState(status, effectiveStatus, control)}
                statusLabel={statusLabel}
                delivery={control}
              />
            </span>
          )}
        </div>
      )}
      <span
        {...stylex.props(styles.name)}
        title={name}
      >
        {name}
      </span>
      {chips.length > 0 && (
        <div {...stylex.props(styles.chips)}>
          {chips.map((chip) => (
            <span key={chip.key} {...withClassName(stylex.props(styles.chip), css.chip)} title={chip.label}>
              {chip.icon && <span {...stylex.props(styles.chipIcon)} aria-hidden="true">{chip.icon}</span>}
              <span>{chip.label}</span>
            </span>
          ))}
        </div>
      )}
      {figures.length > 0 && (
        <div {...stylex.props(styles.chips)}>
          {figures.map((figure) => (
            <span key={figure.key} {...withClassName(stylex.props(styles.chip), css.chip)}>
              <span {...stylex.props(styles.chipLabel)}>{figure.label}</span>
              <span>{figure.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
