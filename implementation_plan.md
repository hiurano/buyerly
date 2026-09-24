# Генеральная уборка Buyerly: план реализации

Дата: 2026-09-25. База: `91a0c95` (main после PR #171).
Основание: [аудит A01–A25](docs/PROJECT_CLEANUP_AUDIT.md).
Статус: **C01 слит (PR #174, `b0ff681`); C02 реализован, ожидает CI и review; C03–C24 ещё не реализованы**.
Прежний план сохранён в [архиве public website](docs/archive/plans/implementation_plan_public_website.md).

## Цель и критерии готовности

Исправить найденные дефекты корректности, сделать изменения безопаснее, удалить
подтверждённо лишнее и разделить перегруженные ответственности. Сокращение строк
и количество новых абстракций не являются критериями успеха.

У каждого выполненного этапа есть отдельный PR, проверки поведения, зелёный CI
и обновлённые документы. Каждый вывод A01–A25 в конце связан с PR либо явно
оставленным долгом и условием возвращения к нему. Неподтверждённый кандидат
может завершиться выводом «изменение не требуется» с доказательствами.
Не объявлять production restore, migrations или mobile проверенными только
по наличию кода. Никакие исправления ниже не входят в текущий аудит.

## Передача между чатами

Один чат берёт один Cxx, обычно один PR. Крупные этапы делятся на указанные
под-PR. Каждая ветка начинается от обновлённого main после слияния зависимостей;
branch stacking запрещён. При общей директории с другой сессией нужен worktree.

Перед началом прочитать AGENTS, соответствующие A-ID и актуальный код:
отчёт привязан к SHA и мог устареть. UI-работа требует полного UI_CONTRACT
и релевантных разделов DESIGN_SYSTEM. Общие таблицы уже реализованы в #171.

В конце этапа обновить его статус ссылкой на PR, выполненными проверками и
ограничениями. При разделении добавить Cxx-a/Cxx-b; весь этап не закрывать
после первого под-PR. Основной продуктовый backlog остаётся в PRODUCT_BACKLOG;
этот документ — конечная программа cleanup.

Задание для следующего чата:

> Выполни C03 из implementation_plan.md. Прочитай AGENTS.md и связанные выводы
> docs/PROJECT_CLEANUP_AUDIT.md, сверь их с текущим main. Работай в отдельной ветке,
> выполни только этот этап, открой PR и проверь CI. Обнови статус этапа.
> Не сливай PR без моего подтверждения.

## Порядок и зависимости

Первый проход: **C01 → C02 → C03 → C04 → C05 → C06 → C07**.
Независимые документы/барьеры C21, C20, C09, C24 можно выполнять раньше остальных.
C20 желательно завершить до C17/C18, чтобы visual gate защищал UI-рефакторинг.
Номера — устойчивые идентификаторы, а не запрет учитывать зависимости.

| Этап | Зависимости | Масштаб | Статус |
|---|---|---|---|
| C01 Test DB guard | — | Малый | [PR #174](https://github.com/hiurano/buyerly/pull/174): слит, `b0ff681`, CI зелёный |
| C02 Meta client/cache/lifecycle | C01 | Средний | Реализован; ожидает CI и review |
| C03 Async workspace/account state | — | Средний | Ожидает |
| C04 Parent hierarchy contract | C01 | Малый | Ожидает |
| C05 Timezone drill-down | C04 | Средний | Ожидает |
| C06 Backup cron environment | — | Средний | Ожидает |
| C07 Atomic backup/restore formats | C06 | Средний | Ожидает |
| C08 Полнота DR | C07 | Несколько PR | Ожидает |
| C09 Python dependency lock | — | Средний | Ожидает |
| C10 API/test dependencies | C01, C02 | Средний | Ожидает |
| C11 Domain helpers | C10 | Средний | Ожидает |
| C12 Runtime DB / migration history | C10 | Несколько PR | Ожидает |
| C13 Async password work | C01 | Средний | Ожидает |
| C14 Worker decomposition | C02, C10 | Несколько PR | Ожидает |
| C15 Retention | C08 | Решение + PR | Ожидает |
| C16 Подтверждённые удаления | C03; актуальный #171 | Малые PR | Ожидает |
| C17 Shared UI / tokens | C20, C21 | Несколько PR | Ожидает |
| C18 Domain state/hooks | C03, C04, C05, C20 | Несколько PR | Ожидает |
| C19 Поведенческие tests | C10; синхронно с C18 | Средний | Ожидает |
| C20 Visual gate | — | Средний | Ожидает |
| C21 Актуальные документы | — | Малый | Ожидает |
| C22 Compatibility lifecycle | C11, C12 | Решение + PR | Ожидает |
| C23 Performance | C04, C05; стабилизация затрагиваемых модулей | Несколько PR | Ожидает |
| C24 Lint/collection gates | C09 для Python tooling | Малые PR | Ожидает |

Масштаб означает область review, а не оценку часов или обещанные сроки.

## Этапы

### C01 — Защитить тестовую БД (A01)

**Ветка:** `fix/test-database-guard`. Файлы: test_db_helper, guard tests, CI env.
Убрать fallback на runtime DATABASE_URL; определить явно разрешённый disposable
target и отказ до создания engine/соединения. Секреты не выводить.
**Готово:** missing/production-like/unconfirmed DSN отклоняется без соединения
и DDL, CI test DB проходит. **Проверки:** чистые tests с fake engine factory
и полный CI для разрешённой БД. Не тестировать guard на пользовательской schema.

Реализация C01: fallback удалён; разрешён только `postgresql+asyncpg`, пользователь
`buyerly`, БД `buyerly_test`, loopback host (`localhost`, `127.0.0.1`, `::1`),
порт 5432 (либо не указан), без query-параметров. Обязательно отдельное
`TEST_DATABASE_DISPOSABLE=buyerly_test`; CI задаёт его для disposable service.
Перед DDL повторно проверяются подтверждение и совпадение URL переданного engine
с `TEST_DATABASE_URL`. Ошибки не содержат DSN и credentials. Импорт runtime Base
отложен до успешной проверки, чтобы чистые guard tests не создавали runtime engine.
Локально: 4 unit tests с fake engine прошли, compileall и diff check прошли.
[PR #174](https://github.com/hiurano/buyerly/pull/174): полный
[CI run 36059867936](https://github.com/hiurano/buyerly/actions/runs/36059867936)
для реализации `668bfff` завершился успешно. Слит в `main`: merge-коммит `b0ff681`.
Ограничение: guard проверяет конфигурацию, а не содержимое сервера; разрешённая
локальная БД должна быть одноразовой. Пользовательская schema не проверялась.

### C02 — Исправить Meta cache wiring и lifecycle (A02, A25)

**Ветка:** `fix/api-meta-client-lifecycle`. Файлы: routes/server/meta_oauth,
Meta routers, targeted tests. Назначить явного владельца клиентов, сохранить
PostgreSQL provider при обычной app assembly и закрывать clients в shutdown.
**Готово:** production import path использует shared cache, delivery invalidation
доходит до него, повторное создание app не переиспользует закрытый/чужой client.
**Проверки:** app wiring/lifespan с fake Meta, cache integration в CI.
Worker behavior сохранить; полную переделку dependencies оставить C10.

Реализация C02 сверена с `main` на `b0ff681`: A02/A25 подтверждены.
`create_app` владеет одним MetaClient с PostgreSQLInventoryCache, общий для
Meta routers и импорта OAuth accounts через `get_meta_client(request)`.
Глобальные router clients и их переприсваивание удалены; подмены в API tests
перенесены на `self.app.state.meta_client`, также доступны dependency overrides.
Lifespan закрывает клиент в `finally`, повторный запуск создаёт новый экземпляр.
MetaOAuthClient уже закрывает HTTP transport внутри каждого запроса; worker
не изменён. DB module propagation и остальные dependencies остаются для C10.
Проверки: четыре DB-free lifecycle/assembly tests, compileall; в CI добавлена
интеграция delivery → реальный MetaClient → PostgreSQL cache invalidation
с fake Meta transport. Полный CI и ссылка на PR будут внесены после запуска.
Ограничение: запросы к реальному Meta и влияние на квоты не измерялись;
production deployment не выполнялся. Merge требует подтверждения пользователя.

### C03 — Ограничить async state текущим контекстом (A03)

**Ветка:** `fix/workspace-scoped-client-state`. Файлы: store/App,
rules/attachments consumers, минимальный behavioral harness.
Связать server state и pending requests с workspace/account generation;
reset domain/editor/selection при смене scope/logout. Проверять scope перед set,
а также после завершения mutation и перед follow-up reload.
**Готово:** поздний A не заменяет B, stale selection не становится mutation target;
разрешённые preferences/тема сохраняются. **Проверки:** delayed A/B workspace,
A/B account, failed B, logout/login, mutation completion after navigation,
build и browser checks. Backend RBAC не менять.

### C04 — Вернуть настоящий parent каждой entity (A04)

**Ветка:** `fix/analytics-entity-parent`. Файлы: fact service, API/TS
contract/docs и tests; mappers только при необходимости.
Разделить query parent и entity parent, сохранить связи из facts.
**Готово:** account-wide и direct queries возвращают корректную цепочку
campaign → adset → ad, tenant filtering прежний.
**Проверки:** две campaigns с несколькими adsets/ads, API/service regression
и mapper test на форме реального ответа. Внешний вид таблиц не перерабатывать.

### C05 — Считать drill-down в timezone кабинета (A05)

**Ветка:** `fix/analytics-drilldown-timezone`. Файлы: analytics service/router,
fact/timezone tests. Найти разрешённый account для campaign/adset parent до
расчёта current/previous/trend windows; явно определить unknown-parent response.
**Готово:** account-wide и child views используют одну локальную дату, timezone
и open_day согласованы, parent lookup строго workspace-scoped.
**Проверки:** fixed clock около полуночи, UTC−/UTC+, DST, чужой/неизвестный parent,
comparison/trend. Семантику Today comparison не менять.

### C06 — Явно настроить environment backup cron (A06)

**Ветка:** `fix/backup-cron-environment`. Файлы: setup/backup entrypoint,
deployment docs и изолированные script tests.
Определить безопасную передачу разрешённых настроек без печати secrets
и исполнения произвольного dotenv как shell-кода; проверить log permissions
root/non-root и timezone расписания.
**Готово:** clean cron environment получает нужные настройки; отсутствие
обязательных параметров не выглядит как encrypted/offsite success.
**Проверки:** fake cron/docker/upload commands, bash syntax, CI.
Не устанавливать cron на NixOS и не менять VPS в этом PR.

### C07 — Atomic backup и правильный restore format (A07)

**Ветка:** `fix/backup-artifact-integrity`. Файлы: backup/restore/offsite,
tests, описание verified signals.
Писать во временный файл, валидировать, публиковать rename; partial исключить
из latest selection. Download должен сохранять проверяемый исходный формат.
**Готово:** .gz/.gz.enc совместимы; failure не публикует final archive и
success timestamp; latest не выбирает partial.
**Проверки:** fixtures двух форматов, неверный ключ, corruption, interruption,
empty file, cleanup. Restore только в disposable CI DB; старые backup совместимы.

### C08 — Проверить заявленный recovery path целиком (A08)

**C08-a, `test/production-backup-restore-path`:** isolated CI исполняет
production scripts, проверяет восстановленные контрольные rows и Alembic head,
а не только копию pipeline из YAML.
**C08-b, `feat/uploads-backup-recovery`:** после определения recovery scope
добавить uploads, references/permissions и согласованность DB/files; key/config
dependencies описать отдельно.
**Готово:** CI восстанавливает контрольные DB rows и файлы; документация
различает synthetic drill и реальную VPS/S3 recovery.
**Проверки:** disposable containers/storage, failure cleanup.
Живой production drill — отдельная эксплуатационная задача.

### C09 — Воспроизводимый Python dependency resolution (A09)

**Ветка:** `chore/python-dependency-lock`. Файлы: manifest/lock или constraints,
Dockerfile/CI, инструкция воспроизведения.
Выбрать минимальный способ закрепить direct/transitive dependencies под Python
3.12, использовать один artifact в CI/image и проверять его рассогласование.
**Готово:** clean installs получают одинаковые версии; documented update flow.
**Проверки:** full CI и production image build. Массовый framework/ORM upgrade
не входит; если старый resolution неизвестен, явно записать новую baseline.

### C10 — Явные API dependencies вместо module monkeypatch (A10, A19)

**Ветка:** `refactor/api-resource-dependencies`. Файлы: resource/session
providers, routers и test fixtures.
Добавить override points и restoring fixtures, перевести consumers,
удалить _RoutesModule и лишние re-exports последними.
**Готово:** app не меняет класс Python-модуля; router не требует скрытого
patch propagation; globals возвращаются в исходное состояние.
**Проверки:** API/security/Meta tests, два app instances с разными overrides,
порядок tests/shards. Payloads и transaction boundaries сохраняются.

### C11 — Разнести domain helpers и разобрать read-side backfill (A11)

**Ветка:** `refactor/api-domain-helpers`; изменение backfill behavior —
отдельный последующий `fix/legacy-account-backfill`.
Выделить workspace/accounts/rules/summary helpers. Убрать no-op owner helper
после проверки caller contract. Для failed flush обеспечить корректную session,
не скрывать failed transaction.
**Готово:** у domain logic явное место, read/backfill semantics закреплены.
**Проверки:** orphan/null-workspace accounts, роли/support grant, foreign account,
failure injection. Не менять ownership OR/AND механической заменой.

### C12 — Развести runtime DB и историю миграций (A12)

**C12-a, `refactor/database-runtime-boundaries`:** engine/session/Base отдельно
от bootstrap и password helpers с сохранением необходимых imports.
**C12-b, `refactor/legacy-migration-boundaries`:** граф migrate_* / revisions /
tests; выделить historical code, удалить только доказанно неиспользуемое.
**Готово:** runtime import не тянет historical transformations; migration
contracts воспроизводимы. **Проверки:** empty → head, supported baseline → head,
повторный запуск, все migration/schema tests в CI.
Не удалять и не squashing старые revisions.

### C13 — Убрать password CPU work с event loop (A13)

**Ветка:** `perf/async-password-verification`. Файлы: password execution
boundary, auth/admin confirm consumers, tests.
Измерить concurrency, затем применить ограниченное thread execution.
Перенос helpers согласовать с C12-a при пересечении.
**Готово:** hashing не выполняется в event-loop thread; очередь ограничена;
scheme/iterations/legacy rehash/rate limits сохранены.
**Проверки:** login/change/admin errors, fake slow verifier concurrency
и небольшой CI benchmark. Не снижать password cost ради скорости.

### C14 — Декомпозиция MonitoringWorker (A14)

**C14-a, `refactor/worker-evaluation-context`:** pure selection/context.
**C14-b, `refactor/worker-action-results`:** status/budget result и audit handling.
В обоих сохранить commit points. Только при доказанной необходимости C14-c:
отдельный дизайн transaction scope/concurrency, без gather над общей AsyncSession.
**Готово:** orchestration разделён на понятные этапы; PENDING/reconciliation,
cooldown, STOP confirmation, account-day и ownership сохранены.
**Проверки:** integration/rules/timezones/liveness/batch-loading; timeout после
Meta mutation, restart до commit, partial account failure. Не обещать exactly-once.

### C15 — Retention как явная policy (A15)

**Сначала `docs/data-retention-policy`, затем `feat/scheduled-data-retention`.**
Инвентаризировать facts/sessions/OTP/OAuth/cache/audit/snapshots, определить сроки
и исключения, владельца решения и recovery needs.
После принятия policy — bounded batches, dry-run counts, last-run/error visibility.
**Готово:** policy и job совпадают, references/boundaries проверены.
**Проверки:** fixed clock и synthetic fixtures в CI.
Сроки из default аргументов helper не считать одобренной политикой;
production data в текущем аудите не удаляются.

### C16 — Подтверждённые удаления (A16)

**Ветки:** `chore/remove-unused-frontend-dependencies`, при необходимости
`refactor/remove-inactive-ui-paths`. Начать с пяти dependency candidates отчёта.
Повторить static/dynamic/script search, обновить lock штатно. Selection/label
ветви удалять вместе со state и assertions только после reachability проверки.
**Готово:** для каждого удаления есть основание; нет потерянного consumer,
висящего export и ложной возможности UI.
**Проверки:** clean npm ci, build, filter checks, affected browser/contract tests.
Импортируемый LabelSelectorPopover не считать автоматически мёртвым файлом.

### C17 — Shared Dialog, tokens, reduced motion (A17)

**C17-a `refactor/shared-dialog`:** primitive и три consumers.
**C17-b `refactor/semantic-display-tokens`:** canonical token definitions.
**C17-c `fix/reduced-motion`:** отдельное изменение motion behavior.
**Готово:** один источник geometry/layers/motion, focus trap/restore/Escape
и busy/error/scroll сохранены; reduced motion реально действует.
**Проверки:** UI contract, keyboard browser, light/dark и четыре ширины
390/768/1024/1440 без document overflow.
Не создавать новый shared table и не превращать задачу в полный mobile redesign.

### C18 — Domain state/hooks и page orchestration (A18, A19)

**C18-a `refactor/rules-domain-state`:** types/mappers/server state отдельно от
preferences. **C18-b `refactor/statistics-data-hooks`**. C18-c Ads Manager —
если сложность остаётся. Scope protection C03 сохраняется.
Ошибка accounts отличима от empty, rules остаются доступны при partial failure.
**Готово:** mutations/reload/errors локализованы; страницы отвечают за composition.
Новая state library не обязательна.
**Проверки:** loading/empty/partial/error, delayed A/B, role denial, delivery/
budget confirm/undo, freshness, null/zero и mixed currency; CI/browser.

### C19 — Проверки поведения на опасных границах (A19)

**Ветка:** `test/frontend-behavior-contracts`.
Добавить tests для scope switching, partial data, dialogs, hierarchy mappers.
Source-string assertion удалять после равноценной behavioral замены;
полезные token/forbidden-pattern checks сохранять.
**Готово:** внутреннее переименование не ломает behavior test,
регрессия поведения его ломает, fixtures независимы от порядка.
**Проверки:** targeted negative controls при разработке tests, основной CI.
Не переписывать весь suite и не вводить coverage-процент без baseline.

### C20 — Visual quality gate (A20)

**Ветка:** `ci/shared-ui-visual-gate`. Файлы: workflows/harness.
Добавить trigger paths shared UI/CSS/store/lib/shell/config/lock; определить
участие visual result в общем обязательном check и production gate.
Required checks GitHub читать отдельно от YAML.
**Готово:** shared change запускает visual; failure блокирует заданный gate;
docs/backend-only не остаются в вечном pending.
**Проверки:** trigger/result matrix и CI на PR, без production deployment.
Branch protection изменять только отдельным явно авторизованным действием.

### C21 — Актуальные документы (A21)

**Ветка:** `docs/current-project-contracts`. Файлы: README/docs index,
architecture/UI/design/backlog/migrations docs и documentation assertions.
Согласовать дешёвые local checks vs full CI, password/invite login,
реализованные comparison/trend, responsive gaps и архивные BL references.
Historical DB report отделить от текущего migration runbook.
**Готово:** нет противоречащих правил и исторических статусов как текущих.
**Проверки:** links и docs tests в CI; text/assertions менять вместе.
Public legal obligations не входят; mobile/production не объявлять проверенными.

### C22 — Compatibility lifecycle (A22)

**Ветка:** `docs/compatibility-lifecycle`.
Для bearer/auth, summary API, snapshots/preferences и legacy helpers описать
consumer, support status, условие отключения, migration и rollback.
**Готово:** у каждого path есть «поддерживаем» либо проверяемый deprecation plan.
При обнаружении consumers/legacy rows совместимость сохранить.
**Проверки:** call sites, API docs/tests и доступные usage evidence без secrets/PII.
Endpoint/schema removal — отдельный breaking-change PR после принятия решения.

### C23 — Performance по замерам (A23)

**C23-a `test/performance-baseline`:** synthetic facts/accounts/backup sizes,
memory/time/query-count baseline в CI. Production не нагружать.
По результатам отдельные `perf/analytics-queries` / `perf/offsite-streaming`.
Paging должен сохранять totals/filter/sort semantics.
**Готово:** воспроизводимое до/после, прежние currency/missing metrics/hierarchy/
timezone/backup integrity. Отсутствие bottleneck — допустимый итог исследования.
**Проверки:** одни и те же datasets, bounded costs, correctness regression tests.

### C24 — Дешёвые lint и collection gates (A24)

**Последовательные малые PR:** Python lint, shell validation, TS/hooks lint
по фактическому baseline. Без тотального форматирования в тех же PR.
Проверить union shards = unittest discovery IDs без потерь/дубликатов;
discovery в CI с dependencies, без выполнения suite на этом шаге.
**Готово:** версии tools закреплены, команды описаны, выбранные ошибки ловятся;
долг исправлен узко или явно baseline-ограничен.
**Проверки:** targeted lint, bash -n/ShellCheck, collector contract, full CI.
Dev tooling отделить от production requirements при необходимости.

## Общие проверки каждого PR

- Полностью прочитать diff; выполнить git log --oneline main..HEAD,
  git diff --stat main..HEAD и git diff --check. Только целевые коммиты.
- Локально допустимы AST/compileall, lint, build/tsc и отдельные DB-free tests.
  Отсутствующие tools — разово через Nix без изменения системы.
  Полный набор с Postgres 16/Redis 7 — CI после открытия PR, не feature push.
- Изменённые messages/contracts искать в assertions и обновлять вместе.
  UI: обязательные docs, primitives/tokens и четыре ширины.
- CI должен пройти на текущем PR head. Merge запускает production deployment
  и требует подтверждения пользователя. Production actions не нужны для
  доказательства исправления в cleanup PR.
- Значимые изменения фиксировать в CHANGELOG и действующих документах.
  Для schema/behavior изменений отдельно оценивать rollback: старый image
  сам по себе не откатывает миграцию БД.

## Заключительная сверка

Пройти A01–A25 заново и сохранить таблицу «ID → PR → checks → остаток».
Проверить, что новые wrappers имеют назначение, удаления подтверждены,
тесты защищают поведение, второй product backlog не появился.
Невыполненные продуктовые решения перенести в основной backlog со ссылкой сюда;
не считать их закрытыми автоматически.

Рекомендуемый следующий чат: **C03 — async state текущего контекста**.
