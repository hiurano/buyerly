import {
  DETAILS_PANE_STORAGE_KEY,
  defaultDetailsPanes,
  parseDetailsPanes,
  type DetailsPaneId,
  type DetailsPaneState,
} from '@/ui/detailsPaneModel';
import { makeStore, useStore } from './store';

/** The panes as this device left them; storage is optional. */
function readDetailsPanes(): Record<DetailsPaneId, DetailsPaneState> {
  try {
    return parseDetailsPanes(window.localStorage.getItem(DETAILS_PANE_STORAGE_KEY));
  } catch {
    return defaultDetailsPanes();
  }
}

function saveDetailsPanes(panes: Record<DetailsPaneId, DetailsPaneState>) {
  try {
    window.localStorage.setItem(DETAILS_PANE_STORAGE_KEY, JSON.stringify(panes));
  } catch { /* The choice still applies until the page is reloaded. */ }
}

/** Each view's details pane: open or closed and its dragged width, kept on this device. */
export class DetailsPaneStore {
  detailsPanes: Record<DetailsPaneId, DetailsPaneState> = readDetailsPanes();

  constructor() {
    makeStore(this);
  }

  /** Opens or closes a view's pane; without `open` it flips. */
  toggleDetailsPane(pane: DetailsPaneId, open?: boolean) {
    const current = this.detailsPanes[pane];
    this.save({ ...this.detailsPanes, [pane]: { ...current, open: open ?? !current.open } });
  }

  setDetailsPaneWidth(pane: DetailsPaneId, width: number) {
    this.save({ ...this.detailsPanes, [pane]: { ...this.detailsPanes[pane], width } });
  }

  private save(panes: Record<DetailsPaneId, DetailsPaneState>) {
    saveDetailsPanes(panes);
    this.detailsPanes = panes;
  }
}

export const detailsPaneStore = new DetailsPaneStore();

export const useDetailsPaneStore = <T,>(select: (store: DetailsPaneStore) => T): T => useStore(detailsPaneStore, select);
