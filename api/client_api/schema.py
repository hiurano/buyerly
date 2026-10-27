"""The web client's GraphQL schema, as Linear's client API (#509).

Mutations change the synced models; the client learns their effect from sync, so each returns
`success` and `lastSyncId` (Linear's payload) plus the changed record as the matching REST route
returns it. Queries are the reads sync does not carry: search, the Meta Ads hierarchy and its
insights, the audit log and Inbox pages, previews and lists that are not synced models.

Every field runs a REST route's handler through `bridge.run`, with the route's permission checks,
validation and response model, so a field may do exactly what its route may (tests/test_client_api.py
holds every field to its route). Records are `JSON`, in the routes' snake_case shapes, which are
also the synced models' fields.
"""

from typing import Optional

import strawberry
from strawberry.scalars import JSON
from strawberry.types import Info

from api import meta_oauth
from api.client_api.bridge import current_sync_id, route_of, run
from api.routers import (
    account_notifications,
    accounts,
    adsets,
    analytics,
    audit,
    auth,
    delivery,
    favorites,
    members,
    onboarding,
    rules,
    search,
    teams,
    telegram,
    trash,
    views,
    workspaces,
)


def _route(module, endpoint):
    return route_of(module.router, endpoint)


# Every GraphQL field and the route it runs; tests/test_client_api.py checks each against its route.
ROUTES = {}


def _routed(name: str, module, endpoint):
    ROUTES[name] = _route(module, endpoint)
    return ROUTES[name]


def _payload(name: str, entity: Optional[str]):
    """Linear's `<Model>Payload`: whether it worked, the sync id to wait for, and the record."""
    annotations = {"success": bool, "last_sync_id": float}
    namespace = {"__annotations__": annotations, "__module__": __name__}
    if entity:
        annotations[entity] = Optional[JSON]
        namespace[entity] = None
    return strawberry.type(type(name, (), namespace))


SuccessPayload = _payload("SuccessPayload", None)
AccountPayload = _payload("AccountPayload", "account")
AccountNotificationSettingPayload = _payload("AccountNotificationSettingPayload", "account_notification_setting")
AuditEventPayload = _payload("AuditEventPayload", "audit_event")
DeletedItemPayload = _payload("DeletedItemPayload", "deleted_item")
DeliveryPayload = _payload("DeliveryPayload", "entity")
FavoritePayload = _payload("FavoritePayload", "favorite")
InboxDisplayPayload = _payload("InboxDisplayPayload", "inbox_display")
InboxNotificationPayload = _payload("InboxNotificationPayload", "inbox_notification")
MetaConnectionPayload = _payload("MetaConnectionPayload", "meta_connection")
MetaInvitePayload = _payload("MetaInvitePayload", "meta_invite")
MetaOAuthPayload = _payload("MetaOAuthPayload", "authorization")
NotificationChannelsPayload = _payload("NotificationChannelsPayload", "notification_channels")
OnboardingPayload = _payload("OnboardingPayload", "onboarding")
RulePayload = _payload("RulePayload", "rule")
RuleLabelPayload = _payload("RuleLabelPayload", "rule_label")
RulesPayload = _payload("RulesPayload", "rules")
TeamPayload = _payload("TeamPayload", "team")
TeamDocumentPayload = _payload("TeamDocumentPayload", "team_document")
TelegramPayload = _payload("TelegramPayload", "telegram")
UserPayload = _payload("UserPayload", "user")
ViewSettingPayload = _payload("ViewSettingPayload", "view_setting")
WorkspacePayload = _payload("WorkspacePayload", "workspace")
WorkspaceInvitePayload = _payload("WorkspaceInvitePayload", "workspace_invite")
WorkspaceInviteLinkPayload = _payload("WorkspaceInviteLinkPayload", "workspace_invite_link")
WorkspaceMemberPayload = _payload("WorkspaceMemberPayload", "workspace_member")


async def _mutate(info: Info, payload_type, route, /, **values):
    result = await run(info, route, **values)
    fields = {"success": True, "last_sync_id": await current_sync_id(route)}
    for name in payload_type.__annotations__:
        fields.setdefault(name, result)
    return payload_type(**fields)


# Queries --------------------------------------------------------------------------------------

R_ACCOUNTS = _routed("accounts", accounts, accounts.list_accounts)
R_ACCOUNT_NOTIFICATIONS = _routed(
    "accountNotificationSetting", account_notifications, account_notifications.get_account_notifications
)
R_HIERARCHY = _routed("analyticsHierarchy", analytics, analytics.get_analytics_hierarchy)
R_ACCOUNTS_HIERARCHY = _routed("analyticsAccountsHierarchy", analytics, analytics.get_accounts_hierarchy)
R_AUDIT_EVENTS = _routed("auditEvents", audit, audit.list_audit_events)
R_DELETED_ITEMS = _routed("deletedItems", trash, trash.list_deleted_items)
R_FAVORITES = _routed("favorites", favorites, favorites.list_favorites)
R_INBOX = _routed("inbox", audit, audit.list_inbox)
R_INBOX_FACETS = _routed("inboxFacets", audit, audit.inbox_facets)
R_INBOX_SENDERS = _routed("inboxSenders", audit, audit.inbox_senders)
R_INBOX_DISPLAY = _routed("inboxDisplay", audit, audit.get_inbox_display)
R_INBOX_UNREAD = _routed("inboxUnreadCount", audit, audit.inbox_unread_count)
R_NOTIFICATION_CHANNELS = _routed("notificationChannels", audit, audit.get_notification_channels)
R_META_CONNECTIONS = _routed("metaConnections", meta_oauth, meta_oauth.list_connections)
R_RULES = _routed("rules", rules, rules.list_presets)
R_RULE_LABELS = _routed("ruleLabels", rules, rules.list_rule_labels)
R_RULE_STATES = _routed("ruleStates", rules, rules.list_entity_rule_states)
R_RULE_ENTITY_STATES = _routed("ruleEntityStates", rules, rules.list_preset_states)
R_RULE_PREVIEW = _routed("rulePreview", rules, rules.preview_rule_on_account_endpoint)
R_RULE_DRAFT_CHECK = _routed("ruleDraftCheck", rules, rules.check_rule_draft)
R_RULE_DRAFT_PREVIEW = _routed("ruleDraftPreview", rules, rules.preview_rule_draft_on_account)
R_SEARCH = _routed("search", search, search.search_workspace)
R_STOPPED_AD_SETS = _routed("stoppedAdSets", adsets, adsets.list_stopped_adsets)
R_TELEGRAM = _routed("telegramConnection", telegram, telegram.get_telegram_connection)
R_TEAMS = _routed("teams", teams, teams.list_teams)
R_TEAM_DOCUMENTS = _routed("teamDocuments", teams, teams.list_team_documents)
R_VIEW_SETTINGS = _routed("viewSettings", views, views.list_view_settings)
R_WORKSPACES = _routed("workspaces", workspaces, workspaces.list_workspaces)
R_WORKSPACE_MEMBERS = _routed("workspaceMembers", members, members.list_workspace_members)
R_WORKSPACE_INVITES = _routed("workspaceInvites", members, members.list_workspace_invites)
R_WORKSPACE_INVITE_LINK = _routed("workspaceInviteLink", members, members.get_workspace_invite_link)
R_WORKSPACE_SLUG = _routed("workspaceSlugCheck", onboarding, onboarding.check_workspace_slug)


@strawberry.type
class Query:
    @strawberry.field(description="Ad accounts of the workspace the member may see, with their latest metrics.")
    async def accounts(self, info: Info) -> JSON:
        return await run(info, R_ACCOUNTS)

    @strawberry.field(description="The member's notification settings for one ad account (its bell).")
    async def account_notification_setting(self, info: Info, account_id: str) -> JSON:
        return await run(info, R_ACCOUNT_NOTIFICATIONS, account_id=account_id)

    @strawberry.field(description="Campaigns, ad sets or ads under a Meta entity, with their insights for the period.")
    async def analytics_hierarchy(
        self,
        info: Info,
        parent_id: str,
        level: Optional[str] = None,
        period: Optional[str] = None,
        compare: Optional[str] = None,
    ) -> JSON:
        return await run(info, R_HIERARCHY, parent_id=parent_id, level=level, period=period, compare=compare)

    @strawberry.field(description="Ad account rows with their insights for the period; every visible one when none named.")
    async def analytics_accounts_hierarchy(
        self, info: Info, account_ids: Optional[str] = None, period: Optional[str] = None
    ) -> JSON:
        return await run(info, R_ACCOUNTS_HIERARCHY, account_ids=account_ids, period=period)

    @strawberry.field(description="A page of the workspace's audit log, newest first.")
    async def audit_events(
        self,
        info: Info,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
        category: Optional[str] = None,
        status: Optional[str] = None,
        account_id: Optional[str] = None,
        rule_id: Optional[int] = None,
        search: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
    ) -> JSON:
        return await run(
            info, R_AUDIT_EVENTS, page=page, page_size=page_size, category=category, event_status=status,
            account_id=account_id, rule_id=rule_id, search=search, date_from=date_from, date_to=date_to,
        )

    @strawberry.field(description="Recently deleted rules and labels.")
    async def deleted_items(self, info: Info) -> JSON:
        return await run(info, R_DELETED_ITEMS)

    @strawberry.field(description="The member's favorites in sidebar order.")
    async def favorites(self, info: Info) -> JSON:
        return await run(info, R_FAVORITES)

    @strawberry.field(description="A page of the member's Inbox.")
    async def inbox(
        self,
        info: Info,
        offset: Optional[int] = None,
        limit: Optional[int] = None,
        ordering: Optional[str] = None,
        unread_only: Optional[bool] = None,
        show_snoozed: Optional[bool] = None,
        unread_first: Optional[bool] = None,
        tab: Optional[str] = None,
        priority: Optional[str] = None,
        filter: Optional[str] = None,
    ) -> JSON:
        return await run(
            info, R_INBOX, offset=offset, limit=limit, ordering=ordering, unread_only=unread_only,
            show_snoozed=show_snoozed, unread_first=unread_first, tab=tab, priority_param=priority, filter_=filter,
        )

    @strawberry.field(description="Counts behind the Inbox filter menu.")
    async def inbox_facets(
        self,
        info: Info,
        unread_only: Optional[bool] = None,
        show_snoozed: Optional[bool] = None,
        tab: Optional[str] = None,
        priority: Optional[str] = None,
    ) -> JSON:
        return await run(
            info, R_INBOX_FACETS, unread_only=unread_only, show_snoozed=show_snoozed, tab=tab, priority_param=priority
        )

    @strawberry.field(description="Who sent the member's Inbox notifications.")
    async def inbox_senders(self, info: Info) -> JSON:
        return await run(info, R_INBOX_SENDERS)

    @strawberry.field(description="The member's Inbox display options.")
    async def inbox_display(self, info: Info) -> JSON:
        return await run(info, R_INBOX_DISPLAY)

    @strawberry.field(description="Unread Inbox notifications, for the sidebar's badge.")
    async def inbox_unread_count(self, info: Info) -> JSON:
        return await run(info, R_INBOX_UNREAD)

    @strawberry.field(description="Where the member's notifications go besides the Inbox.")
    async def notification_channels(self, info: Info) -> JSON:
        return await run(info, R_NOTIFICATION_CHANNELS)

    @strawberry.field(description="The workspace's Meta connections.")
    async def meta_connections(self, info: Info) -> JSON:
        return await run(info, R_META_CONNECTIONS)

    @strawberry.field(description="The workspace's rules.")
    async def rules(self, info: Info) -> JSON:
        return await run(info, R_RULES)

    @strawberry.field(description="The workspace's rule labels with their rule counts.")
    async def rule_labels(self, info: Info) -> JSON:
        return await run(info, R_RULE_LABELS)

    @strawberry.field(description="What each rule last decided about one campaign, ad set or ad.")
    async def rule_states(self, info: Info, entity_level: str, entity_id: str) -> JSON:
        return await run(info, R_RULE_STATES, entity_level=entity_level, entity_id=entity_id)

    @strawberry.field(description="What one rule last decided about each entity it checks.")
    async def rule_entity_states(self, info: Info, rule_id: int) -> JSON:
        return await run(info, R_RULE_ENTITY_STATES, preset_id=rule_id)

    @strawberry.field(description="What an attached rule would do on an ad account now.")
    async def rule_preview(self, info: Info, account_id: str, rule_id: int) -> JSON:
        return await run(info, R_RULE_PREVIEW, account_id=account_id, preset_id=rule_id)

    @strawberry.field(description="Whether a rule draft is valid, without saving it.")
    async def rule_draft_check(self, info: Info, input: JSON) -> JSON:
        return await run(info, R_RULE_DRAFT_CHECK, payload=input)

    @strawberry.field(description="What a rule draft would do on an ad account now.")
    async def rule_draft_preview(self, info: Info, account_id: str, input: JSON) -> JSON:
        return await run(info, R_RULE_DRAFT_PREVIEW, account_id=account_id, payload=input)

    @strawberry.field(description="Campaigns, ad sets, ads, rules and ad accounts matching a name or Meta ID.")
    async def search(
        self,
        info: Info,
        q: str,
        limit: Optional[int] = None,
        kind: Optional[str] = None,
        status: Optional[list[str]] = None,
        account: Optional[list[str]] = None,
        order: Optional[str] = None,
        include_deleted: Optional[bool] = None,
    ) -> JSON:
        return await run(
            info, R_SEARCH, q=q, limit=limit, kind=kind, status=status, account=account, order=order,
            include_deleted=include_deleted,
        )

    @strawberry.field(description="Ad sets rules stopped, to reactivate or dismiss.")
    async def stopped_ad_sets(self, info: Info) -> JSON:
        return await run(info, R_STOPPED_AD_SETS)

    @strawberry.field(description="The member's Telegram connection.")
    async def telegram_connection(self, info: Info) -> JSON:
        return await run(info, R_TELEGRAM)

    @strawberry.field(description="The workspace's teams, active or retired.")
    async def teams(self, info: Info, workspace_id: int, status: Optional[str] = None) -> JSON:
        return await run(info, R_TEAMS, workspace_id=workspace_id, status=status)

    @strawberry.field(description="A team's documents.")
    async def team_documents(self, info: Info, workspace_id: int, team_id: int) -> JSON:
        return await run(info, R_TEAM_DOCUMENTS, workspace_id=workspace_id, team_id=team_id)

    @strawberry.field(description="The member's saved view options and the workspace's defaults.")
    async def view_settings(self, info: Info) -> JSON:
        return await run(info, R_VIEW_SETTINGS)

    @strawberry.field(description="The workspaces the user belongs to.")
    async def workspaces(self, info: Info) -> JSON:
        return await run(info, R_WORKSPACES)

    @strawberry.field(description="A workspace's members.")
    async def workspace_members(self, info: Info, workspace_id: int) -> JSON:
        return await run(info, R_WORKSPACE_MEMBERS, workspace_id=workspace_id)

    @strawberry.field(description="A workspace's pending invites.")
    async def workspace_invites(self, info: Info, workspace_id: int) -> JSON:
        return await run(info, R_WORKSPACE_INVITES, workspace_id=workspace_id)

    @strawberry.field(description="A workspace's invite link, when it has one.")
    async def workspace_invite_link(self, info: Info, workspace_id: int) -> JSON:
        return await run(info, R_WORKSPACE_INVITE_LINK, workspace_id=workspace_id)

    @strawberry.field(description="Whether a workspace address is free.")
    async def workspace_slug_check(self, info: Info, slug: str) -> JSON:
        return await run(info, R_WORKSPACE_SLUG, slug=slug)


# Mutations ------------------------------------------------------------------------------------

M_ACCOUNT_UPDATE = _routed("accountUpdate", accounts, accounts.update_account_profile)
M_ACCOUNT_LEAD = _routed("accountLeadUpdate", accounts, accounts.update_account_lead)
M_ACCOUNT_DELETE = _routed("accountDelete", accounts, accounts.delete_account)
M_ACCOUNT_NOTIFICATIONS = _routed(
    "accountNotificationSettingUpdate", account_notifications, account_notifications.set_account_notifications
)
M_ACCOUNT_RULE_ATTACH = _routed("accountRuleAttach", rules, rules.assign_rule_to_account)
M_ACCOUNT_RULE_DETACH = _routed("accountRuleDetach", rules, rules.detach_rule_from_account)
M_ACCOUNT_RULE_SCOPE = _routed("accountRuleScopeUpdate", rules, rules.set_attached_rule_scope)
M_ACCOUNT_RULES_TOGGLE = _routed("accountRulesToggle", rules, rules.toggle_rules)
M_AD_SET_REACTIVATE = _routed("adSetReactivate", adsets, adsets.reactivate_adset)
M_AD_SET_DISMISS = _routed("adSetDismiss", adsets, adsets.dismiss_adset)
M_AUDIT_UNDO = _routed("auditEventUndo", audit, audit.undo_audit_event)
M_DELETED_RESTORE = _routed("deletedItemRestore", trash, trash.restore_deleted_item)
M_ENTITY_DELIVERY = _routed("entityDeliveryUpdate", delivery, delivery.set_entity_delivery)
M_ENTITY_BUDGET = _routed("entityBudgetUpdate", delivery, delivery.set_entity_budget)
M_FAVORITE_CREATE = _routed("favoriteCreate", favorites, favorites.add_favorite)
M_FAVORITE_DELETE = _routed("favoriteDelete", favorites, favorites.remove_favorite)
M_INBOX_DISPLAY = _routed("inboxDisplayUpdate", audit, audit.save_inbox_display)
M_INBOX_READ = _routed("inboxNotificationRead", audit, audit.mark_inbox_read)
M_INBOX_DELETE = _routed("inboxNotificationDelete", audit, audit.delete_inbox_notification)
M_INBOX_SNOOZE = _routed("inboxNotificationSnooze", audit, audit.snooze_inbox_notification)
M_INBOX_DELETE_ALL = _routed("inboxDeleteAll", audit, audit.delete_all_inbox)
M_INBOX_DELETE_ALL_READ = _routed("inboxDeleteAllRead", audit, audit.delete_all_read_inbox)
M_META_INVITE = _routed("metaInviteCreate", meta_oauth, meta_oauth.create_meta_invite)
M_META_DISCOVER = _routed("metaConnectionDiscover", meta_oauth, meta_oauth.discover_accounts)
M_META_IMPORT = _routed("metaConnectionImport", meta_oauth, meta_oauth.import_accounts)
M_META_OAUTH = _routed("metaOauthStart", meta_oauth, meta_oauth.start_oauth)
M_NOTIFICATION_CHANNELS = _routed("notificationChannelsUpdate", audit, audit.save_notification_channels)
M_ONBOARDING_DETAILS = _routed(
    "onboardingPersonalDetailsUpdate", onboarding, onboarding.submit_onboarding_personal_details
)
M_ONBOARDING_WORKSPACE = _routed("onboardingWorkspaceCreate", onboarding, onboarding.submit_onboarding_workspace)
M_ONBOARDING_INVITES = _routed("onboardingInvitesSend", onboarding, onboarding.submit_onboarding_invites)
M_ONBOARDING_SKIP = _routed("onboardingSkip", onboarding, onboarding.skip_onboarding)
M_RULE_CREATE = _routed("ruleCreate", rules, rules.create_preset)
M_RULE_UPDATE = _routed("ruleUpdate", rules, rules.update_preset)
M_RULE_DELETE = _routed("ruleDelete", rules, rules.delete_preset)
M_RULE_LABELS_SET = _routed("ruleLabelsSet", rules, rules.set_preset_labels)
M_RULES_LABELS_CHANGE = _routed("rulesLabelsChange", rules, rules.change_presets_labels)
M_RULE_LABEL_CREATE = _routed("ruleLabelCreate", rules, rules.create_rule_label)
M_RULE_LABEL_UPDATE = _routed("ruleLabelUpdate", rules, rules.update_rule_label)
M_RULE_LABEL_DELETE = _routed("ruleLabelDelete", rules, rules.delete_rule_label)
M_TEAM_CREATE = _routed("teamCreate", teams, teams.create_team)
M_TEAM_UPDATE = _routed("teamUpdate", teams, teams.update_team)
M_TEAM_RETIRE = _routed("teamRetire", teams, teams.retire_team)
M_TEAM_RESTORE = _routed("teamRestore", teams, teams.restore_team)
M_TEAM_DELETE = _routed("teamDelete", teams, teams.delete_team)
M_TEAM_MEMBERS_ADD = _routed("teamMembersAdd", teams, teams.add_team_members)
M_TEAM_MEMBER_REMOVE = _routed("teamMemberRemove", teams, teams.remove_team_member)
M_TEAM_MEMBER_UPDATE = _routed("teamMemberUpdate", teams, teams.set_team_owner)
M_TEAM_ACCOUNTS_ADD = _routed("teamAccountsAdd", teams, teams.add_team_accounts)
M_TEAM_ACCOUNT_REMOVE = _routed("teamAccountRemove", teams, teams.remove_team_account)
M_TEAM_DOCUMENT_CREATE = _routed("teamDocumentCreate", teams, teams.create_team_document)
M_TEAM_DOCUMENT_UPDATE = _routed("teamDocumentUpdate", teams, teams.update_team_document)
M_TEAM_DOCUMENT_DELETE = _routed("teamDocumentDelete", teams, teams.delete_team_document)
M_TELEGRAM_LINK = _routed("telegramLinkCreate", telegram, telegram.create_telegram_link)
M_TELEGRAM_DISCONNECT = _routed("telegramDisconnect", telegram, telegram.disconnect_telegram)
M_USER_UPDATE = _routed("userUpdate", auth, auth.update_profile)
M_VIEW_SETTING_UPDATE = _routed("viewSettingUpdate", views, views.save_view_settings)
M_VIEW_SETTING_RESET = _routed("viewSettingReset", views, views.reset_view_settings)
M_VIEW_DEFAULT_UPDATE = _routed("workspaceViewDefaultUpdate", views, views.save_view_default)
M_WORKSPACE_CREATE = _routed("workspaceCreate", workspaces, workspaces.create_workspace)
M_WORKSPACE_UPDATE = _routed("workspaceUpdate", workspaces, workspaces.update_workspace)
M_WORKSPACE_DELETE = _routed("workspaceDelete", workspaces, workspaces.delete_workspace)
M_WORKSPACE_SWITCH = _routed("workspaceSwitch", workspaces, workspaces.switch_workspace)
M_WORKSPACE_LEAVE = _routed("workspaceLeave", members, members.leave_workspace)
M_WORKSPACE_TRANSFER = _routed("workspaceOwnershipTransfer", members, members.transfer_workspace_ownership)
M_MEMBER_UPDATE = _routed("workspaceMemberUpdate", members, members.update_workspace_member_role)
M_MEMBER_REMOVE = _routed("workspaceMemberRemove", members, members.remove_workspace_member)
M_INVITE_CREATE = _routed("workspaceInviteCreate", members, members.create_workspace_invite)
M_INVITE_DELETE = _routed("workspaceInviteDelete", members, members.revoke_workspace_invite)
M_INVITE_RESEND = _routed("workspaceInviteResend", members, members.resend_workspace_invite)
M_INVITE_ACCEPT = _routed("workspaceInviteAccept", members, members.accept_workspace_invite)
M_INVITE_LINK_ENABLE = _routed("workspaceInviteLinkEnable", members, members.enable_workspace_invite_link)
M_INVITE_LINK_RESET = _routed("workspaceInviteLinkReset", members, members.reset_workspace_invite_link)
M_INVITE_LINK_DISABLE = _routed("workspaceInviteLinkDisable", members, members.disable_workspace_invite_link)


@strawberry.type
class Mutation:
    # Every payload may be null: a refused write is null with its error, and the other writes sent in
    # the same document (the client's transactions, #508) keep their own answers.
    # Ad accounts

    @strawberry.mutation(description="Renames an ad account or changes its note.")
    async def account_update(self, info: Info, account_id: str, input: JSON) -> Optional[AccountPayload]:
        return await _mutate(info, AccountPayload, M_ACCOUNT_UPDATE, account_id=account_id, payload=input)

    @strawberry.mutation(description="Sets or clears an ad account's lead.")
    async def account_lead_update(self, info: Info, account_id: str, input: JSON) -> Optional[AccountPayload]:
        return await _mutate(info, AccountPayload, M_ACCOUNT_LEAD, account_id=account_id, payload=input)

    @strawberry.mutation(description="Removes an ad account from the workspace.")
    async def account_delete(self, info: Info, account_id: str) -> Optional[AccountPayload]:
        return await _mutate(info, AccountPayload, M_ACCOUNT_DELETE, account_id=account_id)

    @strawberry.mutation(description="Sets the member's notifications for one ad account.")
    async def account_notification_setting_update(
        self, info: Info, account_id: str, input: JSON
    ) -> Optional[AccountNotificationSettingPayload]:
        return await _mutate(
            info, AccountNotificationSettingPayload, M_ACCOUNT_NOTIFICATIONS, account_id=account_id, payload=input
        )

    @strawberry.mutation(description="Attaches a rule to an ad account.")
    async def account_rule_attach(self, info: Info, account_id: str, input: JSON) -> Optional[AccountPayload]:
        return await _mutate(info, AccountPayload, M_ACCOUNT_RULE_ATTACH, account_id=account_id, payload=input)

    @strawberry.mutation(description="Detaches a rule from an ad account.")
    async def account_rule_detach(self, info: Info, account_id: str, rule_id: int) -> Optional[AccountPayload]:
        return await _mutate(info, AccountPayload, M_ACCOUNT_RULE_DETACH, account_id=account_id, preset_id=rule_id)

    @strawberry.mutation(description="Narrows an attached rule to some campaigns, ad sets or ads.")
    async def account_rule_scope_update(
        self, info: Info, account_id: str, rule_id: int, input: JSON
    ) -> Optional[AccountPayload]:
        return await _mutate(
            info, AccountPayload, M_ACCOUNT_RULE_SCOPE, account_id=account_id, preset_id=rule_id, payload=input
        )

    @strawberry.mutation(description="Turns an ad account's rules on or off.")
    async def account_rules_toggle(self, info: Info, account_id: str) -> Optional[AccountPayload]:
        return await _mutate(info, AccountPayload, M_ACCOUNT_RULES_TOGGLE, account_id=account_id)

    # Meta Ads delivery

    @strawberry.mutation(description="Turns a stopped ad set back on in Meta.")
    async def ad_set_reactivate(self, info: Info, ad_set_id: str) -> Optional[DeliveryPayload]:
        return await _mutate(info, DeliveryPayload, M_AD_SET_REACTIVATE, adset_id=ad_set_id)

    @strawberry.mutation(description="Dismisses a stopped ad set from the list.")
    async def ad_set_dismiss(self, info: Info, ad_set_id: str) -> Optional[DeliveryPayload]:
        return await _mutate(info, DeliveryPayload, M_AD_SET_DISMISS, adset_id=ad_set_id)

    @strawberry.mutation(description="Turns a campaign, ad set or ad on or off in Meta.")
    async def entity_delivery_update(self, info: Info, level: str, entity_id: str, input: JSON) -> Optional[DeliveryPayload]:
        return await _mutate(info, DeliveryPayload, M_ENTITY_DELIVERY, level=level, entity_id=entity_id, payload=input)

    @strawberry.mutation(description="Changes a campaign's or ad set's budget in Meta.")
    async def entity_budget_update(self, info: Info, level: str, entity_id: str, input: JSON) -> Optional[DeliveryPayload]:
        return await _mutate(info, DeliveryPayload, M_ENTITY_BUDGET, level=level, entity_id=entity_id, payload=input)

    # Audit log and Recently deleted

    @strawberry.mutation(description="Undoes what an audit event did.")
    async def audit_event_undo(self, info: Info, id: int) -> Optional[AuditEventPayload]:
        return await _mutate(info, AuditEventPayload, M_AUDIT_UNDO, event_id=id)

    @strawberry.mutation(description="Restores a rule or label from Recently deleted.")
    async def deleted_item_restore(self, info: Info, id: int) -> Optional[DeletedItemPayload]:
        return await _mutate(info, DeletedItemPayload, M_DELETED_RESTORE, item_id=id)

    # Favorites and views

    @strawberry.mutation(description="Stars a page or record; starring it again returns the favorite it already is.")
    async def favorite_create(self, info: Info, input: JSON) -> Optional[FavoritePayload]:
        return await _mutate(info, FavoritePayload, M_FAVORITE_CREATE, payload=input)

    @strawberry.mutation(description="Unstars a favorite; succeeds when it was already gone.")
    async def favorite_delete(self, info: Info, id: int) -> Optional[SuccessPayload]:
        return await _mutate(info, SuccessPayload, M_FAVORITE_DELETE, favorite_id=id)

    @strawberry.mutation(description="Saves the member's options for a view.")
    async def view_setting_update(self, info: Info, key: str, input: JSON) -> Optional[ViewSettingPayload]:
        return await _mutate(info, ViewSettingPayload, M_VIEW_SETTING_UPDATE, view_key=key, payload=input)

    @strawberry.mutation(description="Resets the member's options for a view to the workspace's default.")
    async def view_setting_reset(self, info: Info, key: str) -> Optional[SuccessPayload]:
        return await _mutate(info, SuccessPayload, M_VIEW_SETTING_RESET, view_key=key)

    @strawberry.mutation(description="Saves a view's options as the workspace's default.")
    async def workspace_view_default_update(self, info: Info, key: str, input: JSON) -> Optional[ViewSettingPayload]:
        return await _mutate(info, ViewSettingPayload, M_VIEW_DEFAULT_UPDATE, view_key=key, payload=input)

    # Inbox

    @strawberry.mutation(description="Saves the member's Inbox display options.")
    async def inbox_display_update(self, info: Info, input: JSON) -> Optional[InboxDisplayPayload]:
        return await _mutate(info, InboxDisplayPayload, M_INBOX_DISPLAY, payload=input)

    @strawberry.mutation(description="Marks an Inbox notification read or unread.")
    async def inbox_notification_read(self, info: Info, id: int, input: JSON) -> Optional[InboxNotificationPayload]:
        return await _mutate(info, InboxNotificationPayload, M_INBOX_READ, event_id=id, payload=input)

    @strawberry.mutation(description="Deletes an Inbox notification for the member.")
    async def inbox_notification_delete(self, info: Info, id: int) -> Optional[InboxNotificationPayload]:
        return await _mutate(info, InboxNotificationPayload, M_INBOX_DELETE, event_id=id)

    @strawberry.mutation(description="Snoozes an Inbox notification, or wakes it.")
    async def inbox_notification_snooze(self, info: Info, id: int, input: JSON) -> Optional[InboxNotificationPayload]:
        return await _mutate(info, InboxNotificationPayload, M_INBOX_SNOOZE, event_id=id, payload=input)

    @strawberry.mutation(description="Deletes every Inbox notification of the member.")
    async def inbox_delete_all(self, info: Info) -> Optional[InboxNotificationPayload]:
        return await _mutate(info, InboxNotificationPayload, M_INBOX_DELETE_ALL)

    @strawberry.mutation(description="Deletes the member's read Inbox notifications.")
    async def inbox_delete_all_read(self, info: Info) -> Optional[InboxNotificationPayload]:
        return await _mutate(info, InboxNotificationPayload, M_INBOX_DELETE_ALL_READ)

    @strawberry.mutation(description="Sets where the member's notifications go besides the Inbox.")
    async def notification_channels_update(self, info: Info, input: JSON) -> Optional[NotificationChannelsPayload]:
        return await _mutate(info, NotificationChannelsPayload, M_NOTIFICATION_CHANNELS, payload=input)

    # Meta connections

    @strawberry.mutation(description="Creates a one-time link for someone else to connect their Facebook profile.")
    async def meta_invite_create(self, info: Info, input: JSON) -> Optional[MetaInvitePayload]:
        return await _mutate(info, MetaInvitePayload, M_META_INVITE, payload=input)

    @strawberry.mutation(description="Reads a Meta connection's ad accounts from Meta again.")
    async def meta_connection_discover(self, info: Info, connection_id: int) -> Optional[MetaConnectionPayload]:
        return await _mutate(info, MetaConnectionPayload, M_META_DISCOVER, connection_id=connection_id)

    @strawberry.mutation(description="Adds ad accounts of a Meta connection to the workspace.")
    async def meta_connection_import(self, info: Info, connection_id: int, input: JSON) -> Optional[MetaConnectionPayload]:
        return await _mutate(info, MetaConnectionPayload, M_META_IMPORT, connection_id=connection_id, payload=input)

    @strawberry.mutation(description="Starts Facebook login; returns the address to send the browser to.")
    async def meta_oauth_start(
        self, info: Info, return_path: Optional[str] = None, reconnect_connection_id: Optional[int] = None
    ) -> Optional[MetaOAuthPayload]:
        return await _mutate(
            info, MetaOAuthPayload, M_META_OAUTH, return_path=return_path,
            reconnect_connection_id=reconnect_connection_id,
        )

    # Onboarding

    @strawberry.mutation(description="Saves the new user's name.")
    async def onboarding_personal_details_update(self, info: Info, input: JSON) -> Optional[OnboardingPayload]:
        return await _mutate(info, OnboardingPayload, M_ONBOARDING_DETAILS, req=input)

    @strawberry.mutation(description="Creates the new user's first workspace.")
    async def onboarding_workspace_create(self, info: Info, input: JSON) -> Optional[OnboardingPayload]:
        return await _mutate(info, OnboardingPayload, M_ONBOARDING_WORKSPACE, req=input)

    @strawberry.mutation(description="Invites teammates during onboarding.")
    async def onboarding_invites_send(self, info: Info, input: JSON) -> Optional[OnboardingPayload]:
        return await _mutate(info, OnboardingPayload, M_ONBOARDING_INVITES, req=input)

    @strawberry.mutation(description="Skips the rest of onboarding.")
    async def onboarding_skip(self, info: Info) -> Optional[OnboardingPayload]:
        return await _mutate(info, OnboardingPayload, M_ONBOARDING_SKIP)

    # Rules and labels

    @strawberry.mutation(description="Creates a rule.")
    async def rule_create(self, info: Info, input: JSON) -> Optional[RulePayload]:
        return await _mutate(info, RulePayload, M_RULE_CREATE, payload=input)

    @strawberry.mutation(description="Changes a rule.")
    async def rule_update(self, info: Info, id: int, input: JSON) -> Optional[RulePayload]:
        return await _mutate(info, RulePayload, M_RULE_UPDATE, preset_id=id, payload=input)

    @strawberry.mutation(description="Moves a rule to Recently deleted.")
    async def rule_delete(self, info: Info, id: int) -> Optional[RulePayload]:
        return await _mutate(info, RulePayload, M_RULE_DELETE, preset_id=id)

    @strawberry.mutation(description="Sets a rule's labels.")
    async def rule_labels_set(self, info: Info, id: int, input: JSON) -> Optional[RulePayload]:
        return await _mutate(info, RulePayload, M_RULE_LABELS_SET, preset_id=id, payload=input)

    @strawberry.mutation(description="Adds or removes labels on several rules at once.")
    async def rules_labels_change(self, info: Info, input: JSON) -> Optional[RulesPayload]:
        return await _mutate(info, RulesPayload, M_RULES_LABELS_CHANGE, payload=input)

    @strawberry.mutation(description="Creates a rule label.")
    async def rule_label_create(self, info: Info, input: JSON) -> Optional[RuleLabelPayload]:
        return await _mutate(info, RuleLabelPayload, M_RULE_LABEL_CREATE, payload=input)

    @strawberry.mutation(description="Changes a rule label.")
    async def rule_label_update(self, info: Info, id: int, input: JSON) -> Optional[RuleLabelPayload]:
        return await _mutate(info, RuleLabelPayload, M_RULE_LABEL_UPDATE, label_id=id, payload=input)

    @strawberry.mutation(description="Moves a rule label to Recently deleted.")
    async def rule_label_delete(self, info: Info, id: int) -> Optional[RuleLabelPayload]:
        return await _mutate(info, RuleLabelPayload, M_RULE_LABEL_DELETE, label_id=id)

    # Teams

    @strawberry.mutation(description="Creates a team.")
    async def team_create(self, info: Info, workspace_id: int, input: JSON) -> Optional[TeamPayload]:
        return await _mutate(info, TeamPayload, M_TEAM_CREATE, workspace_id=workspace_id, req=input)

    @strawberry.mutation(description="Changes a team.")
    async def team_update(self, info: Info, workspace_id: int, id: int, input: JSON) -> Optional[TeamPayload]:
        return await _mutate(info, TeamPayload, M_TEAM_UPDATE, workspace_id=workspace_id, team_id=id, req=input)

    @strawberry.mutation(description="Retires a team.")
    async def team_retire(self, info: Info, workspace_id: int, id: int) -> Optional[TeamPayload]:
        return await _mutate(info, TeamPayload, M_TEAM_RETIRE, workspace_id=workspace_id, team_id=id)

    @strawberry.mutation(description="Brings a retired team back.")
    async def team_restore(self, info: Info, workspace_id: int, id: int) -> Optional[TeamPayload]:
        return await _mutate(info, TeamPayload, M_TEAM_RESTORE, workspace_id=workspace_id, team_id=id)

    @strawberry.mutation(description="Deletes a team.")
    async def team_delete(self, info: Info, workspace_id: int, id: int) -> Optional[TeamPayload]:
        return await _mutate(info, TeamPayload, M_TEAM_DELETE, workspace_id=workspace_id, team_id=id)

    @strawberry.mutation(description="Adds workspace members to a team.")
    async def team_members_add(self, info: Info, workspace_id: int, team_id: int, input: JSON) -> Optional[TeamPayload]:
        return await _mutate(info, TeamPayload, M_TEAM_MEMBERS_ADD, workspace_id=workspace_id, team_id=team_id, req=input)

    @strawberry.mutation(description="Takes a member off a team.")
    async def team_member_remove(self, info: Info, workspace_id: int, team_id: int, user_id: int) -> Optional[TeamPayload]:
        return await _mutate(
            info, TeamPayload, M_TEAM_MEMBER_REMOVE, workspace_id=workspace_id, team_id=team_id, member_user_id=user_id
        )

    @strawberry.mutation(description="Makes a team member a team owner, or not.")
    async def team_member_update(
        self, info: Info, workspace_id: int, team_id: int, user_id: int, input: JSON
    ) -> Optional[TeamPayload]:
        return await _mutate(
            info, TeamPayload, M_TEAM_MEMBER_UPDATE, workspace_id=workspace_id, team_id=team_id,
            member_user_id=user_id, req=input,
        )

    @strawberry.mutation(description="Puts ad accounts on a team.")
    async def team_accounts_add(self, info: Info, workspace_id: int, team_id: int, input: JSON) -> Optional[TeamPayload]:
        return await _mutate(info, TeamPayload, M_TEAM_ACCOUNTS_ADD, workspace_id=workspace_id, team_id=team_id, req=input)

    @strawberry.mutation(description="Takes an ad account off a team.")
    async def team_account_remove(self, info: Info, workspace_id: int, team_id: int, account_id: int) -> Optional[TeamPayload]:
        return await _mutate(
            info, TeamPayload, M_TEAM_ACCOUNT_REMOVE, workspace_id=workspace_id, team_id=team_id, account_pk=account_id
        )

    @strawberry.mutation(description="Creates a team document.")
    async def team_document_create(self, info: Info, workspace_id: int, team_id: int, input: JSON) -> Optional[TeamDocumentPayload]:
        return await _mutate(
            info, TeamDocumentPayload, M_TEAM_DOCUMENT_CREATE, workspace_id=workspace_id, team_id=team_id, req=input
        )

    @strawberry.mutation(description="Changes a team document.")
    async def team_document_update(
        self, info: Info, workspace_id: int, team_id: int, id: int, input: JSON
    ) -> Optional[TeamDocumentPayload]:
        return await _mutate(
            info, TeamDocumentPayload, M_TEAM_DOCUMENT_UPDATE, workspace_id=workspace_id, team_id=team_id,
            document_id=id, req=input,
        )

    @strawberry.mutation(description="Deletes a team document.")
    async def team_document_delete(self, info: Info, workspace_id: int, team_id: int, id: int) -> Optional[TeamDocumentPayload]:
        return await _mutate(
            info, TeamDocumentPayload, M_TEAM_DOCUMENT_DELETE, workspace_id=workspace_id, team_id=team_id, document_id=id
        )

    # Telegram and the user

    @strawberry.mutation(description="Creates the link that connects the member's Telegram.")
    async def telegram_link_create(self, info: Info) -> Optional[TelegramPayload]:
        return await _mutate(info, TelegramPayload, M_TELEGRAM_LINK)

    @strawberry.mutation(description="Disconnects the member's Telegram.")
    async def telegram_disconnect(self, info: Info) -> Optional[TelegramPayload]:
        return await _mutate(info, TelegramPayload, M_TELEGRAM_DISCONNECT)

    @strawberry.mutation(description="Changes the user's name or username.")
    async def user_update(self, info: Info, input: JSON) -> Optional[UserPayload]:
        return await _mutate(info, UserPayload, M_USER_UPDATE, req=input)

    # Workspaces, members and invites

    @strawberry.mutation(description="Creates a workspace.")
    async def workspace_create(self, info: Info, input: JSON) -> Optional[WorkspacePayload]:
        return await _mutate(info, WorkspacePayload, M_WORKSPACE_CREATE, req=input)

    @strawberry.mutation(description="Changes a workspace's name, address or logo.")
    async def workspace_update(self, info: Info, id: int, input: JSON) -> Optional[WorkspacePayload]:
        return await _mutate(info, WorkspacePayload, M_WORKSPACE_UPDATE, workspace_id=id, req=input)

    @strawberry.mutation(description="Deletes a workspace.")
    async def workspace_delete(self, info: Info, id: int) -> Optional[WorkspacePayload]:
        return await _mutate(info, WorkspacePayload, M_WORKSPACE_DELETE, workspace_id=id)

    @strawberry.mutation(description="Makes a workspace the user's active one.")
    async def workspace_switch(self, info: Info, input: JSON) -> Optional[WorkspacePayload]:
        return await _mutate(info, WorkspacePayload, M_WORKSPACE_SWITCH, req=input)

    @strawberry.mutation(description="Leaves a workspace.")
    async def workspace_leave(self, info: Info, id: int) -> Optional[WorkspacePayload]:
        return await _mutate(info, WorkspacePayload, M_WORKSPACE_LEAVE, workspace_id=id)

    @strawberry.mutation(description="Hands a workspace to another member.")
    async def workspace_ownership_transfer(self, info: Info, id: int, input: JSON) -> Optional[WorkspacePayload]:
        return await _mutate(info, WorkspacePayload, M_WORKSPACE_TRANSFER, workspace_id=id, req=input)

    @strawberry.mutation(description="Changes a member's role.")
    async def workspace_member_update(
        self, info: Info, workspace_id: int, user_id: int, input: JSON
    ) -> Optional[WorkspaceMemberPayload]:
        return await _mutate(
            info, WorkspaceMemberPayload, M_MEMBER_UPDATE, workspace_id=workspace_id, member_user_id=user_id, req=input
        )

    @strawberry.mutation(description="Removes a member from the workspace.")
    async def workspace_member_remove(self, info: Info, workspace_id: int, user_id: int) -> Optional[WorkspaceMemberPayload]:
        return await _mutate(
            info, WorkspaceMemberPayload, M_MEMBER_REMOVE, workspace_id=workspace_id, member_user_id=user_id
        )

    @strawberry.mutation(description="Invites people to the workspace by email.")
    async def workspace_invite_create(self, info: Info, workspace_id: int, input: JSON) -> Optional[WorkspaceInvitePayload]:
        return await _mutate(info, WorkspaceInvitePayload, M_INVITE_CREATE, workspace_id=workspace_id, req=input)

    @strawberry.mutation(description="Revokes a pending invite.")
    async def workspace_invite_delete(self, info: Info, workspace_id: int, id: int) -> Optional[WorkspaceInvitePayload]:
        return await _mutate(info, WorkspaceInvitePayload, M_INVITE_DELETE, workspace_id=workspace_id, invite_id=id)

    @strawberry.mutation(description="Sends a pending invite again.")
    async def workspace_invite_resend(self, info: Info, workspace_id: int, id: int) -> Optional[WorkspaceInvitePayload]:
        return await _mutate(info, WorkspaceInvitePayload, M_INVITE_RESEND, workspace_id=workspace_id, invite_id=id)

    @strawberry.mutation(description="Joins a workspace through an invite.")
    async def workspace_invite_accept(self, info: Info, token: str) -> Optional[WorkspaceInvitePayload]:
        return await _mutate(info, WorkspaceInvitePayload, M_INVITE_ACCEPT, token=token)

    @strawberry.mutation(description="Turns the workspace's invite link on.")
    async def workspace_invite_link_enable(self, info: Info, workspace_id: int) -> Optional[WorkspaceInviteLinkPayload]:
        return await _mutate(info, WorkspaceInviteLinkPayload, M_INVITE_LINK_ENABLE, workspace_id=workspace_id)

    @strawberry.mutation(description="Replaces the workspace's invite link; the old one stops working.")
    async def workspace_invite_link_reset(self, info: Info, workspace_id: int) -> Optional[WorkspaceInviteLinkPayload]:
        return await _mutate(info, WorkspaceInviteLinkPayload, M_INVITE_LINK_RESET, workspace_id=workspace_id)

    @strawberry.mutation(description="Turns the workspace's invite link off.")
    async def workspace_invite_link_disable(self, info: Info, workspace_id: int) -> Optional[WorkspaceInviteLinkPayload]:
        return await _mutate(info, WorkspaceInviteLinkPayload, M_INVITE_LINK_DISABLE, workspace_id=workspace_id)

