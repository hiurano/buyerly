from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]


class TestReactFrontendContract(unittest.TestCase):
    def test_workspace_routes_scope_api_requests(self):
        api = (ROOT / "frontend/src/lib/api.ts").read_text()
        self.assertIn("const route = parseRoute()", api)
        self.assertIn("headers.set('X-Workspace-Slug', route.workspace)", api)
        self.assertIn("key={desiredScope}", self.app)
        self.assertIn("workspaceScope !== desiredScope", self.app)

    def test_public_typography_is_scoped_to_public_composition(self):
        public_styles = (ROOT / "frontend/public/static/css/legal.css").read_text()
        self.assertIn("var(--site-heading-size)", public_styles)
        self.assertNotIn("--site-heading-size", self.styles)
        self.assertIn("--site-heading-size", self.tokens)
        self.assertNotIn("--site-heading-size:", public_styles)

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
        cls.statistics_view = (
            ROOT
            / "frontend"
            / "src"
            / "components"
            / "statistics"
            / "StatisticsView.tsx"
        ).read_text()
        cls.statistics_model = (
            ROOT
            / "frontend"
            / "src"
            / "components"
            / "statistics"
            / "statisticsModel.ts"
        ).read_text()
        cls.delivery_lib = (
            ROOT / "frontend" / "src" / "lib" / "delivery.ts"
        ).read_text()
        cls.entity_row_cells = (
            ROOT / "frontend" / "src" / "components" / "campaigns" / "EntityRowCells.tsx"
        ).read_text()
        cls.rule_actions = (
            ROOT / "frontend" / "src" / "components" / "rules" / "ruleActions.ts"
        ).read_text()
        cls.recently_deleted_view = (
            ROOT / "frontend" / "src" / "components" / "rules" / "RecentlyDeletedView.tsx"
        ).read_text()
        cls.toast_lib = (ROOT / "frontend" / "src" / "ui" / "toast.ts").read_text()
        cls.undo_history = (
            ROOT / "frontend" / "src" / "lib" / "undoHistory.ts"
        ).read_text()
        cls.trash_lib = (ROOT / "frontend" / "src" / "lib" / "trash.ts").read_text()
        cls.rules_list_view = (
            ROOT / "frontend" / "src" / "components" / "rules" / "RulesListView.tsx"
        ).read_text()
        cls.linear_data_list = (
            ROOT / "frontend" / "src" / "ui" / "LinearDataList.tsx"
        ).read_text()
        cls.campaigns_row_sources = "\n".join(
            (ROOT / "frontend" / "src" / "components" / "campaigns" / name).read_text()
            for name in ("CampaignRow.tsx", "AdSetRow.tsx", "AdRow.tsx", "EntityRowCells.tsx")
        )
        cls.trend_chart = (
            ROOT
            / "frontend"
            / "src"
            / "components"
            / "statistics"
            / "TrendChart.tsx"
        ).read_text()
        cls.ad_accounts_section = (
            ROOT
            / "frontend"
            / "src"
            / "components"
            / "preferences"
            / "AdAccountsSection.tsx"
        ).read_text()
        cls.inbox_view = (
            ROOT / "frontend" / "src" / "components" / "inbox" / "InboxView.tsx"
        ).read_text()
        cls.inbox_item_row = (
            ROOT
            / "frontend"
            / "src"
            / "components"
            / "inbox"
            / "InboxItemRow.tsx"
        ).read_text()
        cls.audit_lib = (ROOT / "frontend" / "src" / "lib" / "audit.ts").read_text()
        cls.sidebar = (
            ROOT / "frontend" / "src" / "components" / "sidebar" / "Sidebar.tsx"
        ).read_text()
        cls.rules_lib = (ROOT / "frontend" / "src" / "lib" / "rules.ts").read_text()
        cls.create_rule_modal = (
            ROOT / "frontend" / "src" / "components" / "rules" / "CreateRuleModal.tsx"
        ).read_text()
        cls.ads_manager_columns = (
            ROOT / "frontend" / "src" / "components" / "campaigns" / "tableColumns.ts"
        ).read_text()
        cls.rule_row = (
            ROOT / "frontend" / "src" / "components" / "rules" / "RuleRow.tsx"
        ).read_text()
        cls.rule_row_menu = (
            ROOT / "frontend" / "src" / "components" / "rules" / "RuleRowMenu.tsx"
        ).read_text()
        cls.rule_card = (
            ROOT / "frontend" / "src" / "components" / "rules" / "RuleCard.tsx"
        ).read_text()
        cls.rule_column = (
            ROOT / "frontend" / "src" / "components" / "rules" / "RuleColumn.tsx"
        ).read_text()
        cls.rule_selector_popover = (
            ROOT
            / "frontend"
            / "src"
            / "components"
            / "campaigns"
            / "RuleSelectorPopover.tsx"
        ).read_text()

    def test_login_surface_is_password_first_with_invite_only_email(self):
        self.assertIn("'/api/auth/login'", self.login)
        self.assertIn('autoComplete="current-password"', self.login)
        self.assertIn("{inviteToken && (", self.login)
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
            "parts[1] === 'ads-manager'",
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
            "Input",
        ):
            self.assertIn(component, self.ui_sources)

        self.assertIn("UI_CONTRACT.md", self.copilot)
        self.assertIn("DESIGN_SYSTEM.md", self.copilot)
        self.assertIn("frontend/src/styles/tokens.css", self.copilot)
        self.assertIn("frontend/src/ui/", self.copilot)
        self.assertNotIn("webapp/css/ui-system.css", self.copilot)

        for contract in (
            self.ui_contract,
            self.design_system,
            self.pull_request_template,
        ):
            self.assertIn("frontend/src/styles/tokens.css", contract)
            self.assertIn("frontend/src/ui/", contract)

        self.assertIn("frontend/public/", self.ui_contract)
        self.assertIn("retired authenticated interface has been removed", self.design_system)

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

        self.assertIn("LinearFacetSidebar", self.campaigns_view)
        self.assertIn("currentView.facets", self.campaigns_view)
        self.assertIn("useCampaignViewFilters", self.campaigns_view)
        self.assertIn("groupView(rows, fields, groupingField)", self.campaigns_view)
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
        # Like Ads Manager, a row shows only the name; the Meta ID lives in the hover hint.
        self.assertIn("hint={`${campaign.name} · ${campaign.identifier}`}", self.campaign_row)
        for row in (self.campaign_row, self.adset_row, self.ad_row):
            self.assertNotIn("subtitle=", row)
        self.assertIn("readOnly ? undefined", self.campaign_row)
        # Delivery is a real write, so the toggle is driven by the control the
        # view hands down. All three levels share one set of leading controls,
        # and a row that cannot be selected keeps the checkbox slot for alignment.
        self.assertIn("<LinearCheckbox checked={false} hidden />", self.entity_row_cells)
        self.assertIn("onChange={delivery ? delivery.onChange : undefined}", self.entity_row_cells)
        self.assertIn("disabled={!delivery}", self.entity_row_cells)
        for row in (self.campaign_row, self.adset_row, self.ad_row):
            self.assertIn("<EntityRowControls", row)
            self.assertIn("delivery={delivery}", row)
        self.assertIn("showViewModes={false}", self.display_options)
        self.assertIn("showGrouping", self.display_options)
        self.assertIn("Account groups", self.display_options)
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

    def test_rule_form_exposes_the_execution_level(self):
        # A rule that pauses a whole campaign must be distinguishable from one
        # that pauses a single ad set, both when creating it and in the list.
        self.assertIn("RULE_LEVEL_LABELS", self.rules_lib)
        # The displayed action carries the level rather than the bare verb.
        self.assertIn("RULE_LEVEL_LABELS[preset.level]", self.rules_lib)
        for contract in ("RuleExecutionLevel", "Applies to:", "changeLevel", "'ad'"):
            self.assertIn(contract, self.create_rule_modal)
        # Budget actions stay on ad sets; the form must not offer them higher up.
        self.assertIn("BUDGET_ACTIONS", self.create_rule_modal)

    def test_a_rule_can_be_edited_and_run_on_chosen_ad_accounts(self):
        # One modal serves both create and edit rather than a second screen.
        for contract in ("editingRuleId", "Edit rule", "Save changes", "loadRuleIntoForm"):
            self.assertIn(contract, self.create_rule_modal)

        # Row actions are built from the shared menu primitives, and the "…"
        # button now has a handler instead of an empty one.
        for contract in (
            "openEditRuleModal",
            "toggleRuleOnAccount",
            "DropdownMenuSub",
            "Run on ad accounts",
        ):
            self.assertIn(contract, self.rule_row_menu)
        self.assertIn("<RuleRowMenu", self.rule_row)
        self.assertNotIn("onClick={(e) => {\n              e.stopPropagation();\n            }}", self.rule_row)

        # Detaching an account must say what it removes before it is clicked.
        self.assertIn("attached_scopes", self.rules_lib)
        self.assertIn("attached_scopes", self.rule_row_menu)

    def test_row_selection_drives_real_bulk_actions(self):
        """A checkbox is shown only where selected rows can actually be acted on."""
        ui = ROOT / "frontend" / "src" / "ui"
        hook = (ui / "useRowSelection.ts").read_text()
        dock = (ui / "SelectionDock.tsx").read_text()
        menu = (ui / "SelectionCommandMenu.tsx").read_text()
        rules_view = self.rules_view

        # One dock, one menu and one keyboard model for every list.
        for view in (self.campaigns_view, self.statistics_view, rules_view):
            for contract in ("useRowSelection(", "<SelectionDock", "<SelectionCommandMenu"):
                self.assertIn(contract, view)
        for key in ("'[data-row-id]:hover'", "key === 'a'", "key === 'x'", "'Escape'", "key === 'k'"):
            self.assertIn(key, hook)
        self.assertIn("onClick={onOpenActions}", dock)
        self.assertIn("onClick={onClear}", dock)
        self.assertIn("Command.Input", menu)
        self.assertFalse((ROOT / "frontend" / "src" / "components" / "selection" / "SelectionDock.tsx").exists())

        # Bulk delivery goes through the audited single-entity endpoint, entity by
        # entity, and reports every outcome instead of a blanket success.
        for contract in ("export async function setDeliveryForMany", "outcome.failed.push",
                         "export async function undoActions", "export function reportBulkDelivery",
                         "export function deliveryHistoryEntry"):
            self.assertIn(contract, self.delivery_lib)
        # The way back reverses the recorded audit rows.
        self.assertIn("await undoActions(reversible, inScope)", self.delivery_lib)
        for view in (self.campaigns_view, self.statistics_view):
            self.assertIn("setDeliveryForMany(", view)
            self.assertIn("pushHistory(deliveryHistoryEntry(", view)
            self.assertIn("reportBulkDelivery(", view)
        # Rules held for review are never switched on in bulk either.
        self.assertIn("setRulesEnabled: async (ids, enabled)", self.app_store)
        self.assertIn("if (enabled && rule.needsReview)", self.app_store)
        self.assertIn("setRulesEnabled(", self.rule_actions)
        self.assertIn("runBulkRulesEnabled(", rules_view)
        # Ctrl+Delete deletes the selection, after the same confirmation.
        self.assertIn("withModifier: true", rules_view)
        self.assertIn("requestDeletion('rule', liveSelection())", rules_view)

        # Selected rows use the Linear selection colours from tokens, not a literal.
        self.assertIn("--row-selected-hover-bg", self.tokens)
        self.assertIn("--checkbox-checked-bg", self.tokens)
        self.assertNotIn("#eab308", (ui / "LinearCheckbox.tsx").read_text())

    def test_entity_tables_share_one_table_and_cell_primitive(self):
        """Ads Manager, Rules and Statistics render one table, not three."""
        for primitive in (
            "export const LinearDataTable",
            "export const LinearDataListGroup",
            "export const LinearDataPrimaryCell",
            "export const LinearDataMetricCell",
            "export const getLinearDataListMinWidth",
        ):
            self.assertIn(primitive, self.linear_data_list)

        for view in (self.campaigns_view, self.rules_list_view, self.statistics_view):
            self.assertIn("<LinearDataTable", view)
            self.assertNotIn("<LinearDataListColumnHeader", view)
        for row in (self.campaign_row, self.adset_row, self.ad_row, self.rule_row, self.statistics_view):
            self.assertIn("<LinearDataPrimaryCell", row)
        for source in (self.campaigns_row_sources, self.statistics_view):
            self.assertIn("<LinearDataMetricCell", source)

        # The Name column and its leading controls line up the same everywhere.
        rules_columns = (
            ROOT / "frontend" / "src" / "components" / "rules" / "tableColumns.ts"
        ).read_text()
        for source in (self.ads_manager_columns, rules_columns, self.statistics_view):
            self.assertIn("linearDataNameColumn(", source)
        self.assertIn("<EntityRowControls", self.statistics_view)

        # Minimum table width has one formula instead of a copy per screen.
        self.assertNotIn("getAdsManagerTableMinWidth", self.ads_manager_columns)
        self.assertNotIn("TABLE_MIN_WIDTH", self.statistics_view)

    def test_campaign_rule_attachment_is_served_by_the_api(self):
        # Attaching a rule to a campaign writes a scope through the API rather
        # than flipping a local-only map.
        self.assertIn("loadAccountRuleAttachments", self.app_store)
        self.assertIn("assignRuleToAccount", self.app_store)
        self.assertIn("setAttachedRuleScope", self.app_store)
        self.assertIn("detachRuleFromAccount", self.app_store)
        self.assertIn("/scope", self.rules_lib)

        # A rule aimed at another level cannot be silently re-aimed from here.
        self.assertIn("attachedRuleScopes", self.rule_selector_popover)
        self.assertIn("aria-disabled={locked}", self.rule_selector_popover)

        # Campaigns and ad sets share one cell and one picker, so the two levels
        # cannot drift apart.
        self.assertIn("RuleAttachmentCell", self.campaign_row)
        self.assertIn("RuleAttachmentCell", self.adset_row)
        self.assertIn('level="campaign"', self.campaign_row)
        self.assertIn('level="adset"', self.adset_row)
        self.assertIn("adSetAttachedRules", self.app_store)
        self.assertIn("toggleRuleForEntity", self.app_store)
        # The Rules column is offered on both levels, never on ads.
        self.assertIn(
            "if (tab === 'campaigns' || tab === 'adsets') {", self.ads_manager_columns
        )

    def test_statistics_uses_workspace_api_without_production_fixtures(self):
        for contract in (
            "apiRequest<MetaAccount[]>('/api/accounts')",
            "/api/analytics/hierarchy?parent_id=",
            "encodeURIComponent(parentId)",
            "const parentId = parent ? parent.id : selectedAccountId;",
            "&level=${queryLevel}&period=${period}",
            "requestGenerationRef",
            "Loading ad accounts…",
            "Loading ${levelLabel.plural}…",
            "Couldn't load ad accounts",
            "Couldn't load Statistics",
            "No ${levelLabel.plural} in this ad account",
            "data_as_of",
            "analytics_fact_store",
            "<Button",
            "Monetary totals are unavailable",
            "Zero-activity entities remain visible",
        ):
            self.assertIn(contract, self.statistics_view)

        for fixture_or_unsupported_control in (
            "Creative Test — Batch 08",
            "Lookalike — Qualified leads",
            "Prospecting — Broad",
            "Retargeting — 30 days",
            "New Offer — Validation",
            "ROAS",
            "28-day baseline",
            "Updated 2 min ago",
            "cplTarget",
            "roasTarget",
        ):
            self.assertNotIn(fixture_or_unsupported_control, self.statistics_view)

    def test_statistics_primary_result_and_decision_layer_stay_derived(self):
        """The decision layer reads live facts; it never invents a target."""
        # The primary result is a semantic role resolved from real conversion
        # volume, not a hard-coded metric for every advertiser.
        for contract in (
            "export function detectPrimaryResult",
            "cost_per_lead",
            "cost_per_registration",
            "cost_per_purchase",
        ):
            self.assertIn(contract, self.statistics_model)

        # A row below the volume floor is undecidable, which is a different
        # statement from performing badly.
        self.assertIn("MIN_RESULTS_FOR_DECISION = 10", self.statistics_model)
        self.assertIn("state: 'insufficient'", self.statistics_model)

        # No stored target means no verdict: the value is reported as is.
        self.assertIn("if (target === null || target <= 0)", self.statistics_model)
        self.assertIn("label: 'No target set'", self.statistics_model)

        # Diagnostics are derived from returned facts and stay off the table.
        self.assertIn("export function buildDiagnostics", self.statistics_model)
        for diagnostic in ("Frequency", "CTR", "CPC", "CPM", "Landing page views"):
            self.assertIn(diagnostic, self.statistics_model)
        for diagnostic_column in (
            "{ id: 'impressions'",
            "{ id: 'clicks'",
            "{ id: 'ctr'",
        ):
            self.assertNotIn(diagnostic_column, self.statistics_view)

        # Drill-down stays in place: the same columns, a deeper parent.
        self.assertIn("aria-label=\"Statistics drill-down\"", self.statistics_view)
        self.assertIn("CHILD_LEVEL", self.statistics_view)

    def test_statistics_compares_only_against_a_baseline_the_server_built(self):
        """Change is a movement, never a verdict, and today refuses to be compared."""
        # The baseline is asked for explicitly and read back from the response.
        self.assertIn("&compare=${comparison}", self.statistics_view)
        self.assertIn("hierarchy?.comparison", self.statistics_view)
        self.assertIn("comparisonMeta?.available ?? false", self.statistics_view)

        # The column exists only while a baseline stands behind it.
        self.assertIn("...(comparisonAvailable", self.statistics_view)
        self.assertIn("label: 'Change'", self.statistics_view)

        # A window containing a day in progress says so, and an impossible
        # comparison reports the server's reason rather than a number.
        self.assertIn("Comparison unavailable.", self.statistics_view)
        self.assertIn("still contains today", self.statistics_view)

        # Movement is written out and carries no decision color of its own.
        self.assertIn("export function changeBetween", self.statistics_model)
        self.assertIn("label: 'No baseline'", self.statistics_model)
        self.assertIn("label: 'From zero'", self.statistics_model)
        # The change note takes a neutral color, so "better than last week" can
        # never be mistaken for "inside target".
        self.assertIn(
            "inline-flex min-w-0 items-center gap-1 text-[var(--text-secondary)]",
            self.statistics_view,
        )

    def test_manual_delivery_actions_are_real_writes_with_a_way_back(self):
        """A control that looks like it stops spending must really stop it."""
        # One client for both screens, aimed at the real endpoints.
        for contract in (
            "/api/entities/${level}/${encodeURIComponent(entityId)}/delivery",
            "/api/entities/${level}/${encodeURIComponent(entityId)}/budget",
            "method: 'POST'",
            "method: 'PATCH'",
            # Undo reuses the audit history rather than a parallel mechanism.
            "/api/audit-events/${auditEventId}/undo",
        ):
            self.assertIn(contract, self.delivery_lib)

        # A large budget step is confirmed before it is sent, not explained after.
        self.assertIn("SIGNIFICANT_BUDGET_CHANGE = 0.25", self.delivery_lib)

        # Statistics acts on the row, and Ctrl+Z is the way back.
        for contract in ("<EntityRowControls", "setEntityDelivery", "setEntityBudget", "undoAction", "pushHistory("):
            self.assertIn(contract, self.statistics_view)

        # Ads Manager no longer ships a toggle that claims to be unfinished.
        self.assertNotIn("controls are not connected yet", self.campaigns_row_sources)
        self.assertIn("delivery ? delivery.onChange : undefined", self.campaigns_row_sources)
        # The local-only delivery flip is gone: it changed the screen, not Meta.
        for dead in ("toggleCampaignDelivery", "toggleAdSetDelivery", "toggleAdDelivery"):
            self.assertNotIn(dead, self.app_store)

    def test_actions_report_the_way_linear_does(self):
        """A change shows on the row; toasts are for deletion, undo/redo and failure."""
        # No screen keeps its own success banner above or under the table.
        for view in (self.campaigns_view, self.statistics_view, self.rules_view):
            for dead in (
                "bulkNotice",
                "deliveryNotice",
                "still shows the previous value",
                "Action undone",
                ">Dismiss<",
            ):
                self.assertNotIn(dead, view)
        self.assertNotIn("next sync", self.delivery_lib)

        # One notification region, mounted once, bottom right, announced politely.
        region = (ROOT / "frontend" / "src" / "ui" / "ToastRegion.tsx").read_text()
        self.assertIn("<ToastRegion />", self.app)
        for contract in ('aria-live="polite"', 'aria-label="Notifications alt+T"', "--toast-offset-bottom"):
            self.assertIn(contract, region)
        self.assertIn("TOAST_DURATION_MS = 8000", self.toast_lib)
        self.assertIn("export type ToastTone = 'success' | 'error' | 'undo' | 'redo'", self.toast_lib)
        # Geometry comes from tokens, measured in Linear.
        for token in ("--toast-width: 384px", "--toast-offset-right: 24px", "--layer-toast", "--action-danger"):
            self.assertIn(token, self.tokens)

        # Ctrl+Z / Ctrl+Shift+Z walk one history per workspace.
        self.assertIn("useUndoShortcuts();", self.app)
        for contract in ("key === 'z' && event.shiftKey", "title: direction === 'undo' ? 'Undo' : 'Redo'", "clearHistory();"):
            self.assertIn(contract, self.undo_history)

        # Deleting is confirmed, reported, restorable, and redo does not ask again.
        confirm = (ROOT / "frontend" / "src" / "ui" / "ConfirmDialog.tsx").read_text()
        self.assertIn("confirmRef.current?.focus()", confirm)
        self.assertIn("<ConfirmDialog", self.rules_view)
        for contract in ("View recently deleted", "restoreMany(itemIds)", "setRuleSelection([])"):
            self.assertIn(contract, self.rule_actions)
        for menu in (self.rule_row_menu, self.rule_card, self.rule_column):
            self.assertIn("requestDeletion(", menu)
            self.assertNotIn("void deleteRule", menu)

        # Recently deleted is its own view over the server's thirty-day trash.
        for contract in ("'/api/deleted-items'", "/api/deleted-items/${itemId}/restore", "TRASH_RETENTION_DAYS = 30"):
            self.assertIn(contract, self.trash_lib)
        self.assertIn("{ id: 'deleted', label: 'Recently deleted' }", self.rules_view)
        self.assertIn("<RecentlyDeletedView />", self.rules_view)
        self.assertIn("event.key !== '#'", self.recently_deleted_view)

    def test_statistics_trend_is_one_series_on_one_axis(self):
        """The trend answers whether a movement lasted, and nothing else."""
        # A fixed window, asked for separately from the reporting period.
        self.assertIn("/api/analytics/timeseries?parent_id=", self.statistics_view)
        self.assertIn("&level=${queryLevel}&days=14", self.statistics_view)

        # No chart occupies the first screen until it is asked for.
        self.assertIn("{trendOpen ? 'Hide trend' : 'Show trend'}", self.statistics_view)
        self.assertIn('aria-controls="statistics-trend-chart"', self.statistics_view)

        # A reported gap breaks the line instead of dropping it to zero.
        self.assertIn("function segmentsOf", self.trend_chart)
        self.assertIn("No data for this day", self.trend_chart)

        # The series colour is its own token, never a decision colour, and the
        # target is the one dashed rule because it is a threshold.
        self.assertIn("var(--statistics-trend-line)", self.trend_chart)
        self.assertNotIn("statistics-state-", self.trend_chart)
        self.assertIn('strokeDasharray="4 4"', self.trend_chart)

        # Every value stays reachable without a pointer.
        self.assertIn("Show values", self.trend_chart)
        self.assertIn("<table", self.trend_chart)
        self.assertIn("ArrowLeft", self.trend_chart)

        # One metric on one axis: no second series and no second scale.
        for forbidden in ("yAxisRight", "secondAxis", "series2"):
            self.assertNotIn(forbidden, self.trend_chart)

    def test_statistics_judges_only_against_the_stored_account_target(self):
        """The verdict comes from the ad account's own declaration, or not at all."""
        # The target is read from the workspace API, never from a local constant.
        self.assertIn("selectedAccount?.target_cost_per_result", self.statistics_view)
        self.assertIn("selectedAccount?.primary_result === 'leads'", self.statistics_view)

        # A stored target names the event it applies to, so it is used only
        # while that event is the one on screen.
        self.assertIn(
            "declaredResultKind && resultKind === declaredResultKind",
            self.statistics_view,
        )

        # Settings is where a target is declared, against the real endpoint.
        for contract in (
            "apiRequest<MetaAccount[]>('/api/accounts')",
            "/cost-target`",
            "method: 'PATCH'",
            "primary_result: nextResult",
            "Couldn't load ad accounts",
            "Connect an ad account",
        ):
            self.assertIn(contract, self.ad_accounts_section)

        # Clearing the declared result clears the target with it.
        self.assertIn("const target = nextResult ? parsed : null;", self.ad_accounts_section)

    def test_inbox_uses_workspace_audit_events_without_notification_fixtures(self):
        for contract in (
            "/api/audit-events?${params.toString()}",
            "/api/audit-events/${eventId}/undo",
            "requestGenerationRef",
            "Loading workspace events…",
            "Couldn't load Inbox",
            "No workspace events yet",
            "No matching events",
            "fetchAuditEvents",
            "undoAuditEvent",
            "<LinearTabs",
            "<LinearDataListStack",
            "<DataState",
            "<Input",
            "<Button",
            "md:w-[400px]",
            "md:hidden",
        ):
            source = self.audit_lib if contract.startswith("/api/") else self.inbox_view
            self.assertIn(contract, source)

        combined = "\n".join((self.inbox_view, self.inbox_item_row, self.app_store))
        for fixture_or_unsupported_control in (
            "Welcome to Buyerly",
            "Automated Rules Engine",
            "Live Campaign Telemetry",
            "Snooze notification",
            "Delete notification",
            "Delete all read",
            "markAllNotificationsAsRead",
            "deleteAllNotifications",
            "deleteAllReadNotifications",
            "toggleNotificationReadStatus",
            "archiveNotification",
            "selectedNotificationId",
            "NotificationItem",
        ):
            self.assertNotIn(fixture_or_unsupported_control, combined)

        self.assertNotIn("notifications", self.app_store)
        self.assertNotIn("unreadCount", self.sidebar)
        self.assertNotIn("before_state", self.inbox_view)
        self.assertNotIn("after_state", self.inbox_view)


if __name__ == "__main__":
    unittest.main()
