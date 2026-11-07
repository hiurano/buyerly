import re
import subprocess
import sys
from pathlib import Path
import unittest


class TestDeployContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        project_root = Path(__file__).parents[1]
        cls.script = (project_root / "scripts" / "deploy.sh").read_text()
        cls.compose = (project_root / "docker-compose.yml").read_text()
        cls.worker_service = (project_root / "services" / "worker.py").read_text()
        cls.monitoring_worker = (project_root / "scheduler" / "worker.py").read_text()
        cls.dockerfile = (project_root / "Dockerfile").read_text()
        cls.workflow = (project_root / ".github" / "workflows" / "deploy.yml").read_text()
        cls.alembic_env = (project_root / "alembic" / "env.py").read_text()
        cls.cleanup_script = (
            project_root / "scripts" / "cleanup_docker_artifacts.sh"
        ).read_text()
        cls.disk_script = (
            project_root / "scripts" / "check_disk_usage.sh"
        ).read_text()
        cls.backup_script = (
            project_root / "scripts" / "backup_db.sh"
        ).read_text()
        cls.restore_script = (
            project_root / "scripts" / "restore_db.sh"
        ).read_text()
        cls.drill_script = (
            project_root / "scripts" / "drill_restore.sh"
        ).read_text()
        cls.offsite_sync_script = (
            project_root / "server" / "src" / "scripts" / "offsite-sync.ts"
        ).read_text()
        cls.log_verification_script = (
            project_root / "scripts" / "verify_docker_log_rotation.sh"
        ).read_text()
        cls.smoke_script = (
            project_root / "server" / "src" / "scripts" / "post-deploy-smoke.ts"
        ).read_text()
        cls.internal_smoke = (
            project_root / "services" / "smoke_checks.py"
        ).read_text()
        cls.reliability_metrics = (
            project_root / "services" / "reliability_metrics.py"
        ).read_text()
        cls.incident_runbooks = (
            project_root / "docs" / "INCIDENT_RUNBOOKS.md"
        ).read_text()

    def test_deployments_are_serialized(self):
        self.assertIn("DEPLOY_LOCK_FILE", self.script)
        self.assertIn("flock -w", self.script)

    def test_same_healthy_commit_is_not_recreated(self):
        self.assertIn("buyerly-app:${EXPECTED_SHA}", self.script)
        self.assertIn('bash "${SCRIPT_DIR}/verify_docker_log_rotation.sh"', self.script)
        early_exit = self.script[:self.script.index("Creating a database backup")]
        self.assertIn("INITIAL_ENV_HASH", early_exit)
        self.assertIn("FINAL_ENV_HASH", early_exit)
        self.assertIn("git rev-parse HEAD", early_exit)
        self.assertIn("run_post_deploy_smoke", early_exit)
        self.assertIn("is already deployed and healthy", self.script)

    def test_only_the_tunnel_is_trusted_to_report_the_visitor(self):
        # cloudflared has a fixed address in the compose network; nothing else
        # may supply CF-Connecting-IP, and no proxy sits in between.
        self.assertIn("CLOUDFLARE_TUNNEL_CIDRS: 172.30.0.10/32", self.compose)
        self.assertIn("ipv4_address: 172.30.0.10", self.compose)
        self.assertIn("subnet: 172.30.0.0/24", self.compose)
        self.assertIn('TRUSTED_PROXY_CIDRS: ""', self.compose)

    def test_site_is_reachable_only_through_the_tunnel(self):
        self.assertIn('- "127.0.0.1:8080:8080"', self.compose)
        self.assertEqual(self.compose.count("ports:"), 1)
        self.assertIn('profiles: ["tunnel"]', self.compose)
        self.assertIn("TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN:-}", self.compose)
        self.assertIn("https://buyerly.app/health/live", self.script)
        self.assertIn("cf-ray", self.script)
        after_smoke = self.script[self.script.index('record_running_version "${TARGET_SHA}"'):]
        self.assertIn("public_edge_ok", after_smoke)

    def test_production_roles_are_separate_services(self):
        for service in ("db:", "api:", "worker:", "worker-ts:", "redis:", "migrate:", "backup:", "tunnel:"):
            self.assertIn(f"  {service}", self.compose)
        for retired in ("web:", "bot:"):
            self.assertNotIn(f"\n  {retired}", self.compose)
        self.assertIn("postgres:16-alpine", self.compose)
        self.assertIn('command: ["python", "-m", "services.api"]', self.compose)
        self.assertNotIn("services.bot", self.compose)
        self.assertIn('command: ["python", "-m", "services.worker"]', self.compose)
        self.assertIn('profiles: ["migrate"]', self.compose)

    def test_cutover_has_migration_healthcheck_and_rollback(self):
        self.assertIn("docker compose run --rm migrate", self.script)
        self.assertIn("wait_for_container buyerly-api", self.script)
        self.assertIn("wait_for_container buyerly-worker", self.script)
        self.assertIn("rollback", self.script)

    def test_docker_logs_are_bounded_for_every_service(self):
        self.assertIn("x-logging: &default-logging", self.compose)
        self.assertIn('max-size: "20m"', self.compose)
        self.assertIn('max-file: "5"', self.compose)
        self.assertIn('compress: "true"', self.compose)
        # x-app (api, worker, worker-ts, server, migrate, backup), db, redis and tunnel.
        self.assertEqual(self.compose.count("logging: *default-logging"), 4)
        for container_name in (
            "buyerly-db",
            "buyerly-api",
            "buyerly-worker",
            "buyerly-worker-ts",
            "buyerly-redis",
            "buyerly-backup",
            "buyerly-tunnel",
        ):
            self.assertIn(container_name, self.log_verification_script)
        self.assertIn("verify_docker_log_rotation.sh", self.script)

    def test_artifact_retention_preserves_rollbacks_and_volumes(self):
        self.assertIn('KEEP_RELEASES="${KEEP_RELEASES:-2}"', self.cleanup_script)
        self.assertIn("greater than or equal to 2", self.cleanup_script)
        self.assertIn("docker ps -aq", self.cleanup_script)
        self.assertIn("buyerly-app", self.cleanup_script)
        self.assertIn("docker image prune", self.cleanup_script)
        self.assertIn("docker builder prune", self.cleanup_script)
        self.assertNotIn("docker volume prune", self.cleanup_script)
        self.assertNotIn("docker system prune", self.cleanup_script)
        self.assertNotIn("docker image prune -a", self.cleanup_script)
        self.assertIn("cleanup_docker_artifacts.sh", self.script)

    def test_disk_threshold_blocks_deploy_after_safe_cleanup(self):
        self.assertIn('DISK_WARNING_PERCENT="${DISK_WARNING_PERCENT:-75}"', self.disk_script)
        self.assertIn('DISK_CRITICAL_PERCENT="${DISK_CRITICAL_PERCENT:-90}"', self.disk_script)
        cleanup_position = self.script.index("cleanup_docker_artifacts.sh")
        disk_check_position = self.script.index("check_disk_usage.sh")
        build_position = self.script.index("docker compose build --pull api")
        self.assertLess(cleanup_position, disk_check_position)
        self.assertLess(disk_check_position, build_position)

    def test_verified_backup_survives_optional_runtime_metric_failure(self):
        self.assertIn("if db_command psql", self.backup_script)
        self.assertIn(
            "Backup is valid, but runtime timestamp publication failed.",
            self.backup_script,
        )

    def test_post_deploy_smoke_is_blocking_persisted_and_read_only(self):
        self.assertIn("run_post_deploy_smoke", self.script)
        smoke_position = self.script.index("run_post_deploy_smoke")
        cleanup_position = self.script.rindex("cleanup_docker_artifacts.sh")
        self.assertLess(smoke_position, cleanup_position)
        self.assertIn("rollback", self.script[smoke_position:cleanup_position])
        self.assertIn("mode: 'read-only'", self.smoke_script)
        self.assertIn("meta_budget_mutations: 0", self.smoke_script)
        self.assertIn("post-deploy-${EXPECTED_SHA}.json", self.smoke_script)
        self.assertIn("rename(", self.smoke_script)
        self.assertIn("0o600", self.smoke_script)
        self.assertNotIn("META_APP_SECRET", self.smoke_script)
        self.assertNotIn("access_token", self.smoke_script)

    def test_smoke_covers_release_critical_contracts(self):
        for contract in (
            "health_live",
            "health_ready",
            "authentication_boundary",
            "runtime_versions",
            "worker_heartbeat",
            "worker_ts_health",
            "database_meta_isolation_summary",
            "reliability_metrics",
        ):
            self.assertIn(contract, self.smoke_script)
        self.assertIn("_assert_database_at_head", self.internal_smoke)
        self.assertIn("_assert_schema_contract", self.internal_smoke)
        self.assertIn("account_connection_workspace_mismatch", self.internal_smoke)
        self.assertIn("summary_workspace_scope", self.internal_smoke)
        self.assertIn("meta_configuration", self.internal_smoke)
        self.assertIn("normalize_synthetic_metrics", self.reliability_metrics)
        self.assertIn('runtime["synthetic"]', self.reliability_metrics)
        self.assertNotIn("access_token", self.reliability_metrics)

    def test_incident_runbooks_cover_required_failures(self):
        for heading in (
            "## Worker heartbeat or scheduler cycle",
            "## Database or migration",
            "## Meta API outage or quota",
            "## Token expiry, revocation, or encryption key",
            "## Disk capacity",
            "## Release smoke failure and rollback gate",
            "## Disaster Recovery from off-site backup",
        ):
            self.assertIn(heading, self.incident_runbooks)

    def test_migration_lock_does_not_mask_the_primary_database_error(self):
        self.assertIn("pg_try_advisory_xact_lock", self.alembic_env)
        self.assertNotIn("pg_advisory_unlock", self.alembic_env)
        self.assertNotIn("docker compose logs --tail=120 migrate db", self.script)

    def test_deploy_waits_for_scheduler_cycle_and_rejects_owner_failures(self):
        self.assertIn("buyerly-worker-day-boundary-cycle-complete", self.script)
        self.assertIn("Failed to persist audit event", self.script)
        self.assertIn("NotNullViolation", self.script)

    def test_production_mini_app_has_https_url(self):
        self.assertIn(
            "WEBAPP_URL: ${WEBAPP_URL:-https://buyerly.app}",
            self.compose,
        )

    def test_user_uploads_are_durable_and_served_by_the_api(self):
        server = (Path(__file__).parents[1] / "api" / "server.py").read_text()
        self.assertIn("buyerly-uploads:/app/uploads", self.compose)
        self.assertIn('app.mount("/uploads", _ImmutableStaticFiles(', server)
        self.assertIn("immutable", server)

    def test_one_image_carries_the_api_and_the_react_build(self):
        self.assertIn("FROM node:24-slim AS frontend", self.dockerfile)
        self.assertIn("RUN npm ci --workspace buyerly-frontend", self.dockerfile)
        self.assertIn("RUN npm run build", self.dockerfile)
        # npm workspaces (#611): the lock file is the repository root's.
        self.assertIn("COPY package.json package-lock.json ./", self.dockerfile)
        self.assertIn("FROM python:3.12-slim", self.dockerfile)
        self.assertIn("COPY --from=frontend /app/frontend/dist ./frontend/dist", self.dockerfile)
        # The Python stage is last, so it stays the image's default target.
        self.assertGreater(self.dockerfile.index("FROM python:3.12-slim"), self.dockerfile.index("AS server"))

    def test_the_typescript_server_runs_from_the_same_image(self):
        # #611: same image and release tag, so rollback and cleanup cover it.
        self.assertIn("FROM node:24-slim AS server", self.dockerfile)
        self.assertIn("COPY --from=server /usr/local/bin/node /usr/local/bin/node", self.dockerfile)
        self.assertIn("COPY --from=server /app/server/dist ./server/dist", self.dockerfile)
        service = self.compose.split("\n  server:\n", 1)[1].split("\n\n", 1)[0]
        self.assertIn("<<: *app", service)
        self.assertIn('command: ["node", "server/dist/main.js"]', service)
        self.assertIn("/health/server/ready", service)
        self.assertNotIn("ports:", service)
        # It writes and serves the uploads the API used to (#611).
        self.assertIn("- buyerly-uploads:/app/uploads", service)
        self.assertIn("SERVER_URL: http://server:8090", self.compose)
        self.assertIn("docker compose up -d --no-deps api worker worker-ts backup server", self.script)
        self.assertIn("wait_for_container buyerly-server", self.script)
        root = Path(__file__).parents[1]
        self.assertFalse((root / "frontend" / "Dockerfile").exists())
        self.assertFalse((root / "frontend" / "nginx.conf").exists())

    def test_the_typescript_worker_and_redis(self):
        # #611 stage 4, decision 54: BullMQ on a capped Redis that keeps every key.
        redis = self.compose.split("\n  redis:\n", 1)[1].split("\n\n", 1)[0]
        self.assertIn("--maxmemory-policy\", \"noeviction", redis)
        self.assertIn("--appendonly", redis)
        self.assertIn("mem_limit:", redis)
        self.assertIn("buyerly-redis:/data", redis)
        self.assertIn("redis-cli", redis)
        worker = self.compose.split("\n  worker-ts:\n", 1)[1].split("\n\n", 1)[0]
        self.assertIn("<<: *app", worker)
        self.assertIn('command: ["node", "server/dist/worker/main.js"]', worker)
        self.assertIn("/health/worker-ts", worker)
        self.assertIn("stop_grace_period:", worker)
        self.assertNotIn("ports:", worker)
        self.assertIn("REDIS_URL: redis://redis:6379/0", self.compose)
        self.assertIn("TS_WORKER_JOBS: ${TS_WORKER_JOBS-", self.compose)
        self.assertIn("docker compose up -d db redis", self.script)
        self.assertIn("wait_for_container buyerly-worker-ts", self.script)
        # Rolling back to a release without the TypeScript worker stops it,
        # since that release's Python worker runs every job itself.
        rollback = self.script.split("rollback() {", 1)[1].split("\n}\n", 1)[0]
        self.assertIn("server/dist/worker/main.js", rollback)
        self.assertIn("docker compose stop worker-ts", rollback)

    def test_web_bundle_knows_its_release(self):
        # An open tab compares the release it was built from with /health/live
        # and offers a reload once they differ (#303).
        root = Path(__file__).parents[1]
        vite_config = (root / "frontend" / "vite.config.ts").read_text()
        build = self.compose.split("x-app: &app\n", 1)[1].split("\n  image:", 1)[0]
        self.assertIn("APP_VERSION: ${APP_VERSION:-local}", build)
        self.assertIn("ARG APP_VERSION=local", self.dockerfile)
        self.assertLess(
            self.dockerfile.index("ENV APP_VERSION=${APP_VERSION}"),
            self.dockerfile.index("RUN npm run build"),
        )
        self.assertIn("__APP_VERSION__: JSON.stringify(process.env.APP_VERSION || 'local')", vite_config)
        self.assertIn('export APP_VERSION="${TARGET_SHA}"', self.script)
        self.assertLess(
            self.script.index('export APP_VERSION="${TARGET_SHA}"'),
            self.script.index("docker compose build --pull api"),
        )

    def test_account_day_boundary_has_an_independent_minute_job(self):
        # A shared job (id account_day_boundary_job), on whichever worker TS_WORKER_JOBS names.
        self.assertIn('("account_day_boundary", run_account_day_boundary_tick, {"minutes": 1})', self.worker_service)
        self.assertIn('id=f"{job_id}_job"', self.worker_service)
        self.assertIn("run_day_boundary_cycle", self.worker_service)

    def test_old_spend_started_notification_cannot_return(self):
        executable_contract = self.monitoring_worker
        self.assertNotIn('event_type="DAY_START"', executable_contract)
        self.assertNotIn("start_spend", executable_contract)
        self.assertNotIn("starts_notified", executable_contract)

    def test_no_hardcoded_secrets_in_deploy_script(self):
        import re
        self.assertIsNone(re.search(r"\bre_[A-Za-z0-9_]{10,}", self.script))
        self.assertIn("ensure_repository_secrets", self.script)

    def test_meta_token_key_is_generated_and_validated_without_logging_it(self):
        self.assertIn("ensure_meta_token_encryption_key", self.script)
        self.assertIn("META_KEY_CANDIDATE", self.script)
        self.assertIn("len(decoded) == 32", self.script)
        self.assertNotIn('echo "${configured_key}"', self.script)

    def test_rollback_restores_the_previous_image_version(self):
        self.assertIn("PREVIOUS_APP_TAG", self.script)
        self.assertIn('export APP_VERSION="${PREVIOUS_SHA}"', self.script)
        self.assertNotIn('export APP_VERSION="${CURRENT_SHA}"', self.script)

    def test_env_app_version_follows_the_running_release(self):
        # A manual `docker compose up` reads APP_VERSION from .env; a stale value
        # silently rolls api/worker back to an old image.
        self.assertIn('record_running_version "${TARGET_SHA}"', self.script)
        self.assertIn('record_running_version "${PREVIOUS_SHA}"', self.script)
        smoke = self.script.rindex("run_post_deploy_smoke \"${TARGET_SHA}\"; then")
        self.assertLess(smoke, self.script.index('record_running_version "${TARGET_SHA}"'))

    def test_remote_deploy_failure_exposes_only_safe_stage_diagnostics(self):
        self.assertIn("appleboy/ssh-action@v1.2.5", self.workflow)
        self.assertIn("capture_stdout: true", self.workflow)
        self.assertIn("BUYERLY_DEPLOY_RESULT=success", self.workflow)
        self.assertIn("BUYERLY_DEPLOY_RESULT=failure", self.workflow)
        self.assertIn("Production deploy failure", self.workflow)
        self.assertIn("[REDACTED_FERNET_TOKEN]", self.workflow)
        self.assertIn("[REDACTED_META_TOKEN]", self.workflow)
        self.assertIn('File "/app/', self.workflow)
        self.assertIn("Running (upgrade|stamp)", self.workflow)
        self.assertIn("ERROR:|DETAIL:", self.workflow)
        self.assertIn("grep -Ev '(parameters:|UPDATE accounts|INSERT INTO)'", self.workflow)
        self.assertNotIn('cat "${deploy_log}"', self.workflow)

    def test_ci_avoids_duplicate_feature_branch_runs_and_uses_node24_actions(self):
        workflow_events = self.workflow.split("permissions:", 1)[0]
        self.assertIn("push:\n    branches:\n      - main", workflow_events)
        self.assertIn("pull_request:", workflow_events)
        self.assertIn("workflow_dispatch:", workflow_events)
        self.assertIn("actions/checkout@v7", self.workflow)
        self.assertIn("actions/setup-node@v7", self.workflow)
        self.assertIn("actions/setup-python@v7", self.workflow)

    def test_production_repository_origin_is_fail_closed(self):
        self.assertIn("EXPECTED_GIT_REPOSITORY", self.script)
        self.assertIn("git remote get-url origin", self.script)
        self.assertIn("NORMALIZED_ORIGIN", self.script)

    def test_production_build_context_matches_the_exact_git_revision(self):
        reset_position = self.script.index('git reset --hard "${TARGET_SHA}"')
        clean_position = self.script.index("git clean -ffd -q")
        build_position = self.script.index("docker compose build --pull api")
        self.assertLess(reset_position, clean_position)
        self.assertLess(clean_position, build_position)
        self.assertIn("git status --short --untracked-files=all", self.script)
        self.assertIn("Production source tree does not match", self.script)

    def test_pre_deploy_backup_survives_the_source_cleanup(self):
        # backup_db.sh writes the mandatory dump inside APP_DIR, then deploy.sh
        # removes untracked files: only an ignored directory outlives git clean.
        backup_position = self.script.index('bash "${SCRIPT_DIR}/backup_db.sh"')
        clean_position = self.script.index("git clean -ffd -q")
        self.assertLess(backup_position, clean_position)
        self.assertNotRegex(self.script, r"git clean[^\n]* -\w*[xX]")
        backup_dir = re.search(
            r'BACKUP_DIR="\$\{BACKUP_DIR:-/opt/buyerly/([^}"]+)\}"',
            self.backup_script,
        ).group(1)
        result = subprocess.run(
            [
                "git",
                "check-ignore",
                "-q",
                f"{backup_dir}/buyerly_postgres_20260101_000000.sql.gz",
            ],
            cwd=Path(__file__).resolve().parents[1],
            capture_output=True,
            text=True,
        )
        if result.returncode == 128:
            self.skipTest(f"not a git work tree: {result.stderr.strip()}")
        self.assertEqual(result.returncode, 0, f"git clean would delete {backup_dir}/")
        # Kept dumps are plaintext unless BACKUP_ENCRYPTION_KEY is set.
        self.assertIn("umask 077", self.backup_script)

    def test_legacy_monolith_cannot_return(self):
        self.assertNotIn("--profile legacy", self.script)
        self.assertNotIn("PREVIOUS_LEGACY_IMAGE", self.script)
        self.assertNotIn("buyerly-bot", self.script)
        self.assertNotIn("buyerly-telegram-bot", self.script)

    def test_runtime_image_uses_explicit_production_sources(self):
        self.assertNotIn("COPY . .", self.dockerfile)
        for runtime_dir in (
            "alembic",
            "api",
            "core",
            "database",
            "meta_api",
            "rules",
            "scheduler",
            "services",
        ):
            self.assertIn(f"COPY {runtime_dir} ./{runtime_dir}", self.dockerfile)

    def test_repository_has_no_workstation_or_captured_design_artifacts(self):
        root = Path(__file__).parents[1]
        forbidden = (
            "main.py",
            "batch_transcribe.py",
            "transcribe.py",
            "scratch_active.py",
            "scratch_check.py",
            "client_responses.txt",
            "app.attio-structure-login-workspaces",
            "webapp/attio-reference.html",
            "webapp/prototype.html",
        )
        for relative_path in forbidden:
            self.assertFalse((root / relative_path).exists(), relative_path)

    def test_encrypted_backup_and_offsite_sync_contract(self):
        self.assertIn("BACKUP_ENCRYPTION_KEY", self.backup_script)
        self.assertIn("openssl enc -aes-256-cbc", self.backup_script)
        self.assertIn("flock -n", self.backup_script)
        self.assertIn("offsite_sync.sh", self.backup_script)
        self.assertIn("S3Client", self.offsite_sync_script)
        self.assertIn("AWS4-HMAC-SHA256", self.offsite_sync_script)
        self.assertIn("minKeep", self.offsite_sync_script)
        self.assertIn("pruneOldBackups", self.offsite_sync_script)

    def test_backups_are_scheduled_by_compose_not_the_host(self):
        # A new server gets nightly backups from deploy.sh alone: no cron.
        root = Path(__file__).parents[1]
        self.assertFalse((root / "scripts" / "setup_backup_cron.sh").exists())
        backup = self.compose[self.compose.index("\n  backup:"):self.compose.index("\n  tunnel:")]
        self.assertIn('command: ["bash", "scripts/backup_service.sh"]', backup)
        self.assertIn("BACKUP_DB_ACCESS: network", backup)
        self.assertIn("- ./backups:/backups", backup)
        self.assertIn("- buyerly-uploads:/uploads:ro", backup)
        self.assertIn("healthcheck:", backup)
        self.assertNotIn("/var/run/docker.sock", backup)
        self.assertIn("postgresql-client", self.dockerfile)
        self.assertIn(
            "COPY scripts/backup_service.sh scripts/backup_db.sh scripts/backup_env.sh scripts/offsite_sync.sh ./scripts/",
            self.dockerfile,
        )
        # Started with every release and every rollback.
        self.assertIn("docker compose up -d --no-deps api worker worker-ts backup server", self.script)
        self.assertIn("local services=(api worker backup server)", self.script)

    def test_empty_database_is_restored_from_offsite_before_migrations(self):
        restore = self.script.index("if ! restore_empty_server; then")
        self.assertLess(self.script.index('docker compose up -d db'), restore)
        self.assertLess(restore, self.script.index("if ! docker compose run --rm migrate; then"))
        self.assertIn("to_regclass('public.app_settings') IS NULL", self.script)
        self.assertIn('bash "${SCRIPT_DIR}/restore_db.sh" --download-latest-offsite --yes', self.script)
        self.assertIn('bash "${SCRIPT_DIR}/restore_uploads.sh" --download-latest-offsite --yes', self.script)

    def test_database_restore_and_drill_contracts(self):
        self.assertIn("openssl enc -d -aes-256-cbc", self.restore_script)
        self.assertIn("ON_ERROR_STOP=1", self.restore_script)
        self.assertIn("--single-transaction", self.restore_script)
        # A dump from pg_dump 17 still restores into PostgreSQL 16.
        self.assertIn("/^SET transaction_timeout = 0;$/d", self.restore_script)
        self.assertIn("-- PostgreSQL database dump complete", self.restore_script)
        # The archive is decoded and checked before psql runs, never streamed into it.
        self.assertNotRegex(self.restore_script, r"gzip -dc[^\n]*\\\n\s*\|\s*docker exec")
        self.assertLess(
            self.restore_script.index("dump complete"),
            self.restore_script.index("docker exec -i"),
        )
        self.assertIn("DRILL_DB", self.drill_script)
        self.assertIn("strictly forbidden from using production database", self.drill_script)
        # Schema, data and application checks run in the release's own code
        # (server/test/scripts/restore-check.test.ts), not as table-name probes in shell.
        self.assertIn("node server/dist/scripts/restore-check.js", self.drill_script)

    def test_ci_runs_every_browser_script_exactly_once(self):
        """Every scripts/*-browser.mjs must sit in exactly one browser group.

        The browser checks run as parallel groups listed in the workflow
        matrix; a new script nobody added to a group would never run.
        """
        project_root = Path(__file__).resolve().parents[1]
        on_disk = sorted(
            path.name.removesuffix("-browser.mjs")
            for path in (project_root / "scripts").glob("*-browser.mjs")
        )
        self.assertTrue(on_disk, "no browser scripts found")
        in_groups = [
            name
            for line in re.findall(r"(?m)^ +scripts: (.+)$", self.workflow)
            for name in line.split()
        ]
        self.assertEqual(sorted(in_groups), on_disk)

    def test_ci_test_shards_cover_every_test_exactly_once(self):
        """Every test must land in exactly one CI shard.

        The workflow splits the suite across parallel legs. A test that fell
        out of the split would silently stop running, and one counted twice
        would waste a leg. The shard assignment is compared against unittest's
        own discovery, so a test the sharding script fails to parse is caught
        here rather than by nobody.
        """
        shard_line = re.search(r"shard: \[([0-9, ]+)\]", self.workflow)
        self.assertIsNotNone(shard_line, "deploy.yml must declare a shard matrix")
        shards = [int(value) for value in shard_line.group(1).split(",")]
        self.assertEqual(shards, list(range(1, len(shards) + 1)))
        self.assertIn(f"--total {len(shards)}", self.workflow)

        project_root = Path(__file__).resolve().parents[1]

        discovered = set()

        def walk(suite):
            for item in suite:
                if isinstance(item, unittest.TestSuite):
                    walk(item)
                else:
                    discovered.add(item.id().removeprefix("tests."))

        walk(unittest.TestLoader().discover(str(project_root / "tests")))
        self.assertTrue(discovered, "unittest discovered no tests")
        # Without the project dependencies installed, discovery yields import
        # failures instead of test ids and the comparison below would be
        # meaningless. CI always has them, so skip rather than report a
        # difference that says nothing about the sharding.
        unimportable = sorted(t for t in discovered if "_FailedTest" in t)
        if unimportable:
            self.skipTest(f"test modules are not importable here: {unimportable[:3]}")

        assigned = []
        for shard in shards:
            result = subprocess.run(
                [
                    sys.executable,
                    str(project_root / "scripts" / "ci_test_shard.py"),
                    "--shard",
                    str(shard),
                    "--total",
                    str(len(shards)),
                ],
                capture_output=True,
                text=True,
                check=True,
            )
            ids = result.stdout.split()
            self.assertTrue(ids, f"shard {shard} resolved to no tests")
            assigned.extend(test_id.removeprefix("tests.") for test_id in ids)

        self.assertEqual(len(assigned), len(set(assigned)), "a test is assigned twice")
        self.assertEqual(sorted(assigned), sorted(discovered))


if __name__ == "__main__":
    unittest.main()
