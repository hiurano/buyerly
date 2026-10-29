import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';

const styles = stylex.create({
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
});

/** Linear's "Find members…" above a workspace list: a borderless 300px pill with the search icon. */
export const ListSearchField: React.FC<{ value: string; placeholder: string; onChange: (value: string) => void }> = ({
  value,
  placeholder,
  onChange,
}) => (
  <label className="list-search-field">
    <span {...stylex.props(styles.srOnly)}>{placeholder}</span>
    <BuyerlyIcon name="search" size={14} aria-hidden="true" className="list-search-field__icon" />
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
      className="list-search-field__input"
    />
  </label>
);
