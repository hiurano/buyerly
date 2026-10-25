import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
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

const styles = stylex.create({
  root: {
    display: 'flex',
    minHeight: 208,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 24,
    paddingRight: 24,
    textAlign: 'center',
  },
  body: {
    maxWidth: 448,
  },
  title: {
    fontSize: 14,
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  detail: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: '1.625',
    color: colors['--text-tertiary'],
  },
  actions: {
    marginTop: 16,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});

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
  <section {...stylex.props(styles.root)} role={role}>
    <div {...stylex.props(styles.body)}>
      <h3 {...stylex.props(styles.title)}>{title}</h3>
      <p {...stylex.props(styles.detail)}>{detail}</p>
      {(actionLabel || secondaryLabel) && (
        <div {...stylex.props(styles.actions)}>
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
