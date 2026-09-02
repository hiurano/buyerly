from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]


class TestReactFrontendContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = (ROOT / "frontend" / "src" / "App.tsx").read_text()
        cls.routing = (ROOT / "frontend" / "src" / "lib" / "routing.ts").read_text()
        cls.login = (
            ROOT / "frontend" / "src" / "components" / "auth" / "LoginView.tsx"
        ).read_text()
        cls.create_workspace = (
            ROOT
            / "frontend"
            / "src"
            / "components"
            / "onboarding"
            / "CreateWorkspaceView.tsx"
        ).read_text()
        cls.welcome = (
            ROOT / "frontend" / "src" / "components" / "onboarding" / "WelcomeView.tsx"
        ).read_text()

    def test_login_surface_is_email_only_and_explains_both_credentials(self):
        self.assertIn("Continue with email", self.login)
        self.assertIn("temporary login link and a six-digit code", self.login)
        self.assertIn("Enter code manually", self.login)
        for forbidden in (
            "Continue with Google",
            "Continue with SSO",
            "passkey",
            "Sign up",
            "Don't have an account",
        ):
            self.assertNotIn(forbidden, self.login)

    def test_workspace_creation_and_welcome_have_only_approved_fields(self):
        self.assertIn("Create a workspace", self.create_workspace)
        self.assertIn("Name", self.create_workspace)
        self.assertIn("Set up your profile", self.welcome)
        self.assertIn("Invite teammates", self.welcome)
        self.assertNotIn("Region", self.create_workspace)
        self.assertNotIn("Title", self.welcome)

    def test_router_contains_only_canonical_entry_and_workspace_shapes(self):
        for contract in (
            "parts[0] === 'login'",
            "parts[0] === 'create-workspace'",
            "parts[0] === 'auth'",
            "parts[0] === 'invite'",
            "parts[1] === 'inbox'",
            "parts[1] === 'ads'",
            "parts[1] === 'rules'",
            "parts[1] === 'statistics'",
            "parts[1] === 'settings'",
            "SYSTEM_ROOTS.has(parts[0])",
        ):
            self.assertIn(contract, self.routing)
        self.assertNotIn("'/w/'", self.routing)
        self.assertNotIn('"/w/"', self.routing)
        self.assertIn("<NotFoundView", self.app)


if __name__ == "__main__":
    unittest.main()
