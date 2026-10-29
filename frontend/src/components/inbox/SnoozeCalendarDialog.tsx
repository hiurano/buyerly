import React, { useLayoutEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as stylex from '@stylexjs/stylex';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { Button } from '@/ui/Button';
import { withClassName } from '@/ui/withClassName';
import { colors } from '@/styles/tokens.stylex';

const styles = stylex.create({
  month: {
    display: 'flex',
    width: 246,
    gap: 8,
    paddingLeft: 8,
    paddingRight: 8,
    paddingBottom: 8,
    paddingTop: 8,
  },
  weekday: {
    display: 'flex',
    width: 26,
    flexDirection: 'column',
    alignItems: 'center',
    borderRadius: 8,
    paddingBottom: 8,
  },
  weekend: {
    backgroundColor: colors['--calendar-weekend-bg'],
  },
  weekdayLabel: {
    display: 'flex',
    height: 28,
    alignItems: 'center',
    fontSize: 13,
    color: colors['--text-tertiary'],
  },
  weekdayGap: {
    height: 12,
  },
  emptyCell: {
    height: 34,
  },
  cell: {
    display: 'flex',
    height: 34,
    alignItems: 'center',
  },
  day: {
    display: 'flex',
    height: 26,
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    fontSize: 12,
    outline: '2px solid transparent',
    outlineOffset: 2,
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
    color: {
      default: colors['--text-secondary'],
      ':hover': colors['--text-primary'],
    },
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
  },
  dayWeekend: {
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
    },
  },
  dayPast: {
    cursor: 'default',
    color: colors['--text-muted'],
    backgroundColor: null,
  },
  daySelected: {
    backgroundColor: colors['--calendar-selected-bg'],
    color: colors['--calendar-selected-fg'],
  },
  frame: {
    pointerEvents: 'none',
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 16,
  },
  content: {
    pointerEvents: 'auto',
    maxHeight: 'calc(100vh - 32px)',
    maxWidth: '100%',
    overflow: 'auto',
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    backgroundColor: colors['--card-bg'],
    paddingLeft: 32,
    paddingRight: 32,
    paddingBottom: 32,
    paddingTop: 32,
    boxShadow: colors['--dialog-elevation-shadow'],
    outline: '2px solid transparent',
    outlineOffset: 2,
  },
  title: {
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    display: 'flex',
    height: 23,
    alignItems: 'center',
    gap: 8,
    fontSize: 15,
    fontWeight: 600,
    color: colors['--text-primary'],
  },
  months: {
    marginTop: 6,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  monthHeader: {
    display: 'flex',
    height: 36,
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 12,
    color: colors['--text-secondary'],
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  navButton: {
    display: 'flex',
    height: 28,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
      ':disabled': colors['--text-muted'],
    },
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
    pointerEvents: {
      default: null,
      ':disabled': 'none',
    },
  },
  actions: {
    marginTop: 20,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancel: {
    borderColor: 'transparent',
    backgroundColor: colors['--calendar-cancel-bg'],
    fontSize: 13,
    color: colors['--calendar-cancel-fg'],
    boxShadow: {
      default: colors['--calendar-cancel-shadow'],
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
  },
  apply: {
    backgroundColor: colors['--calendar-apply-bg'],
    fontSize: 13,
    color: colors['--calendar-apply-fg'],
    boxShadow: {
      default: colors['--calendar-apply-shadow'],
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
    filter: {
      default: null,
      ':hover': 'brightness(1.1)',
    },
  },
});

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
  <BuyerlyIcon name={direction === 'left' ? 'chevron-left' : 'chevron-right'} size={16} />
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
    <div role="group" aria-label={monthTitle.format(first)} {...stylex.props(styles.month)}>
      {WEEKDAY_LABELS.map((label, index) => (
        <div
          key={label}
          {...stylex.props(styles.weekday, (index === 0 || index === 6) && styles.weekend)}
        >
          <div aria-hidden="true" {...stylex.props(styles.weekdayLabel)}>{label}</div>
          <div {...stylex.props(styles.weekdayGap)} />
          {weeks.map((week, weekIndex) => {
            const day = week[index];
            if (!day) return <div key={weekIndex} {...stylex.props(styles.emptyCell)} />;
            const past = day < today;
            const isSelected = sameDay(day, selected);
            const weekend = index === 0 || index === 6;
            return (
              <div key={weekIndex} {...stylex.props(styles.cell)}>
                <button
                  type="button"
                  disabled={past}
                  aria-label={dayTitle.format(day)}
                  aria-pressed={isSelected}
                  data-snooze-day={`${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`}
                  onClick={() => onSelect(day)}
                  {...stylex.props(
                    styles.day,
                    weekend && styles.dayWeekend,
                    past && styles.dayPast,
                    isSelected && styles.daySelected,
                  )}
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
        <div {...stylex.props(styles.frame)}>
          <Dialog.Content
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => event.preventDefault()}
            {...withClassName(stylex.props(styles.content), 'animate-scale-in')}
          >
            <Dialog.Title {...stylex.props(styles.title)}>
              <BuyerlyIcon name="snooze" size={16} />
              Snooze notification until
            </Dialog.Title>
            <div {...stylex.props(styles.months)}>
              {[first, second].map((month, index) => (
                <div key={month.getTime()}>
                  <div {...stylex.props(styles.monthHeader)}>
                    <span>{monthTitle.format(month)}</span>
                    {index === 1 && (
                      <span {...stylex.props(styles.nav)}>
                        <button
                          type="button"
                          aria-label="Previous month"
                          disabled={atFirstMonth}
                          onClick={() => shiftMonths(-1)}
                          {...stylex.props(styles.navButton)}
                        >
                          <NavArrow direction="left" />
                        </button>
                        <button
                          type="button"
                          aria-label="Next month"
                          onClick={() => shiftMonths(1)}
                          {...stylex.props(styles.navButton)}
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
            <div {...stylex.props(styles.actions)}>
              <Button
                onClick={() => onOpenChange(false)}
                xstyle={styles.cancel}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={apply}
                xstyle={styles.apply}
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
