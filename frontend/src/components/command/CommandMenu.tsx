import React, { useEffect } from 'react';
import { Command } from 'cmdk';
import { useAppStore } from '@/store/useAppStore';
import { LinearSearchIcon } from '@/icons/LinearIcons';

export const CommandMenu: React.FC = () => {
  const { isSearchOpen, setSearchOpen } = useAppStore();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || e.key === '/') {
        e.preventDefault();
        setSearchOpen(!isSearchOpen);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [isSearchOpen, setSearchOpen]);

  if (!isSearchOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] bg-black/40 backdrop-blur-[2px] animate-scale-in"
      onClick={() => setSearchOpen(false)}
    >
      <div
        className="w-full max-w-[600px] overflow-hidden rounded-[10px] border border-[var(--color-border-secondary)] bg-[var(--card-bg)] shadow-[var(--dropdown-shadow)]"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Command Menu" className="w-full">
          {/* Search Header */}
          <div className="flex h-11 items-center gap-3 border-b border-[var(--color-border-primary)] px-3.5">
            <span className="text-[var(--text-tertiary)]">
              <LinearSearchIcon size={16} />
            </span>
            <Command.Input
              autoFocus
              placeholder="Type a command or search..."
              className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
            />
            <kbd className="rounded bg-[var(--item-hover-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-tertiary)] font-mono">
              ESC
            </kbd>
          </div>

          {/* List */}
          <Command.List className="max-h-[320px] overflow-y-auto p-1.5 select-none">
            <Command.Empty className="py-6 text-center text-[12.5px] text-[var(--text-muted)]">
              No results found.
            </Command.Empty>
          </Command.List>

          {/* Footer */}
          <div className="flex h-8 items-center justify-between border-t border-[var(--color-border-primary)] bg-[var(--bg-canvas)] px-3 text-[11px] text-[var(--text-muted)]">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="rounded bg-[var(--item-hover-bg)] px-1 py-0.5 text-[9.5px] font-mono text-[var(--text-tertiary)]">↑</kbd>
                <kbd className="rounded bg-[var(--item-hover-bg)] px-1 py-0.5 text-[9.5px] font-mono text-[var(--text-tertiary)]">↓</kbd> navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded bg-[var(--item-hover-bg)] px-1 py-0.5 text-[9.5px] font-mono text-[var(--text-tertiary)]">↵</kbd> select
              </span>
            </div>
            <span className="font-mono text-[var(--text-muted)]">Command Menu</span>
          </div>
        </Command>
      </div>
    </div>
  );
};
