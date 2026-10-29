import React from 'react';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { favoritePath, useFavorites, type Favorite } from '@/lib/favorites';
import { openAppPath } from '@/lib/routing';
import { SidebarLink, SidebarSection } from './SidebarSections';
import { useAddress } from '@/lib/routing';

/** The sidebar icon of what a favorite opens: the page's own, or the record's kind. */
export function favoriteIcon(favorite: Favorite): React.ReactNode {
  if (favorite.kind === 'account') return <BuyerlyIcon name="ad-accounts" size={14} />;
  if (favorite.kind === 'rule') return <BuyerlyIcon name="rules" size={14} />;
  if (favorite.kind !== 'page') return <BuyerlyIcon name="meta" size={14} />;
  const parts = favorite.path.split('/');
  if (parts.includes('my-campaigns')) return <BuyerlyIcon name="my-campaigns" size={14} />;
  if (parts.includes('rules')) return <BuyerlyIcon name="rules" size={14} />;
  if (parts.includes('accounts')) return <BuyerlyIcon name="ad-accounts" size={14} />;
  return <BuyerlyIcon name="campaigns" size={14} />;
}

/**
 * Linear's Favorites section, measured on 2026-10-24: between Workspace and
 * Your teams, shown once something is starred; each row is a sidebar item
 * with the page's icon, and a 10px × to unstar shows under the cursor. A
 * favorite lights for its page only where no other sidebar row does.
 */
export const SidebarFavorites: React.FC<{
  workspaceSlug: string;
  /** False while one of the sidebar's own rows shows the page: Linear lights that row alone. */
  lit: boolean;
}> = ({ workspaceSlug, lit }) => {
  const favorites = useFavorites((state) => state.favorites);
  const remove = useFavorites((state) => state.remove);
  const { pathname } = useAddress();
  if (favorites.length === 0) return null;
  const here = favoritePath(pathname, workspaceSlug);

  return (
    <SidebarSection id="favorites" title="Favorites">
      {favorites.map((favorite) => (
        <SidebarLink
          key={favorite.path}
          icon={favoriteIcon(favorite)}
          label={favorite.title}
          active={lit && here === favorite.path}
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
              <BuyerlyIcon name="close" size={10} />
            </span>
          )}
        />
      ))}
    </SidebarSection>
  );
};
