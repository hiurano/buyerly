# Account token replacement authorization

The batch import endpoint used a workspace-access predicate to check personal
ownership. Every buyer in the same workspace therefore passed the intended
owner-only token replacement restriction.

The endpoint now compares `owner_user_id` directly while retaining the workspace
owner/admin exception and the existing cross-workspace rejection. The general
workspace-access helper is unchanged. Regression coverage exercises denied
buyers, account owners and workspace administrators.
