import React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';

const styles = stylex.create({
  keys: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    marginTop: -1,
  },
  kbd: {
    fontFamily: 'inherit',
    fontSize: 11,
    fontWeight: 400,
    lineHeight: '1.1',
    textAlign: 'center',
    color: colors['--text-tertiary'],
    backgroundColor: 'transparent',
    borderColor: colors['--tooltip-kbd-border'],
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderRadius: 4,
    padding: 2,
    minWidth: 18,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
  },
  then: {
    fontSize: 10,
    fontWeight: 450,
    lineHeight: '1',
    color: colors['--text-muted'],
    paddingTop: 0,
    paddingRight: 1,
    paddingBottom: 0,
    paddingLeft: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: 450,
    lineHeight: '16.5px',
    color: colors['--tooltip-fg'],
    whiteSpace: 'nowrap',
  },
});

export const TooltipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <TooltipPrimitive.Provider delayDuration={500} skipDelayDuration={300}>
    {children}
  </TooltipPrimitive.Provider>
);

export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  shortcut?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  /** Hidden while the button's own menu is open, as in Linear. */
  disabled?: boolean;
}

export const Tooltip: React.FC<TooltipProps> = ({
  children,
  content,
  shortcut,
  side = 'bottom',
  align = 'center',
  sideOffset = 8,
  disabled = false,
}) => {
  // Parse shortcut like "G I" into ["G", "then", "I"], "Shift V" into ["⇧", "V"], "Alt I" into ["⌥", "I"]
  const renderShortcut = () => {
    if (!shortcut) return null;

    let keys: string[] = [];
    let isSequence = false;

    if (Array.isArray(shortcut)) {
      keys = shortcut;
    } else if (shortcut.startsWith('Shift ') && shortcut.length > 6) {
      keys = ['⇧', shortcut.slice(6)];
    } else if (shortcut.startsWith('Alt ') && shortcut.length > 4) {
      keys = ['⌥', shortcut.slice(4)];
    } else if (shortcut.startsWith('⌥') && shortcut.length > 1) {
      keys = ['⌥', shortcut.slice(1)];
    } else if (shortcut.startsWith('⌘') && shortcut.length > 1) {
      keys = ['⌘', shortcut.slice(1)];
    } else if (shortcut.startsWith('Ctrl+') && shortcut.length > 5) {
      keys = ['Ctrl', shortcut.slice(5)];
    } else if (shortcut.includes(' ')) {
      const parts = shortcut.split(' ');
      if (parts.length === 2 && parts[0].length === 1 && parts[1].length === 1) {
        keys = [parts[0], parts[1]];
        isSequence = true;
      } else {
        keys = parts;
      }
    } else {
      keys = [shortcut];
    }

    if (isSequence) {
      return (
        <span {...stylex.props(styles.keys)}>
          <kbd aria-hidden="true" {...stylex.props(styles.kbd)}>
            {keys[0]}
          </kbd>
          <span {...stylex.props(styles.then)}>
            then
          </span>
          <kbd aria-hidden="true" {...stylex.props(styles.kbd)}>
            {keys[1]}
          </kbd>
        </span>
      );
    }

    return (
      <span {...stylex.props(styles.keys)}>
        {keys.map((key, i) => (
          <kbd key={i} aria-hidden="true" {...stylex.props(styles.kbd)}>
            {key}
          </kbd>
        ))}
      </span>
    );
  };

  return (
    <TooltipPrimitive.Root delayDuration={300} open={disabled ? false : undefined}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          className="buyerly-tooltip-content"
        >
          {/* Tooltip Content */}
          {typeof content === 'string' ? (
            <span {...stylex.props(styles.label)}>
              {content}
            </span>
          ) : (
            content
          )}

          {/* Shortcut Badge */}
          {renderShortcut()}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
};
