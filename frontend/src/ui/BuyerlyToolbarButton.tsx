import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { colors } from '@/styles/tokens.stylex';
import { Tooltip } from '@/ui/Tooltip';
import { DisplayOptionsChangedDot } from '@/ui/BuyerlyDisplayOptions';
import { withClassName } from '@/ui/withClassName';
import css from './BuyerlyToolbarButton.module.css';

const TOUCH = '@media (hover: none) and (pointer: coarse)';

export const toolbarButtonStyles = stylex.create({
  /* BuyerlyToolbarButton: Linear's one round 28px icon button in a view (Filter, Display options, details),
     measured 17.10 and 28.10 (#556): 0.5px clear border, 14px icon in tertiary that turns primary on hover
     and while open. --header sits bare in a page header (Inbox), --toolbar on white in a list's tab row. */
  base: {
    position: 'relative',
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    width: {
      default: 28,
      [TOUCH]: 32,
    },
    minWidth: {
      default: null,
      [TOUCH]: 32,
    },
    height: {
      default: 28,
      [TOUCH]: 32,
    },
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 9999,
    color: {
      default: colors['--header-button-fg'],
      ':hover': colors['--text-primary'],
    },
    cursor: 'default',
    outlineWidth: { default: 0, ':focus-visible': 1 },
    outlineStyle: { default: 'none', ':focus-visible': 'solid' },
    outlineColor: { default: null, ':focus-visible': colors['--header-button-focus-ring'] },
    transition: 'border-color 0.15s, background-color 0.15s, color 0.15s, opacity 0.15s',
    /* As Linear's: hover and press land at once, only leaving fades over 0.15s. */
    transitionDuration: {
      default: null,
      ':hover': '0s',
      ':active': '0s',
    },
  },
  header: {
    backgroundColor: {
      default: 'transparent',
      ':hover': colors['--header-button-hover-bg'],
    },
  },
  headerActive: {
    color: colors['--text-primary'],
    backgroundColor: colors['--header-button-active-bg'],
  },
  toolbar: {
    backgroundColor: {
      default: colors['--toolbar-button-bg'],
      ':hover': colors['--toolbar-button-hover-bg'],
    },
  },
  toolbarActive: {
    color: colors['--text-primary'],
    backgroundColor: colors['--toolbar-button-active-bg'],
  },
  /* A labelled toolbar button, as Linear's "Add a member": a 16px icon and 12px text, 8px in on the left, 10 on the right. */
  labelled: {
    width: {
      default: 'auto',
      [TOUCH]: 32,
    },
    gap: 6,
    paddingTop: 0,
    paddingRight: 10,
    paddingBottom: 0,
    paddingLeft: 8,
    color: {
      default: colors['--text-secondary'],
      ':hover': colors['--text-primary'],
    },
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  labelledActive: {
    color: colors['--text-primary'],
  },
});

/**
 * Where the button sits, as Linear's: "toolbar" on a list's tab row (My issues,
 * Issues, Projects, Search) is a white circle with a 0.5px ring and a soft
 * shadow; "header" in a page header (Inbox) is bare until hovered.
 */
export type BuyerlyToolbarButtonPlacement = 'toolbar' | 'header';

interface BuyerlyToolbarButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  placement?: BuyerlyToolbarButtonPlacement;
  /** Lit while its menu, popover or pane is open. */
  active?: boolean;
  /** Linear's labelled variant: a 16px icon and 12px text, as "Add a member". */
  labelled?: boolean;
  /** StyleX overrides for the button. */
  xstyle?: stylex.StyleXStyles;
}

/**
 * Linear's one round 28px icon button for a view's Filter, Display options,
 * details and the like (measured 28.10, #556).
 * Spreads the rest so a wrapping Tooltip or menu trigger gets its handlers.
 */
export const BuyerlyToolbarButton = React.forwardRef<HTMLButtonElement, BuyerlyToolbarButtonProps>(
  ({ placement = 'toolbar', active = false, labelled = false, className, xstyle, children, ...rest }, ref) => {
    return (
      <button
        {...rest}
        ref={ref}
        type="button"
        data-active={active ? 'true' : undefined}
        {...withClassName(
          stylex.props(
            toolbarButtonStyles.base,
            placement === 'header'
              ? (active ? toolbarButtonStyles.headerActive : toolbarButtonStyles.header)
              : (active ? toolbarButtonStyles.toolbarActive : toolbarButtonStyles.toolbar),
            labelled && toolbarButtonStyles.labelled,
            labelled && active && toolbarButtonStyles.labelledActive,
            xstyle,
          ),
          placement === 'toolbar' && css.toolbar,
          `buyerly-header-button buyerly-header-button--${placement} buyerly-header-target`,
          className,
        )}
      >
        {children}
      </button>
    );
  }
);
BuyerlyToolbarButton.displayName = 'BuyerlyToolbarButton';

/**
 * Linear's tooltip under a toolbar button: centred in a page header, and on a
 * tab row lined up with the button's right edge.
 */
const toolbarTooltipAlign = (placement: BuyerlyToolbarButtonPlacement) =>
  placement === 'toolbar' ? 'end' : 'center';

interface BuyerlyDisplayOptionsButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'> {
  placement?: BuyerlyToolbarButtonPlacement;
  open: boolean;
  /** Linear's accent dot while the view differs from its default. */
  changed?: boolean;
}

/** "Show display options" (Shift V), the same on every page. */
export const BuyerlyDisplayOptionsButton = React.forwardRef<HTMLButtonElement, BuyerlyDisplayOptionsButtonProps>(
  ({ placement = 'toolbar', open, changed = false, ...rest }, ref) => (
    <Tooltip content="Show display options" shortcut="Shift V" align={toolbarTooltipAlign(placement)} disabled={open}>
      <BuyerlyToolbarButton
        {...rest}
        ref={ref}
        placement={placement}
        active={open}
        aria-label="Display options"
        aria-expanded={open}
      >
        <BuyerlyIcon name="display" size={14} />
        <DisplayOptionsChangedDot show={changed} />
      </BuyerlyToolbarButton>
    </Tooltip>
  )
);
BuyerlyDisplayOptionsButton.displayName = 'BuyerlyDisplayOptionsButton';
