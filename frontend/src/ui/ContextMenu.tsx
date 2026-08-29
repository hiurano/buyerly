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
        width: '192px',
        minWidth: '191px',
        maxWidth: '500px',
        backgroundColor: '#212122',
        borderColor: '#323237',
        ...style,
      }}
      className={`bg-[#212122] border border-[#323237] rounded-[12px] shadow-[0px_3px_8px_0px_rgba(0,0,0,0.125),0px_2px_5px_0px_rgba(0,0,0,0.125),0px_1px_1px_0px_rgba(0,0,0,0.125)] z-[600] overflow-hidden select-none animate-scale-in outline-none p-0 ${className}`}
      {...props}
    />
  </ContextMenuPrimitive.Portal>
);

export const ContextMenuItem: React.FC<
  ContextMenuPrimitive.ContextMenuItemProps
> = ({ className = '', children, ...props }) => (
  <ContextMenuPrimitive.Item
    className={`group relative flex h-[32px] cursor-default select-none items-center pl-[14px] pr-[14px] text-[13px] font-[450] text-[#e4e7e8] whitespace-nowrap outline-none data-[highlighted]:text-white ${className}`}
    {...props}
  >
    {/* Inner Hover/Focus/Highlighted Pill (left: 6px, right: 6px, radius: 8px, bg: #313136) */}
    <div className="pointer-events-none absolute inset-y-0 left-[6px] right-[6px] h-[32px] rounded-[8px] bg-transparent transition-colors duration-100 group-hover:bg-[#313136] group-focus:bg-[#313136] group-data-[highlighted]:bg-[#313136] group-hover:duration-0" />

    {/* Item Content Layer */}
    <div className="relative z-10 flex w-full items-center justify-between gap-3 group-hover:text-white group-data-[highlighted]:text-white whitespace-nowrap">
      {children}
    </div>
  </ContextMenuPrimitive.Item>
);

export const ContextMenuSeparator: React.FC<ContextMenuPrimitive.ContextMenuSeparatorProps> = ({
  className = '',
  ...props
}) => (
  <ContextMenuPrimitive.Separator
    className={`h-[12px] py-[6px] box-border ${className}`}
    {...props}
  >
    <div className="h-[1px] w-full border-b border-[#323237]" />
  </ContextMenuPrimitive.Separator>
);
