import ipaddress
import re
import subprocess
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]

# The repository is public: server addresses and personal mailboxes stay in
# GitHub Secrets and the server .env. Docs use placeholders such as <VPS_HOST>.
IPV4 = re.compile(r"(?<![\w.])(\d{1,3}(?:\.\d{1,3}){3})(?![\w.])")
PERSONAL_EMAIL = re.compile(
    r"[\w.+-]+@(?:gmail|googlemail|outlook|hotmail|live|icloud|proton|protonmail|pm|yandex|ya|mail|bk|inbox|list)"
    r"\.(?:com|me|ru|ch)\b",
    re.I,
)


def tracked_text_files():
    names = subprocess.run(
        ["git", "ls-files", "-z"], cwd=PROJECT_ROOT, capture_output=True, check=True
    ).stdout.decode().split("\0")
    for name in filter(None, names):
        path = PROJECT_ROOT / name
        if not path.is_file():
            continue
        try:
            yield name, path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue


class TestPublicRepoHygiene(unittest.TestCase):
    def test_no_public_ip_addresses_or_personal_emails(self):
        found = []
        for name, text in tracked_text_files():
            for number, line in enumerate(text.splitlines(), 1):
                for candidate in IPV4.findall(line):
                    try:
                        address = ipaddress.ip_address(candidate)
                    except ValueError:
                        continue
                    if address.is_global:
                        found.append(f"{name}:{number}: {candidate}")
                for email in PERSONAL_EMAIL.findall(line):
                    found.append(f"{name}:{number}: {email}")
        self.assertEqual(found, [])

    def test_working_notes_stay_out_of_the_repo(self):
        for retired in ("docs/archive", "implementation_plan.md", "docs/PROGRESS.md"):
            self.assertFalse((PROJECT_ROOT / retired).exists(), retired)


if __name__ == "__main__":
    unittest.main()
