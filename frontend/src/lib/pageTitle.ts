import type { ActiveTab, SettingsSection } from '@/store/useAppStore';
import type { TeamHomePage } from '@/lib/routing';

/** Settings pages by their names in Linear's tab titles ("Preferences", "Members", …). */
const SETTINGS_TITLES: Record<Exclude<SettingsSection, 'team'>, string> = {
  preferences: 'Preferences',
  profile: 'Profile',
  notifications: 'Notifications',
  'priority-notifications': 'Priority notifications',
  'email-notifications': 'Email',
  'telegram-notifications': 'Telegram',
  security: 'Security & access',
  'connected-accounts': 'Connected accounts',
  workspace: 'Workspace',
  teams: 'Teams',
  'new-team': 'Create a new team',
  members: 'Members',
  'workspace-security': 'Security',
  'rule-labels': 'Labels',
};

const TEAM_SETTINGS_TITLES: Record<string, string> = {
  '': 'Overview',
  general: 'General',
  members: 'Members',
  accounts: 'Ad accounts',
};

const TEAM_HOME_TITLES: Record<TeamHomePage, string> = {
  overview: 'Overview',
  documents: 'Documents',
  members: 'Members',
};

export interface PageTitleInput {
  activeTab: ActiveTab;
  settingsSection: SettingsSection;
  /** "<KEY>" or "<KEY>/<page>" on a team's settings. */
  settingsTeamPath: string;
  /** The name of the team whose page is on screen, once the teams have loaded. */
  teamName: (key: string) => string | null;
  activeTeamKey: string | null;
  /** Ads Manager over the accounts you lead. */
  myCampaigns?: boolean;
  teamPage?: TeamHomePage;
  inboxBadge: number;
  /** Set on a page of Rules beside the list: Recently deleted. */
  rulesPage?: string;
}

/**
 * The browser tab's title, as Linear's: the page's own name ("Members",
 * "Teams", "Preferences"), and on a team's pages "Team › Page". Pages that
 * name a record (an account, a document, a search) set their own title.
 */
export function pageTitle(input: PageTitleInput): string {
  const { activeTab, activeTeamKey } = input;
  const inTeam = (page: string) => {
    const name = activeTeamKey ? input.teamName(activeTeamKey) : null;
    return name ? `${name} › ${page}` : page;
  };
  switch (activeTab) {
    case 'inbox':
      return input.inboxBadge > 0 ? `Inbox (${input.inboxBadge})` : 'Inbox';
    case 'accounts':
      return inTeam('Ad accounts');
    case 'campaigns':
      return input.myCampaigns ? 'My campaigns' : inTeam('Campaigns');
    case 'rules':
      return input.rulesPage ? 'Recently deleted' : inTeam('Rules');
    case 'members':
      return 'Members';
    case 'teams':
      return 'Teams';
    case 'team':
      return inTeam(TEAM_HOME_TITLES[input.teamPage ?? 'overview']);
    case 'search':
      return 'Search';
    case 'preferences': {
      if (input.settingsSection !== 'team') return SETTINGS_TITLES[input.settingsSection];
      const [key = '', page = ''] = input.settingsTeamPath.split('/');
      const name = key ? input.teamName(key) : null;
      const title = TEAM_SETTINGS_TITLES[page] ?? 'Overview';
      return name ? `${name} › ${title}` : 'Teams';
    }
    default:
      return 'Buyerly';
  }
}
