import { BuyerlyStarFilledIcon, BuyerlyStarOutlineIcon } from '@/icons/BuyerlyIcons';
import { useFavorites, type FavoriteInput } from '@/lib/favorites';
import { Tooltip } from '@/ui/Tooltip';

/**
 * Linear's star beside a page's title, measured on 2026-10-24: a 28px round
 * header button 8px after the title, a 14px outlined star that fills yellow
 * once the page is in Favorites; a click adds or removes it.
 */
export function BuyerlyFavoriteButton({ favorite }: { favorite: FavoriteInput }) {
  const starred = useFavorites((state) => state.favorites.some((item) => item.path === favorite.path));
  const add = useFavorites((state) => state.add);
  const remove = useFavorites((state) => state.remove);
  const label = starred ? 'Remove from favorites' : 'Add to favorites';
  return (
    <Tooltip content={label}>
      <button
        type="button"
        // Linear marks it a switch; here a pressed button, since the switch role is BuyerlyToggle's alone.
        aria-pressed={starred}
        aria-label={label}
        className="buyerly-header-button buyerly-header-button--header buyerly-header-target buyerly-favorite-button"
        onClick={() => void (starred ? remove(favorite.path) : add(favorite))}
      >
        {starred
          ? <BuyerlyStarFilledIcon size={14} className="buyerly-favorite-star" />
          : <BuyerlyStarOutlineIcon size={14} />}
      </button>
    </Tooltip>
  );
}
