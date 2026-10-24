import React, { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { GO_TO_KEYS } from '@/lib/shortcuts';
import { Tooltip } from '@/ui/Tooltip';
import { BuyerlyChatIcon, BuyerlyGearIcon, BuyerlyKeyboardIcon, BuyerlyQuestionMarkIcon } from '@/icons/BuyerlyIcons';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/DropdownMenu';
import changelogLatest from '@/lib/changelogLatest.json';

/**
 * Linear's "What's new" timeline: a dot on a dashed line that starts at the
 * first release and runs on to "Full changelog".
 */
function TimelineMark({ part }: { part: 'first' | 'middle' | 'last' }) {
  const [from, to] = part === 'first' ? [16, 32] : part === 'middle' ? [0, 32] : [0, 16];
  return (
    <svg className="buyerly-help-timeline" viewBox="0 0 16 32" aria-hidden="true">
      <line x1="8" x2="8" y1={from} y2={to} strokeWidth="2" strokeDasharray="4 4" strokeDashoffset="2" />
      <circle cx="8" cy="16" r="3" />
    </svg>
  );
}

function HelpItem({ icon, label, children }: { icon: React.ReactNode; label: string; children?: React.ReactNode }) {
  return (
    <span className="flex w-full items-center gap-2">
      <span className="buyerly-help-icon">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {children}
    </span>
  );
}

const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');

/** Something else holds the keyboard: a dialog, a menu, a palette. */
const OPEN_LAYER_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"]:not([data-state="closed"]), [cmdk-root]';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

/**
 * The Help button at the sidebar's foot and its menu, measured in Linear on
 * 2026-10-24: a round 24px button, a 270px menu 4px above it; ? opens it.
 * Of Linear's items Buyerly has Contact us, Keyboard shortcuts, Settings and
 * What's new (the two newest releases of the public changelog, then Full
 * changelog); Docs, Send flare, Linear status, Download apps and Slack
 * community have no counterpart yet.
 */
export function BuyerlyHelpMenu() {
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setSettingsSection = useAppStore((state) => state.setSettingsSection);
  const setShortcutsOpen = useAppStore((state) => state.setShortcutsOpen);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target) || document.querySelector(OPEN_LAYER_SELECTOR)) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  const openLink = (href: string) => window.open(href, '_blank', 'noopener,noreferrer');
  const releases = changelogLatest.length;

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <Tooltip content="Help">
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Open Help menu" className="buyerly-help-button">
            <BuyerlyQuestionMarkIcon size={16} />
          </button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent side="top" align="start" sideOffset={4} alignOffset={2} className="buyerly-help-menu" style={{ width: 270 }}>
        <DropdownMenuItem onSelect={() => { window.location.href = 'mailto:contact@buyerly.app'; }}>
          <HelpItem icon={<BuyerlyChatIcon size={16} />} label="Contact us" />
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
          <HelpItem icon={<BuyerlyKeyboardIcon size={16} />} label="Keyboard shortcuts">
            <span className="buyerly-help-shortcut" aria-label={IS_MAC ? 'Command /' : 'Control /'}>
              <kbd>{IS_MAC ? '⌘' : 'Ctrl'}</kbd>
              <kbd>/</kbd>
            </span>
          </HelpItem>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            setSettingsSection('preferences');
            setActiveTab('preferences');
          }}
        >
          <HelpItem icon={<BuyerlyGearIcon size={16} />} label="Settings">
            <span className="buyerly-help-shortcut" aria-label={`G, then ${GO_TO_KEYS.preferences}`}>
              <kbd>G</kbd>
              <span>then</span>
              <kbd>{GO_TO_KEYS.preferences}</kbd>
            </span>
          </HelpItem>
        </DropdownMenuItem>
        <div role="presentation" className="buyerly-help-group">What’s new</div>
        {changelogLatest.map((release, index) => (
          <DropdownMenuItem key={release.url} onSelect={() => openLink(release.url)}>
            <HelpItem icon={<TimelineMark part={index === 0 ? 'first' : 'middle'} />} label={release.title} />
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => openLink('/changelog')}>
          <HelpItem icon={<TimelineMark part={releases ? 'last' : 'first'} />} label="Full changelog" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
