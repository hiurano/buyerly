> Архив: исторический план или снимок. Не инструкция для текущего production и не подтверждение выполнения задач. Актуальные документы: [индекс](../../README.md).

# Implementation plan: live Statistics data

Status: approved for implementation
Issue: #119
Date: 12 September 2026

## Goal

Replace every production Statistics fixture with workspace-scoped metrics already stored from imported Meta ad accounts. The screen must expose the selected account, entity level, reporting period, source freshness and honest unavailable states without inventing targets, comparisons, revenue or campaign mutations.

## Starting point

- `StatisticsView` renders a local `CAMPAIGNS` array plus hardcoded overview and live-today values.
- Its account categories, decision groups, comparison choices, ROAS, targets, trends and status toggles have no server source.
- `GET /api/accounts` returns the imported accounts visible in the active workspace.
- `GET /api/analytics/hierarchy` already enforces workspace ownership and returns stored campaign, ad-set and ad inventory with period metrics for `today`, `yesterday`, `last_3d` and `last_7d`.
- The hierarchy response does not currently expose when its underlying facts were fetched.

## Product contract

1. Statistics selects one active imported Meta account and requests only that account's data.
2. Campaigns, Ad sets and Ads are real hierarchy levels; changing the tab changes the API request.
3. Today, Yesterday, Last 3 days and Last 7 days map directly to supported API periods.
4. Rows show only server-backed identity, delivery status, spend, leads, CPL, impressions, clicks and CTR.
5. Summary metrics are calculated from the currently loaded rows in one known currency. Unknown or inconsistent currency makes monetary aggregates unavailable.
6. The API returns the conservative `data_as_of` timestamp for the selected result set, derived from stored fact fetch times.
7. Account loading, hierarchy loading, no imported accounts, empty inventory and request failure are explicit text states with safe retry/navigation actions.
8. A later response for an old account/level/period selection cannot replace the current data.
9. Demo campaigns, fake freshness, targets, comparisons, decision groups, ROAS and local delivery mutations are removed.

## Implementation

### Analytics response

- Add each entity aggregate's latest fact-fetch timestamp to the service result.
- Add top-level `data_as_of` and a stable `analytics_fact_store` source identifier to the hierarchy response.
- Keep existing routing, period vocabulary and workspace ownership checks unchanged.

### React data lifecycle

- Add the response metadata and remaining hierarchy metrics to the shared TypeScript contract.
- Load eligible accounts, preserve a still-valid selection and otherwise select the first account.
- Fetch the current level and period with a request-generation guard.
- Derive summary totals and sorted/searched rows from the response only.
- Reuse `DropdownMenu`, `LinearTabs`, `LinearDataList` and `DataState`; keep horizontal overflow local to the data surface.

### Verification

- Extend backend endpoint coverage for source/freshness metadata.
- Extend React contract coverage to require real API paths/states and reject every shipped Statistics fixture/unsupported metric.
- Update API documentation, UI documentation and `CHANGELOG.md`.
- Do not run tests locally. Push the isolated branch and use GitHub Actions for all automated verification.

## Definition of Done

- Statistics contains no hardcoded domain rows or metrics.
- Every visible control changes real view/request state.
- Every visible metric is supported by the API and labelled with its period/freshness context.
- Workspace isolation and read-only behavior remain intact.
- GitHub Actions is fully green before merge.

## Explicit non-goals

- Direct browser calls to Meta.
- Campaign/ad-set/ad mutations.
- Revenue ingestion or ROAS.
- KPI target storage and performance decision classification.
- Arbitrary date ranges or previous-period comparison.
