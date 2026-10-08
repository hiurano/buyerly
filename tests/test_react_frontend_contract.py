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
        cls.inbox_lib = (ROOT / "frontend" / "src" / "lib" / "inbox.ts").read_text()
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

    def test_login_surface_follows_linear_with_email_first_and_password_second(self):
        self.assertIn("'/api/auth/login'", self.login)
        self.assertIn('autoComplete="current-password"', self.login)
        self.assertIn("Log in to Buyerly", self.login)
        self.assertIn("Continue with email", self.login)
        self.assertIn("Log in with password", self.login)
        self.assertIn("We’ve sent you a temporary login link.", self.login)
        self.assertIn("Enter code manually", self.login)
        self.assertIn("Continue with login code", self.login)
        self.assertNotIn("{inviteToken && (", self.login)
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
            "parts[1] === 'settings'",
            "SYSTEM_ROOTS.has(parts[0])",
        ):
            self.assertIn(contract, self.routing)
        # Statistics was removed: no route, no screen.
        self.assertNotIn("statistics", self.routing)
        self.assertFalse((ROOT / "frontend" / "src" / "components" / "statistics").exists())
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

        self.assertIn("<DetailsFacets", self.campaigns_view)
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

        # Refreshing after a mutation must not swap the list for "Loading rules…".
        self.assertIn(
            "if (get().rulesLoadState !== 'ready') set({ rulesLoadState: 'loading'",
            self.app_store,
        )

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

    def test_every_switch_is_the_one_linear_toggle(self):
        # One switch for the whole app (#263): LinearToggle in two sizes, coloured
        # by tokens. A hand-rolled role="switch" elsewhere would drift again.
        src = ROOT / "frontend" / "src"
        toggle = src / "ui" / "LinearToggle.tsx"
        for path in sorted(src.rglob("*.tsx")):
            if path == toggle:
                continue
            self.assertNotIn('role="switch"', path.read_text(), path.relative_to(ROOT))
        self.assertNotIn("linear-display-switch", self.styles)
        # One size everywhere, as in Linear's Display options.
        self.assertNotIn("data-size", toggle.read_text())
        self.assertIn("--toggle-width: 22px;", self.styles)
        for token in (
            "--toggle-checked-bg:",
            "--toggle-checked-hover-bg:",
            "--toggle-unchecked-bg:",
            "--toggle-unchecked-hover-bg:",
            "--toggle-knob:",
        ):
            self.assertIn(token, self.tokens)
        self.assertIn("--toggle-checked-bg: #f5b800;", self.tokens)

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

    def test_the_rule_editor_sets_how_often_a_rule_may_repeat(self):
        # New rules were saved with cooldown 0 and no way to change it (#194):
        # a budget rule compounded on every check and a notification repeated.
        for contract in (
            "Repeat:",
            "REPEAT_INTERVALS",
            "DEFAULT_REPEAT_MINUTES = 1440",
            "setRepeatMinutes(preset.cooldown_minutes)",
            "cooldown_minutes: repeatMinutes",
        ):
            self.assertIn(contract, self.create_rule_modal)
        self.assertNotIn("preset.cooldown_minutes : 0", self.create_rule_modal)

    def test_row_selection_drives_real_bulk_actions(self):
        """A checkbox is shown only where selected rows can actually be acted on."""
        ui = ROOT / "frontend" / "src" / "ui"
        hook = (ui / "useRowSelection.ts").read_text()
        dock = (ui / "SelectionDock.tsx").read_text()
        menu = (ui / "SelectionCommandMenu.tsx").read_text()
        rules_view = self.rules_view

        # One dock, one menu and one keyboard model for every list.
        for view in (self.campaigns_view, rules_view):
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
        self.assertIn("setDeliveryForMany(", self.campaigns_view)
        self.assertIn("pushHistory(deliveryHistoryEntry(", self.campaigns_view)
        self.assertIn("reportBulkDelivery(", self.campaigns_view)
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
        """Ads Manager and Rules render one table, not two."""
        for primitive in (
            "export const LinearDataTable",
            "export const LinearDataListGroup",
            "export const LinearDataPrimaryCell",
            "export const LinearDataMetricCell",
            "export const getLinearDataListMinWidth",
        ):
            self.assertIn(primitive, self.linear_data_list)

        for view in (self.campaigns_view, self.rules_list_view):
            self.assertIn("<LinearDataTable", view)
            self.assertNotIn("<LinearDataListColumnHeader", view)
        for row in (self.campaign_row, self.adset_row, self.ad_row, self.rule_row):
            self.assertIn("<LinearDataPrimaryCell", row)
        self.assertIn("<LinearDataMetricCell", self.campaigns_row_sources)

        # The Name column and its leading controls line up the same everywhere.
        rules_columns = (
            ROOT / "frontend" / "src" / "components" / "rules" / "tableColumns.ts"
        ).read_text()
        for source in (self.ads_manager_columns, rules_columns):
            self.assertIn("linearDataNameColumn(", source)

        # Minimum table width has one formula instead of a copy per screen.
        self.assertNotIn("getAdsManagerTableMinWidth", self.ads_manager_columns)

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
        self.assertIn("toggleRuleForEntities", self.app_store)
        # Ads Manager shows the column, and a selection can apply a rule to
        # every selected row, as Meta's "Apply rule to" (#320).
        self.assertNotIn("rules: false", self.campaigns_view)
        self.assertIn("label: 'Apply rule…'", self.campaigns_view)
        self.assertIn("entityIds={selectedRowIds}", self.campaigns_view)
        workflow = (ROOT / ".github" / "workflows" / "deploy.yml").read_text()
        self.assertIn("node ../scripts/rules-attach-browser.mjs", workflow)
        # The Rules column is offered on both levels, never on ads.
        self.assertIn(
            "if (tab === 'campaigns' || tab === 'adsets') {", self.ads_manager_columns
        )

    def test_manual_delivery_actions_are_real_writes_with_a_way_back(self):
        """A control that looks like it stops spending must really stop it."""
        # One client, aimed at the real endpoint.
        for contract in (
            "/api/entities/${level}/${encodeURIComponent(entityId)}/delivery",
            "method: 'POST'",
            # Undo reuses the audit history rather than a parallel mechanism.
            "/api/audit-events/${auditEventId}/undo",
        ):
            self.assertIn(contract, self.delivery_lib)

        # Ads Manager acts on the row, and Ctrl+Z is the way back.
        for contract in ("setEntityDelivery", "pushHistory("):
            self.assertIn(contract, self.campaigns_view)

        # Ads Manager no longer ships a toggle that claims to be unfinished.
        self.assertNotIn("controls are not connected yet", self.campaigns_row_sources)
        self.assertIn("delivery ? delivery.onChange : undefined", self.campaigns_row_sources)
        # The local-only delivery flip is gone: it changed the screen, not Meta.
        for dead in ("toggleCampaignDelivery", "toggleAdSetDelivery", "toggleAdDelivery"):
            self.assertNotIn(dead, self.app_store)

    def test_actions_report_the_way_linear_does(self):
        """A change shows on the row; toasts are for deletion, undo/redo and failure."""
        # No screen keeps its own success banner above or under the table.
        for view in (self.campaigns_view, self.rules_view):
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

    def test_inbox_is_linear_notifications_over_workspace_events(self):
        # Linear's Inbox: per-person read, delete and snooze over the shared
        # audit events, with Undo still coming from the audit API.
        for contract in (
            "/api/inbox?${params.toString()}",
            "/api/inbox/${eventId}/read",
            "/api/inbox/${eventId}/delete",
            "/api/inbox/${eventId}/snooze",
            "/api/inbox/delete-all-read",
            "/api/inbox/unread-count",
        ):
            self.assertIn(contract, self.inbox_lib)
        for contract in (
            "requestGenerationRef",
            "Couldn't load Inbox",
            "No unreads",
            "Show all notifications",
            "No notification selected",
            "unread notification",
            "Delete all read",
            "Go to settings",
            'aria-label="Show unreads only"',
            'aria-label="Display options"',
            'aria-label="Snooze notification"',
            'aria-label="Delete notification"',
            "undoAuditEvent",
            "md:hidden",
        ):
            self.assertIn(contract, self.inbox_view)
        for contract in ("Mark as read", "Mark as unread", "Delete notification", "Snooze", "--inbox-unread-dot"):
            self.assertIn(contract, self.inbox_item_row)
        self.assertIn("inboxUnreadCount", self.sidebar)
        for contract in ("fetchInboxFacets", "InboxFilterBar", "encodeInboxFilter", "Filter notifications by…"):
            self.assertIn(contract, self.inbox_view)
        self.assertIn("/api/inbox/facets", self.inbox_lib)

        # Linear's Inbox header has no search, status tabs or pages.
        for removed in ("<LinearTabs", "Search workspace events", "Workspace activity", "Previous", "total_pages"):
            self.assertNotIn(removed, self.inbox_view)
        self.assertNotIn("before_state", self.inbox_view)
        self.assertNotIn("after_state", self.inbox_view)

    def test_inbox_names_events_in_plain_words(self):
        # A stop candidate, a cooldown skip and the stop itself all carry action
        # STOP, so the title comes from the event type; the row names the entity.
        for contract in (
            "AUDIT_EVENT_TITLES[event.event_type]",
            "STOP_CONFIRMATION_STARTED: 'Rechecking before turning off'",
            "STOP: 'Turned off'",
            "NOTIFY_ONLY: 'Rule alert'",
            "MANUAL_PAUSE: 'Turned off manually'",
            "UNDO_ACTION: 'Undone'",
        ):
            self.assertIn(contract, self.audit_lib)
        self.assertIn("auditEventSummary(item)", self.inbox_item_row)

    def test_search_page_promises_only_what_it_finds_and_opens(self):
        """#310: search is Linear's page, not a menu; #311: Ctrl/Cmd+K runs commands and, from two letters, shows Quick results."""
        src = ROOT / "frontend" / "src"
        menu = (src / "components" / "command" / "CommandMenu.tsx").read_text()
        page = (src / "components" / "search" / "SearchView.tsx").read_text()
        opener = (src / "components" / "search" / "openSearchPage.ts").read_text()
        search = (src / "lib" / "search.ts").read_text()
        routing = (src / "lib" / "routing.ts").read_text()
        reveal = (src / "ui" / "useRevealRow.ts").read_text()
        header = (src / "components" / "sidebar" / "SidebarHeader.tsx").read_text()
        workflow = (ROOT / ".github" / "workflows" / "deploy.yml").read_text()

        # A page with its own address, its query and tab in it, and the tab title Linear gives it.
        self.assertIn("parts[1] === 'search'", routing)
        self.assertIn("return `/${workspace}/search", search)
        for key in ("'q'", "'type'", "'status'", "'account'", "'order'", "'includeDeleted'"):
            self.assertIn(key, search)
        self.assertIn("Search: ${query}", search)
        self.assertIn("searchPageTitle(window.location.search)", self.app)
        self.assertIn("<SearchView workspace={workspace}", self.app)

        # A real source scoped by the address, asked on Enter, with its states in words.
        self.assertIn("/api/search?", search)
        self.assertIn("searchWorkspace(applied, controller.signal)", page)
        self.assertIn("onSubmit={(event) => {", page)
        for state in (
            "Recent searches",
            "Clear History",
            "Find campaigns, ad sets, ads, rules and ad accounts.",
            "Searching ${workspace.name}…",
            "Couldn't search ${workspace.name}.",
            'No results found for "${current.response.query}"',
            "Retry search",
            "Most relevant",
            "Last updated",
            "Include deleted",
            "Add Filter…",
        ):
            self.assertIn(state, page)
        for tab in ("'All'", "'Campaigns'", "'Ad sets'", "'Ads'", "'Rules'", "'Ad accounts'"):
            self.assertIn(tab, search)
        # Every result opens somewhere: its record's address.
        self.assertIn("searchResultPath(slug, result)", page)
        for path in ("/ads-manager/", "/rules/", "?account="):
            self.assertIn(path, search)
        # The first Esc closes the preview, the second goes back where search was opened from.
        self.assertIn("if (previewOpen) setPreviewOpen(false);", page)
        self.assertIn("takeSearchReturnPath()", page)
        self.assertIn("rememberSearchReturnPath(", opener)

        # `/` and the sidebar open the page; the old search window is gone.
        self.assertIn("onClick={openSearchPage}", header)
        self.assertIn("openSearchPage();", menu)
        self.assertNotIn("mode === 'search'", menu)
        self.assertIn("'Search workspace…'", menu)
        # #311: as in Linear, the command menu also finds records — from two letters, under its
        # commands, through the same search — and hands the words on to the search page.
        self.assertIn("const QUICK_RESULTS_MIN_LENGTH = 2;", menu)
        self.assertIn("searchWorkspace(", menu)
        self.assertIn('Quick results for "${text}"', menu)
        for words in ("'Search entire workspace'", "'No results found'", "'Go to advanced search'"):
            self.assertIn(words, menu)
        self.assertIn("searchPagePath(slug, { query: text", menu)
        self.assertIn("searchResultPath(slug, result)", menu)

        # Esc is the command menu's own dismissal; focus goes back to what opened it.
        self.assertIn("<Dialog.Root open={open} onOpenChange={(next) => setCommandMenuOpen(next)}>", menu)
        self.assertIn("onCloseAutoFocus", menu)
        self.assertIn("returnFocusTo", menu)

        # `/` is text in a field; Ctrl/Cmd+K works anywhere but leaves a selection its menu.
        self.assertIn("isTypingTarget(event.target)", menu)
        self.assertIn("target.isContentEditable", menu)
        self.assertIn("HTMLTextAreaElement", menu)
        self.assertIn("event.defaultPrevented", menu)

        # One command menu control; record addresses open their rows.
        self.assertIn("COMMAND_MENU_CLASSES", menu)
        self.assertIn("export const COMMAND_MENU_CLASSES", (src / "ui" / "SelectionCommandMenu.tsx").read_text())
        self.assertIn("[data-row-id=", reveal)
        for view in (self.campaigns_view, self.rules_view):
            self.assertIn("useRevealRow({", view)
        self.assertIn("navigationKey={locationVersion}", self.app)
        self.assertIn("data-row-id={rule.id}", self.rule_card)
        self.assertIn("node ../scripts/command-menu-browser.mjs", workflow)
        self.assertIn("node ../scripts/search-page-browser.mjs", workflow)

    def test_screens_reflow_on_small_screens(self):
        """Rules, Ads Manager and Inbox at 390px: details over the list, touch-sized headers (#286)."""
        workflow = (ROOT / ".github" / "workflows" / "deploy.yml").read_text()
        self.assertIn("node ../scripts/mobile-screens-browser.mjs", workflow)
        for view in (self.campaigns_view, self.rules_view):
            self.assertIn("collapseOverflow", view)
        tabs = (ROOT / "frontend" / "src" / "ui" / "LinearTabs.tsx").read_text()
        self.assertIn("more`}", tabs)
        self.assertIn(".linear-header-target", self.styles)
        self.assertNotIn("Mobile is partial", self.ui_contract)
        self.assertNotIn("no screen is described as mobile-ready", self.design_system)

    def test_one_details_pane_for_every_view(self):
        """Ads Manager and Rules share Linear's details pane and quick-filter tabs (#367)."""
        ui = ROOT / "frontend" / "src" / "ui"
        pane = (ui / "DetailsPane.tsx").read_text()
        model = (ui / "detailsPaneModel.ts").read_text()
        workflow = (ROOT / ".github" / "workflows" / "deploy.yml").read_text()
        for view, pane_id in ((self.campaigns_view, "adsManager"), (self.rules_view, "rules")):
            self.assertIn(f'<DetailsPaneLayout pane="{pane_id}"', view)
            self.assertIn(f'<DetailsPaneToggle pane="{pane_id}"', view)
            self.assertIn("<DetailsFacets", view)
        for gone in ("LinearFacetSidebar.tsx", "DetailsSheet.tsx"):
            self.assertFalse((ui / gone).exists(), gone)
        self.assertFalse((ROOT / "frontend" / "src" / "components" / "rules" / "RuleRightSidebar.tsx").exists())
        # Linear's spring and widths; both panes start closed.
        self.assertIn("tension: 1000, friction: 40, mass: 0.1", model)
        self.assertIn("adsManager: { open: false, width: null }", model)
        self.assertIn("DETAILS_PANE_OVERLAY_QUERY", pane)
        # One shortcut for the view on screen, not a pane per view.
        self.assertIn("event.code === 'KeyI'", self.app)
        self.assertIn("toggleDetailsPane(pane)", self.app)
        self.assertNotIn("toggleRightSidebar", self.app)
        self.assertNotIn("toggleRulesRightSidebar", self.rules_view)
        self.assertIn("node scripts/check-details-pane.cjs", workflow)
        self.assertIn("node ../scripts/details-pane-browser.mjs", workflow)


if __name__ == "__main__":
    unittest.main()
