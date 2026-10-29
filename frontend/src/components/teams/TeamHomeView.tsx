import * as stylex from '@stylexjs/stylex';
import React, { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { pool } from '@/models/pool';
import { membersQuery, teamDocumentsQuery } from '@/models/queries';
import { usePoolQuery } from '@/models/usePool';
import { useWorkspaceSession } from '@/lib/workspaceSession';
import { canAdministerWorkspace } from '@/lib/settingsPages';
import { openTeamSettings, type TeamHomePage, teamHomePath } from '@/lib/routing';
import { openTab } from '@/lib/navigation';
import {
  documentTitle,
  notifyTeamsChanged,
  createTeamDocument,
  deleteTeamDocument,
  updateTeam,
  updateTeamDocument,
  useActiveTeam,
  type TeamDocument,
  type TeamItem,
} from '@/lib/teams';
import { SidebarCollapsedNavigation } from '@/components/sidebar/SidebarCollapsedNavigation';
import { Initials, RoleStatus, shortDate } from '@/components/preferences/MembersSection';
import { memberName, type MemberItem } from '@/components/preferences/MemberDialogs';
import { TeamIcon } from '@/components/preferences/TeamIcon';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { DataState } from '@/ui/DataState';
import { Button } from '@/ui/Button';
import { BuyerlyTabs } from '@/ui/BuyerlyTabs';
import { Tooltip } from '@/ui/Tooltip';
import { toast } from '@/ui/toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/DropdownMenu';
import { BuyerlyDataListRow, BuyerlyDataListToolbar, BuyerlyDataTable, type BuyerlyDataListColumn } from '@/ui/BuyerlyDataList';
import type { AppTab } from '@/models/shellStore';
import { colors } from '@/styles/tokens.stylex';
import { BuyerlyToolbarButton } from '@/ui/BuyerlyToolbarButton';

const truncate = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

const styles = stylex.create({
  root: {
    display: 'flex',
    height: '100%',
    width: '100%',
    userSelect: 'none',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  header: {
    display: 'flex',
    flexShrink: 0,
    flexDirection: 'column',
  },
  // The 44px title bar over a hairline.
  titleBar: {
    display: 'flex',
    height: 44,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 18,
    paddingRight: 11,
  },
  title: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
  },
  teamIcon: {
    marginRight: 6,
  },
  teamName: {
    ...truncate,
    color: colors['--text-primary'],
  },
  documentHeading: {
    ...truncate,
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-secondary'],
  },
  toolbar: {
    gap: 8,
  },
  body: {
    display: 'flex',
    minHeight: 0,
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
  },
  documentIcon: {
    flexShrink: 0,
    color: colors['--text-tertiary'],
  },
  resourceTitle: {
    ...truncate,
  },
  noMembers: {
    fontSize: 13,
    color: colors['--text-muted'],
  },
  row: {
    cursor: 'pointer',
  },
  cellLead: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 10,
  },
  author: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 8,
  },
  documentName: {
    ...truncate,
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  names: {
    display: 'flex',
    minWidth: 0,
    flexDirection: 'column',
  },
  memberName: {
    ...truncate,
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-secondary'],
  },
  username: {
    ...truncate,
    fontSize: 12,
    fontWeight: 500,
    color: colors['--text-tertiary'],
  },
  email: {
    ...truncate,
    fontSize: 13,
    fontWeight: 450,
    color: colors['--text-secondary'],
  },
  meta: {
    fontSize: 12,
    fontWeight: 450,
    color: colors['--text-tertiary'],
  },
  metaTruncated: {
    ...truncate,
    fontSize: 12,
    fontWeight: 450,
    color: colors['--text-tertiary'],
  },
});

const TABS: { id: TeamHomePage; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'documents', label: 'Documents' },
  { id: 'members', label: 'Members' },
];

interface TeamHomeViewProps {
  page: TeamHomePage;
  /** On the Documents tab: the document open, from /team/<KEY>/documents/<id>. */
  documentId?: string;
  navigate: (path: string) => void;
}

/** Linear's team Home: Overview, Documents and Members of one team. */
const TeamHomeViewContent: React.FC<TeamHomeViewProps> = ({ page, documentId, navigate }) => {
  const { workspace } = useWorkspaceSession();
  const { team, loading, missing } = useActiveTeam(workspace.id);
  // From the pool: a team Home already visited draws its members and documents at once (#488).
  const membersRead = usePoolQuery(membersQuery(workspace.id));
  const members: MemberItem[] | null = membersRead.data ?? (membersRead.error ? [] : null);
  const teamId = team?.id;
  const documentsRead = usePoolQuery(teamId === undefined ? null : teamDocumentsQuery(workspace.id, teamId));
  const documents = documentsRead.data ?? null;
  const documentsError = documentsRead.error;
  // Guests write in the teams they're on, which are the only ones they see, as in Linear.
  const canWrite = true;
  const loadDocuments = () => {
    if (teamId !== undefined) void pool.fetch(teamDocumentsQuery(workspace.id, teamId), { afterWrite: true });
  };

  const open = (next: TeamHomePage, id?: number) => {
    if (team) navigate(teamHomePath(workspace.slug, team.key, next, id));
  };

  const createDocument = async () => {
    if (!team) return;
    try {
      // In the list at once; opened once the server gave it its id (#508).
      const created = await createTeamDocument(workspace.id, team.id, { title: '', content: '' });
      open('documents', created.id);
    } catch (error) {
      toast.error("Couldn't create the document", error instanceof Error ? error.message : undefined);
    }
  };

  const copyLink = () => {
    if (!team) return;
    const url = `${window.location.origin}${teamHomePath(workspace.slug, team.key)}`;
    navigator.clipboard.writeText(url).then(
      () => toast.show({ tone: 'success', title: 'Copied team URL to clipboard' }),
      () => toast.error("Couldn't copy the link", url),
    );
  };

  const openDocument = documentId && documents ? documents.find((item) => String(item.id) === documentId) : undefined;

  const renderBody = () => {
    if (missing) return <DataState title="Team not found" detail="This workspace has no team with that identifier." />;
    if (loading || !team) return <DataState title="Loading team…" detail="Reading the team of this workspace." />;
    if (page === 'members') return <TeamMembersTab team={team} members={members} />;
    if (page === 'documents') {
      if (documentsError && !documents) {
        return <DataState title="Couldn't load documents" detail={documentsError} role="alert" actionLabel="Retry" onAction={() => void loadDocuments()} />;
      }
      if (!documents) return <DataState title="Loading documents…" detail="Reading the team's documents." />;
      if (documentId) {
        if (!openDocument) return <DataState title="Document not found" detail="It may have been deleted." actionLabel="All documents" onAction={() => open('documents')} />;
        return (
          <TeamDocumentEditor
            key={openDocument.id}
            team={team}
            document={openDocument}
            readOnly={!canWrite}
            onDeleted={() => open('documents')}
          />
        );
      }
      if (documents.length === 0) {
        return (
          <div className="documents-empty" role="status">
            <div className="documents-empty__column">
              <BuyerlyIcon name="documents-empty" size={80} className="documents-empty__icon" />
              <span className="documents-empty__title">Team documents</span>
              <span className="documents-empty__detail">Create documents to share notes, decisions, and plans with your team.</span>
              {canWrite && (
                <Button variant="primary" size="compact" className="documents-empty__action" onClick={() => void createDocument()}>
                  Create document
                </Button>
              )}
            </div>
          </div>
        );
      }
      return <TeamDocumentsList documents={documents} members={members ?? []} onOpen={(id) => open('documents', id)} />;
    }
    return (
      <TeamOverview
        team={team}
        members={members ?? []}
        documents={documents ?? []}
        canEdit={canAdministerWorkspace({ role: workspace.role })}
        canWrite={canWrite}
        onOpenTab={open}
        onCreateDocument={() => void createDocument()}
      />
    );
  };

  return (
    <div {...stylex.props(styles.root)}>
      <header {...stylex.props(styles.header)}>
        {/* --canvas-border is a whole border; StyleX would split the shorthand and lose it. */}
        <div {...stylex.props(styles.titleBar)} style={{ borderBottom: 'var(--canvas-border)' }}>
          <div {...stylex.props(styles.title)}>
            <SidebarCollapsedNavigation />
            {team && (
              <button type="button" className="team-breadcrumb-link" onClick={() => open('overview')}>
                <TeamIcon size={16} className={stylex.props(styles.teamIcon).className} />
                <span {...stylex.props(styles.teamName)}>{team.name}</span>
              </button>
            )}
            {team && documentId && openDocument && (
              <>
                <span className="team-breadcrumb-separator" aria-hidden="true">›</span>
                <h2 {...stylex.props(styles.documentHeading)}>{documentTitle(openDocument)}</h2>
              </>
            )}
          </div>
          {team && (
            <Tooltip content="Copy team URL" side="bottom" align="end">
              <button type="button" aria-label="Copy team URL" onClick={copyLink} className="buyerly-icon-btn buyerly-header-target">
                <BuyerlyIcon name="link" size={14} />
              </button>
            </Tooltip>
          )}
        </div>
        {!documentId && (
          <BuyerlyDataListToolbar xstyle={styles.toolbar}>
            <BuyerlyTabs
              aria-label="Team pages"
              tabs={TABS}
              activeTabId={page}
              onChange={(id) => open(id as TeamHomePage)}
            />
            {page === 'members' && canAdministerWorkspace({ role: workspace.role }) && team && (
              <Tooltip content="Add members" side="bottom" align="end">
                <BuyerlyToolbarButton
                  aria-label="Add members"
                  onClick={() => {
                    openTeamSettings(`${team.key}/members`);
                  }}
                >
                  <BuyerlyIcon name="add" size={14} />
                </BuyerlyToolbarButton>
              </Tooltip>
            )}
            {page === 'documents' && canWrite && team && (
              <Tooltip content="Create document" side="bottom" align="end">
                <BuyerlyToolbarButton aria-label="Create document" onClick={() => void createDocument()}>
                  <BuyerlyIcon name="add" size={14} />
                </BuyerlyToolbarButton>
              </Tooltip>
            )}
          </BuyerlyDataListToolbar>
        )}
      </header>
      <div {...stylex.props(styles.body)}>{renderBody()}</div>
    </div>
  );
};

interface TeamOverviewProps {
  team: TeamItem;
  members: MemberItem[];
  documents: TeamDocument[];
  canEdit: boolean;
  canWrite: boolean;
  onOpenTab: (page: TeamHomePage, documentId?: number) => void;
  onCreateDocument: () => void;
}

/** Linear's team Overview: icon and name, the description, Team resources; Members and Go to beside them. */
const TeamOverview: React.FC<TeamOverviewProps> = ({ team, members, documents, canEdit, canWrite, onOpenTab, onCreateDocument }) => {
  const { workspace } = useWorkspaceSession();
  const people = team.member_user_ids
    .map((id) => members.find((member) => member.user_id === id))
    .filter((member): member is MemberItem => Boolean(member));

  const goTo = (tab: AppTab) => {
    openTab(tab, { teamKey: team.key });
  };
  const links: { id: string; label: string; icon: React.ReactNode; run: () => void }[] = [
    // Guests don't open settings, as in Linear.
    ...(workspace.role !== 'guest' ? [{
      id: 'settings',
      label: 'Team settings',
      icon: <TeamSettingsIcon />,
      run: () => {
        openTeamSettings(team.key);
      },
    }] : []),
    { id: 'campaigns', label: 'Campaigns', icon: <BuyerlyIcon name="campaigns" size={16} />, run: () => goTo('campaigns') },
    { id: 'accounts', label: 'Ad accounts', icon: <BuyerlyIcon name="ad-accounts" size={16} />, run: () => goTo('accounts') },
    { id: 'rules', label: 'Rules', icon: <BuyerlyIcon name="rules" size={16} />, run: () => goTo('rules') },
  ];

  return (
    <div className="team-overview">
      <div className="team-overview__main">
        <div className="team-overview__heading">
          <span className="team-overview__icon"><TeamIcon size={24} /></span>
          <h1 className="team-overview__title">{team.name}</h1>
        </div>
        <TeamDescription team={team} canEdit={canEdit} />

        <section className="team-overview__resources">
          <div className="team-overview__section-header">
            <h3 className="team-overview__section-title">Team resources</h3>
            {canWrite && (
              <Tooltip content="Add document" side="bottom" align="end">
                <BuyerlyToolbarButton aria-label="Add document" onClick={onCreateDocument}>
                  <BuyerlyIcon name="add" size={14} />
                </BuyerlyToolbarButton>
              </Tooltip>
            )}
          </div>
          {documents.length === 0 ? (
            <p className="team-overview__placeholder">Add documents for the team. They are listed here and under Documents.</p>
          ) : (
            <div className="team-overview__resource-list">
              {documents.map((document) => (
                <button key={document.id} type="button" className="team-resource" onClick={() => onOpenTab('documents', document.id)}>
                  <BuyerlyIcon name="document" size={16} {...stylex.props(styles.documentIcon)} />
                  <span {...stylex.props(styles.resourceTitle)}>{documentTitle(document)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="team-overview__aside">
        <div className="team-overview__aside-label">Members</div>
        <button type="button" className="team-overview__faces" onClick={() => onOpenTab('members')} aria-label={`${people.length} members`}>
          {people.slice(0, 8).map((member, index) => (
            <span key={member.user_id} className="team-face" style={{ zIndex: 8 - index }} title={memberName(member)}>
              <Initials label={memberName(member)} avatarUrl={member.avatar_url} />
            </span>
          ))}
          {people.length === 0 && <span {...stylex.props(styles.noMembers)}>No members</span>}
        </button>

        <div className="team-overview__aside-label team-overview__aside-label--spaced">Go to</div>
        <div className="team-overview__links">
          {links.map((link) => (
            <button key={link.id} type="button" className="team-overview__link" onClick={link.run}>
              <span className="team-overview__link-icon">{link.icon}</span>
              <span>{link.label}</span>
              <GoToChevron />
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
};

/** Linear's "Add a description…" under the team's name: owners and admins edit it in place. */
const TeamDescription: React.FC<{ team: TeamItem; canEdit: boolean }> = ({ team, canEdit }) => {
  const { workspace } = useWorkspaceSession();
  const [value, setValue] = useState(team.description);
  useEffect(() => setValue(team.description), [team.description]);
  if (!canEdit) {
    return team.description ? <p className="team-overview__description">{team.description}</p> : null;
  }
  const save = async () => {
    const next = value.trim();
    if (next === team.description) return;
    try {
      await updateTeam(workspace.id, team.id, { description: next });
      notifyTeamsChanged();
    } catch (error) {
      setValue(team.description);
      toast.error("Couldn't save the description", error instanceof Error ? error.message : undefined);
    }
  };
  return (
    <textarea
      className="team-overview__description team-overview__description--input"
      value={value}
      maxLength={255}
      rows={1}
      placeholder="Add a description…"
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => void save()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          setValue(team.description);
          event.currentTarget.blur();
        }
      }}
    />
  );
};

const TeamSettingsIcon: React.FC = () => (
  <BuyerlyIcon name="settings" size={16} />
);

/** The chevron at the end of a "Go to" link. */
const GoToChevron: React.FC = () => (
  <BuyerlyIcon name="chevron-right" size={14} className="team-overview__link-arrow" />
);

const DOCUMENT_COLUMNS: BuyerlyDataListColumn[] = [
  { id: 'name', label: 'Name', width: 'minmax(220px, 1fr)' },
  { id: 'author', label: 'Created by', width: '160px' },
  { id: 'updated', label: 'Updated', width: '100px' },
];

const TeamDocumentsList: React.FC<{ documents: TeamDocument[]; members: MemberItem[]; onOpen: (id: number) => void }> = ({
  documents,
  members,
  onOpen,
}) => (
  <BuyerlyDataTable columns={DOCUMENT_COLUMNS}>
    {documents.map((document) => {
      const author = members.find((member) => member.user_id === document.created_by_user_id);
      return (
        <BuyerlyDataListRow
          key={document.id}
          layout="grid"
          columns={DOCUMENT_COLUMNS}
          tabIndex={0}
          xstyle={styles.row}
          onClick={() => onOpen(document.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.target === event.currentTarget) onOpen(document.id);
          }}
        >
          <div {...stylex.props(styles.cellLead)}>
            <BuyerlyIcon name="document" size={16} {...stylex.props(styles.documentIcon)} />
            <span {...stylex.props(styles.documentName)}>{documentTitle(document)}</span>
          </div>
          <div {...stylex.props(styles.author)}>
            {author && <Initials label={memberName(author)} avatarUrl={author.avatar_url} />}
            <span {...stylex.props(styles.metaTruncated)}>{author ? memberName(author) : ''}</span>
          </div>
          <span {...stylex.props(styles.meta)}>{shortDate(document.updated_at)}</span>
        </BuyerlyDataListRow>
      );
    })}
  </BuyerlyDataTable>
);

interface TeamDocumentEditorProps {
  team: TeamItem;
  document: TeamDocument;
  readOnly: boolean;
  onDeleted: () => void;
}

/** One document, as Linear's: a large title over the body, saved as you type. */
const TeamDocumentEditor: React.FC<TeamDocumentEditorProps> = ({ team, document, readOnly, onDeleted }) => {
  const { workspace } = useWorkspaceSession();
  const [title, setTitle] = useState(document.title);
  const [content, setContent] = useState(document.content);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const pending = useRef<{ title?: string; content?: string }>({});
  const timer = useRef<number | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const flush = useCallback(async () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const changes = pending.current;
    if (changes.title === undefined && changes.content === undefined) return;
    pending.current = {};
    setSaving('saving');
    try {
      await updateTeamDocument(workspace.id, team.id, document.id, changes);
      setSaving('saved');
    } catch (error) {
      pending.current = { ...changes, ...pending.current };
      setSaving('error');
      toast.error("Couldn't save the document", error instanceof Error ? error.message : undefined);
    }
  }, [document.id, team.id, workspace.id]);

  const schedule = (changes: { title?: string; content?: string }) => {
    pending.current = { ...pending.current, ...changes };
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 600);
  };

  // Whatever is still unsaved goes when the document closes.
  const flushOnClose = useEffectEvent(() => void flush());
  useEffect(() => () => flushOnClose(), []);

  // The tab is named after the document, as Linear's.
  useEffect(() => {
    window.document.title = documentTitle({ title });
  }, [title]);

  // The body grows with its text, as Linear's editor.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.style.height = 'auto';
    body.style.height = `${body.scrollHeight}px`;
  }, [content]);

  const remove = async () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    pending.current = {};
    // Gone from the list at once, as Linear's; it comes back if the server refuses (#508).
    onDeleted();
    try {
      await deleteTeamDocument(workspace.id, team.id, document.id);
      toast.show({ tone: 'success', title: 'Document deleted' });
    } catch (error) {
      toast.error("Couldn't delete the document", error instanceof Error ? error.message : undefined);
    }
  };

  const status = useMemo(() => {
    if (saving === 'saving') return 'Saving…';
    if (saving === 'error') return 'Not saved';
    return `Updated ${shortDate(document.updated_at)}`;
  }, [document.updated_at, saving]);

  return (
    <div className="team-document">
      <div className="team-document__inner">
        <div className="team-document__meta">
          <span>{status}</span>
          {!readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <BuyerlyToolbarButton aria-label="Document actions">
                  <BuyerlyIcon name="more" size={14} />
                </BuyerlyToolbarButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4}>
                <DropdownMenuItem onSelect={() => void remove()}>Delete document</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <textarea
          className="team-document__title"
          value={title}
          rows={1}
          maxLength={255}
          readOnly={readOnly}
          placeholder="Document title"
          autoFocus={!readOnly && !document.title}
          onChange={(event) => {
            setTitle(event.target.value);
            schedule({ title: event.target.value });
          }}
          onBlur={() => void flush()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              bodyRef.current?.focus();
            }
          }}
        />
        <textarea
          ref={bodyRef}
          className="team-document__body"
          value={content}
          readOnly={readOnly}
          placeholder={readOnly ? '' : 'Write notes, decisions or a plan… Markdown works.'}
          onChange={(event) => {
            setContent(event.target.value);
            schedule({ content: event.target.value });
          }}
          onBlur={() => void flush()}
        />
      </div>
    </div>
  );
};

const MEMBER_COLUMNS: BuyerlyDataListColumn[] = [
  { id: 'name', label: 'Name', width: 'minmax(220px, 1fr)' },
  { id: 'email', label: 'Email', width: 'minmax(160px, 240px)' },
  { id: 'role', label: 'Role', width: '120px' },
];

/** Linear's team Members tab: who is on the team; owners and admins change it in the team's settings. */
const TeamMembersTab: React.FC<{ team: TeamItem; members: MemberItem[] | null }> = ({ team, members }) => {
  const { workspace } = useWorkspaceSession();
  if (!members) return <DataState title="Loading members…" detail="Reading the members of this team." />;
  const people = members.filter((member) => team.member_user_ids.includes(member.user_id));
  const canEdit = canAdministerWorkspace({ role: workspace.role });
  const manage = () => {
    openTeamSettings(`${team.key}/members`);
  };
  if (people.length === 0) {
    return (
      <DataState
        title="No members yet"
        detail={`Nobody is on ${team.name} yet.`}
        actionLabel={canEdit ? 'Add members' : undefined}
        onAction={canEdit ? manage : undefined}
      />
    );
  }
  return (
    <BuyerlyDataTable columns={MEMBER_COLUMNS}>
      {people.map((member) => (
        <BuyerlyDataListRow key={member.id} layout="grid" columns={MEMBER_COLUMNS} height={50}>
          <div {...stylex.props(styles.cellLead)}>
            <Initials label={memberName(member)} avatarUrl={member.avatar_url} size={24} />
            <div {...stylex.props(styles.names)}>
              <span {...stylex.props(styles.memberName)}>{memberName(member)}</span>
              {member.username && member.username !== member.email && <span {...stylex.props(styles.username)}>{member.username}</span>}
            </div>
          </div>
          <span {...stylex.props(styles.email)}>{member.email ?? ''}</span>
          <span {...stylex.props(styles.meta)}><RoleStatus role={member.role} /></span>
        </BuyerlyDataListRow>
      ))}
    </BuyerlyDataTable>
  );
};

/** Draws the pool's models as they change (#488). */
export const TeamHomeView = observer(TeamHomeViewContent);
