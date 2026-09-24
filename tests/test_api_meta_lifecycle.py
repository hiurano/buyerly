"""DB-free checks for production app assembly and ownership of Meta clients."""

import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from fastapi import Depends, Request

import api.server as server
from api.meta_dependencies import get_meta_client
from meta_api.client import MetaClient
from services.inventory_cache import PostgreSQLInventoryCache


class TestApiMetaLifecycle(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.sessions = MagicMock()
        self.sessions.return_value.__aenter__ = AsyncMock()
        self.sessions.return_value.__aexit__ = AsyncMock(return_value=False)
        self.session_patch = patch.object(server, "async_session_maker", self.sessions)
        self.session_patch.start()
        self.addCleanup(self.session_patch.stop)
        self.cleanup_patch = patch.object(server, "cleanup_stale_workspace_logos", AsyncMock(return_value=0))
        self.cleanup_patch.start()
        self.addCleanup(self.cleanup_patch.stop)

    async def test_production_assembly_keeps_postgresql_provider(self):
        self.assertIsInstance(server.app.state.meta_client._cache_provider, PostgreSQLInventoryCache)
        app = server.create_app()
        client = app.state.meta_client
        self.assertIsInstance(client, MetaClient)
        self.assertIsInstance(client._cache_provider, PostgreSQLInventoryCache)
        self.assertIs(client._cache_provider._session_factory, self.sessions)
        self.assertIsNone(client._client)  # Assembly opens no HTTP connections.
        async with app.router.lifespan_context(app):
            transport = await client._get_client()
            self.assertFalse(transport.is_closed)
        self.assertTrue(transport.is_closed)
        self.assertIsNone(app.state.meta_client)
        with self.assertRaises(RuntimeError):
            get_meta_client(Request({"type": "http", "app": app}))

    async def test_two_apps_resolve_their_own_client_and_close_independently(self):
        first, second = server.create_app(), server.create_app()
        clients = [first.state.meta_client, second.state.meta_client]
        self.assertIsNot(clients[0], clients[1])
        self.assertIsNot(clients[0]._cache_provider, clients[1]._cache_provider)
        for app, client, label in zip((first, second), clients, ("first", "second")):
            client.get_account_info = AsyncMock(return_value={"name": label})
            client.aclose = AsyncMock()

            @app.get("/api/meta-probe")
            async def probe(meta: MetaClient = Depends(get_meta_client)):
                await asyncio.sleep(0)
                return await meta.get_account_info("act_123", "fake")

        async def fetch(app):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as http:
                return (await http.get("/api/meta-probe")).json()

        async with first.router.lifespan_context(first):
            async with second.router.lifespan_context(second):
                self.assertEqual(await asyncio.gather(fetch(first), fetch(second)), [{"name": "first"}, {"name": "second"}])
            clients[1].aclose.assert_awaited_once()
            clients[0].aclose.assert_not_awaited()
            self.assertEqual(await fetch(first), {"name": "first"})
        clients[0].aclose.assert_awaited_once()

    async def test_exception_closes_client_and_reentry_creates_fresh_client(self):
        app = server.create_app()
        first = app.state.meta_client
        first.aclose = AsyncMock()
        with self.assertRaisesRegex(ValueError, "lifespan failure"):
            async with app.router.lifespan_context(app):
                raise ValueError("lifespan failure")
        first.aclose.assert_awaited_once()
        async with app.router.lifespan_context(app):
            second = app.state.meta_client
            self.assertIsNot(first, second)
            self.assertIsInstance(second._cache_provider, PostgreSQLInventoryCache)
            second.aclose = AsyncMock()
        second.aclose.assert_awaited_once()

    async def test_cleanup_failure_does_not_skip_client_shutdown(self):
        app = server.create_app()
        client = app.state.meta_client
        client.aclose = AsyncMock()
        with patch.object(server, "cleanup_stale_workspace_logos", AsyncMock(side_effect=RuntimeError("cleanup"))):
            with self.assertLogs(server.logger, level="ERROR"):
                async with app.router.lifespan_context(app):
                    self.assertIs(app.state.meta_client, client)
        client.aclose.assert_awaited_once()
