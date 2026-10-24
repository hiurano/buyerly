"""The sync engine's bootstrap (#505): what it returns, to whom, and as of which sync id."""

import gzip
import json
import sys
import time
import unittest
from datetime import datetime, timezone

import httpx
from sqlalchemy import insert, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from api.server import create_app
from core.rate_limit import limiter
from database.models import (
    Account,
    AuditEvent,
    DeletedItem,
    Favorite,
    InboxNotificationState,
    RuleGroup,
    RulePreset,
    SyncAction,
    Team,
    TeamAccount,
    TeamMember,
    User,
    ViewSetting,
    Workspace,
    WorkspaceMember,
)
from database.sync_bootstrap import begin_snapshot, bootstrap_json
from database.sync_log import SYNCED_TABLES, changes_since, last_sync_id, member_sync_groups
from tests.test_db_helper import create_test_engine, init_test_db, session_headers

MODELS = sorted(synced.model for synced in SYNCED_TABLES.values())


def ids(payload: dict, model: str) -> set[int]:
    return {row['id'] for row in payload['models'][model]}


class TestSyncBootstrap(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await limiter.reset()
        self.engine = create_test_engine()
        self.sessions = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        await init_test_db(self.engine)
        # Every API module opens its own sessions; point them all at the test database.
        for name, module in list(sys.modules.items()):
            if name.startswith('api.') and hasattr(module, 'async_session_maker'):
                module.async_session_maker = self.sessions

        async with self.sessions() as session:
            owner = User(telegram_id='960000001', username='owner', full_name='Olga Owner',
                         role='buyer', is_approved=True)
            buyer = User(telegram_id='960000002', username='buyer', full_name='Boris Buyer',
                         role='buyer', is_approved=True)
            guest = User(telegram_id='960000003', username='guest', full_name='Gina Guest',
                         role='buyer', is_approved=True)
            stranger = User(telegram_id='960000004', username='stranger', full_name='Sam Stranger',
                            role='buyer', is_approved=True)
            session.add_all([owner, buyer, guest, stranger])
            await session.flush()
            ws = Workspace(name='Buyerly', slug='buyerly', owner_user_id=owner.id)
            other = Workspace(name='Other', slug='other', owner_user_id=stranger.id)
            session.add_all([ws, other])
            await session.flush()
            self.owner_member = WorkspaceMember(workspace_id=ws.id, user_id=owner.id, role='owner',
                                                inbox_display={'ordering': 'newest'})
            self.buyer_member = WorkspaceMember(workspace_id=ws.id, user_id=buyer.id, role='member')
            self.guest_member = WorkspaceMember(workspace_id=ws.id, user_id=guest.id, role='guest')
            self.stranger_member = WorkspaceMember(workspace_id=other.id, user_id=stranger.id, role='owner')
            session.add_all([self.owner_member, self.buyer_member, self.guest_member, self.stranger_member])
            for user in (owner, buyer, guest):
                user.active_workspace_id = ws.id
            stranger.active_workspace_id = other.id
            await session.flush()

            # A public team with the buyer and the guest, a private one with the owner alone.
            public = Team(workspace_id=ws.id, name='Media', key='MED')
            private = Team(workspace_id=ws.id, name='Secret', key='SEC', private=True)
            elsewhere = Team(workspace_id=other.id, name='Elsewhere', key='ELS')
            session.add_all([public, private, elsewhere])
            await session.flush()
            session.add_all([
                TeamMember(team_id=public.id, member_id=self.buyer_member.id),
                TeamMember(team_id=public.id, member_id=self.guest_member.id),
                TeamMember(team_id=private.id, member_id=self.owner_member.id, is_owner=True),
            ])
            loose = Account(account_id='act_200', name='No team', workspace_id=ws.id, owner_user_id=owner.id)
            shared = Account(account_id='act_201', name='Public', workspace_id=ws.id, owner_user_id=owner.id)
            hidden = Account(account_id='act_202', name='Private', workspace_id=ws.id, owner_user_id=owner.id,
                             access_token_encrypted='secret-token')
            foreign = Account(account_id='act_299', name='Foreign', workspace_id=other.id,
                              owner_user_id=stranger.id)
            session.add_all([loose, shared, hidden, foreign])
            await session.flush()
            session.add_all([
                TeamAccount(team_id=public.id, account_id=shared.id),
                TeamAccount(team_id=private.id, account_id=hidden.id),
            ])
            rule = RulePreset(workspace_id=ws.id, owner_user_id=owner.id, name='Stop at CPL 10')
            label = RuleGroup(workspace_id=ws.id, owner_user_id=owner.id, name='Scaling')
            foreign_rule = RulePreset(workspace_id=other.id, owner_user_id=stranger.id, name='Theirs')
            session.add_all([rule, label, foreign_rule])
            event_hidden = AuditEvent(workspace_id=ws.id, event_type='RULE_STOP', account_id='act_202')
            event_shared = AuditEvent(workspace_id=ws.id, event_type='RULE_STOP', account_id='act_201')
            event_loose = AuditEvent(workspace_id=ws.id, event_type='TOKEN_ERROR')
            session.add_all([event_hidden, event_shared, event_loose])
            await session.flush()
            session.add_all([
                InboxNotificationState(user_id=buyer.id, audit_event_id=event_shared.id, is_read=True),
                Favorite(member_id=self.buyer_member.id, kind='page', path='accounts', title='Ad accounts'),
                Favorite(member_id=self.owner_member.id, kind='page', path='rules', title='Rules'),
                ViewSetting(member_id=self.guest_member.id, view_key='rules', settings={'layout': 'list'}),
            ])
            await session.commit()
            self.ws_id, self.other_ws_id = ws.id, other.id
            self.owner_id, self.buyer_id, self.guest_id, self.stranger_id = owner.id, buyer.id, guest.id, stranger.id
            self.public_id, self.private_id, self.elsewhere_id = public.id, private.id, elsewhere.id
            self.loose_id, self.shared_id, self.hidden_id = loose.id, shared.id, hidden.id
            self.rule_id, self.label_id = rule.id, label.id
            self.events = {'hidden': event_hidden.id, 'shared': event_shared.id, 'loose': event_loose.id}

        self.headers = {}
        for name, telegram_id in (('owner', 960000001), ('buyer', 960000002), ('guest', 960000003)):
            self.headers[name] = await session_headers(self.sessions, {'id': telegram_id, 'username': name})
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url='http://test')

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.engine.dispose()

    async def bootstrap(self, who: str) -> dict:
        res = await self.client.get('/api/sync/bootstrap', headers=self.headers[who])
        self.assertEqual(res.status_code, 200, res.text)
        return res.json()

    async def archived(self, who: str) -> dict:
        res = await self.client.get('/api/sync/archived-models', headers=self.headers[who])
        self.assertEqual(res.status_code, 200, res.text)
        return res.json()

    async def log_max(self) -> int:
        async with self.sessions() as session:
            return await last_sync_id(session)

    # Which models

    async def test_returns_every_synced_model_of_the_workspace(self):
        payload = await self.bootstrap('owner')
        self.assertEqual(sorted(payload['models']), MODELS)
        models = payload['models']
        self.assertEqual(ids(payload, 'Workspace'), {self.ws_id})
        self.assertEqual(ids(payload, 'WorkspaceMember'),
                         {self.owner_member.id, self.buyer_member.id, self.guest_member.id})
        self.assertEqual(ids(payload, 'User'), {self.owner_id, self.buyer_id, self.guest_id})
        self.assertEqual(ids(payload, 'Team'), {self.public_id, self.private_id})
        self.assertEqual(len(models['TeamMember']), 3)
        self.assertEqual(len(models['TeamAccount']), 2)
        self.assertEqual(ids(payload, 'Account'), {self.loose_id, self.shared_id, self.hidden_id})
        self.assertEqual(ids(payload, 'Rule'), {self.rule_id})
        self.assertEqual(ids(payload, 'Label'), {self.label_id})
        self.assertEqual(ids(payload, 'InboxEvent'), set(self.events.values()))
        self.assertEqual([row['title'] for row in models['Favorite']], ['Rules'])
        # Others' Inbox state, favorites and views are theirs.
        self.assertEqual(models['InboxNotificationState'], [])
        self.assertEqual(models['ViewSetting'], [])

        # Rows are what the log sends: the whole row less secrets and bookkeeping.
        hidden = next(row for row in models['Account'] if row['id'] == self.hidden_id)
        self.assertEqual((hidden['account_id'], hidden['name'], hidden['workspace_id']),
                         ('act_202', 'Private', self.ws_id))
        for secret in SYNCED_TABLES['accounts'].excluded:
            self.assertNotIn(secret, hidden)
        for row in models['User']:
            for secret in SYNCED_TABLES['users'].excluded:
                self.assertNotIn(secret, row)

        # A member's own Inbox options reach them alone.
        members = {row['id']: row for row in models['WorkspaceMember']}
        self.assertEqual(members[self.owner_member.id]['inbox_display'], {'ordering': 'newest'})
        self.assertNotIn('inbox_display', members[self.buyer_member.id])
        buyer_members = {row['id']: row for row in (await self.bootstrap('buyer'))['models']['WorkspaceMember']}
        self.assertNotIn('inbox_display', buyer_members[self.owner_member.id])
        self.assertIn('inbox_read_before', buyer_members[self.buyer_member.id])

        self.assertEqual(sorted(payload['sync_groups']), payload['sync_groups'])
        async with self.sessions() as session:
            self.assertEqual(payload['sync_groups'], await member_sync_groups(session, self.owner_member))

    async def test_nothing_from_another_workspace(self):
        payload = await self.bootstrap('owner')
        rows = [row for models in payload['models'].values() for row in models]
        self.assertFalse([row for row in rows if row.get('workspace_id') == self.other_ws_id])
        self.assertNotIn(self.elsewhere_id, ids(payload, 'Team'))
        self.assertNotIn(self.stranger_id, ids(payload, 'User'))
        # The owner is in both workspaces; the other one comes with its own bootstrap, after a switch.
        self.assertEqual(ids(payload, 'Workspace'), {self.ws_id})

    async def test_compressed_when_the_client_accepts_it(self):
        res = await self.client.get('/api/sync/bootstrap', headers={**self.headers['owner'], 'Accept-Encoding': 'gzip'})
        self.assertEqual(res.headers.get('content-encoding'), 'gzip')
        self.assertEqual(res.headers.get('cache-control'), 'no-store')
        self.assertEqual(res.json()['models']['Workspace'][0]['id'], self.ws_id)
        raw = await self.client.get('/api/sync/bootstrap',
                                    headers={**self.headers['owner'], 'Accept-Encoding': 'identity'})
        self.assertIsNone(raw.headers.get('content-encoding'))
        self.assertEqual(json.loads(raw.content), res.json())
        self.assertLess(len(gzip.compress(raw.content)), len(raw.content))

    async def test_needs_a_signed_in_member(self):
        res = await self.client.get('/api/sync/bootstrap')
        self.assertIn(res.status_code, (401, 403))

    # Visibility through sync groups

    async def test_each_member_gets_their_groups_only(self):
        buyer = await self.bootstrap('buyer')
        self.assertEqual(ids(buyer, 'Team'), {self.public_id})
        self.assertEqual(ids(buyer, 'Account'), {self.loose_id, self.shared_id})
        self.assertEqual({row['team_id'] for row in buyer['models']['TeamAccount']}, {self.public_id})
        self.assertEqual({row['team_id'] for row in buyer['models']['TeamMember']}, {self.public_id})
        self.assertEqual(ids(buyer, 'InboxEvent'), {self.events['shared'], self.events['loose']})
        self.assertEqual(ids(buyer, 'Rule'), {self.rule_id})
        self.assertEqual([row['audit_event_id'] for row in buyer['models']['InboxNotificationState']],
                         [self.events['shared']])
        self.assertEqual([row['title'] for row in buyer['models']['Favorite']], ['Ad accounts'])

        # A guest sees their teams' data and the workspace's people, nothing workspace-wide beyond that.
        guest = await self.bootstrap('guest')
        self.assertEqual(ids(guest, 'Team'), {self.public_id})
        self.assertEqual(ids(guest, 'Account'), {self.shared_id})
        self.assertEqual(ids(guest, 'InboxEvent'), {self.events['shared']})
        self.assertEqual(guest['models']['Rule'], [])
        self.assertEqual(guest['models']['RuleLabel'], [])
        self.assertEqual(ids(guest, 'Label'), {self.label_id})
        self.assertEqual(ids(guest, 'User'), {self.owner_id, self.buyer_id, self.guest_id})
        self.assertEqual([row['view_key'] for row in guest['models']['ViewSetting']], ['rules'])
        self.assertNotIn(f'workspace:{self.ws_id}:members', guest['sync_groups'])

    async def test_every_row_is_in_one_of_the_members_groups(self):
        """The groups the log gives each returned row overlap the member's: bootstrap and deltas agree on who sees what."""
        for who in ('owner', 'buyer', 'guest'):
            payload = await self.bootstrap(who)
            groups = set(payload['sync_groups'])
            async with self.sessions() as session:
                for model, rows in payload['models'].items():
                    table = next(t for t, s in SYNCED_TABLES.items() if s.model == model)
                    for row in rows:
                        row_groups = (await session.execute(
                            text(f"SELECT sync_log_groups('{table}', to_jsonb(t)) FROM {table} t WHERE t.id = :id"),
                            {'id': row['id']},
                        )).scalar_one()
                        self.assertTrue(groups & set(row_groups), (who, model, row['id'], row_groups))

    async def test_same_records_as_the_rest_api(self):
        for who in ('owner', 'buyer', 'guest'):
            # Rules first: the list adds the workspace's example rules the first time it is opened.
            presets = await self.client.get('/api/presets', headers=self.headers[who])
            self.assertEqual(presets.status_code, 200, presets.text)
            payload = await self.bootstrap(who)
            self.assertEqual(ids(payload, 'Rule'), {row['id'] for row in presets.json()}, who)

            res = await self.client.get('/api/accounts', headers=self.headers[who])
            self.assertEqual(res.status_code, 200, res.text)
            self.assertEqual(ids(payload, 'Account'), {row['id'] for row in res.json()}, who)

            res = await self.client.get(f'/api/workspaces/{self.ws_id}/teams', headers=self.headers[who])
            self.assertEqual(res.status_code, 200, res.text)
            self.assertEqual(ids(payload, 'Team'), {row['id'] for row in res.json()}, who)

            res = await self.client.get(f'/api/workspaces/{self.ws_id}/members', headers=self.headers[who])
            self.assertEqual(res.status_code, 200, res.text)
            self.assertEqual(ids(payload, 'User'), {row['user_id'] for row in res.json()}, who)

            res = await self.client.get('/api/favorites', headers=self.headers[who])
            self.assertEqual(res.status_code, 200, res.text)
            self.assertEqual(ids(payload, 'Favorite'), {row['id'] for row in res.json()}, who)

    # The sync id

    async def test_sync_id_is_the_newest_in_the_log(self):
        payload = await self.bootstrap('owner')
        self.assertGreater(payload['last_sync_id'], 0)
        self.assertEqual(payload['last_sync_id'], await self.log_max())
        # A guest gets the same moment, not the newest entry they could see.
        self.assertEqual((await self.bootstrap('guest'))['last_sync_id'], payload['last_sync_id'])

    async def test_bootstrap_plus_deltas_equals_a_later_bootstrap(self):
        for who, member in (('owner', self.owner_member), ('buyer', self.buyer_member), ('guest', self.guest_member)):
            await self._check_catch_up(who, member)

    async def _check_catch_up(self, who: str, member):
        before = await self.bootstrap(who)
        async with self.sessions() as session:
            await session.execute(update(Account).where(Account.workspace_id == self.ws_id).values(note=f'seen by {who}'))
            team = await session.get(Team, self.public_id)
            team.name = f'Media {who}'
            session.add(Favorite(member_id=member.id, kind='page', path=f'team/{who}', title=who))
            session.add(AuditEvent(workspace_id=self.ws_id, event_type='RULE_ALERT', account_id='act_201'))
            label = RuleGroup(workspace_id=self.ws_id, owner_user_id=self.owner_id, name=f'Label {who}')
            session.add(label)
            await session.commit()
            await session.delete(label)
            await session.commit()

        models = {model: {str(row['id']): row for row in rows} for model, rows in before['models'].items()}
        async with self.sessions() as session:
            entries = await changes_since(session, before['sync_groups'], before['last_sync_id'], limit=10_000)
        self.assertTrue(entries)
        for entry in entries:
            rows = models[entry.model]
            if entry.action == 'insert':
                rows[entry.model_id] = dict(entry.data)
            elif entry.action == 'update':
                rows[entry.model_id] = {**rows[entry.model_id], **entry.data}
            else:
                rows.pop(entry.model_id, None)

        after = await self.bootstrap(who)
        # The label's delete, last of the writes, reaches everyone in the workspace.
        self.assertEqual(after['last_sync_id'], entries[-1].sync_id)
        for model, rows in after['models'].items():
            self.assertEqual(models[model], {str(row['id']): row for row in rows}, (who, model))

    async def test_rows_and_sync_id_come_from_one_snapshot(self):
        """A write that commits while bootstrap reads is in neither its rows nor its sync id; catching up brings it."""
        async with self.sessions() as reader:
            await begin_snapshot(reader)
            member = await reader.get(WorkspaceMember, self.owner_member.id)

            async with self.sessions() as writer:
                await writer.execute(update(Account).where(Account.id == self.loose_id).values(name='Late'))
                await writer.commit()
            late = (await self._entries('Account', self.loose_id))[-1]

            payload = json.loads(await bootstrap_json(reader, member))
        self.assertLess(payload['last_sync_id'], late.sync_id)
        loose = next(row for row in payload['models']['Account'] if row['id'] == self.loose_id)
        self.assertEqual(loose['name'], 'No team')
        async with self.sessions() as session:
            missed = await changes_since(session, payload['sync_groups'], payload['last_sync_id'])
        self.assertIn(late.sync_id, [entry.sync_id for entry in missed])

    async def _entries(self, model: str, model_id) -> list[SyncAction]:
        async with self.sessions() as session:
            return (await session.execute(
                select(SyncAction).where(SyncAction.model == model, SyncAction.model_id == str(model_id))
                .order_by(SyncAction.sync_id)
            )).scalars().all()

    # Archived models

    async def test_archived_models_come_separately(self):
        async with self.sessions() as session:
            await session.execute(update(Team).where(Team.id == self.public_id)
                                  .values(deleted_at=datetime.now(timezone.utc)))
            await session.execute(update(InboxNotificationState).values(deleted_at=datetime.now(timezone.utc)))
            session.add(DeletedItem(workspace_id=self.ws_id, kind='rule', entity_id=9001, name='Old rule',
                                    deleted_by_user_id=self.owner_id))
            await session.commit()

        buyer = await self.bootstrap('buyer')
        self.assertEqual(buyer['models']['Team'], [])
        self.assertEqual(buyer['models']['TeamMember'], [])
        self.assertEqual(buyer['models']['InboxNotificationState'], [])

        archived = await self.archived('buyer')
        self.assertEqual(ids(archived, 'Team'), {self.public_id})
        self.assertEqual({row['team_id'] for row in archived['models']['TeamMember']}, {self.public_id})
        self.assertEqual([row['audit_event_id'] for row in archived['models']['InboxNotificationState']],
                         [self.events['shared']])
        self.assertEqual([(row['id'], row['name']) for row in archived['models']['Rule']], [(9001, 'Old rule')])
        self.assertEqual(archived['last_sync_id'], await self.log_max())

        # Nobody else's deleted Inbox state, and no deleted rules for a guest, who has no rules.
        self.assertEqual((await self.archived('owner'))['models']['InboxNotificationState'], [])
        self.assertEqual((await self.archived('guest'))['models']['Rule'], [])
        self.assertNotIn(self.private_id, ids(await self.archived('buyer'), 'Team'))

    # Size and time

    async def test_a_large_workspace_in_one_round_trip(self):
        async with self.sessions() as session:
            teams = (await session.execute(insert(Team).returning(Team.id), [
                {'workspace_id': self.ws_id, 'name': f'Team {n}', 'key': f'T{n:02d}', 'private': n % 5 == 0}
                for n in range(20)
            ])).scalars().all()
            accounts = (await session.execute(insert(Account).returning(Account.id), [
                {'account_id': f'act_9{n:04d}', 'name': f'Account {n}', 'workspace_id': self.ws_id,
                 'owner_user_id': self.owner_id}
                for n in range(500)
            ])).scalars().all()
            await session.execute(insert(TeamAccount), [
                {'team_id': teams[n % len(teams)], 'account_id': account} for n, account in enumerate(accounts)
            ])
            await session.execute(insert(RulePreset), [
                {'workspace_id': self.ws_id, 'owner_user_id': self.owner_id, 'name': f'Rule {n}'} for n in range(100)
            ])
            await session.execute(insert(AuditEvent), [
                {'workspace_id': self.ws_id, 'event_type': 'RULE_STOP', 'account_id': f'act_9{n % 500:04d}',
                 'message': 'Stopped ad set because CPL went above the limit'}
                for n in range(5000)
            ])
            await session.commit()

        started = time.perf_counter()
        res = await self.client.get('/api/sync/bootstrap',
                                    headers={**self.headers['buyer'], 'Accept-Encoding': 'gzip'})
        elapsed = time.perf_counter() - started
        self.assertEqual(res.status_code, 200, res.text)
        payload = res.json()
        rows = sum(len(models) for models in payload['models'].values())
        size = len(json.dumps(payload).encode())
        print(f'\nbootstrap of a 500-account, 5000-event workspace for a member: {rows} rows, '
              f'{size / 1024:.0f} KB of JSON, {len(res.content) / 1024:.0f} KB gzipped, {elapsed * 1000:.0f} ms')
        self.assertGreater(len(payload['models']['InboxEvent']), 3000)
        self.assertLess(elapsed, 10)

