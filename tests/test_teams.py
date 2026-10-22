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
                         role='buyer', is_approved=True)
            buyer = User(telegram_id='900000002', username='buyer', full_name='Boris Buyer',
                         role='buyer', is_approved=True)
            outsider = User(telegram_id='900000003', username='outsider', full_name='Oscar Outsider',
                            role='buyer', is_approved=True)
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

    async def test_new_workspace_starts_with_its_team(self):
        # Linear's workspace starts with a team named after it; its creator is on it.
        res = await self.client.post('/api/workspaces', json={'name': 'Canada Traffic'}, headers=self.owner)
        self.assertEqual(res.status_code, 200, res.text)
        workspace_id = res.json()['id']
        teams = (await self.client.get(f'/api/workspaces/{workspace_id}/teams', headers=self.owner)).json()
        self.assertEqual([(team['name'], team['key'], team['member_user_ids'], team['owner_user_ids']) for team in teams],
                         [('Canada Traffic', 'CAN', [self.owner_id], [self.owner_id])])

    async def test_new_members_and_accounts_join_the_default_team(self):
        from core.default_team import default_team_key, join_default_team

        self.assertEqual(default_team_key('12 Media buying'), 'MED')
        self.assertEqual(default_team_key('Канада'), 'TEAM')
        first = await self.create('First', 'FIR')
        await self.create('Second', 'SEC')
        async with self.sessions() as session:
            buyer_member = (await session.execute(select(WorkspaceMember.id).where(
                WorkspaceMember.workspace_id == self.ws_id, WorkspaceMember.user_id == self.buyer_id,
            ))).scalar_one()
            await join_default_team(session, self.ws_id, member_id=buyer_member, account_id=self.account_id)
            # Joining twice changes nothing.
            await session.flush()
            await join_default_team(session, self.ws_id, member_id=buyer_member, account_id=self.account_id)
            await session.commit()
        teams = {team['key']: team for team in (await self.client.get(self.url(), headers=self.owner)).json()}
        self.assertEqual(teams['FIR']['id'], first['id'])
        self.assertEqual(teams['FIR']['member_user_ids'], [self.owner_id, self.buyer_id])
        self.assertEqual(teams['FIR']['account_ids'], [self.account_id])
        self.assertEqual(teams['SEC']['account_ids'], [])

    async def test_team_documents(self):
        team = await self.create()
        docs = self.url(f"/{team['id']}/documents")
        # Linear's team Documents: any member writes them; the last edited comes first.
        first = await self.client.post(docs, json={'title': '  Launch plan ', 'content': '# Goals'}, headers=self.buyer)
        self.assertEqual(first.status_code, 201, first.text)
        self.assertEqual((first.json()['title'], first.json()['content']), ('Launch plan', '# Goals'))
        second = await self.client.post(docs, json={}, headers=self.owner)
        self.assertEqual(second.json()['title'], '')
        res = await self.client.patch(f"{docs}/{first.json()['id']}", json={'content': '# Goals\n- CPL under 5'},
                                      headers=self.owner)
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()['title'], 'Launch plan')
        self.assertEqual(res.json()['updated_by_user_id'], self.owner_id)
        listed = (await self.client.get(docs, headers=self.buyer)).json()
        self.assertEqual([item['id'] for item in listed], [first.json()['id'], second.json()['id']])

        # Outsiders find nothing; a document of another team is not found under this one.
        self.assertEqual((await self.client.get(docs, headers=self.outsider)).status_code, 404)
        other = await self.create('Growth', 'GRO')
        res = await self.client.patch(self.url(f"/{other['id']}/documents/{first.json()['id']}"), json={'title': 'X'},
                                      headers=self.owner)
        self.assertEqual(res.status_code, 404)

        res = await self.client.delete(f"{docs}/{second.json()['id']}", headers=self.buyer)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len((await self.client.get(docs, headers=self.owner)).json()), 1)

    async def test_only_owner_and_admin_manage_and_outsiders_see_nothing(self):
        team = await self.create()
        # As Linear's, any member creates a team and owns it; a guest can't.
        res = await self.client.post(self.url(), json={'name': 'B', 'key': 'B'}, headers=self.buyer)
        self.assertEqual(res.status_code, 201, res.text)
        self.assertEqual(res.json()['owner_user_ids'], [self.buyer_id])
        await self.client.delete(self.url(f"/{res.json()['id']}"), headers=self.buyer)
        for method, suffix, body in (
            ('PATCH', f"/{team['id']}", {'name': 'Y'}),
            ('POST', f"/{team['id']}/retire", None),
            ('DELETE', f"/{team['id']}", None),
            ('POST', f"/{team['id']}/members", {'user_ids': [self.owner_id]}),
            ('POST', f"/{team['id']}/members", {'user_ids': [self.buyer_id, self.owner_id]}),
            ('POST', f"/{team['id']}/accounts", {'account_ids': [self.account_id]}),
            ('DELETE', f"/{team['id']}/members/{self.owner_id}", None),
        ):
            res = await self.client.request(method, self.url(suffix), json=body, headers=self.buyer)
            self.assertEqual(res.status_code, 403, (method, suffix))

        # Linear's "Join a team": anyone may add themselves.
        res = await self.client.post(self.url(f"/{team['id']}/members"), json={'user_ids': [self.buyer_id]},
                                     headers=self.buyer)
        self.assertEqual(res.status_code, 200, res.text)
        self.assertTrue(res.json()['is_member'])

        res = await self.client.get(self.url(), headers=self.outsider)
        self.assertEqual(res.status_code, 404)
        # Another workspace's team id is not found here.
        res = await self.client.patch(
            f"/api/workspaces/{self.other_ws_id}/teams/{team['id']}", json={'name': 'Z'}, headers=self.outsider,
        )
        self.assertEqual(res.status_code, 404)

    async def test_team_owners_run_their_team(self):
        team = await self.create()
        tid = team['id']
        self.assertEqual(team['owner_user_ids'], [self.owner_id])
        await self.client.post(self.url(f'/{tid}/members'), json={'user_ids': [self.buyer_id]}, headers=self.owner)
        # A plain member can't rename the team or make owners.
        res = await self.client.patch(self.url(f'/{tid}'), json={'name': 'Renamed'}, headers=self.buyer)
        self.assertEqual(res.status_code, 403)
        res = await self.client.patch(self.url(f'/{tid}/members/{self.buyer_id}'), json={'is_owner': True}, headers=self.buyer)
        self.assertEqual(res.status_code, 403)

        # Made a team owner, the member runs the team without being a workspace admin.
        res = await self.client.patch(self.url(f'/{tid}/members/{self.buyer_id}'), json={'is_owner': True}, headers=self.owner)
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(sorted(res.json()['owner_user_ids']), sorted([self.owner_id, self.buyer_id]))
        res = await self.client.patch(self.url(f'/{tid}'), json={'name': 'Renamed'}, headers=self.buyer)
        self.assertEqual(res.status_code, 200, res.text)
        res = await self.client.post(self.url(f'/{tid}/accounts'), json={'account_ids': [self.account_id]}, headers=self.buyer)
        self.assertEqual(res.json()['account_ids'], [self.account_id])
        res = await self.client.patch(self.url(f'/{tid}/members/{self.owner_id}'), json={'is_owner': False}, headers=self.buyer)
        self.assertEqual(res.json()['owner_user_ids'], [self.buyer_id])

        # Only someone on the team can be its owner, and never a guest.
        res = await self.client.patch(self.url(f'/{tid}/members/{self.outsider_id}'), json={'is_owner': True}, headers=self.owner)
        self.assertEqual(res.status_code, 404)
        async with self.sessions() as session:
            await session.execute(
                update(WorkspaceMember).where(WorkspaceMember.user_id == self.buyer_id).values(role='guest')
            )
            await session.commit()
        res = await self.client.patch(self.url(f'/{tid}/members/{self.buyer_id}'), json={'is_owner': True}, headers=self.owner)
        self.assertEqual(res.status_code, 400)
        res = await self.client.post(self.url(), json={'name': 'G', 'key': 'G'}, headers=self.buyer)
        self.assertEqual(res.status_code, 403)

    async def account_ids_for(self, headers):
        res = await self.client.get('/api/accounts', headers=headers)
        self.assertEqual(res.status_code, 200, res.text)
        return [item['account_id'] for item in res.json()]

    async def test_private_teams_hide_their_accounts(self):
        team = await self.create()
        tid = team['id']
        await self.client.post(self.url(f'/{tid}/accounts'), json={'account_ids': [self.account_id]}, headers=self.owner)
        self.assertEqual(await self.account_ids_for(self.buyer), ['act_1'])

        res = await self.client.patch(self.url(f'/{tid}'), json={'private': True}, headers=self.owner)
        self.assertTrue(res.json()['private'])
        # Linear: a private team's work is its members' only; the team itself is hidden from others.
        self.assertEqual(await self.account_ids_for(self.buyer), [])
        self.assertEqual(await self.account_ids_for(self.owner), ['act_1'])
        res = await self.client.patch('/api/accounts/act_1/profile', json={'custom_name': 'X', 'note': ''}, headers=self.buyer)
        self.assertEqual(res.status_code, 404)
        self.assertEqual((await self.client.get(self.url(), headers=self.buyer)).json(), [])
        res = await self.client.get(self.url(f'/{tid}/documents'), headers=self.buyer)
        self.assertEqual(res.status_code, 404)
        # Joined only by invitation.
        res = await self.client.post(self.url(f'/{tid}/members'), json={'user_ids': [self.buyer_id]}, headers=self.buyer)
        self.assertEqual(res.status_code, 403)
        await self.client.post(self.url(f'/{tid}/members'), json={'user_ids': [self.buyer_id]}, headers=self.owner)
        self.assertEqual(await self.account_ids_for(self.buyer), ['act_1'])

        # An account also on a public team is everyone's again.
        await self.client.delete(self.url(f'/{tid}/members/{self.buyer_id}'), headers=self.owner)
        public = await self.create('Public', 'PUB')
        await self.client.post(self.url(f"/{public['id']}/accounts"), json={'account_ids': [self.account_id]}, headers=self.owner)
        self.assertEqual(await self.account_ids_for(self.buyer), ['act_1'])

    async def test_guests_work_only_inside_their_teams(self):
        team = await self.create()
        tid = team['id']
        await self.client.post(self.url(f'/{tid}/accounts'), json={'account_ids': [self.account_id]}, headers=self.owner)
        async with self.sessions() as session:
            await session.execute(
                update(WorkspaceMember).where(WorkspaceMember.user_id == self.buyer_id).values(role='guest')
            )
            await session.commit()
        # Off every team, a guest sees no account and no team.
        self.assertEqual(await self.account_ids_for(self.buyer), [])
        self.assertEqual((await self.client.get(self.url(), headers=self.buyer)).json(), [])

        await self.client.post(self.url(f'/{tid}/members'), json={'user_ids': [self.buyer_id]}, headers=self.owner)
        self.assertEqual(await self.account_ids_for(self.buyer), ['act_1'])
        self.assertEqual([item['key'] for item in (await self.client.get(self.url(), headers=self.buyer)).json()], ['MED'])
        # Inside the team the guest works as a member: on the account itself, and on team documents.
        res = await self.client.patch('/api/accounts/act_1/profile', json={'custom_name': 'Mine', 'note': ''}, headers=self.buyer)
        self.assertEqual(res.status_code, 200, res.text)
        res = await self.client.post(self.url(f'/{tid}/documents'), json={'title': 'Notes'}, headers=self.buyer)
        self.assertEqual(res.status_code, 201, res.text)
        # Workspace-wide things stay closed.
        res = await self.client.post('/api/account-groups', json={'name': 'G', 'account_ids': []}, headers=self.buyer)
        self.assertEqual(res.status_code, 403)

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

        # Leaving the workspace takes a member off its teams (the workspace made for them
        # in its place has a default team of its own).
        await self.client.post(self.url(f'/{tid}/members'), json={'user_ids': [self.buyer_id]}, headers=self.owner)
        res = await self.client.post(f'/api/workspaces/{self.ws_id}/leave', json={}, headers=self.buyer)
        self.assertEqual(res.status_code, 200, res.text)
        async with self.sessions() as session:
            left = (await session.execute(
                select(TeamMember).join(WorkspaceMember, WorkspaceMember.id == TeamMember.member_id)
                .join(Team, Team.id == TeamMember.team_id)
                .where(WorkspaceMember.user_id == self.buyer_id, Team.workspace_id == self.ws_id)
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
