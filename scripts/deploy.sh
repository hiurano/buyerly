#!/usr/bin/env bash
# Deploys origin/main to this server: backup, build, migrate, start, check.
# A release that fails its checks is replaced by the previous one.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/buyerly}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANCH="${BRANCH:-main}"
EXPECTED_SHA="${EXPECTED_SHA:-}"
EXPECTED_GIT_REPOSITORY="${EXPECTED_GIT_REPOSITORY:-hiurano/buyerly}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-180}"
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-/var/lock/buyerly-deploy.lock}"
DEPLOY_LOCK_TIMEOUT_SECONDS="${DEPLOY_LOCK_TIMEOUT_SECONDS:-180}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-https://buyerly.app/health/live}"
PUBLIC_HEALTH_TIMEOUT_SECONDS="${PUBLIC_HEALTH_TIMEOUT_SECONDS:-90}"

wait_for_container() {
    local container_name="$1"
    local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
    local status=""
    while (( SECONDS < deadline )); do
        status=$(docker inspect \
            --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
            "${container_name}" 2>/dev/null || true)
        if [[ "${status}" == "healthy" ]]; then
            return 0
        fi
        if [[ "${status}" == "exited" || "${status}" == "dead" ]]; then
            break
        fi
        sleep 3
    done
    echo "[ERROR] ${container_name} did not become healthy; status=${status:-missing}"
    return 1
}

wait_for_container_file() {
    local container_name="$1"
    local file_path="$2"
    local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if docker exec "${container_name}" test -f "${file_path}" 2>/dev/null; then
            return 0
        fi
        sleep 3
    done
    echo "[ERROR] ${container_name} did not complete the required scheduler cycle."
    return 1
}

# Sets KEY=value in .env, replacing an earlier line.
set_env_value() {
    local key="$1"
    local value="$2"
    if grep -q "^${key}=" .env 2>/dev/null; then
        sed -i "s|^${key}=.*|${key}=${value}|" .env
    else
        printf '%s=%s\n' "${key}" "${value}" >> .env
    fi
}

env_value() {
    sed -n "s/^$1=//p" .env 2>/dev/null | tail -n 1 | tr -d " \t\r\"'"
}

# Secrets the server creates for itself once. Values are never printed.
ensure_generated_secrets() {
    touch .env
    chmod 600 .env
    if [[ -z "$(env_value POSTGRES_PASSWORD)" ]]; then
        set_env_value POSTGRES_PASSWORD "$(openssl rand -hex 32)"
        echo "[INFO] Generated the PostgreSQL password."
    fi
    if [[ -z "$(env_value OTP_PEPPER)" ]]; then
        set_env_value OTP_PEPPER "$(openssl rand -hex 32)"
        echo "[INFO] Generated the sign-in code pepper."
    fi
    ensure_meta_token_encryption_key
}

ensure_meta_token_encryption_key() {
    local configured_key primary_key
    configured_key=$(env_value META_TOKEN_ENCRYPTION_KEY)
    if [[ -z "${configured_key}" ]]; then
        configured_key=$(openssl rand -base64 32 | tr '+/' '-_')
        set_env_value META_TOKEN_ENCRYPTION_KEY "${configured_key}"
        echo "[INFO] Generated the Meta token encryption key."
    fi
    # A wrong key that is already set is never replaced: tokens encrypted with
    # it would be lost. The deploy stops before anything changes instead.
    primary_key="${configured_key%%,*}"
    if ! META_KEY_CANDIDATE="${primary_key}" python3 - <<'PY'
import base64
import os
import sys

try:
    decoded = base64.b64decode(
        os.environ["META_KEY_CANDIDATE"].encode("ascii"),
        altchars=b"-_",
        validate=True,
    )
except (KeyError, UnicodeEncodeError, ValueError):
    sys.exit(1)
sys.exit(0 if len(decoded) == 32 else 1)
PY
    then
        echo "[ERROR] META_TOKEN_ENCRYPTION_KEY has an invalid primary Fernet key."
        return 1
    fi
}

# Keys kept as GitHub repository secrets; an empty secret leaves .env as it is.
ensure_repository_secrets() {
    local clean_value
    if [[ -n "${RESEND_API_KEY:-}" ]]; then
        clean_value=$(printf '%s' "${RESEND_API_KEY}" | tr -d " \t\r\n\"'")
        set_env_value RESEND_API_KEY "${clean_value}"
    fi
    if [[ -n "${TELEGRAM_BOT_TOKEN:-}" ]]; then
        clean_value=$(printf '%s' "${TELEGRAM_BOT_TOKEN}" | tr -d " \t\r\n\"'")
        if [[ "${clean_value}" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]]; then
            set_env_value TELEGRAM_BOT_TOKEN "${clean_value}"
        else
            echo "[WARNING] TELEGRAM_BOT_TOKEN does not look like a bot token; .env left unchanged."
        fi
    fi
    if ! grep -q '^EMAIL_FROM=' .env; then
        printf 'EMAIL_FROM="Buyerly <team@buyerly.app>"\n' >> .env
    fi
}

# Compose reads APP_VERSION from .env when it is not exported, so a manual
# `docker compose up` starts the release that is actually running.
record_running_version() {
    set_env_value APP_VERSION "$1"
}

rollback() {
    if [[ -z "${PREVIOUS_SHA}" ]] \
          || ! docker image inspect "buyerly-app:${PREVIOUS_SHA}" >/dev/null 2>&1; then
        echo "[ROLLBACK] No previous release to return to."
        return 1
    fi
    echo "[ROLLBACK] Returning to ${PREVIOUS_SHA}..."
    export APP_VERSION="${PREVIOUS_SHA}"
    docker compose up -d --no-deps api worker
    wait_for_container buyerly-api || true
    wait_for_container buyerly-worker || true
    record_running_version "${PREVIOUS_SHA}"
    echo "[ROLLBACK] Previous release restored."
}

# 200 from the public URL with a cf-ray header: the request went through
# Cloudflare and the tunnel.
public_edge_ok() {
    local deadline=$((SECONDS + PUBLIC_HEALTH_TIMEOUT_SECONDS))
    local headers=""
    while (( SECONDS < deadline )); do
        headers=$(curl -sS --max-time 10 -o /dev/null -D - "${PUBLIC_HEALTH_URL}" 2>/dev/null || true)
        if grep -qE '^HTTP/[0-9.]+ 200' <<<"${headers}" \
              && grep -qi '^cf-ray:' <<<"${headers}"; then
            return 0
        fi
        sleep 3
    done
    echo "[ERROR] ${PUBLIC_HEALTH_URL} did not return 200 through Cloudflare within ${PUBLIC_HEALTH_TIMEOUT_SECONDS}s."
    return 1
}

cd "${APP_DIR}"

ORIGIN_URL=$(git remote get-url origin 2>/dev/null || true)
NORMALIZED_ORIGIN="${ORIGIN_URL%/}"
NORMALIZED_ORIGIN="${NORMALIZED_ORIGIN%.git}"
case "${NORMALIZED_ORIGIN}" in
    "git@github.com:${EXPECTED_GIT_REPOSITORY}"|"https://github.com/${EXPECTED_GIT_REPOSITORY}"|"ssh://git@github.com/${EXPECTED_GIT_REPOSITORY}")
        ;;
    *)
        echo "[ERROR] Unexpected production repository origin: ${ORIGIN_URL:-missing}"
        exit 1
        ;;
esac

exec 9>"${DEPLOY_LOCK_FILE}"
if ! flock -w "${DEPLOY_LOCK_TIMEOUT_SECONDS}" 9; then
    echo "[ERROR] Another Buyerly deployment is still running."
    exit 1
fi

INITIAL_ENV_HASH=$(sha256sum .env 2>/dev/null || true)
ensure_generated_secrets
ensure_repository_secrets
FINAL_ENV_HASH=$(sha256sum .env 2>/dev/null || true)

PREVIOUS_SHA=""
PREVIOUS_APP_TAG=$(docker inspect --format '{{.Config.Image}}' buyerly-api 2>/dev/null || true)
if [[ "${PREVIOUS_APP_TAG}" =~ ^buyerly-app:([0-9a-f]{40})$ ]]; then
    PREVIOUS_SHA="${BASH_REMATCH[1]}"
fi

if [[ -n "${EXPECTED_SHA}" && "${PREVIOUS_SHA}" == "${EXPECTED_SHA}" \
      && "${INITIAL_ENV_HASH}" == "${FINAL_ENV_HASH}" \
      && "$(git rev-parse HEAD 2>/dev/null || true)" == "${EXPECTED_SHA}" \
      && "$(docker inspect --format '{{.Config.Image}}' buyerly-worker 2>/dev/null || true)" == "buyerly-app:${EXPECTED_SHA}" ]] \
      && wait_for_container buyerly-api && wait_for_container buyerly-worker; then
    if APP_DIR="${APP_DIR}" EXPECTED_SHA="${EXPECTED_SHA}" \
          python3 "${SCRIPT_DIR}/post_deploy_smoke.py"; then
        echo "[SUCCESS] Buyerly ${EXPECTED_SHA} is already deployed and healthy."
        exit 0
    fi
    echo "[INFO] The running release failed its checks; deploying it again."
fi

echo "[1/7] Creating a database backup..."
bash "${SCRIPT_DIR}/backup_db.sh"

echo "[2/7] Synchronizing ${BRANCH}..."
git fetch origin "${BRANCH}"
TARGET_SHA=$(git rev-parse "origin/${BRANCH}")
if [[ -n "${EXPECTED_SHA}" && "${TARGET_SHA}" != "${EXPECTED_SHA}" ]]; then
    echo "[ERROR] origin/${BRANCH} is ${TARGET_SHA}, expected ${EXPECTED_SHA}."
    exit 1
fi
git reset --hard "${TARGET_SHA}"
# `reset --hard` leaves untracked source files behind, and the build would
# copy them into the image. Runtime state (.env, logs, backups) is gitignored
# and stays.
git clean -ffd -q
if [[ -n "$(git status --short --untracked-files=all)" ]]; then
    echo "[ERROR] Production source tree does not match ${TARGET_SHA}."
    exit 1
fi
export APP_VERSION="${TARGET_SHA}"

echo "[3/7] Removing old images and checking disk space..."
bash "${SCRIPT_DIR}/cleanup_docker_artifacts.sh"
if ! CHECK_PATH="${APP_DIR}" bash "${SCRIPT_DIR}/check_disk_usage.sh"; then
    echo "[ERROR] Disk usage remains critical after cleanup."
    exit 1
fi

echo "[4/7] Building buyerly-app:${TARGET_SHA}..."
docker compose build --pull api

echo "[5/7] Migrating the database..."
docker compose up -d db
if ! wait_for_container buyerly-db; then
    docker compose logs --tail=120 db
    exit 1
fi
if ! docker compose run --rm migrate; then
    docker compose logs --tail=120 db
    rollback
    exit 1
fi

echo "[6/7] Starting the release..."
docker compose up -d --no-deps api worker
if ! wait_for_container buyerly-api; then
    docker compose logs --tail=120 api
    rollback
    exit 1
fi
if ! wait_for_container buyerly-worker \
      || ! wait_for_container_file buyerly-worker /tmp/buyerly-worker-day-boundary-cycle-complete; then
    docker compose logs --tail=160 worker
    rollback
    exit 1
fi
if docker compose logs --since=5m worker 2>&1 \
    | grep -Eiq 'Failed to persist audit event.*(owner_id|owner_user_id)|NotNullViolation.*(owner_id|owner_user_id)'; then
    echo "[ERROR] Worker audit ownership failure detected after a full scheduler cycle."
    docker compose logs --tail=160 worker
    rollback
    exit 1
fi
TUNNEL_ENABLED=false
if [[ "$(env_value COMPOSE_PROFILES)" == *tunnel* ]]; then
    TUNNEL_ENABLED=true
    docker compose up -d --no-deps tunnel
fi

echo "[7/7] Checking the release..."
if ! bash "${SCRIPT_DIR}/verify_docker_log_rotation.sh"; then
    rollback
    exit 1
fi
if ! APP_DIR="${APP_DIR}" EXPECTED_SHA="${TARGET_SHA}" \
    python3 "${SCRIPT_DIR}/post_deploy_smoke.py"; then
    echo "[ERROR] Post-deploy smoke failed; restoring the previous release."
    rollback
    exit 1
fi
record_running_version "${TARGET_SHA}"
if [[ "${TUNNEL_ENABLED}" == "true" ]] && ! public_edge_ok; then
    exit 1
fi

if ! bash "${SCRIPT_DIR}/cleanup_docker_artifacts.sh"; then
    echo "[WARNING] Post-deploy cleanup failed; the release itself is healthy."
fi
CHECK_PATH="${APP_DIR}" bash "${SCRIPT_DIR}/check_disk_usage.sh"

echo "[SUCCESS] Buyerly ${TARGET_SHA} deployed."
docker compose ps
