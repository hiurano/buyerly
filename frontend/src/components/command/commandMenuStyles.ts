import * as stylex from '@stylexjs/stylex';
import { colors, layout } from '@/styles/tokens.stylex';

/** The sans stack the app's controls use. */
const SANS = '"Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

/**
 * Linear's command menu, for Ctrl/Cmd+K and Open: panel, field, rows, keys
 * and the note that stands in for an empty list. Measured on Linear in both
 * themes (#311). The selection's command menu (src/ui/SelectionCommandMenu.tsx)
 * draws the same look. A group's heading is cmdk's own element, which StyleX
 * cannot reach: `.buyerly-command-group` in components/command/commandExtras.css
 * styles it.
 */
export const commandMenuStyles = stylex.create({
  /** Where Ctrl/Cmd+K and Open sit: 13% down, up to 720px wide, 16px off the sides. */
  dialog: {
    position: 'fixed',
    left: 16,
    right: 16,
    top: '13vh',
    zIndex: layout['--layer-command-menu'],
    marginLeft: 'auto',
    marginRight: 'auto',
    display: 'flex',
    maxWidth: 720,
    flexDirection: 'column',
    outline: '2px solid transparent',
    outlineOffset: 2,
  },
  /** The floating panel. */
  surface: {
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: colors['--command-menu-border'],
    backgroundColor: colors['--command-menu-bg'],
    boxShadow: colors['--command-menu-shadow'],
  },
  /** Around the field: Linear's 6px inset, with no rule under it. */
  field: {
    flexShrink: 0,
    paddingLeft: 6,
    paddingRight: 6,
    paddingTop: 6,
  },
  input: {
    height: 40,
    width: '100%',
    backgroundColor: 'transparent',
    paddingLeft: 12,
    paddingRight: 12,
    fontSize: 13,
    color: colors['--command-menu-text'],
    outline: '2px solid transparent',
    outlineOffset: 2,
    '::placeholder': {
      color: colors['--command-menu-placeholder'],
    },
  },
  /** 6px above the first row and below the last, and Linear's thin scrollbar over the rows. */
  list: {
    maxHeight: 'min(404px, 60vh)',
    overflowY: 'auto',
    scrollbarWidth: 'thin',
    paddingLeft: 6,
    paddingRight: 6,
    paddingTop: 6,
    paddingBottom: 6,
  },
  /**
   * 46px rows, 8px between icon and label; the selected one gets a rounded fill
   * inset 2px top and bottom, and Linear brightens its text. Each of a row's
   * parts is `position: relative`, so it draws over the fill.
   */
  item: {
    position: 'relative',
    marginLeft: 0,
    marginRight: 0,
    display: 'flex',
    height: 46,
    cursor: 'default',
    userSelect: 'none',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
    paddingRight: 12,
    fontSize: 13,
    fontWeight: 450,
    color: {
      default: colors['--command-menu-text'],
      ':is([data-selected=true])': colors['--command-menu-text-selected'],
    },
    outline: '2px solid transparent',
    outlineOffset: 2,
    '::before': {
      content: "''",
      pointerEvents: 'none',
      position: 'absolute',
      left: 0,
      right: 0,
      top: 2,
      bottom: 2,
      borderRadius: 8,
      backgroundColor: {
        default: null,
        ':is([data-selected=true])': colors['--command-menu-row-selected-bg'],
      },
    },
  },
  /** Linear draws a row's icon in the menu's tertiary, selected or not. */
  icon: {
    position: 'relative',
    color: colors['--command-menu-text-tertiary'],
    display: 'flex',
    height: 16,
    width: 16,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** A part of a row that has its own look, drawn over the selected row's fill. */
  part: {
    position: 'relative',
  },
  /** A row's label, taking the room its keys leave. */
  label: {
    position: 'relative',
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  /** A row's keys on the right: 11px in a 0.5px box, 4px inside, 21px high. */
  kbd: {
    display: 'inline-flex',
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: colors['--command-menu-kbd-border'],
    padding: 4,
    fontFamily: SANS,
    fontSize: 11,
    fontWeight: 450,
    lineHeight: 1.1,
    color: colors['--command-menu-text-tertiary'],
  },
  note: {
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 24,
    paddingBottom: 24,
    textAlign: 'center',
    fontSize: 12,
    color: colors['--text-muted'],
  },
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
