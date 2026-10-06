import type React from 'react';
import { useEffect, useRef, useSyncExternalStore } from 'react';

/** One row of the command menu. */
export interface PaletteCommand {
  id: string;
  label: string;
  /** Other words that find it: "campaigns" finds Ads Manager. */
  keywords?: string[];
  icon: React.ReactNode;
  /** The shortcut shown on the right, as Tooltip spells it: "C", "G I", "Shift ⌫". */
  shortcut?: string;
  run: () => void;
}

/** A heading and its rows; Linear keeps the groups' order while filtering. */
export interface PaletteGroup {
  heading: string;
  commands: PaletteCommand[];
}

/**
 * Linear's command menu opens with the page's own group ("Notifications" in
 * Inbox). The open page registers it here while it is mounted.
 */
let pageGroup: PaletteGroup | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePageGroup(): PaletteGroup | null {
  return useSyncExternalStore(subscribe, () => pageGroup);
}

/** Registers the page's group; `run` always calls the latest render's handlers. */
export function usePageCommands(group: PaletteGroup | null): void {
  const latest = useRef(group);
  latest.current = group;
  const shape = group ? `${group.heading}|${group.commands.map((command) => `${command.id}:${command.label}:${command.shortcut ?? ''}`).join(',')}` : '';

  useEffect(() => {
    const current = latest.current;
    if (!current) return undefined;
    const registered: PaletteGroup = {
      heading: current.heading,
      commands: current.commands.map((command) => ({
        ...command,
        run: () => latest.current?.commands.find((next) => next.id === command.id)?.run(),
      })),
    };
    pageGroup = registered;
    listeners.forEach((listener) => listener());
    return () => {
      if (pageGroup !== registered) return;
      pageGroup = null;
      listeners.forEach((listener) => listener());
    };
  }, [shape]);
}
