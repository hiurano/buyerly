import React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

export const TooltipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <TooltipPrimitive.Provider delayDuration={500} skipDelayDuration={300}>
    {children}
  </TooltipPrimitive.Provider>
);

export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export interface TooltipProps {
  children: React.ReactNode;
  content: string;
  shortcut?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({
  children,
  content,
  shortcut,
  side = 'bottom',
  align = 'center',
  sideOffset = 8,
}) => {
  // Parse shortcut like "G I" into ["G", "then", "I"] or "⌥I" into ["⌥", "I"]
  const renderShortcut = () => {
    if (!shortcut) return null;

    let keys: string[] = [];
    let isSequence = false;

    if (Array.isArray(shortcut)) {
      keys = shortcut;
    } else if (shortcut.includes(' ')) {
      const parts = shortcut.split(' ');
      if (parts.length === 2 && parts[0].length === 1 && parts[1].length === 1) {
        keys = [parts[0], parts[1]];
        isSequence = true;
      } else {
        keys = parts;
      }
    } else if (shortcut.startsWith('⌥') && shortcut.length > 1) {
      keys = ['⌥', shortcut.slice(1)];
    } else if (shortcut.startsWith('⌘') && shortcut.length > 1) {
      keys = ['⌘', shortcut.slice(1)];
    } else if (shortcut.startsWith('Ctrl+') && shortcut.length > 5) {
      keys = ['Ctrl', shortcut.slice(5)];
    } else {
      keys = [shortcut];
    }

    const kbdStyle: React.CSSProperties = {
      fontFamily: 'inherit',
      fontSize: '12px',
      fontWeight: 400,
      lineHeight: '13.2px',
      textAlign: 'center',
      color: 'lch(64.714% 1.425 272 / 1)',
      backgroundColor: 'transparent',
      borderColor: 'lch(17.04% 1.93 272 / 1)',
      borderWidth: '1px',
      borderStyle: 'solid',
      borderRadius: '4px',
      padding: '2px 2px',
      minWidth: '18px',
      height: '19.2px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box',
    };

    if (isSequence) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '-1px' }}>
          <kbd aria-hidden="true" style={kbdStyle}>
            {keys[0]}
          </kbd>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 450,
              lineHeight: '1',
              color: 'lch(64.714% 1.425 272 / 1)',
              padding: '0 1px',
            }}
          >
            then
          </span>
          <kbd aria-hidden="true" style={kbdStyle}>
            {keys[1]}
          </kbd>
        </span>
      );
    }

    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '-1px' }}>
        {keys.map((key, i) => (
          <kbd key={i} aria-hidden="true" style={kbdStyle}>
            {key}
          </kbd>
        ))}
      </span>
    );
  };

  return (
    <TooltipPrimitive.Root delayDuration={500}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          className="linear-tooltip-content"
        >
          {/* Tooltip Label */}
          <span
            style={{
              fontSize: '12px',
              fontWeight: 450,
              lineHeight: '18px',
              color: 'lch(91.178% 1.425 272 / 1)',
              whiteSpace: 'nowrap',
            }}
          >
            {content}
          </span>

          {/* Shortcut Badge */}
          {renderShortcut()}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
};
