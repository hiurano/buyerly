# Workspace request isolation

The project review found that a workspace URL changed the displayed team name,
while API operations used the user's persisted active workspace. Requests now
carry `X-Workspace-Slug`; authentication validates membership or a live support
grant and applies the workspace only to the detached request user. Headerless
clients retain their existing behavior. No global workspace switch is needed,
so separate browser tabs can use different teams.

Regression coverage checks reads, mutations, unchanged persisted selection and
rejection of inaccessible or missing workspaces. The frontend contract checks
that the route supplies the request scope. Full integration coverage runs in CI.
