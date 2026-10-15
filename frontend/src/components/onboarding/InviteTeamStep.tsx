import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { finishedEmails, isEmail, parseEmails } from '@/lib/emails';
import type { Workspace } from '@/lib/types';
import { LinearCheckIcon } from '@/icons/LinearIcons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import { ASSIGNABLE_ROLES, roleLabel } from '@/components/preferences/MemberDialogs';

interface InviteLinkResponse {
  invite_url: string | null;
  /** An admin turned links off in Settings → Security, as opposed to never having one. */
  turned_off?: boolean;
}

type LinkState =
  | { kind: 'loading' }
  | { kind: 'ready'; url: string }
  | { kind: 'off' }
  | { kind: 'unavailable' };

interface InviteTeamStepProps {
  workspace: Workspace;
  busy: boolean;
  error: string;
  onSend: (invites: Array<{ email: string; role: string }>) => void;
  onSkip: () => void;
}

/**
 * Onboarding's last step, after Linear's "Invite co-workers": the workspace
 * invite link to copy, an email field that flags a bad address before sending,
 * the role the invitees get, "Send N invites" and "I'll do this later".
 */
export const InviteTeamStep: React.FC<InviteTeamStepProps> = ({ workspace, busy, error, onSend, onSkip }) => {
  const [link, setLink] = useState<LinkState>({ kind: 'loading' });
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState('');
  const [blurred, setBlurred] = useState(false);
  const [role, setRole] = useState('buyer');
  const copiedTimer = useRef<number>();
  // One request per workspace, even when the effect runs twice, so the link is turned on once.
  const linkRequest = useRef<{ workspaceId: number; promise: Promise<InviteLinkResponse> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const endpoint = `/api/workspaces/${workspace.id}/invite-link`;
    if (linkRequest.current?.workspaceId !== workspace.id) {
      linkRequest.current = {
        workspaceId: workspace.id,
        promise: apiRequest<InviteLinkResponse>(endpoint).then((result) => (
          // Linear's invite links are on in a new workspace; one an admin turned off stays off.
          result.invite_url || result.turned_off
            ? result
            : apiRequest<InviteLinkResponse>(endpoint, { method: 'POST', body: JSON.stringify({}) })
        )),
      };
    }
    linkRequest.current.promise
      .then((result) => {
        if (cancelled) return;
        setLink(result.invite_url
          ? { kind: 'ready', url: new URL(result.invite_url, window.location.origin).toString() }
          : { kind: 'off' });
      })
      .catch(() => {
        if (!cancelled) setLink({ kind: 'unavailable' });
      });
    return () => {
      cancelled = true;
    };
  }, [workspace.id]);

  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  const emails = useMemo(() => parseEmails(text), [text]);
  const invalid = useMemo(() => emails.filter((email) => !isEmail(email)), [emails]);
  // The address still being typed is judged once the field loses focus or a separator follows it.
  const shownInvalid = useMemo(
    () => (blurred ? invalid : finishedEmails(text).filter((email) => !isEmail(email))),
    [blurred, invalid, text],
  );
  const count = emails.length - invalid.length;
  const canSend = !busy && emails.length > 0 && invalid.length === 0;

  const copy = async () => {
    if (link.kind !== 'ready') return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // The field stays selectable, so the link can still be copied by hand.
    }
  };

  const invalidMessage = shownInvalid.length === 1
    ? `${shownInvalid[0]} isn’t a valid email address`
    : `These aren’t valid email addresses: ${shownInvalid.join(', ')}`;

  return (
    <form
      className="buyerly-onboarding-invites"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend(emails.map((email) => ({ email, role })));
      }}
      noValidate
    >
      <h1>Invite your team</h1>
      <p className="buyerly-auth-copy">
        Buyerly works best with the people you buy media with. Invite them to {workspace.name}.
      </p>

      <div className="buyerly-onboarding-invites__block">
        <label className="buyerly-onboarding-invites__label" htmlFor="onboarding-invite-link">Invite link</label>
        {link.kind === 'ready' && (
          <>
            <div className="buyerly-onboarding-invites__link">
              <input
                id="onboarding-invite-link"
                type="text"
                readOnly
                value={link.url}
                onFocus={(event) => event.currentTarget.select()}
              />
              <button type="button" className="buyerly-onboarding-invites__copy" onClick={() => void copy()}>
                {copied && <LinearCheckIcon size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="buyerly-auth-hint">
              Anyone with the link joins as a Buyer. You can turn it off in Settings → Security.
            </p>
          </>
        )}
        {link.kind === 'loading' && <p className="buyerly-auth-hint">Loading the invite link…</p>}
        {link.kind === 'off' && (
          <p className="buyerly-auth-hint">
            Invite links are turned off. An admin can turn them on in Settings → Security.
          </p>
        )}
        {link.kind === 'unavailable' && (
          <p className="buyerly-auth-hint">The invite link isn’t available right now. Invite by email instead.</p>
        )}
      </div>

      <div className="buyerly-onboarding-invites__block">
        <div className="buyerly-onboarding-invites__label-row">
          <label className="buyerly-onboarding-invites__label" htmlFor="onboarding-invite-emails">Email</label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="buyerly-onboarding-invites__role"
                aria-label={`Role: ${roleLabel(role)}`}
                disabled={busy}
              >
                <span className="buyerly-onboarding-invites__role-prefix">Invite as</span>
                {roleLabel(role)}
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M2.5 4l2.5 2.5L7.5 4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            {/* Above the onboarding page, which covers the app at z-index 1000. */}
            <DropdownMenuContent align="end" style={{ zIndex: 1100, width: 280 }}>
              <DropdownMenuRadioGroup value={role} onValueChange={setRole}>
                {ASSIGNABLE_ROLES.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value} className="!h-auto py-1.5">
                    <span className="min-w-0">
                      <span className="block truncate">{option.label}</span>
                      <span className="block truncate text-[12px] text-[var(--text-tertiary)]">{option.description}</span>
                    </span>
                    {role === option.value && <LinearCheckIcon size={14} />}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <textarea
          id="onboarding-invite-emails"
          className="buyerly-onboarding-invites__emails"
          rows={3}
          autoFocus
          value={text}
          disabled={busy}
          placeholder="email@example.com, email2@example.com…"
          aria-invalid={shownInvalid.length > 0}
          aria-describedby={shownInvalid.length > 0 ? 'onboarding-invite-emails-error' : undefined}
          onChange={(event) => {
            setText(event.target.value);
            setBlurred(false);
          }}
          onBlur={() => setBlurred(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {shownInvalid.length > 0 && (
          <p id="onboarding-invite-emails-error" className="buyerly-auth-error" role="alert">{invalidMessage}</p>
        )}
      </div>

      {error && <p className="buyerly-auth-error" role="alert">{error}</p>}
      <div className="buyerly-onboarding-invites__actions">
        <button
          className="buyerly-auth-button buyerly-auth-button--primary"
          type="submit"
          disabled={!canSend}
          aria-busy={busy}
        >
          {busy ? 'Sending…' : count > 0 ? `Send ${count} ${count === 1 ? 'invite' : 'invites'}` : 'Send invites'}
        </button>
        <button className="buyerly-auth-button" type="button" onClick={onSkip} disabled={busy}>
          I’ll do this later
        </button>
      </div>
    </form>
  );
};
