import React, { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import * as stylex from '@stylexjs/stylex';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { formatSnoozedFor, formatSnoozeTime, matchesTyped, snoozeOptions } from '@/lib/inbox';
import { parseSnoozeQuery } from '@/lib/snoozeQuery';
import { colors } from '@/styles/tokens.stylex';
import { commandItemMarker } from '@/ui/markers.stylex';
import { withClassName } from '@/ui/withClassName';

const truncate = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

const styles = stylex.create({
  dialog: {
    position: 'fixed',
    left: 0,
    right: 0,
    top: '13vh',
    zIndex: 700,
    marginLeft: 'auto',
    marginRight: 'auto',
    width: 720,
    maxWidth: 'calc(100vw - 32px)',
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    backgroundColor: colors['--card-bg'],
    boxShadow: colors['--dropdown-shadow'],
    outline: '2px solid transparent',
    outlineOffset: 2,
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    marginTop: -1,
    marginRight: -1,
    marginBottom: -1,
    marginLeft: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  scope: {
    paddingLeft: 14,
    paddingRight: 14,
    paddingTop: 12,
  },
  // "Notification · …", the chip above the search.
  chip: {
    display: 'inline-flex',
    height: 22,
    maxWidth: '100%',
    alignItems: 'center',
    gap: 4,
    ...truncate,
    borderRadius: 6,
    backgroundColor: colors['--color-border-secondary'],
    paddingLeft: 6,
    paddingRight: 6,
    fontSize: 12,
    color: colors['--text-secondary'],
  },
  chipLabel: {
    color: colors['--text-tertiary'],
  },
  truncate,
  search: {
    paddingLeft: 6,
    paddingRight: 6,
  },
  input: {
    height: 40,
    width: '100%',
    backgroundColor: 'transparent',
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 13,
    color: colors['--text-primary'],
    outline: '2px solid transparent',
    outlineOffset: 2,
    '::placeholder': {
      color: colors['--text-muted'],
    },
  },
  list: {
    maxHeight: 'min(360px, 60vh)',
    overflowY: 'auto',
    paddingBottom: 5,
    paddingTop: 6,
    userSelect: 'none',
  },
  item: {
    position: 'relative',
    display: 'flex',
    height: 46,
    cursor: 'pointer',
    alignItems: 'center',
    paddingLeft: 19,
    paddingRight: 21,
    fontSize: 13,
    fontWeight: 450,
    color: colors['--text-primary'],
    outline: '2px solid transparent',
    outlineOffset: 2,
  },
  // The selected row's rounded highlight, 7px in from the sides.
  highlight: {
    pointerEvents: 'none',
    position: 'absolute',
    left: 7,
    right: 7,
    top: 2,
    bottom: 2,
    borderRadius: 8,
    backgroundColor: {
      default: null,
      [stylex.when.ancestor('[data-selected="true"]', commandItemMarker)]: colors['--item-hover-bg'],
    },
  },
  label: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    color: colors['--text-tertiary'],
  },
  hint: {
    position: 'relative',
    zIndex: 10,
    flexShrink: 0,
    paddingLeft: 12,
    fontSize: 13,
    color: colors['--text-tertiary'],
  },
});

interface SnoozePaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "No longer blocked: AI-33 …" in Linear; the chip above the search. */
  notificationLabel: string;
  /** H says "Snooze notification until…", the header button the "Try: …" hint. */
  placeholder: string;
  /** Set when the notification is snoozed: Unsnooze then comes first. */
  snoozedUntil: string | null;
  onSnooze: (until: Date) => void;
  onCustom: () => void;
  onUnsnooze: () => void;
}

export const SNOOZE_SEARCH_HINT = 'Try: 4 pm, 2 days, in 5 weeks…';

interface Row {
  id: string;
  label: string;
  hint: string;
  icon?: React.ReactNode;
  onSelect: () => void;
}

/**
 * Linear's snooze palette (H or the clock in the open notification): Unsnooze
 * for a snoozed one, the four ready choices and Custom…, or, once something is
 * typed, what it reads as plus the named rows whose letters match.
 */
export const SnoozePalette: React.FC<SnoozePaletteProps> = ({
  open,
  onOpenChange,
  notificationLabel,
  placeholder,
  snoozedUntil,
  onSnooze,
  onCustom,
  onUnsnooze,
}) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    if (!open) return [];
    const choose = (until: Date) => () => {
      onOpenChange(false);
      onSnooze(until);
    };
    const unsnooze: Row[] = snoozedUntil && matchesTyped('Unsnooze notification', query)
      ? [{
        id: 'unsnooze',
        label: 'Unsnooze notification',
        hint: formatSnoozedFor(snoozedUntil),
        icon: <BuyerlyIcon name="delete" size={16} />,
        onSelect: () => {
          onOpenChange(false);
          onUnsnooze();
        },
      }]
      : [];
    const custom: Row[] = matchesTyped('Custom…', query)
      ? [{
        id: 'custom',
        label: 'Custom…',
        hint: '',
        onSelect: () => {
          onOpenChange(false);
          onCustom();
        },
      }]
      : [];
    const times = query.trim()
      ? parseSnoozeQuery(query).map((row) => ({ ...row, onSelect: choose(row.until) }))
      : snoozeOptions().map((option) => ({
        id: option.id,
        label: option.label,
        hint: formatSnoozeTime(option.until),
        onSelect: choose(option.until),
      }));
    return [...unsnooze, ...times, ...custom];
  }, [onCustom, onOpenChange, onSnooze, onUnsnooze, open, query, snoozedUntil]);

  // Every new reading of the text starts on its first row, as in Linear.
  useEffect(() => {
    setActive(rows[0]?.id ?? '');
  }, [rows]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => event.preventDefault()}
          {...withClassName(stylex.props(styles.dialog), 'animate-scale-in')}
        >
          <Dialog.Title {...stylex.props(styles.srOnly)}>Snooze notification</Dialog.Title>
          <Command label="Snooze notification" shouldFilter={false} loop value={active} onValueChange={setActive}>
            <div {...stylex.props(styles.scope)}>
              <span {...stylex.props(styles.chip)}>
                <span {...stylex.props(styles.chipLabel)}>Notification</span>
                <span {...stylex.props(styles.chipLabel)}>·</span>
                <span {...stylex.props(styles.truncate)}>{notificationLabel}</span>
              </span>
            </div>
            <div {...stylex.props(styles.search)}>
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder={placeholder}
                {...stylex.props(styles.input)}
              />
            </div>
            <Command.List {...stylex.props(styles.list)}>
              {rows.map((row) => (
                <Command.Item
                  key={row.id}
                  value={row.id}
                  onSelect={row.onSelect}
                  {...stylex.props(styles.item, commandItemMarker)}
                >
                  <span {...stylex.props(styles.highlight)} />
                  <span {...stylex.props(styles.label)}>
                    <span {...stylex.props(styles.icon)}>{row.icon ?? <BuyerlyIcon name="snooze" size={16} />}</span>
                    <span {...stylex.props(styles.truncate)}>{row.label}</span>
                  </span>
                  {row.hint && (
                    <span {...stylex.props(styles.hint)}>{row.hint}</span>
                  )}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
