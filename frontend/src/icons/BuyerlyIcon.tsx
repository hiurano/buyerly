import React from 'react';
import { BUYERLY_ICON_PATHS, type BuyerlyIconName } from './buyerlyIconPaths';

export type { BuyerlyIconName };

interface BuyerlyIconProps extends Omit<React.SVGProps<SVGSVGElement>, 'name'> {
  name: BuyerlyIconName;
  size?: number;
}

/**
 * Every icon in the app, by its role. Drawn from Phosphor Bold (scripts/build_buyerly_icons.py),
 * filled shapes on a 256 grid: at 14px (sidebar, toolbars) the line is ~1.3px and at 16px (menus)
 * 1.5px, as Linear's. Colour comes from `currentColor`, so each place sets its own idle/hover tone.
 */
export const BuyerlyIcon: React.FC<BuyerlyIconProps> = ({ name, size = 16, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 256 256"
    role="img"
    focusable="false"
    aria-hidden="true"
    fill="currentColor"
    {...props}
  >
    {BUYERLY_ICON_PATHS[name].map((d) => (
      <path key={d} d={d} />
    ))}
  </svg>
);
