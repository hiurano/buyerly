# Разработка Buyerly

Как поднять Buyerly у себя, проверить изменения и где что лежит в репозитории. Что такое сам продукт — в [README](../README.md).

## Архитектура

Cloudflare Tunnel → `api` (FastAPI, отдаёт и React-приложение) → PostgreSQL 16.
Отдельно работает `worker` (APScheduler). Всё собрано в один образ и один проект Docker Compose.
Одноразовый сервис `migrate` выполняет миграции Alembic перед запуском приложения.

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

Сайт — http://localhost:5173, вход через «Continue with email»: `dev@buyerly.localhost`. Письмо никуда не уходит: ссылка и код входа — в логе API (`docker compose -f compose.dev.yaml logs api`, строка после `[DEV EMAIL]`). Изменения во frontend появляются в браузере без перезагрузки, API перезапускается сам при правке Python-кода. База отдельная и локальная (том `buyerly-dev-postgres`), production и Meta не затрагиваются. Остановить — `docker compose -f compose.dev.yaml down`; с `-v` удаляются и локальные данные. Новая база сразу открывается в workspace `Dev` (`scripts/dev_seed.py`), без онбординга.

Meta здесь фейковый (`scripts/fake_meta.py`, сервис `fake-meta`): три выдуманных кабинета (NL · Lead gen, US · Sweepstakes, DE · E-commerce) с кампаниями, ad sets и объявлениями уже подключены к `Dev`. Расход за сегодня растёт по ходу дня в часовом поясе кабинета, прошлые дни не меняются. Локальный worker синхронизирует цифры и запускает правила: привяжите правило в Ads Manager, и оно остановит ad set или поменяет бюджет в фейковом Meta, с записью в Inbox и Undo. Кто и когда что остановил, фейк хранит в томе `buyerly-dev-meta`. Worker не перезапускается сам при правке кода — `docker compose -f compose.dev.yaml restart worker`.

### Превью ветки

Каждая рабочая копия (`git worktree`) может поднять своё превью рядом с основным стеком и превью других веток — со своей базой, портом и адресом:

```bash
scripts/preview.sh up     # поднять или обновить, печатает адрес
scripts/preview.sh down   # остановить и удалить данные превью
scripts/preview.sh list   # все превью на этом компьютере
```

Адрес вида `http://<ветка>.localhost:5180/dev`, вход тот же: `dev@buyerly.localhost`, код — в `scripts/preview.sh logs`. Отдельный хост нужен, чтобы вход в превью не выкидывал из `localhost:5173` и других превью. Правки в этой рабочей копии видны в её превью сразу, как и в основном стеке.

Без Docker API запускается на порту 8080 — его ожидает Vite proxy:

```bash
uvicorn services.api:app --host 127.0.0.1 --port 8080 --reload
```

Frontend запускается командой `npm run dev` из `frontend/` после установки зависимостей.
Для API нужны PostgreSQL, Python-зависимости из `requirements.txt` и применённые миграции. На локальном HTTP используется `SESSION_COOKIE_SECURE=false`; production-настройки описаны в [DEPLOYMENT.md](DEPLOYMENT.md).

## Проверки и изменения

Сборка React и тесты выполняются в GitHub Actions через [.github/workflows/deploy.yml](../.github/workflows/deploy.yml).

```bash
gh run watch <run-id> --exit-status
gh run view <run-id> --log-failed
```

Каждая задача выполняется в отдельной ветке от обновлённого `main`. Слияние PR допускается после успешного CI; `main` автоматически деплоится на VPS.

## Структура

| Каталог | Назначение |
|---|---|
| `frontend/` | React, TypeScript, Vite, UI primitives и tokens |
| `frontend/public/` | Публичные юридические HTML и ресурсы |
| `api/` | HTTP-маршруты, схемы, авторизация и зависимости |
| `core/` | Метрики, правила валидации, аудит, почта и общие механизмы |
| `database/`, `alembic/` | Модели, подключение и миграции PostgreSQL |
| `meta_api/` | Meta HTTP-клиент и OAuth |
| `rules/`, `scheduler/` | Оценка правил и фоновое выполнение |
| `services/` | Точки запуска и прикладные сервисы |
| `scripts/` | Деплой, backup/restore и обслуживание |
| `tests/` | Облачные проверки |
| `uploads/` | Runtime-файлы; не хранятся в Git |
| `docs/` | Действующая документация |
