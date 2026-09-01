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
  content: React.ReactNode;
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
  sideOffset = 6,
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

    const kbdStyle: React.CSSProperties = {
      fontFamily: 'inherit',
      fontSize: '11px',
      fontWeight: 500,
      lineHeight: '1',
      textAlign: 'center',
      color: 'var(--text-tertiary)',
      backgroundColor: 'transparent',
      borderColor: 'var(--color-border-secondary)',
      borderWidth: '1px',
      borderStyle: 'solid',
      borderRadius: '4px',
      padding: '0 4px',
      minWidth: '18px',
      height: '18px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box',
    };

    if (isSequence) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
          <kbd aria-hidden="true" style={kbdStyle}>
            {keys[0]}
          </kbd>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 450,
              lineHeight: '1',
              color: 'var(--text-muted)',
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
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
        {keys.map((key, i) => (
          <kbd key={i} aria-hidden="true" style={kbdStyle}>
            {key}
          </kbd>
        ))}
      </span>
    );
  };

  return (
    <TooltipPrimitive.Root delayDuration={300}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          className="linear-tooltip-content"
        >
          {/* Tooltip Content */}
          {typeof content === 'string' ? (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 450,
                lineHeight: '16px',
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
              }}
            >
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
