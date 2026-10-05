import React from 'react';
import { Chrome, Compass, Globe } from 'lucide-react';

/** Firefox drawn as Linear's tile shows it: a ring with the fox's swirl, in one colour. */
const FirefoxMark: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 4a4 4 0 1 0 4 4 3 3 0 0 1-4-4Z" fill="currentColor" />
  </svg>
);

// Linear's session tiles carry the browser's mark in one colour; lucide has
// Chrome's and a compass for Safari, every other browser gets a globe.
const ICONS: Record<string, React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  Chrome,
  Safari: Compass,
  Firefox: FirefoxMark,
};

/** The browser's mark for a session row; a globe when there is none. */
export const BrowserIcon: React.FC<{ browser: string; size?: number }> = ({ browser, size = 16 }) => {
  const Icon = ICONS[browser] || Globe;
  return <Icon size={size} aria-hidden />;
};
