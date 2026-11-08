import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { colors } from '@/styles/tokens.stylex';

const styles = stylex.create({
  // Linear's search above the workspace Members and Teams lists, measured live (21.10).
  root: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    width: 300,
    minWidth: 0,
    maxWidth: '100%',
    height: 28,
  },
  /** Read by screen readers only. */
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  icon: {
    position: 'absolute',
    left: 12,
    color: colors['--text-primary'],
    pointerEvents: 'none',
  },
  input: {
    width: '100%',
    height: 28,
    paddingTop: 6,
    paddingRight: 25,
    paddingBottom: 6,
    paddingLeft: 32,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 999,
    backgroundColor: 'transparent',
    color: colors['--text-primary'],
    fontSize: 13,
    fontWeight: 500,
    outline: 'none',
    '::placeholder': {
      color: colors['--text-muted'],
    },
    '::-webkit-search-cancel-button': {
      display: 'none',
    },
  },
});

/** Linear's "Find members…" above a workspace list: a borderless 300px pill with the search icon. */
export const ListSearchField: React.FC<{ value: string; placeholder: string; onChange: (value: string) => void }> = ({
  value,
  placeholder,
  onChange,
}) => (
  <label {...stylex.props(styles.root)}>
    <span {...stylex.props(styles.srOnly)}>{placeholder}</span>
    <BuyerlyIcon name="search" size={14} aria-hidden="true" {...stylex.props(styles.icon)} />
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && value) {
          event.stopPropagation();
          onChange('');
        }
      }}
      placeholder={placeholder}
      {...stylex.props(styles.input)}
    />
  </label>
);
