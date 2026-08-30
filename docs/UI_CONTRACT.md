# Buyerly UI Contract

Status: **mandatory**

Version: **1.0**

Applies to: authenticated pages, dialogs, drawers, generated frontend markup and all AI-assisted UI changes.

This file is the operational contract for building Buyerly UI. Product principles and screen-specific decisions live in [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md); production values and component recipes live in [`webapp/css/ui-system.css`](../webapp/css/ui-system.css).

## One source of truth

| Concern | Canonical source | Rule |
|---|---|---|
| Color, type, spacing, radius, control height, shadow, layer and motion values | `webapp/css/ui-system.css` → `:root` | Change the semantic token, never copy its literal value into a page selector. |
| Button, input, select, tab, badge, table and dialog geometry | shared selectors in `webapp/css/ui-system.css` | Page CSS may place a component, but must not redesign it. |
| Product hierarchy, surfaces, responsive and accessibility principles | `docs/DESIGN_SYSTEM.md` | A new screen must follow the same information model. |
| Behavior, ids, handlers and API payloads | `webapp/index.html` and `webapp/js/*` | A visual refactor must preserve behavior unless the task explicitly changes it. |

`webapp/css/styles.css` is the legacy/domain layer. It may describe page-specific layout and old selectors, but it is not allowed to introduce new global visual constants. `ui-system.css` is loaded last and owns the rendered design contract.

## Mandatory component recipes

| Component | Foundation class / bridge | Geometry and states |
|---|---|---|
| Primary button | `.ui-button.ui-button-primary` | 38px default height, 32px compact, 44px touch priority; default, hover, focus, disabled and busy. |
| Secondary button | `.ui-button` | Same geometry as primary; neutral surface and border. |
| Destructive button | `.ui-button.ui-button-danger` | Danger is explicit in text and color; never use brand amber as danger. |
| Icon button | `.ui-icon-button` | Square control; icon is 16×16px; accessible name is mandatory. |
| Input / textarea | `.ui-input` or a bridged native/form selector | 38px minimum height, 14px text, 8px radius; empty, filled, focus, invalid and disabled. |
| Select | `.ui-select` or a bridged select selector | Same height, border, text and focus treatment as input. |
| Tabs | `.ui-tabs` + `.ui-tab` | Selected state uses `aria-selected`; keyboard focus remains visible. |
| Badge / status | `.ui-badge` + semantic modifier | 12px metadata; state must also be readable as text/icon, never by color alone. |
| Data table | `.ui-table` or bridged table family | 40px header, 48px minimum row; exactly one outer surface and local horizontal scroll. |
| Dialog | `.ui-dialog` | Shared header/body/footer, semantic size token, sticky actions when long, mobile sheet behavior. |

Legacy classes such as `.btn`, `.form-control`, `.attio-input`, `.status-pill` and `.modal-card` are temporarily bridged by `ui-system.css`. New markup must add the foundation class instead of creating another family.

## Standard markup

```html
<button class="ui-button ui-button-primary" type="button">
  Сохранить
</button>

<label class="ui-field">
  <span class="ui-field-label">Название</span>
  <input class="ui-input" type="text" aria-describedby="nameHint">
  <span class="ui-field-hint" id="nameHint">Понятное имя для команды</span>
</label>

<button class="ui-icon-button" type="button" aria-label="Обновить">
  <!-- 16×16 icon -->
</button>
```

## Composition rules

1. A page header lives directly on the canvas; do not wrap it in a card.
2. One job gets one dominant surface. Do not put a table in a card inside another card.
3. KPI groups use a divided surface, not a grid of identical nested cards.
4. Page-specific CSS may control grid, flow, width and content emphasis. It may not redefine button/input height, typography, radius, border, focus or shadow.
5. Primary action and warning must remain visually different. Destructive actions require explicit danger treatment and confirmation proportional to impact.
6. No fake metrics, fake progress, decorative controls or controls without handlers.
7. Loading, empty, partial, error, permission, success and disabled states must be understandable without color.
8. Minimum text is 14px for actions and body; 12px is only for secondary metadata. Interactive targets are at least 36px, with 44px for priority mobile actions.
9. Unknown duration uses indeterminate progress. Motion uses tokens and respects `prefers-reduced-motion`.
10. Desktop and mobile keep the same information model. Required QA widths are 390, 768, 1024 and 1440px; document-level horizontal overflow is not allowed.

## Forbidden patterns

- new literal hex/rgb/hsl colors outside the canonical token block;
- new `*-btn`, `*-input`, `*-select`, `*-modal` geometry when a foundation component exists;
- presentation-specific inline `style="..."`;
- page-local copies of padding, height, radius, shadow, z-index or transition values owned by a semantic token;
- status communicated only by color;
- changing a shared token to fix one screen without checking all consumers.

External brand colors, user-configured colors and runtime-calculated dimensions are exceptions. The exception must be local, explained in the PR and must not become a reusable UI constant.

## Change protocol

Every UI pull request must:

1. Read this contract and `DESIGN_SYSTEM.md` before editing.
2. Reuse an existing foundation component. If none fits, add it to `ui-system.css` and document it here before using it on a page.
3. Change semantic tokens at `:root` when the change should affect every consumer.
4. Bump the `ui-system.css` cache version in `webapp/index.html` whenever production CSS changes.
5. Preserve ids, handlers, API payloads, workspace isolation and security boundaries unless explicitly in scope.
6. Update `tests/test_frontend_contract.py` when the shared contract changes.
7. Pass GitHub Actions and visually check 390/768/1024/1440px, focus, disabled/busy/error states and overflow.
8. Update `CHANGELOG.md` for user-visible or contract-level changes.

If a request conflicts with this contract, the agent must explain the conflict in the PR instead of silently creating a one-off component.
