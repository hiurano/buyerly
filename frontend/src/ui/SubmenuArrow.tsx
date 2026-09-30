import React from 'react';

/** Linear marks a menu row that opens a submenu with a small solid triangle. */
export const SubmenuArrow: React.FC = () => (
  <span aria-hidden="true" className="text-[8px] leading-none text-[var(--text-tertiary)]">
    ▶
  </span>
);
