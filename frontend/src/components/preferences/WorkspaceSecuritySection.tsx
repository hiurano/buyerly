import React, { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import type { Workspace } from '@/lib/types';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { LinearToggle } from '@/ui/LinearToggle';
import { Tooltip } from '@/ui/Tooltip';
import { toast } from '@/ui/toast';
import { errorMessage } from './MemberDialogs';

interface InviteLinkResponse {
  invite_url: string | null;
}

/** Linear's ResetIcon: a circular arrow around a dot. */
const ResetIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M14.1538 8.02559C14.1538 10.8044 12.1559 13.111 9.5346 13.5542C9.03176 13.6392 8.61539 14.0493 8.61539 14.5653C8.61539 15.0812 9.03073 15.5056 9.53663 15.4419C13.1803 14.983 16 11.8376 16 8.02559C16 3.89787 12.6938 0.551697 8.61539 0.551697C4.53697 0.551697 1.23077 3.89787 1.23077 8.02559H0.615385C0.391677 8.02559 0.18559 8.14846 0.0771433 8.34649C-0.0313032 8.54452 -0.0250251 8.78652 0.0935398 8.97851L1.632 11.4698C1.74446 11.6519 1.94167 11.7625 2.15385 11.7625C2.36602 11.7625 2.56324 11.6519 2.67569 11.4698L4.21415 8.97851C4.33272 8.78652 4.339 8.54452 4.23055 8.34649C4.1221 8.14846 3.91602 8.02559 3.69231 8.02559H3.07692C3.07692 4.9298 5.55658 2.42017 8.61539 2.42017C11.6742 2.42017 14.1538 4.9298 14.1538 8.02559Z" />
    <path d="M8.61539 10.5169C9.97486 10.5169 11.0769 9.4015 11.0769 8.02559C11.0769 6.64969 9.97486 5.53429 8.61539 5.53429C7.25591 5.53429 6.15385 6.64969 6.15385 8.02559C6.15385 9.4015 7.25591 10.5169 8.61539 10.5169Z" />
  </svg>
);

/** The server's link may be a path when no public address is configured. */
const absoluteUrl = (url: string) => new URL(url, window.location.origin).toString();

/**
 * Linear's Settings → Administration → Security, with what applies to Buyerly:
 * Workspace access → Invite links (on, off, copy, reset), and Workspace
 * management showing who may invite and who manages admins. Buyerly signs in
 * only with email and password and has no plans, so Linear's approved domains,
 * authentication methods, SAML, file upload limits, integrations, AI and
 * compliance blocks are left out.
 */
export const WorkspaceSecuritySection: React.FC<{ workspace: Workspace }> = ({ workspace }) => {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const endpoint = `/api/workspaces/${workspace.id}/invite-link`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiRequest<InviteLinkResponse>(endpoint)
      .then((result) => { if (!cancelled) setInviteUrl(result.invite_url); })
      .catch((error) => {
        if (!cancelled) toast.error("Couldn't load the invite link", errorMessage(error, 'Please try again.'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [endpoint]);

  const run = async (request: () => Promise<InviteLinkResponse>, done?: () => void) => {
    setBusy(true);
    try {
      const result = await request();
      setInviteUrl(result.invite_url);
      done?.();
    } catch (error) {
      // Linear keeps the previous state and says what went wrong.
      toast.error(errorMessage(error, 'Something went wrong, please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (enabled: boolean) => run(() => apiRequest<InviteLinkResponse>(endpoint, {
    method: enabled ? 'POST' : 'DELETE',
    ...(enabled ? { body: JSON.stringify({}) } : {}),
  }));

  const reset = () => run(
    () => apiRequest<InviteLinkResponse>(`${endpoint}/reset`, { method: 'POST', body: JSON.stringify({}) }),
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
            <LinearToggle
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
