"""Catalog-driven routing for one operation exposed by several provider routes."""

from __future__ import annotations

from copy import deepcopy


OPTIONAL_ENUM_OMIT = "provider default (omit)"


class UnknownRouteError(ValueError):
    """The selected route is absent from the routed provider fact."""


def route_projection(route_ids, provider_fact):
    """Return the stable union and route-specific field contracts."""
    catalog = provider_fact.get("routes", {})
    selected = {}
    union = set()
    for route_id in route_ids:
        if route_id not in catalog:
            raise UnknownRouteError(f"unknown route {route_id!r}")
        route = catalog[route_id]
        required = set(route.get("required", ()))
        fields = {
            name: {**deepcopy(schema), "required": name in required}
            for name, schema in route.get("fields", {}).items()
            if schema.get("disabled") is not True
        }
        union.update(fields)
        selected[route_id] = {
            "active": sorted(fields),
            "fields": fields,
            "price": route["price"],
        }
    return {"union": sorted(union), "routes": selected}


def active_route(projection, route_id):
    """Return one selected route contract, rejecting stale selections."""
    try:
        return projection["routes"][route_id]
    except KeyError:
        raise UnknownRouteError(f"unknown route {route_id!r}") from None


def build_route_payload(projection, route_id, widget_values):
    """Drop inactive values and validate declared constraints for the selected route."""
    route = active_route(projection, route_id)
    payload = {}
    for name, schema in route["fields"].items():
        if name not in widget_values:
            if schema["required"]:
                raise ValueError(f"missing required field {name!r}")
            continue
        value = widget_values[name]
        if value == OPTIONAL_ENUM_OMIT:
            if schema["required"] or "enum" not in schema or "default" in schema:
                raise ValueError("omission sentinel is not valid for this field/route")
            continue
        if schema["required"] and value in (None, ""):
            raise ValueError(f"missing required field {name!r}")
        if "enum" in schema and value not in schema["enum"]:
            raise ValueError(f"{name!r} is not valid for route {route_id!r}")
        # Bounds are a NUMERIC contract. `seedream-v4.5/edit` declares `size` as a string
        # ("2048*2048") and still carries minimum/maximum, because those numbers describe the
        # pixel values inside the string. Comparing the string against them raises TypeError,
        # which is not a ValueError and so escapes every caller's error handling — measured
        # live on 2026-07-29, prompt 11169ce1-12ac-40cd-a2e9-92111bc1d3f5. No fact declares
        # that string's grammar, so this block validates what it was given and nothing else.
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            if "minimum" in schema and value < schema["minimum"]:
                raise ValueError(f"{name!r} is below its minimum")
            if "maximum" in schema and value > schema["maximum"]:
                raise ValueError(f"{name!r} is above its maximum")
        payload[name] = value
    return payload


def route_price(projection, route_id):
    """Resolve the selected route's base price from the provider fact projection."""
    return active_route(projection, route_id)["price"]


__all__ = [
    "OPTIONAL_ENUM_OMIT",
    "UnknownRouteError",
    "active_route",
    "build_route_payload",
    "route_price",
    "route_projection",
]
