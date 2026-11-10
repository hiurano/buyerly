import React, { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { colors } from '@/styles/tokens.stylex';
import type { Workspace } from '@/lib/types';
import {
  TEAM_KEY_MAX,
  TEAM_NAME_MAX,
  cleanTeamKey,
  notifyTeamsChanged,
  suggestTeamKey,
  createTeam,
} from '@/lib/teams';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { BuyerlyToggle } from '@/ui/BuyerlyToggle';
import { toast } from '@/ui/toast';
import { errorMessage } from './MemberDialogs';
import { TeamIcon } from './TeamIcon';
import { openSettings, openTeamSettings } from '@/lib/routing';
import { withClassName } from '@/ui/withClassName';
import { preferencesStyles } from './preferencesStyles';
import css from './Preferences.module.css';

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
      const team = await createTeam(workspace.id, { name: name.trim(), key, private: isPrivate });
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
      <button type="button" {...withClassName(stylex.props(preferencesStyles.breadcrumb), 'preferences-breadcrumb')} onClick={() => openSettings('teams')}>
        <BuyerlyIcon name="chevron-left" size={14} aria-hidden="true" />
        Back
      </button>
      <div {...stylex.props(preferencesStyles.titleContainer, preferencesStyles.titleContainerWithNote)}>
        <h1 {...stylex.props(preferencesStyles.pageTitle)}>Create a new team</h1>
        <p {...stylex.props(preferencesStyles.pageNote)}>Create a new team to group members and the ad accounts they work on</p>
      </div>

      <form
        {...stylex.props(preferencesStyles.section)}
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <section {...withClassName(stylex.props(preferencesStyles.cardContainer), css.cardDivided)}>
          <div {...withClassName(stylex.props(preferencesStyles.rowItem, preferencesStyles.rowItemColumnOnMobile), css.rowItem)}>
            <div {...stylex.props(preferencesStyles.rowCopy, preferencesStyles.rowCopyColumnOnMobile)}>
              <label htmlFor="new-team-name" {...stylex.props(preferencesStyles.rowTitle)}>Icon &amp; Name</label>
            </div>
            <div {...stylex.props(styles.nameField)}>
              <span {...stylex.props(styles.icon)}>
                <TeamIcon size={16} />
              </span>
              <Input
                id="new-team-name"
                autoFocus
                autoComplete="off"
                xstyle={[preferencesStyles.rowInput, preferencesStyles.profileInput]}
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
          <div {...withClassName(stylex.props(preferencesStyles.rowItem, preferencesStyles.rowItemColumnOnMobile), css.rowItem)}>
            <div {...stylex.props(preferencesStyles.rowCopy, preferencesStyles.rowCopyColumnOnMobile)}>
              <label htmlFor="new-team-key" {...stylex.props(preferencesStyles.rowTitle)}>Identifier</label>
              <span {...stylex.props(preferencesStyles.rowDesc)}>A short code that tells this team apart (e.g. MED)</span>
            </div>
            <Input
              id="new-team-key"
              autoComplete="off"
              spellCheck={false}
              xstyle={[preferencesStyles.rowInput, preferencesStyles.profileInput, preferencesStyles.profileInputMobileFull]}
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
          <div {...withClassName(stylex.props(preferencesStyles.rowItem), css.rowItem)}>
            <div {...stylex.props(preferencesStyles.rowCopy)}>
              <span {...stylex.props(preferencesStyles.rowTitle)}>Make team private</span>
              <span {...stylex.props(preferencesStyles.rowDesc)}>Only members see this team, its ad accounts and their campaigns</span>
            </div>
            <BuyerlyToggle checked={isPrivate} label="Make team private" disabled={busy} onChange={setIsPrivate} />
          </div>
        </section>
        {error && <p role="alert" {...stylex.props(preferencesStyles.rowError)}>{error}</p>}
        <div {...stylex.props(styles.actions)}>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create team'}
          </Button>
        </div>
      </form>
    </>
  );
};
