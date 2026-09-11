import React from 'react';

export interface FormCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Secondary line under the label, for a consequence the label cannot carry. */
  hint?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Labelled checkbox for forms and dialogs.
 *
 * `LinearCheckbox` is built for data rows — it stays transparent until the row
 * is hovered or the box is checked — so it cannot carry a standing form
 * choice. This one is always visible, always labelled, and operable by
 * keyboard through the native input.
 */
export const FormCheckbox: React.FC<FormCheckboxProps> = ({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
  className = '',
}) => (
  <label
    className={`flex cursor-pointer select-none items-start gap-2 ${
      disabled ? 'cursor-not-allowed opacity-50' : ''
    } ${className}`}
  >
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="mt-[1px] h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-[var(--color-border-secondary)] bg-transparent accent-[var(--action-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
    />
    <span className="flex flex-col">
      <span className="text-[12px] text-[var(--text-secondary)]">{label}</span>
      {hint && <span className="text-[11px] text-[var(--text-tertiary)]">{hint}</span>}
    </span>
  </label>
);
