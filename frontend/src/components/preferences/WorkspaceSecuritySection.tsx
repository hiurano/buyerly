import React, { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { changeInviteLink, fetchInviteLink, type InviteLink } from '@/lib/workspaces';
import type { Workspace } from '@/lib/types';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { BuyerlyToggle } from '@/ui/BuyerlyToggle';
import { Tooltip } from '@/ui/Tooltip';
import { toast } from '@/ui/toast';
import { withClassName } from '@/ui/withClassName';
import { errorMessage } from './MemberDialogs';
import { preferencesStyles } from './preferencesStyles';
import css from './Preferences.module.css';

/** Reset to default: a circular arrow, where Linear has its ResetIcon. */
const ResetIcon: React.FC = () => (
  <BuyerlyIcon name="reset" size={14} />
);

/** The server's link may be a path when no public address is configured. */
const absoluteUrl = (url: string) => new URL(url, window.location.origin).toString();

/**
 * Linear's Settings → Administration → Security, with what applies to Buyerly:
 * Workspace access → Invite links (on, off, copy, reset), and Workspace
 * management showing who may invite and who manages admins. Buyerly signs in
 * only with email and has no plans, so Linear's approved domains,
 * authentication methods, SAML, file upload limits, integrations, AI and
 * compliance blocks are left out.
 */
export const WorkspaceSecuritySection: React.FC<{ workspace: Workspace }> = ({ workspace }) => {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const workspaceId = workspace.id;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchInviteLink(workspaceId)
      .then((result) => { if (!cancelled) setInviteUrl(result.invite_url); })
      .catch((error) => {
        if (!cancelled) toast.error("Couldn't load the invite link", errorMessage(error, 'Please try again.'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId]);

  const run = async (request: () => Promise<InviteLink>, done?: () => void) => {
    setBusy(true);
    try {
      const result = await request();
      setInviteUrl(result.invite_url);
      if (done) done();
    } catch (error) {
      // Linear keeps the previous state and says what went wrong.
      toast.error(errorMessage(error, 'Something went wrong, please try again.'));
    }
    setBusy(false);
  };

  const toggle = (enabled: boolean) => run(() => changeInviteLink(workspaceId, enabled ? 'enable' : 'disable'));

  const reset = () => run(
    () => changeInviteLink(workspaceId, 'reset'),
    () => {
      setResetOpen(false);
      toast.show({ tone: 'success', title: 'Invite link replaced' });
    },
  );

  const copy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(absoluteUrl(inviteUrl));
      toast.show({ tone: 'success', title: 'Invite link copied to clipboard' });
    } catch {
      toast.error("Couldn't copy the link", 'Select it and copy it by hand.');
    }
  };

  const enabled = inviteUrl !== null;

  return (
    <>
      <div {...stylex.props(preferencesStyles.titleContainer)}>
        <h1 {...stylex.props(preferencesStyles.pageTitle)}>Security</h1>
      </div>

      <div {...stylex.props(preferencesStyles.section)}>
        <div {...stylex.props(preferencesStyles.sectionHeader, preferencesStyles.sectionHeaderGroup)}>
          <h3 {...stylex.props(preferencesStyles.sectionTitle)}>Workspace access</h3>
        </div>
        <div {...stylex.props(preferencesStyles.subsection)}>
          <h4 {...stylex.props(preferencesStyles.subsectionTitle)}>Invite links</h4>
          <p {...stylex.props(preferencesStyles.subsectionDesc)}>
            A uniquely generated invite link allows anyone with the link to join your workspace
          </p>
        </div>
        <section {...withClassName(stylex.props(preferencesStyles.cardContainer), css.cardDivided)}>
          <div {...withClassName(stylex.props(preferencesStyles.rowItem), css.rowItem)}>
            <div {...stylex.props(preferencesStyles.rowCopy)}>
              <span {...stylex.props(preferencesStyles.rowTitle)}>Enable invite links</span>
            </div>
            <BuyerlyToggle
              size="settings"
              label="Enable invite links"
              checked={enabled}
              busy={loading || busy}
              onChange={(next) => void toggle(next)}
            />
          </div>
          {enabled && (
            <div {...stylex.props(preferencesStyles.inviteLink)}>
              <div {...stylex.props(preferencesStyles.inviteLinkField)}>
                <span {...stylex.props(preferencesStyles.inviteLinkText)} title={absoluteUrl(inviteUrl)}>
                  {absoluteUrl(inviteUrl)}
                </span>
                <Tooltip content="Reset invite link" side="left">
                  <button
                    type="button"
                    aria-label="Reset invite link"
                    {...stylex.props(preferencesStyles.inviteLinkReset)}
                    disabled={busy}
                    onClick={() => setResetOpen(true)}
                  >
                    <ResetIcon />
                  </button>
                </Tooltip>
              </div>
              <Button title="Copy to clipboard" onClick={() => void copy()}>Copy</Button>
            </div>
          )}
        </section>
      </div>

      <div {...stylex.props(preferencesStyles.section)}>
        <div {...stylex.props(preferencesStyles.sectionHeader)}>
          <h3 {...stylex.props(preferencesStyles.sectionTitle)}>Workspace management</h3>
        </div>
        <section {...withClassName(stylex.props(preferencesStyles.cardContainer), css.cardDivided)}>
          <div {...withClassName(stylex.props(preferencesStyles.rowItem, preferencesStyles.rowItemColumnOnMobile), css.rowItem)}>
            <div {...stylex.props(preferencesStyles.rowCopy, preferencesStyles.rowCopyColumnOnMobile)}>
              <span {...stylex.props(preferencesStyles.rowTitle)}>Manage admins</span>
              <span {...stylex.props(preferencesStyles.rowDesc)}>Who can grant or revoke the workspace admin role</span>
            </div>
            <span {...stylex.props(preferencesStyles.rowValue)}>Only the owner</span>
          </div>
          <div {...withClassName(stylex.props(preferencesStyles.rowItem, preferencesStyles.rowItemColumnOnMobile), css.rowItem)}>
            <div {...stylex.props(preferencesStyles.rowCopy, preferencesStyles.rowCopyColumnOnMobile)}>
              <span {...stylex.props(preferencesStyles.rowTitle)}>New user invitations</span>
              <span {...stylex.props(preferencesStyles.rowDesc)}>Who can invite new members to the workspace</span>
            </div>
            <span {...stylex.props(preferencesStyles.rowValue)}>Only admins</span>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={resetOpen}
        title="Reset invite link?"
        description="This will expire the current link and generate a new one."
        confirmLabel="Reset invite link"
        tone="primary"
        busy={busy}
        onConfirm={() => void reset()}
        onCancel={() => setResetOpen(false)}
      />
    </>
  );
};
