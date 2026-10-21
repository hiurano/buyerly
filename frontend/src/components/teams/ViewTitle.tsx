import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { TeamIcon } from '@/components/preferences/TeamIcon';
import type { TeamItem } from '@/lib/teams';

/**
 * A view's title in its header. On a team's page it reads as Linear's
 * "Team › Issues": the team's icon and name, which open the team, then the page.
 */
export const ViewTitle: React.FC<{ title: string; team?: TeamItem | null }> = ({ title, team }) => {
  const openTeamSettings = useAppStore((state) => state.openTeamSettings);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const heading = (
    <h2 className="overflow-hidden whitespace-nowrap text-[13px] font-medium text-[var(--text-secondary)]">{title}</h2>
  );
  if (!team) return heading;
  return (
    <div className="flex min-w-0 items-center">
      <button
        type="button"
        className="team-breadcrumb-link"
        onClick={() => {
          openTeamSettings(team.key);
          setActiveTab('preferences');
        }}
      >
        <TeamIcon size={16} className="mr-[6px]" />
        <span className="truncate">{team.name}</span>
      </button>
      <span className="team-breadcrumb-separator" aria-hidden="true">›</span>
      {heading}
    </div>
  );
};
