import React from 'react';
import { Button } from './Button';

export interface DataStateProps {
  title: string;
  detail: string;
  /** `alert` for a failure the user must notice; `status` for loading and empty. */
  role?: 'status' | 'alert';
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

/**
 * The loading, empty and error state of a data surface. Every state carries a
 * title and an explanation in text, so none of them depends on color alone.
 */
export const DataState: React.FC<DataStateProps> = ({
  title,
  detail,
  role = 'status',
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}) => (
  <section className="flex min-h-52 flex-1 items-center justify-center px-6 text-center" role={role}>
    <div className="max-w-md">
      <h3 className="text-[14px] font-medium text-[var(--text-primary)]">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-tertiary)]">{detail}</p>
      {(actionLabel || secondaryLabel) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {actionLabel && onAction && (
            <Button variant="primary" onClick={onAction}>{actionLabel}</Button>
          )}
          {secondaryLabel && onSecondary && (
            <Button onClick={onSecondary}>{secondaryLabel}</Button>
          )}
        </div>
      )}
    </div>
  </section>
);
