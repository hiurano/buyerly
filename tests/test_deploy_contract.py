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
        cls.codeowners = (project_root / ".github" / "CODEOWNERS").read_text()
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
            project_root / "scripts" / "offsite_sync.py"
        ).read_text()
        cls.restore_drill_workflow = (
            project_root / ".github" / "workflows" / "restore-drill.yml"
        ).read_text()
        cls.log_verification_script = (
            project_root / "scripts" / "verify_docker_log_rotation.sh"
        ).read_text()
        cls.smoke_script = (
            project_root / "scripts" / "post_deploy_smoke.py"
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
        self.assertIn("CURRENT_REPO_SHA", self.script)
        self.assertIn("buyerly-app:${EXPECTED_SHA}", self.script)
        self.assertIn('bash "${SCRIPT_DIR}/verify_docker_log_rotation.sh"', self.script)
        early_exit = self.script[:self.script.index("Creating a mandatory database backup")]
        self.assertIn("INITIAL_ENV_HASH", early_exit)
        self.assertIn("FINAL_ENV_HASH", early_exit)
        self.assertIn("post_deploy_smoke.py", early_exit)
        self.assertIn("is already deployed and healthy", self.script)

    def test_production_roles_are_separate_services(self):
        for service in ("db:", "api:", "web:", "worker:", "migrate:"):
            self.assertIn(f"  {service}", self.compose)
        self.assertIn("postgres:16-alpine", self.compose)
        self.assertIn('command: ["python", "-m", "services.api"]', self.compose)
        self.assertNotIn("  bot:", self.compose)
        self.assertNotIn("services.bot", self.compose)
        self.assertIn('command: ["python", "-m", "services.worker"]', self.compose)

    def test_cutover_has_migration_healthcheck_and_rollback(self):
        self.assertIn("docker compose run --rm migrate", self.script)
        self.assertIn("wait_for_container buyerly-api", self.script)
        self.assertIn("wait_for_container buyerly-worker", self.script)
        self.assertIn("wait_for_container buyerly-web", self.script)
        self.assertIn("wait_for_ready", self.script)
        self.assertIn("rollback", self.script)

    def test_docker_logs_are_bounded_for_every_service(self):
        self.assertIn("x-logging: &default-logging", self.compose)
        self.assertIn('max-size: "20m"', self.compose)
        self.assertIn('max-file: "5"', self.compose)
        self.assertIn('compress: "true"', self.compose)
        self.assertGreaterEqual(self.compose.count("logging: *default-logging"), 4)
        for container_name in (
            "buyerly-db",
            "buyerly-redis",
            "buyerly-api",
            "buyerly-web",
            "buyerly-worker",
        ):
            self.assertIn(container_name, self.log_verification_script)
        self.assertIn("verify_docker_log_rotation.sh", self.script)

    def test_artifact_retention_preserves_rollbacks_and_volumes(self):
        self.assertIn('KEEP_RELEASES="${KEEP_RELEASES:-2}"', self.cleanup_script)
        self.assertIn("greater than or equal to 2", self.cleanup_script)
        self.assertIn("docker ps -aq", self.cleanup_script)
        self.assertIn("buyerly-app", self.cleanup_script)
        self.assertIn("buyerly-web", self.cleanup_script)
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
        build_position = self.script.index("docker compose build --pull api web")
        self.assertLess(cleanup_position, disk_check_position)
        self.assertLess(disk_check_position, build_position)

    def test_verified_backup_survives_optional_runtime_metric_failure(self):
        self.assertIn('if docker exec "${POSTGRES_CONTAINER}" psql', self.backup_script)
        self.assertIn(
            "Backup is valid, but runtime timestamp publication failed.",
            self.backup_script,
        )

    def test_post_deploy_smoke_is_blocking_persisted_and_read_only(self):
        self.assertIn("post_deploy_smoke.py", self.script)
        smoke_position = self.script.index("post_deploy_smoke.py")
        cleanup_position = self.script.rindex("cleanup_docker_artifacts.sh")
        self.assertLess(smoke_position, cleanup_position)
        self.assertIn("rollback", self.script[smoke_position:cleanup_position])
        self.assertIn('"mode": "read-only"', self.smoke_script)
        self.assertIn('"meta_budget_mutations": 0', self.smoke_script)
        self.assertIn("post-deploy-{EXPECTED_SHA}.json", self.smoke_script)
        self.assertIn("os.replace", self.smoke_script)
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
            "database_meta_isolation_summary",
            "reliability_metrics",
        ):
            self.assertIn(contract, self.smoke_script)
        self.assertIn("_assert_database_at_head", self.internal_smoke)
        self.assertIn("_assert_schema_contract", self.internal_smoke)
        self.assertIn("account_connection_workspace_mismatch", self.internal_smoke)
        self.assertIn("account_group_workspace_mismatch", self.internal_smoke)
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

    def test_user_uploads_are_durable_and_served_by_web(self):
        nginx = (Path(__file__).parents[1] / "frontend" / "nginx.conf").read_text()
        self.assertIn("buyerly-uploads:/app/uploads", self.compose)
        self.assertIn(
            "buyerly-uploads:/usr/share/nginx/html/uploads:ro",
            self.compose,
        )
        self.assertIn("preserve_legacy_uploads", self.script)
        self.assertIn("location /uploads/", nginx)
        self.assertIn('X-Content-Type-Options "nosniff"', nginx)

    def test_react_frontend_is_the_production_web_image(self):
        root = Path(__file__).parents[1]
        frontend_dockerfile = (root / "frontend" / "Dockerfile").read_text()
        self.assertIn("dockerfile: frontend/Dockerfile", self.compose)
        self.assertIn("FROM node:22-alpine AS build", frontend_dockerfile)
        self.assertIn("RUN npm ci", frontend_dockerfile)
        self.assertIn("RUN npm run build", frontend_dockerfile)
        self.assertIn("FROM nginx:1.27-alpine", frontend_dockerfile)
        self.assertIn("frontend/package-lock.json", frontend_dockerfile)

    def test_account_day_boundary_has_an_independent_minute_job(self):
        self.assertIn('id="account_day_boundary_job"', self.worker_service)
        self.assertIn("run_day_boundary_cycle", self.worker_service)

    def test_old_spend_started_notification_cannot_return(self):
        executable_contract = self.monitoring_worker
        self.assertNotIn('event_type="DAY_START"', executable_contract)
        self.assertNotIn("start_spend", executable_contract)
        self.assertNotIn("starts_notified", executable_contract)

    def test_no_hardcoded_secrets_in_deploy_script(self):
        import re
        self.assertIsNone(re.search(r"\bre_[A-Za-z0-9_]{10,}", self.script))
        self.assertIn("ensure_email_settings", self.script)

    def test_meta_token_key_is_generated_and_validated_without_logging_it(self):
        self.assertIn("ensure_meta_token_encryption_key", self.script)
        self.assertIn("META_KEY_CANDIDATE", self.script)
        self.assertIn("len(decoded) == 32", self.script)
        self.assertNotIn('echo "${configured_key}"', self.script)

    def test_rollback_restores_the_previous_image_version(self):
        self.assertIn("PREVIOUS_APP_TAG", self.script)
        self.assertIn("PREVIOUS_WEB_TAG", self.script)
        self.assertIn('export APP_VERSION="${PREVIOUS_SHA}"', self.script)
        self.assertNotIn('export APP_VERSION="${CURRENT_SHA}"', self.script)

    def test_env_app_version_follows_the_running_release(self):
        # A manual `docker compose up` reads APP_VERSION from .env; a stale value
        # silently rolls api/worker back to an old image.
        self.assertIn('record_running_version "${TARGET_SHA}"', self.script)
        self.assertIn('record_running_version "${PREVIOUS_SHA}"', self.script)
        smoke = self.script.rindex("post_deploy_smoke.py\"; then")
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
        self.assertIn("actions/checkout@v7", self.restore_drill_workflow)
        self.assertIn("actions/setup-python@v7", self.restore_drill_workflow)

    def test_production_repository_owner_and_origin_are_fail_closed(self):
        self.assertIn("EXPECTED_GIT_REPOSITORY", self.script)
        self.assertIn("normalize_repository_ownership", self.script)
        self.assertIn("chown -R", self.script)
        self.assertIn("sudo -n", self.script)
        self.assertIn("git remote get-url origin", self.script)
        self.assertIn("NORMALIZED_ORIGIN", self.script)
        self.assertIn("@hiurano", self.codeowners)

    def test_production_build_context_matches_the_exact_git_revision(self):
        reset_position = self.script.index('git reset --hard "${TARGET_SHA}"')
        clean_position = self.script.index("git clean -ffd -q")
        build_position = self.script.index("docker compose build --pull api web")
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
        self.assertIn("offsite_sync.py", self.backup_script)
        self.assertIn("S3Client", self.offsite_sync_script)
        self.assertIn("AWS4-HMAC-SHA256", self.offsite_sync_script)
        self.assertIn("min_keep_count", self.offsite_sync_script)
        self.assertIn("prune_old_backups", self.offsite_sync_script)

    def test_database_restore_and_drill_contracts(self):
        self.assertIn("openssl enc -d -aes-256-cbc", self.restore_script)
        self.assertIn("ON_ERROR_STOP=1", self.restore_script)
        self.assertIn("DRILL_DB", self.drill_script)
        self.assertIn("strictly forbidden from using production database", self.drill_script)
        self.assertIn("information_schema.tables", self.drill_script)
        self.assertIn("alembic_version", self.drill_script)
        self.assertIn("schedule:", self.restore_drill_workflow)
        self.assertIn("cron:", self.restore_drill_workflow)
        self.assertIn("alembic upgrade head", self.restore_drill_workflow)

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
