import * as stylex from '@stylexjs/stylex';

/*
 * Markers for styles that follow an ancestor's state: a data row's checkbox shows while the row is hovered, a menu
 * row's pill fills while the row is highlighted.
 */

/** A data list row (BuyerlyDataListRow). */
export const rowMarker = stylex.defineMarker();

/** A menu row (ContextMenuItem, DropdownMenuItem and their kin). */
export const menuItemMarker = stylex.defineMarker();

/** A command menu row (cmdk's Command.Item), for a part that follows its selection. */
export const commandItemMarker = stylex.defineMarker();

/** A list cell's property button (Rules in Ads Manager), whose pill or icon lights up under the pointer. */
export const propertyMarker = stylex.defineMarker();
