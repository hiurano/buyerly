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
- the `frontend` stage of the root `Dockerfile` builds hashed Vite assets and includes legal documents and assets from `frontend/public/`;
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
| Domain | Ads Manager, Rules, Preferences and filter tokens | Stable product-specific semantics |

New reusable values belong in this file with a semantic name. Page-local Tailwind literals are acceptable only when truly one-off; a repeated literal is a missing token.

## Components

Implemented shared primitives:

| Component | Production source | Required states |
|---|---|---|
| Button | `Button` | primary/secondary/danger, hover, keyboard focus, disabled |
| Tabs | `LinearTabs` | selected, hover, keyboard focus, overflow |
| DataList | `LinearDataList` | loading, empty, populated, partial/error |
| DataTable | `LinearDataTable`, `LinearDataPrimaryCell`, `LinearDataMetricCell` | sortable header, horizontal scroll, grouped and flat rows |
| Selection | `useRowSelection`, `SelectionDock`, `SelectionCommandMenu` | hover-revealed checkbox, X / Ctrl+A / Esc, dock over the list, Ctrl+K actions menu, Ctrl+Delete where deleting is offered |
| Command menu | `COMMAND_MENU_CLASSES` (with `SelectionCommandMenu`) | one panel, field, group, row and note for search, the command menu and the selection's actions; selected row, searching, nothing found and failure |
| Record reveal | `useRevealRow` | the row an address names is scrolled into view and focused; a filter, tab or collapsed group hiding it is cleared; a missing record is an error toast |
| Toast | `ToastRegion`, `toast` | success (deletion), undo, redo, error; auto-dismiss after 8s unless hovered or focused; errors stay until dismissed |
| ConfirmDialog | `ConfirmDialog` | question, consequence, Cancel and a focused confirming button; Enter confirms, Esc cancels; `placement="top"` sets it above the centre, as Linear's session confirmations |
| Checkbox | `LinearCheckbox` | unchecked, checked, focus, disabled |
| Toggle | `LinearToggle` | the only switch, one size everywhere (22×14, as in Linear Display options); yellow `--toggle-checked-bg` when on; on, off, hover, focus, disabled/busy where applicable |
| DropdownMenu | `DropdownMenu` | open, selected, keyboard navigation, dismiss |
| ContextMenu | `ContextMenu` | anchored, viewport-safe, keyboard navigation |
| Tooltip | `Tooltip` | accessible optional explanation |
| Input | `Input` | text, search, placeholder, focus, disabled |
| LabelPill | `LinearLabelPill` | neutral and semantic text-labelled states |
| DisplayOptions | `LinearDisplayOptions` | current selection and real state update |

IconButton, form Dialog, EmptyState and Skeleton are required product patterns but do not yet have one canonical React primitive. Existing implementations are migration debt. When a task touches or repeats one of these patterns, create the shared primitive in `frontend/src/ui/` before spreading another implementation.

## Action feedback

Buyerly reports actions the way Linear does, measured in the product on 2026-09-25:

- **a change is shown, not announced.** Pause, resume, a budget, a rule switched on or off — single or bulk — shows its result on the rows and raises no message. A bulk action keeps the selection so the next action can follow;
- **every change can be taken back.** Ctrl/Cmd+Z undoes the last change of this session and Ctrl/Cmd+Shift+Z (or Ctrl+Y) redoes it. Each step is confirmed by a toast, "Undo pause 2 campaigns." A step the server does not confirm is reported and dropped from the history. Text fields keep their own undo, and an open dialog owns the keyboard;
- **deleting is confirmed, then reported.** The dialog names what is deleted and where it goes, with the confirming button focused so Enter confirms. After it the selection is cleared and a toast links to Recently deleted. Redo deletes again without asking;
- **a toast is only for deletion, undo/redo and failure.** Toasts stack at the bottom right, 384px wide, 24px from the right edge and 52px from the bottom, in an `aria-live="polite"` region that Alt+T focuses. A toast leaves after 8 seconds, but not while it is hovered or focused; an error stays until it is dismissed, because it reports something that did not happen;
- a partial bulk result is reported only for what did not happen: "Paused 4 of 5 campaigns — 1 failed: …".

## Current production screens

### Inbox

- shows real workspace events or an honest empty/loading/error state;
- reads the append-only activity stream from `/api/audit-events`; it does not invent read, archive, snooze or delete state that the audit model does not store;
- supports server-backed status filters, search and pagination, while detail renders presentation-safe event fields instead of raw state payloads;
- offers Undo only when the server returns `can_undo`, and leaves authorization and safety checks to the workspace-scoped undo endpoint;
- titles say what happened in plain words from the event type, not the raw action, and the row's second line starts with the affected campaign, ad set or ad;
- each interactive row has a real destination or handler;
- switches from the desktop master/detail split to one pane at a time below `md`, with an explicit Back action from event detail.

### Ads Manager

- hierarchy is `Campaigns → Ad sets → Ads` and uses account/campaign data returned by the authenticated workspace API;
- identity, name, parent relationship, delivery status and supported budget come from Meta inventory at campaign, ad set and ad level, while period metrics come from Insights; an entity remains visible when its period activity is zero;
- level tabs, primary and sidebar filters, grouping, supported column visibility and ordering operate on the selected account's live hierarchy; board and ROI controls remain unavailable until their server data exists;
- Meta connection is a real OAuth flow: explanation, Facebook authorization, account discovery, explicit import and result;
- imported ad accounts are not the same entity as campaigns and must not be rendered as campaign rows;
- fixtures such as LuckySpin, RoyalBet, NeonSlots and AcePlay are development examples only and must not ship as current workspace data;
- delivery toggles are real writes into Meta, going through the audited single-entity endpoint and the audit undo path; a row is busy while the write runs and then shows the delivery Meta confirmed, and a failure is reported as a toast;
- rows can be selected for bulk Pause and Resume, which write delivery through the same audited single-entity endpoint; entities that changed are taken back together with Ctrl+Z, and only what failed or was skipped is reported;
- no rule is enabled as a side effect of importing an account.

### Rules

- server-owned rule definitions and assignments are distinguished from local editor state;
- dangerous actions require explicit conditions, scope and review;
- account coverage and active/inactive state use real workspace-scoped data.
- deleting a rule or a group is confirmed first, then reported with a link to **Recently deleted**; a deleted rule stops running at once. Recently deleted is a tab of Rules that keeps rules and groups for 30 days: a restore brings a rule back under its id, into the groups that still exist and onto the ad accounts it ran on with the scope it had, and says which ad accounts could not take it back. There is no manual permanent delete;

### Settings

- profile, workspace and connection settings preserve role and workspace boundaries;
- secrets and full access tokens are never display data.

### Search and command menu

Two menus, as in Linear.

- **Search** opens from the sidebar's Search button or `/` outside a text field. It finds campaigns, ad sets and ads of today's inventory — the one Ads Manager shows — rules, and the ad accounts Ads Manager opens, only in the workspace in the address; the empty field says exactly that, and nothing else (Inbox, members, rule groups) is implied. Searching, nothing found and a failure with Retry search are separate states in words; results come grouped by kind, best match first, up to 20 per kind.
- **Command menu** opens with Ctrl/Cmd+K from anywhere, a text field included, as Linear's: 720px wide, nothing dimmed behind, "Type a command or search…". The open page's own group comes first (Inbox: Notifications), then Rules, Filter and Navigation in that order, each command with its keys on the right ("G then S"); Go to inbox is left out on Inbox, as in Linear. Typed letters match in order, not side by side ("gtset" finds Go to settings), best match first within each group. From two letters, "Quick results" from GET /api/search follow the commands, ending in Search entire workspace (or No results found · Go to advanced search), with a footer of ↵ Select/Open and Advanced search Ctrl /. Its colors are the `--command-menu-*` tokens, measured on Linear in both themes. Pressed again it closes; with rows selected, Ctrl/Cmd+K stays the selection's actions menu. Pages add their group with `usePageCommands`. It opens over Settings too, as in Linear, starting with the settings pages in the groups of "Open settings…" and adding Back to app (Ctrl+Esc, which also works on its own there); `/` there focuses the settings search instead of opening search. Linear has no "Revoke all other sessions" command, so neither do we.
- **G then a letter** opens a page: I Inbox, A Ads Manager, R Rules, S Settings (as in Linear). One table, `frontend/src/lib/shortcuts.ts`, feeds the handler, the sidebar hints, the workspace menu and the command menu.
- **O then a letter** opens an "Open …" palette, Linear's "Open issue…" family: C campaign, A ad set, D ad (A is taken), R rule, K ad account, S settings; O W stays the workspace switcher. Same size and place as the command menu, nothing dimmed, the kind's icon in the field. The empty field lists the records of that kind opened last (from search, Ctrl/Cmd+K or a palette; kept in the browser per member and workspace, eight per kind); they come with no heading. Typing searches GET /api/search?kind=… at once under "Quick results for "…"". With nothing to list — no record opened yet, or nothing found — Linear shows the field alone, with no note and no footer. Rows show a rule's identifier (RUL-07) muted before the name, as Linear's BUY-4. The footer, 35px under a rule, holds pill buttons: ↵ Open on the left, Alt ↵ More actions and Quick look → on the right. Alt+↵ opens the record on its row with its actions menu ("More actions"; not for an ad account, which has no row). → at the end of the text shows Quick look on the right: the palette grows to 487px, the list narrows to 304px, and the record shows its identifier or kind muted, its name at 18px, a muted line of status and age, then its facts; ← hides it and Esc closes the palette at once, as in Linear. "Open settings…" lists the settings pages with their sidebar icons, the account's own pages first with no heading and Members under Administration, as Linear groups them, matched by the settings search's keywords; it has no footer. The command menu lists each palette with its keys; the letters come from `OPEN_KEYS` in `frontend/src/lib/shortcuts.ts`.
- A search result opens on its own row through the record's address (`/ads-manager/{level}/{id}?account=…`, `/rules/{id}`): Buyerly has no record pages, unlike Linear. A filter, tab or collapsed group hiding the row is cleared, and a record the list cannot show is reported.
- Esc closes either menu and returns focus to what had it. `/` typed into an input, textarea, select or rich text stays text, and neither shortcut fires while another dialog or menu is open.

### Auth and onboarding

- password login (email code or link only for invitations), workspace creation and initial profile setup remain separate, comprehensible states;
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

Buyerly is laid out for `1024px` and wider and reflows down to a `390px` phone. Navigation follows Linear's small layout: at `880px` and below (`SIDEBAR_ALWAYS_COLLAPSED_QUERY`) the sidebar and the Settings navigation take no layout space and open as a drawer over the content — at most 330px, 40px clear of the right edge, above a backdrop — from the header's `SidebarCollapsedNavigation` ("Menu") or `[`. The backdrop, a swipe to the left and any navigation close it; touch screens get 36px navigation rows. What is required now:

- no document-level horizontal overflow at the widths the product actually serves;
- dialogs fit the viewport, keep close/primary actions reachable and expose internal scrolling for long content;
- no hard-coded width that would block a later mobile pass.

Inside the screens (Rules, Ads Manager, Inbox; `scripts/mobile-screens-browser.mjs` at 390/768/1024/1440px):

- view tabs that no longer fit their strip all fold into one capsule with the active tab's label and a chevron, named "N more", that opens a menu of the views (`LinearTabs collapseOverflow`, as Linear's view header); the header actions stay on the right and are never cut;
- entity tables scroll sideways inside their own viewport (`LinearDataTable`), never the document; figures do not wrap;
- a view's details pane is one component for every view (`DetailsPaneLayout` with `DetailsPaneToggle`, read from Linear's `DetailsPaneContainer`, #367): wider than `1024px` it is a column the list gives its room to, 350px until dragged on its left edge (360–600px, never leaving the list under 300px; a click on the edge closes it); at `1024px` and below it lies over the list from the right below the view header, 350px wide (the window when narrower), without a resizer; on a pure-touch phone (`640px` and below) a 40% black backdrop dims the list and closes it, and a swipe right closes it too. It slides on Linear's spring (tension 1000, friction 40, mass 0.1: about 170ms, no overshoot) while the list narrows or widens with it. Its card sits 4px from its left edge and 8px from the right and bottom. It starts closed; open/closed and the dragged width are kept per view on the device (`buyerly:details-panes`); Ctrl/Cmd+I and `]` toggle the pane of the view on screen;
- on a pure-touch screen (`TOUCH_SCREEN_QUERY`) header icon buttons grow from 28px to 32px square (`.linear-header-target`) and view tabs to 32px tall, as Linear's on a touch phone;
- popovers anchored to a header button stay inside the window.

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
The details pane's quick filters (`DetailsFacets`, Linear's quick-filter tabs) count the
main-filter result before applying one quick selection. Selecting another value
replaces that selection; changing tabs clears it. The pane opens on the tab whose
filter is set, else the tab last open in this browser tab; tabs that do not fit the
pane fold into one select. Ads Manager's tabs are Status — Meta's `effective_status`
(Active, Paused, In review, Disapproved, With issues, Archived), not the switch — and
Rules; the Rules view's are Status (Active, Paused, Needs review), Action and Groups.
Quick selections are scoped to route/account/entity in session storage, outside the URL.
Display grouping and ordering apply afterwards; a row can appear in multiple groups
when it has multiple assignments, without changing the unique result count.

Facet data comes from live inventory, `/api/account-groups`, and the selected
account's rule snapshots. Account groups describe account membership, not custom
campaign labels. Rule counts describe assignment scope, not automation enablement.
Status, account groups and rules can also group rows. Board mode remains unavailable.
Account groups stay a filter and a grouping, but not a pane tab: every row of one ad
account has the same groups. See the responsive contract for the pane itself.

## Public website

`/` is a static, text-only landing page. Public pages share Buyerly / Contact / Log in navigation and a footer with the operator identity, Contact and Legal (Privacy, Terms). Legal articles use a 624px reading column, linked contents and plain effective dates. The light palette and `--site-*` tokens come from `tokens.css`; the public scale is larger than the product UI. `/data-deletion` remains reachable through Privacy and by its existing URL.
