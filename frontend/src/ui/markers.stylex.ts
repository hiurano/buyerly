import * as stylex from '@stylexjs/stylex';

/*
 * Markers for styles that follow an ancestor's state, as Tailwind's named
 * groups did: a data row's checkbox shows while the row is hovered, a menu
 * row's pill fills while the row is highlighted.
 */

/** A data list row (BuyerlyDataListRow). */
export const rowMarker = stylex.defineMarker();

/** A menu row (ContextMenuItem, DropdownMenuItem and their kin). */
export const menuItemMarker = stylex.defineMarker();
