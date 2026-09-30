"""Backup scripts read their settings from .env when cron starts them bare.

cron and deploy.sh run backup_db.sh with no exported settings; Compose only
hands .env to the containers. These tests run the real scripts in such an
environment with fake docker/python3/crontab, so they need bash, gzip and
openssl but no Docker or network.
"""

import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ("backup_db.sh", "backup_env.sh", "restore_db.sh", "setup_backup_cron.sh")
DUMP = "-- fake dump\nSELECT 1;\n-- PostgreSQL database dump complete\n"

FAKE_DOCKER = """#!/usr/bin/env bash
echo "docker $*" >> "${FAKE_LOG}"
case "$1" in
    inspect) echo running ;;
    exec)
        if [[ " $* " == *" pg_dump "* ]]; then
            printf '%s' "${FAKE_DUMP}"
        elif [[ " $* " == *" -i "* ]]; then
            cat > "${FAKE_LOG}.restored"
        fi
        ;;
esac
"""

# Records what off-site sync would receive: its arguments and which S3
# settings reached its environment (names only).
FAKE_PYTHON = """#!/usr/bin/env bash
{
    echo "python3 $*"
    for key in S3_ENDPOINT_URL S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_REGION; do
        echo "${key}=${!key:-}"
    done
} >> "${FAKE_LOG}"
"""

FAKE_CRONTAB = """#!/usr/bin/env bash
if [[ "${1:-}" == "-" ]]; then cat > "${FAKE_LOG}.crontab"; fi
"""


@unittest.skipUnless(shutil.which("openssl"), "openssl is required")
class BackupSettingsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        self.app = self.tmp / "app"
        (self.app / "scripts").mkdir(parents=True)
        for name in SCRIPTS:
            shutil.copy(PROJECT_ROOT / "scripts" / name, self.app / "scripts" / name)
        self.backups = self.tmp / "backups"
        self.log = self.tmp / "calls.log"
        self.log.touch()
        fake_bin = self.tmp / "bin"
        fake_bin.mkdir()
        for name, body in (("docker", FAKE_DOCKER), ("python3", FAKE_PYTHON), ("crontab", FAKE_CRONTAB)):
            path = fake_bin / name
            path.write_text(body)
            path.chmod(path.stat().st_mode | stat.S_IEXEC)
        self.path = f"{fake_bin}:{os.environ['PATH']}"

    def write_env(self, text):
        (self.app / ".env").write_text(text)

    def run_script(self, name, *args, extra_env=None):
        # Only paths and the fakes: no backup setting comes from the caller.
        env = {
            "PATH": self.path,
            "HOME": str(self.tmp / "home"),
            "BACKUP_DIR": str(self.backups),
            "BACKUP_LOCK_FILE": str(self.tmp / "backup.lock"),
            "FAKE_LOG": str(self.log),
            "FAKE_DUMP": DUMP,
        }
        env.update(extra_env or {})
        return subprocess.run(
            ["bash", str(self.app / "scripts" / name), *args],
            env=env,
            capture_output=True,
            text=True,
            timeout=60,
        )

    def backups_made(self):
        return sorted(p.name for p in self.backups.glob("buyerly_postgres_*")) if self.backups.exists() else []

    def full_env(self):
        return (
            "# production settings\n"
            'BACKUP_ENCRYPTION_KEY="key with spaces # and hash"\n'
            "export S3_ENDPOINT_URL=https://r2.example.test  # inline comment\n"
            "S3_BUCKET='buyerly-backups'\n"
            "S3_ACCESS_KEY_ID=AKIA_FROM_ENV_FILE\r\n"
            "S3_SECRET_ACCESS_KEY=secret-from-env-file\n"
            "S3_REGION=auto\n"
            "OFFSITE_RETENTION_DAYS=45\n"
        )

    def test_cron_run_encrypts_and_uploads_with_settings_from_env_file(self):
        self.write_env(self.full_env())

        result = self.run_script("backup_db.sh")

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        made = self.backups_made()
        self.assertEqual(len(made), 1)
        self.assertTrue(made[0].endswith(".sql.gz.enc"), made)
        decrypted = subprocess.run(
            ["openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "100000",
             "-pass", "pass:key with spaces # and hash", "-in", str(self.backups / made[0])],
            capture_output=True,
            check=True,
        )
        self.assertEqual(subprocess.run(["gzip", "-dc"], input=decrypted.stdout, capture_output=True).stdout.decode(), DUMP)

        calls = self.log.read_text()
        self.assertIn(f"--upload {self.backups / made[0]} --prune --retention-days 45", calls)
        self.assertIn("S3_ENDPOINT_URL=https://r2.example.test\n", calls)
        self.assertIn("S3_BUCKET=buyerly-backups\n", calls)
        self.assertIn("S3_ACCESS_KEY_ID=AKIA_FROM_ENV_FILE\n", calls)
        self.assertIn("(off-site: uploaded)", result.stdout)
        output = result.stdout + result.stderr
        for secret in ("key with spaces", "AKIA_FROM_ENV_FILE", "secret-from-env-file"):
            self.assertNotIn(secret, output)

    def test_env_file_is_parsed_not_executed(self):
        marker = self.tmp / "executed"
        self.write_env(f"BACKUP_ENCRYPTION_KEY=$(touch {marker})\ntouch {marker}\nFOO=`touch {marker}`\n")

        result = self.run_script("backup_db.sh", "--check-config")

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertFalse(marker.exists())
        self.assertIn("encryption on", result.stdout)

    def test_exported_value_wins_over_env_file(self):
        self.write_env(self.full_env())

        result = self.run_script("backup_db.sh", extra_env={"S3_BUCKET": "bucket-from-environment"})

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("S3_BUCKET=bucket-from-environment\n", self.log.read_text())

    def test_incomplete_offsite_settings_fail_before_any_dump(self):
        self.write_env("BACKUP_ENCRYPTION_KEY=k\nS3_ACCESS_KEY_ID=AKIA\nS3_SECRET_ACCESS_KEY=s\nS3_BUCKET=\n")

        result = self.run_script("backup_db.sh")

        self.assertEqual(result.returncode, 1)
        self.assertIn("these are empty: S3_ENDPOINT_URL S3_BUCKET", result.stderr)
        self.assertIn("no backup was made", result.stderr)
        self.assertEqual(self.backups_made(), [])
        self.assertNotIn("pg_dump", self.log.read_text())

    def test_offsite_without_encryption_key_is_refused(self):
        env = self.full_env().replace('BACKUP_ENCRYPTION_KEY="key with spaces # and hash"', "BACKUP_ENCRYPTION_KEY=")
        self.write_env(env)

        result = self.run_script("backup_db.sh")

        self.assertEqual(result.returncode, 1)
        self.assertIn("off-site upload needs BACKUP_ENCRYPTION_KEY", result.stderr)
        self.assertEqual(self.backups_made(), [])

    def test_example_env_without_s3_keys_makes_a_local_plaintext_backup(self):
        # .env.example fills in the endpoint and bucket but not the keys.
        self.write_env((PROJECT_ROOT / ".env.example").read_text())

        result = self.run_script("backup_db.sh")

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("encryption off (BACKUP_ENCRYPTION_KEY is empty", result.stdout)
        self.assertIn("off-site off", result.stdout)
        self.assertTrue(self.backups_made()[0].endswith(".sql.gz"))
        self.assertNotIn("python3", self.log.read_text())

    def test_missing_explicit_env_file_is_an_error(self):
        result = self.run_script(
            "backup_db.sh", "--check-config", extra_env={"BUYERLY_ENV_FILE": str(self.tmp / "nope.env")}
        )

        self.assertEqual(result.returncode, 1)
        self.assertIn("does not exist", result.stderr)

    def test_bad_retention_is_an_error(self):
        self.write_env(self.full_env().replace("OFFSITE_RETENTION_DAYS=45", "OFFSITE_RETENTION_DAYS=45d"))

        result = self.run_script("backup_db.sh", "--check-config")

        self.assertEqual(result.returncode, 1)
        self.assertIn("OFFSITE_RETENTION_DAYS", result.stderr)

    def test_restore_decrypts_with_key_from_env_file(self):
        self.write_env(self.full_env())
        self.assertEqual(self.run_script("backup_db.sh").returncode, 0)
        archive = self.backups / self.backups_made()[0]

        result = self.run_script("restore_db.sh", "--file", str(archive), "--yes")

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(Path(f"{self.log}.restored").read_text(), DUMP)

    def test_offsite_restore_names_missing_settings(self):
        self.write_env("BACKUP_ENCRYPTION_KEY=k\nS3_BUCKET=b\n")

        result = self.run_script("restore_db.sh", "--download-latest-offsite", "--yes")

        self.assertEqual(result.returncode, 1)
        self.assertIn("S3_ENDPOINT_URL S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY", result.stdout)
        self.assertNotIn("python3", self.log.read_text())

    @unittest.skipIf(os.geteuid() == 0, "the user-crontab branch runs as a normal user")
    def test_cron_job_passes_env_file_and_logs_where_it_can_write(self):
        self.write_env(self.full_env())

        result = self.run_script(
            "setup_backup_cron.sh", extra_env={"APP_DIR": str(self.app), "CRON_PATH": self.path}
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        line = Path(f"{self.log}.crontab").read_text().strip()
        self.assertTrue(line.startswith("0 3 * * * cd "), line)
        self.assertIn(f"BUYERLY_ENV_FILE={self.app}/.env bash scripts/backup_db.sh", line)
        log_file = self.tmp / "home" / ".local" / "state" / "buyerly" / "backup.log"
        self.assertIn(f">> {log_file} 2>&1", line)
        self.assertEqual(stat.S_IMODE(log_file.stat().st_mode), 0o600)
        # The zone is whatever the machine runs in (UTC on CI, EEST on the VPS).
        self.assertIn("03:00 server time (", result.stdout)
        self.assertNotIn("03:00 UTC", result.stdout)

    @unittest.skipIf(os.geteuid() == 0, "the user-crontab branch runs as a normal user")
    def test_cron_job_is_not_installed_with_broken_settings(self):
        self.write_env("S3_ACCESS_KEY_ID=AKIA\n")

        result = self.run_script(
            "setup_backup_cron.sh", extra_env={"APP_DIR": str(self.app), "CRON_PATH": self.path}
        )

        self.assertEqual(result.returncode, 1)
        self.assertIn("the cron job was not installed", result.stderr)
        self.assertFalse(Path(f"{self.log}.crontab").exists())


if __name__ == "__main__":
    unittest.main()
