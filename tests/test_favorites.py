"""Favorites per member, as Linear's star and sidebar section: /api/favorites."""

import unittest

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import api.auth as api_auth_module
import api.routes as api_routes_module
import api.server as api_server_module
from api.server import create_app
from core.rate_limit import limiter
from database.models import Favorite, User, Workspace, WorkspaceMember, utcnow
from tests.test_db_helper import create_test_engine, init_test_db, session_headers

RULES = {"kind": "page", "path": "team/TES/rules", "title": "Rules"}
ACCOUNT = {"kind": "account", "path": "accounts/act_1001", "title": "Nutra US"}


class TestFavorites(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await limiter.reset()
        self.engine = create_test_engine()
        self.sessions = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        await init_test_db(self.engine)
        api_routes_module.async_session_maker = self.sessions
        api_auth_module.async_session_maker = self.sessions
        api_server_module.async_session_maker = self.sessions
        import api.routers.favorites as favorites_module
        favorites_module.async_session_maker = self.sessions

        async with self.sessions() as session:
            owner = User(telegram_id='920000001', username='owner', full_name='Olga Owner',
                         role='buyer', is_approved=True)
            buyer = User(telegram_id='920000002', username='buyer', full_name='Boris Buyer',
                         role='buyer', is_approved=True)
            session.add_all([owner, buyer])
            await session.flush()
            ws = Workspace(name='Buyerly', slug='buyerly', owner_user_id=owner.id)
            other = Workspace(name='Other', slug='other', owner_user_id=owner.id)
            session.add_all([ws, other])
            await session.flush()
            owner_member = WorkspaceMember(workspace_id=ws.id, user_id=owner.id, role='owner')
            session.add_all([
                owner_member,
                WorkspaceMember(workspace_id=ws.id, user_id=buyer.id, role='buyer'),
                WorkspaceMember(workspace_id=other.id, user_id=owner.id, role='owner'),
            ])
            owner.active_workspace_id = ws.id
            buyer.active_workspace_id = ws.id
            await session.commit()
            self.ws_id, self.other_ws_id = ws.id, other.id
            self.owner_id, self.owner_member_id = owner.id, owner_member.id

        self.owner = await session_headers(self.sessions, {'id': 920000001, 'username': 'owner'})
        self.buyer = await session_headers(self.sessions, {'id': 920000002, 'username': 'buyer'})
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url='http://test')

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.engine.dispose()

    async def favorites(self, headers):
        res = await self.client.get('/api/favorites', headers=headers)
        self.assertEqual(res.status_code, 200, res.text)
        return res.json()['favorites']

    async def test_starring_lists_a_favorite_once_in_the_order_starred(self):
        self.assertEqual(await self.favorites(self.owner), [])

        first = await self.client.post('/api/favorites', json=RULES, headers=self.owner)
        self.assertEqual(first.status_code, 201, first.text)
        second = await self.client.post('/api/favorites', json=ACCOUNT, headers=self.owner)
        self.assertEqual(second.status_code, 201, second.text)
        again = await self.client.post('/api/favorites', json={**RULES, 'title': 'Renamed'}, headers=self.owner)
        self.assertEqual(again.status_code, 200, again.text)
        self.assertEqual(again.json()['id'], first.json()['id'])

        listed = await self.favorites(self.owner)
        self.assertEqual([item['path'] for item in listed], ['team/TES/rules', 'accounts/act_1001'])
        self.assertEqual(listed[0]['title'], 'Rules')
        self.assertEqual(listed[1]['kind'], 'account')

    async def test_favorites_are_each_members_own_in_each_workspace(self):
        await self.client.post('/api/favorites', json=RULES, headers=self.owner)
        self.assertEqual(await self.favorites(self.buyer), [])

        async with self.sessions() as session:
            await session.execute(update(User).where(User.id == self.owner_id).values(active_workspace_id=self.other_ws_id))
            await session.commit()
        self.assertEqual(await self.favorites(self.owner), [])

    async def test_unstarring_removes_only_your_own(self):
        created = (await self.client.post('/api/favorites', json=RULES, headers=self.owner)).json()

        foreign = await self.client.delete(f"/api/favorites/{created['id']}", headers=self.buyer)
        self.assertEqual(foreign.status_code, 204)
        self.assertEqual(len(await self.favorites(self.owner)), 1)

        own = await self.client.delete(f"/api/favorites/{created['id']}", headers=self.owner)
        self.assertEqual(own.status_code, 204)
        self.assertEqual(await self.favorites(self.owner), [])
        gone = await self.client.delete(f"/api/favorites/{created['id']}", headers=self.owner)
        self.assertEqual(gone.status_code, 204)

    async def test_rejects_unknown_kinds_foreign_addresses_and_empty_names(self):
        for payload in (
            {**RULES, 'kind': 'issue'},
            {**RULES, 'path': '/buyerly/rules'},
            {**RULES, 'path': 'team/../admin'},
            {**RULES, 'path': 'https://example.com'},
            {**RULES, 'title': '   '},
            {**RULES, 'title': 'x' * 201},
        ):
            res = await self.client.post('/api/favorites', json=payload, headers=self.owner)
            self.assertEqual(res.status_code, 422, payload)
        self.assertEqual(await self.favorites(self.owner), [])

    async def test_a_member_keeps_at_most_a_hundred(self):
        async with self.sessions() as session:
            session.add_all([
                Favorite(member_id=self.owner_member_id, kind='page', path=f'page-{n}', title=f'Page {n}',
                         position=n, created_at=utcnow())
                for n in range(100)
            ])
            await session.commit()
        res = await self.client.post('/api/favorites', json=RULES, headers=self.owner)
        self.assertEqual(res.status_code, 400, res.text)
        async with self.sessions() as session:
            count = len((await session.execute(select(Favorite.id))).all())
        self.assertEqual(count, 100)


if __name__ == '__main__':
    unittest.main()
