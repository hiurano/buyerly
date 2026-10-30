import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import { BuyerlyCheckGlyph, BuyerlyDeliveryIcon, type BuyerlyDeliveryState } from '@/icons/BuyerlyIcons';
import type { DeliveryControl } from '@/lib/delivery';
import { colors } from '@/styles/tokens.stylex';
import { deliveryStatus } from './campaignViewModel';
import { pickerStyles } from './pickerStyles';

const TOUCH = '@media (hover: none) and (pointer: coarse)';

/** What a buyer can set; every other state is Meta's to give. */
const CHOICES: { state: 'active' | 'paused'; label: string; key: string }[] = [
  { state: 'active', label: 'Active', key: '1' },
  { state: 'paused', label: 'Paused', key: '2' },
];

const styles = stylex.create({
  // The switch's old slot, at the icon's size: the 6px around it still takes the click.
  button: {
    position: 'relative',
    display: 'flex',
    height: 16,
    width: 16,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    borderWidth: 0,
    borderRadius: 4,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    outline: 'none',
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
    '::after': {
      content: '""',
      position: 'absolute',
      top: -6,
      right: -6,
      bottom: -6,
      left: -6,
    },
  },
  readOnly: {
    cursor: 'default',
  },
  busy: {
    cursor: 'progress',
    opacity: 0.5,
  },
  // Linear's status menu is narrower than its label picker.
  popover: {
    width: 207,
    minWidth: 207,
  },
  option: {
    height: {
      default: 32,
      [TOUCH]: 44,
    },
  },
  iconSlot: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    width: 14,
    height: 14,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 1,
  },
  // Above the option's highlight, as the label picker's label.
  name: {
    position: 'relative',
    zIndex: 1,
    marginLeft: 9,
  },
  trailing: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
  },
  check: {
    display: 'flex',
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    color: colors['--text-primary'],
  },
  key: {
    minWidth: 7,
    fontFamily: 'inherit',
    fontSize: 11,
    color: colors['--text-tertiary'],
  },
});

/**
 * The state a row shows: Meta's delivery, unless this session just set it
 * otherwise and the snapshot has not caught up yet.
 */
export function rowDeliveryState(
  status: 'active' | 'paused' | 'unknown',
  effectiveStatus: string | undefined,
  delivery?: DeliveryControl,
): BuyerlyDeliveryState {
  if (delivery && delivery.status !== status) return delivery.status;
  return deliveryStatus({ status, effectiveStatus }) as BuyerlyDeliveryState;
}

/** Fingers get taller rows and no keyboard popping up over the list. */
const isCoarsePointer = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(hover: none) and (pointer: coarse)').matches;

interface DeliveryStatusControlProps {
  /** Singular noun for labels, e.g. "ad set". */
  noun: string;
  state: BuyerlyDeliveryState;
  /** Meta's words for the state, e.g. "Campaign paused". */
  statusLabel: string;
  /** Present when the row may really change delivery in Meta. */
  delivery?: DeliveryControl;
  /** Why the icon is read-only, when it is not that the account gives no controls. */
  unavailableTitle?: string;
}

/**
 * A row's delivery as Linear's issue status: the state's icon, and with a
 * live control a click (or S over the row) opens "Change status…" with Active
 * and Paused, picked by click, arrows and Enter, or 1 and 2.
 */
export const DeliveryStatusControl: React.FC<DeliveryStatusControlProps> = ({ noun, state, statusLabel, delivery, unavailableTitle }) => {
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const icon = <BuyerlyDeliveryIcon state={state} />;

  if (!delivery) {
    const controlLabel = noun.charAt(0).toUpperCase() + noun.slice(1);
    return (
      <span
        {...stylex.props(styles.button, styles.readOnly)}
        title={unavailableTitle ?? `${statusLabel}. ${controlLabel} controls are not available for this account`}
        aria-label={statusLabel}
        role="img"
      >
        {icon}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        data-delivery-status={state}
        aria-label={`Change status, ${statusLabel}`}
        aria-haspopup="dialog"
        aria-expanded={anchorRect !== null}
        title={statusLabel}
        disabled={delivery.busy}
        onClick={(event) => {
          event.stopPropagation();
          setAnchorRect(event.currentTarget.getBoundingClientRect());
        }}
        {...stylex.props(styles.button, delivery.busy && styles.busy)}
      >
        {icon}
      </button>
      {anchorRect && (
        <DeliveryStatusMenu
          anchorRect={anchorRect}
          current={delivery.status}
          onPick={(next) => {
            setAnchorRect(null);
            if (next !== delivery.status) delivery.onChange(next === 'active');
          }}
          onClose={() => setAnchorRect(null)}
        />
      )}
    </>
  );
};

const DeliveryStatusMenu: React.FC<{
  anchorRect: DOMRect;
  current: 'active' | 'paused';
  onPick: (next: 'active' | 'paused') => void;
  onClose: () => void;
}> = ({ anchorRect, current, onPick, onClose }) => {
  const [query, setQuery] = useState('');
  const shown = CHOICES.filter((choice) => choice.label.toLowerCase().includes(query.trim().toLowerCase()));
  // Opens on the current state, as Linear's.
  const [activeIndex, setActiveIndex] = useState(() => CHOICES.findIndex((choice) => choice.state === current));
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isCoarsePointer()) return;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(focusTimer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) onClose();
    };
    // Escape, and 1 or 2 before the search has focus: "S 2" typed in one go, as in Linear.
    const handleKey = (event: KeyboardEvent) => {
      const byKey = CHOICES.find((choice) => choice.key === event.key);
      if (event.key !== 'Escape' && !byKey) return;
      event.preventDefault();
      event.stopPropagation();
      if (byKey) onPick(byKey.state);
      else onClose();
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('keydown', handleKey, true);
    };
  }, [onClose, onPick]);

  const width = 207;
  const margin = 8;
  const height = 44 + CHOICES.length * 44 + 8;
  const left = Math.min(anchorRect.left - 1, window.innerWidth - width - margin);
  const top = anchorRect.bottom + height + margin > window.innerHeight
    ? Math.max(margin, anchorRect.top - height - 4)
    : anchorRect.bottom + 4;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((index) => (shown.length === 0 ? -1 : (Math.max(index, 0) + step + shown.length) % shown.length));
    } else if (event.key === 'Enter' && shown[activeIndex]) {
      event.preventDefault();
      onPick(shown[activeIndex].state);
    }
  };

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Change status"
      tabIndex={-1}
      data-animated-popover-container="true"
      data-menu-active="true"
      {...stylex.props(pickerStyles.popover, styles.popover)}
      style={{ left, top, transformOrigin: '8px 0' }}
      onClick={(event) => event.stopPropagation()}
    >
      <form autoComplete="off" onSubmit={(event) => event.preventDefault()} {...stylex.props(pickerStyles.search)}>
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Change status…"
          aria-label="Change status…"
          aria-controls="delivery-status-list"
          aria-activedescendant={shown[activeIndex] ? `delivery-status-${shown[activeIndex].state}` : undefined}
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          {...stylex.props(pickerStyles.input)}
        />
        <kbd {...stylex.props(pickerStyles.shortcut)}>S</kbd>
      </form>
      <div id="delivery-status-list" role="listbox" {...stylex.props(pickerStyles.listbox)}>
        <ul role="presentation" {...stylex.props(pickerStyles.list)}>
          {shown.map((choice, index) => (
            <li
              key={choice.state}
              id={`delivery-status-${choice.state}`}
              role="option"
              aria-selected={choice.state === current}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onPick(choice.state)}
              {...stylex.props(pickerStyles.option, styles.option)}
            >
              <div aria-hidden="true" {...stylex.props(pickerStyles.highlight, index === activeIndex && pickerStyles.highlightActive)} />
              <span {...stylex.props(styles.iconSlot)}><BuyerlyDeliveryIcon state={choice.state} /></span>
              <span {...stylex.props(pickerStyles.name, styles.name)}>{choice.label}</span>
              <span {...stylex.props(styles.trailing)}>
                {choice.state === current && <span {...stylex.props(styles.check)}><BuyerlyCheckGlyph /></span>}
                <kbd {...stylex.props(styles.key)}>{choice.key}</kbd>
              </span>
            </li>
          ))}
          {shown.length === 0 && <li {...stylex.props(pickerStyles.empty)}>No statuses found</li>}
        </ul>
      </div>
    </div>,
    document.body,
  );
};
