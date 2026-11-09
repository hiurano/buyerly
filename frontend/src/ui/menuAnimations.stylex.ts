import * as stylex from '@stylexjs/stylex';

/** Linear's menu entrance: opacity 0→1 in ~40ms, scale 0.98→1 easing out over ~250ms. */
export const enter = stylex.create({
  root: {
    animationName: 'buyerlyMenuFadeIn, buyerlyMenuScaleIn',
    animationDuration: '40ms, 250ms',
    animationTimingFunction: 'linear, cubic-bezier(0.25, 0.95, 0.6, 1)',
  },
});

/** On close the scale drops back to 0.98 and it fades out. */
export const exit = stylex.create({
  root: {
    transform: 'scale(0.98)',
    pointerEvents: 'none',
    animationName: 'buyerlyMenuFadeOut',
    animationDuration: '140ms',
    animationTimingFunction: 'cubic-bezier(0.2, 0.65, 0.2, 1)',
    animationFillMode: 'forwards',
  },
});

/** The same motion on a Radix menu's own `data-state`. */
export const menuState = {
  animationName: {
    default: null,
    ':is([data-state="open"])': 'buyerlyMenuFadeIn, buyerlyMenuScaleIn',
    ':is([data-state="closed"])': 'buyerlyMenuFadeOut',
  },
  animationDuration: {
    default: null,
    ':is([data-state="open"])': '40ms, 250ms',
    ':is([data-state="closed"])': '140ms',
  },
  animationTimingFunction: {
    default: null,
    ':is([data-state="open"])': 'linear, cubic-bezier(0.25, 0.95, 0.6, 1)',
    ':is([data-state="closed"])': 'cubic-bezier(0.2, 0.65, 0.2, 1)',
  },
  animationFillMode: {
    default: null,
    ':is([data-state="closed"])': 'forwards',
  },
  transform: {
    default: null,
    ':is([data-state="closed"])': 'scale(0.98)',
  },
  pointerEvents: {
    default: null,
    ':is([data-state="closed"])': 'none',
  },
} as const;
