"""The Meta client belongs to the requesting app, never to a router module."""

from fastapi import Request

from meta_api.client import MetaClient


def get_meta_client(request: Request) -> MetaClient:
    client = request.app.state.meta_client
    if client is None:
        raise RuntimeError("API Meta client is outside its lifespan")
    return client
