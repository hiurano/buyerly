import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** `danger` is only for the confirming button of a destructive action. */
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'compact' | 'default';
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'border-transparent bg-[var(--action-primary)] text-white hover:bg-[var(--action-primary-hover)]',
  secondary: 'border-[var(--color-border-secondary)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]',
  danger: 'border-transparent bg-[var(--action-danger)] text-[var(--action-danger-text)] hover:bg-[var(--action-danger-hover)]',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'default', className = '', type = 'button', ...props }, ref) => {
    const variantClass = VARIANT_CLASSES[variant];
    const sizeClass = size === 'compact' ? 'h-7 px-3 text-[12px]' : 'h-8 px-3.5 text-[12px]';

    return (
      <button
        ref={ref}
        type={type}
        className={`inline-flex items-center justify-center rounded-full border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-50 ${variantClass} ${sizeClass} ${className}`}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';
