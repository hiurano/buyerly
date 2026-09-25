import unittest
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit

from api.server import create_app


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class TestDocumentationContract(unittest.TestCase):
    def test_api_reference_lists_every_public_http_operation(self):
        api_reference = (PROJECT_ROOT / "docs" / "API.md").read_text(encoding="utf-8")
        schema = create_app().openapi()

        missing = []
        for path, operations in schema["paths"].items():
            if not path.startswith("/api/"):
                continue
            for method in operations:
                if method.upper() not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
                    continue
                signature = f"{method.upper()} {path}"
                if signature not in api_reference:
                    missing.append(signature)

        self.assertEqual(missing, [], f"API.md is missing operations: {missing}")

    def test_readme_links_the_supported_document_set(self):
        readme = (PROJECT_ROOT / "README.md").read_text(encoding="utf-8")
        for path in (
            "docs/DESIGN_SYSTEM.md",
            "docs/ARCHITECTURE.md",
            "docs/INFORMATION_ARCHITECTURE.md",
            "docs/API.md",
            "docs/DEPLOYMENT.md",
            "docs/DECISIONS.md",
            "docs/PRODUCT_BACKLOG.md",
            "docs/FACEBOOK_AUTHORIZATION_PLAN.md",
            "docs/REMAINING_PRODUCT_WORK.md",
        ):
            self.assertIn(path, readme)

    def test_current_documentation_links_resolve(self):
        # Historical snapshots can refer to retired source files. Check current
        # navigation and the archive index, without revalidating old proposals.
        documents = [PROJECT_ROOT / "README.md", PROJECT_ROOT / "CHANGELOG.md"]
        documents += list((PROJECT_ROOT / "docs").glob("*.md"))
        documents += list((PROJECT_ROOT / "docs" / "branding").rglob("*.md"))
        documents.append(PROJECT_ROOT / "docs" / "archive" / "README.md")
        missing = []
        for document in documents:
            content = re.sub(r"```.*?```", "", document.read_text(), flags=re.S)
            for target in re.findall(r"\]\(([^\s)]+)\)", content):
                url = urlsplit(target)
                if url.scheme or url.netloc or not url.path or url.path.startswith("/"):
                    continue
                if not (document.parent / unquote(url.path)).exists():
                    missing.append(f"{document.relative_to(PROJECT_ROOT)}: {target}")
        self.assertEqual(missing, [])

    def test_readme_directs_tests_to_cloud_and_changelog_has_one_unreleased(self):
        readme = (PROJECT_ROOT / "README.md").read_text()
        self.assertIn("gh run view <run-id> --log-failed", readme)
        self.assertNotIn("unittest discover", readme)
        changelog = (PROJECT_ROOT / "CHANGELOG.md").read_text()
        self.assertEqual(changelog.count("## [Unreleased]"), 1)

    def test_design_system_documents_tokens_components_and_migration(self):
        design_system = (PROJECT_ROOT / "docs" / "DESIGN_SYSTEM.md").read_text(
            encoding="utf-8"
        )
        for contract in (
            "## Tokens",
            "## Components",
            "## Current production screens",
            "## Migration map",
            "Button",
            "IconButton",
            "EmptyState",
            "Skeleton",
            "### Ads Manager",
            "### Rules",
            "### Statistics",
            "frontend/src/styles/tokens.css",
            "frontend/src/ui/",
        ):
            self.assertIn(contract, design_system)

    def test_information_architecture_contract(self):
        ia = (PROJECT_ROOT / "docs" / "INFORMATION_ARCHITECTURE.md").read_text(encoding="utf-8")
        for contract in (
            "## Jobs-to-be-done",
            "## Канонические URL",
            "## Авторизация и первый вход",
            "## Терминология",
            "## Роли и видимость",
            "## Локализация",
            "## Длинные списки",
            "## Definition of Done",
            "/login",
            "/auth/email/verify?token=…",
            "/create-workspace",
            "/{workspace}/inbox",
            "/{workspace}/ads-manager/campaigns",
            "/{workspace}/rules",
            "/{workspace}/statistics",
            "Admin",
            "Buyer",
            "Viewer",
        ):
            self.assertIn(contract, ia)
        self.assertIn("Зарезервированы только корневые сегменты", ia)
        self.assertNotIn("Совместимые aliases", ia)



if __name__ == "__main__":
    unittest.main()
