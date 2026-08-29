import React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

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
      style={{
        width: '240px',
        minWidth: '240px',
        maxWidth: '500px',
        backgroundColor: 'lch(12.72% 0.85 272 / 1)', // #212122
        borderColor: 'lch(21.36% 1.93 272 / 1)',     // #323237
        borderWidth: '1px',
        borderStyle: 'solid',
        borderRadius: '12px',
        boxShadow:
          '0px 3px 8px 0px rgba(0, 0, 0, 0.125), 0px 2px 5px 0px rgba(0, 0, 0, 0.125), 0px 1px 1px 0px rgba(0, 0, 0, 0.125)',
        zIndex: 600,
        padding: '0px',
      } as React.CSSProperties}
      className={`overflow-hidden select-none animate-scale-in outline-none ${className}`}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
);

export const DropdownMenuItem: React.FC<
  DropdownMenuPrimitive.DropdownMenuItemProps
> = ({ className = '', children, ...props }) => (
  <DropdownMenuPrimitive.Item
    className={`group relative flex h-[32px] cursor-default select-none items-center pl-[14px] pr-[14px] text-[13px] font-[450] text-[#e4e7e8] whitespace-nowrap outline-none ${className}`}
    {...props}
  >
    {/* Inner Hover/Focus Pill (left: 6px, right: 6px, radius: 8px, bg: #313136) */}
    <div className="pointer-events-none absolute inset-y-0 left-[6px] right-[6px] h-[32px] rounded-[8px] bg-transparent transition-colors duration-100 group-hover:bg-[#313136] group-focus:bg-[#313136] group-hover:duration-0" />
    
    {/* Item Content Layer */}
    <div className="relative z-10 flex w-full items-center justify-between gap-3 group-hover:text-white whitespace-nowrap">
      {children}
    </div>
  </DropdownMenuPrimitive.Item>
);

export const DropdownMenuSeparator: React.FC<DropdownMenuPrimitive.DropdownMenuSeparatorProps> = ({
  className = '',
  ...props
}) => (
  <DropdownMenuPrimitive.Separator
    className={`h-[12px] py-[6px] box-border ${className}`}
    {...props}
  >
    <div className="h-[1px] w-full border-b border-[#323237]" />
  </DropdownMenuPrimitive.Separator>
);
