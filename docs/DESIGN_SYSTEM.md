# Buyerly Design System

Version: React UI 4.0
Owner: Product / Frontend

> Normative usage, canonical source locations and the required change process are defined in [`UI_CONTRACT.md`](UI_CONTRACT.md). This document describes product principles and the current production surfaces.

## Principles

1. **Action is not warning.** Primary, warning and destructive actions use separate semantic treatments.
2. **Readable by default.** Base interface text is at least 14px; 12px is reserved for secondary metadata.
3. **Numbers scan, identifiers copy.** Metrics use tabular numerals; monospace is reserved for IDs and technical values.
4. **State before decoration.** Loading, empty, partial, stale, error, permission and success are understandable without color.
5. **One surface per job.** Headers live on the canvas, related metrics share a divided surface, and data lists have one outer surface.
6. **Progressive shared components.** Existing React primitives are reused. A repeated pattern becomes a component in `frontend/src/ui/` instead of a page-local family.
7. **Truth over polish.** No fixture campaign, invented metric, decorative control or fake progress may look like production data.
8. **One information model.** Mobile and desktop may reflow, but they preserve terminology, actions and data meaning.

## Production architecture

- `frontend/` is the authenticated production React/Vite application;
- `frontend/src/styles/tokens.css` owns semantic visual values and light/dark theme values;
- `frontend/src/ui/` owns shared React primitives and their interaction/accessibility behavior;
- `frontend/src/styles/index.css` composes shared and domain styles while consuming semantic tokens;
- `frontend/src/components/` owns product surfaces and page-specific composition;
- `frontend/src/lib/api.ts` and `frontend/src/lib/routing.ts` own the client API and canonical routes;
- `frontend/Dockerfile` builds hashed Vite assets and copies only the public legal HTML pages from `webapp/`;
- `webapp/` is legacy authenticated UI pending retirement and is not extended with new product work.

## Tokens

The live token vocabulary is defined in `frontend/src/styles/tokens.css`. Its current groups include:

| Group | Examples | Use |
|---|---|---|
| Typography | `--font-regular`, `--font-monospace` | UI copy and technical identifiers |
| Layout | `--sidebar-width`, `--header-height` | Application shell geometry |
| Shape | `--canvas-border-radius`, `--control-border-radius` | Shared surfaces and controls |
| Surfaces | `--bg-window`, `--bg-sidebar`, `--bg-content` | Shell and content hierarchy |
| Text and borders | `--text-primary`, `--text-secondary`, `--border-subtle` | Accessible hierarchy and separation |
| Action | `--action-primary`, `--action-primary-hover` | Accessible primary actions distinct from warnings |
| Interaction | hover, focus, selected and disabled tokens | Explicit control states |
| Elevation and motion | shadow, speed and easing tokens | Menus, dialogs and state transitions |
| Domain | Ads Manager, Rules, Preferences and filter tokens | Stable product-specific semantics |

New reusable values belong in this file with a semantic name. Page-local Tailwind literals are acceptable only when truly one-off; a repeated literal is a missing token.

## Components

Implemented shared primitives:

| Component | Production source | Required states |
|---|---|---|
| Button | `Button` | primary/secondary, hover, keyboard focus, disabled |
| Tabs | `LinearTabs` | selected, hover, keyboard focus, overflow |
| DataList | `LinearDataList` | loading, empty, populated, partial/error |
| Checkbox | `LinearCheckbox` | unchecked, checked, focus, disabled |
| Toggle | `LinearToggle` | on, off, focus, disabled/busy where applicable |
| DropdownMenu | `DropdownMenu` | open, selected, keyboard navigation, dismiss |
| ContextMenu | `ContextMenu` | anchored, viewport-safe, keyboard navigation |
| Tooltip | `Tooltip` | accessible optional explanation |
| LabelPill | `LinearLabelPill` | neutral and semantic text-labelled states |
| DisplayOptions | `LinearDisplayOptions` | current selection and real state update |

IconButton, Input, Dialog, EmptyState and Skeleton are required product patterns but do not yet have one canonical React primitive. Existing implementations are migration debt. When a task touches or repeats one of these patterns, create the shared primitive in `frontend/src/ui/` before spreading another implementation.

## Current production screens

### Inbox

- shows real workspace events or an honest empty/loading/error state;
- unread state is not communicated by color alone;
- each interactive row has a real destination or handler.

### Ads Manager

- hierarchy is `Campaigns → Ad sets → Ads` and uses account/campaign data returned by the authenticated workspace API;
- Meta connection is a real OAuth flow: explanation, Facebook authorization, account discovery, explicit import and result;
- imported ad accounts are not the same entity as campaigns and must not be rendered as campaign rows;
- fixtures such as LuckySpin, RoyalBet, NeonSlots and AcePlay are development examples only and must not ship as current workspace data;
- toggles and mutations need explicit busy, success and recoverable error states; no rule is enabled as a side effect of importing an account.

### Rules

- server-owned rule definitions and assignments are distinguished from local editor state;
- dangerous actions require explicit conditions, scope and review;
- account coverage and active/inactive state use real workspace-scoped data.

### Statistics

- every number carries a real period, freshness and data-status meaning;
- unavailable or unsupported metrics render as unavailable, never as zero unless the API returned a true zero;
- mixed currency is not silently aggregated.

### Settings

- profile, workspace and connection settings preserve role and workspace boundaries;
- secrets and full access tokens are never display data.

### Auth and onboarding

- passwordless login, workspace creation and initial profile setup remain separate, comprehensible states;
- blocked invitation or whitelist checks surface a clear next action;
- authenticated product navigation is unavailable until the session and workspace are resolved.

### Meta connection dialog

- users see the purpose and requested access before leaving Buyerly;
- returning from OAuth reopens the flow at account selection;
- already imported accounts are visibly non-actionable, while eligible accounts can be selected explicitly;
- completion is shown only after the import API confirms it.

## Data integrity and state

- API data is workspace-scoped and remains the source of truth for accounts, connections, rules and metrics.
- Zustand or other client stores may hold navigation, view preferences, dialog state and optimistic state, but may not manufacture domain records.
- Cached data exposes its freshness. Partial responses preserve successful sections and identify unavailable ones.
- Account health, account activation and automation enablement are separate concepts and must have separate labels and controls.
- OAuth success means a connection exists; it does not imply that every discovered account was imported or that rules were enabled.

## Responsive contract

- `390px`: priority actions have touch-safe targets; toolbars wrap; data surfaces scroll locally when columns cannot collapse;
- `768px`: compact navigation must not create document-level horizontal overflow;
- `1024px`: content and secondary panels preserve hierarchy without covering primary data;
- `1440px`: density may increase, but line length and scan paths remain bounded;
- dialogs fit the viewport, keep close/primary actions reachable and expose internal scrolling for long content;
- every breakpoint retains the same data meaning and available safe actions.

## Migration map

| Legacy or local pattern | Production target | Migration rule |
|---|---|---|
| `webapp/css/ui-system.css` tokens | `frontend/src/styles/tokens.css` | Port only values still needed by a React consumer; do not maintain two sources. |
| Legacy `.ui-*` selector families | React primitive in `frontend/src/ui/` | Preserve useful accessibility behavior, not legacy markup for its own sake. |
| Repeated raw page buttons/inputs/dialogs | New shared React primitive | Migrate consumers incrementally when touched. |
| Page-local reusable constants | Semantic token | Promote by meaning and check all consumers. |
| Hardcoded domain fixtures | Workspace API plus explicit states | Remove from production paths; keep fixtures only in isolated development/test data. |
| Legacy authenticated routes | Canonical React workspace routes | Do not add compatibility behavior unless explicitly approved. |

## Review checklist

- production source is under `frontend/`, not legacy `webapp/`;
- shared controls and semantic tokens are reused;
- primary, warning and destructive actions are distinct;
- focus, disabled, busy, empty, partial, stale, error and success states are explicit;
- state is not communicated by color alone;
- no fixture is presented as live workspace or Meta data;
- 390 / 768 / 1024 / 1440px have no document-level overflow;
- API payloads, workspace isolation, roles and security boundaries are preserved unless explicitly in scope.
