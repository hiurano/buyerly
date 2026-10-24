import React from 'react';
import { TeamIcon } from '@/components/preferences/TeamIcon';
import type { TeamItem } from '@/lib/teams';
import type { FavoriteInput } from '@/lib/favorites';
import { BuyerlyFavoriteButton } from '@/ui/BuyerlyFavoriteButton';
import { useShellStore } from '@/models/shellStore';

/**
 * A view's title in its header. On a team's page it reads as Linear's
 * "Team › Issues": the team's icon and name, which open the team, then the page,
 * and Linear's star 8px after it when the page can be a favorite.
 */
export const ViewTitle: React.FC<{ title: string; team?: TeamItem | null; favorite?: FavoriteInput }> = ({ title, team, favorite }) => {
  const setActiveTeamKey = useShellStore((state) => state.setActiveTeamKey);
  const setActiveTab = useShellStore((state) => state.setActiveTab);
  const heading = (
    <h2 className="overflow-hidden whitespace-nowrap text-[13px] font-medium text-[var(--text-secondary)]">{title}</h2>
  );
  const star = favorite && <span className="ml-2 flex shrink-0 items-center"><BuyerlyFavoriteButton favorite={favorite} /></span>;
  if (!team) {
    return star ? <div className="flex min-w-0 items-center">{heading}{star}</div> : heading;
  }
  return (
    <div className="flex min-w-0 items-center">
      <button
        type="button"
        className="team-breadcrumb-link"
        onClick={() => {
          setActiveTeamKey(team.key);
          setActiveTab('team');
        }}
      >
        <TeamIcon size={16} className="mr-[6px]" />
        <span className="truncate">{team.name}</span>
      </button>
      <span className="team-breadcrumb-separator" aria-hidden="true">›</span>
      {heading}
      {star}
    </div>
  );
};
