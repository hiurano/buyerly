import React, { useEffect, useState } from 'react';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { changeInviteLink, fetchInviteLink, type InviteLink } from '@/lib/workspaces';
import type { Workspace } from '@/lib/types';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { BuyerlyToggle } from '@/ui/BuyerlyToggle';
import { Tooltip } from '@/ui/Tooltip';
import { toast } from '@/ui/toast';
import { errorMessage } from './MemberDialogs';

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
      <div className="preferences-title-container">
        <h1 className="preferences-page-title">Security</h1>
      </div>

      <div className="preferences-section">
        <div className="preferences-section-header preferences-section-header--group">
          <h3 className="preferences-section-title">Workspace access</h3>
        </div>
        <div className="preferences-subsection">
          <h4 className="preferences-subsection-title">Invite links</h4>
          <p className="preferences-subsection-desc">
            A uniquely generated invite link allows anyone with the link to join your workspace
          </p>
        </div>
        <section className="preferences-card-container preferences-card-container--divided">
          <div className="preferences-row-item preferences-row-item--toggle">
            <div className="preferences-row-copy">
              <span className="preferences-row-title">Enable invite links</span>
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
            <div className="preferences-invite-link">
              <div className="preferences-invite-link-field">
                <span className="preferences-invite-link-text" title={absoluteUrl(inviteUrl)}>
                  {absoluteUrl(inviteUrl)}
                </span>
                <Tooltip content="Reset invite link" side="left">
                  <button
                    type="button"
                    aria-label="Reset invite link"
                    className="preferences-invite-link-reset"
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

      <div className="preferences-section">
        <div className="preferences-section-header">
          <h3 className="preferences-section-title">Workspace management</h3>
        </div>
        <section className="preferences-card-container preferences-card-container--divided">
          <div className="preferences-row-item preferences-row-item--column-on-mobile">
            <div className="preferences-row-copy">
              <span className="preferences-row-title">Manage admins</span>
              <span className="preferences-row-desc">Who can grant or revoke the workspace admin role</span>
            </div>
            <span className="preferences-row-value">Only the owner</span>
          </div>
          <div className="preferences-row-item preferences-row-item--column-on-mobile">
            <div className="preferences-row-copy">
              <span className="preferences-row-title">New user invitations</span>
              <span className="preferences-row-desc">Who can invite new members to the workspace</span>
            </div>
            <span className="preferences-row-value">Only admins</span>
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
