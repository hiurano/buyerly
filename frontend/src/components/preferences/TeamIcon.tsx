import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { withClassName } from '@/ui/withClassName';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';

const styles = stylex.create({
  root: {
    flexShrink: 0,
    color: colors['--action-primary'],
  },
});

/**
 * The team icon: a person in a rounded frame, in the accent colour, as
 * Linear's default team icon. Buyerly has no icon picker, so every team wears this one.
 */
export const TeamIcon: React.FC<{ size?: number; className?: string }> = ({ size = 14, className = '' }) => (
  <BuyerlyIcon name="teams" size={size} {...withClassName(stylex.props(styles.root), className)} />
);
