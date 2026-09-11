# Issue #112 — Live Ads Manager hierarchy and view controls

## Goal

Restore the existing Ads Manager navigation, filter, and display workflows on
workspace-scoped Meta data. Campaigns, ad sets, and ads must remain visible when
their selected-period activity is zero, and no demo record or decorative action
may be presented as live functionality.

## Current gap

- The React view hard-codes the `Ad sets` and `Ads` tabs as disabled and replaces
  their change handler with a no-op.
- The live migration removed the filter and display-options controls together
  with their demo-backed data source.
- Meta sync joins complete inventory only for campaigns. Ad sets and ads are
  currently derived from Insights and zero-activity rows are discarded.
- The hierarchy store supports direct parent drill-down, while the account-level
  tabs need a workspace-authorized account-wide view for every entity level.

## Design

### Meta inventory and facts

Fetch account-wide campaign, ad set, and ad inventories from their Meta edges.
Join each level's Insights rows by entity ID and persist a normalized fact for
every inventory entity. Keep period-only rows that no longer appear in current
inventory so delivered historical data is not lost.

Parent relationships remain canonical:

- campaign -> ad account;
- ad set -> campaign;
- ad -> ad set.

### Hierarchy API

When `parent_id` is an authorized ad account, return all requested facts for that
account and entity level. Existing direct-parent queries continue filtering by
`parent_entity_id`. Account authorization is applied consistently for campaign,
ad set, and ad requests.

### React data flow

On account selection, request campaign, ad set, and ad facts for `today` in
parallel. Map them into the existing row models, resolve parent display names
from the loaded hierarchy, and keep one explicit load/error state for the
account snapshot. Tabs switch local views without manufacturing entities.

### Restored controls

- Enable `Campaigns`, `Ad sets`, and `Ads` tabs with real counts.
- Restore the canonical filter button, menu, and active-filter formula using
  delivery status fields backed by the current tab's live rows.
- Restore the canonical display-options popover with only supported list
  ordering and properties for the current live entity level.
- Do not expose board/group/rule/ROI controls until their server-owned data and
  behavior are connected.
- Remove the internal `Today · read-only` label from the toolbar.
- Keep delivery toggles visibly read-only and disabled until mutation endpoints
  are implemented.

## Security and data integrity

- Every account-scoped hierarchy query validates membership in the active
  workspace.
- Direct-parent queries remain constrained by `workspace_id`.
- Unknown metrics render unavailable; true zero values remain zero.
- No Meta token, cross-workspace entity, fixture, or optimistic mutation enters
  the response or UI state.

## Verification

- Extend Meta client tests for zero-activity ad set/ad inventory and Insights
  joins.
- Extend analytics fact-store/API tests for authorized account-wide hierarchy
  queries and cross-workspace isolation.
- Extend React contract coverage for enabled tabs, live requests, restored
  filter/display controls, removed label, and disabled mutations.
- Run all test and build validation only through GitHub Actions, per repository
  policy.
- Review responsive behavior at 390, 768, 1024, and 1440 px with table overflow
  contained inside the data viewport.

## Delivery

One isolated branch and pull request closes #112. Merge only after the complete
GitHub Actions quality gate passes, then verify the deployed commit through the
production readiness endpoint.
