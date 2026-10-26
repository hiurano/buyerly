import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { TeamIcon } from '@/components/preferences/TeamIcon';
import type { TeamItem } from '@/lib/teams';
import type { FavoriteInput } from '@/lib/favorites';
import { BuyerlyFavoriteButton } from '@/ui/BuyerlyFavoriteButton';
import { useShellStore } from '@/models/shellStore';
import { colors } from '@/styles/tokens.stylex';

const styles = stylex.create({
  heading: {
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-secondary'],
  },
  // Linear's star, 8px after the title.
  star: {
    marginLeft: 8,
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
  },
  root: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
  },
  teamIcon: {
    marginRight: 6,
  },
  teamName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

/**
 * A view's title in its header. On a team's page it reads as Linear's
 * "Team › Issues": the team's icon and name, which open the team, then the page,
 * and Linear's star 8px after it when the page can be a favorite.
 */
export const ViewTitle: React.FC<{ title: string; team?: TeamItem | null; favorite?: FavoriteInput }> = ({ title, team, favorite }) => {
  const setActiveTeamKey = useShellStore((state) => state.setActiveTeamKey);
  const setActiveTab = useShellStore((state) => state.setActiveTab);
  const heading = (
    <h2 {...stylex.props(styles.heading)}>{title}</h2>
  );
  const star = favorite && <span {...stylex.props(styles.star)}><BuyerlyFavoriteButton favorite={favorite} /></span>;
  if (!team) {
    return star ? <div {...stylex.props(styles.root)}>{heading}{star}</div> : heading;
  }
  return (
    <div {...stylex.props(styles.root)}>
      <button
        type="button"
        className="team-breadcrumb-link"
        onClick={() => {
          setActiveTeamKey(team.key);
          setActiveTab('team');
        }}
      >
        <TeamIcon size={16} className={stylex.props(styles.teamIcon).className} />
        <span {...stylex.props(styles.teamName)}>{team.name}</span>
      </button>
      <span className="team-breadcrumb-separator" aria-hidden="true">›</span>
      {heading}
      {star}
    </div>
  );
};
