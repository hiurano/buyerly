import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { TeamIcon } from '@/components/preferences/TeamIcon';
import type { TeamItem } from '@/lib/teams';
import type { FavoriteInput } from '@/lib/favorites';
import { BuyerlyFavoriteButton } from '@/ui/BuyerlyFavoriteButton';
import { colors } from '@/styles/tokens.stylex';
import { openTab } from '@/lib/navigation';

const HOVER = '@media (any-hover: hover) and (any-pointer: fine)';

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
  // A team page's header, as Linear's "Team › Issues": the team links to it, a dim "›", the page.
  breadcrumbLink: {
    display: 'inline-flex',
    minWidth: 0,
    alignItems: 'center',
    height: 24,
    marginTop: 0,
    marginRight: -5,
    marginBottom: 0,
    marginLeft: -4,
    paddingTop: 0,
    paddingRight: 5,
    paddingBottom: 0,
    paddingLeft: 4,
    borderRadius: 8,
    backgroundColor: {
      default: null,
      ':hover': {
        default: null,
        [HOVER]: colors['--item-hover-bg'],
      },
    },
    color: {
      default: colors['--text-secondary'],
      ':hover': {
        default: null,
        [HOVER]: colors['--text-primary'],
      },
    },
    fontSize: 13,
    // Linear's team name in the header is 450, lighter than a page title's 500.
    fontWeight: 450,
    cursor: 'default',
    outline: {
      default: 'none',
      ':focus-visible': `1px solid ${colors['--focus-ring-color']}`,
    },
    outlineOffset: {
      default: null,
      ':focus-visible': -1,
    },
  },
  breadcrumbSeparator: {
    marginTop: -2,
    marginRight: 8,
    marginBottom: 0,
    marginLeft: 8,
    color: colors['--breadcrumb-separator-fg'],
    fontSize: 13,
    fontWeight: 500,
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
        {...stylex.props(styles.breadcrumbLink)}
        onClick={() => {
          openTab('team', { teamKey: team.key });
        }}
      >
        <TeamIcon size={16} className={stylex.props(styles.teamIcon).className} />
        <span {...stylex.props(styles.teamName)}>{team.name}</span>
      </button>
      <span {...stylex.props(styles.breadcrumbSeparator)} aria-hidden="true">›</span>
      {heading}
      {star}
    </div>
  );
};
