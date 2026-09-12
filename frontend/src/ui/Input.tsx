import React from 'react';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/** Shared text input for authenticated product surfaces. */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={`ui-input h-9 min-w-0 rounded-[var(--control-border-radius)] border border-[var(--color-border-secondary)] bg-[var(--bg-canvas)] px-3 text-[14px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--focus-ring-color)] focus:ring-1 focus:ring-[var(--focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  ),
);

Input.displayName = 'Input';
