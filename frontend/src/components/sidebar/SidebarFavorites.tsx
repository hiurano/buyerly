import React from 'react';
import {
  BuyerlyBoltIcon,
  BuyerlyCloseIcon,
  BuyerlyIssuesIcon,
  BuyerlyMetaIcon,
  BuyerlyMyIssuesIcon,
  BuyerlyProjectIcon,
} from '@/icons/BuyerlyIcons';
import { favoritePath, useFavorites, type Favorite } from '@/lib/favorites';
import { openAppPath } from '@/lib/routing';
import { SidebarLink, SidebarSection } from './SidebarSections';

/** The sidebar icon of what a favorite opens: the page's own, or the record's kind. */
function favoriteIcon(favorite: Favorite): React.ReactNode {
  if (favorite.kind === 'account') return <BuyerlyProjectIcon size={14} />;
  if (favorite.kind === 'rule') return <BuyerlyBoltIcon size={14} />;
  if (favorite.kind !== 'page') return <BuyerlyMetaIcon size={14} />;
  const parts = favorite.path.split('/');
  if (parts.includes('my-campaigns')) return <BuyerlyMyIssuesIcon size={14} />;
  if (parts.includes('rules')) return <BuyerlyBoltIcon size={14} />;
  if (parts.includes('accounts')) return <BuyerlyProjectIcon size={14} />;
  return <BuyerlyIssuesIcon size={14} />;
}

/**
 * Linear's Favorites section, measured on 2026-10-24: between Workspace and
 * Your teams, shown once something is starred; each row is a sidebar item
 * with the page's icon, and a 10px × to unstar shows under the cursor.
 */
export const SidebarFavorites: React.FC<{ workspaceSlug: string }> = ({ workspaceSlug }) => {
  const favorites = useFavorites((state) => state.favorites);
  const remove = useFavorites((state) => state.remove);
  if (favorites.length === 0) return null;
  const here = favoritePath(window.location.pathname, workspaceSlug);

  return (
    <SidebarSection id="favorites" title="Favorites">
      {favorites.map((favorite) => (
        <SidebarLink
          key={favorite.path}
          icon={favoriteIcon(favorite)}
          label={favorite.title}
          active={here === favorite.path}
          onClick={() => openAppPath(`/${workspaceSlug}/${favorite.path}`)}
          trailing={(
            <span
              role="button"
              tabIndex={-1}
              aria-label="Remove favorite"
              className="buyerly-favorite-remove"
              onClick={(event) => {
                event.stopPropagation();
                void remove(favorite.path);
              }}
            >
              <BuyerlyCloseIcon size={10} />
            </span>
          )}
        />
      ))}
    </SidebarSection>
  );
};
