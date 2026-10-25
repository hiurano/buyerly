import React from 'react';
import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  /** The sidebar's last row, under its sections: Help. */
  footer: {
    marginTop: 'auto',
    display: 'flex',
    height: 36,
    flexShrink: 0,
    alignItems: 'flex-start',
    gap: 8,
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 2,
  },
  /** Buttons over the window's bottom right corner. */
  bar: {
    pointerEvents: 'none',
    position: 'fixed',
    bottom: 4,
    right: 10,
    zIndex: 94,
    display: 'flex',
    height: 28,
    alignItems: 'center',
    gap: 2,
  },
});

export const SidebarUtilityFooter: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div {...stylex.props(styles.footer)}>
    {children}
  </div>
);

export const AppUtilityBar: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div {...stylex.props(styles.bar)}>
    {children}
  </div>
);
