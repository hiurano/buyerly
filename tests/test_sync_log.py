"""The sync engine's change log (#504): sync ids, sync groups, one entry per write."""

import unittest
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import api.auth as api_auth_module
import api.routes as api_routes_module
import api.server as api_server_module
from api.server import create_app
from core.rate_limit import limiter
from database.models import (
    Account,
    AuditEvent,
    Favorite,
    InboxNotificationState,
    SyncAction,
    Team,
    TeamAccount,
    TeamMember,
    User,
    Workspace,
    WorkspaceMember,
)
from database.sync_log import (
    changes_since,
    compact_sync_log,
    last_sync_id,
    member_sync_groups,
    needs_bootstrap,
)
from tests.test_db_helper import create_test_engine, init_test_db, session_headers


class TestSyncLog(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await limiter.reset()
        self.engine = create_test_engine()
        self.sessions = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        await init_test_db(self.engine)
        api_routes_module.async_session_maker = self.sessions
        api_auth_module.async_session_maker = self.sessions
        api_server_module.async_session_maker = self.sessions
        import api.routers.favorites as favorites_module
        import api.routers.rules as rules_module
        import api.routers.teams as teams_module
        import api.routers.views as views_module
        for module in (favorites_module, rules_module, teams_module, views_module):
            module.async_session_maker = self.sessions

        async with self.sessions() as session:
            owner = User(telegram_id='950000001', username='owner', full_name='Olga Owner',
                         role='buyer', is_approved=True)
            buyer = User(telegram_id='950000002', username='buyer', full_name='Boris Buyer',
                         role='buyer', is_approved=True)
            guest = User(telegram_id='950000003', username='guest', full_name='Gina Guest',
                         role='buyer', is_approved=True)
            session.add_all([owner, buyer, guest])
            await session.flush()
            ws = Workspace(name='Buyerly', slug='buyerly', owner_user_id=owner.id)
            other = Workspace(name='Other', slug='other', owner_user_id=owner.id)
            session.add_all([ws, other])
            await session.flush()
            self.owner_member = WorkspaceMember(workspace_id=ws.id, user_id=owner.id, role='owner')
            self.buyer_member = WorkspaceMember(workspace_id=ws.id, user_id=buyer.id, role='member')
            self.guest_member = WorkspaceMember(workspace_id=ws.id, user_id=guest.id, role='guest')
            self.other_member = WorkspaceMember(workspace_id=other.id, user_id=owner.id, role='owner')
            session.add_all([self.owner_member, self.buyer_member, self.guest_member, self.other_member])
            for user in (owner, buyer, guest):
                user.active_workspace_id = ws.id
            await session.flush()

            # A public team with the buyer and the guest, a private one with the owner alone.
            public = Team(workspace_id=ws.id, name='Media', key='MED')
            private = Team(workspace_id=ws.id, name='Secret', key='SEC', private=True)
            session.add_all([public, private])
            await session.flush()
            session.add_all([
                TeamMember(team_id=public.id, member_id=self.buyer_member.id),
                TeamMember(team_id=public.id, member_id=self.guest_member.id),
                TeamMember(team_id=private.id, member_id=self.owner_member.id, is_owner=True),
            ])
            loose = Account(account_id='act_100', name='No team', workspace_id=ws.id, owner_user_id=owner.id)
            shared = Account(account_id='act_101', name='Public', workspace_id=ws.id, owner_user_id=owner.id)
            hidden = Account(account_id='act_102', name='Private', workspace_id=ws.id, owner_user_id=owner.id,
                             access_token_encrypted='secret-token')
            session.add_all([loose, shared, hidden])
            await session.flush()
            session.add_all([
                TeamAccount(team_id=public.id, account_id=shared.id),
                TeamAccount(team_id=private.id, account_id=hidden.id),
            ])
            await session.commit()
            self.ws_id, self.other_ws_id = ws.id, other.id
            self.owner_id, self.buyer_id, self.guest_id = owner.id, buyer.id, guest.id
            self.public_id, self.private_id = public.id, private.id
            self.loose_id, self.shared_id, self.hidden_id = loose.id, shared.id, hidden.id

        self.owner = await session_headers(self.sessions, {'id': 950000001, 'username': 'owner'})
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url='http://test')

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.engine.dispose()

    async def last(self) -> int:
        async with self.sessions() as session:
            return await last_sync_id(session)

    async def entries(self, after: int, model: str | None = None, model_id=None) -> list[SyncAction]:
        async with self.sessions() as session:
            query = select(SyncAction).where(SyncAction.sync_id > after).order_by(SyncAction.sync_id)
            if model:
                query = query.where(SyncAction.model == model)
            if model_id is not None:
                query = query.where(SyncAction.model_id == str(model_id))
            return (await session.execute(query)).scalars().all()

    async def one(self, after: int, model: str, model_id) -> SyncAction:
        found = await self.entries(after, model, model_id)
        self.assertEqual(len(found), 1, [(e.model, e.model_id, e.action, e.data) for e in found])
        return found[0]

    async def groups_of(self, member) -> list[str]:
        async with self.sessions() as session:
            return await member_sync_groups(session, member)

    # One entry per write, through the API

    async def test_api_writes_leave_one_entry_each(self):
        teams = f'/api/workspaces/{self.ws_id}/teams'

        mark = await self.last()
        res = await self.client.post(teams, json={'name': 'Growth', 'key': 'grw'}, headers=self.owner)
        self.assertEqual(res.status_code, 201, res.text)
        team_id = res.json()['id']
        created = await self.one(mark, 'Team', team_id)
        self.assertEqual((created.action, created.data['name'], created.data['key']), ('insert', 'Growth', 'GRW'))
        self.assertEqual(created.sync_groups, [f'team:{team_id}'])
        joined = (await self.entries(mark, 'TeamMember'))
        self.assertEqual(len(joined), 1)
        self.assertEqual(joined[0].sync_groups, [f'team:{team_id}', f'member:{self.owner_member.id}'])

        mark = await self.last()
        res = await self.client.patch(f'{teams}/{team_id}', json={'description': 'Scales winners'}, headers=self.owner)
        self.assertEqual(res.status_code, 200, res.text)
        changed = await self.one(mark, 'Team', team_id)
        self.assertEqual(changed.action, 'update')
        self.assertEqual(changed.data['description'], 'Scales winners')
        self.assertNotIn('name', changed.data)

        mark = await self.last()
        res = await self.client.post(f'{teams}/{team_id}/accounts', json={'account_ids': [self.loose_id]},
                                     headers=self.owner)
        self.assertEqual(res.status_code, 200, res.text)
        link = (await self.entries(mark, 'TeamAccount'))
        self.assertEqual(len(link), 1)
        self.assertEqual(link[0].action, 'insert')

        mark = await self.last()
        res = await self.client.post(f'{teams}/{team_id}/documents', json={'title': 'Playbook', 'content': '# Hi'},
                                     headers=self.owner)
        self.assertEqual(res.status_code, 201, res.text)
        document = await self.one(mark, 'TeamDocument', res.json()['id'])
        self.assertEqual((document.action, document.sync_groups), ('insert', [f'team:{team_id}']))

        mark = await self.last()
        res = await self.client.post('/api/favorites', json={'kind': 'page', 'path': 'team/GRW/rules',
                                                             'title': 'Rules'}, headers=self.owner)
        self.assertEqual(res.status_code, 201, res.text)
        favorite = await self.one(mark, 'Favorite', res.json()['id'])
        self.assertEqual(favorite.sync_groups, [f'member:{self.owner_member.id}'])

        mark = await self.last()
        res = await self.client.put('/api/view-settings/rules', json={'settings': {'layout': 'board'}},
                                    headers=self.owner)
        self.assertEqual(res.status_code, 200, res.text)
        view = await self.entries(mark, 'ViewSetting')
        self.assertEqual(len(view), 1)
        self.assertEqual(view[0].sync_groups, [f'member:{self.owner_member.id}'])

        mark = await self.last()
        res = await self.client.post('/api/rule-labels', json={'name': 'Scaling', 'description': ''},
                                     headers=self.owner)
        self.assertEqual(res.status_code, 200, res.text)
        label = await self.one(mark, 'Label', res.json()['id'])
        self.assertEqual(label.sync_groups, [f'workspace:{self.ws_id}'])

        mark = await self.last()
        res = await self.client.post('/api/presets', json={
            'name': 'Stop at $4', 'action': 'notify_only',
            'conditions': [{'metric': 'spend', 'operator': 'gte', 'value': 4.0, 'time_window': 'today'}],
        }, headers=self.owner)
        self.assertEqual(res.status_code, 200, res.text)
        rule = await self.one(mark, 'Rule', res.json()['id'])
        self.assertEqual((rule.action, rule.sync_groups), ('insert', [f'workspace:{self.ws_id}:members']))

        mark = await self.last()
        res = await self.client.delete(f'{teams}/{team_id}', headers=self.owner)
        self.assertEqual(res.status_code, 200, res.text)
        archived = await self.one(mark, 'Team', team_id)
        self.assertEqual(archived.action, 'archive')
        self.assertIn('deleted_at', archived.data)

    # Ordering and transactions

    async def test_sync_ids_increase_in_commit_order(self):
        async with self.sessions() as first, self.sessions() as second:
            first.add(Favorite(member_id=self.owner_member.id, kind='page', path='a', title='A'))
            await first.flush()
            second.add(Favorite(member_id=self.owner_member.id, kind='page', path='b', title='B'))
            await second.flush()
            # Written first, committed last: it comes after in the log.
            await second.commit()
            await first.commit()
        entries = await self.entries(0, 'Favorite')
        self.assertEqual([e.data['path'] for e in entries], ['b', 'a'])
        self.assertLess(entries[1].id, entries[0].id)
        self.assertLess(entries[0].sync_id, entries[1].sync_id)

        # Within one transaction the entries keep the order of the writes.
        async with self.sessions() as session:
            for path in ('c', 'd', 'e'):
                session.add(Favorite(member_id=self.owner_member.id, kind='page', path=path, title=path))
                await session.flush()
            await session.commit()
        entries = await self.entries(entries[1].sync_id, 'Favorite')
        self.assertEqual([e.data['path'] for e in entries], ['c', 'd', 'e'])
        self.assertEqual([e.sync_id for e in entries], sorted(e.sync_id for e in entries))

    async def test_entries_are_written_in_the_writes_transaction(self):
        mark = await self.last()
        async with self.sessions() as session:
            favorite = Favorite(member_id=self.owner_member.id, kind='page', path='x', title='X')
            session.add(favorite)
            await session.flush()
            # Visible inside the transaction already, with its sync id still to come at commit.
            pending = (await session.execute(
                select(SyncAction).where(SyncAction.model == 'Favorite', SyncAction.model_id == str(favorite.id))
            )).scalar_one()
            self.assertIsNone(pending.sync_id)
            await session.rollback()
        self.assertEqual(await self.entries(mark), [])
        async with self.sessions() as session:
            self.assertEqual((await session.execute(select(func.count()).select_from(SyncAction)
                                                    .where(SyncAction.sync_id.is_(None)))).scalar_one(), 0)

    async def test_bulk_statements_and_cascades_are_logged(self):
        mark = await self.last()
        async with self.sessions() as session:
            await session.execute(update(Account).where(Account.workspace_id == self.ws_id).values(note='bulk'))
            await session.commit()
        notes = await self.entries(mark, 'Account')
        self.assertEqual(sorted(int(e.model_id) for e in notes), sorted([self.loose_id, self.shared_id, self.hidden_id]))
        self.assertTrue(all(e.action == 'update' and e.data == {'note': 'bulk'} for e in notes))

        # Deleting a team takes its members and account links with it, each logged.
        mark = await self.last()
        async with self.sessions() as session:
            await session.execute(delete(Team).where(Team.id == self.public_id))
            await session.commit()
        gone = [(e.model, e.action) for e in await self.entries(mark)]
        self.assertEqual(gone.count(('Team', 'delete')), 1)
        self.assertEqual(gone.count(('TeamMember', 'delete')), 2)
        self.assertEqual(gone.count(('TeamAccount', 'delete')), 1)

    async def test_secrets_and_bookkeeping_stay_out_of_the_log(self):
        hidden = await self.one(0, 'Account', self.hidden_id)
        self.assertNotIn('access_token_encrypted', hidden.data)
        self.assertNotIn('access_token', hidden.data)

        mark = await self.last()
        async with self.sessions() as session:
            user = await session.get(User, self.owner_id)
            user.auth_token = 'legacy'
            user.onboarding_step = 'completed'
            await session.commit()
        self.assertEqual(await self.entries(mark), [])

        async with self.sessions() as session:
            user = await session.get(User, self.owner_id)
            user.full_name = 'Olga O.'
            await session.commit()
        renamed = await self.one(mark, 'User', self.owner_id)
        self.assertEqual(renamed.data, {'full_name': 'Olga O.'})
        # The owner is in both workspaces: both hear of it.
        self.assertEqual(renamed.sync_groups, [f'workspace:{self.ws_id}', f'workspace:{self.other_ws_id}'])

    # Sync groups

    async def test_each_model_goes_to_the_groups_that_may_see_it(self):
        accounts = {e.model_id: e.sync_groups for e in await self.entries(0, 'Account')}
        # Accounts were inserted before their teams were linked; the team links follow.
        self.assertEqual(accounts[str(self.loose_id)], [f'workspace:{self.ws_id}:members'])

        mark = await self.last()
        async with self.sessions() as session:
            await session.execute(update(Account).where(Account.workspace_id == self.ws_id).values(name='Renamed'))
            await session.commit()
        accounts = {int(e.model_id): e.sync_groups for e in await self.entries(mark, 'Account')}
        self.assertEqual(accounts, {
            self.loose_id: [f'workspace:{self.ws_id}:members'],
            self.shared_id: [f'team:{self.public_id}'],
            self.hidden_id: [f'team:{self.private_id}'],
        })

        member = await self.one(0, 'WorkspaceMember', self.buyer_member.id)
        self.assertEqual(member.sync_groups, [f'workspace:{self.ws_id}'])
        self.assertNotIn('inbox_display', member.data)

        # A member's own Inbox options go to them alone.
        mark = await self.last()
        async with self.sessions() as session:
            row = await session.get(WorkspaceMember, self.buyer_member.id)
            row.inbox_display = {'ordering': 'oldest'}
            await session.commit()
        private = await self.one(mark, 'WorkspaceMember', self.buyer_member.id)
        self.assertEqual((private.sync_groups, private.data), ([f'member:{self.buyer_member.id}'],
                                                               {'inbox_display': {'ordering': 'oldest'}}))

        # An Inbox event follows its ad account; the member's state on it is theirs.
        mark = await self.last()
        async with self.sessions() as session:
            event = AuditEvent(workspace_id=self.ws_id, event_type='RULE_STOP', account_id='act_102')
            loose = AuditEvent(workspace_id=self.ws_id, event_type='TOKEN_ERROR')
            session.add_all([event, loose])
            await session.flush()
            session.add(InboxNotificationState(user_id=self.owner_id, audit_event_id=event.id, is_read=True))
            await session.commit()
            event_id, loose_id = event.id, loose.id
        self.assertEqual((await self.one(mark, 'InboxEvent', event_id)).sync_groups, [f'team:{self.private_id}'])
        self.assertEqual((await self.one(mark, 'InboxEvent', loose_id)).sync_groups,
                         [f'workspace:{self.ws_id}:members'])
        state = (await self.entries(mark, 'InboxNotificationState'))[0]
        self.assertEqual(state.sync_groups, [f'member:{self.owner_member.id}'])

    async def test_member_sync_groups_follow_role_and_teams(self):
        ws = self.ws_id
        self.assertEqual(await self.groups_of(self.owner_member), sorted([
            f'workspace:{ws}', f'workspace:{ws}:members', f'member:{self.owner_member.id}',
            f'team:{self.public_id}', f'team:{self.private_id}',
        ]))
        self.assertEqual(await self.groups_of(self.buyer_member), sorted([
            f'workspace:{ws}', f'workspace:{ws}:members', f'member:{self.buyer_member.id}', f'team:{self.public_id}',
        ]))
        # A guest has only their own teams, and none of the workspace-wide data guests don't see.
        self.assertEqual(await self.groups_of(self.guest_member), sorted([
            f'workspace:{ws}', f'member:{self.guest_member.id}', f'team:{self.public_id}',
        ]))

    async def test_changes_since_returns_what_the_member_may_see(self):
        mark = await self.last()
        async with self.sessions() as session:
            await session.execute(update(Account).where(Account.workspace_id == self.ws_id).values(note='seen?'))
            session.add(Favorite(member_id=self.buyer_member.id, kind='page', path='mine', title='Mine'))
            await session.commit()

        async def seen(member):
            async with self.sessions() as session:
                rows = await changes_since(session, await member_sync_groups(session, member), mark)
            return sorted((e.model, int(e.model_id)) for e in rows if e.model == 'Account') + \
                [e.model for e in rows if e.model == 'Favorite']

        self.assertEqual(await seen(self.owner_member),
                         [('Account', self.loose_id), ('Account', self.shared_id), ('Account', self.hidden_id)])
        self.assertEqual(await seen(self.buyer_member),
                         [('Account', self.loose_id), ('Account', self.shared_id), 'Favorite'])
        self.assertEqual(await seen(self.guest_member), [('Account', self.shared_id)])

        async with self.sessions() as session:
            everything = await changes_since(session, await member_sync_groups(session, self.owner_member), 0)
        self.assertEqual([e.sync_id for e in everything], sorted(e.sync_id for e in everything))

    async def test_catching_up_is_one_indexed_query(self):
        async with self.sessions() as session:
            await session.execute(text('SET LOCAL enable_seqscan = off'))
            plan = '\n'.join(row[0] for row in (await session.execute(text(
                "EXPLAIN SELECT * FROM sync_actions WHERE sync_id > 0 "
                "AND sync_groups && ARRAY['workspace:1', 'team:2']::text[] ORDER BY sync_id"
            ))).all())
        self.assertNotIn('Seq Scan', plan)
        self.assertRegex(plan, 'ix_sync_actions_sync_groups|sync_actions_sync_id_key')

    # Retention

    async def test_compaction_drops_old_entries_and_older_clients_bootstrap(self):
        newest = await self.last()
        self.assertGreater(newest, 0)
        async with self.sessions() as session:
            self.assertFalse(await needs_bootstrap(session, 0))
            # Nothing is old yet.
            self.assertEqual(await compact_sync_log(session), 0)
        async with self.sessions() as session:
            dropped = await compact_sync_log(session, now=datetime.now(timezone.utc) + timedelta(days=31))
        self.assertGreater(dropped, 0)
        self.assertEqual(await self.entries(0), [])
        async with self.sessions() as session:
            self.assertTrue(await needs_bootstrap(session, 0))
            self.assertTrue(await needs_bootstrap(session, newest - 1))
            self.assertFalse(await needs_bootstrap(session, newest))
