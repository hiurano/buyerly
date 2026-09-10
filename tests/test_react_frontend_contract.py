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
        cls.compose = (ROOT / "docker-compose.yml").read_text()
        cls.dockerfile = (ROOT / "frontend" / "Dockerfile").read_text()
        cls.main = (ROOT / "frontend" / "src" / "main.tsx").read_text()
        cls.styles = (
            ROOT / "frontend" / "src" / "styles" / "index.css"
        ).read_text()
        cls.tokens = (
            ROOT / "frontend" / "src" / "styles" / "tokens.css"
        ).read_text()
        cls.ui_sources = "\n".join(
            path.read_text()
            for path in sorted((ROOT / "frontend" / "src" / "ui").glob("*.tsx"))
        )
        cls.agents = (ROOT / "AGENTS.md").read_text()
        cls.claude = (ROOT / "CLAUDE.md").read_text()
        cls.copilot = (ROOT / ".github" / "copilot-instructions.md").read_text()
        cls.pull_request_template = (
            ROOT / ".github" / "pull_request_template.md"
        ).read_text()
        cls.ui_contract = (ROOT / "docs" / "UI_CONTRACT.md").read_text()
        cls.design_system = (ROOT / "docs" / "DESIGN_SYSTEM.md").read_text()
        cls.campaigns_view = (
            ROOT
            / "frontend"
            / "src"
            / "components"
            / "campaigns"
            / "CampaignsView.tsx"
        ).read_text()
        cls.live_campaigns = (
            ROOT
            / "frontend"
            / "src"
            / "components"
            / "campaigns"
            / "liveCampaigns.ts"
        ).read_text()
        cls.campaign_row = (
            ROOT
            / "frontend"
            / "src"
            / "components"
            / "campaigns"
            / "CampaignRow.tsx"
        ).read_text()
        cls.button = (ROOT / "frontend" / "src" / "ui" / "Button.tsx").read_text()
        cls.app_store = (
            ROOT / "frontend" / "src" / "store" / "useAppStore.ts"
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

    def test_production_ui_contract_points_to_the_react_runtime(self):
        self.assertIn("dockerfile: frontend/Dockerfile", self.compose)
        self.assertIn("COPY frontend/src ./src", self.dockerfile)
        self.assertIn("COPY --from=build /app/dist", self.dockerfile)
        self.assertIn("import './styles/index.css'", self.main)
        self.assertTrue(self.styles.startswith("@import './tokens.css';"))

        for token in (
            "--font-regular:",
            "--sidebar-width:",
            "--control-border-radius:",
            "--text-primary:",
        ):
            self.assertIn(token, self.tokens)

        for component in (
            "LinearTabs",
            "LinearDataList",
            "LinearCheckbox",
            "LinearToggle",
            "DropdownMenu",
            "ContextMenu",
            "Tooltip",
        ):
            self.assertIn(component, self.ui_sources)

        for instructions in (self.agents, self.claude, self.copilot):
            self.assertIn("UI_CONTRACT.md", instructions)
            self.assertIn("DESIGN_SYSTEM.md", instructions)
            self.assertIn("frontend/src/styles/tokens.css", instructions)
            self.assertIn("frontend/src/ui/", instructions)
            self.assertNotIn("webapp/css/ui-system.css", instructions)

        for contract in (
            self.ui_contract,
            self.design_system,
            self.pull_request_template,
        ):
            self.assertIn("frontend/src/styles/tokens.css", contract)
            self.assertIn("frontend/src/ui/", contract)

        self.assertIn("not the authenticated production application", self.ui_contract)
        self.assertIn("legacy authenticated UI", self.design_system)

    def test_ads_manager_uses_workspace_api_without_production_fixtures(self):
        for contract in (
            "apiRequest<MetaAccount[]>('/api/accounts')",
            "/api/analytics/hierarchy?parent_id=",
            "encodeURIComponent(selectedAccountId)",
            "&level=campaign&period=today",
            "requestGenerationRef",
            "Loading ad accounts…",
            "Loading campaigns…",
            "Couldn't load ad accounts",
            "Couldn't load campaigns",
            "No campaigns in this ad account",
            "Campaigns with zero activity today are included",
            "readOnly",
        ):
            self.assertIn(contract, self.campaigns_view)

        self.assertNotIn("CampaignRightSidebar", self.campaigns_view)
        self.assertNotIn("toggleCampaignDelivery", self.campaigns_view)
        self.assertIn("{ id: 'adsets', label: 'Ad sets', disabled: true }", self.campaigns_view)
        self.assertIn("{ id: 'ads', label: 'Ads', disabled: true }", self.campaigns_view)

        campaign_path = self.campaigns_view + self.live_campaigns
        for fixture in (
            "LuckySpin",
            "RoyalBet",
            "NeonSlots",
            "AcePlay",
            "campaign-group-testing",
            "campaign-group-scale",
            "campaign-group-watchlist",
        ):
            self.assertNotIn(fixture, campaign_path)

        self.assertIn(
            "campaigns: [],\n  campaignGroups: [],\n  adSets: [],\n  ads: [],",
            self.app_store,
        )
        self.assertIn("campaignAttachedRules: {},", self.app_store)

        self.assertIn("campaignDelivery(item)", self.live_campaigns)
        self.assertIn("formatDailyBudget(item.daily_budget, item.currency)", self.live_campaigns)
        self.assertIn("roi: '—'", self.live_campaigns)
        self.assertIn("showIdentifier", self.campaign_row)
        self.assertIn("readOnly ? undefined", self.campaign_row)
        self.assertIn("LinearLabelPill label={campaign.statusLabel}", self.campaign_row)
        self.assertIn("status: true", self.campaigns_view)
        self.assertIn("budget: true", self.campaigns_view)
        self.assertIn("--action-primary:", self.tokens)
        self.assertIn("--action-primary-hover:", self.tokens)
        self.assertIn("export const Button", self.button)
        self.assertIn("disabled:cursor-not-allowed", self.button)


if __name__ == "__main__":
    unittest.main()
