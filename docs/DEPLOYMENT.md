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

Город у входов в Settings → Security & access («Helsinki, 18, FI», как в Linear)
берётся из локальной базы IP → город; адреса никуда не отправляются. Базу
скачивает `scripts/update_geoip.sh` на шаге сборки deploy в `/opt/buyerly/geoip`
(каталог в `.gitignore`, в API он смонтирован read-only), не чаще раза в 25 дней.
Если в server `.env` заданы `MAXMIND_ACCOUNT_ID` и `MAXMIND_LICENSE_KEY`
(бесплатный аккаунт MaxMind), берётся GeoLite2 City и регион пишется кодом, как
в Linear. Без них — DB-IP Lite City без регистрации, регион пишется названием
(«Helsinki, Uusimaa, FI»). Путь к файлу внутри контейнера — `GEOIP_DATABASE_PATH`.
Неудачная загрузка не останавливает deploy: остаётся прежний файл, а без файла
у сессий просто нет города.

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
   - Наружу выставлен только порт обратного прокси веб-сервиса (`8080`).
