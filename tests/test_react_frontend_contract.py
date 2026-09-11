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
        cls.adset_row = (
            ROOT / "frontend" / "src" / "components" / "campaigns" / "AdSetRow.tsx"
        ).read_text()
        cls.ad_row = (
            ROOT / "frontend" / "src" / "components" / "campaigns" / "AdRow.tsx"
        ).read_text()
        cls.display_options = (
            ROOT
            / "frontend"
            / "src"
            / "components"
            / "campaigns"
            / "DisplayOptionsPopover.tsx"
        ).read_text()
        cls.button = (ROOT / "frontend" / "src" / "ui" / "Button.tsx").read_text()
        cls.app_store = (
            ROOT / "frontend" / "src" / "store" / "useAppStore.ts"
        ).read_text()
        cls.rules_view = (
            ROOT / "frontend" / "src" / "components" / "rules" / "RulesView.tsx"
        ).read_text()
        cls.rules_lib = (ROOT / "frontend" / "src" / "lib" / "rules.ts").read_text()
        cls.create_rule_modal = (
            ROOT / "frontend" / "src" / "components" / "rules" / "CreateRuleModal.tsx"
        ).read_text()
        cls.rule_selector_popover = (
            ROOT
            / "frontend"
            / "src"
            / "components"
            / "campaigns"
            / "RuleSelectorPopover.tsx"
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
            "hierarchyRequest('campaign')",
            "hierarchyRequest('adset')",
            "hierarchyRequest('ad')",
            "requestGenerationRef",
            "Loading ad accounts…",
            "Loading Ads Manager…",
            "Couldn't load ad accounts",
            "Couldn't load Ads Manager",
            "Zero-activity entities are included",
            "setCampaignFilterTab",
            "LinearFilterButton",
            "LinearFilterMenu",
            "ActiveFilterFormula",
            "DisplayOptionsPopover",
            "readOnly",
        ):
            self.assertIn(contract, self.campaigns_view)

        self.assertNotIn("CampaignRightSidebar", self.campaigns_view)
        self.assertNotIn("toggleCampaignDelivery", self.campaigns_view)
        self.assertNotIn("disabled: true", self.campaigns_view)
        self.assertNotIn("Today · read-only", self.campaigns_view)

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
        self.assertIn("hierarchyAdSetToRow", self.live_campaigns)
        self.assertIn("hierarchyAdToRow", self.live_campaigns)
        self.assertIn("formatDailyBudget(item.daily_budget, item.currency)", self.live_campaigns)
        self.assertIn("roi: '—'", self.live_campaigns)
        self.assertIn("showIdentifier", self.campaign_row)
        self.assertIn("readOnly ? undefined", self.campaign_row)
        self.assertIn("<LinearCheckbox checked={false} hidden />", self.campaign_row)
        self.assertIn("onChange={readOnly ? undefined", self.campaign_row)
        self.assertIn("disabled={readOnly}", self.campaign_row)
        self.assertIn("Campaign controls are not connected yet", self.campaign_row)
        for row in (self.adset_row, self.ad_row):
            self.assertIn("<LinearCheckbox checked={false} hidden />", row)
            self.assertIn("disabled={readOnly}", row)
        self.assertIn("showViewModes={false}", self.display_options)
        self.assertIn("showGrouping={false}", self.display_options)
        self.assertNotIn("Campaign groups", self.display_options)
        self.assertNotIn("'ROI'", self.display_options)
        self.assertIn("--action-primary:", self.tokens)
        self.assertIn("--action-primary-hover:", self.tokens)
        self.assertIn("export const Button", self.button)
        self.assertIn("disabled:cursor-not-allowed", self.button)

    def test_rules_surface_uses_workspace_api_without_production_fixtures(self):
        # The rules store is seeded by the API, never by shipped example rows.
        self.assertIn("rules: [],\n  ruleGroups: [],", self.app_store)
        for fixture in (
            "Auto-Stop High CPA",
            "Scale Winner Budget",
            "Kill Zero-Conversions",
            "Duplicate Winner AdSet",
            "rule-group-safety",
            "rule-group-scaling",
        ):
            self.assertNotIn(fixture, self.app_store)

        for endpoint in ("'/api/presets'", "'/api/rule-groups'"):
            self.assertIn(endpoint, self.rules_lib)

        for contract in (
            "loadRules",
            "Couldn't load rules",
            "No rules yet",
            "rulesMutationError",
        ):
            self.assertIn(contract, self.rules_view)

        # A rule is switched on or off; there is no third runtime state to show.
        self.assertNotIn("'triggered'", self.app_store)

        # The create form may only offer what api/schemas/rules.py accepts.
        for supported in ("'cpl'", "'cpreg'", "'cpp'", "'last_3d'", "'increase_budget'"):
            self.assertIn(supported, self.create_rule_modal)
        for unsupported in (
            "Cost per result",
            "Lifetime spent",
            "Website purchase ROAS",
            "Frequency",
            "37 months",
            "is between",
        ):
            self.assertNotIn(unsupported, self.create_rule_modal)

    def test_rules_screen_has_one_filter_implementation(self):
        # The live Rules screen filters through LinearFilterMenu and
        # rulesFilterClauses. The earlier popover/bar pair was never wired in and
        # carried states the API does not have; nothing should bring it back.
        rules_dir = ROOT / "frontend" / "src" / "components" / "rules"
        for retired in ("RuleFilterPopover.tsx", "ActiveRuleFilterBar.tsx"):
            self.assertFalse((rules_dir / retired).exists(), retired)
        for retired_state in (
            "rulesFilters",
            "isRulesFilterOpen",
            "openRulesFilterWithCategory",
            "clearAllRulesFilters",
        ):
            self.assertNotIn(retired_state, self.app_store)
        self.assertIn("rulesFilterClauses", self.app_store)

    def test_campaign_rule_attachment_is_served_by_the_api(self):
        # Attaching a rule to a campaign writes a scope through the API rather
        # than flipping a local-only map.
        self.assertIn("loadAccountRuleAttachments", self.app_store)
        self.assertIn("assignRuleToAccount", self.app_store)
        self.assertIn("setAttachedRuleScope", self.app_store)
        self.assertIn("detachRuleFromAccount", self.app_store)
        self.assertIn("/scope", self.rules_lib)

        # A rule aimed at the whole account or at single ad sets cannot be
        # silently re-aimed from a per-campaign control.
        self.assertIn("attachedRuleScopes", self.rule_selector_popover)
        self.assertIn("aria-disabled={locked}", self.rule_selector_popover)


if __name__ == "__main__":
    unittest.main()
