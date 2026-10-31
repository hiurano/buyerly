import React, { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { observer } from 'mobx-react-lite';
import type { MetaAccount } from '@/lib/types';
import { useWorkspaceSession } from '@/lib/workspaceSession';
import { auditEventSummary, auditEventTitle, fetchAuditEvents, formatAuditRelativeTime, formatAuditTimestamp, type AuditEventItem } from '@/lib/audit';
import { attachedRuleScope, formatAccountScope, formatRelativeTime } from '@/lib/rules';
import { SidebarCollapsedNavigation } from '@/components/sidebar/SidebarCollapsedNavigation';
import { AttachRulePreviewDialog } from '@/components/rules/AttachRulePreviewDialog';
import { metaAccountLabel } from '@/components/campaigns/liveCampaigns';
import { Button } from '@/ui/Button';
import { DataState } from '@/ui/DataState';
import { BuyerlyToggle } from '@/ui/BuyerlyToggle';
import { Tooltip } from '@/ui/Tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { BuyerlyDisclosureGlyph, BuyerlyStatusCircleIcon } from '@/icons/BuyerlyIcons';
import { DetailsPaneLayout, DetailsPaneToggle } from '@/ui/DetailsPane';
import { BuyerlyDataListToolbar } from '@/ui/BuyerlyDataList';
import { BuyerlyTabs } from '@/ui/BuyerlyTabs';
import type { AccountPageTab } from '@/lib/routing';
import { AccountRowMenu, type AccountRowActions } from './AccountRow';
import { AccountStatusLabel, ConnectionProblemIcon, accountMoney } from './AccountParts';
import { copyAccountId, useWorkspaceAccounts, type AccountMember } from './accountsData';
import { AccountLeadPicker } from './AccountLeadPicker';
import { useAccountDialogs } from './AccountsView';
import { favoritePath } from '@/lib/favorites';
import { BuyerlyFavoriteButton } from '@/ui/BuyerlyFavoriteButton';
import { BuyerlyAccountBell } from './BuyerlyAccountBell';
import {
  accountAdsManagerPath,
  accountName,
  accountPagePath,
  connectionProblem,
  formatAddedDate,
  teamsOf,
} from './accountsModel';
import { type RuleItem, useRulesStore } from '@/models/rulesStore';
import { colors } from '@/styles/tokens.stylex';

const TOUCH = '@media (hover: none) and (pointer: coarse)';
const WIDE = '@media (min-width: 480px)';

const truncate = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

const noMargin = {
  marginTop: 0,
  marginRight: 0,
  marginBottom: 0,
  marginLeft: 0,
} as const;

const styles = stylex.create({
  sectionTitle: {
    marginBottom: 8,
    display: 'flex',
    height: 28,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeading: {
    ...noMargin,
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-tertiary'],
  },
  property: {
    display: 'flex',
    minHeight: 36,
    alignItems: 'center',
  },
  propertyLabel: {
    width: 120,
    flexShrink: 0,
    fontSize: 12,
    fontWeight: 450,
    color: colors['--text-tertiary'],
  },
  propertyValue: {
    display: 'flex',
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    fontWeight: 450,
    color: colors['--text-primary'],
  },
  figure: {
    minWidth: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-primary'],
    paddingLeft: {
      default: 12,
      [WIDE]: 14,
    },
    paddingRight: {
      default: 12,
      [WIDE]: 14,
    },
    paddingTop: {
      default: 10,
      [WIDE]: 12,
    },
    paddingBottom: {
      default: 10,
      [WIDE]: 12,
    },
  },
  figureLabel: {
    ...truncate,
    fontSize: 12,
    fontWeight: 450,
    color: colors['--text-tertiary'],
  },
  figureValue: {
    ...truncate,
    marginTop: 4,
    fontSize: {
      default: 16,
      [WIDE]: 18,
    },
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: colors['--text-primary'],
  },
  figureCaption: {
    ...truncate,
    marginTop: 2,
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    color: colors['--text-tertiary'],
  },
  // The 44px title bar over a hairline.
  titleBar: {
    display: 'flex',
    height: 44,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingLeft: 18,
    paddingRight: 8,
  },
  titleStart: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
  },
  breadcrumbLink: {
    flexShrink: 0,
    borderRadius: 4,
    fontSize: 13,
    fontWeight: 500,
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
    },
    outline: '2px solid transparent',
    outlineOffset: 2,
    transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    transitionDuration: '150ms',
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
  },
  breadcrumbChevron: {
    marginLeft: 4,
    marginRight: 4,
    flexShrink: 0,
    color: colors['--text-tertiary'],
  },
  breadcrumbPage: {
    ...noMargin,
    ...truncate,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  titleActions: {
    marginLeft: 8,
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: 4,
  },
  headerEnd: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: 8,
  },
  noShrink: {
    flexShrink: 0,
  },
  root: {
    display: 'flex',
    height: '100%',
    width: '100%',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  header: {
    display: 'flex',
    flexShrink: 0,
    flexDirection: 'column',
  },
  truncate,
  muted: {
    color: colors['--text-tertiary'],
  },
  secondary: {
    color: colors['--text-secondary'],
  },
  reconnect: {
    flexShrink: 0,
    borderRadius: 9999,
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 2,
    paddingBottom: 2,
    fontSize: 12,
    fontWeight: 500,
    color: {
      default: colors['--text-secondary'],
      ':hover': colors['--text-primary'],
    },
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
  },
  main: {
    minWidth: 0,
  },
  icon: {
    display: 'flex',
    height: 36,
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    color: colors['--text-secondary'],
  },
  nameInput: {
    marginTop: 12,
    width: '100%',
    backgroundColor: 'transparent',
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    fontSize: 24,
    fontWeight: 600,
    lineHeight: '32px',
    color: colors['--text-primary'],
    outline: '2px solid transparent',
    outlineOffset: 2,
    '::placeholder': {
      color: colors['--text-muted'],
    },
  },
  name: {
    ...noMargin,
    marginTop: 12,
    fontSize: 24,
    fontWeight: 600,
    lineHeight: '32px',
    color: colors['--text-primary'],
  },
  ids: {
    marginTop: 6,
    display: 'flex',
    minWidth: 0,
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 6,
    fontSize: 13,
    fontWeight: 450,
    color: colors['--text-tertiary'],
  },
  accountId: {
    userSelect: 'text',
    fontVariantNumeric: 'tabular-nums',
  },
  copy: {
    display: 'flex',
    height: {
      default: 24,
      [TOUCH]: 36,
    },
    width: {
      default: 24,
      [TOUCH]: 36,
    },
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
    },
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
  },
  noteInput: {
    marginTop: 16,
    width: '100%',
    resize: 'none',
    overflow: 'hidden',
    backgroundColor: 'transparent',
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    fontSize: 15,
    fontWeight: 450,
    lineHeight: '24px',
    color: colors['--text-secondary'],
    outline: '2px solid transparent',
    outlineOffset: 2,
    '::placeholder': {
      color: colors['--text-muted'],
    },
  },
  note: {
    ...noMargin,
    marginTop: 16,
    whiteSpace: 'pre-wrap',
    fontSize: 15,
    fontWeight: 450,
    lineHeight: '24px',
    color: colors['--text-secondary'],
  },
  section: {
    marginTop: 32,
  },
  lastSection: {
    marginTop: 32,
    paddingBottom: 40,
  },
  figures: {
    display: 'grid',
    gridTemplateColumns: {
      default: 'repeat(1, minmax(0, 1fr))',
      [WIDE]: 'repeat(3, minmax(0, 1fr))',
    },
    gap: 8,
  },
  hint: {
    ...noMargin,
    marginTop: 8,
    fontSize: 12,
    color: colors['--text-tertiary'],
  },
  attach: {
    display: 'flex',
    height: {
      default: 28,
      [TOUCH]: 36,
    },
    alignItems: 'center',
    gap: 6,
    borderRadius: 9999,
    paddingLeft: 10,
    paddingRight: 10,
    fontSize: 12,
    fontWeight: 500,
    color: {
      default: colors['--text-secondary'],
      ':hover': colors['--text-primary'],
    },
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
  },
  menuNote: {
    paddingLeft: 14,
    paddingRight: 14,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 12,
    color: colors['--text-muted'],
  },
  count: {
    marginLeft: 6,
    fontVariantNumeric: 'tabular-nums',
  },
  empty: {
    ...noMargin,
    fontSize: 13,
    color: colors['--text-tertiary'],
  },
  list: {
    ...noMargin,
    display: 'flex',
    listStyleType: 'none',
    flexDirection: 'column',
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
  },
  rules: {
    gap: 2,
  },
  rule: {
    display: 'flex',
    minHeight: 40,
    width: '100%',
    alignItems: 'center',
    gap: 12,
    borderRadius: 8,
    paddingLeft: 8,
    paddingRight: 8,
    textAlign: 'left',
    outline: '2px solid transparent',
    outlineOffset: 2,
    backgroundColor: {
      default: null,
      ':hover': colors['--data-row-hover-bg'],
    },
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
  },
  ruleName: {
    ...truncate,
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  ruleState: {
    display: 'flex',
    width: 76,
    flexShrink: 0,
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: colors['--text-secondary'],
  },
  ruleScope: {
    ...truncate,
    width: 104,
    flexShrink: 0,
    textAlign: 'right',
    fontSize: 12,
    color: colors['--text-tertiary'],
  },
  event: {
    display: 'flex',
    minHeight: 40,
    alignItems: 'flex-start',
    gap: 12,
    paddingTop: 6,
    paddingBottom: 6,
  },
  eventDot: {
    marginTop: 7,
    height: 6,
    width: 6,
    flexShrink: 0,
    borderRadius: 9999,
    backgroundColor: colors['--text-muted'],
  },
  eventText: {
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
  },
  eventTitle: {
    ...truncate,
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  eventSummary: {
    ...truncate,
    fontSize: 12,
    color: colors['--text-tertiary'],
  },
  eventTime: {
    flexShrink: 0,
    paddingTop: 2,
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    color: colors['--text-tertiary'],
  },
  column: {
    marginLeft: 'auto',
    marginRight: 'auto',
    maxWidth: 805,
  },
  mainScroll: {
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    overflowY: 'auto',
    // Linear's project column: 48px at the sides, up to 805px wide; a phone keeps 16px.
    paddingLeft: { default: 48, '@media (max-width: 640px)': 16 },
    paddingRight: { default: 48, '@media (max-width: 640px)': 16 },
    paddingTop: { default: 64, '@media (max-width: 640px)': 24 },
  },
  // The page's tabs, as a Linear project's Overview / Activity bar over the column and its panel.
  tabBar: {
    gap: 8,
  },
  tabBarEnd: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    marginLeft: 'auto',
  },
  loadMore: {
    marginTop: 12,
  },
  // Linear's Activity tab has no title: its timeline starts 40px under the tabs.
  mainScrollActivity: {
    paddingTop: { default: 40, '@media (max-width: 640px)': 24 },
  },
  activity: {
    paddingBottom: 40,
  },
  // Each card as the details pane's: 0.5px border, 10px corners, 12px in.
  panelCard: {
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: colors['--details-pane-card-border'],
    borderRadius: 10,
    backgroundColor: colors['--details-pane-card-bg'],
    boxShadow: colors['--details-pane-card-shadow'],
    paddingTop: 12,
    paddingRight: 12,
    paddingBottom: 12,
    paddingLeft: 12,
    // In the details pane, 8px from its right and bottom edges, as the quick-filter card.
    marginRight: 8,
    marginBottom: 8,
  },
  // "Properties ▾": a 28px pill that folds the card, its text 8px in, as Linear's.
  panelHeader: {
    display: 'flex',
    width: 'calc(100% + 16px)',
    height: 28,
    alignItems: 'center',
    gap: 6,
    marginTop: -5,
    marginLeft: -8,
    marginRight: -8,
    marginBottom: 6,
    paddingLeft: 8,
    paddingRight: 8,
    borderWidth: 0,
    borderRadius: 8,
    backgroundColor: {
      default: 'transparent',
      ':hover': colors['--item-hover-bg'],
    },
    color: colors['--details-tab-fg'],
    fontSize: 13,
    fontWeight: 500,
    textAlign: 'left',
    cursor: 'default',
  },
  panelHeaderFolded: {
    marginBottom: -5,
  },
  disclosure: {
    transform: 'rotate(90deg)',
  },
  disclosureFolded: {
    transform: 'none',
  },
  panelLabel: {
    width: 90,
    color: colors['--details-tab-fg'],
  },
  // Linear's values are pills 6px in, so their marks line up 6px after the label column.
  panelValue: {
    paddingLeft: 6,
    color: colors['--details-row-fg'],
  },
});

interface AccountPageProps {
  accountId: string;
  /** The tab on screen: Overview at /accounts/<act_id>, Activity at …/activity. */
  page: AccountPageTab | 'overview';
  navigate: (path: string) => void;
  /** Changes on every navigation, Back and Forward included. */
  navigationKey: number;
}

const SectionTitle: React.FC<React.PropsWithChildren<{ action?: React.ReactNode }>> = ({ children, action }) => (
  <div {...stylex.props(styles.sectionTitle)}>
    <h3 {...stylex.props(styles.sectionHeading)}>{children}</h3>
    {action}
  </div>
);

const PropertyRow: React.FC<React.PropsWithChildren<{ label: string }>> = ({ label, children }) => (
  <div {...stylex.props(styles.property)} role="group" aria-label={label}>
    <div {...stylex.props(styles.propertyLabel, styles.panelLabel)}>{label}</div>
    <div {...stylex.props(styles.propertyValue, styles.panelValue)}>{children}</div>
  </div>
);

const Figure: React.FC<{ label: string; value: string; caption?: string }> = ({ label, value, caption }) => (
  <div {...stylex.props(styles.figure)}>
    <div {...stylex.props(styles.figureLabel)}>{label}</div>
    <div {...stylex.props(styles.figureValue)}>{value}</div>
    {caption && <div {...stylex.props(styles.figureCaption)}>{caption}</div>}
  </div>
);

/** Events of an account, newest first: what happened, on what, and when. */
const EventList: React.FC<{ events: AuditEventItem[] }> = ({ events }) => (
  <ul {...stylex.props(styles.list)}>
    {events.map((event) => (
      <li key={event.id} {...stylex.props(styles.event)}>
        <span aria-hidden="true" {...stylex.props(styles.eventDot)} />
        <div {...stylex.props(styles.eventText)}>
          <div {...stylex.props(styles.eventTitle)}>{auditEventTitle(event)}</div>
          <div {...stylex.props(styles.eventSummary)}>{auditEventSummary(event)}</div>
        </div>
        <span {...stylex.props(styles.eventTime)} title={formatAuditTimestamp(event.created_at)}>
          {formatAuditRelativeTime(event.created_at)}
        </span>
      </li>
    ))}
  </ul>
);

const ACTIVITY_PAGE_SIZE = 50;

/** The Activity tab, as a Linear project's: every event of the account, 50 at a time. */
const AccountActivity: React.FC<{ accountId: string; navigationKey: number }> = ({ accountId, navigationKey }) => {
  const [events, setEvents] = useState<AuditEventItem[] | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = (next: number) => {
    setLoading(true);
    setFailed(false);
    return fetchAuditEvents({ page: next, pageSize: ACTIVITY_PAGE_SIZE, accountId })
      .then((result) => {
        setEvents((current) => (next === 1 ? result.items : [...(current ?? []), ...result.items]));
        setPage(next);
        setPages(result.total_pages);
        setLoading(false);
      })
      .catch(() => {
        setFailed(true);
        setLoading(false);
      });
  };

  useEffect(() => {
    setEvents(null);
    void load(1);
    // A new account or a navigation starts over at the newest page.
  }, [accountId, navigationKey]);

  return (
    <section aria-label="Activity" {...stylex.props(styles.activity)}>
      {failed && events === null ? (
        <p {...stylex.props(styles.empty)}>Couldn’t load the activity of this account.</p>
      ) : events === null ? (
        <p {...stylex.props(styles.empty)}>Loading…</p>
      ) : events.length === 0 ? (
        <p {...stylex.props(styles.empty)}>Nothing has happened on this account yet.</p>
      ) : (
        <EventList events={events} />
      )}
      {events !== null && page < pages && (
        <Button size="compact" xstyle={styles.loadMore} disabled={loading} onClick={() => void load(page + 1)}>
          {loading ? 'Loading…' : 'Show older'}
        </Button>
      )}
    </section>
  );
};

/** One ad account's page, as Linear's project page: name, note, today's numbers, rules, recent events, properties. */
const AccountPageContent: React.FC<AccountPageProps> = ({ accountId, page, navigate, navigationKey }) => {
  const { workspace } = useWorkspaceSession();
  const data = useWorkspaceAccounts();
  const { accounts, teams, members, state, error, canEdit } = data;
  const listPath = `/${workspace.slug}/accounts`;
  const dialogs = useAccountDialogs(data, () => navigate(listPath));
  const account = accounts.find((item) => item.account_id === accountId);

  const rules = useRulesStore((state) => state.rules);

  const loadRules = useRulesStore((state) => state.loadRules);

  const toggleRuleOnAccount = useRulesStore((state) => state.toggleRuleOnAccount);
  useEffect(() => {
    void loadRules({ ifStale: true });
  }, [loadRules]);

  // The last events of this account: rule actions, manual changes, sync errors.
  const [events, setEvents] = useState<AuditEventItem[] | null>(null);
  useEffect(() => {
    let active = true;
    setEvents(null);
    fetchAuditEvents({ page: 1, pageSize: 5, accountId })
      .then((result) => { if (active) setEvents(result.items); })
      .catch(() => { if (active) setEvents([]); });
    return () => { active = false; };
  }, [accountId, navigationKey]);

  useEffect(() => {
    if (account) document.title = accountName(account);
  }, [account]);

  const actions: AccountRowActions = {
    canEdit,
    canAct: data.canAct,
    members,
    setLead: (item, leadUserId) => void data.saveLead(item, leadUserId),
    open: () => {},
    openInAdsManager: (item) => navigate(accountAdsManagerPath(workspace.slug, item.account_id)),
    rename: dialogs.rename,
    toggleAutomation: (item) => void data.toggleAutomation(item),
    copyId: (item) => void copyAccountId(item.account_id),
    remove: dialogs.remove,
    reconnect: dialogs.openAdd,
  };

  const header = (
    // --canvas-border is a whole border; StyleX would split the shorthand and lose it.
    <div {...stylex.props(styles.titleBar)} style={{ borderBottom: 'var(--canvas-border)' }}>
      <div {...stylex.props(styles.titleStart)}>
        <SidebarCollapsedNavigation />
        <nav aria-label="Breadcrumb" {...stylex.props(styles.titleStart)}>
          <a
            href={listPath}
            onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              navigate(listPath);
            }}
            {...stylex.props(styles.breadcrumbLink)}
          >
            Ad accounts
          </a>
          <BuyerlyIcon name="chevron-right" size={14} aria-hidden="true" {...stylex.props(styles.breadcrumbChevron)} />
          <h2 aria-current="page" {...stylex.props(styles.breadcrumbPage)}>
            {account ? accountName(account) : accountId}
          </h2>
        </nav>
        {account && (
          <span {...stylex.props(styles.titleActions)}>
            <BuyerlyFavoriteButton
              favorite={{ kind: 'account', path: favoritePath(accountPagePath(workspace.slug, account.account_id), workspace.slug), title: accountName(account) }}
            />
            <AccountRowMenu account={account} actions={actions} inHeader />
          </span>
        )}
      </div>
      {account && (
        <div {...stylex.props(styles.headerEnd)}>
          {account.is_active !== false && (
            <Button size="compact" xstyle={styles.noShrink} aria-label="Open campaigns" onClick={() => actions.openInAdsManager(account)}>
              Campaigns
            </Button>
          )}
          {/* Linear's bell ends a project's header. */}
          <BuyerlyAccountBell accountId={account.account_id} accountName={accountName(account)} />
        </div>
      )}
    </div>
  );

  let body: React.ReactNode;
  if (state === 'loading') {
    body = <DataState title="Loading ad account…" detail="Reading the ad accounts of this workspace." />;
  } else if (state === 'error') {
    body = <DataState title="Couldn't load the ad account" detail={error} role="alert" actionLabel="Retry" onAction={() => void data.refresh()} />;
  } else if (!account) {
    body = (
      <DataState
        title="Ad account not found"
        detail={`This workspace has no ad account ${accountId}. It may have been removed.`}
        actionLabel="Go to ad accounts"
        onAction={() => navigate(listPath)}
      />
    );
  } else {
    body = (
      <AccountPageBody
        key={account.account_id}
        account={account}
        page={page}
        navigationKey={navigationKey}
        canEdit={canEdit}
        canAct={data.canAct}
        teamsText={teamsOf(account, teams).map((team) => team.name).join(', ')}
        connectedBy={members.find((member) => member.user_id === account.owner_user_id)}
        members={members}
        onSetLead={(leadUserId) => void data.saveLead(account, leadUserId)}
        rules={rules}
        events={events}
        onSaveProfile={(change) => void data.saveProfile(account, change)}
        onToggleAutomation={() => void data.toggleAutomation(account)}
        onReconnect={dialogs.openAdd}
        onOpenRule={(id) => navigate(`/${workspace.slug}/rules/${id}`)}
        onAttachRule={async (ruleId) => {
          await toggleRuleOnAccount(ruleId, account.account_id);
          await data.refresh();
        }}
      />
    );
  }

  const tabBar = account && (
    <BuyerlyDataListToolbar xstyle={styles.tabBar}>
      <BuyerlyTabs
        aria-label="Ad account"
        tabs={[{ id: 'overview', label: 'Overview' }, { id: 'activity', label: 'Activity' }]}
        activeTabId={page}
        onChange={(tab) => navigate(accountPagePath(workspace.slug, account.account_id, tab === 'activity' ? 'activity' : undefined))}
      />
      <div {...stylex.props(styles.tabBarEnd)}>
        <DetailsPaneToggle pane="account" />
      </div>
    </BuyerlyDataListToolbar>
  );

  return (
    <div {...stylex.props(styles.root)}>
      <header {...stylex.props(styles.header)}>
        {header}
        {tabBar}
      </header>
      {body}
      {dialogs.element}
    </div>
  );
};

interface AccountPageBodyProps {
  account: MetaAccount;
  page: AccountPageTab | 'overview';
  navigationKey: number;
  canEdit: boolean;
  /** Changing this account itself: everyone who sees it, guests too. */
  canAct: boolean;
  teamsText: string;
  connectedBy?: { full_name: string; username: string };
  members: AccountMember[];
  onSetLead: (leadUserId: number | null) => void;
  rules: RuleItem[];
  events: AuditEventItem[] | null;
  onSaveProfile: (change: { custom_name?: string; note?: string }) => void;
  onToggleAutomation: () => void;
  onReconnect: () => void;
  onOpenRule: (id: string) => void;
  onAttachRule: (ruleId: string) => Promise<void>;
}

const AccountPageBody: React.FC<AccountPageBodyProps> = ({
  account,
  page,
  navigationKey,
  canEdit,
  canAct,
  teamsText,
  connectedBy,
  members,
  onSetLead,
  rules,
  events,
  onSaveProfile,
  onToggleAutomation,
  onReconnect,
  onOpenRule,
  onAttachRule,
}) => {
  const [name, setName] = useState(accountName(account));
  const [propertiesFolded, setPropertiesFolded] = useState(false);
  const [note, setNote] = useState(account.note ?? '');
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [previewRule, setPreviewRule] = useState<{ id: string; presetId: number; name: string } | null>(null);
  useEffect(() => setName(accountName(account)), [account]);
  useEffect(() => setNote(account.note ?? ''), [account.note]);
  useEffect(() => {
    const field = noteRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }, [note]);

  const saveName = () => {
    const next = name.trim();
    // Meta's own name, or nothing, means no name of Buyerly's own.
    const custom = !next || next === account.name.trim() ? '' : next;
    if (!next) setName(account.name || account.account_id);
    onSaveProfile({ custom_name: custom });
  };

  const metrics = account.today_metrics;
  const attached = account.active_rules ?? [];
  const attachedIds = new Set(attached.map((rule) => String(rule.preset_id)));
  const attachable = rules.filter((rule) => !attachedIds.has(rule.id));
  const problem = connectionProblem(account);
  const automationBlocked = !account.rules_enabled && attached.length === 0;
  const health = account.health;
  const lastSync = health?.last_success_at || metrics?.saved_at || metrics?.generated_at || '';

  // Linear's properties card in the page's details pane; its header folds it.
  const properties = (
    <section aria-label="Properties" {...stylex.props(styles.panelCard)}>
      <button
          type="button"
          aria-expanded={!propertiesFolded}
          onClick={() => setPropertiesFolded((folded) => !folded)}
          {...stylex.props(styles.panelHeader, propertiesFolded && styles.panelHeaderFolded)}
        >
          Properties
        <BuyerlyDisclosureGlyph size={16} {...stylex.props(styles.disclosure, propertiesFolded && styles.disclosureFolded)} />
      </button>
      {!propertiesFolded && <>
        <PropertyRow label="Status">
          <AccountStatusLabel account={account} />
        </PropertyRow>
        <PropertyRow label="Health">
          {problem ? (
            <>
              <ConnectionProblemIcon account={account} onReconnect={canEdit ? onReconnect : undefined} />
              <span {...stylex.props(styles.truncate)} title={problem}>{health?.status === 'critical' || account.status_label === 'Meta connection required' ? 'Needs reconnect' : 'Sync problems'}</span>
              {canEdit && (
                <button type="button" onClick={onReconnect} {...stylex.props(styles.reconnect)}>
                  Reconnect
                </button>
              )}
            </>
          ) : (
            <span {...stylex.props(health?.status !== 'healthy' && styles.muted)}>
              {health?.status === 'healthy' ? 'Healthy' : 'Not checked yet'}
            </span>
          )}
        </PropertyRow>
        <PropertyRow label="Automation">
          <BuyerlyToggle
            checked={Boolean(account.rules_enabled)}
            disabled={!canAct || automationBlocked}
            label="Automation"
            tooltipContent={
              !canAct ? 'You can’t change automation'
                : automationBlocked ? 'Attach a rule to the account first'
                  : account.rules_enabled ? 'Turn automation off' : 'Turn automation on'
            }
            onChange={canAct ? onToggleAutomation : undefined}
          />
          <span {...stylex.props(styles.secondary)}>{account.rules_enabled ? 'On' : 'Off'}</span>
        </PropertyRow>
        <PropertyRow label="Lead">
          <AccountLeadPicker account={account} members={members} canEdit={canAct} onChange={onSetLead} variant="property" />
        </PropertyRow>
        <PropertyRow label="Team">
          <span {...stylex.props(teamsText ? styles.truncate : styles.muted)}>{teamsText || 'No team'}</span>
        </PropertyRow>
        <PropertyRow label="Connected by">
          <span {...stylex.props(connectedBy ? styles.truncate : styles.muted)}>
            {connectedBy ? connectedBy.full_name || connectedBy.username : '—'}
          </span>
        </PropertyRow>
        <PropertyRow label="Time zone">
          <span {...stylex.props(styles.truncate)}>{account.timezone_name || 'UTC'}</span>
        </PropertyRow>
        <PropertyRow label="Added">
          <span>{formatAddedDate(account.created_at)}</span>
        </PropertyRow>
        <PropertyRow label="Last sync">
          <span title={lastSync ? formatAuditTimestamp(lastSync) : undefined} {...stylex.props(!lastSync && styles.muted)}>
            {lastSync ? formatRelativeTime(lastSync) : 'Never'}
          </span>
        </PropertyRow>
      </>}
    </section>
  );

  const main = (
    <div {...stylex.props(styles.main)}>
      <span {...stylex.props(styles.icon)} aria-hidden="true">
        <BuyerlyIcon name="ad-accounts" size={22} />
      </span>
      {canAct ? (
        <input
          aria-label="Ad account name"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          onBlur={saveName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              setName(accountName(account));
              requestAnimationFrame(() => (event.target as HTMLInputElement).blur());
            }
          }}
          {...stylex.props(styles.nameInput)}
        />
      ) : (
        <h1 {...stylex.props(styles.name)}>{accountName(account)}</h1>
      )}
      <div {...stylex.props(styles.ids)}>
        {/* Meta's own name, when the buyer gave the account another one. */}
        {account.custom_name?.trim() && account.name && account.custom_name.trim() !== account.name && (
          <>
            <span {...stylex.props(styles.truncate)}>In Meta: {account.name}</span>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span {...stylex.props(styles.accountId)}>{account.account_id}</span>
        <Tooltip content="Copy account ID">
          <button
            type="button"
            aria-label="Copy account ID"
            onClick={() => void copyAccountId(account.account_id)}
            {...stylex.props(styles.copy)}
          >
            <BuyerlyIcon name="copy" size={13} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>

      {canAct ? (
        <textarea
          ref={noteRef}
          aria-label="Note"
          value={note}
          rows={1}
          maxLength={500}
          placeholder="Add a note…"
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => onSaveProfile({ note: note.trim() })}
          {...stylex.props(styles.noteInput)}
        />
      ) : account.note ? (
        <p {...stylex.props(styles.note)}>{account.note}</p>
      ) : null}


      <section aria-label="Today" {...stylex.props(styles.section)}>
        <SectionTitle>Today</SectionTitle>
        <div {...stylex.props(styles.figures)}>
          <Figure label="Spend" value={accountMoney(metrics?.spend, account)} />
          <Figure
            label="Leads"
            value={metrics ? String(metrics.leads) : '—'}
            caption={metrics?.leads ? `CPL ${accountMoney(metrics.cpl, account)}` : undefined}
          />
          <Figure
            label="Registrations"
            value={metrics ? String(metrics.registrations) : '—'}
            caption={metrics?.registrations ? `CPReg ${accountMoney(metrics.cpreg, account)}` : undefined}
          />
        </div>
        {!metrics && <p {...stylex.props(styles.hint)}>No figures yet: they appear after the first sync.</p>}
      </section>

      <section aria-label="Rules" {...stylex.props(styles.section)}>
        <SectionTitle
          action={canAct && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  {...stylex.props(styles.attach)}
                >
                  <BuyerlyIcon name="add" size={14} aria-hidden="true" />
                  Attach rule
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4} style={{ width: 'min(320px, calc(100vw - 32px))' }}>
                <DropdownMenuLabel>Run on this ad account</DropdownMenuLabel>
                {attachable.length === 0 ? (
                  <div {...stylex.props(styles.menuNote)}>
                    {rules.length === 0 ? 'No rules in this workspace yet' : 'Every rule already runs here'}
                  </div>
                ) : attachable.map((rule) => (
                  <DropdownMenuItem key={rule.id} onSelect={() => setPreviewRule({ id: rule.id, presetId: rule.presetId, name: rule.name })}>
                    <span {...stylex.props(styles.truncate)}>{rule.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        >
          Rules{attached.length > 0 && <span {...stylex.props(styles.count)}>{attached.length}</span>}
        </SectionTitle>
        {attached.length === 0 ? (
          <p {...stylex.props(styles.empty)}>No rules act on this account yet.</p>
        ) : (
          <ul {...stylex.props(styles.list, styles.rules)}>
            {attached.map((attachedRule) => {
              const rule = rules.find((item) => item.id === String(attachedRule.preset_id));
              const on = rule ? rule.status === 'active' : true;
              // The rule's own state, as on Rules: pausing it there pauses it on every account,
              // so the page shows it rather than offering a switch here.
              return (
                <li key={attachedRule.preset_id}>
                  <button
                    type="button"
                    data-rule-id={attachedRule.preset_id}
                    onClick={() => onOpenRule(String(attachedRule.preset_id))}
                    {...stylex.props(styles.rule)}
                  >
                    <span {...stylex.props(styles.ruleName, !on && styles.muted)}>
                      {rule?.name ?? attachedRule.name}
                    </span>
                    <span {...stylex.props(styles.ruleState)}>
                      <BuyerlyStatusCircleIcon status={on ? 'active' : 'paused'} size={14} />
                      {on ? 'Active' : 'Paused'}
                    </span>
                    <span {...stylex.props(styles.ruleScope)}>
                      {formatAccountScope(attachedRuleScope(attachedRule))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {attached.length > 0 && !account.rules_enabled && (
          <p {...stylex.props(styles.hint)}>Automation is off, so these rules don’t act on this account.</p>
        )}
      </section>

      <section aria-label="Recent events" {...stylex.props(styles.lastSection)}>
        <SectionTitle>Recent events</SectionTitle>
        {events === null ? (
          <p {...stylex.props(styles.empty)}>Loading…</p>
        ) : events.length === 0 ? (
          <p {...stylex.props(styles.empty)}>Nothing has happened on this account yet.</p>
        ) : (
          <EventList events={events} />
        )}
      </section>

      {previewRule && (
        <AttachRulePreviewDialog
          open
          presetId={previewRule.presetId}
          ruleName={previewRule.name}
          accountId={account.account_id}
          accountLabel={metaAccountLabel(account)}
          onCancel={() => setPreviewRule(null)}
          onConfirm={() => {
            const ruleId = previewRule.id;
            setPreviewRule(null);
            void onAttachRule(ruleId);
          }}
        />
      )}
    </div>
  );

  return (
    <DetailsPaneLayout pane="account" label="Ad account details" details={properties}>
      <div {...stylex.props(styles.mainScroll, page === 'activity' && styles.mainScrollActivity)}>
        <div {...stylex.props(styles.column)}>
          {page === 'activity' ? <AccountActivity accountId={account.account_id} navigationKey={navigationKey} /> : main}
        </div>
      </div>
    </DetailsPaneLayout>
  );
};

/** Draws the pool's models as they change (#488). */
export const AccountPage = observer(AccountPageContent);
