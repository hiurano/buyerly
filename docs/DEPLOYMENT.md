# Развёртывание Buyerly

## Состав production

Docker Compose запускает `buyerly-web`, `buyerly-api`, `buyerly-worker`, `buyerly-db` и `buyerly-redis`. Публичный порт `8080` принадлежит только веб-сервису; API доступен через его reverse proxy. PostgreSQL хранится в томе `buyerly-postgres`, Redis AOF для общих rate limits — в `buyerly-redis`, журналы — в `/opt/buyerly/logs`.

Минимальные значения для production в `/opt/buyerly/.env`:

```dotenv
POSTGRES_PASSWORD=...
WEBAPP_URL=https://buyerly.app
TRUSTED_PROXY_CIDRS=172.16.0.0/12
SESSION_COOKIE_SECURE=true
RESEND_API_KEY=...
EMAIL_FROM="Buyerly <team@buyerly.app>"
OTP_PEPPER=...
```

Если `POSTGRES_PASSWORD` отсутствует, deploy-скрипт один раз создаёт случайное значение локально на сервере и ограничивает права файла `.env`.
`OTP_PEPPER` обязателен: это отдельный длинный случайный секрет, без него
выдача OTP-кодов завершается ошибкой.

Telegram-бот (привязка личного аккаунта и уведомления инбокса) включается
ключом `TELEGRAM_BOT_TOKEN` от @BotFather. Он хранится только в server `.env`;
deploy записывает его туда из секрета репозитория `TELEGRAM_BOT_TOKEN`, если тот
задан, иначе `.env` не трогает. При старте API сам регистрирует webhook
`https://<WEBAPP_URL>/api/telegram/webhook` с секретом, выведенным из ключа.
Без ключа строка Telegram в Settings остаётся неактивной.

Для рабочего подключения Facebook дополнительно обязательны:

```dotenv
META_GRAPH_VERSION=v26.0
META_APP_ID=...
META_APP_SECRET=...
META_LOGIN_CONFIG_ID=...
META_OAUTH_REDIRECT_URI=https://buyerly.app/api/meta/oauth/callback
META_TOKEN_ENCRYPTION_KEY=...
```

`META_TOKEN_ENCRYPTION_KEY` — URL-safe base64 Fernet key. При ротации новый ключ
указывается первым, старые decrypt-only ключи — после него через запятую.
Если ключ ещё отсутствует при первом production deploy, preflight создаёт его
криптографически стойким генератором, сохраняет только в server `.env` с правами
`600` и не выводит значение в CI-журнал. Неверный уже заданный ключ не
перезаписывается: deploy завершается до миграции, чтобы не потерять доступ к
существующим шифротекстам.
После выпуска конфигурации все сохранённые OAuth- и ручные System User токены
нужно перевести на первичный ключ внутри API-контейнера:

```bash
docker compose exec api python -m scripts.rotate_meta_tokens
```

Старые ключи удаляются из `META_TOKEN_ENCRYPTION_KEY` только после успешного
завершения команды. Операция транзакционна и не выводит токены в журнал.

Параметры `APP_VERSION`, `DATABASE_URL`, `REDIS_URL`, `API_HOST`, `API_PORT` и
`SERVE_STATIC` для Docker Compose задаются deploy/compose и не требуют ручного
production override. `CORS_ORIGINS` нужен только для явно разрешённых
cross-origin клиентов; `ENABLE_DEV_AUTH` в production всегда должен оставаться
`false`.

Допустимые операционные overrides: `ADMIN_CHAT_ID` (legacy Telegram ID
супер-админа для bootstrap и dev-входа),
`DEFAULT_POLL_INTERVAL_MINUTES`,
`WEB_SESSION_TTL_HOURS` и `WEB_SESSION_ROTATE_MINUTES`. Пара
`BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` используется только при
первом запуске пустой установки и после создания администратора должна быть
удалена. Полный перечень с безопасными значениями находится в `.env.example`.

Вход в приложение — по коду и ссылке из письма (участники workspace, почты из
белого списка и приглашённые), как в Linear. Вход по логину и паролю временно
оставлен ссылкой «Log in with password» под кнопкой; пароль человек может задать
в Settings → Profile. Пользователя для входа
по паролю создаёт или обновляет команда внутри API-контейнера (пароль
запрашивается интерактивно и нигде не сохраняется открытым текстом):

```bash
docker compose exec api python -m scripts.set_user_password <username>
# переименовать существующий email-аккаунт, сохранив его workspaces:
docker compose exec api python -m scripts.set_user_password <username> --email <email>
```

Поддерживаемый почтовый transport — Resend REST API; SMTP-параметры runtime не
использует.

## Автодеплой

После push в `main` GitHub Actions запускает тесты и вызывает `scripts/deploy.sh` на VPS. Сценарий:

1. блокирует параллельные деплои;
2. создаёт проверенный бэкап текущей базы PostgreSQL;
3. получает точный commit из `main` и собирает версионные образы;
4. проверяет готовность PostgreSQL и Redis, затем запускает миграцию схемы;
5. запускает API и worker, затем переключает публичный web;
6. выполняет блокирующий read-only smoke для API/auth/workspace/Meta/summary/worker/DB и проверяет параметры ротации журналов; при ошибке возвращает предыдущие образы;
7. удаляет только устаревшие Buyerly image tags, dangling images и build cache, сохраняя активные контейнеры и два последних полных релиза.

Перед сборкой deploy очищает только untracked и неигнорируемые файлы исходного
дерева. Поэтому удалённый ранее Python-модуль или Alembic revision не может
случайно попасть в новый образ; `.env`, логи, резервные копии и остальные
gitignored runtime-данные остаются на месте.

Ручной запуск:

```bash
cd /opt/buyerly
bash scripts/deploy.sh
```

## Cloudflare: настоящий IP и город у сессий

`buyerly.app` уже открывается через Cloudflare (на 2026-10-07 в ответе
`server: cloudflare` и `cf-ray`, адреса домена принадлежат Cloudflare). Поэтому
сервер видит не браузер, а узел Cloudflare. Что делает код (#301):

- Адрес браузера API берёт из `CF-Connecting-IP`, а город — из `cf-ipcity`,
  `cf-region-code` и `cf-ipcountry`, **только** если к нашему nginx (через
  доверенные прокси из `TRUSTED_PROXY_CIDRS`) подключился адрес из сетей
  Cloudflare. Если кто-то обратится к серверу напрямую и сам допишет эти
  заголовки, они не учитываются: тогда адресом считается его собственный.
- Сети Cloudflare задаёт `CLOUDFLARE_IP_CIDRS`. Пусто (по умолчанию) — список с
  https://www.cloudflare.com/ips/, зашитый в код (сверен 2026-10-07); `off` —
  заголовкам Cloudflare не верить. Если Cloudflare добавит сеть, а код ещё не
  обновлён, можно временно перечислить сети здесь через запятую.
- Ограничения частоты запросов (rate limit) считаются по настоящему адресу
  браузера, а не по узлу Cloudflare.
- Место хранится у сессии (`web_sessions.location`, миграция `0034`),
  обновляется вместе с «Last seen» и показывается в Settings → Security & access
  как у Linear: «Helsinki, 18, FI · Last seen about 14 hours ago». Нет заголовков —
  нет места, строка остаётся «Last seen …».
- nginx в контейнере `web` передаёт заголовки Cloudflare в API без изменений;
  WebSocket и SSE в Buyerly нет, отдельных настроек для них не нужно.

### Cloudflare Tunnel (`buyerly-prod`)

С 2026-10-07 известно: запись DNS `buyerly.app` в Cloudflare — типа **Tunnel**
(туннель `buyerly-prod`, Proxied), `www` — Proxied CNAME на `buyerly.app`.
Значит, Cloudflare не подключается к серверу сам: на сервере работает процесс
`cloudflared`, который держит исходящее соединение с Cloudflare и отдаёт запросы
сайту локально (в репозитории его нет — он поставлен на сервер отдельно,
обычно как systemd-служба `cloudflared`). Режим SSL/TLS в панели на участок
`cloudflared` → сайт не влияет: этот участок настраивается в самом туннеле
(Networks → Tunnels → `buyerly-prod` → Published application routes, обычно
`http://localhost:8080`).

Поэтому к nginx соединение приходит не из сетей Cloudflare, а с локального адреса:
у `cloudflared` на хосте это шлюз Docker-сети (`172.x.0.1`), у `cloudflared`
в отдельном контейнере — адрес этого контейнера. Что делает код:

- `CLOUDFLARE_TUNNEL_CIDRS` — адреса, с которых подключается туннель. Соединение
  с такого адреса считается пришедшим от Cloudflare: адрес браузера берётся из
  `CF-Connecting-IP`, город — из `cf-ipcity`/`cf-region-code`/`cf-ipcountry`.
  Docker Compose по умолчанию ставит `172.16.0.0/12` (все Docker-сети), то есть
  работает без настройки и для `cloudflared` на хосте, и для `cloudflared`
  в контейнере. Пусто — туннелю не верить; `CLOUDFLARE_IP_CIDRS=off` выключает
  и туннель.
- Адрес туннеля проверяется только там, где его записал наш nginx (адрес, с
  которого к nginx подключились). Собственный адрес nginx туннелем не считается,
  хотя он из той же сети. Обращение к серверу напрямую из интернета по IPv4
  приходит к nginx со своим публичным адресом, поэтому его заголовки `CF-*`
  и `X-Forwarded-For` по-прежнему не учитываются.
- Оговорка: Docker отдаёт в контейнер со шлюза Docker-сети всё, что пришло на
  опубликованный порт через `docker-proxy` — локальные подключения с самого
  сервера и прямые обращения по **IPv6**, если у сервера есть публичный IPv6.
  Такой запрос мог бы выдать себя за туннель (как и раньше мог подставить
  `X-Forwarded-For` через `TRUSTED_PROXY_CIDRS`). Это закрывается одной строкой —
  см. шаги ниже.

При каждом деплое в журнале шага «Execute Remote SSH Commands for Deployment»
печатаются строки `BUYERLY_EDGE`: активна ли служба `cloudflared`, есть ли
контейнер `cloudflared`, и какие из портов 80/443/8080 открыты для всех (`any`),
только локально (`loopback`) или на конкретном адресе (`specific`). IP-адреса туда
не попадают.

#### Что сделать владельцу на сервере

Для города и IP ничего делать не нужно: значение по умолчанию уже подходит.
Рекомендуется закрыть прямой вход в обход туннеля (5 минут, по SSH):

1. Убедиться, что `cloudflared` работает на самом сервере и ходит на
   `localhost:8080`:

   ```bash
   systemctl status cloudflared --no-pager   # active (running) — служба на хосте
   docker ps --format '{{.Names}} {{.Image}} {{.Networks}}' | grep -i cloudflared
   ```

   Если служба активна (или контейнер с сетью `host`), а в панели туннеля у
   `buyerly.app` указан `http://localhost:8080` — переходить к шагу 2. Если
   `cloudflared` в контейнере с другой сетью или на другой машине — шаг 2 **не**
   делать (сайт перестанет открываться) и написать об этом в issue #301.
2. Оставить порт сайта только для локальных подключений:

   ```bash
   cd /opt/buyerly
   grep -q '^WEB_PORT_BINDING=' .env \
     && sed -i 's|^WEB_PORT_BINDING=.*|WEB_PORT_BINDING=127.0.0.1:8080|' .env \
     || echo 'WEB_PORT_BINDING=127.0.0.1:8080' >> .env
   docker compose up -d web
   curl -fsS http://127.0.0.1:8080/health/ready && echo OK
   ```

   Затем открыть https://buyerly.app — сайт должен открываться. Если нет —
   вернуть `WEB_PORT_BINDING=8080` в `.env` и снова `docker compose up -d web`.
3. Если на сервере открыты порты 80/443 для всех (строка `BUYERLY_EDGE listeners`
   с `any:80` или `any:443`) и их больше никто не использует — закрыть их в
   файрволе VPS: при туннеле они не нужны.

### Что сделать владельцу в Cloudflare (по шагам)

Всё делается в панели https://dash.cloudflare.com → аккаунт → сайт
`buyerly.app`. Код к этому времени уже выложен; порядок шагов важен.

1. **Включить город посетителя.** Rules → Settings (в старой панели: Rules →
   Transform Rules → вкладка Managed Transforms) → блок «HTTP request headers» →
   включить **Add visitor location headers**. Больше ничего в этом блоке не
   трогать. Это бесплатно и сразу добавляет к запросам `cf-ipcity`,
   `cf-region-code`, `cf-ipcountry`.
2. **Проверить, что сайт идёт через Cloudflare.** DNS → Records: у записей
   `buyerly.app` (сейчас типа Tunnel) и `www`, если есть, облако **оранжевое** (Proxied).
   Почтовые записи (MX и TXT с SPF/DKIM/DMARC для Resend, например `send` и
   `resend._domainkey`) должны оставаться **серыми** (DNS only) — иначе письма
   перестанут доходить. Ничего не менять, если уже так.
3. **Режим TLS.** SSL/TLS → Overview. Нужен **Full (strict)**: тогда трафик от
   Cloudflare до сервера тоже зашифрован и сертификат сервера проверяется.
   При Cloudflare Tunnel (как сейчас) этот режим к сайту не применяется:
   трафик до сервера идёт внутри зашифрованного туннеля, и режим можно не
   трогать (Automatic/Full ничего не ломает).
   - Если сейчас **Flexible** — не переключать сразу: от Cloudflare до сервера
     идёт обычный HTTP, и сайт сломается. Сначала на сервере нужен HTTPS на
     порту 443 с сертификатом для `buyerly.app`: проще всего SSL/TLS → Origin
     Server → Create Certificate (15 лет), поставить его в прокси на сервере,
     который принимает трафик снаружи. Это задача для отдельной сессии с
     доступом к серверу — напишите, что режим был Flexible.
   - Если уже **Full** — переключить на **Full (strict)**, затем открыть
     https://buyerly.app. Если показывается ошибка 526, вернуть Full и написать
     об этом: значит, на сервере самоподписанный сертификат.
   - Если уже **Full (strict)** — ничего не делать.
4. **Всегда HTTPS.** SSL/TLS → Edge Certificates → включить **Always Use
   HTTPS** (сейчас `http://buyerly.app` отвечает страницей, а не переходом на
   https).
5. **Не мешать Telegram и Meta.** Security → Bots: **Bot Fight Mode** выключен
   (он блокирует webhook Telegram `/api/telegram/webhook`). Режим «I'm Under
   Attack» не включать. Если когда-нибудь появятся правила WAF или Challenge —
   исключить из них `/api/telegram/webhook` и `/api/meta/oauth/callback`.
6. **Проверка (2 минуты).** Выйти и снова войти в Buyerly, открыть Settings →
   Security & access. В строке этого браузера должно быть «Current session ·
   Город, регион, страна», в деталях сессии (клик по строке) — ваш IP. Свой IP
   показывает https://buyerly.app/cdn-cgi/trace (строка `ip=`) — он должен
   совпасть. Затем отправить себе код входа на почту (письма идут) и нажать
   Connect Telegram в Settings (бот отвечает). Написать результат в issue #301.

Закрыть вход в обход Cloudflare при туннеле проще, чем файрволом: см. «Что
сделать владельцу на сервере» в разделе «Cloudflare Tunnel» выше
(`WEB_PORT_BINDING=127.0.0.1:8080`; правила ufw Docker обходит).

## Проверка и журналы

```bash
docker compose ps
curl -fsS http://127.0.0.1:8080/health/ready
docker compose logs --tail=100 api
docker compose logs --tail=100 worker
docker compose logs --tail=100 redis
```

Файлы журналов разделены по процессам: `api.log`, `worker.log`, `database-migration.log`.

Docker stdout/stderr каждого сервиса использует `json-file` с пятью сжатыми
файлами не более 20 MB каждый (до 100 MB на контейнер). Проверка фактически
применённых параметров выполняется после каждого deploy:

```bash
bash scripts/verify_docker_log_rotation.sh
```

## Диск и безопасная очистка Docker

Deploy предупреждает при заполнении диска на 75% и останавливается при 90%.
Перед сборкой и после успешного переключения запускается безопасная очистка:

```bash
DRY_RUN=true bash scripts/cleanup_docker_artifacts.sh
bash scripts/cleanup_docker_artifacts.sh
CHECK_PATH=/opt/buyerly bash scripts/check_disk_usage.sh
```

Очистка сохраняет минимум два последних полных релиза `buyerly-app` и
`buyerly-web`, а также любой image, используемый существующим контейнером.
Удаляются только более старые version tags, dangling images старше семи дней и
build cache старше семи дней. Скрипт никогда не вызывает `docker system prune`,
`docker image prune -a` или `docker volume prune`, поэтому production volumes и
единственный rollback image не могут быть удалены.

При предупреждении сначала выполните dry-run, проверьте список кандидатов,
запустите обычную очистку и повторите проверку диска. Если после этого занято
90% или больше, остановите deploy и найдите источник роста через `docker system
df` и `du` без удаления volumes вручную.

## Post-deploy smoke и rollback gate

После переключения трафика `scripts/post_deploy_smoke.py` проверяет точный SHA
live/readiness, отказ защищённых endpoints без сессии, workspace-isolation,
Meta-конфигурацию без раскрытия значений, summary scope, worker heartbeat и
Alembic/schema contract. Все операции — GET/SELECT; Meta Marketing API и бюджеты
не изменяются.

Результат каждой попытки сохраняется атомарно с правами `600`:

```text
/opt/buyerly/logs/smoke/post-deploy-<full-sha>.json
```

Любая критическая ошибка завершает smoke ненулевым кодом и запускает rollback
предыдущих app/web images. Процедуры реакции собраны в
[`INCIDENT_RUNBOOKS.md`](INCIDENT_RUNBOOKS.md).

## Резервные копии и Disaster Recovery

`scripts/backup_db.sh` автоматически выполняет потоковый горячий дамп PostgreSQL:

- `buyerly_postgres_YYYYMMDD_HHMMSS.sql.gz.enc` с потоковым шифрованием `AES-256-CBC` (при наличии `BACKUP_ENCRYPTION_KEY`) или `buyerly_postgres_YYYYMMDD_HHMMSS.sql.gz`.
- Потоковая передача данных через Unix pipeline исключает накопление промежуточных несжатых файлов на диске.
- Архив сначала пишется в скрытый `.incomplete_buyerly_postgres_…` в том же каталоге, затем читается обратно (расшифровка и распаковка, как при восстановлении) и проверяется метка конца `pg_dump`. Только после этого файл переименовывается в `buyerly_postgres_…`. Если дамп оборвался или не читается, бэкап завершается с кодом 1, файла с настоящим именем нет, время последнего бэкапа не обновляется и в облако ничего не уходит. Недописанный файл после убитого процесса удаляется при следующем запуске; `--latest-local` его никогда не выбирает.
- По умолчанию локально сохраняются последние 30 архивов в `/opt/buyerly/backups`.
- При настроенных переменных `S3_ENDPOINT_URL`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` и `OFFSITE_RETENTION_DAYS` зашифрованный архив автоматически выгружается в удаленное хранилище (Cloudflare R2 / AWS S3 / Backblaze B2) через `scripts/offsite_sync.py` с автоматической ротацией копий старше `OFFSITE_RETENTION_DAYS` дней и защитным порогом (не менее 7 копий).

Откуда берутся настройки. `backup_db.sh` и `restore_db.sh` запускаются на хосте (cron, шаг 1 `deploy.sh`, runbook), куда Compose `.env` не передаёт. Поэтому оба скрипта сами читают из `/opt/buyerly/.env` (другой файл — `BUYERLY_ENV_FILE`) только `BACKUP_ENCRYPTION_KEY`, `S3_ENDPOINT_URL`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` и `OFFSITE_RETENTION_DAYS`. Файл разбирается как текст, а не выполняется; кавычки и `# комментарий` после значения понимаются как в приложении. Непустое значение, уже экспортированное в окружение, главнее `.env`.

Offsite считается включённым, как только заполнены `S3_ACCESS_KEY_ID` или `S3_SECRET_ACCESS_KEY`. Тогда пустые `S3_ENDPOINT_URL`, `S3_BUCKET`, второй ключ или `BACKUP_ENCRYPTION_KEY` — ошибка: бэкап не создаётся, код выхода 1. Незашифрованные дампы с сервера не выгружаются. Без ключей S3 и без `BACKUP_ENCRYPTION_KEY` делается локальный `.sql.gz`, и лог прямо пишет `encryption off`. Сбой самой выгрузки не отменяет локальный бэкап, итоговая строка заканчивается `(off-site: FAILED)`.

Проверить настройки, ничего не создавая и не печатая значений:
```bash
sudo bash scripts/backup_db.sh --check-config
# [INFO] Backup settings from /opt/buyerly/.env: encryption on; off-site on, retention 60 days.
```

### Настройка расписания бэкапов на сервере

```bash
sudo bash scripts/setup_backup_cron.sh
```

Скрипт сначала выполняет `--check-config` в пустом окружении, как у cron, и при ошибке не ставит задачу. Затем записывает `/etc/cron.d/buyerly-backup` с явным `BUYERLY_ENV_FILE=/opt/buyerly/.env`. Бэкап запускается в 03:00 по часовому поясу сервера (cron не знает про UTC; пояс показывает `timedatectl`, на текущем VPS это EEST). Лог — `/var/log/buyerly-backup.log` с правами `0600`; без root задача ставится в crontab пользователя, лог — `~/.local/state/buyerly/backup.log`. После первой ночи проверить результат: `tail /var/log/buyerly-backup.log` — строка `[SUCCESS] Database backup created and verified: ….sql.gz.enc (off-site: uploaded)`.

### Восстановление базы данных

Для восстановления PostgreSQL используйте унифицированный скрипт `scripts/restore_db.sh`:
```bash
# Восстановление из конкретного зашифрованного или сжатого файла
bash scripts/restore_db.sh --file /opt/buyerly/backups/buyerly_postgres_YYYYMMDD_HHMMSS.sql.gz.enc

# Восстановление из последнего локального бэкапа
bash scripts/restore_db.sh --latest-local

# Скачивание и восстановление последней оффсайт-копии из S3/Cloudflare R2
bash scripts/restore_db.sh --download-latest-offsite
```

Оффсайт-копия скачивается под своим именем, поэтому `.sql.gz` и `.sql.gz.enc` восстанавливаются каждый своим способом. Скачанный файл лежит во временном каталоге внутри `/opt/buyerly/backups` и удаляется после восстановления; в хранилище копия остаётся. Перед расшифровкой скрипт сверяет содержимое с расширением: незашифрованный архив с именем `.enc` или пустой файл останавливаются с понятной ошибкой, не трогая базу.

Что гарантировано при неуспешном восстановлении. До изменения целевой БД архив полностью расшифровывается и распаковывается во временный файл рядом с архивом (другое место — `RESTORE_WORK_DIR`; нужно свободное место размером с распакованный дамп), затем проверяется, что в конце дампа есть метка `-- PostgreSQL database dump complete`. Поэтому повреждённый gzip, обрезанный или повреждённый `.enc`, неверный или отсутствующий `BACKUP_ENCRYPTION_KEY` и обрезанный дамп останавливают скрипт с кодом 1, не открыв соединения с базой. Сам дамп применяется одной транзакцией (`psql --single-transaction` с `ON_ERROR_STOP=1`): любая ошибка SQL, обрыв соединения или остановка `psql` посреди восстановления откатывают всё, и целевая БД остаётся прежней. Не защищено: дамп, который применился без ошибок, но содержит не те данные (например, старый бэкап), — выбор файла остаётся на операторе. Пока идёт восстановление, таблицы заблокированы транзакцией, поэтому приложение лучше остановить заранее.

### Учения по восстановлению (Restore Drills)

Для проверки целостности бэкапа без риска задеть боевую базу используется изолированный скрипт:
```bash
bash scripts/drill_restore.sh
```
Drill создаёт рядом с боевой временную БД `buyerly_restore_drill`, разворачивает в неё самую новую локальную копию (или файл из аргумента) и печатает отдельный итог по каждому этапу (#204):

1. **archive** — `restore_db.sh` расшифровал и распаковал архив, нашёл метку конца `pg_dump` и применил дамп одной транзакцией. Это доказывает только, что файл цел.
2. **schema version** — правило восстановления: revision в `alembic_version` должна быть ровно одна и входить в историю миграций работающего релиза. Head принимается как есть; более старая известная revision (копия сделана до последней выкатки) поднимается `alembic upgrade head` во временной БД, как это сделал бы `migrate` после настоящего восстановления. Пустая таблица, несколько строк, выдуманная revision или revision более нового релиза — провал.
3. **schema contract** — все таблицы и колонки моделей, семейство типа каждой колонки (текст, число, дата-время, JSON…) и все внешние ключи моделей.
4. **data** — все внешние ключи в БД проверены (каждая строка ссылается на существующего родителя), есть хотя бы один пользователь и один workspace.
5. **application read** — строки каждой модели читаются через ORM приложения, все Meta-токены расшифровываются ключом релиза.

Этапы 2–5 выполняет код работающего релиза: `docker exec buyerly-api python -m database.restore_check --database buyerly_restore_drill` (модуль отказывается проверять базу, которую обслуживает приложение). Первый проваленный этап останавливает проверку; `[SUCCESS]` в конце значит «на этой копии может работать текущий релиз», а не просто «архив распаковался». Печатаются только количества и revision. Временная БД удаляется при любом исходе. Скрипт запускается на сервере вручную: по расписанию drill не выполняется ни на VPS, ни в CI. В CI те же проверки идут в `tests/test_restore_check.py`: настоящие `backup_db.sh` и `drill_restore.sh` на локальном PostgreSQL, реальная схема с контрольными записями проходит, фиктивная схема из #204 — нет.

Полная репетиция восстановления из облака (#213):
```bash
sudo bash scripts/offsite_restore_drill.sh            # восстановление и сверка
sudo bash scripts/offsite_restore_drill.sh --negative # плюс четыре случая отказа
```
Скрипт идёт тем же путём, что при потере сервера: скачивает самую новую копию из S3 в пустой каталог штатным `restore_db.sh --download-latest-offsite` и восстанавливает её во временный контейнер PostgreSQL того же образа, что `buyerly-db`, без сети (`--network none`, 256 МБ памяти). Боевая база только читается для сравнения; worker и рекламные действия к временной базе не подключены. Проверяется: объект зашифрован (`.sql.gz.enc`); Alembic revision и набор таблиц совпадают с боевыми; восстановлены все внешние ключи; количества строк в основных таблицах (для сравнения с текущими); все Meta-токены расшифровываются ключом работающего приложения (`META_TOKEN_ENCRYPTION_KEY` хранится в `.env`, а не в копии). Печатаются давность копии, время восстановления и версия кода, секреты и содержимое строк не выводятся. С `--negative` дополнительно: неверный ключ шифрования, отвергнутые ключи S3, несуществующий бакет и обрезанный архив должны завершиться ошибкой, не изменив восстановленную базу. Контейнер и временный каталог удаляются при любом исходе.

`migrate` изменяет production-схему только через `alembic upgrade head`. Одновременный запуск блокируется PostgreSQL advisory lock; после миграции контейнер сверяет текущий revision с Alembic head и проверяет наличие всех таблиц и колонок из моделей. Для исторической базы без `alembic_version` разрешён только одноразовый переход на явно зафиксированный baseline `0009_web_sessions`, причём перед stamp выполняется fail-closed проверка схемы. `create_all()` и ручные `ALTER TABLE` в production-runner не используются.

Пользовательские аватары и логотипы хранятся в именованном Docker volume
`buyerly-uploads`: API записывает файлы в `/app/uploads`, а web-контейнер
монтирует тот же volume read-only в `/usr/share/nginx/html/uploads`. При первом
переходе deploy сохраняет доступные файлы из старого API-контейнера до смены
трафика; последующие релизы повторно используют volume.

Этот volume **не входит** в резервные копии: `backup_db.sh` сохраняет только
PostgreSQL. После восстановления на новом сервере аватары и логотипы
workspace пропадут (записи в базе останутся, картинки — нет), их загружают
заново. Включение uploads в копии — отдельная задача C08.

Production checkout `/opt/buyerly` приводится к владельцу системного deploy-пользователя через root/passwordless sudo, а `origin` обязан указывать на канонический `hiurano/buyerly` по SSH или HTTPS. Если ownership нельзя безопасно нормализовать либо remote отличается, выкладка останавливается до сборки. В production-образ входят только runtime-каталоги; тесты, документация, локальные диагностические скрипты, транскрипты и исследовательские снимки интерфейсов не копируются.

## Безопасность хоста и доступ по SSH

1. **Запрет парольной аутентификации**:
   - Вход на VPS разрешен **исключительно по асимметричным SSH-ключам** (`Ed25519`).
   - Парольный вход и интерактивные методы отключены в конфигурации OpenSSH (`/etc/ssh/sshd_config.d/99-hardening.conf`):
     ```sshd_config
     PasswordAuthentication no
     KbdInteractiveAuthentication no
     PermitRootLogin prohibit-password
     PubkeyAuthentication yes
     ```
2. **Управление ключами**:
   - Список доверенных публичных ключей хранится в `~/.ssh/authorized_keys` на VPS.
   - Для деплоя через GitHub Actions используется секрет репозитория `VPS_SSH_KEY`.
3. **Сетевая изоляция**:
   - Порт PostgreSQL (`5432`) закрыт внутри Docker-сети и не публикуется наружу хоста.
   - Порт Redis (`6379`) также доступен только внутри Docker-сети.
   - Наружу выставлен только порт обратного прокси веб-сервиса (`8080`); при
     `WEB_PORT_BINDING=127.0.0.1:8080` в `.env` он доступен только с самого
     сервера (вход — через Cloudflare Tunnel).
