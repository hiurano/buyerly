# Writing styles in StyleX

Buyerly is moving from Tailwind to StyleX, as Linear's styles are written (#501).
Until #519 removes Tailwind, both run in the same build; a component moves whole,
not class by class.

## Tokens

- The tokens are StyleX variables in `src/styles/tokens.stylex.ts`: `colors`,
  `space`, `radii`, `type`, `layout` and `motion`, each a `stylex.defineVars`.
  `colors` holds the dark values; `lightColors` (`stylex.createTheme`) holds the light ones.
- The keys keep their CSS names (`'--bg-canvas'`), so StyleX leaves them unhashed
  and Tailwind classes, `index.css` and the public website keep reading
  `var(--bg-canvas)`.
- `buyerlyTokens()` in `vite.config.ts` compiles that file into the token CSS,
  with the defaults on `:root` and `lightColors` on `html[data-theme='light']`.
  The app imports it as `virtual:buyerly-tokens.css`, and the public website's
  stylesheet includes it. The boot script in `index.html` sets `data-theme`
  from Settings → Preferences, or from the system when that is set to System.
- A value that changes between themes goes in `colors` and in `lightColors`.
  A theme added next to `lightColors` also needs its selector in `themeSelectors`
  in `vite.config.ts`. Until then the build fails.
- `tokens.css` only holds the `@font-face` rules and `color-scheme`.

## Components

- Styles live in the component's own file, in one `stylex.create` above the
  component, called `styles`. Name each key after the part it styles (`root`,
  `label`, `icon`), not after how it looks.
- Read tokens through their group: `color: colors['--text-tertiary']`. Do not
  write `'var(--text-tertiary)'` as a string.
- Apply styles with `{...stylex.props(styles.root, active && styles.active)}`.
  A component that takes styles from its parent takes a `style?: stylex.StyleXStyles` prop
  and passes it last.
- Hover, active and focus are conditions on the property, so one property
  carries all its states, as Linear's `sx-` rules do:

  ```ts
  backgroundColor: {
    default: 'transparent',
    ':hover': colors['--item-hover-bg'],
    ':active': colors['--item-active-bg'],
  },
  ```

  A state that the markup sets (`aria-selected`, `data-state`) is a style key that is applied
  conditionally, not an attribute selector.
- Write numbers for pixel lengths (`fontSize: 8`, which StyleX outputs as
  `8px`). Write strings for other units and for a unitless `lineHeight`
  (`lineHeight: 1` stays unitless).

## Build

- `stylex.vite()` runs before `reactCompiler()`, so the React Compiler sees
  class names that are already compiled. In dev the CSS is served at
  `/virtual:stylex.css` and reloads on change. In the build, it is added to
  the end of the `index-*.css` asset.
- Its lightningcss targets are Vite's default build targets, so `lch()` values
  stay as they are written, as in `index.css`.

`src/ui/SubmenuArrow.tsx` is the first component written this way.
