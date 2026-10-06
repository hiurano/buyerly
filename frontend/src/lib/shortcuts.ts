import type { SettingsSection } from '@/store/useAppStore';

/** The pages G then a letter opens; Settings opens on its first section. */
export type GoToTarget = 'inbox' | 'campaigns' | 'rules' | 'preferences';

/**
 * Linear's "G then …": one letter per page, shown in the sidebar, the
 * workspace menu and the command menu, and handled in App.tsx. G S is
 * Settings, as in Linear.
 */
export const GO_TO_KEYS: Record<GoToTarget, string> = {
  inbox: 'I',
  campaigns: 'A',
  rules: 'R',
  preferences: 'S',
};

/** The hint as Tooltip and the menus spell it: "G I". */
export const goToShortcut = (target: GoToTarget) => `G ${GO_TO_KEYS[target]}`;

/** The page a letter after G opens, if any. */
export function goToTargetFor(key: string): GoToTarget | null {
  const letter = key.toUpperCase();
  const found = (Object.keys(GO_TO_KEYS) as GoToTarget[]).find((target) => GO_TO_KEYS[target] === letter);
  return found ?? null;
}

/** Settings opens on My account → Preferences, as the workspace menu's Settings does. */
export const GO_TO_SETTINGS_SECTION: SettingsSection = 'preferences';
