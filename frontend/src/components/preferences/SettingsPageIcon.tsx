import React from 'react';
import { BuyerlyIcon, type BuyerlyIconName } from '@/icons/BuyerlyIcon';
import type { SettingsPage } from '@/lib/settingsPages';

/**
 * Each settings page's icon, as the settings sidebar draws it; Linear's
 * "Open settings…" and its command menu in Settings show the same ones.
 */
export const SettingsPageIcon: React.FC<{ section: SettingsPage; size?: number; className?: string }> = ({
  section,
  size = 16,
  className,
}) => <BuyerlyIcon name={ICONS[section]} size={size} className={className} />;

const ICONS: Record<SettingsPage, BuyerlyIconName> = {
  preferences: 'preferences',
  profile: 'user',
  notifications: 'bell',
  security: 'lock',
  'connected-accounts': 'connected',
  'rule-labels': 'label',
  workspace: 'workspace',
  teams: 'teams',
  'workspace-security': 'security',
  members: 'members',
};
