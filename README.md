# Buyerly

Buyerly — сервис мониторинга и автоматизации Meta Ads для медиабайеров и команд.
Production-интерфейс написан на React; прежний vanilla-интерфейс удалён.

## Возможности

- **Inbox** — события текущего workspace, фильтры, поиск, подробности и безопасная отмена поддерживаемых действий.
- **Ads Manager** — подключение Meta, выбор кабинета и иерархия Campaigns → Ad sets → Ads с реальными статусами и метриками.
- **Rules** — создание правил и групп, условия AND/OR, периоды проверки, включение/выключение и назначения. Изменение бюджета поддерживается на уровне ad set.
- **Statistics** — метрики выбранного кабинета по кампаниям, ad set и объявлениям из Analytics Fact Store с указанием состояния данных.
- **Settings и onboarding** — профиль, workspace, подключения, вход по одноразовой email-ссылке или коду; доступ по whitelist либо приглашению.
- **Telegram и worker** — команды, уведомления, периодическая синхронизация Meta и выполнение правил с аудитом.

Наличие backend API не означает наличие соответствующего экрана. Текущие поверхности описаны в [дизайн-системе](docs/DESIGN_SYSTEM.md), ограничения и будущие задачи — в [бэклоге](docs/PRODUCT_BACKLOG.md).

## Архитектура

`web` (React/Vite + Nginx) → `api` (FastAPI) → PostgreSQL 16.
Отдельно работают Telegram `bot`, `worker` (APScheduler) и Redis для rate limiting.
Одноразовый сервис `migrate` выполняет миграции Alembic перед запуском приложения.

## Запуск

Требуются Docker Compose и настроенное окружение по [.env.example](.env.example).

```bash
cp .env.example .env
# Заполните конфигурацию и секреты перед запуском.
docker compose up -d --build
curl -fsS http://127.0.0.1:8080/health/ready
```

Для разработки вне Docker API запускается на порту 8080 — его ожидает Vite proxy:

```bash
uvicorn services.api:app --host 127.0.0.1 --port 8080 --reload
```

Frontend запускается командой `npm run dev` из `frontend/` после установки зависимостей.
Для API нужны PostgreSQL, Redis, Python-зависимости из `requirements.txt` и применённые миграции. На локальном HTTP используется `SESSION_COOKIE_SECURE=false`; production-настройки описаны в [DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Проверки и изменения

Локальный запуск тестов запрещён [AGENTS.md](AGENTS.md). Сборка React и тесты выполняются исключительно в GitHub Actions через [.github/workflows/deploy.yml](.github/workflows/deploy.yml).

```bash
gh run watch <run-id> --exit-status
gh run view <run-id> --log-failed
```

Каждая задача выполняется в отдельной ветке от обновлённого `main`. Слияние PR допускается после успешного CI; `main` автоматически деплоится на VPS.

## Структура

| Каталог | Назначение |
|---|---|
| `frontend/` | React, TypeScript, Vite, UI primitives, tokens и Nginx |
| `frontend/public/` | Публичные юридические HTML и ресурсы |
| `api/` | HTTP-маршруты, схемы, авторизация и зависимости |
| `core/` | Метрики, правила валидации, аудит, почта и общие механизмы |
| `database/`, `alembic/` | Модели, подключение и миграции PostgreSQL |
| `meta_api/` | Meta HTTP-клиент и OAuth |
| `rules/`, `scheduler/` | Оценка правил и фоновое выполнение |
| `bot/`, `services/` | Telegram, точки запуска и прикладные сервисы |
| `scripts/` | Деплой, backup/restore и обслуживание |
| `tests/` | Облачные проверки |
| `uploads/` | Runtime-файлы; не хранятся в Git |
| `docs/` | Действующая документация; история в `docs/archive/` |

## Документация

Начните с [индекса документации](docs/README.md).

- [Архитектура](docs/ARCHITECTURE.md) и [история решений](docs/DECISIONS.md)
- [UI-контракт](docs/UI_CONTRACT.md) и [дизайн-система](docs/DESIGN_SYSTEM.md)
- [Маршруты и терминология](docs/INFORMATION_ARCHITECTURE.md)
- [HTTP API](docs/API.md) и [workspace, вход, приглашения](docs/WORKSPACES_AUTH_AND_INVITES.md)
- [Деплой](docs/DEPLOYMENT.md)
- [Бэклог](docs/PRODUCT_BACKLOG.md) и [навигация по оставшимся работам](docs/REMAINING_PRODUCT_WORK.md)
- [План Meta-авторизации](docs/FACEBOOK_AUTHORIZATION_PLAN.md): исторические этапы не подтверждают текущий статус Meta Dashboard.
