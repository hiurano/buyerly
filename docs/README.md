# Документация Buyerly

## Действующие документы

| Вопрос | Источник |
|---|---|
| Что делает продукт и как начать | [README](../README.md) |
| Как связаны компоненты | [ARCHITECTURE.md](ARCHITECTURE.md) |
| HTTP-контракты | [API.md](API.md) |
| Вход, workspace и приглашения | [WORKSPACES_AUTH_AND_INVITES.md](WORKSPACES_AUTH_AND_INVITES.md) |
| URL и терминология | [INFORMATION_ARCHITECTURE.md](INFORMATION_ARCHITECTURE.md) |
| Правила UI-разработки | [UI_CONTRACT.md](UI_CONTRACT.md), [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) |
| Деплой и восстановление | [DEPLOYMENT.md](DEPLOYMENT.md), [INCIDENT_RUNBOOKS.md](INCIDENT_RUNBOOKS.md), [RELIABILITY_SLO.md](RELIABILITY_SLO.md) |
| Миграции БД | [database_modernization_and_migrations.md](database_modernization_and_migrations.md) |
| Дальнейшие задачи | [PRODUCT_BACKLOG.md](PRODUCT_BACKLOG.md) |
| Выпущенные изменения | [CHANGELOG.md](../CHANGELOG.md) |

## Материалы, требующие проверки внешнего состояния

[Token guide](TOKEN_GUIDE.md) описывает ручное подключение через System User Token. Разрешения и статусы Meta Dashboard нужно проверять перед применением; документ не подтверждает production-доступ.

## История

[DECISIONS.md](DECISIONS.md) хранит решения по датам, включая заменённые.

Новые изменения вносятся в соответствующий действующий документ. Не создавайте ещё одну сводку готовности или копию бэклога. Рабочие заметки, планы и отчёты о проверках в репозиторий не кладутся: он публичный.
