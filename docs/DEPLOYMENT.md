# Развёртывание Buyerly

## Состав production

Весь Buyerly на сервере — один проект Docker Compose в `/opt/buyerly`. На самом
хосте нужны только Docker, git и SSH; nginx, Redis, certbot и прочее не ставятся.

| Контейнер | Что делает |
|---|---|
| `buyerly-api` | FastAPI: HTTP API, собранное React-приложение, публичные страницы и загруженные картинки |
| `buyerly-worker` | синхронизация с Meta и выполнение правил (APScheduler) |
| `buyerly-db` | PostgreSQL 16, данные в томе `buyerly-postgres` |
| `buyerly-tunnel` | Cloudflare Tunnel (`cloudflared`): единственный вход из интернета |

Одноразовый `migrate` (`docker compose run --rm migrate`) применяет миграции
перед запуском релиза и не остаётся запущенным. Образ один — `buyerly-app`: в
нём и Python-код, и сборка фронтенда.

Наружу сервер не открывает ни одного веб-порта: `cloudflared` сам подключается к
Cloudflare и передаёт запросы в `http://api:8080` по Docker-сети `buyerly`.
Порт `127.0.0.1:8080` доступен только с самого сервера — для проверок деплоя и
`curl`. Ограничения частоты запросов хранятся в памяти единственного процесса
API; после перезапуска они начинаются заново.

```
/opt/buyerly/
  docker-compose.yml   из git
  .env                 секреты и настройки сервера, права 600
  backups/             бэкапы базы
  logs/                журналы api, worker и миграций
```

## Настройки сервера (`/opt/buyerly/.env`)

Минимум для production:

```dotenv
COMPOSE_PROFILES=tunnel
CLOUDFLARE_TUNNEL_TOKEN=...
WEBAPP_URL=https://buyerly.app
SESSION_COOKIE_SECURE=true
EMAIL_FROM="Buyerly <team@buyerly.app>"
META_APP_ID=...
META_APP_SECRET=...
META_LOGIN_CONFIG_ID=...
META_OAUTH_REDIRECT_URI=https://buyerly.app/api/meta/oauth/callback
META_GRAPH_VERSION=v26.0
```

`COMPOSE_PROFILES` и `CLOUDFLARE_TUNNEL_TOKEN` читает сам Docker Compose: первый
включает контейнер туннеля, второй — его токен (Cloudflare Zero Trust → Networks
→ Tunnels → `buyerly-prod`). Локально их нет, и туннель не запускается.

Деплой сам, один раз, создаёт и сохраняет в `.env` (значения в журнал не
попадают):

- `POSTGRES_PASSWORD` — пароль базы;
- `OTP_PEPPER` — секрет для хранения кодов входа (без него коды не выдаются);
- `META_TOKEN_ENCRYPTION_KEY` — URL-safe base64 Fernet key для токенов Meta.

Неверный уже заданный `META_TOKEN_ENCRYPTION_KEY` не перезаписывается: деплой
останавливается до миграции, чтобы не потерять доступ к зашифрованным токенам.
При ротации новый ключ указывается первым, старые — после него через запятую;
затем токены переводятся на новый ключ:

```bash
docker compose exec api python -m scripts.rotate_meta_tokens
```

`RESEND_API_KEY` и `TELEGRAM_BOT_TOKEN` хранятся в секретах репозитория GitHub;
деплой записывает их в `.env`, пустой секрет `.env` не трогает. С ключом
Telegram API при старте сам регистрирует webhook
`https://<WEBAPP_URL>/api/telegram/webhook`; без ключа строка Telegram в
Settings неактивна. Почта отправляется только через Resend REST API.

Compose задаёт сам и в `.env` не нужны: `APP_VERSION`, `DATABASE_URL`,
`TRUSTED_PROXY_CIDRS` (пусто: прокси между туннелем и API нет),
`CLOUDFLARE_TUNNEL_CIDRS` (фиксированный адрес `buyerly-tunnel`, `172.30.0.10/32`).
Значения по умолчанию подходят для `API_HOST`, `API_PORT`, `SERVE_STATIC`,
`CLOUDFLARE_IP_CIDRS`; `CORS_ORIGINS` нужен только для явно разрешённых
cross-origin клиентов; `ENABLE_DEV_AUTH` в production всегда `false`.

Допустимые операционные overrides: `ADMIN_CHAT_ID` (legacy Telegram ID
супер-админа для bootstrap и dev-входа), `DEFAULT_POLL_INTERVAL_MINUTES`,
`WEB_SESSION_TTL_HOURS` и `WEB_SESSION_ROTATE_MINUTES`. Пара
`BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` используется только при
первом запуске пустой установки и после создания администратора удаляется.
Полный перечень — в `.env.example`.

Вход в приложение — по коду и ссылке из письма (участники workspace, почты из
белого списка и приглашённые). Вход по паролю временно оставлен ссылкой «Log in
with password»; пароль задаётся в Settings → Profile или командой (пароль
запрашивается интерактивно):

```bash
docker compose exec api python -m scripts.set_user_password <username>
# переименовать существующий email-аккаунт, сохранив его workspaces:
docker compose exec api python -m scripts.set_user_password <username> --email <email>
```

## Установка на новый сервер

```bash
apt-get install -y docker.io docker-compose-v2 git
git clone https://github.com/hiurano/buyerly.git /opt/buyerly
cd /opt/buyerly
cp .env.example .env && chmod 600 .env   # заполнить по разделу выше
bash scripts/deploy.sh
```

Первый деплой создаёт пустую базу. Файрвол: открыт только SSH (`ufw allow
22/tcp`); веб-порты не нужны.

## Автодеплой

После push в `main` GitHub Actions прогоняет тесты и по SSH вызывает
`scripts/deploy.sh` (секреты `VPS_HOST`, `VPS_PORT`, `VPS_USERNAME`,
`VPS_SSH_KEY`). Сценарий:

1. блокирует параллельные деплои и проверяет, что `origin` — `hiurano/buyerly`;
2. если нужный коммит уже запущен и здоров — завершает работу;
3. делает бэкап базы;
4. получает точный commit из `main` (неотслеживаемые файлы удаляются, `.env`,
   логи и бэкапы остаются) и собирает `buyerly-app:<sha>`;
5. применяет миграции (`migrate`);
6. запускает `api` и `worker`, ждёт healthcheck и полный цикл планировщика,
   запускает туннель;
7. выполняет read-only smoke и проверяет https://buyerly.app/health/live через
   Cloudflare (`cf-ray`); при ошибке возвращает предыдущий образ;
8. удаляет старые образы, сохраняя два последних релиза.

Ручной запуск:

```bash
cd /opt/buyerly
bash scripts/deploy.sh
```

## Cloudflare

DNS-запись `buyerly.app` — CNAME на туннель `buyerly-prod` (Proxied). Маршрут
туннеля настраивается в Cloudflare: Zero Trust → Networks → Tunnels →
`buyerly-prod` → Published application routes → `buyerly.app` →
`http://api:8080`. Режим SSL/TLS на участок туннель → сервер не влияет: трафик
идёт внутри зашифрованного туннеля.

Настоящий адрес и город посетителя API берёт из `CF-Connecting-IP`, `cf-ipcity`,
`cf-region-code` и `cf-ipcountry` только для запросов с адреса туннеля
(`CLOUDFLARE_TUNNEL_CIDRS`) или из сетей Cloudflare (`CLOUDFLARE_IP_CIDRS`:
пусто — опубликованный список https://www.cloudflare.com/ips/, `off` — не
верить заголовкам Cloudflare). Город хранится у сессии и показывается в
Settings → Security & access. Для городов в Cloudflare включено Rules →
Settings → **Add visitor location headers**.

Не включать Bot Fight Mode и «I'm Under Attack»: они блокируют webhook Telegram
`/api/telegram/webhook` и `/api/meta/oauth/callback`. Почтовые записи (MX, SPF,
DKIM, DMARC для Resend) остаются DNS only.

## Проверка и журналы

```bash
docker compose ps
curl -fsS http://127.0.0.1:8080/health/ready
docker compose logs --tail=100 api
docker compose logs --tail=100 worker
docker compose logs --tail=100 tunnel
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

Очистка сохраняет минимум два последних релиза `buyerly-app`, а также любой image, используемый существующим контейнером.
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

`drill_restore.sh` после всех этапов печатает и количества строк основных таблиц: восстановленная копия / боевая база сейчас (только для сравнения, на результат не влияет).

#### Запуск учений из GitHub Actions (#199)

Workflow **Ops drill (manual)** (`.github/workflows/ops-drill.yml`) запускается только вручную: Actions → Ops drill (manual) → Run workflow, или
```bash
gh workflow run ops-drill.yml -f drill=restore-local -f confirm=restore-local
```
Поле `confirm` должно повторять имя учения. Workflow заходит на сервер по тем же SSH-секретам, что deploy, и выполняет скрипт из `/opt/buyerly` (последний выкаченный `main`); вывод попадает в summary запуска.

| `drill` | Скрипт | Что затрагивает |
|---|---|---|
| `restore-local` | `drill_restore.sh` | временная БД `buyerly_restore_drill` в `buyerly-db`, удаляется; боевая БД только читается |
| `restore-offsite` | `offsite_restore_drill.sh` | временный контейнер без сети; нужны `S3_*` и `BACKUP_ENCRYPTION_KEY` в `.env` |
| `restore-offsite-negative` | `offsite_restore_drill.sh --negative` | то же плюс четыре случая отказа |
| `uploads` | `drill_uploads.sh` | `buyerly-uploads` монтируется read-only, архив восстанавливается во временный volume `buyerly-uploads-drill` и сверяется по SHA-256 |
| `worker-stall` | `drill_worker_stall.sh` | **ставит боевой worker на паузу** (`docker pause`) на 8–10 минут: правила не проверяются, Inbox-доставка идёт из API; проверяет 503 на `/health/worker`, `WORKER_STALLED` и `WORKER_RECOVERED`; worker снимается с паузы при любом исходе |

Ни одно учение не пишет в боевую БД или в volume uploads. Учения по расписанию не запускаются.

`/health/worker` (публичный: `https://buyerly.app/health/worker`) отдаёт 503, когда последний завершённый monitoring cycle старше 360 с. Его стоит добавить во внешний uptime-монитор рядом с `/health/ready`: тогда о зависшем worker узнают и в случае, когда не работает сама доставка Inbox.

`migrate` изменяет production-схему только через `alembic upgrade head`. Одновременный запуск блокируется PostgreSQL advisory lock; после миграции контейнер сверяет текущий revision с Alembic head и проверяет наличие всех таблиц и колонок из моделей. Для исторической базы без `alembic_version` разрешён только одноразовый переход на явно зафиксированный baseline `0009_web_sessions`, причём перед stamp выполняется fail-closed проверка схемы. `create_all()` и ручные `ALTER TABLE` в production-runner не используются.

Пользовательские аватары и логотипы хранятся в именованном Docker volume
`buyerly-uploads`: API записывает их в `/app/uploads` и сам отдаёт по `/uploads/…`.
Каждый релиз использует тот же volume.

Этот volume **не входит** в резервные копии: `backup_db.sh` сохраняет только
PostgreSQL. После восстановления на новом сервере аватары и логотипы
workspace пропадут (записи в базе останутся, картинки — нет), их загружают
заново. Включение uploads в копии — отдельная задача C08.

Production checkout `/opt/buyerly` приводится к владельцу системного deploy-пользователя через root/passwordless sudo, а `origin` обязан указывать на канонический `hiurano/buyerly` по SSH или HTTPS. Если ownership нельзя безопасно нормализовать либо remote отличается, выкладка останавливается до сборки. В production-образ входят только runtime-каталоги; тесты, документация, локальные диагностические скрипты, транскрипты и исследовательские снимки интерфейсов не копируются.

## Безопасность хоста и доступ по SSH

- **Файрвол** (`ufw`): открыт только SSH (`22/tcp`) и порты других служб
  владельца на этом сервере (VPN). Веб-портов наружу нет: сайт идёт через
  Cloudflare Tunnel, `127.0.0.1:8080` доступен только локально.
- **SSH**: вход по ключу; владелец также входит по паролю, поэтому включён
  `fail2ban` (jail `sshd`), который блокирует подбор паролей.
- **Ключи**: доверенные публичные ключи — в `~/.ssh/authorized_keys`; для деплоя
  из GitHub Actions — секрет репозитория `VPS_SSH_KEY`.
- **Сеть Docker**: PostgreSQL (`5432`) доступен только внутри сети `buyerly`.
