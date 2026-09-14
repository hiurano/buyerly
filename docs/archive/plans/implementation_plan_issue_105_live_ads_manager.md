> Архив: исторический план или снимок. Не инструкция для текущего production и не подтверждение выполнения задач. Актуальные документы: [индекс](../../README.md).

# Implementation plan: live read-only campaigns in Ads Manager

Status: approved for implementation
Issue: #105
Date: 10 September 2026

## Goal

Replace the Ads Manager fixture path with workspace-scoped campaign facts already available through Buyerly APIs. The first release is deliberately read-only: it proves that the authenticated React UI can select an imported Meta account and render real stored campaign metrics without implying that unavailable status, budget, ROI, grouping or automation data is known.

## Starting point

- `GET /api/accounts` returns imported workspace accounts and their connection/health metadata.
- `GET /api/analytics/hierarchy?parent_id=<account_id>&level=campaign&period=today` returns stored campaign metric facts with workspace ownership enforcement.
- `CampaignsView` already calls the accounts and connections APIs for the Meta connection dialog, but rows come from fixture arrays in `useAppStore`.
- The current hierarchical collector assigns placeholder campaign status and does not reliably provide campaign budget. ROI is not part of the response.
- The right sidebar and campaign groups/rule assignments are also local demo state.

## Product contract for this slice

1. The toolbar exposes the selected imported account and permits switching between eligible active accounts.
2. Selecting an account requests only its `today` campaign facts.
3. The list displays campaign name, Meta ID, spend, leads and CPL in the returned currency.
4. Status, delivery toggle, budget, ROI, group assignment and rule assignment are not presented as working campaign facts in this release.
5. `Ad sets` and `Ads` are visibly unavailable until their parent-selection flow is implemented; fixture rows are never used as fallback.
6. Account loading, campaign loading, no imported accounts, no campaign facts and request failure are distinct states. Failure provides Retry and keeps Connect Facebook available.
7. Changing account discards the prior account's rows immediately and ignores late responses from an earlier request.
8. Zustand remains responsible for view preferences only; it no longer manufactures Ads Manager domain records.

## Implementation

### Types and adapter

- Expand `MetaAccount` with the fields actually returned by `/api/accounts` while keeping optionality for backwards-compatible call sites.
- Add typed hierarchy response/item contracts.
- Add a pure campaign adapter that maps only trustworthy fields and formats money with an explicit ISO currency.
- Represent delivery as `unknown` for this read-only path and suppress mutable controls.

### CampaignsView data lifecycle

- Keep the existing parallel account/connection bootstrap for the OAuth dialog.
- Select the first eligible active account unless the current selection still exists.
- Fetch campaign hierarchy on account selection with a request generation guard.
- Reuse `DropdownMenu` for account selection instead of creating a page-local select family.
- Drive sorting from the live campaign array and do not expose fixture-dependent filters.
- Hide fixture-dependent right sidebar, grouping, rules and unsupported columns for this slice.
- Render explicit loading, empty and recoverable error panels inside the existing data viewport.

### Store retirement

- Remove campaign, ad-set, ad, campaign-group and campaign-rule fixture records from the initial store.
- Keep the existing state/method signatures temporarily so untouched components continue to compile; later slices can remove obsolete mutations after real APIs replace them.
- Reset fixture-specific focused IDs to an empty value.

### Verification

- Extend React contract tests to reject the four named campaign fixtures and require the accounts/hierarchy API paths and honest states.
- Update `CHANGELOG.md` and API/UI documentation only where the user-visible contract changes.
- Do not run tests locally. Push the isolated branch and use GitHub Actions for React build and the full test suite.
- After merge, require successful auto-deploy and verify `/health/ready` reports the merge SHA.

## Explicit non-goals

- Meta campaign/ad-set/ad mutations.
- Rule assignment or campaign groups.
- Live inventory status and campaign budget collection.
- Ad-set and ad drill-down.
- Statistics, Inbox or Rules fixture retirement.
- Direct Meta calls from the browser.

## Follow-up sequence

1. Add authoritative campaign inventory status/budget to the backend collector and Fact Store response.
2. Add campaign selection and live ad-set drill-down, followed by ad selection and live ads.
3. Connect server-owned groups and rule assignments.
4. Introduce write actions only after permissions, confirmation, audit and rollback contracts are complete.
