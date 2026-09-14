# Buyerly UI Contract

Status: **mandatory**

Version: **3.0**

Applies to: the production React application, authenticated pages, auth/onboarding, dialogs and every AI-assisted UI change.

This file is the operational contract for building Buyerly UI. Product principles and screen-level decisions live in [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md).

Buyerly follows the Linear design language. That decision is already encoded in [`frontend/src/styles/tokens.css`](../frontend/src/styles/tokens.css): Linear's `Inter Variable` type, their easing curves and their radii. The purpose of this contract is to keep every new screen inside that language — it does not introduce a design language of its own.

## One source of truth

| Concern | Canonical source | Rule |
|---|---|---|
| Color, type, spacing, radius, control height, shadow, layer and motion values | [`frontend/src/styles/tokens.css`](../frontend/src/styles/tokens.css) | Change or add a semantic token; do not copy a reusable literal into a page component. |
| Shared component behavior, markup and accessibility | [`frontend/src/ui/`](../frontend/src/ui/) | Reuse the React primitive where one exists. Add a shared primitive before introducing a repeated control family. |
| Shared and domain style composition | [`frontend/src/styles/index.css`](../frontend/src/styles/index.css) | May consume tokens and compose layouts, but must not become a second token source. |
| Product hierarchy, surfaces and accessibility principles | [`docs/DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) | A new screen follows the same information model and state language. |
| Behavior, routing and API payloads | `frontend/src/components/`, `frontend/src/lib/routing.ts` and `frontend/src/lib/api.ts` | A visual refactor preserves behavior, workspace isolation and security boundaries unless the task explicitly changes them. |
| Production web artifact | [`frontend/Dockerfile`](../frontend/Dockerfile) | Vite builds hashed assets from `frontend/`; manual CSS cache-version bumps are not used. |

The retired interface has been removed. `frontend/` is the only product UI. Public legal documents and their assets live in `frontend/public/` and are included in the Vite production build. Runtime user images live in `uploads/` and the durable `buyerly-uploads` volume.

## Mandatory component recipes

Use the existing primitives from `frontend/src/ui/`:

| Component | React primitive | Required contract |
|---|---|---|
| Button | `Button` | Primary and secondary variants share geometry, visible focus and disabled state. |
| Text input | `Input` | Shared height, radius, focus ring and disabled state; a page may set width, not geometry. |
| Tabs | `LinearTabs` | Selected state, keyboard focus and overflow remain accessible. |
| Data list | `LinearDataList` | One outer data surface; loading, empty, populated and error states are explicit. |
| Data states | `DataState` | Loading, empty, unavailable and error blocks are rendered through it rather than re-invented per screen. |
| Checkbox | `LinearCheckbox`, `FormCheckbox` | Labelled state is operable by keyboard and not communicated by color alone. `FormCheckbox` is for form rows where `LinearCheckbox` does not apply. |
| Toggle | `LinearToggle` | Has an accessible name, clear checked state and disabled/busy handling when applicable. |
| Menu | `DropdownMenu`, `ContextMenu` | Viewport-safe, dismissible, keyboard-operable and layered through semantic tokens. |
| Tooltip | `Tooltip` | Provides optional explanation; never hides a required action or status. |
| Label/status | `LinearLabelPill` | Semantic text or icon accompanies color. |
| Display controls | `LinearDisplayOptions` | Changes real view state and exposes the current selection. |

Tailwind utilities may be used for composition. Repeated arbitrary values for color, geometry, shadow, z-index or motion must be promoted to `tokens.css` or a shared primitive. External brand colors, user-configured colors and runtime-calculated dimensions are allowed as local, explained exceptions.

## Density and geometry

These are the values the production application actually uses. Match them; do not introduce a new step without promoting it to `tokens.css`.

- **Interface text is 12–13px.** That is the Linear scale and the measured majority of the codebase. 14–15px is for emphasis and section titles, 18–24px for page titles, 11px only for dense metadata badges. Nothing below 11px.
- **Controls are 28–32px tall.** Compact icon buttons may be 24px when they sit in a row with real spacing around them.
- **Rows, cards and dialogs** take their radius from `--control-border-radius` (8px) and `--canvas-border-radius` (12px); dialogs currently use 20px with the three-layer Linear elevation shadow.

A shared primitive owns its own geometry. If a page needs a different height for a shared control, the selector must be specific enough to win deterministically over the primitive's utility class, and the reason must be stated in a comment.

## Composition rules

1. A page header lives directly on the canvas; do not wrap it in a decorative card.
2. One job gets one dominant surface. Do not put a table in a card inside another card.
3. Page components may control grid, flow, width and content emphasis. They may not redefine shared control geometry or interaction states.
4. Primary action, warning and destructive action remain visually and textually distinct.
5. No fake metrics, fake progress, decorative controls or controls without handlers. A control whose backend cannot support it is not shipped disabled-and-silent; it is left out and recorded in the backlog.
6. Loading, empty, partial, error, permission, success and disabled states must be understandable without color.
7. Unknown duration uses indeterminate progress. Motion uses the tokens in `tokens.css`.
8. Buyerly is desktop-first. The production layout targets 1024px and wider; `index.css` contains no media queries today. A change must not create document-level horizontal overflow and must not hard-code a width that blocks a later mobile pass.
9. Server data and local UI state are visibly distinct: cached, stale, unavailable and demo data may never be presented as current Meta data.
10. Entity inventory and period metrics retain separate provenance: an entity with no activity stays visible, while unavailable fields render as unavailable rather than an invented value.

## Forbidden patterns

- new reusable literal colors or geometry outside `frontend/src/styles/tokens.css`;
- a new page-local button, input, select or status family when a shared React primitive exists or the pattern repeats;
- presentation-specific inline styles, except values that are genuinely computed at runtime;
- changing a shared token to fix one screen without checking all consumers;
- status communicated only by color;
- fixture campaigns, metrics or progress rendered as if received from Buyerly or Meta;
- reporting success from a response that was never read — an endpoint returning HTTP 200 with a per-item `errors` array has not necessarily succeeded;
- reintroducing the retired authenticated interface.

## Known gaps

Recorded so that nobody has to rediscover them, and so this contract does not claim a standard the product has not met:

- **No shared dialog primitive.** `MetaConnectionDialog`, `CreateRuleModal` and `ChangeEmailDialog` each compose Radix directly. A fourth dialog should extract a shared primitive into `frontend/src/ui/` first.
- **`prefers-reduced-motion` is not honored anywhere.** Motion tokens exist; the media query does not. Open work.
- **Mobile is unbuilt.** Full responsive support is backlog queue 8 (BL-052). Do not describe a screen as mobile-ready until it lands.

## Change protocol

Every UI pull request must:

1. Read this contract and the relevant part of `DESIGN_SYSTEM.md` before editing.
2. Reuse an existing primitive from `frontend/src/ui/`. If none fits and the pattern will repeat, add and document a shared React primitive first.
3. Change semantic values in `frontend/src/styles/tokens.css`; consume them from components or `frontend/src/styles/index.css`.
4. Preserve ids, handlers, API payloads, workspace isolation and security boundaries unless explicitly in scope.
5. Update `tests/test_react_frontend_contract.py` when the production UI contract changes. Legal route and asset coverage lives in `tests/test_legal_pages.py`.
6. Pass GitHub Actions, and check keyboard focus, disabled/busy/error states and overflow.
7. Update `CHANGELOG.md` for user-visible or contract-level changes.

Vite fingerprints production assets, so there is no manual stylesheet cache-version step. If a request conflicts with this contract, explain the conflict in the pull request instead of silently creating a one-off implementation.
