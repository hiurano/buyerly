import React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export const DropdownMenuLabel: React.FC<DropdownMenuPrimitive.DropdownMenuLabelProps> = ({
  className = '',
  ...props
}) => (
  <DropdownMenuPrimitive.Label
    className={`px-[14px] pb-1 pt-1.5 text-[11px] font-medium text-[var(--text-muted)] ${className}`}
    {...props}
  />
);

export const DropdownMenuContent: React.FC<DropdownMenuPrimitive.DropdownMenuContentProps> = ({
  className = '',
  sideOffset = 4,
  align = 'start',
  style,
  ...props
}) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      sideOffset={sideOffset}
      align={align}
      style={{
        width: '180px',
        minWidth: '175px',
        maxWidth: '500px',
        backgroundColor: 'var(--card-bg)',
        borderColor: 'var(--color-border-secondary)',
        padding: '6px 0px',
        ...style,
      }}
      className={`border rounded-[12px] shadow-[var(--dropdown-shadow)] z-[600] overflow-hidden select-none animate-scale-in outline-none ${className}`}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
);

export const DropdownMenuItem: React.FC<
  DropdownMenuPrimitive.DropdownMenuItemProps
> = ({ className = '', children, ...props }) => (
  <DropdownMenuPrimitive.Item
    className={`group relative flex h-[32px] cursor-pointer select-none items-center pl-[14px] pr-[18px] text-[13px] font-[450] text-[var(--text-secondary)] whitespace-nowrap outline-none data-[highlighted]:text-[var(--text-primary)] ${className}`}
    {...props}
  >
    {/* Inner Hover/Focus/Highlighted Pill */}
    <div className="pointer-events-none absolute inset-y-0 left-[6px] right-[6px] h-[32px] rounded-[8px] bg-transparent transition-colors duration-100 group-hover:bg-[var(--item-hover-bg)] group-focus:bg-[var(--item-hover-bg)] group-data-[highlighted]:bg-[var(--item-hover-bg)] group-hover:duration-0" />

    {/* Item Content Layer */}
    <div className="relative z-10 flex w-full items-center justify-between gap-3 group-hover:text-[var(--text-primary)] group-data-[highlighted]:text-[var(--text-primary)] whitespace-nowrap">
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
    className={`group relative flex h-[32px] cursor-pointer select-none items-center px-[14px] text-[13px] font-[450] text-[var(--text-secondary)] outline-none data-[highlighted]:text-[var(--text-primary)] data-[state=open]:text-[var(--text-primary)] ${className}`}
    {...props}
  >
    <div className="pointer-events-none absolute inset-y-0 left-[6px] right-[6px] rounded-[8px] bg-transparent group-data-[highlighted]:bg-[var(--item-hover-bg)] group-data-[state=open]:bg-[var(--item-hover-bg)]" />
    <div className="relative z-10 flex w-full items-center justify-between gap-3">{children}</div>
  </DropdownMenuPrimitive.SubTrigger>
);

export const DropdownMenuSubContent: React.FC<DropdownMenuPrimitive.DropdownMenuSubContentProps> = ({
  className = '',
  sideOffset = 4,
  style,
  ...props
}) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.SubContent
      sideOffset={sideOffset}
      style={{
        width: '210px',
        minWidth: '190px',
        backgroundColor: 'var(--card-bg)',
        borderColor: 'var(--color-border-secondary)',
        padding: '6px 0px',
        ...style,
      }}
      className={`z-[610] overflow-hidden rounded-[12px] border shadow-[var(--dropdown-shadow)] outline-none animate-scale-in ${className}`}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
);

export const DropdownMenuRadioItem: React.FC<DropdownMenuPrimitive.DropdownMenuRadioItemProps> = ({
  className = '',
  children,
  ...props
}) => (
  <DropdownMenuPrimitive.RadioItem
    className={`group relative flex h-[32px] cursor-pointer select-none items-center px-[14px] text-[13px] font-[450] text-[var(--text-secondary)] outline-none data-[highlighted]:text-[var(--text-primary)] ${className}`}
    {...props}
  >
    <div className="pointer-events-none absolute inset-y-0 left-[6px] right-[6px] rounded-[8px] bg-transparent group-data-[highlighted]:bg-[var(--item-hover-bg)]" />
    <div className="relative z-10 flex w-full items-center justify-between gap-3">{children}</div>
  </DropdownMenuPrimitive.RadioItem>
);

export const DropdownMenuSeparator: React.FC<DropdownMenuPrimitive.DropdownMenuSeparatorProps> = ({
  className = '',
  ...props
}) => (
  <DropdownMenuPrimitive.Separator
    className={`h-[9px] py-[4px] box-border ${className}`}
    {...props}
  >
    <div className="h-[1px] w-full border-b border-[var(--color-border-primary)]" />
  </DropdownMenuPrimitive.Separator>
);
