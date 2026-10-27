// The client API (/api/graphql, #509) for the browser checks, answered by their REST mocks.
//
// The checks were written against the REST routes, and each GraphQL field runs one of those
// routes on the server (api/client_api/schema.py). So in the page, a request to /api/graphql
// is sent on as the route's own request, which the check's `/api/**` handler answers as before,
// and the answer comes back as GraphQL: a query's value as it is, a mutation's payload with
// `success`, `lastSyncId: 0` and its record, a refusal as an error with the route's status.
//
// `FIELDS` must name every field the client sends; an unknown one fails the page's request
// loudly. mockSync installs this on every check's page.

/** Every field: the route it runs, as [method, path, body] from its variables; no body, none sent, as the REST client did. */
const FIELDS = String.raw`({
  accounts: () => ['GET', '/api/accounts'],
  accountNotificationSetting: (v) => ['GET', '/api/accounts/' + enc(v.accountId) + '/notifications'],
  analyticsHierarchy: (v) => ['GET', '/api/analytics/hierarchy' + qs({ parent_id: v.parentId, level: v.level, period: v.period, compare: v.compare })],
  analyticsAccountsHierarchy: (v) => ['GET', '/api/analytics/hierarchy/accounts' + qs({ account_ids: v.accountIds, period: v.period })],
  auditEvents: (v) => ['GET', '/api/audit-events' + qs({
    page: v.page, page_size: v.pageSize, category: v.category, status: v.status, account_id: v.accountId,
    rule_id: v.ruleId, search: v.search, date_from: v.dateFrom, date_to: v.dateTo,
  })],
  deletedItems: () => ['GET', '/api/deleted-items'],
  favorites: () => ['GET', '/api/favorites'],
  inbox: (v) => ['GET', '/api/inbox' + qs({
    offset: v.offset, limit: v.limit, ordering: v.ordering, unread_only: v.unreadOnly, show_snoozed: v.showSnoozed,
    unread_first: v.unreadFirst, tab: v.tab, priority: v.priority, filter: v.filter,
  })],
  inboxFacets: (v) => ['GET', '/api/inbox/facets' + qs({ unread_only: v.unreadOnly, show_snoozed: v.showSnoozed, tab: v.tab, priority: v.priority })],
  inboxSenders: () => ['GET', '/api/inbox/senders'],
  inboxDisplay: () => ['GET', '/api/inbox/display'],
  inboxUnreadCount: () => ['GET', '/api/inbox/unread-count'],
  notificationChannels: () => ['GET', '/api/notifications/channels'],
  metaConnections: () => ['GET', '/api/meta/connections'],
  rules: () => ['GET', '/api/presets'],
  ruleLabels: () => ['GET', '/api/rule-labels'],
  ruleStates: (v) => ['GET', '/api/rule-states' + qs({ entity_level: v.entityLevel, entity_id: v.entityId })],
  ruleEntityStates: (v) => ['GET', '/api/presets/' + v.ruleId + '/states'],
  rulePreview: (v) => ['GET', '/api/accounts/' + enc(v.accountId) + '/rules/' + v.ruleId + '/preview'],
  ruleDraftCheck: (v) => ['POST', '/api/presets/check', v.input],
  ruleDraftPreview: (v) => ['POST', '/api/accounts/' + enc(v.accountId) + '/rules/preview', v.input],
  search: (v) => ['GET', '/api/search' + qs({
    q: v.q, limit: v.limit, kind: v.kind, status: v.status, account: v.account, order: v.order, include_deleted: v.includeDeleted,
  })],
  stoppedAdSets: () => ['GET', '/api/adsets/stopped'],
  telegramConnection: () => ['GET', '/api/telegram/connection'],
  teams: (v) => ['GET', '/api/workspaces/' + v.workspaceId + '/teams' + qs({ status: v.status })],
  teamDocuments: (v) => ['GET', '/api/workspaces/' + v.workspaceId + '/teams/' + v.teamId + '/documents'],
  viewSettings: () => ['GET', '/api/view-settings'],
  workspaces: () => ['GET', '/api/workspaces'],
  workspaceMembers: (v) => ['GET', '/api/workspaces/' + v.workspaceId + '/members'],
  workspaceInvites: (v) => ['GET', '/api/workspaces/' + v.workspaceId + '/invites'],
  workspaceInviteLink: (v) => ['GET', '/api/workspaces/' + v.workspaceId + '/invite-link'],
  workspaceSlugCheck: (v) => ['GET', '/api/onboarding/check-slug' + qs({ slug: v.slug })],

  accountUpdate: (v) => ['PATCH', '/api/accounts/' + enc(v.accountId) + '/profile', v.input],
  accountLeadUpdate: (v) => ['PATCH', '/api/accounts/' + enc(v.accountId) + '/lead', v.input],
  accountDelete: (v) => ['DELETE', '/api/accounts/' + enc(v.accountId)],
  accountNotificationSettingUpdate: (v) => ['PUT', '/api/accounts/' + enc(v.accountId) + '/notifications', v.input],
  accountRuleAttach: (v) => ['POST', '/api/accounts/' + enc(v.accountId) + '/assign-rule', v.input],
  accountRuleDetach: (v) => ['POST', '/api/accounts/' + enc(v.accountId) + '/detach-rule/' + v.ruleId],
  accountRuleScopeUpdate: (v) => ['PUT', '/api/accounts/' + enc(v.accountId) + '/rules/' + v.ruleId + '/scope', v.input],
  accountRulesToggle: (v) => ['POST', '/api/accounts/' + enc(v.accountId) + '/toggle-rules'],
  adSetReactivate: (v) => ['POST', '/api/adsets/' + enc(v.adSetId) + '/reactivate'],
  adSetDismiss: (v) => ['POST', '/api/adsets/' + enc(v.adSetId) + '/dismiss'],
  entityDeliveryUpdate: (v) => ['POST', '/api/entities/' + v.level + '/' + enc(v.entityId) + '/delivery', v.input],
  entityBudgetUpdate: (v) => ['PATCH', '/api/entities/' + v.level + '/' + enc(v.entityId) + '/budget', v.input],
  auditEventUndo: (v) => ['POST', '/api/audit-events/' + v.id + '/undo'],
  deletedItemRestore: (v) => ['POST', '/api/deleted-items/' + v.id + '/restore'],
  favoriteCreate: (v) => ['POST', '/api/favorites', v.input],
  favoriteDelete: (v) => ['DELETE', '/api/favorites/' + v.id],
  viewSettingUpdate: (v) => ['PUT', '/api/view-settings/' + enc(v.key), v.input],
  viewSettingReset: (v) => ['DELETE', '/api/view-settings/' + enc(v.key)],
  workspaceViewDefaultUpdate: (v) => ['PUT', '/api/view-settings/' + enc(v.key) + '/default', v.input],
  inboxDisplayUpdate: (v) => ['PUT', '/api/inbox/display', v.input],
  inboxNotificationRead: (v) => ['POST', '/api/inbox/' + v.id + '/read', v.input],
  inboxNotificationDelete: (v) => ['POST', '/api/inbox/' + v.id + '/delete'],
  inboxNotificationSnooze: (v) => ['POST', '/api/inbox/' + v.id + '/snooze', v.input],
  inboxDeleteAll: () => ['POST', '/api/inbox/delete-all'],
  inboxDeleteAllRead: () => ['POST', '/api/inbox/delete-all-read'],
  notificationChannelsUpdate: (v) => ['PUT', '/api/notifications/channels', v.input],
  metaInviteCreate: (v) => ['POST', '/api/meta/invites', v.input],
  metaConnectionDiscover: (v) => ['POST', '/api/meta/connections/' + v.connectionId + '/discover', {}],
  metaConnectionImport: (v) => ['POST', '/api/meta/connections/' + v.connectionId + '/import', v.input],
  metaOauthStart: (v) => ['POST', '/api/meta/oauth/start' + qs({ return_path: v.returnPath, reconnect_connection_id: v.reconnectConnectionId }), {}],
  onboardingPersonalDetailsUpdate: (v) => ['POST', '/api/onboarding/personal-details', v.input],
  onboardingWorkspaceCreate: (v) => ['POST', '/api/onboarding/workspace', v.input],
  onboardingInvitesSend: (v) => ['POST', '/api/onboarding/invites', v.input],
  onboardingSkip: () => ['POST', '/api/onboarding/skip', {}],
  ruleCreate: (v) => ['POST', '/api/presets', v.input],
  ruleUpdate: (v) => ['PUT', '/api/presets/' + v.id, v.input],
  ruleDelete: (v) => ['DELETE', '/api/presets/' + v.id],
  ruleLabelsSet: (v) => ['PUT', '/api/presets/' + v.id + '/labels', v.input],
  rulesLabelsChange: (v) => ['PATCH', '/api/presets/labels', v.input],
  ruleLabelCreate: (v) => ['POST', '/api/rule-labels', v.input],
  ruleLabelUpdate: (v) => ['PATCH', '/api/rule-labels/' + v.id, v.input],
  ruleLabelDelete: (v) => ['DELETE', '/api/rule-labels/' + v.id],
  teamCreate: (v) => ['POST', '/api/workspaces/' + v.workspaceId + '/teams', v.input],
  teamUpdate: (v) => ['PATCH', '/api/workspaces/' + v.workspaceId + '/teams/' + v.id, v.input],
  teamRetire: (v) => ['POST', '/api/workspaces/' + v.workspaceId + '/teams/' + v.id + '/retire'],
  teamRestore: (v) => ['POST', '/api/workspaces/' + v.workspaceId + '/teams/' + v.id + '/restore'],
  teamDelete: (v) => ['DELETE', '/api/workspaces/' + v.workspaceId + '/teams/' + v.id],
  teamMembersAdd: (v) => ['POST', '/api/workspaces/' + v.workspaceId + '/teams/' + v.teamId + '/members', v.input],
  teamMemberRemove: (v) => ['DELETE', '/api/workspaces/' + v.workspaceId + '/teams/' + v.teamId + '/members/' + v.userId],
  teamMemberUpdate: (v) => ['PATCH', '/api/workspaces/' + v.workspaceId + '/teams/' + v.teamId + '/members/' + v.userId, v.input],
  teamAccountsAdd: (v) => ['POST', '/api/workspaces/' + v.workspaceId + '/teams/' + v.teamId + '/accounts', v.input],
  teamAccountRemove: (v) => ['DELETE', '/api/workspaces/' + v.workspaceId + '/teams/' + v.teamId + '/accounts/' + v.accountId],
  teamDocumentCreate: (v) => ['POST', '/api/workspaces/' + v.workspaceId + '/teams/' + v.teamId + '/documents', v.input],
  teamDocumentUpdate: (v) => ['PATCH', '/api/workspaces/' + v.workspaceId + '/teams/' + v.teamId + '/documents/' + v.id, v.input],
  teamDocumentDelete: (v) => ['DELETE', '/api/workspaces/' + v.workspaceId + '/teams/' + v.teamId + '/documents/' + v.id],
  telegramLinkCreate: () => ['POST', '/api/telegram/link'],
  telegramDisconnect: () => ['DELETE', '/api/telegram/connection'],
  userUpdate: (v) => ['POST', '/api/auth/update-profile', v.input],
  workspaceCreate: (v) => ['POST', '/api/workspaces', v.input],
  workspaceUpdate: (v) => ['PATCH', '/api/workspaces/' + v.id, v.input],
  workspaceDelete: (v) => ['DELETE', '/api/workspaces/' + v.id],
  workspaceSwitch: (v) => ['POST', '/api/workspaces/switch', v.input],
  workspaceLeave: (v) => ['POST', '/api/workspaces/' + v.id + '/leave', {}],
  workspaceOwnershipTransfer: (v) => ['POST', '/api/workspaces/' + v.id + '/transfer-ownership', v.input],
  workspaceMemberUpdate: (v) => ['PATCH', '/api/workspaces/' + v.workspaceId + '/members/' + v.userId, v.input],
  workspaceMemberRemove: (v) => ['DELETE', '/api/workspaces/' + v.workspaceId + '/members/' + v.userId],
  workspaceInviteCreate: (v) => ['POST', '/api/workspaces/' + v.workspaceId + '/invites', v.input],
  workspaceInviteDelete: (v) => ['DELETE', '/api/workspaces/' + v.workspaceId + '/invites/' + v.id],
  workspaceInviteResend: (v) => ['POST', '/api/workspaces/' + v.workspaceId + '/invites/' + v.id + '/resend', {}],
  workspaceInviteAccept: (v) => ['POST', '/api/invites/' + enc(v.token) + '/accept', {}],
  workspaceInviteLinkEnable: (v) => ['POST', '/api/workspaces/' + v.workspaceId + '/invite-link', {}],
  workspaceInviteLinkReset: (v) => ['POST', '/api/workspaces/' + v.workspaceId + '/invite-link/reset', {}],
  workspaceInviteLinkDisable: (v) => ['DELETE', '/api/workspaces/' + v.workspaceId + '/invite-link'],
})`;

/** Runs in the page, before the app: /api/graphql goes on as the REST request of its field. */
function install(fieldsSource) {
  const enc = encodeURIComponent;
  const qs = (params) => {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      for (const item of Array.isArray(value) ? value : [value]) query.append(name, String(item));
    }
    const text = query.toString();
    return text ? `?${text}` : '';
  };
  // eslint-disable-next-line no-new-func
  const fields = new Function('enc', 'qs', `return ${fieldsSource};`)(enc, qs);
  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (new URL(url, window.location.href).pathname !== '/api/graphql') return realFetch(input, init);
    const { query, variables = {} } = JSON.parse(init.body);
    const head = /^\s*(query|mutation)\b[^{]*\{\s*(\w+)\s*(\([^)]*\))?\s*(\{([^}]*)\})?\s*\}\s*$/.exec(query);
    if (!head) throw new Error(`graphql-mock: one root field per document, got ${query}`);
    const [, kind, field, , , selection = ''] = head;
    const route = fields[field];
    if (!route) throw new Error(`graphql-mock: no REST route for the field ${field}`);
    const [method, path, input_] = route(variables);
    const headers = new Headers(init.headers);
    const body = input_ === undefined ? undefined : JSON.stringify(input_);
    if (!body) headers.delete('Content-Type');
    const response = await realFetch(path, { method, headers, body, credentials: init.credentials, signal: init.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload?.detail;
      const message = typeof detail === 'string' ? detail
        : typeof detail?.message === 'string' ? detail.message
          : Array.isArray(detail) ? detail.map((item) => String(item?.msg ?? '').replace(/^Value error, /, '')).join(' ')
            : typeof payload?.message === 'string' ? payload.message : 'Something went wrong';
      const extensions = { statusCode: response.status, userPresentableMessage: message };
      if (detail && typeof detail === 'object' && !Array.isArray(detail)) extensions.detail = detail;
      return json({ data: null, errors: [{ message, path: [field], extensions }] });
    }
    if (kind === 'query') return json({ data: { [field]: payload } });
    const result = {};
    for (const name of selection.split(/[\s,]+/).filter(Boolean)) {
      result[name] = name === 'success' ? true : name === 'lastSyncId' ? 0 : payload;
    }
    return json({ data: { [field]: result } });
  };
}

/** Answers the page's /api/graphql with the check's REST mocks; mockSync calls it. */
export async function mockGraphqlAsRest(page) {
  await page.addInitScript(install, FIELDS);
}
