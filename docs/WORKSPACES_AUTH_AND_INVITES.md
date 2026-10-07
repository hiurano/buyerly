# Workspace, вход и приглашения

## Текущий web-сценарий

Публичной регистрации нет. `/login` устроен как в Linear: «Log in to Buyerly» и кнопка «Continue with email». Письмо с одноразовой ссылкой и кодом получают участники workspace, почты из белого списка и приглашённые; незнакомая почта письма не получает. Ссылка открывает `/auth/email/verify`; успешный обмен создаёт серверную сессию. Временно, пока им пользуется один аккаунт, под кнопкой есть строка «Have a password? Log in with password»: вход по логину (username или email) и паролю. Пароль человек задаёт или меняет в Settings → Profile → Password, оператор — командой `python -m scripts.set_user_password`. Когда пароль станет не нужен, строку убираем и вход остаётся только по почте.

Страница приглашения `/invite/<token>` повторяет Linear: карточка 460px по центру, тема системы или пользователя, главная кнопка цвета желтка (`#F5B800`, как у `LinearToggle`). Персональное приглашение называет почту: «To accept the invitation please login as <email>.» и кнопку «Log in». Если в браузере вошёл другой человек, в углу видно «Logged in as <его почта>» (клик открывает меню Accounts с «Log out»), а «Log in» сначала завершает его сессию. Когда вошла приглашённая почта, приглашение принимается само, без отдельной кнопки «Join». Публичную ссылку без почты вошедший человек принимает кнопкой «Join workspace».

Меню workspace: «Invite and manage members» открывает Settings → Members (`/<workspace>/settings/members`) — участники и ждущие приглашения, кнопка Invite (несколько почт через запятую), в меню строки приглашения «Resend invite» и «Revoke invite». «Log out» (или Alt+Shift+Q) завершает сессию этого браузера и открывает `/login`.

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
