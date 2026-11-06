"""`POST /api/graphql`, the web client's API, as Linear's `client-api.linear.app/graphql` (#509).

The request is authenticated as every REST request is: the session cookie of the account in
`X-Buyerly-Account`, the CSRF token on this POST, and the workspace in `X-Workspace-Slug`. A
request that fails any of these is refused before GraphQL runs (401/403), so every field already
has a signed-in user; what that user may do is each field's route's own check (see bridge.py).
The exception is a request asking only for the public fields of signing in (schema.PUBLIC_FIELDS):
it runs without a session, and its fields' routes need none. Only a JSON body may do that, so a
cross-site form cannot sign a browser in.

Sync (`/api/sync/*`), uploads, OAuth and webhook endpoints stay REST (decision 55).
"""

import json
from typing import Optional

from fastapi import BackgroundTasks, Header, Request, Response
from graphql import FieldNode, FragmentSpreadNode, GraphQLError, InlineFragmentNode, OperationDefinitionNode, parse
from strawberry.extensions import MaxAliasesLimiter, MaxTokensLimiter, QueryDepthLimiter
from strawberry.fastapi import GraphQLRouter

import strawberry

from api.auth import get_authenticated_user, get_current_user
from api.client_api.bridge import RouteError
from api.client_api.schema import PUBLIC_FIELDS, Mutation, Query
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


def _root_fields(selection_set, fragments: dict, into: set, visited: set) -> None:
    for selection in selection_set.selections:
        if isinstance(selection, FieldNode):
            into.add(selection.name.value)
        elif isinstance(selection, InlineFragmentNode):
            _root_fields(selection.selection_set, fragments, into, visited)
        elif isinstance(selection, FragmentSpreadNode):
            name = selection.name.value
            if name in fragments and name not in visited:
                visited.add(name)
                _root_fields(fragments[name].selection_set, fragments, into, visited)
            else:
                into.add("..." + name)


async def _is_public(request: Request) -> bool:
    """Whether every root field the JSON body asks for is a public one."""
    if request.headers.get("content-type", "").split(";", 1)[0].strip() != "application/json":
        return False
    try:
        body = json.loads(await request.body())
        document = parse(body["query"], max_tokens=2000)
    except Exception:
        return False
    fragments = {
        definition.name.value: definition
        for definition in document.definitions
        if not isinstance(definition, OperationDefinitionNode)
    }
    fields: set = set()
    for definition in document.definitions:
        if isinstance(definition, OperationDefinitionNode):
            _root_fields(definition.selection_set, fragments, fields, set())
    fields.discard("__typename")
    return bool(fields) and fields <= PUBLIC_FIELDS


async def get_context(
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    authorization: Optional[str] = Header(None),
    x_auth_token: Optional[str] = Header(None),
    x_workspace_slug: Optional[str] = Header(None),
) -> dict:
    user: Optional[User] = None
    if not await _is_public(request):
        user = await get_authenticated_user(request, response, authorization, x_auth_token)
        user = await get_current_user(user, x_workspace_slug)
    return {"request": request, "background_tasks": background_tasks, "user": user}


router = GraphQLRouter(
    schema,
    path="/graphql",
    graphql_ide=None,
    allow_queries_via_get=False,
    context_getter=get_context,
    include_in_schema=False,
)
