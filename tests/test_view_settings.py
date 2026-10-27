"""List views remembered per member, as Linear does (#385): /api/view-settings."""

import unittest

import httpx
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import api.auth as api_auth_module
import api.routes as api_routes_module
import api.server as api_server_module
from api.server import create_app
from core.rate_limit import limiter
from database.models import User, ViewSetting, Workspace, WorkspaceMember, WorkspaceViewDefault
from tests.test_db_helper import create_test_engine, init_test_db, session_headers
from tests.client_api_transport import client_api_transport

RULES_VIEW = {
    "layout": "list",
    "grouping": "status",
    "ordering": "name",
    "direction": "asc",
    "showEmptyGroups": True,
    "properties": {"status": True, "scope": False},
    "filters": [{"fieldId": "status", "operator": "is", "values": ["active"]}],
}


class TestViewSettings(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await limiter.reset()
        self.engine = create_test_engine()
        self.sessions = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        await init_test_db(self.engine)
        api_routes_module.async_session_maker = self.sessions
        api_auth_module.async_session_maker = self.sessions
        api_server_module.async_session_maker = self.sessions

        async with self.sessions() as session:
            owner = User(telegram_id='910000001', username='owner', full_name='Olga Owner',
                         role='buyer', is_approved=True)
            buyer = User(telegram_id='910000002', username='buyer', full_name='Boris Buyer',
                         role='buyer', is_approved=True)
            session.add_all([owner, buyer])
            await session.flush()
            ws = Workspace(name='Buyerly', slug='buyerly', owner_user_id=owner.id)
            other = Workspace(name='Other', slug='other', owner_user_id=owner.id)
            session.add_all([ws, other])
            await session.flush()
            session.add_all([
                WorkspaceMember(workspace_id=ws.id, user_id=owner.id, role='owner'),
                WorkspaceMember(workspace_id=ws.id, user_id=buyer.id, role='buyer'),
                WorkspaceMember(workspace_id=other.id, user_id=owner.id, role='owner'),
            ])
            owner.active_workspace_id = ws.id
            buyer.active_workspace_id = ws.id
            await session.commit()
            self.ws_id, self.other_ws_id = ws.id, other.id
            self.owner_id, self.buyer_id = owner.id, buyer.id

        self.owner = await session_headers(self.sessions, {'id': 910000001, 'username': 'owner'})
        self.buyer = await session_headers(self.sessions, {'id': 910000002, 'username': 'buyer'})
        self.client = httpx.AsyncClient(transport=client_api_transport(app=create_app()), base_url='http://test')

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.engine.dispose()

    async def views(self, headers):
        res = await self.client.get('/api/view-settings', headers=headers)
        self.assertEqual(res.status_code, 200, res.text)
        return res.json()['views']

    async def defaults(self, headers):
        res = await self.client.get('/api/view-settings', headers=headers)
        self.assertEqual(res.status_code, 200, res.text)
        return res.json()['defaults']

    async def set_default(self, key, settings, headers=None):
        return await self.client.put(
            f'/api/view-settings/{key}/default', json={'settings': settings}, headers=headers or self.owner
        )

    async def set_role(self, user_id, role):
        async with self.sessions() as session:
            await session.execute(
                update(WorkspaceMember)
                .where(WorkspaceMember.workspace_id == self.ws_id, WorkspaceMember.user_id == user_id)
                .values(role=role)
            )
            await session.commit()

    async def save(self, key, settings, headers=None):
        return await self.client.put(
            f'/api/view-settings/{key}', json={'settings': settings}, headers=headers or self.owner
        )

    async def test_nothing_saved_means_defaults(self):
        self.assertEqual(await self.views(self.owner), {})
        self.assertEqual(await self.defaults(self.owner), {})

    async def test_an_admin_sets_the_default_for_everyone(self):
        board = {'layout': 'board', 'grouping': 'status'}
        res = await self.set_default('ads-manager.campaigns', board)
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json(), {'view_key': 'ads-manager.campaigns', 'settings': board})
        # Every member gets it; nobody's own view changes.
        self.assertEqual(await self.defaults(self.buyer), {'ads-manager.campaigns': board})
        self.assertEqual(await self.views(self.buyer), {})
        # Setting it again replaces it; an empty view clears it.
        await self.set_default('ads-manager.campaigns', {'layout': 'board'})
        self.assertEqual(await self.defaults(self.buyer), {'ads-manager.campaigns': {'layout': 'board'}})
        res = await self.set_default('ads-manager.campaigns', {})
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(await self.defaults(self.buyer), {})
        async with self.sessions() as session:
            self.assertEqual((await session.execute(select(WorkspaceViewDefault))).scalars().all(), [])

    async def test_only_admins_and_owners_set_defaults(self):
        for role in ('member', 'guest', 'buyer'):
            await self.set_role(self.buyer_id, role)
            res = await self.set_default('rules', {'grouping': 'none'}, headers=self.buyer)
            self.assertEqual(res.status_code, 403, role)
        self.assertEqual(await self.defaults(self.owner), {})
        await self.set_role(self.buyer_id, 'admin')
        res = await self.set_default('rules', {'grouping': 'none'}, headers=self.buyer)
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(await self.defaults(self.owner), {'rules': {'grouping': 'none'}})

    async def test_defaults_are_per_workspace_and_checked_like_views(self):
        await self.set_default('rules', RULES_VIEW)
        async with self.sessions() as session:
            await session.execute(
                update(User).where(User.id == self.owner_id).values(active_workspace_id=self.other_ws_id)
            )
            await session.commit()
        self.assertEqual(await self.defaults(self.owner), {})
        self.assertEqual((await self.set_default('Rules', RULES_VIEW)).status_code, 404)
        self.assertEqual((await self.set_default('rules', {'filters': ['x' * 20_000]})).status_code, 422)
        res = await self.client.put('/api/view-settings/rules/default', json={'settings': {}})
        self.assertIn(res.status_code, (401, 403))

    async def test_saved_view_comes_back_and_replaces_the_last_one(self):
        res = await self.save('rules', RULES_VIEW)
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json(), {'view_key': 'rules', 'settings': RULES_VIEW})
        self.assertEqual(await self.views(self.owner), {'rules': RULES_VIEW})

        changed = {**RULES_VIEW, 'direction': 'desc', 'filters': []}
        self.assertEqual((await self.save('rules', changed)).status_code, 200)
        self.assertEqual(await self.views(self.owner), {'rules': changed})
        async with self.sessions() as session:
            rows = (await session.execute(select(ViewSetting))).scalars().all()
        self.assertEqual(len(rows), 1)

    async def test_each_ads_manager_level_keeps_its_own_view(self):
        await self.save('ads-manager.campaigns', {'ordering': 'spend'})
        await self.save('ads-manager.adsets', {'ordering': 'name'})
        self.assertEqual(await self.views(self.owner), {
            'ads-manager.campaigns': {'ordering': 'spend'},
            'ads-manager.adsets': {'ordering': 'name'},
        })

    async def test_views_are_per_member(self):
        await self.save('rules', RULES_VIEW)
        self.assertEqual(await self.views(self.buyer), {})
        await self.save('rules', {'grouping': 'none'}, headers=self.buyer)
        self.assertEqual(await self.views(self.owner), {'rules': RULES_VIEW})
        self.assertEqual(await self.views(self.buyer), {'rules': {'grouping': 'none'}})

    async def test_views_are_per_workspace(self):
        await self.save('rules', RULES_VIEW)
        async with self.sessions() as session:
            await session.execute(
                update(User).where(User.id == self.owner_id).values(active_workspace_id=self.other_ws_id)
            )
            await session.commit()
        self.assertEqual(await self.views(self.owner), {})

    async def test_reset_returns_the_page_to_its_defaults(self):
        await self.save('rules', RULES_VIEW)
        await self.save('inbox', {'filters': []})
        res = await self.client.delete('/api/view-settings/rules', headers=self.owner)
        self.assertEqual(res.status_code, 204, res.text)
        self.assertEqual(await self.views(self.owner), {'inbox': {'filters': []}})
        # Resetting a view that was never changed is fine too.
        res = await self.client.delete('/api/view-settings/rules', headers=self.owner)
        self.assertEqual(res.status_code, 204)

    async def test_bad_keys_and_bodies_are_refused(self):
        for key in ('Rules', 'rules.', '-rules', 'a' * 40, 'rules.campaigns.ads', 'rules%20x'):
            res = await self.save(key, RULES_VIEW)
            self.assertEqual(res.status_code, 404, key)
        res = await self.client.put('/api/view-settings/rules', json={'settings': ['list']}, headers=self.owner)
        self.assertEqual(res.status_code, 422)
        res = await self.save('rules', {'filters': ['x' * 20_000]})
        self.assertEqual(res.status_code, 422)
        self.assertEqual(await self.views(self.owner), {})

    async def test_signed_out_requests_are_refused(self):
        self.assertEqual((await self.client.get('/api/view-settings')).status_code, 401)
        res = await self.client.put('/api/view-settings/rules', json={'settings': {}})
        self.assertIn(res.status_code, (401, 403))

    async def test_leaving_the_workspace_drops_the_views(self):
        await self.save('rules', RULES_VIEW, headers=self.buyer)
        async with self.sessions() as session:
            await session.execute(
                delete(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == self.ws_id, WorkspaceMember.user_id == self.buyer_id
                )
            )
            await session.commit()
            rows = (await session.execute(select(ViewSetting))).scalars().all()
        self.assertEqual(rows, [])


if __name__ == '__main__':
    unittest.main()
