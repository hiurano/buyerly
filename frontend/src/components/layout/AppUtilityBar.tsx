import React from 'react';

export const SidebarUtilityFooter: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div className="mt-auto flex h-[36px] shrink-0 items-start gap-2 px-[10px] pt-[2px]">
    {children}
  </div>
);

export const AppUtilityBar: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div className="pointer-events-none fixed bottom-1 right-[10px] z-[94] flex h-7 items-center gap-[2px]">
    {children}
  </div>
);
