import React from 'react';
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { menuItemMarker } from '@/ui/markers.stylex';
import { withClassName } from '@/ui/withClassName';

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuGroup = ContextMenuPrimitive.Group;
export const ContextMenuPortal = ContextMenuPrimitive.Portal;
export const ContextMenuSub = ContextMenuPrimitive.Sub;
export const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

const styles = stylex.create({
  content: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    borderRadius: 12,
    backgroundColor: colors['--card-bg'],
    boxShadow: colors['--dropdown-shadow'],
    zIndex: 600,
    overflow: 'hidden',
    userSelect: 'none',
    outline: '2px solid transparent',
    outlineOffset: 2,
    maxWidth: 500,
  },
  menu: {
    width: 181,
    minWidth: 179,
    paddingTop: 6,
    paddingRight: 0,
    paddingBottom: 6,
    paddingLeft: 0,
    transformOrigin: 'var(--radix-context-menu-content-transform-origin)',
  },
  submenu: {
    width: 230,
    minWidth: 228,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
  },
  item: {
    position: 'relative',
    display: 'flex',
    height: 32,
    cursor: 'pointer',
    userSelect: 'none',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 18,
    fontSize: 13,
    fontWeight: 450,
    color: {
      default: colors['--text-secondary'],
      ':is([data-highlighted])': colors['--text-primary'],
    },
    whiteSpace: 'nowrap',
    outline: '2px solid transparent',
    outlineOffset: 2,
  },
  subTriggerOpen: {
    color: {
      default: colors['--text-secondary'],
      ':is([data-highlighted])': colors['--text-primary'],
      ':is([data-state="open"])': colors['--text-primary'],
    },
  },
  // The rounded fill inside the row, under its content.
  pill: {
    pointerEvents: 'none',
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 6,
    right: 6,
    height: 32,
    borderRadius: 8,
    backgroundColor: {
      default: 'transparent',
      [stylex.when.ancestor(':hover', menuItemMarker)]: colors['--menu-item-highlight'],
      [stylex.when.ancestor(':focus', menuItemMarker)]: colors['--menu-item-highlight'],
      [stylex.when.ancestor('[data-highlighted]', menuItemMarker)]: colors['--menu-item-highlight'],
    },
    transitionDuration: {
      default: null,
      [stylex.when.ancestor(':hover', menuItemMarker)]: '0s',
    },
  },
  pillOpen: {
    backgroundColor: {
      default: 'transparent',
      [stylex.when.ancestor(':hover', menuItemMarker)]: colors['--menu-item-highlight'],
      [stylex.when.ancestor(':focus', menuItemMarker)]: colors['--menu-item-highlight'],
      [stylex.when.ancestor('[data-highlighted]', menuItemMarker)]: colors['--menu-item-highlight'],
      [stylex.when.ancestor('[data-state="open"]', menuItemMarker)]: colors['--menu-item-highlight'],
    },
  },
  body: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    color: {
      default: null,
      [stylex.when.ancestor(':hover', menuItemMarker)]: colors['--text-primary'],
      [stylex.when.ancestor('[data-highlighted]', menuItemMarker)]: colors['--text-primary'],
    },
    whiteSpace: 'nowrap',
  },
  separator: {
    height: 12,
    paddingTop: 5,
    paddingBottom: 5,
    boxSizing: 'border-box',
  },
  separatorLine: {
    height: 1,
    width: '100%',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderColor: colors['--color-border-primary'],
  },
});

export const ContextMenuContent: React.FC<ContextMenuPrimitive.ContextMenuContentProps> = ({
  className = '',
  ...props
}) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Content
      {...withClassName(stylex.props(styles.content, styles.menu), `buyerly-menu ${className}`.trim())}
      {...props}
    />
  </ContextMenuPrimitive.Portal>
);

export const ContextMenuSubContent: React.FC<ContextMenuPrimitive.ContextMenuSubContentProps> = ({
  className = '',
  sideOffset = -2,
  alignOffset = -5,
  ...props
}) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.SubContent
      sideOffset={sideOffset}
      alignOffset={alignOffset}
      {...withClassName(stylex.props(styles.content, styles.submenu), className)}
      {...props}
    />
  </ContextMenuPrimitive.Portal>
);

type ItemStyle = { xstyle?: stylex.StyleXStyles };

export const ContextMenuItem: React.FC<
  ContextMenuPrimitive.ContextMenuItemProps & ItemStyle
> = ({ className = '', xstyle, children, ...props }) => (
  <ContextMenuPrimitive.Item
    {...withClassName(stylex.props(styles.item, menuItemMarker, xstyle), className)}
    {...props}
  >
    {/* Inner Hover/Focus/Highlighted Pill */}
    <div {...stylex.props(styles.pill)} />

    {/* Item Content Layer */}
    <div {...stylex.props(styles.body)}>
      {children}
    </div>
  </ContextMenuPrimitive.Item>
);

export const ContextMenuSubTrigger: React.FC<
  ContextMenuPrimitive.ContextMenuSubTriggerProps
> = ({ className = '', children, ...props }) => (
  <ContextMenuPrimitive.SubTrigger
    {...withClassName(stylex.props(styles.item, styles.subTriggerOpen, menuItemMarker), className)}
    {...props}
  >
    {/* Inner Hover Pill */}
    <div {...stylex.props(styles.pill, styles.pillOpen)} />

    {/* Item Content Layer */}
    <div {...stylex.props(styles.body)}>
      {children}
    </div>
  </ContextMenuPrimitive.SubTrigger>
);

export const ContextMenuSeparator: React.FC<ContextMenuPrimitive.ContextMenuSeparatorProps> = ({
  className = '',
  ...props
}) => (
  <ContextMenuPrimitive.Separator
    {...withClassName(stylex.props(styles.separator), className)}
    {...props}
  >
    <div {...stylex.props(styles.separatorLine)} />
  </ContextMenuPrimitive.Separator>
);
