# Разработка Buyerly

Как поднять Buyerly у себя, проверить изменения и где что лежит в репозитории. Что такое сам продукт — в [README](../README.md).

## Архитектура

Cloudflare Tunnel → `api` (сервер на TypeScript: Fastify и GraphQL, отдаёт и React-приложение) → PostgreSQL 16.
Отдельно работает `worker` (фоновые задачи на BullMQ, очереди в Redis). Всё собрано в один образ и один проект Docker Compose.
Одноразовый сервис `migrate` выполняет миграции TypeORM перед запуском приложения. Подробнее — [ARCHITECTURE.md](ARCHITECTURE.md).

## Запуск

Требуются Docker Compose и настроенное окружение по [.env.example](../.env.example).

```bash
cp .env.example .env
# Заполните конфигурацию и секреты перед запуском.
docker compose build
docker compose run --rm migrate
docker compose up -d
curl -fsS http://127.0.0.1:8080/health/ready
```

## Локальная разработка

Всё приложение на своём компьютере, правки видны сразу (нужен только Docker Desktop):

```bash
docker compose -f compose.dev.yaml up -d --build
```

Сайт — http://localhost:5173, вход через «Continue with email»: `dev@buyerly.localhost`. Письмо никуда не уходит: ссылка и код входа — в логе сервера (`docker compose -f compose.dev.yaml logs api`, строка с `[DEV EMAIL]`). Изменения во frontend появляются в браузере без перезагрузки, сервер пересобирается и перезапускается сам при правке `server/` или `packages/shared/`. База отдельная и локальная (том `buyerly-dev-postgres`), production и Meta не затрагиваются. Остановить — `docker compose -f compose.dev.yaml down`; с `-v` удаляются и локальные данные. Новая база сразу открывается в workspace `Dev` (`server/src/scripts/dev-seed.ts`), без онбординга.

Meta здесь фейковый (`server/src/scripts/fake-meta.ts`, сервис `fake-meta`): три выдуманных кабинета (NL · Lead gen, US · Sweepstakes, DE · E-commerce) с кампаниями, ad sets и объявлениями уже подключены к `Dev`. Расход за сегодня растёт по ходу дня в часовом поясе кабинета, прошлые дни не меняются. Локальный worker синхронизирует цифры и запускает правила: привяжите правило в Ads Manager, и оно остановит ad set или поменяет бюджет в фейковом Meta, с записью в Inbox и Undo. Кто и когда что остановил, фейк хранит в томе `buyerly-dev-meta`. Worker перезапускается сам, когда `api` пересобрал сервер.

### Превью ветки

Каждая рабочая копия (`git worktree`) может поднять своё превью рядом с основным стеком и превью других веток — со своей базой, портом и адресом:

```bash
scripts/preview.sh up     # поднять или обновить, печатает адрес
scripts/preview.sh down   # остановить и удалить данные превью
scripts/preview.sh list   # все превью на этом компьютере
```

Адрес вида `http://<ветка>.localhost:5180/dev`, вход тот же: `dev@buyerly.localhost`, код — в `scripts/preview.sh logs`. Отдельный хост нужен, чтобы вход в превью не выкидывал из `localhost:5173` и других превью. Правки в этой рабочей копии видны в её превью сразу, как и в основном стеке.

Без Docker сервер запускается с `SERVER_PORT=8080` (как в `.env.example`) — этот порт ожидает Vite proxy. Нужны Node.js 24, PostgreSQL и Redis; зависимости ставятся один раз из корня репозитория (npm workspaces):

```bash
npm ci
npm run build --workspace @buyerly/server
node server/dist/migrate.js                  # миграции TypeORM, нужен DATABASE_URL
npm run dev --workspace @buyerly/server     # сервер, пересобирается при правке
node --watch server/dist/worker/main.js      # воркер, нужен REDIS_URL
```

Frontend запускается командой `npm run dev` из `frontend/`. На локальном HTTP используется `SESSION_COOKIE_SECURE=false`; production-настройки описаны в [DEPLOYMENT.md](DEPLOYMENT.md).

## Проверки и изменения

Сборка React и тесты выполняются в GitHub Actions через [.github/workflows/deploy.yml](../.github/workflows/deploy.yml).

```bash
gh run watch <run-id> --exit-status
gh run view <run-id> --log-failed
```

### Тесты сервера

Тесты [server/test](../server/test/) (Vitest) идут по HTTP против Postgres, который мигрировал `node server/dist/migrate.js`; без `SCHEMA_DATABASE_URL` они пропускаются (в CI — никогда). Тесту тренажёра правил нужна ещё одноразовая база `buyerly_test` (`TEST_DATABASE_URL`, `TEST_DATABASE_DISPOSABLE=buyerly_test`), тестам воркера — Redis. Проверки frontend — юнит-тесты Vitest рядом с кодом (`frontend/src/**/*.test.ts`, `npm test --workspace buyerly-frontend`) и сборка `npm run build --workspace buyerly-frontend`, браузерные сценарии — `scripts/*-browser.mjs`; полный список — в job-ах `frontend`, `browser` и `server` workflow.

```bash
export SCHEMA_DATABASE_URL=postgresql://buyerly:<пароль>@localhost:5432/buyerly_schema
npm run build --workspace @buyerly/server
DATABASE_URL=$SCHEMA_DATABASE_URL node server/dist/migrate.js
npm test --workspace @buyerly/server
npm run typecheck && npm run lint
```

Каждая задача выполняется в отдельной ветке от обновлённого `main`. Слияние PR допускается после успешного CI; `main` автоматически деплоится на VPS.

## Структура

| Каталог | Назначение |
|---|---|
| `frontend/` | React, TypeScript, Vite, UI primitives и tokens |
| `frontend/public/` | Публичные юридические HTML и ресурсы |
| `server/src/` | Сервер на TypeScript: маршруты (`routes/`), GraphQL (`graphql/`), авторизация, синхронизация, уведомления |
| `server/src/entities/`, `server/src/migrations/` | Сущности TypeORM и миграции PostgreSQL |
| `server/src/meta/` | Meta HTTP-клиент и OAuth |
| `server/src/rules/`, `server/src/worker/` | Оценка правил и фоновые задачи (BullMQ) |
| `server/src/scripts/` | Smoke, проверка восстановления, fake Meta, dev-seed, тренажёр правил |
| `server/test/` | Тесты сервера (Vitest) |
| `packages/shared/` | Общие типы клиента и сервера, контракт GraphQL |
| `scripts/` | Деплой, backup/restore и обслуживание |
| `uploads/` | Runtime-файлы; не хранятся в Git |
| `docs/` | Действующая документация |
