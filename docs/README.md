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
| Аудит и этапы генеральной уборки | [PROJECT_CLEANUP_AUDIT.md](PROJECT_CLEANUP_AUDIT.md), [implementation_plan.md](../implementation_plan.md) |
| Выпущенные изменения | [CHANGELOG.md](../CHANGELOG.md) |

## Материалы, требующие проверки внешнего состояния

[План Meta OAuth](FACEBOOK_AUTHORIZATION_PLAN.md), [App Review submission](META_APP_REVIEW_SUBMISSION.md), [BM verification guide](FULL_META_BM_VERIFICATION_GUIDE.md) и [Token guide](TOKEN_GUIDE.md) содержат инструкции и исторические наблюдения. Даты, разрешения и статусы Meta Dashboard нужно проверять перед применением; эти документы не являются автоматическим подтверждением production-доступа.

## История

[DECISIONS.md](DECISIONS.md) хранит решения по датам, включая заменённые. [Архив](archive/README.md) содержит прежние спецификации, планы и аудиты. Архивные материалы не задают действующий UI или статус задач.

Новые изменения вносятся в соответствующий действующий документ. Не создавайте ещё одну сводку готовности или копию бэклога.
