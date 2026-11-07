// The details pane's widths, spring and saved state, as read from Linear's DetailsPaneContainer (#367).
import { describe, expect, it } from 'vitest';
import * as pane from './detailsPaneModel';

describe('details pane', () => {
  // The views' panes start closed and the account page's properties open; a saved value survives, a broken one falls back.
  it('The views\' panes start closed and the account page\'s properties open; a saved value survives, a broken one falls back', () => {
    expect(pane.parseDetailsPanes(null)).toStrictEqual({
      adsManager: { open: false, width: null }, rules: { open: false, width: null }, account: { open: true, width: null },
    });
    expect(pane.parseDetailsPanes('{"account":{"open":false,"width":null}}').account).toStrictEqual({ open: false, width: null });
    expect(pane.parseDetailsPanes('{"rules":{"open":true,"width":420}}').rules).toStrictEqual({ open: true, width: 420 });
    expect(pane.parseDetailsPanes('{"rules":{"open":"yes","width":"wide"}}').rules).toStrictEqual({ open: false, width: null });
    expect(pane.parseDetailsPanes('not json').adsManager).toStrictEqual({ open: false, width: null });
  });

  // Beside the list: 350 until dragged, the dragged width after, never past 600 or into the list's 300px.
  it('Beside the list: 350 until dragged, the dragged width after, never past 600 or into the list\'s 300px', () => {
    expect(pane.detailsPaneWidth(null, 1500, false)).toBe(350);
    // The account page's panel is Linear's project panel: 400 until dragged, 350 over the page.
    expect(pane.detailsPaneWidth(null, 1500, false, pane.DETAILS_PANE_DEFAULT_WIDTHS.account)).toBe(400);
    expect(pane.detailsPaneWidth(null, 1000, true, pane.DETAILS_PANE_DEFAULT_WIDTHS.account)).toBe(350);
    expect(pane.detailsPaneWidth(440, 1500, false)).toBe(440);
    expect(pane.detailsPaneWidth(900, 1500, false)).toBe(600);
    expect(pane.detailsPaneWidth(440, 1025, false)).toBe(395);
    // Over the list (1024px and below): always 350, the window when narrower; a drag never applies.
    expect(pane.detailsPaneWidth(440, 1000, true)).toBe(350);
    expect(pane.detailsPaneWidth(null, 320, true)).toBe(321);
    // A drag stays within 360–600 and the window's room.
    expect(pane.clampDetailsPaneWidth(200, 1500)).toBe(360);
    expect(pane.clampDetailsPaneWidth(480.4, 1500)).toBe(480);
    expect(pane.clampDetailsPaneWidth(800, 1500)).toBe(600);
    expect(pane.clampDetailsPaneWidth(800, 1100)).toBe(470);
  });

  // The spring brings 350px within 1% in about 170ms, never overshoots, and comes to rest.
  it('The spring brings 350px within 1% in about 170ms, never overshoots, and comes to rest', () => {
    let value = { position: -350, velocity: 0 } as ReturnType<typeof pane.stepSpring>;
    let elapsed = 0;
    let overshoot = false;
    let nearlyThere: number | null = null;
    while (elapsed < 1000) {
      value = pane.stepSpring(value, 0, 16);
      elapsed += 16;
      if (value.position > 0) overshoot = true;
      if (nearlyThere === null && value.position > -3.5) nearlyThere = elapsed;
      if (value.done) break;
    }
    expect(overshoot, 'the pane spring overshoots').toBe(false);
    expect(nearlyThere! >= 120 && nearlyThere! <= 260, `the pane is within 1% after ${nearlyThere}ms`).toBeTruthy();
    expect(value.done, 'the pane spring never rests').toBe(true);
    expect(value.position).toBe(0);
    const halfway = pane.stepSpring({ position: -350, velocity: 0 }, 0, 48);
    expect(halfway.position > -175 && halfway.position < 0, `after 48ms the pane is ${halfway.position}px out`).toBeTruthy();
  });

  // A swipe to the right closes it: past 50px, within 50px up or down and 300ms.
  it('A swipe to the right closes it: past 50px, within 50px up or down and 300ms', () => {
    expect(pane.isSwipeRight({ x: 10, y: 100, at: 0 }, { x: 70, y: 110, at: 200 })).toBe(true);
    expect(pane.isSwipeRight({ x: 10, y: 100, at: 0 }, { x: 70, y: 110, at: 400 })).toBe(false);
    expect(pane.isSwipeRight({ x: 10, y: 100, at: 0 }, { x: 70, y: 200, at: 100 })).toBe(false);
    expect(pane.isSwipeRight({ x: 70, y: 100, at: 0 }, { x: 10, y: 100, at: 100 })).toBe(false);
  });
});
