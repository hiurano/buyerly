"""Settings → Administration → Teams (#371): the teams API as Linear's pages use it."""

import unittest
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import api.auth as api_auth_module
import api.routes as api_routes_module
import api.server as api_server_module
from api.server import create_app
from core.rate_limit import limiter
from database.db import hash_password
from database.models import Account, Team, TeamMember, User, Workspace, WorkspaceMember
from tests.test_db_helper import create_test_engine, init_test_db, session_headers


class TestTeams(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await limiter.reset()
        self.engine = create_test_engine()
        self.sessions = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        await init_test_db(self.engine)
        api_routes_module.async_session_maker = self.sessions
        api_auth_module.async_session_maker = self.sessions
        api_server_module.async_session_maker = self.sessions

        async with self.sessions() as session:
            owner = User(telegram_id='900000001', username='owner', full_name='Olga Owner',
                         password_hash=hash_password('x'), role='buyer', is_approved=True)
            buyer = User(telegram_id='900000002', username='buyer', full_name='Boris Buyer',
                         password_hash=hash_password('x'), role='buyer', is_approved=True)
            outsider = User(telegram_id='900000003', username='outsider', full_name='Oscar Outsider',
                            password_hash=hash_password('x'), role='buyer', is_approved=True)
            session.add_all([owner, buyer, outsider])
            await session.flush()
            ws = Workspace(name='Buyerly', slug='buyerly', owner_user_id=owner.id)
            other = Workspace(name='Other', slug='other', owner_user_id=outsider.id)
            session.add_all([ws, other])
            await session.flush()
            session.add_all([
                WorkspaceMember(workspace_id=ws.id, user_id=owner.id, role='owner'),
                WorkspaceMember(workspace_id=ws.id, user_id=buyer.id, role='buyer'),
                WorkspaceMember(workspace_id=other.id, user_id=outsider.id, role='owner'),
            ])
            owner.active_workspace_id = ws.id
            buyer.active_workspace_id = ws.id
            outsider.active_workspace_id = other.id
            mine = Account(account_id='act_1', name='Mine', workspace_id=ws.id, owner_user_id=owner.id)
            foreign = Account(account_id='act_2', name='Foreign', workspace_id=other.id, owner_user_id=outsider.id)
            session.add_all([mine, foreign])
            await session.commit()
            self.ws_id, self.other_ws_id = ws.id, other.id
            self.owner_id, self.buyer_id, self.outsider_id = owner.id, buyer.id, outsider.id
            self.account_id, self.foreign_account_id = mine.id, foreign.id

        self.owner = await session_headers(self.sessions, {'id': 900000001, 'username': 'owner'})
        self.buyer = await session_headers(self.sessions, {'id': 900000002, 'username': 'buyer'})
        self.outsider = await session_headers(self.sessions, {'id': 900000003, 'username': 'outsider'})
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url='http://test')

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.engine.dispose()

    def url(self, suffix=''):
        return f'/api/workspaces/{self.ws_id}/teams{suffix}'

    async def create(self, name='Media buying', key='med'):
        res = await self.client.post(self.url(), json={'name': name, 'key': key}, headers=self.owner)
        self.assertEqual(res.status_code, 201, res.text)
        return res.json()

    async def test_create_list_update_and_creator_joins(self):
        team = await self.create()
        self.assertEqual(team['key'], 'MED')
        self.assertEqual(team['member_user_ids'], [self.owner_id])
        self.assertTrue(team['is_member'])

        # Linear: names and identifiers are unique, whatever the case.
        for body, detail in (
            ({'name': 'media BUYING', 'key': 'OTH'}, 'A team with this name already exists'),
            ({'name': 'Other', 'key': 'Med'}, 'A team with this identifier already exists'),
        ):
            res = await self.client.post(self.url(), json=body, headers=self.owner)
            self.assertEqual(res.status_code, 409)
            self.assertEqual(res.json()['detail'], detail)
        for key in ('', '1AB', 'AB-C', 'ABCDEFGH'):
            res = await self.client.post(self.url(), json={'name': 'X', 'key': key}, headers=self.owner)
            self.assertIn(res.status_code, (400, 422), key)
        res = await self.client.post(self.url(), json={'name': '   ', 'key': 'X'}, headers=self.owner)
        self.assertEqual(res.status_code, 400)

        res = await self.client.patch(
            self.url(f"/{team['id']}"),
            json={'name': '  Growth  team ', 'key': 'grw', 'description': 'Scales winners'},
            headers=self.owner,
        )
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual((res.json()['name'], res.json()['key'], res.json()['description']),
                         ('Growth team', 'GRW', 'Scales winners'))

        listed = (await self.client.get(self.url(), headers=self.buyer)).json()
        self.assertEqual([item['key'] for item in listed], ['GRW'])
        self.assertFalse(listed[0]['is_member'])

    async def test_only_owner_and_admin_manage_and_outsiders_see_nothing(self):
        team = await self.create()
        res = await self.client.post(self.url(), json={'name': 'B', 'key': 'B'}, headers=self.buyer)
        self.assertEqual(res.status_code, 403)
        for method, suffix, body in (
            ('PATCH', f"/{team['id']}", {'name': 'Y'}),
            ('POST', f"/{team['id']}/retire", None),
            ('DELETE', f"/{team['id']}", None),
            ('POST', f"/{team['id']}/members", {'user_ids': [self.buyer_id]}),
            ('POST', f"/{team['id']}/accounts", {'account_ids': [self.account_id]}),
            ('DELETE', f"/{team['id']}/members/{self.owner_id}", None),
        ):
            res = await self.client.request(method, self.url(suffix), json=body, headers=self.buyer)
            self.assertEqual(res.status_code, 403, (method, suffix))

        res = await self.client.get(self.url(), headers=self.outsider)
        self.assertEqual(res.status_code, 404)
        # Another workspace's team id is not found here.
        res = await self.client.patch(
            f"/api/workspaces/{self.other_ws_id}/teams/{team['id']}", json={'name': 'Z'}, headers=self.outsider,
        )
        self.assertEqual(res.status_code, 404)

    async def test_members_and_accounts(self):
        team = await self.create()
        tid = team['id']
        res = await self.client.post(self.url(f'/{tid}/members'), json={'user_ids': [self.buyer_id, self.owner_id]},
                                     headers=self.owner)
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()['member_user_ids'], [self.owner_id, self.buyer_id])
        res = await self.client.post(self.url(f'/{tid}/members'), json={'user_ids': [self.outsider_id]},
                                     headers=self.owner)
        self.assertEqual(res.status_code, 400)

        res = await self.client.post(self.url(f'/{tid}/accounts'), json={'account_ids': [self.account_id]},
                                     headers=self.owner)
        self.assertEqual(res.json()['account_ids'], [self.account_id])
        res = await self.client.post(self.url(f'/{tid}/accounts'), json={'account_ids': [self.foreign_account_id]},
                                     headers=self.owner)
        self.assertEqual(res.status_code, 400)
        res = await self.client.delete(self.url(f'/{tid}/accounts/{self.account_id}'), headers=self.owner)
        self.assertEqual(res.json()['account_ids'], [])

        # A buyer may leave a team, not take others off it.
        res = await self.client.delete(self.url(f'/{tid}/members/{self.buyer_id}'), headers=self.buyer)
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()['member_user_ids'], [self.owner_id])
        res = await self.client.delete(self.url(f'/{tid}/members/{self.buyer_id}'), headers=self.owner)
        self.assertEqual(res.status_code, 404)

        # Leaving the workspace takes a member off its teams.
        await self.client.post(self.url(f'/{tid}/members'), json={'user_ids': [self.buyer_id]}, headers=self.owner)
        res = await self.client.post(f'/api/workspaces/{self.ws_id}/leave', json={}, headers=self.buyer)
        self.assertEqual(res.status_code, 200, res.text)
        async with self.sessions() as session:
            left = (await session.execute(
                select(TeamMember).join(WorkspaceMember, WorkspaceMember.id == TeamMember.member_id)
                .where(WorkspaceMember.user_id == self.buyer_id)
            )).scalars().all()
        self.assertEqual(left, [])

    async def test_retire_delete_and_restore(self):
        team = await self.create()
        tid = team['id']
        res = await self.client.post(self.url(f'/{tid}/retire'), headers=self.owner)
        self.assertIsNotNone(res.json()['retired_at'])
        self.assertEqual((await self.client.get(self.url('?status=active'), headers=self.owner)).json(), [])
        retired = (await self.client.get(self.url('?status=retired'), headers=self.owner)).json()
        self.assertEqual([item['id'] for item in retired], [tid])
        res = await self.client.post(self.url(f'/{tid}/restore'), headers=self.owner)
        self.assertIsNone(res.json()['retired_at'])

        res = await self.client.delete(self.url(f'/{tid}'), headers=self.owner)
        self.assertEqual(res.status_code, 200)
        self.assertEqual((await self.client.get(self.url(), headers=self.owner)).json(), [])
        deleted = (await self.client.get(self.url('?status=deleted'), headers=self.owner)).json()
        self.assertEqual([item['id'] for item in deleted], [tid])
        self.assertIsNotNone(deleted[0]['restorable_until'])

        # A deleted team frees its name and identifier; restoring then needs them back.
        clash = await self.create()
        res = await self.client.post(self.url(f'/{tid}/restore'), headers=self.owner)
        self.assertEqual(res.status_code, 409)
        await self.client.delete(self.url(f"/{clash['id']}"), headers=self.owner)
        res = await self.client.post(self.url(f'/{tid}/restore'), headers=self.owner)
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()['member_user_ids'], [self.owner_id])

        # After 30 days a deleted team is gone for good.
        await self.client.delete(self.url(f'/{tid}'), headers=self.owner)
        async with self.sessions() as session:
            await session.execute(
                update(Team).where(Team.workspace_id == self.ws_id)
                .values(deleted_at=datetime.now(timezone.utc) - timedelta(days=31))
            )
            await session.commit()
        self.assertEqual((await self.client.get(self.url('?status=deleted'), headers=self.owner)).json(), [])
        res = await self.client.post(self.url(f'/{tid}/restore'), headers=self.owner)
        self.assertEqual(res.status_code, 404)


if __name__ == '__main__':
    unittest.main()
