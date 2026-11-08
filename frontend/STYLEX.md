# Writing styles in StyleX

Buyerly's components are styled with StyleX, as Linear's styles are written
(#501). Tailwind is gone since #519. Next to StyleX there are CSS Modules for
what StyleX cannot express (#693), `src/styles/reset.css` (the element reset),
`src/styles/base.css` (html and body), the semantic classes in
`src/styles/index.css` (until #699) and the public website's stylesheet.

## The rule

1. StyleX first: a component's own look is in its `stylex.create`.
2. A CSS Module (`Component.module.css` next to the component) only for what
   StyleX does not express: an element's children (`> svg`, `> * + *`), its
   siblings (`+`, `~`), or a parent's state seen from a child
   (`[data-menu-open='true'] .icon`) where a StyleX marker does not fit.
3. No new global classes: nothing new goes in index.css, and no new markup
   reads a class from it.

## Tokens

- The tokens are StyleX variables in `src/styles/tokens.stylex.ts`: `colors`,
  `space`, `radii`, `type`, `layout` and `motion`, each a `stylex.defineVars`.
  `colors` holds the dark values; `lightColors` (`stylex.createTheme`) holds the light ones.
- The keys keep their CSS names (`'--bg-canvas'`), so StyleX leaves them unhashed
  and `index.css` and the public website keep reading
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

## Cascade layers

The app's CSS is in cascade layers, as Linear's. The order is declared once,
up front: `@layer reset, base, app.base, priority1;` opens index.html's inline
`<style>` (the first CSS the page sees) and the built `index-*.css`.
`cssLayerOrder()` in `vite.config.ts` writes it at the top of the build (the
minifier would otherwise fold it into the first blocks) and fails the build if
index.html's is missing. `src/styles/app.css` puts each file in its layer.

| Layer | What | From |
| --- | --- | --- |
| `reset` | the element reset | `reset.css` |
| `base` | `@font-face`, `color-scheme`, the token variables, html and body | `tokens.css`, `virtual:buyerly-tokens.css`, `base.css`; the splash's html background in index.html |
| `app.base` | the global classes, until #694–#698 move them out | `index.css` |
| `priority1`…`priorityN` | StyleX's rules, one layer per priority group | components (`useCSSLayers` in `vite.config.ts`) |
| no layer | CSS Modules; the rest of the splash | `*.module.css`, index.html |

- A later layer wins over an earlier one whatever the selectors, and CSS in
  no layer wins over every layer. So StyleX always beats index.css and
  reset.css, as it did before with `:not(#\#)` (now gone from its selectors),
  and a CSS Module beats the StyleX on the same element.
- Dev and build now order the same way: before, dev served StyleX's CSS ahead
  of index.css and the build after it, and the unboosted `margin`/`padding`
  shorthands could lose to index.css in one and win in the other.
- For `!important` the order turns round: an `!important` in index.css
  (`app.base`) beats StyleX's rules (which have none) and any `!important` in
  a later layer or in no layer. A class from a caller only adds properties
  the component leaves unset; an index.css rule that must restyle a StyleX
  component needs `!important`.
- Within one layer, specificity and source order decide as before: the `*`
  rule at the end of reset.css stays below reset.css's element rules
  (`code { font-feature-settings: normal }`), which is why it moved there from
  index.css rather than into `base`.
- StyleX's priority-0 rules (`@keyframes`, `defineVars`) are in no layer.

## CSS Modules

- `Sidebar.module.css` next to `Sidebar.tsx`, imported as `css` beside
  StyleX's `styles`:

  ```tsx
  import css from './Sidebar.module.css';
  <div {...withClassName(stylex.props(styles.navigation), css.navigation)}>
  ```

  ```css
  /* The sidebar's rows and sections, 1px apart: StyleX cannot style an element's children. */
  .navigation > :not([hidden]) ~ :not([hidden]) { margin-top: 1px; margin-bottom: 0; }
  ```

- Vite scopes the classes in Linear's format (`_navigation_79rru_2`). The type
  is `src/cssModules.d.ts`: each class is a `string`. Name a class after the
  part it styles, in camelCase, as a StyleX key.
- A module is in no layer, as Linear's, so it wins over the StyleX on the
  elements it reaches. Set only what those elements' StyleX leaves unset, or
  what must override it (where index.css needed `!important`).
- Browser checks find elements by role or by a semantic class the markup keeps
  for them, never by a module's or StyleX's class.

## Moving an index.css section (#694–#698)

1. Measure first: `scripts/screens-compare.ts` (below) against a checkout of
   `origin/main`, with `--only` for your screens. Add a scenario for any state
   your rules style that none covers (an open menu, a hover, the phone layout).
2. Per rule: a property of the element itself goes into the component's
   `stylex.create`; a child, sibling or parent-state selector goes into a
   module. A `:hover` becomes a condition on the property. index.css puts most
   hovers inside `@media (any-hover: hover) and (any-pointer: fine)`; keep that
   (`':hover': { default: null, '@media (any-hover: hover) and (any-pointer: fine)': value }`)
   or a tap on a phone keeps the hover colour. A `@media (width <= 767px)`
   becomes a condition too. A `[data-state='open']` or `[aria-selected='true']`
   on the element itself becomes a style key applied when the prop says so; the
   same attribute on an ancestor becomes `stylex.when.ancestor(…)` with a
   marker, or a module rule.
3. Keep the old cascade's winner. In index.css several rules on one element
   competed by specificity and order (`.a.b` over `.b`, the later of two equal
   ones); in StyleX the last style passed to `stylex.props` wins, so pass the
   more specific case last. Where StyleX and index.css set the same property
   on an element today StyleX already wins (higher layer): dropping the
   index.css declaration changes nothing. Where the index.css one has
   `!important` it wins today: its value replaces the StyleX one.
4. A module rule moves from `app.base` to no layer, so it now beats the StyleX
   on its elements, where before StyleX beat it. Check the compare's style
   lines for those elements.
5. Shorthands: StyleX splits `margin`, `padding` and `border`; index.css's
   `border: 1px solid var(--x)` becomes `borderWidth` and `borderColor`
   (reset.css sets `border-style: solid`), and a token holding a whole border
   stays an inline `style` (below).
6. Delete the index.css rules and the class from the markup, unless a browser
   check or another file still reads the class (`grep -rn` it in `frontend/src`
   and `scripts`).
7. Run the compare again: 0 differing pixels and 0 differing styles in light
   and dark, desktop and phone. Put its table in the PR.

## Comparing screens before and after

`scripts/screens-compare.ts` builds two checkouts with their own Vite, serves
each with `vite preview`, opens the same scenarios in both on the browser
checks' mock API, and compares the screenshots pixel by pixel and every
element's computed style and box (class names aside). It is not part of CI.
Make the base a detached worktree of `origin/main` with its own `npm ci`, then:

```bash
node scripts/screens-compare.ts --base ../buyerly-base                     # every scenario
node scripts/screens-compare.ts --base ../buyerly-base --only '^settings'  # names matching a regex
```

- `--head <checkout>` (default: this one), `--out <dir>` (default
  `$TMPDIR/buyerly-screens-compare`), `--jobs <n>` (scenarios at once, default
  3), `--save-all` (keep every head screenshot in `<out>/screens`, to look at),
  `--dev` (dev servers instead of builds).
- It prints `✓`/`✗` per scenario, theme and size, writes `<out>/report.md`
  (the table for the PR) and for each difference
  `<out>/differences/<name>-{base,head,diff}.png` and `<name>.txt`: each
  differing element by its place in the DOM, with `property: base → head`. It
  exits 1 if anything differs. A run of all ~54 scenarios (216 captures)
  takes about 5 minutes.
- Scenarios are in `SCENARIOS`: a path, who is signed in, a text to wait for
  and an `act` (open a menu, hover a row). The mock data is in `answer()`.
- Both sides are served at one address (`http://buyerly.test`, so Settings →
  Workspace shows the same URL) under one fixed clock, in software rendering,
  with animations and transitions shortened to 0.01ms while they draw: Chrome
  keeps a layer rasterized at the scale it had mid-animation, so a menu that
  scales in drew its icons a few pixels differently from one load to the next.
  The computed styles are read with the real durations back.
- The invite page's reload splash never goes away with this mock (on main
  too); that scenario removes it to look underneath.

## Next to index.css

- `stylex.when.ancestor(...)` and other `stylex.*` calls only compile inside
  `stylex.create`. Pulled into a module constant they reach the browser and
  throw, and the build does not catch it.
- A style that follows an ancestor's state (hover on a row, say) uses a
  marker from `src/ui/markers.stylex.ts`, set on the ancestor with
  `stylex.props(..., rowMarker)`.
- Styles that several components share can come from one module's exported
  `stylex.create` (`components/command/commandMenuStyles.ts`). A plain
  constant used inside `stylex.create` must be declared in the same file:
  imported from anywhere but a `.stylex.ts` file, it fails the build.
- StyleX styles only the element it is applied to. A child selector goes in a
  CSS Module (`Sidebar.module.css`); cmdk's group headings still use index.css
  (`.buyerly-command-group`) until #694–#698 move them.
- A token that holds a whole border (`--canvas-border`) can't go in
  `borderBottom`: StyleX splits the shorthand and the line is lost. Such
  an element keeps `style={{ borderBottom: 'var(--canvas-border)' }}`.
- reset.css gives every element `border-style: solid` and a 0 width, so a
  border needs only `borderWidth` (or one side's) and `borderColor`. Pages
  that came from Tailwind's `border-b border-[color]` colour all four sides
  with `borderColor`; keep that, so the computed style stays the same.
- Browser checks find elements by semantic class (`buyerly-data-group-title`)
  or role, never by a StyleX class.

`src/ui/SubmenuArrow.tsx` is the first component written this way; the rest
of `src/ui` followed in #513.
