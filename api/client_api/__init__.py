"""`POST /api/graphql`, the web client's API, as Linear's `client-api.linear.app/graphql` (#509).

The request is authenticated as every REST request is: the session cookie of the account in
`X-Buyerly-Account`, the CSRF token on this POST, and the workspace in `X-Workspace-Slug`. A
request that fails any of these is refused before GraphQL runs (401/403), so every field already
has a signed-in user; what that user may do is each field's route's own check (see bridge.py).

Sync (`/api/sync/*`), sign-in, uploads and the public and webhook endpoints stay REST.
"""

from fastapi import BackgroundTasks, Depends, Request
from graphql import GraphQLError
from strawberry.extensions import MaxAliasesLimiter, MaxTokensLimiter, QueryDepthLimiter
from strawberry.fastapi import GraphQLRouter

import strawberry

from api.auth import get_current_user
from api.client_api.bridge import RouteError
from api.client_api.schema import Mutation, Query
from database.models import User


class ClientSchema(strawberry.Schema):
    def process_errors(self, errors: list[GraphQLError], execution_context=None) -> None:
        # A route's refusal is an answer, not a server fault: only the rest is logged.
        unexpected = [error for error in errors if not isinstance(error.original_error, RouteError)]
        super().process_errors(unexpected, execution_context)


schema = ClientSchema(
    query=Query,
    mutation=Mutation,
    extensions=[
        # Records are JSON, so no document needs to go deep; aliases would repeat a field's work.
        QueryDepthLimiter(max_depth=4),
        MaxAliasesLimiter(max_alias_count=10),
        MaxTokensLimiter(max_token_count=2000),
    ],
)


async def get_context(
    request: Request,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
) -> dict:
    return {"request": request, "background_tasks": background_tasks, "user": user}


router = GraphQLRouter(
    schema,
    path="/graphql",
    graphql_ide=None,
    allow_queries_via_get=False,
    context_getter=get_context,
    include_in_schema=False,
)
