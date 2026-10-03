import React from 'react';
import { Chrome, Compass, Globe, type LucideIcon } from 'lucide-react';

// Linear's session tiles carry the browser's mark; lucide has Chrome's and a
// compass for Safari, every other browser gets a globe.
const ICONS: Record<string, LucideIcon> = {
  Chrome,
  Safari: Compass,
};

/** The browser's mark for a session row; a globe when there is none. */
export const BrowserIcon: React.FC<{ browser: string; size?: number }> = ({ browser, size = 16 }) => {
  const Icon = ICONS[browser] || Globe;
  return <Icon size={size} aria-hidden />;
};
