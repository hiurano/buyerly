import React, { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { ChevronLeft } from 'lucide-react';
import { colors } from '@/styles/tokens.stylex';
import { apiRequest } from '@/lib/api';
import type { Workspace } from '@/lib/types';
import {
  TEAM_KEY_MAX,
  TEAM_NAME_MAX,
  cleanTeamKey,
  notifyTeamsChanged,
  suggestTeamKey,
  teamsPath,
  type TeamItem,
} from '@/lib/teams';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { BuyerlyToggle } from '@/ui/BuyerlyToggle';
import { toast } from '@/ui/toast';
import { errorMessage } from './MemberDialogs';
import { TeamIcon } from './TeamIcon';
import { useShellStore } from '@/models/shellStore';

const styles = stylex.create({
  nameField: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    display: 'flex',
    height: 32,
    width: 32,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
  },
  actions: {
    marginTop: 24,
    display: 'flex',
    width: '100%',
    maxWidth: 640,
    justifyContent: 'flex-end',
  },
});

/**
 * Linear's "Create a new team" at /settings/new-team: Icon & Name and
 * Identifier in one card, the identifier filled from the name until it is
 * edited by hand ("Media buying" → MED), and Create team under it. Linear's
 * parent team, access, timezone and copied workflows have no Buyerly
 * counterpart, so they are left out. A created team opens on its own page.
 */
export const NewTeamSection: React.FC<{ workspace: Workspace }> = ({ workspace }) => {
  const setSettingsSection = useShellStore((state) => state.setSettingsSection);
  const openTeamSettings = useShellStore((state) => state.openTeamSettings);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  // Linear's "Make team private" on Create team.
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (!name.trim()) {
      setError('Enter a team name');
      return;
    }
    if (!key) {
      setError('Enter a team identifier');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const team = await apiRequest<TeamItem>(teamsPath(workspace.id), {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), key, private: isPrivate }),
      });
      notifyTeamsChanged();
      openTeamSettings(team.key);
    } catch (createError) {
      const message = errorMessage(createError, 'Please try again.');
      setError(message);
      toast.error("Couldn't create the team", message);
    }
    setBusy(false);
  };

  return (
    <>
      <button type="button" className="preferences-breadcrumb" onClick={() => setSettingsSection('teams')}>
        <ChevronLeft size={14} aria-hidden="true" />
        Back
      </button>
      <div className="preferences-title-container preferences-title-container--with-note">
        <h1 className="preferences-page-title">Create a new team</h1>
        <p className="preferences-page-note">Create a new team to group members and the ad accounts they work on</p>
      </div>

      <form
        className="preferences-section"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <section className="preferences-card-container preferences-card-container--divided">
          <div className="preferences-row-item preferences-row-item--column-on-mobile">
            <div className="preferences-row-copy">
              <label htmlFor="new-team-name" className="preferences-row-title">Icon &amp; Name</label>
            </div>
            <div {...stylex.props(styles.nameField)}>
              <span {...stylex.props(styles.icon)}>
                <TeamIcon size={16} />
              </span>
              <Input
                id="new-team-name"
                autoFocus
                autoComplete="off"
                className="preferences-row-input preferences-profile-input"
                placeholder="e.g. Media buying"
                maxLength={TEAM_NAME_MAX}
                value={name}
                disabled={busy}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!keyEdited) setKey(suggestTeamKey(event.target.value));
                }}
              />
            </div>
          </div>
          <div className="preferences-row-item preferences-row-item--column-on-mobile">
            <div className="preferences-row-copy">
              <label htmlFor="new-team-key" className="preferences-row-title">Identifier</label>
              <span className="preferences-row-desc">A short code that tells this team apart (e.g. MED)</span>
            </div>
            <Input
              id="new-team-key"
              autoComplete="off"
              spellCheck={false}
              className="preferences-row-input preferences-profile-input"
              placeholder="e.g. MED"
              maxLength={TEAM_KEY_MAX}
              value={key}
              disabled={busy}
              onChange={(event) => {
                setKey(cleanTeamKey(event.target.value));
                setKeyEdited(event.target.value !== '');
              }}
            />
          </div>
          <div className="preferences-row-item">
            <div className="preferences-row-copy">
              <span className="preferences-row-title">Make team private</span>
              <span className="preferences-row-desc">Only members see this team, its ad accounts and their campaigns</span>
            </div>
            <BuyerlyToggle checked={isPrivate} label="Make team private" disabled={busy} onChange={setIsPrivate} />
          </div>
        </section>
        {error && <p role="alert" className="preferences-row-error">{error}</p>}
        <div {...stylex.props(styles.actions)}>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create team'}
          </Button>
        </div>
      </form>
    </>
  );
};
