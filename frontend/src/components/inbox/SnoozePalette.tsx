import React, { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { LinearClockOutlineIcon, LinearTrashIcon } from '@/icons/LinearIcons';
import { formatSnoozedFor, formatSnoozeTime, matchesTyped, snoozeOptions } from '@/lib/inbox';
import { parseSnoozeQuery } from '@/lib/snoozeQuery';

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
        icon: <LinearTrashIcon size={16} />,
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
          className="fixed inset-x-0 top-[13vh] z-[700] mx-auto w-[720px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[12px] border border-[var(--color-border-secondary)] bg-[var(--card-bg)] shadow-[var(--dropdown-shadow)] outline-none animate-scale-in"
        >
          <Dialog.Title className="sr-only">Snooze notification</Dialog.Title>
          <Command label="Snooze notification" shouldFilter={false} loop value={active} onValueChange={setActive}>
            <div className="px-[14px] pt-[12px]">
              <span className="inline-flex h-[22px] max-w-full items-center gap-[4px] truncate rounded-[6px] bg-[var(--color-border-secondary)] px-[6px] text-[12px] text-[var(--text-secondary)]">
                <span className="text-[var(--text-tertiary)]">Notification</span>
                <span className="text-[var(--text-tertiary)]">·</span>
                <span className="truncate">{notificationLabel}</span>
              </span>
            </div>
            <div className="px-[6px]">
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder={placeholder}
                className="h-[40px] w-full bg-transparent px-[12px] py-[11px] text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
              />
            </div>
            <Command.List className="max-h-[min(360px,60vh)] overflow-y-auto pb-[5px] pt-[6px] select-none">
              {rows.map((row) => (
                <Command.Item
                  key={row.id}
                  value={row.id}
                  onSelect={row.onSelect}
                  className="group relative flex h-[46px] cursor-pointer items-center pl-[19px] pr-[21px] text-[13px] font-[450] text-[var(--text-primary)] outline-none"
                >
                  <span className="pointer-events-none absolute inset-x-[7px] inset-y-[2px] rounded-[8px] group-data-[selected=true]:bg-[var(--item-hover-bg)]" />
                  <span className="relative z-10 flex min-w-0 flex-1 items-center gap-[12px]">
                    <span className="text-[var(--text-tertiary)]">{row.icon ?? <LinearClockOutlineIcon size={16} />}</span>
                    <span className="truncate">{row.label}</span>
                  </span>
                  {row.hint && (
                    <span className="relative z-10 shrink-0 pl-[12px] text-[13px] text-[var(--text-tertiary)]">{row.hint}</span>
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
