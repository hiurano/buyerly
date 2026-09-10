import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  size?: 'compact' | 'default';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'default', className = '', type = 'button', ...props }, ref) => {
    const variantClass =
      variant === 'primary'
        ? 'border-transparent bg-[var(--action-primary)] text-white hover:bg-[var(--action-primary-hover)]'
        : 'border-[var(--color-border-secondary)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]';
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
