import React from 'react';
import { BuyerlySearchIcon } from '@/icons/BuyerlyIcons';

/** Linear's "Find members…" above a workspace list: a borderless 300px pill with the search icon. */
export const ListSearchField: React.FC<{ value: string; placeholder: string; onChange: (value: string) => void }> = ({
  value,
  placeholder,
  onChange,
}) => (
  <label className="list-search-field">
    <span className="sr-only">{placeholder}</span>
    <BuyerlySearchIcon size={14} aria-hidden="true" className="list-search-field__icon" />
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
