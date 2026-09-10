# Buyerly UI Contract

Status: **mandatory**

Version: **2.0**

Applies to: the production React application, authenticated pages, auth/onboarding, dialogs, responsive layout and every AI-assisted UI change.

This file is the operational contract for building Buyerly UI. Product principles and screen-level decisions live in [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md).

## One source of truth

| Concern | Canonical source | Rule |
|---|---|---|
| Color, type, spacing, radius, control height, shadow, layer and motion values | [`frontend/src/styles/tokens.css`](../frontend/src/styles/tokens.css) | Change or add a semantic token; do not copy a reusable literal into a page component. |
| Shared component behavior, markup and accessibility | [`frontend/src/ui/`](../frontend/src/ui/) | Reuse the React primitive where one exists. Add a shared primitive before introducing a repeated control family. |
| Shared and domain style composition | [`frontend/src/styles/index.css`](../frontend/src/styles/index.css) | May consume tokens and compose layouts, but must not become a second token source. |
| Product hierarchy, surfaces, responsive and accessibility principles | [`docs/DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) | A new screen follows the same information model and state language. |
| Behavior, routing and API payloads | `frontend/src/components/`, `frontend/src/lib/routing.ts` and `frontend/src/lib/api.ts` | A visual refactor preserves behavior, workspace isolation and security boundaries unless the task explicitly changes them. |
| Production web artifact | [`frontend/Dockerfile`](../frontend/Dockerfile) | Vite builds hashed assets from `frontend/`; manual CSS cache-version bumps are not used. |

`webapp/` is not the authenticated production application. It is retained temporarily as legacy code, while `privacy.html`, `terms.html` and `data-deletion.html` are copied into the production image. Do not add new authenticated product behavior or UI foundations to `webapp/`.

## Mandatory component recipes

Use the existing primitives from `frontend/src/ui/`:

| Component | React primitive | Required contract |
|---|---|---|
| Button | `Button` | Primary and secondary variants share geometry, visible focus and disabled state. |
| Tabs | `LinearTabs` | Selected state, keyboard focus and overflow remain accessible. |
| Data list | `LinearDataList` | One outer data surface; loading, empty, populated and error states are explicit. |
| Checkbox | `LinearCheckbox` | Labelled state is operable by keyboard and not communicated by color alone. |
| Toggle | `LinearToggle` | Has an accessible name, clear checked state and disabled/busy handling when applicable. |
| Menu | `DropdownMenu`, `ContextMenu` | Viewport-safe, dismissible, keyboard-operable and layered through semantic tokens. |
| Tooltip | `Tooltip` | Provides optional explanation; never hides a required action or status. |
| Label/status | `LinearLabelPill` | Semantic text or icon accompanies color. |
| Display controls | `LinearDisplayOptions` | Changes real view state and exposes the current selection. |

There is not yet a canonical shared Input or Dialog primitive in the React application. Existing screens may keep their current implementation until touched. Any task that introduces a second reusable version must first add an appropriately scoped component under `frontend/src/ui/`, backed by semantic tokens and documented here.

Tailwind utilities may be used for composition. Repeated arbitrary values for color, geometry, shadow, z-index or motion must be promoted to `tokens.css` or a shared primitive. External brand colors, user-configured colors and runtime-calculated dimensions are allowed as local, explained exceptions.

## Composition rules

1. A page header lives directly on the canvas; do not wrap it in a decorative card.
2. One job gets one dominant surface. Do not put a table in a card inside another card.
3. Page components may control grid, flow, width and content emphasis. They may not redefine shared control geometry or interaction states.
4. Primary action, warning and destructive action remain visually and textually distinct.
5. No fake metrics, fake progress, decorative controls or controls without handlers.
6. Loading, empty, partial, error, permission, success and disabled states must be understandable without color.
7. Minimum text is 14px for actions and body; 12px is only for secondary metadata. Interactive targets are at least 36px, with 44px for priority mobile actions.
8. Unknown duration uses indeterminate progress. Motion uses tokens and respects `prefers-reduced-motion`.
9. Desktop and mobile keep the same information model. Required QA widths are 390, 768, 1024 and 1440px; document-level horizontal overflow is not allowed.
10. Server data and local UI state are visibly distinct: cached, stale, unavailable and demo data may never be presented as current Meta data.
11. Entity inventory and period metrics retain separate provenance: an entity with no activity stays visible, while unavailable fields render as unavailable rather than an invented value.

## Forbidden patterns

- new reusable literal colors or geometry outside `frontend/src/styles/tokens.css`;
- a new page-local button, input, select, modal or status family when a shared React primitive exists or the pattern repeats;
- presentation-specific inline styles, except values that are genuinely computed at runtime;
- changing a shared token to fix one screen without checking all consumers;
- status communicated only by color;
- fixture campaigns, metrics or progress rendered as if received from Buyerly or Meta;
- new authenticated product work in the legacy `webapp/` application.

## Change protocol

Every UI pull request must:

1. Read this contract and the relevant part of `DESIGN_SYSTEM.md` before editing.
2. Reuse an existing primitive from `frontend/src/ui/`. If none fits and the pattern will repeat, add and document a shared React primitive first.
3. Change semantic values in `frontend/src/styles/tokens.css`; consume them from components or `frontend/src/styles/index.css`.
4. Preserve ids, handlers, API payloads, workspace isolation and security boundaries unless explicitly in scope.
5. Update `tests/test_react_frontend_contract.py` when the production UI contract changes. Legacy tests may remain only as retirement protection for `webapp/`.
6. Pass GitHub Actions and visually check 390/768/1024/1440px, keyboard focus, disabled/busy/error states and overflow.
7. Update `CHANGELOG.md` for user-visible or contract-level changes.

Vite fingerprints production assets, so there is no manual stylesheet cache-version step. If a request conflicts with this contract, explain the conflict in the pull request instead of silently creating a one-off implementation.
