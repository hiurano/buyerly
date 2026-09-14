> Архив: исторический план или снимок. Не инструкция для текущего production и не подтверждение выполнения задач. Актуальные документы: [индекс](../../README.md).

# Implementation Plan: Issue #108 — Complete Meta Campaign Inventory

## Objective

Make Ads Manager list the campaigns that actually exist in the selected imported Meta ad account, including campaigns with no delivery in the current reporting period. Inventory fields and period metrics must retain distinct provenance: Meta's campaigns edge owns identity, name, status and supported budget data; Meta Insights owns spend and conversion metrics.

## Current failure mode

- `get_hierarchical_insights()` discovers campaigns only through the Insights endpoint.
- Meta may omit entities without delivery for the requested period, and Buyerly additionally filters zero-activity rows.
- Facts without an explicit reporting date fall back to the current UTC date, while hierarchy reads resolve `today` in the account timezone.
- Per-level hierarchy errors are logged and swallowed, so account health can remain fully healthy while campaign synchronization is incomplete.

## Design

### Meta collection

1. Add a paginated campaign inventory read from `/{ad_account_id}/campaigns` for `id`, `name`, `status`, `effective_status` and `daily_budget`.
2. Fetch campaign Insights for the requested reporting period.
3. Join Insights onto inventory by campaign ID. Preserve inventory rows even when Insights has no matching row.
4. Preserve insight-only campaign rows as historical entities when Meta no longer returns them from current inventory.
5. Normalize Meta budget minor units through the existing currency helper. An absent or zero daily campaign budget remains unavailable to the UI; it is not presented as a real zero-dollar budget.

### Reporting date

1. Resolve the target reporting date from the imported account timezone for `today`.
2. Attach that explicit local date to every fact created by the worker.
3. Keep `AnalyticsFactService` generic, but stop relying on its UTC fallback in production collection paths.

### Failure semantics

1. Inventory/campaign Insights failures must escape the hierarchical collector instead of returning a misleading account-only success.
2. The monitoring snapshot records hierarchy collection failure separately.
3. Account health becomes degraded/failed for an incomplete required campaign synchronization instead of advertising `meta_read_ok=true`.

### API and React

1. Keep the workspace-isolated `/api/analytics/hierarchy` route and response shape.
2. Return authoritative campaign status, effective status and daily budget from stored joined rows.
3. Map known Meta delivery states to read-only status labels in React; do not enable campaign mutation controls.
4. Render a daily budget only when Meta supplied a positive campaign-level daily budget.
5. Change the empty state to mean that the account has no campaigns, rather than no activity today.

## Definition of Done

- A connected account's zero-activity campaign is returned by the campaign hierarchy endpoint.
- Current campaign inventory and daily Insights are joined without manufacturing activity.
- Account-local date boundaries select the newly stored rows.
- Campaign inventory failures are observable through worker health/error behavior.
- Ads Manager shows real status and supported daily budget values while remaining read-only.
- Tenant isolation remains enforced.
- API docs, UI contract coverage and CHANGELOG describe the new behavior.
- GitHub Actions is green before merge; merged `main` deploys and production reports the merge SHA.

## Verification

All automated verification runs only in GitHub Actions per repository policy. Coverage will include:

- inventory rows with no matching Insights;
- Insights joined to inventory and insight-only historical rows;
- Meta currency-unit budget normalization;
- account-local dates across a UTC boundary;
- hierarchy collection failure propagation and health signaling;
- workspace isolation and React contract assertions.
