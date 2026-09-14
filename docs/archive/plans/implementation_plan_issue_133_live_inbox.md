> Архив: исторический план или снимок. Не инструкция для текущего production и не подтверждение выполнения задач. Актуальные документы: [индекс](../../README.md).

# Issue #133: Live workspace Inbox

## Goal

Replace the production Inbox demo notification with a truthful, workspace-isolated activity stream backed by the existing audit API.

## Starting point

- `InboxView` and `InboxItemRow` render a hard-coded welcome notification from Zustand.
- Read, delete, archive, snooze, filter and display controls only mutate local state or have no handler.
- The sidebar unread badge is derived from the same fixture.
- `GET /api/audit-events` already returns paginated workspace events, status counts, safe display fields and server-authoritative undo capability.
- `POST /api/audit-events/{event_id}/undo` already enforces workspace role, recency and later-mutation boundaries.

## Product contract

- Inbox renders only events returned for the authenticated workspace.
- Loading, empty, filtered-empty and error states are explicit and never replaced by sample content.
- Rows identify the event, target, status and timestamp in text; no unsupported unread state is inferred.
- Every visible control performs a real action: server filtering/search, pagination, retry, selection or server-side undo.
- The master/detail layout remains usable at 390, 768, 1024 and 1440 px without document-level horizontal overflow.

## Implementation

1. Add typed audit-event request helpers and presentation-safe formatters in `frontend/src/lib/audit.ts`.
2. Move Inbox request, filter, pagination, selection and undo state into `InboxView` with stale-request protection.
3. Rebuild `InboxItemRow` around an audit event and a real selection handler.
4. Remove fixture notification state/actions from Zustand and its derived unread badge from the sidebar.
5. Update frontend contract coverage and product documentation.

## Verification

- Perform static repository checks (`git diff --check`, targeted searches and diff review) locally.
- Do not run local tests or builds, per `AGENTS.md`.
- Push the isolated branch and require the GitHub Actions quality gate to pass before merge.
- Review the responsive structure for 390/768/1024/1440 px from the implementation and record any authenticated visual-QA limitation in the PR.

## Definition of done

- No production Inbox fixture or unsupported local notification action remains.
- Inbox uses `/api/audit-events` and exposes real server filtering, pagination and eligible undo.
- Workspace isolation and undo authorization stay owned by the existing backend endpoints.
- Contract tests, changelog and design/API documentation describe the shipped behavior.
- Pull request is merged only after green CI.

## Non-goals

- Introducing notification delivery/read receipts.
- Adding destructive audit-log deletion or archive semantics.
- Exposing raw before/after/details payloads in the UI.
- Changing audit persistence, workspace authorization or undo policy.
