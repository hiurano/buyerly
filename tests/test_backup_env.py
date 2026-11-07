"""Backup and restore scripts, run for real in a sandbox.

deploy.sh runs backup_db.sh on the host with no exported settings; Compose
only hands .env to the containers. The backup service runs the same script
inside the image, connected to the database over the network. These tests
run the real scripts in both settings with fake docker/node/pg_dump, so
they need bash, gzip, tar, flock and openssl but no Docker or network. They also cover how a backup is published
(never half-written under its final name) and how an off-site copy keeps its
format on the way back.
"""

import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ("backup_db.sh", "backup_env.sh", "offsite_sync.sh", "restore_db.sh", "restore_uploads.sh")
DUMP = "-- fake dump\nSELECT 1;\n-- PostgreSQL database dump complete\n"

FAKE_DOCKER = """#!/usr/bin/env bash
echo "docker $*" >> "${FAKE_LOG}"
case "$1" in
    inspect) echo running ;;
    exec)
        if [[ " $* " == *" pg_dump "* ]]; then
            printf '%s' "${FAKE_DUMP}"
            exit "${FAKE_PG_DUMP_EXIT:-0}"
        elif [[ " $* " == *" -i "* ]]; then
            cat > "${FAKE_LOG}.restored"
        fi
        ;;
    run)
        mkdir -p "${FAKE_LOG}.uploads"
        tar -xf - -C "${FAKE_LOG}.uploads"
        ;;
esac
"""

# Records what off-site sync (scripts/offsite_sync.sh running node on
# offsite-sync.js) would receive: its arguments and which S3 settings reached
# its environment (names only). A download "fetches" FAKE_REMOTE_FILE under its
# own name, like offsite-sync --dest-dir.
FAKE_NODE = """#!/usr/bin/env bash
shift  # the script path
if [[ " $* " == *" --download-latest --dest-dir "* ]]; then
    cp "${FAKE_REMOTE_FILE}" "${@: -1}/$(basename "${FAKE_REMOTE_FILE}")"
fi
{
    echo "offsite-sync $*"
    for key in S3_ENDPOINT_URL S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_REGION; do
        echo "${key}=${!key:-}"
    done
} >> "${FAKE_LOG}"
exit "${FAKE_OFFSITE_EXIT:-0}"
"""

# The backup service's database tools: libpq clients on PATH, no docker.
FAKE_PG_DUMP = """#!/usr/bin/env bash
echo "pg_dump $*" >> "${FAKE_LOG}"
printf '%s' "${FAKE_DUMP}"
"""

FAKE_PSQL = """#!/usr/bin/env bash
echo "psql $*" >> "${FAKE_LOG}"
"""

FAKE_PG_ISREADY = """#!/usr/bin/env bash
echo "pg_isready $*" >> "${FAKE_LOG}"
exit "${FAKE_PG_ISREADY_EXIT:-0}"
"""


class BackupScriptSandbox(unittest.TestCase):
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
        fakes = (
            ("docker", FAKE_DOCKER),
            ("node", FAKE_NODE),
            ("pg_dump", FAKE_PG_DUMP),
            ("psql", FAKE_PSQL),
            ("pg_isready", FAKE_PG_ISREADY),
        )
        for name, body in fakes:
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
            "OFFSITE_SYNC_JS": str(self.app / "scripts" / "offsite_sync.sh"),
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

    def leftovers(self):
        return sorted(p.name for p in self.backups.glob(".*")) if self.backups.exists() else []

    def restored(self):
        path = Path(f"{self.log}.restored")
        return path.read_text() if path.exists() else None

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


@unittest.skipUnless(shutil.which("openssl"), "openssl is required")
class BackupSettingsTests(BackupScriptSandbox):
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
        self.assertNotIn("offsite-sync", self.log.read_text())

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
        self.assertEqual(self.restored(), DUMP)

    def test_offsite_restore_names_missing_settings(self):
        self.write_env("BACKUP_ENCRYPTION_KEY=k\nS3_BUCKET=b\n")

        result = self.run_script("restore_db.sh", "--download-latest-offsite", "--yes")

        self.assertEqual(result.returncode, 1)
        self.assertIn("S3_ENDPOINT_URL S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY", result.stdout)
        self.assertNotIn("offsite-sync", self.log.read_text())


@unittest.skipUnless(shutil.which("openssl"), "openssl is required")
class BackupPublishingTests(BackupScriptSandbox):
    """A backup appears under its final name only once it reads back whole."""

    def assert_nothing_published(self, result):
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("no backup was published", result.stderr)
        self.assertEqual(self.backups_made(), [])
        self.assertEqual(self.leftovers(), [])
        calls = self.log.read_text()
        self.assertNotIn("last_backup_at", calls)
        self.assertNotIn("offsite-sync", calls)

    def test_pg_dump_failing_midway_publishes_nothing(self):
        self.write_env(self.full_env())

        result = self.run_script(
            "backup_db.sh", extra_env={"FAKE_DUMP": "-- fake dump\nSELECT 1;\n", "FAKE_PG_DUMP_EXIT": "1"}
        )

        self.assert_nothing_published(result)

    def test_dump_without_end_marker_publishes_nothing(self):
        for env_text in ("", self.full_env()):
            with self.subTest(encrypted=bool(env_text)):
                self.write_env(env_text)
                result = self.run_script("backup_db.sh", extra_env={"FAKE_DUMP": "-- fake dump\nSELECT 1;\n"})
                self.assert_nothing_published(result)
                self.assertIn("does not read back as a complete pg_dump", result.stderr)

    def test_leftover_from_a_killed_run_is_removed_and_never_restored(self):
        self.write_env("")
        self.assertEqual(self.run_script("backup_db.sh").returncode, 0)
        good = self.backups / self.backups_made()[0]
        # A run killed with SIGKILL leaves its file behind, newer than the good one.
        stale = self.backups / ".incomplete_buyerly_postgres_20991231_235959.sql.gz"
        stale.write_bytes(b"\x1f\x8b partial")

        result = self.run_script("restore_db.sh", "--latest-local", "--yes")

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(f"Source file:      {good}", result.stdout)
        self.assertEqual(self.restored(), DUMP)
        self.assertEqual(self.run_script("backup_db.sh").returncode, 0)
        self.assertFalse(stale.exists())


@unittest.skipUnless(shutil.which("openssl"), "openssl is required")
class OffsiteRestoreFormatTests(BackupScriptSandbox):
    """An off-site copy is restored by its real format, not an assumed one."""

    def make_backup(self, env_text):
        self.write_env(env_text)
        result = self.run_script("backup_db.sh")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        archive = self.backups / self.backups_made()[0]
        remote = self.tmp / "remote" / archive.name
        remote.parent.mkdir()
        shutil.move(archive, remote)
        return remote

    def restore_offsite(self, remote):
        return self.run_script(
            "restore_db.sh", "--download-latest-offsite", "--yes", extra_env={"FAKE_REMOTE_FILE": str(remote)}
        )

    def test_plain_and_encrypted_offsite_backups_both_restore(self):
        s3_only = "S3_ENDPOINT_URL=https://r2.example.test\nS3_BUCKET=b\nS3_ACCESS_KEY_ID=a\nS3_SECRET_ACCESS_KEY=s\n"
        cases = {
            ".sql.gz": ("", s3_only),
            ".sql.gz.enc": (self.full_env(), self.full_env()),
        }
        for suffix, (backup_env, restore_env) in cases.items():
            with self.subTest(suffix=suffix):
                shutil.rmtree(self.tmp / "remote", ignore_errors=True)
                Path(f"{self.log}.restored").unlink(missing_ok=True)
                remote = self.make_backup(backup_env)
                self.assertTrue(remote.name.endswith(suffix), remote.name)
                self.write_env(restore_env)

                result = self.restore_offsite(remote)

                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn(remote.name, result.stdout)
                self.assertEqual(self.restored(), DUMP)
                # The downloaded copy was private scratch; S3 keeps the original.
                self.assertEqual(self.leftovers(), [])

    def test_plain_archive_named_enc_is_refused_before_the_database(self):
        remote = self.make_backup("")
        mislabeled = remote.with_name(remote.name + ".enc")
        remote.rename(mislabeled)
        self.write_env(self.full_env())

        result = self.restore_offsite(mislabeled)

        self.assertEqual(result.returncode, 1)
        self.assertIn("is named .enc but is not an openssl-encrypted archive", result.stdout)
        self.assertIsNone(self.restored())

    def test_truncated_encrypted_backup_is_refused(self):
        remote = self.make_backup(self.full_env())
        data = remote.read_bytes()
        remote.write_bytes(data[: len(data) // 2])

        result = self.restore_offsite(remote)

        self.assertEqual(result.returncode, 1)
        self.assertIn("Target database was not changed", result.stdout)
        self.assertIsNone(self.restored())

    def test_wrong_key_and_empty_file_are_refused(self):
        remote = self.make_backup(self.full_env())
        empty = self.tmp / "buyerly_postgres_20260101_000000.sql.gz"
        empty.touch()
        cases = {
            "wrong key": (remote, {"BACKUP_ENCRYPTION_KEY": "not the key"}),
            "empty file": (empty, {}),
        }
        for name, (archive, extra_env) in cases.items():
            with self.subTest(name):
                result = self.run_script("restore_db.sh", "--file", str(archive), "--yes", extra_env=extra_env)

                self.assertEqual(result.returncode, 1, result.stdout)
                self.assertIn("Target database was not changed", result.stdout)
                self.assertIsNone(self.restored())


@unittest.skipUnless(shutil.which("openssl"), "openssl is required")
class NightlyBackupServiceTests(BackupScriptSandbox):
    """backup_db.sh as the backup service runs it: database over the network, uploads too."""

    def setUp(self):
        super().setUp()
        self.uploads = self.tmp / "uploads"
        (self.uploads / "avatars").mkdir(parents=True)
        (self.uploads / "workspaces").mkdir()
        (self.uploads / "avatars" / "u1.png").write_bytes(b"\x89PNG avatar")
        (self.uploads / "workspaces" / "w1.webp").write_bytes(b"RIFF logo")
        self.status = self.backups / ".last-success"

    def run_nightly(self, **extra_env):
        return self.run_script("backup_db.sh", extra_env={
            "BACKUP_DB_ACCESS": "network",
            "PGHOST": "db",
            "UPLOADS_DIR": str(self.uploads),
            "BACKUP_STATUS_FILE": str(self.status),
            **extra_env,
        })

    def uploads_made(self):
        return sorted(p.name for p in self.backups.glob("buyerly_uploads_*")) if self.backups.exists() else []

    def test_database_and_uploads_are_archived_uploaded_and_marked_complete(self):
        self.write_env(self.full_env())

        result = self.run_nightly()

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        calls = self.log.read_text()
        self.assertNotIn("docker", calls)
        self.assertIn("pg_dump --username=buyerly --dbname=buyerly", calls)
        self.assertIn("last_backup_at", calls)
        [dump] = self.backups_made()
        [archive] = self.uploads_made()
        self.assertTrue(dump.endswith(".sql.gz.enc"), dump)
        self.assertTrue(archive.endswith(".tar.gz.enc"), archive)
        self.assertIn(f"--upload {self.backups / dump} --prune", calls)
        self.assertIn(f"--kind uploads --upload {self.backups / archive} --prune", calls)
        self.assertTrue(self.status.exists())
        self.assertEqual(self.leftovers(), [".last-success"])

    def test_failed_offsite_upload_keeps_the_archives_but_not_the_success_mark(self):
        self.write_env(self.full_env())

        result = self.run_nightly(FAKE_OFFSITE_EXIT="1")

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("(off-site: FAILED)", result.stdout)
        self.assertEqual(len(self.backups_made()), 1)
        self.assertEqual(len(self.uploads_made()), 1)
        self.assertFalse(self.status.exists())

    def test_unreachable_database_fails_the_run(self):
        self.write_env(self.full_env())

        result = self.run_nightly(FAKE_PG_ISREADY_EXIT="2")

        self.assertEqual(result.returncode, 1)
        self.assertIn("does not accept connections", result.stderr)
        self.assertEqual(self.backups_made(), [])
        self.assertFalse(self.status.exists())

    def test_uploads_come_back_from_the_offsite_copy(self):
        self.write_env(self.full_env())
        self.assertEqual(self.run_nightly().returncode, 0)
        [archive] = self.uploads_made()
        remote = self.tmp / "remote" / archive
        remote.parent.mkdir()
        shutil.move(self.backups / archive, remote)

        result = self.run_script(
            "restore_uploads.sh", "--download-latest-offsite", "--yes",
            extra_env={"FAKE_REMOTE_FILE": str(remote), "RESTORE_IMAGE": "buyerly-app:test"},
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("(2 file(s))", result.stdout)
        restored = Path(f"{self.log}.uploads")
        self.assertEqual((restored / "avatars" / "u1.png").read_bytes(), b"\x89PNG avatar")
        self.assertEqual((restored / "workspaces" / "w1.webp").read_bytes(), b"RIFF logo")
        self.assertIn("--kind uploads --download-latest", self.log.read_text())
        self.assertEqual(self.leftovers(), [".last-success"])

    def test_damaged_uploads_archive_or_wrong_key_never_touches_the_volume(self):
        self.write_env(self.full_env())
        self.assertEqual(self.run_nightly().returncode, 0)
        archive = self.backups / self.uploads_made()[0]
        truncated = self.tmp / archive.name
        truncated.write_bytes(archive.read_bytes()[:40])
        cases = {
            "truncated": (truncated, {}),
            "wrong key": (archive, {"BACKUP_ENCRYPTION_KEY": "not the key"}),
        }
        for name, (path, extra_env) in cases.items():
            with self.subTest(name):
                result = self.run_script(
                    "restore_uploads.sh", "--file", str(path), "--yes",
                    extra_env={"RESTORE_IMAGE": "buyerly-app:test", **extra_env},
                )

                self.assertEqual(result.returncode, 1, result.stdout)
                self.assertIn("Uploads were not changed", result.stdout)
                self.assertNotIn("docker run", self.log.read_text())


if __name__ == "__main__":
    unittest.main()
