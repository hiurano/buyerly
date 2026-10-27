"""Runs a REST route's handler for a GraphQL field, with everything the route itself would do.

The GraphQL API (#509) is the web client's, as Linear's `client-api.linear.app/graphql`; the
REST routes stay for the rest until the client no longer uses them. A field does not copy a
route's logic: it calls the route's handler through `run`, which does what FastAPI does around
it, so the two cannot drift apart:

- the route's own dependencies (rate limits) run first, with this request;
- `Depends(get_current_user)` is the GraphQL request's user, authenticated and scoped to the
  workspace in `X-Workspace-Slug` once for the whole request; other dependencies get the request;
- arguments are validated against the handler's parameters, `Query(...)` constraints and body
  models included, and a failure is the route's 422 with the same messages;
- the result goes through the route's `response_model`, so a field never returns more than the
  route does; an `HTTPException` becomes a GraphQL error carrying the route's status code, and
  any other failure a logged 500 that tells the client nothing more, as REST's does.

Mutations also return `lastSyncId`, the newest sync id once the write has committed: the
client's transaction queue (#508) keeps its local change until sync has caught up to it.
"""

import inspect
import json
import logging
import sys
from typing import Annotated, Any, Callable, Optional

from fastapi import BackgroundTasks, HTTPException, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.params import Depends as DependsParam
from fastapi.routing import APIRoute
from graphql import GraphQLError
from pydantic import BaseModel, TypeAdapter, ValidationError
from pydantic.fields import FieldInfo
from pydantic_core import PydanticUndefined
from strawberry.types import Info

from api.auth import get_authenticated_user, get_current_user
from api.meta_dependencies import get_meta_client
from database.db import async_session_maker
from database.sync_log import last_sync_id

logger = logging.getLogger(__name__)

# Status codes as Linear's error `type`s; the client reads `statusCode`.
ERROR_TYPES = {
    400: "invalid input",
    401: "authentication error",
    403: "forbidden",
    404: "entity not found",
    409: "conflict",
    410: "gone",
    413: "invalid input",
    422: "invalid input",
    429: "ratelimited",
}


class RouteError(GraphQLError):
    """A route's `HTTPException` as a GraphQL error: same message, same status code."""

    def __init__(self, status_code: int, detail: Any, headers: Optional[dict] = None):
        message = detail if isinstance(detail, str) else (
            detail.get("message") if isinstance(detail, dict) and isinstance(detail.get("message"), str)
            else "Something went wrong"
        )
        extensions = {
            "type": ERROR_TYPES.get(status_code, "internal error" if status_code >= 500 else "invalid input"),
            "statusCode": status_code,
            "userPresentableMessage": message,
        }
        if not isinstance(detail, str):
            extensions["detail"] = jsonable_encoder(detail)
        if headers and headers.get("Retry-After"):
            extensions["retryAfter"] = headers["Retry-After"]
        super().__init__(message, extensions=extensions)
        self.status_code = status_code


def _validation_error(error: ValidationError) -> RouteError:
    # The client shows FastAPI's 422 as its messages, "Value error, " dropped: the same here.
    messages = [item["msg"].removeprefix("Value error, ") for item in error.errors()]
    return RouteError(422, " ".join(messages) or "Invalid input.")


def route_of(router, endpoint: Callable) -> APIRoute:
    """The route `endpoint` handles in `router`; a field's route is found once, at import."""
    for route in router.routes:
        if isinstance(route, APIRoute) and route.endpoint is endpoint:
            return route
    raise LookupError(f"{endpoint.__qualname__} is no route of this router")


async def _dependency(info: Info, function: Callable) -> Any:
    context = info.context
    if function in (get_current_user, get_authenticated_user):
        return context["user"]
    if function is get_meta_client:
        return get_meta_client(context["request"])
    kwargs = {}
    for name, parameter in inspect.signature(function).parameters.items():
        if parameter.annotation is Request or name == "request":
            kwargs[name] = context["request"]
        else:
            raise TypeError(f"{function.__qualname__} needs {name}, which GraphQL fields do not provide")
    result = function(**kwargs)
    return await result if inspect.isawaitable(result) else result


def _validated(parameter: inspect.Parameter, value: Any) -> Any:
    annotation = parameter.annotation
    if inspect.isclass(annotation) and issubclass(annotation, BaseModel):
        return annotation.model_validate(value if value is not None else {})
    if isinstance(parameter.default, FieldInfo):
        # Query(...) / Path(...) constraints: max_length, ge, le, pattern.
        return TypeAdapter(Annotated[annotation, parameter.default]).validate_python(value)
    return TypeAdapter(annotation).validate_python(value)


async def _arguments(info: Info, route: APIRoute, values: dict) -> dict:
    kwargs = {}
    for name, parameter in inspect.signature(route.endpoint).parameters.items():
        default = parameter.default
        if isinstance(default, DependsParam):
            kwargs[name] = await _dependency(info, default.dependency)
        elif parameter.annotation is Request:
            kwargs[name] = info.context["request"]
        elif parameter.annotation is Response:
            # Status codes and headers a handler sets are the route's, not this response's.
            kwargs[name] = Response()
        elif parameter.annotation is BackgroundTasks:
            kwargs[name] = info.context["background_tasks"]
        elif name in values and values[name] is not None:
            kwargs[name] = _validated(parameter, values[name])
        elif isinstance(default, FieldInfo):
            if default.is_required():
                raise RouteError(422, f"{name} is required.")
            kwargs[name] = _validated(parameter, default.get_default(call_default_factory=True))
        elif default is not inspect.Parameter.empty:
            kwargs[name] = default
        elif inspect.isclass(parameter.annotation) and issubclass(parameter.annotation, BaseModel):
            kwargs[name] = _validated(parameter, None)
        else:
            raise RouteError(422, f"{name} is required.")
    unknown = set(values) - set(inspect.signature(route.endpoint).parameters)
    if unknown:
        raise TypeError(f"{route.endpoint.__qualname__} takes no {', '.join(sorted(unknown))}")
    return kwargs


def _content(route: APIRoute, result: Any) -> Any:
    if isinstance(result, Response):
        body = bytes(result.body or b"")
        return json.loads(body) if body and result.media_type == "application/json" else None
    if route.response_model is not None:
        result = TypeAdapter(route.response_model).validate_python(result, from_attributes=True)
    return jsonable_encoder(result)


async def run(info: Info, route: APIRoute, /, **values: Any) -> Any:
    """The route's response to these arguments, as JSON; its refusals as `RouteError`s."""
    try:
        for dependency in route.dependencies:
            await _dependency(info, dependency.dependency)
        try:
            kwargs = await _arguments(info, route, values)
        except ValidationError as error:
            raise _validation_error(error) from error
        return _content(route, await route.endpoint(**kwargs))
    except HTTPException as error:
        raise RouteError(error.status_code, error.detail, getattr(error, "headers", None)) from error
    except RouteError:
        raise
    except Exception as error:
        # As REST's 500: logged here, and the client learns nothing of the internals.
        logger.exception("GraphQL field on %s %s failed", ",".join(sorted(route.methods)), route.path)
        raise RouteError(500, "Something went wrong") from error


async def current_sync_id(route: APIRoute) -> int:
    """The newest sync id: every write this request committed has one at most this.

    Read through the session factory of the route's own module, the one its handler wrote with.
    """
    sessions = getattr(sys.modules[route.endpoint.__module__], "async_session_maker", async_session_maker)
    async with sessions() as session:
        return await last_sync_id(session)
