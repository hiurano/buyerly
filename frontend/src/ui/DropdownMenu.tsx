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
  style,
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
        backgroundColor: '#212122',
        borderColor: '#323237',
        ...style,
      }}
      className={`bg-[#212122] border border-[#323237] rounded-[12px] shadow-[0px_3px_8px_0px_rgba(0,0,0,0.125),0px_2px_5px_0px_rgba(0,0,0,0.125),0px_1px_1px_0px_rgba(0,0,0,0.125)] z-[600] overflow-hidden select-none animate-scale-in outline-none p-0 ${className}`}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
);

export const DropdownMenuItem: React.FC<
  DropdownMenuPrimitive.DropdownMenuItemProps
> = ({ className = '', children, ...props }) => (
  <DropdownMenuPrimitive.Item
    className={`group relative flex h-[32px] cursor-default select-none items-center pl-[14px] pr-[14px] text-[13px] font-[450] text-[#e4e7e8] whitespace-nowrap outline-none data-[highlighted]:text-white ${className}`}
    {...props}
  >
    {/* Inner Hover/Focus/Highlighted Pill (left: 6px, right: 6px, radius: 8px, bg: #313136) */}
    <div className="pointer-events-none absolute inset-y-0 left-[6px] right-[6px] h-[32px] rounded-[8px] bg-transparent transition-colors duration-100 group-hover:bg-[#313136] group-focus:bg-[#313136] group-data-[highlighted]:bg-[#313136] group-hover:duration-0" />
    
    {/* Item Content Layer */}
    <div className="relative z-10 flex w-full items-center justify-between gap-3 group-hover:text-white group-data-[highlighted]:text-white whitespace-nowrap">
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
