# Workspace, вход и приглашения

## Текущий web-сценарий

Публичной регистрации нет. На `/login` пользователь входит по логину (username или email) и паролю; аккаунты с паролем заводит оператор командой `python -m scripts.set_user_password`. Вход по email доступен только из приглашения (`/invite/{token}`), если не включён `EMAIL_LOGIN_WITHOUT_INVITE`: письмо содержит одноразовую ссылку и код. Ссылка открывает `/auth/email/verify`; успешный обмен создаёт серверную сессию.

Пользователь без workspace проходит `/create-workspace`, затем `/<workspace>/welcome`. Приглашение в команду открывается по `/invite/<token>`. Основные маршруты и переходы описаны в [INFORMATION_ARCHITECTURE.md](INFORMATION_ARCHITECTURE.md).

## Модель доступа

- `User` хранит профиль и активный workspace.
- `WorkspaceMember` связывает пользователя с workspace и ролью `owner`, `admin`, `buyer` или `viewer`.
- `WorkspaceInvite` хранит приглашение в команду и ограничения его использования.
- `WebSession` хранит хэш browser secret, срок действия и отзыв.
- `WorkspaceSupportGrant` задаёт отдельный механизм доступа поддержки.

Наличие идентификатора ресурса в запросе не даёт доступа: backend проверяет workspace и роль. Интерфейс не является границей безопасности. Передача владения, управление участниками, приглашения и сессии описаны в [HTTP API](API.md); наличие endpoint не обещает отдельного React-экрана.

## Meta invite — отдельный сценарий

`/connect/meta/<token>` используется для подключения Meta-профиля через отдельную invite-ссылку. Это не приглашение в команду. Реализация находится в [api/meta_oauth.py](../api/meta_oauth.py) и [MetaConnectInviteView.tsx](../frontend/src/components/auth/MetaConnectInviteView.tsx).

## Почта и изображения

Транзакционная почта отправляется через Resend; настройки перечислены в [.env.example](../.env.example). OTP и magic links обрабатываются в [services/otp.py](../services/otp.py).

SMTP transport не поддерживается. Для отправки задаются `RESEND_API_KEY` и `EMAIL_FROM`. Без ключа Resend транспорт переходит в локальный режим без доставки: в лог попадают адрес получателя и тема; тело письма и OTP-код не журналируются. Этот режим не заменяет работающую почту для production-входа.

Аватары и логотипы проходят серверную валидацию в [services/image_uploads.py](../services/image_uploads.py). Runtime-файлы хранятся в `uploads/`, production использует том `buyerly-uploads`; публичные URL остаются `/uploads/...`.

## Источники реализации

| Область | Файлы |
|---|---|
| Сессии и проверка пользователя | [api/auth.py](../api/auth.py) |
| Вход и профиль | [api/routers/auth.py](../api/routers/auth.py) |
| Workspace и роли | [workspaces.py](../api/routers/workspaces.py), [members.py](../api/routers/members.py) |
| Онбординг | [onboarding.py](../api/routers/onboarding.py) |
| Маршрутизация UI | [routing.ts](../frontend/src/lib/routing.ts) |

Предыдущее описание со старой структурой frontend сохранено в [архиве](archive/snapshots/before_cleanup_WORKSPACES_AUTH_AND_INVITES.md).
