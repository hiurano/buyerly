import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';

const styles = stylex.create({
  arrow: {
    fontSize: 8,
    lineHeight: 1,
    color: colors['--text-tertiary'],
  },
});

/** Linear marks a menu row that opens a submenu with a small solid triangle. */
export const SubmenuArrow: React.FC = () => (
  <span aria-hidden="true" {...stylex.props(styles.arrow)}>
    ▶
  </span>
);
