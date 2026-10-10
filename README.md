# Buyerly

Buyerly — сервис мониторинга и автоматизации Meta Ads для медиабайеров и команд.
Production-интерфейс написан на React; прежний vanilla-интерфейс удалён.

## Возможности

- **Inbox** — события текущего workspace, фильтры, поиск, подробности и безопасная отмена поддерживаемых действий.
- **Ads Manager** — подключение Meta, выбор кабинета и иерархия Campaigns → Ad sets → Ads с реальными статусами и метриками.
- **Rules** — создание правил и групп, условия AND/OR, периоды проверки, включение/выключение и назначения. Изменение бюджета поддерживается на уровне ad set.
- **Settings и onboarding** — профиль, workspace, подключения, вход по одноразовой email-ссылке или коду; доступ по whitelist либо приглашению.
- **Worker** — периодическая синхронизация Meta и выполнение правил с аудитом.

Наличие backend API не означает наличие соответствующего экрана. Текущие поверхности описаны в [дизайн-системе](docs/DESIGN_SYSTEM.md), ограничения и будущие задачи — в [бэклоге](docs/PRODUCT_BACKLOG.md).

## Архитектура

Cloudflare Tunnel → `api` (FastAPI, отдаёт и React-приложение) → PostgreSQL 16.
Отдельно работает `worker` (APScheduler). Всё собрано в один образ и один проект Docker Compose.
Одноразовый сервис `migrate` выполняет миграции Alembic перед запуском приложения.

## Запуск

Требуются Docker Compose и настроенное окружение по [.env.example](.env.example).

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

Сайт — http://localhost:5173, вход через «Log in with password»: `dev` / `buyerly-dev`. Изменения во frontend появляются в браузере без перезагрузки, API перезапускается сам при правке Python-кода. База отдельная и локальная (том `buyerly-dev-postgres`), production и Meta не затрагиваются. Остановить — `docker compose -f compose.dev.yaml down`; с `-v` удаляются и локальные данные. Новая база сразу открывается в workspace `Dev` (`scripts/dev_seed.py`), без онбординга.

Meta здесь фейковый (`scripts/fake_meta.py`, сервис `fake-meta`): три выдуманных кабинета (NL · Lead gen, US · Sweepstakes, DE · E-commerce) с кампаниями, ad sets и объявлениями уже подключены к `Dev`. Расход за сегодня растёт по ходу дня в часовом поясе кабинета, прошлые дни не меняются. Локальный worker синхронизирует цифры и запускает правила: привяжите правило в Ads Manager, и оно остановит ad set или поменяет бюджет в фейковом Meta, с записью в Inbox и Undo. Кто и когда что остановил, фейк хранит в томе `buyerly-dev-meta`. Worker не перезапускается сам при правке кода — `docker compose -f compose.dev.yaml restart worker`.

### Превью ветки

Каждая рабочая копия (`git worktree`) может поднять своё превью рядом с основным стеком и превью других веток — со своей базой, портом и адресом:

```bash
scripts/preview.sh up     # поднять или обновить, печатает адрес
scripts/preview.sh down   # остановить и удалить данные превью
scripts/preview.sh list   # все превью на этом компьютере
```

Адрес вида `http://<ветка>.localhost:5180/dev`, вход тот же: `dev` / `buyerly-dev`. Отдельный хост нужен, чтобы вход в превью не выкидывал из `localhost:5173` и других превью. Правки в этой рабочей копии видны в её превью сразу, как и в основном стеке.

Без Docker API запускается на порту 8080 — его ожидает Vite proxy:

```bash
uvicorn services.api:app --host 127.0.0.1 --port 8080 --reload
```

Frontend запускается командой `npm run dev` из `frontend/` после установки зависимостей.
Для API нужны PostgreSQL, Python-зависимости из `requirements.txt` и применённые миграции. На локальном HTTP используется `SESSION_COOKIE_SECURE=false`; production-настройки описаны в [DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Проверки и изменения

Сборка React и тесты выполняются в GitHub Actions через [.github/workflows/deploy.yml](.github/workflows/deploy.yml).

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

## Документация

Начните с [индекса документации](docs/README.md).

- [Архитектура](docs/ARCHITECTURE.md) и [история решений](docs/DECISIONS.md)
- [UI-контракт](docs/UI_CONTRACT.md) и [дизайн-система](docs/DESIGN_SYSTEM.md)
- [Маршруты и терминология](docs/INFORMATION_ARCHITECTURE.md)
- [HTTP API](docs/API.md) и [workspace, вход, приглашения](docs/WORKSPACES_AUTH_AND_INVITES.md)
- [Деплой](docs/DEPLOYMENT.md)
- [Бэклог](docs/PRODUCT_BACKLOG.md)

## License

Copyright (c) 2026 Artem Petruchenko. All rights reserved. Код открыт только для просмотра: копировать, изменять, распространять, запускать и предоставлять как сервис без письменного разрешения нельзя. Подробности в [LICENSE](LICENSE).
