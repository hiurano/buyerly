import React, { useEffect, useState } from 'react';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { isSignificantBudgetChange } from '@/lib/delivery';

interface BudgetFieldProps {
  /** The budget currently stored for this entity, in the ad account currency. */
  current: number;
  currency: string;
  entityNoun: string;
  busy: boolean;
  onSave: (dailyBudget: number) => void;
  formatMoney: (value: number) => string;
}

/**
 * Editing for a budget that already exists. A budget is never created here: an
 * entity without one keeps it on another level of the hierarchy, and writing one
 * would change how the campaign is optimized rather than how much it spends.
 */
export const BudgetField: React.FC<BudgetFieldProps> = ({
  current,
  currency,
  entityNoun,
  busy,
  onSave,
  formatMoney,
}) => {
  const [draft, setDraft] = useState(String(current));
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(String(current));
    setConfirming(false);
    setError('');
  }, [current]);

  const parsed = Number(draft.trim().replace(',', '.'));
  const valid = Number.isFinite(parsed) && parsed >= 1 && parsed <= 1_000_000;
  const changed = valid && Math.abs(parsed - current) > 0.011;

  const attempt = () => {
    if (busy) return;
    if (!valid) {
      setError(`A daily budget must be between ${formatMoney(1)} and ${formatMoney(1_000_000)}.`);
      return;
    }
    if (!changed) {
      setError('');
      setConfirming(false);
      return;
    }
    // A large step can send the entity back into Meta's learning phase, so it
    // is confirmed before it is sent, not explained afterwards.
    if (!confirming && isSignificantBudgetChange(current, parsed)) {
      setError('');
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setError('');
    onSave(parsed);
  };

  return (
    <div className="min-w-0">
      <label className="block text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
        Daily budget
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Input
          className="h-8 w-[120px]"
          inputMode="decimal"
          aria-label={`Daily budget for this ${entityNoun} in ${currency}`}
          value={draft}
          disabled={busy}
          maxLength={12}
          onChange={(event) => {
            setDraft(event.target.value);
            setConfirming(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              attempt();
            }
            if (event.key === 'Escape') {
              setDraft(String(current));
              setConfirming(false);
              setError('');
            }
          }}
        />
        <span className="text-[12px] text-[var(--text-muted)]">{currency}</span>
        <Button
          size="compact"
          variant={confirming ? 'primary' : 'secondary'}
          disabled={busy || !changed}
          onClick={attempt}
        >
          {busy ? 'Saving…' : confirming ? 'Confirm change' : 'Save'}
        </Button>
      </div>
      {confirming && (
        <p className="mt-2 text-[12px] text-[var(--text-secondary)]" role="status">
          That changes the daily budget from {formatMoney(current)} to {formatMoney(parsed)}. A step
          this large can send the {entityNoun} back into Meta's learning phase.
        </p>
      )}
      {error && (
        <p className="mt-2 text-[12px] text-[var(--statistics-state-attention)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
