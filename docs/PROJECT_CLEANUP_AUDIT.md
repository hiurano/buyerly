# Аудит генеральной уборки Buyerly

Дата: 2026-09-25. Статус: аудит исходников завершён; исправления не выполнялись.
База итогового отчёта: `91a0c95bfba68dc89cc6069687a382af6d62efd1` (`main`, после PR #171).
Порядок реализации и передача работы между чатами: [implementation_plan.md](../implementation_plan.md).

## Цель и границы

Найти конкретные препятствия безопасному развитию проекта, отделить ошибки от
технического долга и составить последовательность небольших PR. Готовность этого
этапа означает: проверены основные подсистемы, у выводов есть источники и степень
достоверности, у каждого направления есть проверяемый результат следующего шага.

Это статический аудит репозитория с выборочным подробным чтением критических
путей, а не построчная сертификация всего продукта. Проверены точки запуска,
сборка API, auth/workspace dependencies, миграции, Meta client/cache, worker,
analytics, React state/data flows, UI-контракт, тестовая инфраструктура,
зависимости, CI/CD, backup/restore и действующая документация.

Приложение, БД, Redis и полный набор тестов локально не запускались. Production,
секреты `.env`, пользовательские данные, фактические backup/S3, настройки Meta
Dashboard и GitHub branch protection не исследовались. Нет заключения об
отсутствии уязвимостей, полноте тестового покрытия, актуальности версий или CVE.
Показатели производительности и реальные пользовательские инциденты не измерены.

Первоначальная база `af9a7a0` имела успешный
[CI/CD run](https://github.com/hiurano/buyerly/actions/runs/36039893815).
Во время аудита был слит [PR #171](https://github.com/hiurano/buyerly/pull/171).
Аудит перенесён на новый main в отдельный worktree; изменения PR просмотрены.
Общие таблицы `LinearDataTable`, общие cells и удаление `RuleGroupHeader` уже
учтены как выполненная работа. Успех прежнего CI не означает проверку новых
документов или доказательство отсутствия перечисленных ниже дефектов.

## Карта системы и существующие сильные стороны

| Контур | Основные файлы | Что уже стоит сохранить |
|---|---|---|
| HTTP и доступ | `api/server.py`, `api/auth.py`, `api/routers/`, `api/schemas/` | HttpOnly sessions, CSRF, привязка запроса к workspace, явные проверки ролей |
| Данные | `database/models.py`, `database/migrations.py`, `alembic/versions/` | PostgreSQL, Alembic, проверка revision/schema, advisory lock в Alembic env |
| Meta | `meta_api/client.py`, `meta_api/oauth.py`, `api/meta_oauth.py`, `services/inventory_cache.py` | Retry/quota handling, шифрование credentials, discovery/import как отдельные операции |
| Автоматизация | `scheduler/worker.py`, `rules/engine.py`, `core/action_undo.py` | Чистая оценка правил, PENDING/reconciliation, STOP confirmation, отдельный undo-аудит |
| Аналитика | `services/analytics_store.py`, `api/routers/analytics.py` | Fact store, даты кабинета, отдельные freshness/period/comparison contracts |
| Frontend | `frontend/src/App.tsx`, `lib/`, `store/`, `components/`, `ui/` | TypeScript strict/noUnused, общий API client, токены, таблицы после #171 |
| Проверки | `tests/`, `frontend/scripts/check-campaign-filters.cjs`, `scripts/statistics-visual.mjs` | Workspace/security/migration tests, браузерная проверка Statistics, CI shards |
| Эксплуатация | `.github/workflows/`, `scripts/`, Compose | Quality gate, release SHA checks, smoke, rollback images, log rotation, synthetic restore drill |

AST-срез итоговой базы: 128 Python-файлов и 389 методов `test_*` (240 async).
Это число статически найденных методов, не число выполненных тестов и не coverage.
Количественные данные следует пересчитывать при дальнейших изменениях.
Полезные ориентиры для декомпозиции:

| Файл / функция | Размер на проверенной базе | Причина внимания |
|---|---:|---|
| `scheduler/worker.py::run_cycle` | 867 строк | Планирование, чтение Meta, оценка, мутации, аудит и commit в одном методе |
| `api/routers/summary.py::get_summary_report` | 518 строк | Memory/persisted/fact/live источники и сборка ответа |
| `services/analytics_store.py::get_workspace_summary_report` | 385 строк | Запросы, агрегация и API-представление |
| `api/deps.py` | 1344 строки | Авторизация смешана с rules/accounts/summary helpers |
| `database/db.py` | 1346 строк | Engine, пароли, bootstrap и исторические преобразования |
| `frontend/src/components/statistics/StatisticsView.tsx` | 1279 строк | Несколько data flows, действия, вычисления и представление |
| `frontend/src/store/useAppStore.ts` | 846 строк | Общий singleton для UI, server data и mutations |

Размер — ориентир для чтения, а не самостоятельный дефект и не целевой KPI уборки.

## Реестр выводов

P1 — исправить до широкого рефакторинга: корректность данных, границы состояния,
безопасность проверок или восстановления. P2 — плановый технический долг и
недостающие барьеры качества. P3 — кандидат после проверки использования/замеров.
«Подтверждено» означает установленное свойство кода; последствия в production
при этом могут оставаться не измеренными.

| ID | Приоритет | Вывод | Достоверность | Этап плана |
|---|---|---|---|---|
| A01 | P1 | Test helper может удалить schema БД из `DATABASE_URL` | Подтверждено | C01 |
| A02 | P1 | API aggregation заменяет Meta client с PostgreSQL cache клиентом без cache provider | Подтверждено | C02 |
| A03 | P1 | Async server data в singleton store не ограничены текущим workspace/request | Подтверждена отсутствующая защита; browser reproduction нужен | C03 |
| A04 | P1 | Account-wide hierarchy выдаёт account ID вместо настоящего parent ID строки | Подтверждено | C04 |
| A05 | P1 | Direct drill-down рассчитывает даты в UTC вместо timezone кабинета | Подтверждено | C05 |
| A06 | P1 | Устанавливаемая cron-задача не получает `.env` для encrypted/offsite backup | Подтверждено; VPS окружение неизвестно | C06 |
| A07 | P1 | Backup публикуется до окончания; offsite restore теряет формат `.gz` | Подтверждено | C07 |
| A08 | P2 | DR-проверка не покрывает uploads и не исполняет production scripts в CI | Подтверждён пробел покрытия | C08 |
| A09 | P2 | Python dependency resolution не воспроизводится между сборками | Подтверждено | C09 |
| A10 | P2 | `api.routes` меняет класс Python-модуля ради глобального patching | Подтверждено | C10 |
| A11 | P2 | `api.deps` смешивает домены, legacy backfill и обработку DB failures | Подтверждено | C11 |
| A12 | P2 | Исторические migrations и password helpers находятся в runtime DB module | Подтверждено | C12 |
| A13 | P2 | CPU password hashing вызывается прямо из async handlers | Подтверждено; latency не измерена | C13 |
| A14 | P2 | Worker объединяет несколько ответственностей и длинный session scope | Подтверждено; contention не измерен | C14 |
| A15 | P2 | Fact retention helper не подключён к runtime | Подтверждено; фактический рост БД неизвестен | C15 |
| A16 | P3 | Есть кандидаты на удаление зависимостей и неактивных UI-ветвей | Требуют финальной проверки достижимости | C16 |
| A17 | P2 | Повторные dialog implementations и второй источник visual tokens | Подтверждено | C17 |
| A18 | P2 | Страницы и store сильно связаны, часть ошибок маскируется пустыми данными | Подтверждено | C18 |
| A19 | P2 | Тесты опираются на исходный текст и неограниченные глобальные patches | Подтверждено | C10, C18, C19 |
| A20 | P2 | Visual CI пропускает изменения shared UI/CSS и не входит в общий gate | Подтверждено по workflow; branch protection неизвестен | C20 |
| A21 | P2 | Документы и assertions закрепляют устаревшие правила/возможности | Подтверждено | C21 |
| A22 | P3 | Legacy auth/summary нельзя безопасно удалить по отсутствию React-вызова | Требуется решение о поддержке | C22 |
| A23 | P3 | Большие analytics selections и offsite files обрабатываются целиком | Подтверждено; bottleneck не измерен | C23 |
| A24 | P2 | Нет общей конфигурации lint и автоматической проверки shell scripts | Подтверждено | C24 |
| A25 | P2 | API-owned Meta clients не закрываются в lifespan | Подтверждено | C02 |

## Подробности первоочередных проблем

### A01. Защита тестовой БД

[tests/test_db_helper.py](../tests/test_db_helper.py), `get_test_db_url`
и `init_test_db` (строки 7–29): при отсутствии `TEST_DATABASE_URL` выбирается
`DATABASE_URL`, затем выполняется `DROP SCHEMA public CASCADE`. Отдельного
подтверждения, что это тестовая БД, нет. CI задаёт отдельную БД, поэтому
подтверждения повреждения production нет. Риск появляется при ошибочном окружении
ручного/внешнего запуска; запрет полного локального прогона сам по себе не защита.

Нужен fail-closed guard до открытия соединения, без fallback на runtime DSN,
с явной идентификацией disposable database. Проверять guard чистыми unit tests,
а создание/очистку разрешённой БД — в CI. DSN и пароли не выводить.

### A02 и A25. Сборка и жизненный цикл Meta client

[api/routes.py](../api/routes.py), строка 132 и блок присваиваний после
`include_router`: `MetaClient()` без provider заменяет экземпляры в accounts,
adsets, delivery, audit и summary. Например,
[api/routers/accounts.py](../api/routers/accounts.py):55 изначально создаёт
`MetaClient(cache_provider=PostgreSQLInventoryCache())`.
В [meta_api/client.py](../meta_api/client.py) использование shared cache и его
invalidation условны по `_cache_provider`. Следовательно, production import path
отключает предусмотренную роутерами интеграцию; влияние на квоты/свежесть требует
отдельного измерения, но потеря provider установлена непосредственно.

[api/server.py](../api/server.py)::lifespan после `yield` не закрывает клиентов;
отдельный client также есть в [api/meta_oauth.py](../api/meta_oauth.py):58.
Worker закрывает свои клиенты явно в `services/worker.py`, что следует сохранить.
Нужен один явный владелец API clients, правильный cache provider и teardown;
не удалять возможность подмены клиента в тестах до замены test fixtures.

Актуализация C02 ([PR #176](https://github.com/hiurano/buyerly/pull/176), 2026-09-25): выводы повторно подтверждены на `b0ff681`.
Исправление назначает владельцем MetaClient конкретный FastAPI app, сохраняет
PostgreSQL provider и освобождает HTTP transport в lifespan `finally`.
Все Meta routers и OAuth account import получают клиент через request dependency;
тестовые подмены привязаны к app. Повторный lifespan создаёт новый клиент.
MetaOAuthClient использует отдельный context-managed HTTP transport на каждый
запрос и дополнительного shutdown не требует. Worker не изменён.
Проверки и статус PR: [C02 в плане](../implementation_plan.md#c02--исправить-meta-cache-wiring-и-lifecycle-a02-a25).

### A03. Workspace/account/request scope в Zustand

[useAppStore.ts](../frontend/src/store/useAppStore.ts):450, 602:
`loadAccountRuleAttachments` и `loadRules` выполняют запрос и без проверки
актуальности записывают результат в singleton. В store нет workspace key/reset
для этих данных. [App.tsx](../frontend/src/App.tsx) remount по
`key={routeWorkspace.id}` пересоздаёт React subtree, но не module-level Zustand.
`apiRequest` берёт workspace из URL в момент отправки, что защищает серверную
область запроса, но не место последующего сохранения результата.

Сценарий проверки: начать загрузку A, перейти в B, получить ответ B, затем A.
Второй сценарий — быстро сменить выбранный account при загрузке attachments.
Старый ответ может заменить актуальное состояние; backend authorization при этом
не объявляется сломанной. Нужны request generation/scope, reset domain data при
смене workspace/logout и запрет mutations из stale state. Проверить также
завершение уже отправленной mutation после перехода. Простого `AbortController`
без проверки перед `set()` недостаточно.

Исправление после аудита: C03 — [PR #179](https://github.com/hiurano/buyerly/pull/179).
Scope generation, reset и проверки после await покрыты исполняемым store harness
и Chromium; актуальный статус и ограничения записаны в
[плане C03](../implementation_plan.md#c03--ограничить-async-state-текущим-контекстом-a03).
Исходное наблюдение выше остаётся снимком базы аудита.

### A04. Истинный parent строки analytics

[analytics_store.py](../services/analytics_store.py)::get_hierarchy_breakdown,
строка 821: `parent_entity_id` в каждой строке берётся из аргумента запроса,
хотя при account-wide запросе выборка содержит adsets разных campaigns и ads
разных adsets. В факте есть `first_fact.parent_entity_id`.

[liveCampaigns.ts](../frontend/src/components/campaigns/liveCampaigns.ts),
`hierarchyAdSetToRow`/`hierarchyAdToRow`, используют именно это поле для поиска
campaign/adset. [CampaignsView.tsx](../frontend/src/components/campaigns/CampaignsView.tsx)
запрашивает все три уровня с parent=account. Поэтому родительская связь теряется
в ответе и преобразовании UI. Тест account-wide в
[test_analytics_fact_store.py](../tests/test_analytics_fact_store.py) проверяет
entity IDs, но не сохранение parent chain.

Исправлять отдельно от визуального рефакторинга: различить query parent и entity
parent, проверить минимум две campaigns с несколькими adsets/ads, а также прямой
drill-down и workspace isolation. Согласовать HTTP/TS contract и документацию.

### A05. Timezone при прямом drill-down

[analytics_store.py](../services/analytics_store.py),
`get_hierarchy_breakdown`:773–779 и `get_entity_timeseries`:870–877:
кабинет определяется только если parent совпадает с account ID; для campaign
или adset берётся `UTC`. [StatisticsView.tsx](../frontend/src/components/statistics/StatisticsView.tsx)
передаёт ID выбранного родителя в hierarchy и timeseries при drill-down.

Около смены суток UTC и локальная дата кабинета расходятся; children, previous
window и trend могут относиться к другим датам, чем account-wide экран.
Необходимо найти владельца parent в том же workspace до расчёта дат, не доверяя
произвольному account ID клиента. Тесты: фиксированное время, timezone по обе
стороны UTC, campaign/adset parents, DST, чужой/неизвестный parent.

### A06. Окружение backup cron

[setup_backup_cron.sh](../scripts/setup_backup_cron.sh):12, 27 запускает
`backup_db.sh` после `cd`, но не загружает настройки. Сам
[backup_db.sh](../scripts/backup_db.sh) читает только environment. Compose
`env_file` передаёт настройки контейнерам, не host cron.
При отсутствии экспортированных переменных путь выполняется без encryption
и offsite sync. Это расходится с ожидаемым эффектом настройки из
[DEPLOYMENT.md](DEPLOYMENT.md), если оператор заполнил только `.env`.

Нужен явный документированный способ безопасно передать environment в cron,
без печати секретов и без исполнения произвольного dotenv как shell-кода.
Отдельно проверить права лог-файла для non-root ветви и timezone расписания:
комментарий «03:00 UTC» не устанавливает timezone cron daemon.

### A07. Целостность публикации backup и формат offsite restore

[backup_db.sh](../scripts/backup_db.sh) пишет сразу в окончательное имя,
подходящее под `--latest-local`; после обрыва pipeline частичный файл остаётся.
Для encrypted ветви после pipeline есть только `test -s`; сообщение «verified»
и `last_backup_at` не являются результатом restore-проверки.

[restore_db.sh](../scripts/restore_db.sh):56 всегда сохраняет offsite download
как `latest_offsite_restore.sql.gz.enc`. Но backup поддерживает незашифрованный
`.sql.gz`, а [offsite_sync.py](../scripts/offsite_sync.py)::upload_file его не
запрещает. Тогда restore выбирает неверный decrypt path по расширению.

Нужны временный файл вне latest-pattern, проверка, atomic rename, cleanup при
ошибке и сохранение/проверка исходного формата при download. Проверить обрыв
dump/upload/download, пустой и повреждённый архив, `.gz` и `.gz.enc`. Не менять
шифроформат старых backup без обратной совместимости; тестировать на fixtures.

## Подробности технического долга

| ID | Источники и наблюдение | Безопасное направление |
|---|---|---|
| A08 | `backup_db.sh` копирует только PostgreSQL; `buyerly-uploads` — отдельный volume. `.github/workflows/restore-drill.yml` вручную повторяет pg_dump/openssl/psql и не вызывает три production scripts. `drill_restore.sh` проверяет таблицы и непустую revision, но не восстановление всех данных/файлов. | Зафиксировать scope восстановления, добавить uploads и интеграционную проверку именно scripts. Не заявлять, что synthetic CI подтверждает VPS/S3 restore. |
| A09 | `requirements.txt`: почти все зависимости имеют лишь нижнюю границу. CI и `Dockerfile` независимо выполняют pip install; frontend имеет `package-lock.json` и `npm ci`. | Один воспроизводимый Python dependency artifact для CI/image. Обновление версий — отдельный PR; не обновлять весь стек под видом lock. |
| A10 | `api/routes.py::_RoutesModule.__setattr__` вручную распространяет session/client на список модулей, затем подменяет `sys.modules[...].__class__`. `tests/test_api.py::asyncSetUp` использует это поведение. | Ввести явные dependencies/resources и fixtures с восстановлением; мигрировать consumers постепенно; удалить magic последним. |
| A11 | `api/deps.py`: workspace authorization, account groups, rule snapshots, summary serialization/cache. `get_user_accounts` делает backfill на read path и глотает exception от `flush` (строки 454–464). `_ensure_stable_account_owner` — `pass`, но вызывается из rules handlers. | Разнести по доменам; отдельно закрепить поведение legacy accounts и транзакций тестами. Не менять OR ownership predicates механически. No-op убрать после доказательства, что новой проверки владения не требуется. |
| A12 | `database/db.py`: множество `migrate_*`, импортируемых `tests/test_migrations.py`; runtime runner использует Alembic. Revisions 0007/0008/0011/0013 импортируют живые helpers, 0009 — settings. | Отделить runtime DB/bootstrap/passwords от исторического кода. Составить граф migration imports. Не удалять revisions и необходимые им helpers; проверить upgrade с пустой и baseline БД. |
| A13 | `database/db.py::hash_password/verify_password` используют PBKDF2 600000 iterations; `api/routers/auth.py::login_user/change_password` и `api/deps.py::_confirm_admin_password` вызывают их синхронно из async пути. | Измерить concurrency/latency в CI, вынести CPU работу в ограниченный thread execution, сохранив scheme, legacy rehash, rate limits и проверки ошибок. Стоимость password hashing не снижать ради скорости. |
| A14 | `scheduler/worker.py::run_cycle`: один большой session scope, сетевые операции и jitter внутри прохода; status/budget ветви повторяют success/error/audit handling. Внутренние commits/claims уже существуют. | Сначала выделить чистые расчёты/формирование audit, затем оркестрацию. Изменение границ транзакций — отдельная задача с failure injection; не обещать exactly-once и не добавлять параллелизм механически. |
| A15 | `services/analytics_store.py::cleanup_expired_facts` определён, runtime вызовов в отслеживаемом коде не найдено. Очистка sessions/OTP/OAuth states также требует отдельной инвентаризации, retention audit нельзя предполагать. | Сначала policy и оценка объёмов, затем bounded scheduled cleanup с метриками и тестами границ. Не запускать удаление production данных в рамках чистки. |
| A16 | В `frontend/package.json` есть `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `clsx`, `tailwind-merge`; прямые импорты в src/config/scripts не найдены. Все TS/TSX из первоначального среза достижимы синтаксически от main. `SelectionDock` импортирован, но Actions не имеет handler; campaign rows в текущем view получают `readOnly`. | Кандидаты — зависимости и неактивные ветви, а не список файлов для слепого удаления. Проверить dynamic usage, scripts и source-string tests; отличить синтаксический импорт от реально доступного UI. `LabelSelectorPopover` импортируется, потому не объявлен мёртвым файлом. |
| A17 | `index.css`:360–367 задаёт семь `--display-*` значений вне `tokens.css`. Три dialog компонента повторяют Radix overlay/content, z-index и shadow. `prefers-reduced-motion` в product sources не найден. | Перенести semantic definitions, выделить Dialog, затем consumers. Проверять focus/escape/busy и четыре ширины. Общие таблицы из #171 переиспользовать, не создавать заново. |
| A18 | `useAppStore.ts` совмещает types, mappers, layout, view preferences, server state и mutations. `loadRules` превращает ошибку `/api/accounts` в `[]`. `StatisticsView` и `CampaignsView` совмещают загрузку/действия/рендер. | После C03 выделять domain hooks/slices/mappers; показывать частичную недоступность accounts. Сохранить freshness, null/zero, currency и mutations/undo contracts. Новая state library не обязательна. |
| A19 | `test_react_frontend_contract.py` преимущественно читает исходники и проверяет строки; это не проверка поведения. В `test_api.py` и `test_workspaces.py` session makers и часть settings присваиваются глобально без симметричного восстановления всех значений. | Сохранить полезные архитектурные assertions; race/keyboard/errors проверять поведением. Fixtures должны возвращать globals в исходное состояние; проверить независимость от порядка/sharding. |
| A20 | `.github/workflows/statistics-visual.yml` paths не включают `src/ui/**`, `src/styles/index.css`, store/lib, lock/config. `deploy.yml::ci` ждёт только frontend/test; deploy также не зависит от visual. | Расширить trigger coverage и явно определить обязательность visual check. Согласовать skipped/not-applicable результат с required check; branch protection сверить отдельно. |
| A21 | README/ARCHITECTURE/docs index запрещают все локальные проверки, AGENTS §1 разрешает дешёвые; `tests/test_documentation.py` требует старую формулировку. README описывает email login как основной после password PR #170. UI docs утверждают, что `index.css` не содержит media queries, хотя есть правило в конце файла. Backlog ещё предлагает comparison/trend; UI docs ссылаются на архивную queue 8/BL-052. | Исправлять текст вместе с зависимыми assertions. Различать действующие правила, исторические отчёты и product backlog. AGENTS требование 390/768/1024/1440 сохраняется при UI-работе. |
| A22 | `api/auth.py` поддерживает legacy bearer conversion и dev fallback; `User.auth_token` ещё используется. `/api/summary`, preferences/snapshots и legacy migrations документированы и тестируются. | Создать inventory compatibility contracts, владельцев и условий отключения. Нет React consumer — не доказательство отсутствия внешнего клиента или legacy DB. |
| A23 | Analytics hierarchy/timeseries загружают факты через `.all()` и агрегируют Python; `CampaignsView` читает сразу три уровня. `offsite_sync.py` загружает файл `read_bytes()` и скачивает response целиком. | Измерить объёмы/RSS/SQL plans/request counts на synthetic data в CI. Выбрать paging/aggregation/streaming по замерам, сохранив метрики. Это пока не доказанный performance incident. |
| A24 | Нет project lint configs/scripts для Python/TS/shell и lint job в основном workflow; TS strict уже включён. `ci_test_shard.py` собирает методы regex и использует оценочные веса. | Минимальные lint gates без полного форматирования, проверка `bash -n`/ShellCheck, равенство shard collection и unittest discovery в CI без запуска тестов на discovery шаге. Сначала оценить noise и покрытие collector. |

## Что не следует удалять автоматически

- Alembic revisions, migration helpers и legacy columns: сначала проверить все
  upgrade paths и реальные условия отказа от совместимости.
- `services/workspace_slugs.py` и `core/workspace_slugs.py`: это разные
  ответственности (транзакционное выделение и нормализация), не копии.
- Summary API, auth compatibility, backup/deploy scripts: могут иметь внешних
  consumers; использование устанавливается отдельно от frontend imports.
- Архивы `docs/archive/` и branding assets: сохранение истории уже организовано,
  наличие файла без runtime import не делает его мусором. Не хранить новые
  сторонние screenshots или локальные HTML captures в репозитории.
- Действующие security/rate-limit/ownership проверки и source contract tests:
  сначала заменить защиту равноценным поведением, затем удалять старую форму.

## Недостающие доказательства и отдельные решения

| Вопрос | Как закрыть |
|---|---|
| Воспроизведение A03 в браузере | Controlled delayed responses для A/B workspace и account, проверка store/видимого UI и mutation target |
| Реальная стоимость A13/A14/A23 | Synthetic CI measurements с фиксированными наборами; production profiling только отдельной задачей |
| Состояние cron, внешнего uptime monitor, offsite и uploads backups | Отдельная read-only эксплуатационная сверка без вывода credentials |
| Нужны ли legacy bearer, summary endpoints и old helpers | Inventory consumers, usage evidence, explicit deprecation decision |
| Политика retention | Сроки по таблицам, продуктовые потребности, обязательства хранения; не выводить из имени cleanup function |
| Версии зависимостей и уязвимости | Отдельная проверка package advisories/совместимости при dependency PR; этот аудит не делал сетевого version/CVE research |
| Mobile/accessibility всего продукта | Browser audit после стабилизации state; существующий Statistics script не покрывает весь продукт |
| Required checks GitHub | Read-only просмотр branch protection/rulesets при C20; workflow YAML этого не доказывает |

## Проверки этого этапа

Проведены чтение/поиск по исходникам, сопоставление imports и call sites,
AST parsing Python без import приложения, синтаксический frontend import graph,
проверка Git-базы и чтение GitHub CI/PR metadata. Никакие benchmark, DB migration,
production backup/restore или рекламные действия не выполнялись.

Финальная проверка документационного PR: локальные ссылки, `git diff --check`,
полное чтение diff и CI после открытия PR. Результаты PR следует смотреть в GitHub;
этот отчёт остаётся снимком базы, а не постоянно обновляемой сводкой готовности.
