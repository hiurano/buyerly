# Inline Pause / Resume / Budget — plan

## Context

Statistics can now tell a buyer that a campaign is 67% above target. It cannot let
them do anything about it. Both research reports call this out directly: after a
loser is identified the user must not have to walk `Statistics → Meta → account →
campaign → search → edit`, and the action belongs beside the row that justified it.

Ads Manager already draws delivery toggles for campaigns, ad sets and ads — but
every row is rendered `readOnly`, with the tooltip *"Campaign controls are not
connected yet"*. That is honest today, and it is the last obviously unfinished
control surface in the product.

This is the first **write** path into Meta from the web app, on the user's real
money. The plan is therefore built around reusing the mutation, audit and undo
machinery that already runs in production rather than inventing a second one.

## What already exists and will be reused

| Piece | Where | Note |
|---|---|---|
| Status writes, all three levels | `meta_api/client.py` → `set_entity_status` | routes to campaign/adset/ad |
| Budget write | `meta_api/client.py` → `update_adset_budget` | **ad set only today** |
| Live state read for verification | `meta_api/client.py` → `get_entity_state` | already returns campaign budgets |
| Audit row builder | `core/audit.py` → `build_audit_event` | takes `entity_level`/`entity_id`/`entity_name` |
| Undo contract | `core/action_undo.py` | `MANUAL_PAUSE`, `MANUAL_REACTIVATE`, `INCREASE_BUDGET`, `DECREASE_BUDGET` are **already** in `REVERSIBLE_EVENT_TYPES`, with specs derived in `undo_spec_for_event` |
| Undo endpoint | `POST /api/audit-events/{id}/undo` | 24h window, role check, refuses if the entity changed since |
| Full endpoint precedent | `api/routers/adsets.py` → reactivate | permission → security event → Meta call → error audit → state update → cache invalidation → success audit |
| Role gate | `api/deps.py` → `ensure_workspace_write_access` | viewer cannot write |

The work is mostly **wiring**, not new machinery.

## Backend

### 1. Generalize the budget write

`meta_api/client.py`: add `update_entity_budget(entity_id, access_token,
new_daily_budget_dollars, currency, entity_level, account_id)`. The Graph call
shape is identical for a campaign id, so this is the same request with a
different target. Keep `update_adset_budget` as a thin wrapper so existing
callers and tests are untouched.

`core/action_undo.py`: the guard at `if spec.kind == "budget" and entity_level !=
"adset"` must accept `campaign` and route through the generalized write.
Otherwise a campaign budget change would be recorded as reversible and then
refuse to reverse.

### 2. Two endpoints — new `api/routers/delivery.py`

- `POST /api/entities/{level}/{entity_id}/delivery` — body `{account_id, status}` where status is `ACTIVE|PAUSED`
- `PATCH /api/entities/{level}/{entity_id}/budget` — body `{account_id, daily_budget}`

Both follow the reactivate precedent exactly, plus these rules:

1. **Role first.** `ensure_workspace_write_access`; the ad account is resolved
   with the same workspace scope clause used in `api/routers/accounts.py`
   (`_load_writable_account`), so a foreign account is a 404 with a recorded
   security event.
2. **The before-state comes from Meta, never from the client.** Call
   `get_entity_state` first. This produces the audit `before_state` that undo
   consumes, and it catches a stale screen.
3. **Already in the requested state is a no-op**, answered as such — not a
   second write and not an error.
4. **Budget floor.** Reject non-finite values and anything below the `>= 1.0`
   floor `core/action_undo.py` already treats as safe; reject an absurd ceiling.
   Ads are rejected outright: an ad has no budget of its own.
5. **Every attempt writes an audit row**, SUCCESS or ERROR, carrying
   `entity_level`, `entity_id`, `entity_name` and before/after states. Event
   types are the ones undo already knows: `MANUAL_PAUSE`, `MANUAL_REACTIVATE`,
   `INCREASE_BUDGET`, `DECREASE_BUDGET`.
6. **The response returns the audit event id**, so the UI can offer Undo through
   the existing endpoint instead of a parallel mechanism.

Budget edits target whichever level actually holds the budget: a campaign with
`daily_budget > 0` is CBO and is edited on the campaign; a campaign at 0 is ABO
and its ad sets are edited instead. The fact store already reports this per row,
so the UI can decide without an extra call.

## Frontend

- `frontend/src/lib/delivery.ts` — `setEntityDelivery`, `setEntityBudget`, both
  returning the audit event id.
- **Statistics** (`StatisticsView.tsx`): a pause/resume control and an editable
  budget cell on the row, with per-row busy state, a recoverable error message,
  and a short-lived inline **Undo** after success that calls the existing undo
  endpoint.
- **Ads Manager**: drop `readOnly` from `CampaignRow`/`AdSetRow`/`AdRow` at their
  call sites in `CampaignsView.tsx` and point the existing `LinearToggle`s at the
  same functions. The local-only `toggleCampaignDelivery` / `toggleAdSetDelivery`
  / `toggleAdDelivery` store actions become dead and are removed.
- **Budget confirmation:** a change of 25% or more asks for confirmation inline
  and names the consequence — Meta can return the ad set to learning. Smaller
  changes save directly. No modal on every edit.
- Budget is offered only where a budget exists; never on ads.

## Tests and docs

- `tests/test_api.py` (or a new `tests/test_delivery_actions.py`): role gating,
  cross-workspace 404, no-op when already in state, Meta failure → ERROR audit +
  5xx, success → SUCCESS audit that `can_undo` accepts, budget floor rejection,
  ad-level budget rejection, campaign (CBO) budget path.
- `tests/test_api.py` undo coverage: a campaign budget change reverses.
- `tests/test_react_frontend_contract.py`: **the current test forbids
  `LinearToggle` in `StatisticsView.tsx`** — that entry exists because the
  control was fake, and must move from the forbidden list to the required
  contracts. Also assert no row is left claiming "not connected yet".
- `scripts/statistics-visual.mjs`: pause a row against a mocked endpoint, assert
  busy → success → Undo, and assert the error path renders a recoverable message.
- `docs/API.md` (both endpoints — the documentation test requires it),
  `docs/DESIGN_SYSTEM.md` (Statistics and Ads Manager sections), `CHANGELOG.md`.

## Verification

Local: `tsc --noEmit`, `npm run build`, `python -m compileall`, the file-based
contract tests. Backend behavior cannot run here (no Python env, no nix-shell) —
the real gate is CI, so the backend diff gets a line-by-line read.

Visual: the preview harness with a mocked endpoint, exercising pause → Undo,
a budget edit above and below the confirmation threshold, and a Meta failure.

**No migration.** The audit and undo tables already carry everything needed.

## Out of scope

Bulk actions on a selection, scheduling, and lifetime budgets. Rules already own
automated pausing; this is the manual path only.

## Completion review

- Live entity account ownership is checked before all mutations.
- Persist the attempt before contacting Meta; unavailable history blocks writes.
- Normalize returned budgets to the currency's actual minor units.
- Dismissing feedback preserves confirmed values; Undo restores the last action's prior value.
- Campaign budget Undo and failure boundaries are covered by integration tests.
- Local Python and Node are available in the completion session; full database tests remain CI-only.
