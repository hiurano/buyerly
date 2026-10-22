# Workspace, вход и приглашения

## Текущий web-сценарий

Регистрация открыта для всех (#436). `/login` устроен как в Linear: «Log in to Buyerly», кнопка «Continue with email» и внизу «Don’t have an account? Sign up». `/signup` — как `linear.app/signup`: «Create your workspace», «Continue with email», «By signing up, you agree to our Terms of Service and Privacy Policy.» и «Already have an account? Log in»; после почты экран «Verifying it’s you» с проверкой Cloudflare Turnstile, затем «Check your email». На `/login` тот же экран проверки появляется, только если почта новая. Письмо с одноразовой ссылкой и кодом получает любая почта; новая почта без приглашения сначала проходит проверку Cloudflare Turnstile (как на `linear.app/signup`), без неё сервер письмо не отправляет. Существующие аккаунты и приглашённые входят без проверки. Ссылка открывает `/auth/email/verify`; успешный обмен создаёт серверную сессию. Паролей нет, как в Linear: вход только по почте.

Вход по коду или ссылке открывает существующий аккаунт, только если его почта подтверждена. Почта аккаунта появляется лишь из письма: при регистрации по коду или при смене почты с подтверждением; на шаге имени в onboarding её не задают.

Страница приглашения `/invite/<token>` повторяет Linear: карточка 460px по центру, тема системы или пользователя, главная кнопка цвета желтка (`#F5B800`, как у `LinearToggle`). Персональное приглашение называет почту: «To accept the invitation please login as <email>.» и кнопку «Log in». Если в браузере вошёл другой человек, в углу видно «Logged in as <его почта>» (клик открывает меню Accounts с «Add an account» и «Log out»), а «Log in» сначала завершает его сессию — только этого аккаунта, остальные вошедшие в браузере остаются. «Add an account» ведёт на `/auth/add-account?invite=<token>`: вход с этим приглашением, открытый аккаунт не выходит, после входа — обратно на страницу приглашения, где оно принимается. Когда вошла приглашённая почта, приглашение принимается само, без отдельной кнопки «Join». Публичную ссылку без почты вошедший человек принимает кнопкой «Join workspace».

Меню workspace: «Invite and manage members» открывает Settings → Members (`/<workspace>/settings/members`) — участники и ждущие приглашения, кнопка Invite (несколько почт через запятую), в меню строки приглашения «Resend invite» и «Revoke invite». «Log out» (или Alt+Shift+Q) завершает сессию открытого аккаунта: если в браузере вошёл ещё один аккаунт, открывается его workspace, иначе `/login`.

Несколько аккаунтов в одном браузере, как в Linear: Switch workspace → Account → «Add an account…» открывает `/auth/add-account` — тот же вход по почте (ссылка и код), с «Back to Buyerly» и «Logged in as <почта>»; первый аккаунт не выходит. В подменю Switch workspace и палитре O then W у каждого аккаунта свой блок под его почтой, номера идут сквозь все блоки, галочка у открытого. Выбор workspace другого аккаунта открывает его сразу. Сервер держит отдельную сессию и отдельный CSRF-токен на аккаунт (до 5 в браузере), каждый запрос называет свой аккаунт заголовком `X-Buyerly-Account`; подробности — в [HTTP API](API.md). Аккаунт вкладки хранится в самой вкладке, поэтому две вкладки могут работать в разных аккаунтах. Адрес `/<workspace>/…` выбирает аккаунт: если workspace принадлежит другому вошедшему аккаунту, вкладка переходит в него; если workspace общий для нескольких аккаунтов, остаётся аккаунт вкладки.

Пользователь без workspace проходит `/create-workspace`, затем `/<workspace>/welcome`. Приглашение в команду открывается по `/invite/<token>`. Основные маршруты и переходы описаны в [INFORMATION_ARCHITECTURE.md](INFORMATION_ARCHITECTURE.md).

## Модель доступа

- `User` хранит профиль и активный workspace.
- `WorkspaceMember` связывает пользователя с workspace и ролью `owner`, `admin`, `member` или `guest` (роли Linear; гость пока только читает).
- `WorkspaceInvite` хранит приглашение в команду и ограничения его использования.
- `WebSession` хранит хэш browser secret, срок действия и отзыв.
- `WorkspaceSupportGrant` задаёт отдельный механизм доступа поддержки.

Наличие идентификатора ресурса в запросе не даёт доступа: backend проверяет workspace и роль. Интерфейс не является границей безопасности. Передача владения, управление участниками, приглашения и сессии описаны в [HTTP API](API.md); наличие endpoint не обещает отдельного React-экрана.

## Meta invite — отдельный сценарий

`/connect/meta/<token>` используется для подключения Meta-профиля через отдельную invite-ссылку. Это не приглашение в команду. Реализация находится в [api/meta_oauth.py](../api/meta_oauth.py) и [MetaConnectInviteView.tsx](../frontend/src/components/auth/MetaConnectInviteView.tsx).

## Почта и изображения

Транзакционная почта отправляется через Resend; настройки перечислены в [.env.example](../.env.example). OTP и magic links обрабатываются в [services/otp.py](../services/otp.py).

SMTP transport не поддерживается. Для отправки задаются `RESEND_API_KEY` и `EMAIL_FROM`. Без ключа Resend транспорт переходит в локальный режим без доставки: в лог попадают адрес получателя и тема; тело письма и OTP-код не журналируются. Исключение — только локальный стек (`compose.dev.yaml`, `DEV_EMAIL_LOG=true`): там письмо целиком, со ссылкой и кодом, пишется в лог API, чтобы войти без почты. Этот режим не заменяет работающую почту для production-входа.

Аватары и логотипы проходят серверную валидацию в [services/image_uploads.py](../services/image_uploads.py). Runtime-файлы хранятся в `uploads/`, production использует том `buyerly-uploads`; публичные URL остаются `/uploads/...`.

## Источники реализации

| Область | Файлы |
|---|---|
| Сессии и проверка пользователя | [api/auth.py](../api/auth.py) |
| Вход и профиль | [api/routers/auth.py](../api/routers/auth.py) |
| Workspace и роли | [workspaces.py](../api/routers/workspaces.py), [members.py](../api/routers/members.py) |
| Онбординг | [onboarding.py](../api/routers/onboarding.py) |
| Маршрутизация UI | [routing.ts](../frontend/src/lib/routing.ts) |
