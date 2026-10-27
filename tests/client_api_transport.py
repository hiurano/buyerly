"""The backend tests' requests to routes the client API now serves, sent as GraphQL (#509).

The routes the web client used are no longer mounted over HTTP; GraphQL fields run their handlers
(api/client_api/schema.py). The tests were written as REST requests, so this transport sends each
such request as the request of its field: path and query parameters and the body become the
field's arguments, and the answer comes back as the route's would: the record, the route's status
code, a refusal's status and `{"detail": …}`. Every other request (sync, sign-in, uploads, public
links, webhooks) goes to the app as it is. The tests therefore exercise the client API itself.
"""

import ast
import inspect
import json
from pathlib import Path
from urllib.parse import parse_qs

import httpx
from fastapi.params import Depends as DependsParam
from pydantic import BaseModel
from pydantic.fields import FieldInfo
from starlette.routing import compile_path

from api.client_api import schema as client_schema
from api.client_api.schema import ROUTES

GRAPHQL = "/api/graphql"


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(part[:1].upper() + part[1:] for part in rest)


def _arguments_by_field() -> dict:
    """Each field's handler parameters and the field arguments they come from, read from schema.py."""
    source = Path(__file__).resolve().parents[1] / "api" / "client_api" / "schema.py"
    tree = ast.parse(source.read_text())
    mapping = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.AsyncFunctionDef):
            continue
        for call in ast.walk(node):
            if isinstance(call, ast.Call) and isinstance(call.func, ast.Name) and call.func.id in ("run", "_mutate"):
                mapping[_camel(node.name)] = {
                    keyword.arg: _camel(keyword.value.id)
                    for keyword in call.keywords
                    if isinstance(keyword.value, ast.Name)
                }
    return mapping


def _full_path(route) -> str:
    return route.path if route.path.startswith("/api") else "/api" + route.path


class _Field:
    def __init__(self, name, route, graphql_schema, arguments):
        self.name = name
        self.route = route
        self.regex = compile_path(_full_path(route))[0]
        self.arguments = arguments
        mutation = graphql_schema.mutation_type.fields.get(name)
        self.kind = "mutation" if mutation else "query"
        self.field = mutation or graphql_schema.query_type.fields[name]
        self.entity = None
        if mutation:
            payload = mutation.type.of_type if hasattr(mutation.type, "of_type") else mutation.type
            entities = [key for key in payload.fields if key not in ("success", "lastSyncId")]
            self.entity = entities[0] if entities else None

    def variables(self, request: httpx.Request, path_values: dict) -> dict:
        query = parse_qs(request.url.query.decode() if isinstance(request.url.query, bytes) else request.url.query)
        body = json.loads(request.content) if request.content else None
        values = {}
        for name, parameter in inspect.signature(self.route.endpoint).parameters.items():
            argument = self.arguments.get(name)
            if argument is None or isinstance(parameter.default, DependsParam):
                continue
            annotation = parameter.annotation
            if inspect.isclass(annotation) and issubclass(annotation, BaseModel):
                value = body if body is not None else {}
            elif name in path_values:
                value = path_values[name]
            else:
                alias = getattr(parameter.default, "alias", None) if isinstance(parameter.default, FieldInfo) else None
                raw = query.get(alias or name)
                if raw is None:
                    continue
                value = raw
            values[argument] = self._typed(argument, value)
        return values

    def _typed(self, argument: str, value):
        declared = str(self.field.args[argument].type).rstrip("!")
        if declared == "JSON":
            return value
        if declared.startswith("["):
            items = value if isinstance(value, list) else [value]
            return [self._scalar(declared.strip("[]").rstrip("!"), item) for item in items]
        return self._scalar(declared, value[-1] if isinstance(value, list) else value)

    @staticmethod
    def _scalar(declared: str, value):
        if declared == "Int":
            return int(value)
        if declared == "Float":
            return float(value)
        if declared == "Boolean":
            return value if isinstance(value, bool) else str(value).lower() in ("1", "true", "yes", "on")
        return str(value)

    def document(self, variables: dict) -> str:
        declared = ", ".join(f"${name}: {self.field.args[name].type}" for name in variables)
        passed = ", ".join(f"{name}: ${name}" for name in variables)
        selection = ""
        if self.kind == "mutation":
            selection = " { success lastSyncId" + (f" {self.entity}" if self.entity else "") + " }"
        head = f"{self.kind} Op({declared})" if declared else self.kind
        return f"{head} {{ {self.name}{f'({passed})' if passed else ''}{selection} }}"


_FIELDS = None


def _fields():
    global _FIELDS
    if _FIELDS is None:
        arguments = _arguments_by_field()
        graphql_schema = client_schema._schema
        _FIELDS = [_Field(name, route, graphql_schema, arguments.get(name, {})) for name, route in ROUTES.items()]
    return _FIELDS


def _match(request: httpx.Request):
    for field in _fields():
        if request.method in field.route.methods:
            matched = field.regex.match(request.url.path)
            if matched:
                return field, matched.groupdict()
    return None, None


class ClientApiTransport(httpx.AsyncBaseTransport):
    """An ASGI transport for `app` that sends client-API routes as their GraphQL fields."""

    def __init__(self, app, **kwargs):
        self.inner = httpx.ASGITransport(app=app, **kwargs)

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        field, path_values = _match(request)
        if field is None:
            return await self.inner.handle_async_request(request)
        variables = field.variables(request, path_values)
        headers = [(key, value) for key, value in request.headers.items()
                   if key.lower() not in ("content-length", "content-type")]
        graphql_request = httpx.Request(
            "POST", request.url.copy_with(path=GRAPHQL, query=b""), headers=headers,
            json={"query": field.document(variables), "variables": variables},
        )
        response = await self.inner.handle_async_request(graphql_request)
        await response.aread()
        if response.status_code != 200:
            return response
        payload = json.loads(response.content)
        if payload.get("errors"):
            error = payload["errors"][0]
            extensions = error.get("extensions") or {}
            detail = extensions.get("detail", error["message"])
            out_headers = {"Retry-After": extensions["retryAfter"]} if extensions.get("retryAfter") else {}
            return httpx.Response(extensions.get("statusCode", 422), json={"detail": detail},
                                  headers=out_headers, request=request)
        value = payload["data"][field.name]
        if field.kind == "mutation":
            value = value.get(field.entity) if field.entity else None
        status = field.route.status_code or 200
        if value is None and status == 204:
            return httpx.Response(204, request=request)
        return httpx.Response(status, json=value, request=request)


def client_api_transport(app, **kwargs) -> ClientApiTransport:
    return ClientApiTransport(app, **kwargs)
