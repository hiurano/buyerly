import React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { menuItemMarker } from '@/ui/markers.stylex';
import { withClassName } from '@/ui/withClassName';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const TOUCH = '@media (hover: none) and (pointer: coarse)';

const styles = stylex.create({
  label: {
    paddingLeft: 14,
    paddingRight: 14,
    paddingBottom: 4,
    paddingTop: 6,
    fontSize: 11,
    fontWeight: 500,
    color: colors['--text-muted'],
  },
  content: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    borderRadius: 12,
    backgroundColor: colors['--card-bg'],
    boxShadow: colors['--dropdown-shadow'],
    overflow: 'hidden',
    outline: '2px solid transparent',
    outlineOffset: 2,
    paddingTop: 6,
    paddingRight: 0,
    paddingBottom: 6,
    paddingLeft: 0,
  },
  menu: {
    width: 180,
    minWidth: 175,
    maxWidth: 500,
    zIndex: 600,
    userSelect: 'none',
    transformOrigin: 'var(--radix-dropdown-menu-content-transform-origin)',
  },
  submenu: {
    width: 210,
    minWidth: 190,
    zIndex: 610,
  },
  item: {
    position: 'relative',
    display: 'flex',
    height: {
      default: 32,
      [TOUCH]: 40,
    },
    cursor: 'pointer',
    userSelect: 'none',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 14,
    fontSize: 13,
    fontWeight: 450,
    color: {
      default: colors['--text-secondary'],
      ':is([data-highlighted])': colors['--text-primary'],
    },
    outline: '2px solid transparent',
    outlineOffset: 2,
  },
  plainItem: {
    paddingRight: 18,
    whiteSpace: 'nowrap',
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
    borderRadius: 8,
    backgroundColor: {
      default: 'transparent',
      [stylex.when.ancestor('[data-highlighted]', menuItemMarker)]: colors['--menu-item-highlight'],
    },
  },
  plainItemPill: {
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
  subTriggerPill: {
    backgroundColor: {
      default: 'transparent',
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
    gap: 12,
  },
  plainItemBody: {
    color: {
      default: null,
      [stylex.when.ancestor(':hover', menuItemMarker)]: colors['--text-primary'],
      [stylex.when.ancestor('[data-highlighted]', menuItemMarker)]: colors['--text-primary'],
    },
    whiteSpace: 'nowrap',
  },
  separator: {
    height: 9,
    paddingTop: 4,
    paddingBottom: 4,
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

export const DropdownMenuLabel: React.FC<DropdownMenuPrimitive.DropdownMenuLabelProps & { xstyle?: stylex.StyleXStyles }> = ({
  className = '',
  xstyle,
  ...props
}) => (
  <DropdownMenuPrimitive.Label
    {...withClassName(stylex.props(styles.label, xstyle), className)}
    {...props}
  />
);

export const DropdownMenuContent: React.FC<DropdownMenuPrimitive.DropdownMenuContentProps> = ({
  className = '',
  sideOffset = 4,
  align = 'start',
  ...props
}) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      sideOffset={sideOffset}
      align={align}
      {...withClassName(stylex.props(styles.content, styles.menu), `buyerly-menu ${className}`.trim())}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
);

export const DropdownMenuItem: React.FC<
  DropdownMenuPrimitive.DropdownMenuItemProps & { xstyle?: stylex.StyleXStyles }
> = ({ className = '', xstyle, children, ...props }) => (
  <DropdownMenuPrimitive.Item
    {...withClassName(stylex.props(styles.item, styles.plainItem, menuItemMarker, xstyle), className)}
    {...props}
  >
    {/* Inner Hover/Focus/Highlighted Pill */}
    <div {...stylex.props(styles.pill, styles.plainItemPill)} />

    {/* Item Content Layer */}
    <div {...stylex.props(styles.body, styles.plainItemBody)}>
      {children}
    </div>
  </DropdownMenuPrimitive.Item>
);

export const DropdownMenuSubTrigger: React.FC<DropdownMenuPrimitive.DropdownMenuSubTriggerProps> = ({
  className = '',
  children,
  ...props
}) => (
  <DropdownMenuPrimitive.SubTrigger
    {...withClassName(stylex.props(styles.item, styles.subTriggerOpen, menuItemMarker), className)}
    {...props}
  >
    <div {...stylex.props(styles.pill, styles.subTriggerPill)} />
    <div {...stylex.props(styles.body)}>{children}</div>
  </DropdownMenuPrimitive.SubTrigger>
);

export const DropdownMenuSubContent: React.FC<DropdownMenuPrimitive.DropdownMenuSubContentProps> = ({
  className = '',
  sideOffset = 4,
  ...props
}) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.SubContent
      sideOffset={sideOffset}
      {...withClassName(stylex.props(styles.content, styles.submenu), className)}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
);

export const DropdownMenuRadioItem: React.FC<
  DropdownMenuPrimitive.DropdownMenuRadioItemProps & { xstyle?: stylex.StyleXStyles }
> = ({
  className = '',
  xstyle,
  children,
  ...props
}) => (
  <DropdownMenuPrimitive.RadioItem
    {...withClassName(stylex.props(styles.item, menuItemMarker, xstyle), className)}
    {...props}
  >
    <div {...stylex.props(styles.pill)} />
    <div {...stylex.props(styles.body)}>{children}</div>
  </DropdownMenuPrimitive.RadioItem>
);

export const DropdownMenuSeparator: React.FC<DropdownMenuPrimitive.DropdownMenuSeparatorProps> = ({
  className = '',
  ...props
}) => (
  <DropdownMenuPrimitive.Separator
    {...withClassName(stylex.props(styles.separator), className)}
    {...props}
  >
    <div {...stylex.props(styles.separatorLine)} />
  </DropdownMenuPrimitive.Separator>
);
