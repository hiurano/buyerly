import React, { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { apiRequest } from '@/lib/api';
import { pool } from '@/models/pool';
import { membersQuery, teamDocumentsQuery } from '@/models/queries';
import { usePoolQuery } from '@/models/usePool';
import { useWorkspaceSession } from '@/lib/workspaceSession';
import { canAdministerWorkspace } from '@/lib/settingsPages';
import { teamHomePath, type TeamHomePage } from '@/lib/routing';
import {
  documentTitle,
  notifyTeamsChanged,
  teamDocumentsPath,
  teamsPath,
  useActiveTeam,
  type TeamDocument,
  type TeamItem,
} from '@/lib/teams';
import { useAppStore, type AppTab } from '@/store/useAppStore';
import { SidebarCollapsedNavigation } from '@/components/sidebar/SidebarCollapsedNavigation';
import { Initials, RoleStatus, shortDate } from '@/components/preferences/MembersSection';
import { memberName, type MemberItem } from '@/components/preferences/MemberDialogs';
import { TeamIcon } from '@/components/preferences/TeamIcon';
import {
  BuyerlyBoltIcon,
  BuyerlyDocumentIcon,
  BuyerlyDotsIcon,
  BuyerlyLinkIcon,
  BuyerlyIssuesIcon,
  BuyerlyPlusIcon,
  BuyerlyProjectIcon,
} from '@/icons/BuyerlyIcons';
import { DataState } from '@/ui/DataState';
import { Button } from '@/ui/Button';
import { DocumentsIllustration } from './DocumentsIllustration';
import { BuyerlyTabs } from '@/ui/BuyerlyTabs';
import { Tooltip } from '@/ui/Tooltip';
import { toast } from '@/ui/toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/DropdownMenu';
import { BuyerlyDataListRow, BuyerlyDataListToolbar, BuyerlyDataTable, type BuyerlyDataListColumn } from '@/ui/BuyerlyDataList';

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
      const created = await apiRequest<TeamDocument>(teamDocumentsPath(workspace.id, team.id), {
        method: 'POST',
        body: JSON.stringify({ title: '', content: '' }),
      });
      pool.append(teamDocumentsQuery(workspace.id, team.id), created, { first: true });
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
            onSaved={(saved) => pool.upsert('teamDocument', saved, saved.id)}
            onDeleted={() => {
              pool.remove('teamDocument', openDocument.id);
              open('documents');
            }}
          />
        );
      }
      if (documents.length === 0) {
        return (
          <div className="documents-empty" role="status">
            <div className="documents-empty__column">
              <DocumentsIllustration />
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
    <div className="flex h-full w-full select-none flex-col overflow-hidden bg-transparent">
      <header className="flex shrink-0 flex-col">
        <div
          style={{ borderBottom: 'var(--canvas-border)', paddingLeft: '18px', paddingRight: '11px' }}
          className="flex h-[44px] items-center justify-between"
        >
          <div className="flex min-w-0 items-center">
            <SidebarCollapsedNavigation />
            {team && (
              <button type="button" className="team-breadcrumb-link" onClick={() => open('overview')}>
                <TeamIcon size={16} className="mr-[6px]" />
                <span className="truncate text-[var(--text-primary)]">{team.name}</span>
              </button>
            )}
            {team && documentId && openDocument && (
              <>
                <span className="team-breadcrumb-separator" aria-hidden="true">›</span>
                <h2 className="truncate text-[13px] font-medium text-[var(--text-secondary)]">{documentTitle(openDocument)}</h2>
              </>
            )}
          </div>
          {team && (
            <Tooltip content="Copy team URL" side="bottom" align="end">
              <button type="button" aria-label="Copy team URL" onClick={copyLink} className="buyerly-icon-btn buyerly-header-target">
                <BuyerlyLinkIcon size={14} />
              </button>
            </Tooltip>
          )}
        </div>
        {!documentId && (
          <BuyerlyDataListToolbar className="gap-2">
            <BuyerlyTabs
              aria-label="Team pages"
              tabs={TABS}
              activeTabId={page}
              onChange={(id) => open(id as TeamHomePage)}
            />
            {page === 'members' && canAdministerWorkspace({ role: workspace.role }) && team && (
              <Tooltip content="Add members" side="bottom" align="end">
                <button
                  type="button"
                  aria-label="Add members"
                  onClick={() => {
                    useAppStore.getState().openTeamSettings(`${team.key}/members`);
                    useAppStore.getState().setActiveTab('preferences');
                  }}
                  className="buyerly-header-button buyerly-header-button--toolbar buyerly-header-target"
                >
                  <BuyerlyPlusIcon size={14} />
                </button>
              </Tooltip>
            )}
            {page === 'documents' && canWrite && team && (
              <Tooltip content="Create document" side="bottom" align="end">
                <button type="button" aria-label="Create document" onClick={() => void createDocument()} className="buyerly-header-button buyerly-header-button--toolbar buyerly-header-target">
                  <BuyerlyPlusIcon size={14} />
                </button>
              </Tooltip>
            )}
          </BuyerlyDataListToolbar>
        )}
      </header>
      <div className="flex min-h-0 min-w-0 flex-1">{renderBody()}</div>
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
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setActiveTeamKey = useAppStore((state) => state.setActiveTeamKey);
  const openTeamSettings = useAppStore((state) => state.openTeamSettings);
  const people = team.member_user_ids
    .map((id) => members.find((member) => member.user_id === id))
    .filter((member): member is MemberItem => Boolean(member));

  const goTo = (tab: AppTab) => {
    setActiveTeamKey(team.key);
    setActiveTab(tab);
  };
  const links: { id: string; label: string; icon: React.ReactNode; run: () => void }[] = [
    // Guests don't open settings, as in Linear.
    ...(workspace.role !== 'guest' ? [{
      id: 'settings',
      label: 'Team settings',
      icon: <TeamSettingsIcon />,
      run: () => {
        openTeamSettings(team.key);
        setActiveTab('preferences');
      },
    }] : []),
    { id: 'campaigns', label: 'Campaigns', icon: <BuyerlyIssuesIcon size={16} />, run: () => goTo('campaigns') },
    { id: 'accounts', label: 'Ad accounts', icon: <BuyerlyProjectIcon size={16} />, run: () => goTo('accounts') },
    { id: 'rules', label: 'Rules', icon: <BuyerlyBoltIcon size={16} />, run: () => goTo('rules') },
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
                <button type="button" aria-label="Add document" onClick={onCreateDocument} className="buyerly-header-button buyerly-header-button--toolbar buyerly-header-target">
                  <BuyerlyPlusIcon size={14} />
                </button>
              </Tooltip>
            )}
          </div>
          {documents.length === 0 ? (
            <p className="team-overview__placeholder">Add documents for the team. They are listed here and under Documents.</p>
          ) : (
            <div className="team-overview__resource-list">
              {documents.map((document) => (
                <button key={document.id} type="button" className="team-resource" onClick={() => onOpenTab('documents', document.id)}>
                  <BuyerlyDocumentIcon size={16} className="shrink-0 text-[var(--text-tertiary)]" />
                  <span className="truncate">{documentTitle(document)}</span>
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
          {people.length === 0 && <span className="text-[13px] text-[var(--text-muted)]">No members</span>}
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
      await apiRequest(teamsPath(workspace.id, `/${team.id}`), { method: 'PATCH', body: JSON.stringify({ description: next }) });
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
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" clipRule="evenodd" d="M8.00021 5.25C9.51887 5.25015 10.7502 6.48131 10.7502 8C10.7502 9.51869 9.51887 10.7499 8.00021 10.75C6.48142 10.75 5.25021 9.51878 5.25021 8C5.25021 6.48122 6.48142 5.25 8.00021 5.25ZM8.00021 6.75C7.30985 6.75 6.75021 7.30964 6.75021 8C6.75021 8.69036 7.30985 9.25 8.00021 9.25C8.69044 9.24985 9.25021 8.69027 9.25021 8C9.25021 7.30973 8.69044 6.75015 8.00021 6.75Z" />
    <path fillRule="evenodd" clipRule="evenodd" d="M8.4797 1C8.79032 1.00005 9.11521 1.07609 9.39571 1.28516C9.67641 1.49469 9.84241 1.78493 9.93087 2.08301L10.0764 2.57422C10.1033 2.66485 10.1451 2.71838 10.2268 2.76562L11.4192 3.4541C11.5007 3.50111 11.5678 3.51013 11.6594 3.48828L12.1584 3.36914C12.4605 3.2968 12.7939 3.29566 13.1154 3.43359C13.4372 3.57185 13.666 3.81486 13.8215 4.08398L14.302 4.91602C14.4573 5.18528 14.554 5.50472 14.5129 5.85254C14.4717 6.20036 14.303 6.48828 14.0891 6.71387L13.7365 7.08594C13.6717 7.15443 13.6467 7.21713 13.6467 7.31152V8.68848C13.6467 8.78287 13.6717 8.84557 13.7365 8.91406L14.0891 9.28613C14.303 9.51172 14.4717 9.79964 14.5129 10.1475C14.554 10.4953 14.4573 10.8147 14.302 11.084L13.8215 11.916C13.666 12.1851 13.4372 12.4281 13.1154 12.5664C12.7939 12.7043 12.4605 12.7032 12.1584 12.6309L11.6594 12.5117C11.5678 12.4899 11.5007 12.4989 11.4192 12.5459L10.2268 13.2344C10.1451 13.2816 10.1033 13.3352 10.0764 13.4258L9.93087 13.917C9.84241 14.2151 9.67641 14.5053 9.39571 14.7148C9.11521 14.9239 8.79032 15 8.4797 15H7.51974C7.20899 14.9999 6.8833 14.9242 6.60275 14.7148C6.32229 14.5053 6.15699 14.2149 6.06857 13.917L5.92306 13.4258C5.89612 13.3351 5.85359 13.2817 5.77169 13.2344L4.58028 12.5459C4.51915 12.5107 4.46564 12.4967 4.4045 12.501L4.33907 12.5117L3.84103 12.6309C3.53875 12.7032 3.20473 12.7047 2.88302 12.5664C2.56142 12.428 2.33239 12.1852 2.17696 11.916L1.69747 11.084C1.54209 10.8147 1.44542 10.4953 1.48653 10.1475C1.52769 9.79988 1.69567 9.51165 1.90939 9.28613L2.26192 8.91406C2.327 8.84544 2.35271 8.783 2.35275 8.68848V7.31152C2.35271 7.217 2.327 7.15455 2.26192 7.08594L1.90939 6.71387C1.69567 6.48835 1.52769 6.20012 1.48653 5.85254C1.44542 5.50474 1.54209 5.18527 1.69747 4.91602L2.17696 4.08398C2.33239 3.81484 2.56142 3.57196 2.88302 3.43359C3.20473 3.29533 3.53875 3.29676 3.84103 3.36914L4.33907 3.48828L4.4045 3.49902C4.46564 3.50331 4.51915 3.48931 4.58028 3.4541L5.77169 2.76562C5.85359 2.71834 5.89612 2.66492 5.92306 2.57422L6.06857 2.08301C6.15699 1.78507 6.32229 1.49467 6.60275 1.28516C6.8833 1.07582 7.20899 1.0001 7.51974 1H8.4797ZM7.50607 2.50977L7.36056 3.00098C7.2244 3.45982 6.93621 3.82513 6.52169 4.06445L5.33028 4.75293C4.9675 4.96225 4.56891 5.03929 4.16329 4.98047L3.98946 4.94727L3.49142 4.82812C3.48792 4.82734 3.48373 4.82682 3.48067 4.82617C3.47921 4.82856 3.47735 4.83128 3.47579 4.83398L2.9963 5.66602C2.99471 5.66872 2.99276 5.67137 2.99142 5.67383C2.9935 5.67614 2.99584 5.67906 2.99825 5.68164L3.35079 6.05371C3.68013 6.401 3.8527 6.83292 3.85275 7.31152V8.68848C3.8527 9.16708 3.68013 9.599 3.35079 9.94629L2.99825 10.3184C2.99599 10.3207 2.99337 10.323 2.99142 10.3252C2.99288 10.3279 2.99458 10.331 2.9963 10.334L3.47579 11.166C3.4772 11.1685 3.47931 11.1707 3.48067 11.1729C3.48367 11.1722 3.48798 11.1726 3.49142 11.1719L3.98946 11.0527L4.16329 11.0195C4.56891 10.9607 4.96751 11.0378 5.33028 11.2471L6.52169 11.9355C6.93621 12.1749 7.2244 12.5402 7.36056 12.999L7.50607 13.4902L7.509 13.499C7.51207 13.4991 7.51622 13.4999 7.51974 13.5H8.4797C8.48257 13.5 8.48588 13.4992 8.48849 13.499C8.48939 13.4962 8.49141 13.4934 8.49239 13.4902L8.6379 12.999L8.6965 12.8311C8.84844 12.4508 9.11439 12.1449 9.47677 11.9355L10.6692 11.2471C11.0834 11.008 11.5439 10.9414 12.009 11.0527L12.508 11.1719C12.5108 11.1725 12.5142 11.1724 12.5168 11.1729C12.5182 11.1705 12.5211 11.1686 12.5227 11.166L13.0022 10.334C13.0038 10.3311 13.0047 10.3278 13.0061 10.3252C13.0043 10.3232 13.0022 10.3205 13.0002 10.3184L12.6477 9.94629C12.3186 9.59908 12.1467 9.16687 12.1467 8.68848V7.31152C12.1467 6.83313 12.3186 6.40092 12.6477 6.05371L13.0002 5.68164C13.0024 5.67931 13.0042 5.67603 13.0061 5.67383C13.0048 5.67147 13.0036 5.66858 13.0022 5.66602L12.5227 4.83398C12.521 4.83114 12.5183 4.82869 12.5168 4.82617C12.5142 4.82674 12.5109 4.82744 12.508 4.82812L12.009 4.94727C11.5439 5.05858 11.0834 4.99203 10.6692 4.75293L9.47677 4.06445C9.11439 3.8551 8.84844 3.54923 8.6965 3.16895L8.6379 3.00098L8.49239 2.50977C8.49133 2.50626 8.48948 2.50306 8.48849 2.5H7.509L7.50607 2.50977Z" />
  </svg>
);

/** The chevron at the end of a "Go to" link. */
const GoToChevron: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="team-overview__link-arrow">
    <path d="M5.46967 11.4697C5.17678 11.7626 5.17678 12.2374 5.46967 12.5303C5.76256 12.8232 6.23744 12.8232 6.53033 12.5303L10.5303 8.53033C10.8207 8.23999 10.8236 7.77014 10.5368 7.47624L6.63419 3.47624C6.34492 3.17976 5.87009 3.17391 5.57361 3.46318C5.27713 3.75244 5.27128 4.22728 5.56054 4.52376L8.94583 7.99351L5.46967 11.4697Z" />
  </svg>
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
          className="cursor-pointer"
          onClick={() => onOpen(document.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.target === event.currentTarget) onOpen(document.id);
          }}
        >
          <div className="flex min-w-0 items-center gap-[10px]">
            <BuyerlyDocumentIcon size={16} className="shrink-0 text-[var(--text-tertiary)]" />
            <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">{documentTitle(document)}</span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            {author && <Initials label={memberName(author)} avatarUrl={author.avatar_url} />}
            <span className="truncate text-[12px] font-[450] text-[var(--text-tertiary)]">{author ? memberName(author) : ''}</span>
          </div>
          <span className="text-[12px] font-[450] text-[var(--text-tertiary)]">{shortDate(document.updated_at)}</span>
        </BuyerlyDataListRow>
      );
    })}
  </BuyerlyDataTable>
);

interface TeamDocumentEditorProps {
  team: TeamItem;
  document: TeamDocument;
  readOnly: boolean;
  onSaved: (document: TeamDocument) => void;
  onDeleted: () => void;
}

/** One document, as Linear's: a large title over the body, saved as you type. */
const TeamDocumentEditor: React.FC<TeamDocumentEditorProps> = ({ team, document, readOnly, onSaved, onDeleted }) => {
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
      const saved = await apiRequest<TeamDocument>(teamDocumentsPath(workspace.id, team.id, document.id), {
        method: 'PATCH',
        body: JSON.stringify(changes),
      });
      onSaved(saved);
      setSaving('saved');
    } catch (error) {
      pending.current = { ...changes, ...pending.current };
      setSaving('error');
      toast.error("Couldn't save the document", error instanceof Error ? error.message : undefined);
    }
  }, [document.id, onSaved, team.id, workspace.id]);

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
    try {
      await apiRequest(teamDocumentsPath(workspace.id, team.id, document.id), { method: 'DELETE' });
      toast.show({ tone: 'success', title: 'Document deleted' });
      onDeleted();
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
                <button type="button" aria-label="Document actions" className="buyerly-header-button buyerly-header-button--toolbar buyerly-header-target">
                  <BuyerlyDotsIcon size={14} />
                </button>
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
  const openTeamSettings = useAppStore((state) => state.openTeamSettings);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const { workspace } = useWorkspaceSession();
  if (!members) return <DataState title="Loading members…" detail="Reading the members of this team." />;
  const people = members.filter((member) => team.member_user_ids.includes(member.user_id));
  const canEdit = canAdministerWorkspace({ role: workspace.role });
  const manage = () => {
    openTeamSettings(`${team.key}/members`);
    setActiveTab('preferences');
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
          <div className="flex min-w-0 items-center gap-[10px]">
            <Initials label={memberName(member)} avatarUrl={member.avatar_url} size={24} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-medium text-[var(--text-secondary)]">{memberName(member)}</span>
              {member.username && member.username !== member.email && <span className="truncate text-[12px] font-medium text-[var(--text-tertiary)]">{member.username}</span>}
            </div>
          </div>
          <span className="truncate text-[13px] font-[450] text-[var(--text-secondary)]">{member.email ?? ''}</span>
          <span className="text-[12px] font-[450] text-[var(--text-tertiary)]"><RoleStatus role={member.role} /></span>
        </BuyerlyDataListRow>
      ))}
    </BuyerlyDataTable>
  );
};

/** Draws the pool's models as they change (#488). */
export const TeamHomeView = observer(TeamHomeViewContent);
