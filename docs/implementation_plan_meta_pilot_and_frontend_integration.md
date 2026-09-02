# План: безопасный пилот Meta и подключение нового frontend

**Статус:** proposed
**Дата:** 3 сентября 2026
**Владелец решения:** Buyerly

## Цель

Довести Buyerly до безопасного первого пилота на реальном Meta Business Manager: пользователь подключает Facebook-профиль через официальный OAuth, выбирает доступные рекламные кабинеты, видит фактические данные, создаёт и назначает правила, а автоматизация выполняет только явно разрешённые действия.

Цель пилота — подтвердить корректность подключения и контрольных действий **без запуска платной рекламы и без риска непреднамеренного расхода**. Выход в широкое использование и подключение внешних клиентов не входят в первый пилот.

## Фактическая точка старта

### Что уже реализовано на backend

- Официальный Facebook Login for Business: OAuth state, callback, обмен кода на token, проверка scopes и шифрование token (`api/meta_oauth.py`).
- Обнаружение `/me/adaccounts`, группировка по Business Manager, выборочный импорт и привязка кабинета к `MetaConnection`.
- Worker c чтением Insights, engine условий, cooldown/idempotency, аудитом и Telegram-уведомлениями (`scheduler/worker.py`, `rules/engine.py`).
- Реальные вызовы Meta Marketing API для `PAUSED` / `ACTIVE` ad set и изменения daily budget (`meta_api/client.py`).
- Импортированный кабинет получает `rules_enabled=false`; это правильный безопасный default.

### Блокеры первого реального сценария

1. Новый React frontend использует HTTP API для auth/onboarding, но разделы кампаний, правил, inbox и statistics питаются mock-данными Zustand (`frontend/src/store/useAppStore.ts`). Создание правила, назначение правила и toggle статуса не сохраняются в backend.
2. В новом frontend нет экрана Meta Connections и нет вызовов `/api/meta/*`. Callback OAuth по умолчанию возвращает на `/facebook-accounts`, который новый router относит к системным/unknown маршрутам. Поэтому успешный OAuth не приводит пользователя к выбору найденных кабинетов.
3. Публичная invite-ссылка backend имеет путь `/connect/meta/<token>`, но frontend не содержит такого маршрута или trust-flow. Этот сценарий пока не готов для внешнего владельца кабинета.
4. До пилота нужен явный общий предохранитель против write-операций Meta. Одного `rules_enabled` недостаточно как операционного барьера: ошибка frontend, импорта или конфигурации не должна включить автодействия неожиданно.

## Definition of Done

Пилот считается завершённым, когда одновременно выполнены все условия:

1. Тестовый Facebook-профиль с app-role проходит OAuth через Buyerly; token не раскрывается в UI, логах или БД в открытом виде.
2. В UI можно увидеть health подключения, scopes, найденные кабинеты и импортировать ровно выбранные кабинеты.
3. После импорта видны реальные read-only данные кабинета и инвентаря; отсутствие spend/insights корректно отображается как отсутствие данных, а не как нули или ошибка.
4. Правило, созданное в новом UI, после перезагрузки хранится в API/БД, назначается конкретному кабинету и имеет понятный статус: draft, observe, armed или disabled.
5. В режиме `observe` worker формирует preview/audit/уведомление, но не вызывает write endpoint Meta.
6. Минимум один write-path (`PAUSED`, затем проверка фактического состояния) подтверждён только в Sandbox Account Meta либо на специально выделенном безопасном ad set; рабочие кампании не затрагиваются.
7. Во время пилота включён allowlist тестовых account/ad set и есть аварийный kill switch, после выключения которого новые write-вызовы Meta невозможны.
8. Контрактные и интеграционные проверки для изменённых частей проходят только в GitHub Actions; локальные test-runners не запускаются.

## План работ

### Этап 0. Зафиксировать контур и не включать автоматику

**Результат:** определён один тестовый workspace, один Facebook-профиль с ролью в Meta App и только тестовые assets.

- Не передавать в чат, Git, frontend или логи App Secret, user/system token, cookie и пароли Facebook.
- В Meta Dashboard проверить Development/Live mode, app roles, точный redirect URI, фактически предоставленные `ads_read`, `ads_management`, `business_management` и срок token.
- Использовать сначала профиль с app-role. Для профилей без роли и внешних клиентов Advanced Access/App Review остаются отдельным выпускным gate.
- Завести реестр пилотных account ID и ad set ID. Никакие другие account ID не допускаются к mutating операциям.
- До появления frontend-связки не включать `rules_enabled` на продуктивных кабинетах.

### Этап 1. Сделать реальным Meta trust-flow в новом frontend

**Результат:** пользователь завершает цепочку «Подключение → выбор → импорт → read-only проверка» из одного интерфейса.

- Не добавлять отдельную вкладку Connections: использовать `Ads Manager` как точку входа. При отсутствии импортированных кабинетов показывать единственный CTA `Подключить кабинеты`; в заголовке оставить меню `…` с действиями `Подключить Facebook` и `Создать ссылку для подключения`.
- Подключить UI к `POST /api/meta/oauth/start`, `GET /api/meta/connections`, `POST .../validate`, `POST .../discover`, `GET .../assets` и `POST .../import`.
- Исправить callback return path на новый workspace-маршрут и отобразить все статусы `connected/cancelled/invalid_callback/expired_state/connection_failed`.
- Реализовать public invite landing и success page одновременно с созданием ссылки; это не отдельный раздел workspace и не дублирует список рекламных кабинетов.
- Отложить отдельное управление health/reconnect до следующей итерации; token ни в одном response/UI не выводить.

### Этап 2. Заменить mock-store в рабочих разделах на API

**Результат:** интерфейс не имитирует продуктовые операции.

- Кампании/ad sets/ads и статистика загружаются из существующих read API/analytics facts с явным `loading`, empty и error state.
- RulesView создаёт, редактирует, удаляет и назначает реальные `RulePreset` через `/api/rules/*`; локальный Zustand остаётся только для чисто UI-состояния (фильтры, ширина, выделение).
- Inbox и action history получают реальные audit events и runtime status, а не demo-уведомления.
- Удалить или явно изолировать все demo fixtures, чтобы в production нельзя было принять mock-карточку или toggle за результат Meta.
- До UI-работ обязательно прочитать и соблюдать `docs/UI_CONTRACT.md` и относящиеся разделы `docs/DESIGN_SYSTEM.md`.

### Этап 3. Ввести безопасную модель запуска правил

**Результат:** состояние автоматики однозначно и обратимо.

- Добавить глобальный server-side режим `disabled | observe | enforce`, default `disabled`.
- В `enforce` разрешать write-вызовы только для workspace/account/ad set allowlist; allowlist управляется владельцем и журналируется.
- У правила сделать явный lifecycle: `draft` → `observe` → `armed`; импорт никогда не переводит правило в `armed`.
- В `observe` выполнять тот же расчёт engine и записывать planned action, причины, before/desired state и correlation ID, но не писать в Meta.
- Добавить один-click kill switch, который worker читает перед каждым mutating request, а не только в начале цикла.
- В UI показывать режим и область действия рядом с каждой кнопкой включения; включение `armed/enforce` требует явного подтверждения владельца.

### Этап 4. Безденежная техническая верификация

**Результат:** доказано, что API access и worker работают, но рекламные показы не запущены.

1. **OAuth/read-only на настоящем кабинете.** Подключить собственный app-role Facebook-профиль, обнаружить и импортировать один кабинет, прочитать статус/валюту/timezone/инвентарь. Это не создаёт кампанию и не расходует бюджет.
2. **Sandbox Meta.** В Meta Developer Dashboard создать Sandbox Ad Account и использовать его для write-проверок. Созданные sandbox assets не доставляют рекламу и не должны накапливать spend; перед началом проверить это в текущем интерфейсе Dashboard Meta.
3. **Paused test asset.** Если Sandbox недоступен для нужного endpoint, создать отдельно именованный тестовый campaign/ad set в статусе `PAUSED`; не включать его и не создавать delivery. Проверить только идемпотентный `PAUSED` и чтение состояния. `ACTIVE` и budget-change на реальном account в этот этап не входят.
4. **Replay для условий.** Sandbox обычно не даёт реалистичные Insights. Поэтому добавить controlled replay fixture: сохранённый ответ Insights проходит через тот же RuleEngine/worker в `observe`, создаёт planned action и audit, но не вызывает Meta write API. Это проверяет Spend/CPA/zero-funnel/cooldown без искусственного расхода.
5. **Уведомления и отмена.** Проверить Telegram/audit/correlation ID и отключение kill switch. Undo write-action проверяется только в Sandbox.

### Этап 5. Ограниченный live-pilot

**Результат:** одна осознанно выбранная автоматика доказана в реальном операционном цикле.

- Начать с одного собственного account и одного безопасного ad set, только с `notify_only` или `observe` в течение согласованного периода.
- Затем разрешить строго один тип необратимого действия: обычно `turn_off`; `turn_on` и budget changes оставить выключенными до отдельного решения.
- Перед каждым переходом собрать evidence: connection health, scopes, worker runtime, preview actions, audit trail, Meta state after action и Telegram delivery.
- Прервать пилот и вернуть `disabled`, если есть расхождение UI/API/Meta, ошибка доступа/token или незапланированный planned action.

### Этап 6. Готовность к внешним пользователям

**Результат:** Buyerly можно предлагать не только профилям с app-role.

- Завершить Business Verification, Advanced Access/App Review для реально используемых permissions и выполнить Data Use Checkup по требованиям Meta.
- Записать актуальный screencast на уже работающем UI, а не на mock-экранах; предоставить reviewer account и изолированные demo assets.
- Подготовить operational runbook: token expiry/reconnect, Meta quota, kill switch, incident response, удаление подключения и данных.
- Отдельно провести security/privacy review и только затем включать public invite flow.

## Порядок выпуска

Каждый этап, меняющий код, выполняется в отдельной ветке от чистого `main`, с отдельным PR и GitHub Actions quality gate. Рекомендуемая последовательность PR:

1. `feat/meta-safety-gates` — server-side режимы, allowlist, kill switch, observe audit.
2. `feat/meta-connections-ui` — OAuth connection UI, callback, discovery/import.
3. `feat/frontend-live-data` — замена mock данных на реальные read API.
4. `feat/rules-observe-mode` — реальный builder/assignment, preview/replay.
5. `test/meta-sandbox-pilot` — безопасный доказательный сценарий и operator runbook.

После каждого merge: production deploy, healthcheck, ручная проверка только соответствующего шага, затем просмотр GitHub Actions logs при сбое. Локальные `pytest`, `unittest` и аналоги не запускаются.

## Решения, которые нужны от владельца перед этапом 0

1. Какой Facebook-профиль с app-role и какой workspace будут пилотными.
2. Разрешено ли создать отдельный Sandbox Ad Account; если нет — какой существующий account допустим только для read-only проверки.
3. Нужна ли в первом live-pilot только `notify_only`, или допустим один строго обозначенный `turn_off` action после sandbox-верификации.
4. Считается ли внешнее подключение клиентов целью ближайшего релиза, или сначала нужен внутренний team-only pilot.

## Источники

- `docs/FACEBOOK_AUTHORIZATION_PLAN.md`
- `docs/META_APP_REVIEW_SUBMISSION.md`
- `docs/FULL_META_BM_VERIFICATION_GUIDE.md`
- Meta Marketing API Postman collection: https://www.postman.com/meta/facebook-marketing-api/collection/0zr4mes/facebook-marketing-api-mapi
