# Buyerly Design System

Version: React UI 4.0
Owner: Product / Frontend

> Normative usage, canonical source locations and the required change process are defined in [`UI_CONTRACT.md`](UI_CONTRACT.md). This document describes product principles and the current production surfaces.

## Principles

1. **Action is not warning.** Primary, warning and destructive actions use separate semantic treatments.
2. **Dense like Linear, readable anyway.** Base interface text is 12–13px, matching the Linear scale the tokens encode; 14–15px carries emphasis and section titles, 11px is the floor and only for metadata badges.
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
- `frontend/Dockerfile` builds hashed Vite assets and includes legal documents and assets from `frontend/public/`;
- the retired authenticated interface has been removed.

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
| Domain | Ads Manager, Rules, Statistics, Preferences and filter tokens | Stable product-specific semantics |

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
| Input | `Input` | text, search, placeholder, focus, disabled |
| LabelPill | `LinearLabelPill` | neutral and semantic text-labelled states |
| DisplayOptions | `LinearDisplayOptions` | current selection and real state update |

IconButton, Dialog, EmptyState and Skeleton are required product patterns but do not yet have one canonical React primitive. Existing implementations are migration debt. When a task touches or repeats one of these patterns, create the shared primitive in `frontend/src/ui/` before spreading another implementation.

## Current production screens

### Inbox

- shows real workspace events or an honest empty/loading/error state;
- reads the append-only activity stream from `/api/audit-events`; it does not invent read, archive, snooze or delete state that the audit model does not store;
- supports server-backed status filters, search and pagination, while detail renders presentation-safe event fields instead of raw state payloads;
- offers Undo only when the server returns `can_undo`, and leaves authorization and safety checks to the workspace-scoped undo endpoint;
- each interactive row has a real destination or handler;
- switches from the desktop master/detail split to one pane at a time below `md`, with an explicit Back action from event detail.

### Ads Manager

- hierarchy is `Campaigns → Ad sets → Ads` and uses account/campaign data returned by the authenticated workspace API;
- identity, name, parent relationship, delivery status and supported budget come from Meta inventory at campaign, ad set and ad level, while period metrics come from Insights; an entity remains visible when its period activity is zero;
- level tabs, primary and sidebar filters, grouping, supported column visibility and ordering operate on the selected account's live hierarchy; board and ROI controls remain unavailable until their server data exists;
- Meta connection is a real OAuth flow: explanation, Facebook authorization, account discovery, explicit import and result;
- imported ad accounts are not the same entity as campaigns and must not be rendered as campaign rows;
- fixtures such as LuckySpin, RoyalBet, NeonSlots and AcePlay are development examples only and must not ship as current workspace data;
- toggles and mutations need explicit busy, success and recoverable error states; no rule is enabled as a side effect of importing an account.

### Rules

- server-owned rule definitions and assignments are distinguished from local editor state;
- dangerous actions require explicit conditions, scope and review;
- account coverage and active/inactive state use real workspace-scoped data.

### Statistics

Statistics is an operational console, not an analytics dashboard. Its order is
spend → economics → volume → where → why, and a metric earns a place on the
first screen only by causing a frequent decision.

- keeps the restored individual overview cards, header filter/display menus and search beside the entity tabs (below them on mobile); this user-requested composition is a scoped exception to the divided-summary-surface principle;

- selects one imported workspace account and reads campaign, ad-set or ad facts through the workspace-isolated hierarchy API;
- supported periods are Today, Yesterday, Last 3 days and Last 7 days, matching the API vocabulary; Today is labelled as an open period whose conversions are still provisional;
- the context line names the account, period and the account's reporting timezone, and identifies the Analytics Fact Store freshness timestamp;
- the overview is four cards — spend, cost per result, result volume, delivery — derived from the currently loaded rows;
- **Primary result** is a semantic role, not a fixed metric: the conversion event with the highest real volume is used, and it can be overridden in display options. The cost card follows the same choice;
- the table carries only entity identity and delivery, spend, results and cost per result. CTR, CPC, CPM, frequency, reach, impressions, link and funnel metrics live in a per-row diagnostics panel that opens in place;
- clicking an entity drills into its children with the same columns and a breadcrumb back; a level tab returns to the account-wide view;
- **a row below the result floor is reported as undecidable, which is a different statement from performing badly.** No row is colored as a problem on a sample too small to judge;
- **the verdict comes from the ad account's own declaration, or not at all.** An ad account declares its primary result and the cost target for it in Settings → Ad accounts; Statistics then reports each row as on target, watch or needs attention. A target names the event it applies to, so it is used only while that event is the one on screen;
- an ad account that has declared nothing reports cost per result without a verdict, and the overview states the absent target once rather than on every line;
- comparison to a previous period, trend series, revenue/ROAS and delivery mutations stay absent until server contracts exist;
- every number carries a real period, freshness and data-status meaning;
- unavailable or unsupported metrics render as unavailable, never as zero unless the API returned a true zero;
- mixed currency is not silently aggregated.

### Settings

- profile, workspace and connection settings preserve role and workspace boundaries;
- **Ad accounts** is where an ad account declares the conversion event it is buying and the cost target for it. Clearing the declared result clears the target with it, because a cost target without the event it applies to cannot be interpreted;
- the target is stored and shown in the ad account's own currency, and is never converted between currencies;
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

Buyerly is desktop-first today. The production layout targets `1024px` and wider, and `frontend/src/styles/index.css` contains no media queries. What is required now:

- no document-level horizontal overflow at the widths the product actually serves;
- dialogs fit the viewport, keep close/primary actions reachable and expose internal scrolling for long content;
- no hard-coded width that would block a later mobile pass.

Full mobile support — touch-safe targets, wrapping toolbars, compact navigation — is open work in backlog queue 8 (BL-052). Until it ships, no screen is described as mobile-ready.

## Migration map

| Legacy or local pattern | Production target | Migration rule |
|---|---|---|
| Retired vanilla UI tokens | `frontend/src/styles/tokens.css` | Port only values still needed by a React consumer; do not maintain two sources. |
| Legacy `.ui-*` selector families | React primitive in `frontend/src/ui/` | Preserve useful accessibility behavior, not legacy markup for its own sake. |
| Repeated raw page buttons/inputs/dialogs | New shared React primitive | Migrate consumers incrementally when touched. |
| Page-local reusable constants | Semantic token | Promote by meaning and check all consumers. |
| Hardcoded domain fixtures | Workspace API plus explicit states | Remove from production paths; keep fixtures only in isolated development/test data. |
| Legacy authenticated routes | Canonical React workspace routes | Do not add compatibility behavior unless explicitly approved. |

## Review checklist

- production source is under `frontend/`, with public documents in `frontend/public/`;
- shared controls and semantic tokens are reused;
- primary, warning and destructive actions are distinct;
- focus, disabled, busy, empty, partial, stale, error and success states are explicit;
- state is not communicated by color alone;
- no fixture is presented as live workspace or Meta data;
- no document-level horizontal overflow at desktop widths;
- API payloads, workspace isolation, roles and security boundaries are preserved unless explicitly in scope.

## Ads Manager filter layers

Main conditions are encoded in the URL along with the ad account and entity level.
Multi-membership fields support include-all, include-any and both exclusion modes.
`LinearFacetSidebar` counts the main-filter result before applying one quick selection.
Selecting another value replaces that selection; changing facet tabs clears it.
Quick selections are scoped to route/account/entity in session storage, outside the URL.
Display grouping and ordering apply afterwards; a row can appear in multiple groups
when it has multiple assignments, without changing the unique result count.

Facet data comes from live inventory, `/api/account-groups`, and the selected
account's rule snapshots. Account groups describe account membership, not custom
campaign labels. Rule counts describe assignment scope, not automation enablement.
Status, account groups and rules can also group rows. Board mode remains unavailable.
The facet layout stacks below the list on narrow screens; viewport validation is
still required before declaring the whole application mobile-ready.

## Public website

`/` is a static, text-only landing page. Public pages share Buyerly / Contact / Log in navigation and a footer with the operator identity, Contact and Legal (Privacy, Terms). Legal articles use a 624px reading column, linked contents and plain effective dates. The light palette and `--site-*` tokens come from `tokens.css`; the public scale is larger than the product UI. `/data-deletion` remains reachable through Privacy and by its existing URL.
