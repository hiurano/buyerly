# Linear-style filters for Ads Manager and Rules — implementation plan

Date: 2026-08-30
Status: implemented in the current UI package; cloud CI pending
Scope: `frontend/` Ads Manager and Rules views

## Scope correction — 2026-08-31

After visual review, the product scope was deliberately narrowed. This section
overrides the broader catalog proposed below:

- Ads Manager exposes only `Status`, `Groups` and `Rules` on Campaigns, Ad sets
  and Ads. `Platform` is not a valid filter because this workspace operates on
  Meta only.
- Rules exposes only `Status` and `Groups` for now.
- Text, number, metric and date inputs are not exposed until there is a clear
  product use case and a reviewed data contract.
- Enum value menus remain open after selection and render independent
  checkboxes, allowing several values to be selected in one pass.
- Campaign-group values reuse the filled colors from the Ads Manager sidebar;
  rule values reuse the same bolt icon, and Rules groups reuse their sidebar
  icon mapping.

## Implementation result

Implemented on 2026-08-30 after the user explicitly chose to continue in the
current dirty feature checkout. Existing unrelated changes were preserved; no
reset, commit, push or branch rewrite was performed.

- Added one canonical clause model, focused enum field registries and a shared
  predicate engine for Campaigns, Ad sets, Ads and Rules.
- Added the Linear-style root/value cascade, persistent multi-select checkboxes,
  quick value search, editable
  operator/value formula, per-clause removal, `+`, Clear, hidden-result and
  filtered-empty treatments.
- Connected the Ads Manager toolbar, per-entity catalogs, `F` shortcut and
  right-sidebar Group/Rule quick filters to the same canonical state.
- Migrated Rules list/group/board input to the same filtered result and removed
  the duplicate list-level filtering path.
- Verified a production frontend build and exercised the primary interaction
  paths in the in-app browser against `http://localhost:5173/`.

URL sharing/saved views remain intentionally outside this delivery. Filter
state persists while navigating the current SPA session, matching the scoped
toolbar workflow without introducing an unrequested routing contract.

## Goal

Implement the Filter action in Ads Manager and finish the Rules filter flow as
one coherent, reusable system. The interaction should reproduce the observable
Linear filter workflow and visual rhythm while using Buyerly's own domain
fields, data contracts and components.

This task does not copy or depend on Linear's private source code. Linear is the
behavioral and visual reference: menu structure, focus model, operator editing,
active formula, motion, sizing and keyboard interaction are recreated in the
Buyerly codebase.

## Definition of done

- The Filter button works in Campaigns, Ad sets, Ads and Rules list/board views.
- `F` opens the correct filter menu unless focus is inside an editable control.
- The menu supports root property search, category drill-down, value search,
  mouse selection and complete keyboard navigation.
- Every active condition is rendered as an editable Linear-style formula:
  property, operator and value are independently editable.
- Multiple values for one enumerated property use OR semantics; different
  conditions use AND semantics.
- Positive and negative operators work. Enum/relation clauses use Linear's
  compact `is` / `is not` labels even when the value segment summarizes several
  selected values.
- Numeric, text and date fields expose type-appropriate operators and editors.
- Results update immediately in every supported layout, including Rules board.
- The button shows active state/count, conditions can be removed individually,
  and `Clear all` restores the unfiltered view.
- Empty results explain that filters are responsible and provide a one-click
  reset.
- Filtering, active counts and hidden counts are derived once and remain
  consistent across tabs, grouping modes, sidebars and board columns.
- Focus is restored to the trigger when the popover closes; screen reader
  labels, visible focus and reduced-motion behavior are present.
- No horizontal page overflow occurs at 390, 768, 1024 or 1440 px.
- GitHub Actions is the only test runner. No local `pytest`, `unittest` or other
  local test suite is executed.

## Audit baseline

### Ads Manager

- The toolbar Filter button has no ref, state or click handler and therefore
  cannot open anything.
- Existing filtering is split across `selectedFilterGroupId` and
  `selectedFilterRuleId`, both driven from the right sidebar rather than the
  toolbar.
- Group/rule filtering starts with campaigns and indirectly narrows child ad
  sets and ads. Platform state exists but is not applied by `CampaignsView`.
- Campaigns, ad sets and ads have different useful properties, but no tab-aware
  filter catalog exists.
- Status, platform, name, related parent, metrics and dates cannot be filtered
  from the toolbar.
- The only active-state feedback is a footer message, and that message appears
  only when at least one item is hidden.

### Rules

- A substantial popover and active-filter bar already exist, including search,
  category drill-down and basic keyboard handling.
- Store types describe a facet as `{ operator, values }`, while reducers and UI
  consume facets as arrays. This is an incomplete contract and must be fixed
  before extending the feature.
- `setRulesFilterOperator` is declared but not implemented.
- Rule filtering logic is duplicated in `RulesView` and `RulesListView`.
- Board group columns apply only tab filtering and bypass the active facet
  filters, producing different results from the `All rules` column/list.
- Action, metric and scope matching inspect presentation strings with
  substring heuristics. This is fragile and can produce false matches.
- The active bar renders one pill per value and has no independently editable
  operator, so it is not yet the Linear formula interaction.
- Popover positioning is a one-time viewport calculation with no collision,
  resize or scroll handling.

## Linear interaction contract to reproduce

The implementation follows Linear's documented behavior and the live interface
inspected in the user's open Linear tab on 2026-08-30:

1. Open from the toolbar or `F`; focus immediately enters search.
2. Root view lists grouped properties and supports quick-searching both property
   names and concrete values. A concrete quick-search hit is rendered as
   `Property / Value` and can be applied directly.
3. Selecting a property opens a separate adjacent submenu; it does not replace
   the contents of the root menu. A nested family such as Dates can open a third
   menu. Each submenu independently flips left/right to remain in the viewport.
4. The parent property remains highlighted while its child menu is open. Only
   the active leaf submenu owns keyboard focus and search input.
5. `ArrowUp`/`ArrowDown` move the active option, `Enter` selects, `ArrowRight`
   opens a child, `ArrowLeft` closes one level and `Escape` closes the active
   menu level.
6. Selected enum values move to the top of a reopened value list, display a
   checked checkbox and remain multi-selectable. A separator divides selected
   and unselected values.
7. Choosing a leaf immediately updates results and closes the leaf submenu.
8. Applied filters appear in a dedicated formula row under the tabs, not as
   separate rounded pills. One condition is a joined segmented control:
   `Property | operator | value summary | remove`.
9. Clicking the operator opens a tiny searchable operator menu. Clicking the
   value reopens its value submenu. Multiple values collapse to a semantic
   summary such as `2 statuses`, while the button's accessible name contains
   the actual values.
10. A small `+` at the end of the formula opens the same root Add Filter menu.
    `Clear` is aligned to the right. Linear also shows `Save`, but Buyerly must
    not render an inert Save control; saved views remain a separate product
    capability unless they are included explicitly in the delivery scope.
11. The list/board updates immediately. Empty results say that no items match
    the filters, while the footer reports how many items are hidden and offers
    another Clear Filters action.

### Measured desktop baseline

- Root menu: 262 px wide, 12 px radius, 1 px
  `lch(21.36 1.93 272)` border, `lch(12.72 0.85 272)` surface.
- Cascading value menus are content-sized in the inspected state (217–230 px)
  and use the stronger floating-menu shadow.
- Menu/search typography: Inter Variable, 13 px.
- Search row: 36 px high.
- Option row: 32 px high with 14 px leading inset and 18 px trailing inset.
- Active formula segments: 22 px high, 12 px text, 6 px horizontal inset; only
  the outer edges receive the group radius.
- Right-side Clear/Save actions: 24 px high pill controls.

The current Buyerly Rules menu is already close in color and width, but differs
in important behavior: it replaces one menu's content instead of using a
cascade, uses 28 px rows and an 8 px radius, and renders independent capsule
pills after application.

Standard filters are the delivery target. Linear's separate AI filtering,
nested advanced AND/OR groups and saved custom views are intentionally outside
this task; the state model must remain extensible so those features can be
added without replacing the core.

## Shared architecture

### 1. Canonical filter model

Add a domain-neutral discriminated model in a dedicated filter module instead
of keeping feature-specific optional arrays in the global store.

```ts
type FilterValue = string | number | boolean | ISODateString;

type FilterOperator =
  | 'is' | 'is_not'
  | 'contains' | 'not_contains'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'before' | 'after';

interface FilterClause {
  id: string;
  field: string;
  operator: FilterOperator;
  values: FilterValue[];
}
```

Keep independent clause collections for `adsManagerFilters` and
`rulesFilters`. Ads Manager keeps independent filters per entity tab so a
Campaign-only field does not silently remove every Ad after a tab switch.

### 2. Field registry

Each filterable field is declared once with:

- stable id and user-facing label;
- section and searchable aliases;
- field type (`enum`, `relation`, `number`, `text`, `date`);
- allowed/default operators;
- dynamic or static options;
- value formatter and optional icon/color renderer;
- entity accessor used by the predicate engine.

The shared popover renders from this registry. It contains no rule/campaign
substring heuristics.

### 3. Predicate engine and selectors

Create pure functions that evaluate one clause and a clause list. Then expose
memoized selectors/hooks for:

- filtered campaigns;
- filtered ad sets;
- filtered ads;
- filtered rules;
- active clause/value count;
- hidden count for the current tab;
- filtered rules grouped for both list and board.

Different clauses are ANDed. Values inside the same enum/relation clause are
ORed for positive operators and excluded as a set for negative operators.
Numeric and date comparisons use normalized source data, not formatted labels.

### 4. Shared UI primitives

Build reusable components under `frontend/src/components/filters/`:

- `FilterButton` — trigger, active styling, count and tooltip;
- `FilterPopover` — portal root for a collision-aware cascading menu stack;
- `FilterSearchInput` — search, breadcrumb and announcements;
- `FilterPropertyList` — grouped root categories;
- `FilterValueList` — searchable multi-select values;
- `FilterOperatorMenu` — operators allowed by the field type;
- `FilterValueEditor` — number/text/date input and validation;
- `ActiveFilterFormula` and `FilterClauseSegments` — joined editable formula,
  plus action and removal;
- `FilteredEmptyState` — result count/reset treatment.

Rules and Ads Manager supply registries and state actions; they do not fork the
popover markup or keyboard state machine.

## Filter catalogs

### Ads Manager — Campaigns

- Delivery: Active, Paused.
- Platform: Meta, TikTok, Google.
- Group: current campaign groups, including Ungrouped.
- Rule: attached automation rules, including No rule.
- Name: contains / does not contain.
- Budget, Results, CPA, Spend, ROI: numeric comparisons.
- Created/date: before / after.

### Ads Manager — Ad sets

- Delivery, Platform and Name.
- Campaign relation.
- Campaign Group and Campaign Rule as explicit parent-relation filters.
- Audience contains / does not contain.
- Budget, Results, CPA, Spend and ROI numeric comparisons.
- Created/date before / after.

### Ads Manager — Ads

- Delivery, Platform and Name.
- Campaign and Ad set relations.
- Campaign Group and Campaign Rule as explicit parent-relation filters.
- Results, CPA, Spend, CTR and CPC numeric comparisons.
- Created/date before / after.

### Rules

- Status: Active, Paused, Triggered.
- Action: canonical action values rather than labels/substrings.
- Rule group, including Ungrouped.
- Platform and object scope as separate canonical fields.
- Condition metric from structured conditions.
- Campaign/account relation when supplied by production data.
- Name contains / does not contain.
- Last run before / after once represented as a timestamp.

If current mock/API data does not expose a canonical value, extend the frontend
adapter or response model first. Do not infer production semantics from display
copy such as `"$1,240 spend"` or `"15m ago"`.

## State and view behavior

- Toolbar tabs remain entity/view selectors, not hidden filters.
- Each Ads Manager tab restores its own clauses when the user returns to it.
- The Rules `All / Active / Paused` tabs compose with explicit clauses; the
  formula remains visible so contradictory combinations are understandable.
- Right-sidebar quick filters write to the same canonical clause state. There
  must not be a second invisible filter channel.
- List grouping and ordering run after filtering.
- Rules board columns are built only from the canonical filtered selector.
- Selection is preserved only for still-visible ids; bulk actions never include
  an item hidden by a newly applied filter without an explicit warning.
- Closing a popover does not clear filters. Switching top-level app sections
  keeps current filters for the session.
- URL serialization is added behind a small encoder/decoder so filtered views
  can be restored and later shared; invalid clauses fail closed and are
  discarded without breaking the view.

## Visual and responsive contract

- Reuse existing Buyerly/Linear tokens and Inter Variable font.
- Trigger remains 28 px. Menus use the measured 262 px root width, content-sized
  child widths, 32 px options, 36 px search and 12 px radius.
- The root opens below/right-aligned on desktop. Each child is an independent
  adjacent floating surface that chooses left or right and shifts vertically to
  remain inside the viewport. Narrow screens collapse the cascade into a
  width-bounded sheet with an explicit back transition.
- Motion uses the existing short scale/fade curve and respects
  `prefers-reduced-motion`.
- Active formula uses joined 22 px segments and stays on one horizontal scroll
  row on compact widths; controls never shrink into unreadable fragments.
- Colors are not the only indication of selected, invalid or excluded states.

## Implementation sequence

1. Resolve delivery isolation before coding. The current checkout is the dirty
   `feat/issue-groupheader-linear-style` branch with unrelated and overlapping
   edits. Per repository policy, finish/integrate that work first, then create a
   dedicated filter branch from updated `main`; do not stack this task on the
   current branch.
2. Preserve the completed live Linear baseline above and capture only the
   remaining narrow-width states during implementation: cascade-to-sheet
   behavior, focus return and overflow handling.
3. Introduce the shared filter types, field registry contract, predicate engine
   and serialization helpers.
4. Normalize filter-relevant entity data/adapters. Replace formatted-string
   parsing and Rules substring matching with canonical values.
5. Add shared Filter UI primitives, cascading-menu positioning and the
   keyboard/focus state machine.
6. Connect Ads Manager trigger and `F` shortcut; add per-tab catalogs and
   canonical selectors for Campaigns, Ad sets and Ads.
7. Route Ads Manager right-sidebar quick filters through canonical clauses and
   replace the footer-only status with the shared formula/empty state.
8. Migrate Rules from the incomplete facet implementation to shared clauses;
   remove duplicate filtering from `RulesView` and `RulesListView`.
9. Feed the same filtered Rules selector into every board column and list group.
10. Add operator editing, negative filters, typed numeric/text/date editors,
    active count, remove/reset and responsive collision handling.
11. Add URL round-trip restoration with strict validation and entity-tab
    namespacing.
12. Update design-system documentation and `CHANGELOG.md`.
13. Review `git log --oneline main..HEAD` and `git diff --stat main..HEAD`, push
    the isolated branch and run all automated checks only in GitHub Actions.
14. Perform Browser QA at 390, 768, 1024 and 1440 px after CI is green.

## Verification matrix

### Functional

- Apply, edit and remove every field/operator combination.
- Select one and several enum/relation values; verify positive and negative
  semantics.
- Combine two different properties; verify AND semantics.
- Verify zero, negative and decimal numeric boundaries where the metric allows
  them.
- Verify date boundaries and invalid input handling.
- Verify Campaign Group/Rule inheritance on Ad set and Ad tabs.
- Verify identical Rule results in list, grouped list and every board column.
- Verify sidebar quick filters and toolbar formula remain synchronized.
- Verify tab switch restore, section switch restore and URL reload restore.
- Verify clear-one, clear-clause and clear-all.

### Keyboard and accessibility

- `F`, arrows, Enter, Left/Right, Backspace, Escape and Tab order.
- Trigger/popover `aria-expanded`, `aria-controls`, roles and accessible names.
- Focus entry, focus containment where appropriate and focus return.
- Screen-reader announcement for result-count and validation changes.
- Visible focus, non-color state cues and reduced-motion mode.

### Layout

- 390, 768, 1024 and 1440 px.
- Long property names, many selected values and long dynamic group/rule names.
- Popover near every viewport edge, with page/sidebar scrolling.
- Empty, one-item and large option/result collections.

## CI quality gate

Add or extend frontend tests for the pure predicate engine, reducers,
serialization, keyboard transitions and integrated view consistency. Execute
them only in GitHub Actions. Inspect failures with `gh run view --log-failed`.
The pull request is not mergeable until CI is fully green.

## Risks and mitigations

- **Dirty/stacked branch:** unrelated changes could enter the PR. Mitigation:
  start from clean updated `main` and verify the branch diff before push.
- **Type contract drift:** the current Rules facet already demonstrates this.
  Mitigation: one discriminated model plus reducer/predicate tests.
- **Formatted mock values:** currency and relative time strings are not safe
  filter inputs. Mitigation: normalized raw fields and presentation-only
  formatting.
- **Board/list divergence:** separate pipelines currently disagree. Mitigation:
  one selector feeding all layouts.
- **Parent relation ambiguity:** a child may match direct fields differently
  from its campaign. Mitigation: label parent-derived properties explicitly and
  resolve them through relation adapters.
- **Popover clipping/stale position:** fixed coordinates become wrong during
  resize/scroll. Mitigation: collision-aware positioning with live updates.
- **Large option sets:** rendering every campaign/rule can become expensive.
  Mitigation: memoized registries and virtualization threshold for long lists.

## Rollback

The first delivery is frontend-only unless canonical production fields require
an API response extension. Keep filter state additive and isolated so reverting
the feature commit restores the previous views without a database migration or
data rewrite.
