import React from 'react';

/**
 * Linear's default team icon: a person in a rounded frame, in the accent
 * colour. Buyerly has no icon picker, so every team wears this one.
 */
export const TeamIcon: React.FC<{ size?: number; className?: string }> = ({ size = 14, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    aria-hidden="true"
    fill="currentColor"
    className={`shrink-0 text-[var(--action-primary)] ${className}`}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12.5 1A2.5 2.5 0 0 1 15 3.5v9a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 1 12.5v-9A2.5 2.5 0 0 1 3.5 1h9Zm-9 1.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-9Z"
    />
    <path d="M10 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />
    <path d="M11.405 12H4.596c-.408 0-.715-.336-.551-.693.362-.79 1.344-1.974 3.98-1.974 2.648 0 3.597 1.195 3.935 1.986.152.355-.154.681-.555.681Z" />
  </svg>
);
