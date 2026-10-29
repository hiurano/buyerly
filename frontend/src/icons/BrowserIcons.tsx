import React from 'react';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';

/** Firefox drawn as Linear's tile shows it: a ring with the fox's swirl, in one colour. */
const FirefoxMark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 4a4 4 0 1 0 4 4 3 3 0 0 1-4-4Z" fill="currentColor" />
  </svg>
);

// Linear's session tiles carry the browser's mark in one colour: Chrome's logo,
// Firefox's ring, a compass for Safari, a globe for every other browser.
const ICONS: Record<string, (size: number) => React.ReactNode> = {
  Chrome: (size) => <BuyerlyIcon name="chrome" size={size} />,
  Safari: (size) => <BuyerlyIcon name="compass" size={size} />,
  Firefox: (size) => <FirefoxMark size={size} />,
};

/** The browser's mark for a session row; a globe when there is none. */
export const BrowserIcon: React.FC<{ browser: string; size?: number }> = ({ browser, size = 16 }) => (
  <>{ICONS[browser]?.(size) ?? <BuyerlyIcon name="globe" size={size} />}</>
);
