import React from 'react';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { Tooltip } from '@/ui/Tooltip';
import { DisplayOptionsChangedDot } from '@/ui/BuyerlyDisplayOptions';

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
}

/**
 * Linear's one round 28px icon button for a view's Filter, Display options,
 * details and the like (measured 28.10, #556; styles in .buyerly-header-button).
 * Spreads the rest so a wrapping Tooltip or menu trigger gets its handlers.
 */
export const BuyerlyToolbarButton = React.forwardRef<HTMLButtonElement, BuyerlyToolbarButtonProps>(
  ({ placement = 'toolbar', active = false, className, children, ...rest }, ref) => (
    <button
      {...rest}
      ref={ref}
      type="button"
      data-active={active ? 'true' : undefined}
      className={`buyerly-header-button buyerly-header-button--${placement} buyerly-header-target${className ? ` ${className}` : ''}`}
    >
      {children}
    </button>
  )
);
BuyerlyToolbarButton.displayName = 'BuyerlyToolbarButton';

/**
 * Linear's tooltip under a toolbar button: centred in a page header, and on a
 * tab row lined up with the button's right edge.
 */
export const toolbarTooltipAlign = (placement: BuyerlyToolbarButtonPlacement) =>
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
