import { rememberSearchReturnPath } from '@/lib/search';
import { shellStore } from '@/models/shellStore';

/** The search page's field, which `/` focuses when the page is already open. */
export const SEARCH_INPUT_SELECTOR = '[data-search-page-input]';

/**
 * Linear's `/` and the sidebar's Search button: the search page in the main
 * panel, with the sidebar still there. The second Esc there goes back to
 * where search was opened from.
 */
export function openSearchPage(): void {
  if (shellStore.activeTab === 'search') {
    document.querySelector<HTMLInputElement>(SEARCH_INPUT_SELECTOR)?.focus();
    return;
  }
  rememberSearchReturnPath(`${window.location.pathname}${window.location.search}`);
  shellStore.setActiveTab('search');
}
