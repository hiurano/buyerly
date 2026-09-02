import React from 'react';
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuGroup = ContextMenuPrimitive.Group;
export const ContextMenuPortal = ContextMenuPrimitive.Portal;
export const ContextMenuSub = ContextMenuPrimitive.Sub;
export const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

export const ContextMenuContent: React.FC<ContextMenuPrimitive.ContextMenuContentProps> = ({
  className = '',
  style,
  ...props
}) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Content
      style={{
        width: '181px',
        minWidth: '179px',
        maxWidth: '500px',
        backgroundColor: 'var(--card-bg)',
        borderColor: 'var(--color-border-secondary)',
        padding: '6px 0px',
        ...style,
      }}
      className={`border rounded-[12px] shadow-[var(--dropdown-shadow)] z-[600] overflow-hidden select-none animate-scale-in outline-none ${className}`}
      {...props}
    />
  </ContextMenuPrimitive.Portal>
);

export const ContextMenuSubContent: React.FC<ContextMenuPrimitive.ContextMenuSubContentProps> = ({
  className = '',
  sideOffset = -2,
  alignOffset = -5,
  style,
  ...props
}) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.SubContent
      sideOffset={sideOffset}
      alignOffset={alignOffset}
      style={{
        width: '230px',
        minWidth: '228px',
        maxWidth: '500px',
        backgroundColor: 'var(--card-bg)',
        borderColor: 'var(--color-border-secondary)',
        padding: '0px',
        ...style,
      }}
      className={`border rounded-[12px] shadow-[var(--dropdown-shadow)] z-[600] overflow-hidden select-none animate-scale-in outline-none ${className}`}
      {...props}
    />
  </ContextMenuPrimitive.Portal>
);

export const ContextMenuItem: React.FC<
  ContextMenuPrimitive.ContextMenuItemProps
> = ({ className = '', children, ...props }) => (
  <ContextMenuPrimitive.Item
    className={`group relative flex h-[32px] cursor-pointer select-none items-center pl-[14px] pr-[18px] text-[13px] font-[450] text-[var(--text-secondary)] whitespace-nowrap outline-none data-[highlighted]:text-[var(--text-primary)] ${className}`}
    {...props}
  >
    {/* Inner Hover/Focus/Highlighted Pill */}
    <div className="pointer-events-none absolute inset-y-0 left-[6px] right-[6px] h-[32px] rounded-[8px] bg-transparent transition-colors duration-100 group-hover:bg-[var(--item-hover-bg)] group-focus:bg-[var(--item-hover-bg)] group-data-[highlighted]:bg-[var(--item-hover-bg)] group-hover:duration-0" />

    {/* Item Content Layer */}
    <div className="relative z-10 flex w-full items-center justify-between gap-2.5 group-hover:text-[var(--text-primary)] group-data-[highlighted]:text-[var(--text-primary)] whitespace-nowrap">
      {children}
    </div>
  </ContextMenuPrimitive.Item>
);

export const ContextMenuSubTrigger: React.FC<
  ContextMenuPrimitive.ContextMenuSubTriggerProps
> = ({ className = '', children, ...props }) => (
  <ContextMenuPrimitive.SubTrigger
    className={`group relative flex h-[32px] cursor-pointer select-none items-center pl-[14px] pr-[18px] text-[13px] font-[450] text-[var(--text-secondary)] whitespace-nowrap outline-none data-[highlighted]:text-[var(--text-primary)] data-[state=open]:text-[var(--text-primary)] ${className}`}
    {...props}
  >
    {/* Inner Hover Pill */}
    <div className="pointer-events-none absolute inset-y-0 left-[6px] right-[6px] h-[32px] rounded-[8px] bg-transparent transition-colors duration-100 group-hover:bg-[var(--item-hover-bg)] group-focus:bg-[var(--item-hover-bg)] group-data-[highlighted]:bg-[var(--item-hover-bg)] group-data-[state=open]:bg-[var(--item-hover-bg)] group-hover:duration-0" />

    {/* Item Content Layer */}
    <div className="relative z-10 flex w-full items-center justify-between gap-2.5 group-hover:text-[var(--text-primary)] group-data-[highlighted]:text-[var(--text-primary)] whitespace-nowrap">
      {children}
    </div>
  </ContextMenuPrimitive.SubTrigger>
);

export const ContextMenuSeparator: React.FC<ContextMenuPrimitive.ContextMenuSeparatorProps> = ({
  className = '',
  ...props
}) => (
  <ContextMenuPrimitive.Separator
    className={`h-[12px] py-[5px] box-border ${className}`}
    {...props}
  >
    <div className="h-[1px] w-full border-b border-[var(--color-border-primary)]" />
  </ContextMenuPrimitive.Separator>
);
