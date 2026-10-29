import { useEffect } from 'react';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { favoritesStore, toggleFavorite, useFavorites, type FavoriteInput } from '@/lib/favorites';
import { Tooltip } from '@/ui/Tooltip';

function isTyping(): boolean {
  const element = document.activeElement as HTMLElement | null;
  return element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA' || element?.tagName === 'SELECT'
    || Boolean(element?.isContentEditable);
}

/**
 * Linear's star beside a page's title, measured on 2026-10-24: a 28px round
 * header button 8px after the title, a 14px outlined star that fills yellow
 * once the page is in Favorites; a click, Alt+F or the command menu's
 * "Favorite page" adds or removes it.
 */
export function BuyerlyFavoriteButton({ favorite }: { favorite: FavoriteInput }) {
  const starred = useFavorites((state) => state.favorites.some((item) => item.path === favorite.path));
  const label = starred ? 'Remove from favorites' : 'Add to favorites';
  const toggle = () => void toggleFavorite(favorite);

  // While the star is on screen, the command menu offers it too.
  useEffect(() => {
    const here = { kind: favorite.kind, path: favorite.path, title: favorite.title };
    favoritesStore.setHere(here);
    return () => {
      if (favoritesStore.here === here) favoritesStore.setHere(null);
    };
  }, [favorite.kind, favorite.path, favorite.title]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // By its code: on a Mac, Alt+F types "ƒ".
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.code !== 'KeyF') return;
      if (event.defaultPrevented || event.repeat || isTyping()) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <Tooltip content={starred ? 'Unfavorite page' : 'Favorite page'} shortcut="Alt F">
      <button
        type="button"
        // Linear marks it a switch; here a pressed button, since the switch role is BuyerlyToggle's alone.
        aria-pressed={starred}
        aria-label={label}
        className="buyerly-header-button buyerly-header-button--header buyerly-header-target buyerly-favorite-button"
        onClick={toggle}
      >
        {starred
          ? <BuyerlyIcon name="favorite-filled" size={14} className="buyerly-favorite-star" />
          : <BuyerlyIcon name="favorite" size={14} />}
      </button>
    </Tooltip>
  );
}
