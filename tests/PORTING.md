# Python tests and the TypeScript server (#611, stage 5)

Before stage 6 deletes `tests/` with the rest of the Python code, every file
here is mapped to what checks the same behaviour on the TypeScript server
(`server/test/`, Vitest). This file is the map; the tests themselves stay
until stage 6.

Verdicts:

- **ported**: a Vitest test was added in the "Port Python tests to Vitest" PRs.
- **covered**: an existing TS test checks it (contract tests run against both
  servers with `CONTRACT_TARGET`, parity tests compare with Python).
- **no TS code**: the behaviour still lives only in Python, so there is nothing
  to test on the TS side yet. The code has to be ported first (stage 4/5).
- **dies**: tests Python-only code or tooling that stage 6 removes and that has
  no TS counterpart.
- **other check**: not a test of server behaviour (shell, YAML, docs, frontend
  source). Stage 6 needs a decision: a different kind of check, or drop.

How it was checked. Files marked "(by case)" were compared test by test: every
Python test name against the TS tests of the area, and the bodies read where
the names did not settle it. The gaps found became the ported tests. Files
marked "(by area)" were mapped by area and test names only, with parity
scenarios (`*_parity.py`, `cases.ts`) trusted to cover their cases; they should
get the case-by-case pass before stage 6.

| `tests/` file | Tests | Verdict | Where / why |
|---|---|---|---|
| test_account_health | 4 | ported | `worker/account-health.test.ts`. The synthetic-metrics normalizer lived only in the Python post-deploy smoke (deleted; the TS smoke has its own test) |
| test_account_notifications | 5 | ported + covered (by case) | `notifications/notifications.test.ts`; the bell's effect on Inbox and leaving the workspace were added |
| test_analytics_fact_store | 14 | covered + ported (by case) | `accounts/analytics.test.ts`, `accounts/clock.test.ts` (ported), `worker/account-sync.test.ts`, `meta/client.test.ts`. `cleanup_expired_facts` is called by nothing but its test: dies |
| test_api | 73 | covered (by area) | sessions/sign-in `auth/*`, health, rules `rules/*`, audit/undo `audit/*` + `meta/delivery.test.ts`, accounts, uploads. Summary snapshot writing and `/api/settings` runtime: no TS code (monitoring loop) |
| test_api_meta_lifecycle | 4 | dies | the Python Meta client's lifecycle inside the Python app |
| test_backup_env | 22 | ported + other check | the off-site sync unit tests moved to `scripts/offsite-sync.test.ts` with the script (`scripts/offsite_sync.py` is gone). The rest runs `scripts/backup_*.sh`/`restore_*.sh` in a shell sandbox; needs a Vitest/shell check or a drop |
| test_batch_schedule_loading | 2 | dies | cache of the Python schedule loader |
| test_changelog | 6 | other check | `scripts/build_changelog.py` and the site pages |
| test_client_api | 13 | covered + ported (by case) | `graphql/client-api.test.ts` (writes sent together added), `graphql/schema.test.ts`, area tests. "Every field runs a route" and "production serves routes only as GraphQL" check the Python REST routes: die |
| test_client_api_sdl | 1 | covered | `graphql/schema.test.ts` compares with `packages/shared/client-api.graphql`; the file is printed from the Python schema, so after stage 6 it becomes the source and the freshness check goes |
| test_configuration_contract | 3 | other check | `.env.example` and docs |
| test_datetime_contract | 1 | covered | `schema.test.ts` (column types) |
| test_db_guard, test_db_helper | 4 + 0 | dies | guards the Python test database |
| test_deploy_contract | 41 | other check | `deploy.yml`, `scripts/deploy.sh`, Dockerfile: Vitest over the files, or drop |
| test_dev_sign_in | 4 | covered (by area) | code in the log: `email.test.ts`. `scripts/dev_seed.py` has no TS counterpart: dies or is rewritten |
| test_documentation | 6 | other check | links and contents of `docs/` |
| test_fake_meta | 9 | covered / dies | `meta/fake-meta.test.ts` runs the TS client against `scripts/fake_meta.py`. The fake Meta is Python dev tooling: its own behaviour tests die with it unless it is rewritten |
| test_favorites | 5 | covered (by case) | `views/views.test.ts` |
| test_inbox_email | 14 | ported (by case) | `worker/delivery.test.ts`, `email.test.ts` |
| test_inbox_push | 12 | covered (by area) | `worker/delivery.test.ts`, `notifications/notifications.test.ts` |
| test_inbox_telegram | 9 | covered + ported (by case) | `worker/delivery.test.ts` (settings, read state and retry added), `notifications/notifications.test.ts` |
| test_inbox | 24 | covered (by case) | `notifications/inbox.test.ts`, `model.test.ts`, `notifications/notifications.test.ts` (bell) |
| test_integration | 50 | no TS code | the monitoring loop acting side (`scheduler/worker.py` run_rule_cycle); another session ports it with its tests. Decisions are covered by `rules/decide.test.ts` |
| test_legal_pages | 6 | other check | static site pages |
| test_logging | 6 | covered | `meta/connection-accounts.test.ts` (`redactSecrets`) |
| test_meta_client | 21 | covered (by area) | `meta/client.test.ts` with `cases.ts` and `client_parity.py` scenarios |
| test_meta_error_subcodes | 5 | covered (by area) | `meta/client.test.ts` cases, `worker/account-sync.test.ts` |
| test_meta_invites | 22 | covered (by area) | `meta/connections.test.ts`, `workspaces/public-invite.test.ts`. The REST list/revoke routes are not in the client GraphQL API: die |
| test_meta_oauth, test_meta_oauth_api | 5 + 15 | covered (by area) | `meta/connections.test.ts`, `meta/connection-accounts.test.ts`, `meta/client.test.ts`. Connection delete and manual-to-OAuth migrate are REST routes outside the client API: die unless the product keeps them |
| test_meta_tokens | 8 | covered | `meta/tokens.test.ts` (+ parity) |
| test_metrics_golden | 2 | covered | `accounts/summary.test.ts` (+ parity) |
| test_migrations | 14 | dies | `schema.test.ts` checks the schema the entities describe; data migrations 0012 to 0047 are Alembic and stay with it, or go |
| test_open_signup | 14 | covered + ported (by case) | `auth/sign-in*.test.ts`, `email.test.ts`; "onboarding does not set an email" added to `workspaces/workspaces.test.ts` |
| test_public_repo_hygiene | 2 | other check | scans the repository |
| test_rate_limit | 10 | covered (by area) | `client-address.test.ts`, `auth/sign-in.test.ts`, `workspaces/public-invite.test.ts`, `uploads/images.test.ts` |
| test_react_frontend_contract | 33 | other check | greps the frontend source; partly replaced by `scripts/*-browser.mjs` |
| test_restore_check | 16 | ported | `scripts/restore-check.test.ts` (the check moved to `server/src/scripts/restore-check.ts` with TypeORM migrations, #611 stage 5); the file is removed |
| test_rule_examples | 9 | covered + ported (by case) | `rules/labels.test.ts` (concurrent opening, older examples, owner marker added). The simulator test moved with the simulator |
| test_rule_simulator | 14 | ported | `server/test/scripts/rule-simulator.test.ts` (the same scenarios and pinned numbers; the port was proved against the Python simulator table by table) |
| test_rule_validation | 9 | covered | `rules/validation.test.ts` (+ parity) |
| test_rules | 64 | covered (by area) | `rules/engine.test.ts` (+ `engine_parity.py`); freeze the parity cases into fixtures before Python goes |
| test_rules_shadow | 3 | covered | `rules/decide.test.ts` |
| test_server_proxy | 13 | dies | the Python proxy in front of the TS server |
| test_service_worker | 4 | other check | `scripts/service-worker-browser.mjs` |
| test_sync_bootstrap, test_sync_log, test_sync_stream | 12 + 10 + 31 | ported + covered (by case) | `sync/*.cases.ts`, `sync/log.test.ts` (ported), `worker/worker.test.ts` (compaction) |
| test_teams | 10 | covered + ported (by case) | `workspaces/teams.test.ts`, `workspaces/default-team.test.ts` (ported) |
| test_timezones | 3 | covered + ported | `accounts/clock.test.ts`, `worker/day-boundary.test.ts` |
| test_turnstile | 4 | covered (by case) | `email.test.ts` |
| test_view_settings | 12 | covered + ported (by case) | `views/views.test.ts` (per-workspace, signed-out and leaving added) |
| test_worker_jobs, test_worker_liveness, test_worker_watchdog | 7 + 3 + 14 | covered / dies (by case) | `worker/worker.test.ts`, `worker/watchdog.test.ts`. The Python loop's own tests (heartbeat file, liveness healthcheck, `_deliver_inbox_while_stalled`, drill workflow YAML) die |
| test_workspace_isolation_security | 9 | covered + ported (by case) | `workspaces/route-scope.test.ts` (ported), `auth/sessions.test.ts`, `admin/admin.test.ts`, `audit/audit.test.ts`, `rules/*`, `workspaces/teams.test.ts` |
| test_workspace_search | 17 | covered + ported (by case) | `accounts/search.test.ts` (inventory of monitored accounts and the address's workspace added) |
| test_workspaces | 18 | covered (by case) | `workspaces/workspaces.test.ts`, `members.test.ts`, `public-invite.test.ts`. The invite model schema test and the SPA slug routes die with Python |

`tests/client_api_transport.py`, `tests/sign_in_helper.py`: pytest helpers, die
with the tests.

Left before stage 6: the monitoring loop's acting side and its tests
(`test_integration`, summary snapshot writing, `/api/settings` runtime), the
"other check" files (about 170 tests), the case-by-case pass over the files
marked "(by area)", and freezing the `*_parity.py` cases into fixtures.
