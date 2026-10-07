import React, { useLayoutEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { LinearClockOutlineIcon } from '@/icons/LinearIcons';
import { Button } from '@/ui/Button';

interface SnoozeCalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The chosen day at 9:00, as Linear's Apply snoozes it. */
  onApply: (until: Date) => void;
}

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function monthWeeks(first: Date): Array<Array<Date | null>> {
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = Array.from({ length: first.getDay() }, () => null);
  for (let day = 1; day <= days; day += 1) cells.push(new Date(first.getFullYear(), first.getMonth(), day));
  while (cells.length % 7) cells.push(null);
  const weeks: Array<Array<Date | null>> = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

const monthTitle = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const dayTitle = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

const NavArrow: React.FC<{ direction: 'left' | 'right' }> = ({ direction }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d={direction === 'left' ? 'M9.5 4.5 6 8l3.5 3.5' : 'M6.5 4.5 10 8l-3.5 3.5'}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface MonthGridProps {
  first: Date;
  today: Date;
  selected: Date;
  onSelect: (day: Date) => void;
}

/** One month as Linear draws it: weekend columns tinted, round 26px days, past days dimmed. */
const MonthGrid: React.FC<MonthGridProps> = ({ first, today, selected, onSelect }) => {
  const weeks = monthWeeks(first);
  return (
    <div role="group" aria-label={monthTitle.format(first)} className="flex w-[246px] gap-[8px] px-[8px] pb-[8px] pt-[8px]">
      {WEEKDAY_LABELS.map((label, index) => (
        <div
          key={label}
          className={`flex w-[26px] flex-col items-center rounded-[8px] pb-[8px] ${
            index === 0 || index === 6 ? 'bg-[var(--calendar-weekend-bg)]' : ''
          }`}
        >
          <div aria-hidden="true" className="flex h-[28px] items-center text-[13px] text-[var(--text-tertiary)]">{label}</div>
          <div className="h-[12px]" />
          {weeks.map((week, weekIndex) => {
            const day = week[index];
            if (!day) return <div key={weekIndex} className="h-[34px]" />;
            const past = day < today;
            const isSelected = sameDay(day, selected);
            const weekend = index === 0 || index === 6;
            return (
              <div key={weekIndex} className="flex h-[34px] items-center">
                <button
                  type="button"
                  disabled={past}
                  aria-label={dayTitle.format(day)}
                  aria-pressed={isSelected}
                  data-snooze-day={`${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`}
                  onClick={() => onSelect(day)}
                  className={`flex h-[26px] w-[26px] items-center justify-center rounded-full text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)] ${
                    isSelected
                      ? 'bg-[var(--calendar-selected-bg)] text-[var(--calendar-selected-fg)]'
                      : past
                        ? 'cursor-default text-[var(--text-muted)]'
                        : `${weekend ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-secondary)]'} hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]`
                  }`}
                >
                  {day.getDate()}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** Linear's Snooze → Custom…: two months side by side, tomorrow picked, Cancel / Apply. */
export const SnoozeCalendarDialog: React.FC<SnoozeCalendarDialogProps> = ({ open, onOpenChange, onApply }) => {
  const [today, setToday] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
  const [first, setFirst] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  // Before paint: the dialog stays mounted, so an open must never show the last pick or today for a frame.
  useLayoutEffect(() => {
    if (!open) return;
    const now = startOfDay(new Date());
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    setToday(now);
    setSelected(tomorrow);
    setFirst(new Date(tomorrow.getFullYear(), tomorrow.getMonth(), 1));
  }, [open]);

  const second = new Date(first.getFullYear(), first.getMonth() + 1, 1);
  // Linear starts at tomorrow's month and goes no further back.
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const atFirstMonth = first.getFullYear() * 12 + first.getMonth() <= tomorrow.getFullYear() * 12 + tomorrow.getMonth();
  const shiftMonths = (step: number) => setFirst(new Date(first.getFullYear(), first.getMonth() + step, 1));

  const apply = () => {
    const until = new Date(selected);
    until.setHours(9, 0, 0, 0);
    onApply(until);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <div className="pointer-events-none fixed inset-0 z-[700] flex items-center justify-center p-4">
          <Dialog.Content
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => event.preventDefault()}
            className="pointer-events-auto max-h-[calc(100vh-32px)] max-w-full overflow-auto rounded-[12px] border border-[var(--color-border-secondary)] bg-[var(--card-bg)] px-[32px] pb-[32px] pt-[32px] shadow-[var(--dialog-elevation-shadow)] outline-none animate-scale-in"
          >
            <Dialog.Title className="m-0 flex h-[23px] items-center gap-[8px] text-[15px] font-semibold text-[var(--text-primary)]">
              <LinearClockOutlineIcon size={16} />
              Snooze notification until
            </Dialog.Title>
            <div className="mt-[6px] flex flex-wrap gap-[4px]">
              {[first, second].map((month, index) => (
                <div key={month.getTime()}>
                  <div className="flex h-[36px] items-center justify-between text-[12px] text-[var(--text-secondary)]">
                    <span>{monthTitle.format(month)}</span>
                    {index === 1 && (
                      <span className="flex items-center gap-[4px]">
                        <button
                          type="button"
                          aria-label="Previous month"
                          disabled={atFirstMonth}
                          onClick={() => shiftMonths(-1)}
                          className="flex h-[28px] w-[28px] items-center justify-center rounded-[6px] text-[var(--text-tertiary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:text-[var(--text-muted)]"
                        >
                          <NavArrow direction="left" />
                        </button>
                        <button
                          type="button"
                          aria-label="Next month"
                          onClick={() => shiftMonths(1)}
                          className="flex h-[28px] w-[28px] items-center justify-center rounded-[6px] text-[var(--text-tertiary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]"
                        >
                          <NavArrow direction="right" />
                        </button>
                      </span>
                    )}
                  </div>
                  <MonthGrid first={month} today={today} selected={selected} onSelect={setSelected} />
                </div>
              ))}
            </div>
            <div className="mt-[20px] flex justify-end gap-[10px]">
              <Button
                onClick={() => onOpenChange(false)}
                className="!border-transparent !bg-[var(--calendar-cancel-bg)] !text-[13px] !text-[var(--calendar-cancel-fg)] shadow-[var(--calendar-cancel-shadow)]"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={apply}
                className="!bg-[var(--calendar-apply-bg)] !text-[13px] !text-[var(--calendar-apply-fg)] shadow-[var(--calendar-apply-shadow)] hover:brightness-110"
              >
                Apply
              </Button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
