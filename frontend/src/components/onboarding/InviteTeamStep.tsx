import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { changeInviteLink, fetchInviteLink, type InviteLink } from '@/lib/workspaces';
import { finishedEmails, isEmail, parseEmails } from '@/lib/emails';
import type { Workspace } from '@/lib/types';
import { authStyles } from '@/components/auth/AuthFrame';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import { withClassName } from '@/ui/withClassName';
import { ASSIGNABLE_ROLES, roleLabel } from '@/components/preferences/MemberDialogs';
import { colors } from '@/styles/tokens.stylex';

const styles = stylex.create({
  form: {
    textAlign: 'left',
  },
  heading: {
    marginBottom: 8,
    fontSize: 18,
    textAlign: 'center',
  },
  copy: {
    marginTop: 0,
    marginBottom: 28,
    textAlign: 'center',
  },
  secondBlock: {
    marginTop: 22,
  },
  labelRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 7,
  },
  label: {
    display: 'block',
    marginTop: 0,
    marginRight: 0,
    marginBottom: 7,
    marginLeft: 2,
    color: 'var(--auth-text-muted)',
    fontSize: 12,
    fontWeight: 520,
  },
  labelInRow: {
    marginBottom: 0,
  },
  linkRow: {
    display: 'flex',
    gap: 8,
  },
  linkInput: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    height: 40,
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    paddingTop: 0,
    paddingRight: 12,
    paddingBottom: 0,
    paddingLeft: 12,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--auth-input-border)',
      ':hover': 'var(--auth-input-hover-border)',
    },
    borderRadius: 10,
    outlineStyle: {
      default: 'none',
      ':focus': 'solid',
    },
    outlineWidth: {
      default: 0,
      ':focus': 1,
    },
    outlineColor: {
      default: 'currentColor',
      ':focus': 'var(--auth-input-focus)',
    },
    outlineOffset: -1,
    boxShadow: 'none',
    backgroundColor: 'var(--auth-button-bg)',
    color: 'var(--auth-text-muted)',
    fontSize: 13,
    textOverflow: 'ellipsis',
    appearance: 'none',
    transitionProperty: 'border-color',
    transitionDuration: {
      default: '150ms',
      ':hover': '0s',
    },
  },
  emails: {
    display: 'block',
    width: '100%',
    minWidth: 0,
    minHeight: 84,
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    paddingTop: 10,
    paddingRight: 12,
    paddingBottom: 10,
    paddingLeft: 12,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--auth-input-border)',
      ':hover:not(:disabled)': 'var(--auth-input-hover-border)',
    },
    borderRadius: 10,
    outlineStyle: {
      default: 'none',
      ':focus': 'solid',
    },
    outlineWidth: {
      default: 0,
      ':focus': 1,
    },
    outlineColor: {
      default: 'currentColor',
      ':focus': 'var(--auth-input-focus)',
    },
    outlineOffset: -1,
    boxShadow: 'none',
    backgroundColor: 'var(--auth-input-bg)',
    color: 'var(--auth-input-text)',
    fontSize: 13,
    lineHeight: '20px',
    resize: 'vertical',
    appearance: 'none',
    transitionProperty: 'border-color',
    transitionDuration: {
      default: '150ms',
      ':hover:not(:disabled)': '0s',
    },
    '::placeholder': {
      color: 'var(--auth-input-placeholder)',
    },
  },
  emailsInvalid: {
    borderColor: {
      default: '#d84949',
      ':hover:not(:disabled)': 'var(--auth-input-hover-border)',
    },
    outlineColor: {
      default: 'currentColor',
      ':focus': '#d84949',
    },
  },
  copyButton: {
    display: 'inline-flex',
    flexShrink: 0,
    minWidth: 84,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 0,
    paddingRight: 14,
    paddingBottom: 0,
    paddingLeft: 14,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 10,
    outlineStyle: {
      default: null,
      ':focus-visible': 'solid',
    },
    outlineWidth: {
      default: null,
      ':focus-visible': 1,
    },
    outlineColor: {
      default: null,
      ':focus-visible': 'var(--auth-input-focus)',
    },
    outlineOffset: {
      default: null,
      ':focus-visible': 1,
    },
    backgroundColor: {
      default: 'var(--auth-button-bg)',
      ':hover': 'var(--auth-button-hover-bg)',
    },
    color: 'var(--auth-button-text)',
    fontSize: 13,
    fontWeight: 520,
    cursor: 'pointer',
    boxShadow: 'var(--auth-button-shadow)',
    transition: 'background 120ms ease',
  },
  roleButton: {
    display: 'inline-flex',
    flexShrink: 0,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 0,
    paddingRight: 8,
    paddingBottom: 0,
    paddingLeft: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 7,
    outlineStyle: {
      default: null,
      ':focus-visible': 'solid',
    },
    outlineWidth: {
      default: null,
      ':focus-visible': 1,
    },
    outlineColor: {
      default: null,
      ':focus-visible': 'var(--auth-input-focus)',
    },
    outlineOffset: {
      default: null,
      ':focus-visible': 1,
    },
    backgroundColor: {
      default: 'var(--auth-button-bg)',
      ':hover:not(:disabled)': 'var(--auth-button-hover-bg)',
      ':is([data-state="open"])': 'var(--auth-button-hover-bg)',
    },
    color: 'var(--auth-button-text)',
    fontSize: 12,
    fontWeight: 520,
    cursor: {
      default: 'pointer',
      ':disabled': 'not-allowed',
    },
    opacity: {
      default: 1,
      ':disabled': 0.5,
    },
    boxShadow: 'var(--auth-button-shadow)',
    transition: 'background 120ms ease',
  },
  rolePrefix: {
    color: 'var(--auth-text-muted)',
    fontWeight: 450,
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    marginTop: 28,
  },
  /** A disabled main button keeps its accent, faded, so it still reads as the main action. */
  sendButton: {
    opacity: {
      default: 1,
      ':disabled': 0.45,
    },
  },
  roleOption: {
    height: 'auto',
    paddingTop: 6,
    paddingBottom: 6,
  },
  roleOptionText: {
    minWidth: 0,
  },
  roleOptionLabel: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  roleOptionDetail: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 12,
    color: colors['--text-tertiary'],
  },
});

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
  const [role, setRole] = useState('member');
  const copiedTimer = useRef<number | undefined>(undefined);
  // One request per workspace, even when the effect runs twice, so the link is turned on once.
  const linkRequest = useRef<{ workspaceId: number; promise: Promise<InviteLink> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (linkRequest.current?.workspaceId !== workspace.id) {
      linkRequest.current = {
        workspaceId: workspace.id,
        promise: fetchInviteLink(workspace.id).then((result) => (
          // Linear's invite links are on in a new workspace; one an admin turned off stays off.
          result.invite_url || result.turned_off
            ? result
            : changeInviteLink(workspace.id, 'enable')
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
      {...withClassName(stylex.props(styles.form), 'buyerly-onboarding-invites')}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend(emails.map((email) => ({ email, role })));
      }}
      noValidate
    >
      <h1 {...stylex.props(authStyles.heading, styles.heading)}>Invite your team</h1>
      <p {...stylex.props(authStyles.copy, styles.copy)}>
        Buyerly works best with the people you buy media with. Invite them to {workspace.name}.
      </p>

      <div>
        <label {...stylex.props(styles.label)} htmlFor="onboarding-invite-link">Invite link</label>
        {link.kind === 'ready' && (
          <>
            <div {...stylex.props(styles.linkRow)}>
              <input
                {...stylex.props(styles.linkInput)}
                id="onboarding-invite-link"
                type="text"
                readOnly
                value={link.url}
                onFocus={(event) => event.currentTarget.select()}
              />
              <button {...stylex.props(styles.copyButton)} type="button" onClick={() => void copy()}>
                {copied && <BuyerlyIcon name="check" size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p {...stylex.props(authStyles.hint)}>
              Anyone with the link joins as a Member. You can turn it off in Settings → Security.
            </p>
          </>
        )}
        {link.kind === 'loading' && <p {...stylex.props(authStyles.hint)}>Loading the invite link…</p>}
        {link.kind === 'off' && (
          <p {...stylex.props(authStyles.hint)}>
            Invite links are turned off. An admin can turn them on in Settings → Security.
          </p>
        )}
        {link.kind === 'unavailable' && (
          <p {...stylex.props(authStyles.hint)}>The invite link isn’t available right now. Invite by email instead.</p>
        )}
      </div>

      <div {...stylex.props(styles.secondBlock)}>
        <div {...stylex.props(styles.labelRow)}>
          <label {...stylex.props(styles.label, styles.labelInRow)} htmlFor="onboarding-invite-emails">Email</label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                {...stylex.props(styles.roleButton)}
                type="button"
                aria-label={`Role: ${roleLabel(role)}`}
                disabled={busy}
              >
                <span {...stylex.props(styles.rolePrefix)}>Invite as</span>
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
                  <DropdownMenuRadioItem key={option.value} value={option.value} xstyle={styles.roleOption}>
                    <span {...stylex.props(styles.roleOptionText)}>
                      <span {...stylex.props(styles.roleOptionLabel)}>{option.label}</span>
                      <span {...stylex.props(styles.roleOptionDetail)}>{option.description}</span>
                    </span>
                    {role === option.value && <BuyerlyIcon name="check" size={14} />}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <textarea
          {...stylex.props(styles.emails, shownInvalid.length > 0 && styles.emailsInvalid)}
          id="onboarding-invite-emails"
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
          <p id="onboarding-invite-emails-error" {...stylex.props(authStyles.error)} role="alert">{invalidMessage}</p>
        )}
      </div>

      {error && <p {...stylex.props(authStyles.error)} role="alert">{error}</p>}
      <div {...stylex.props(styles.actions)}>
        <button
          {...stylex.props(authStyles.button, authStyles.buttonPrimary, authStyles.buttonFlush, styles.sendButton)}
          type="submit"
          disabled={!canSend}
          aria-busy={busy}
        >
          {busy ? 'Sending…' : count > 0 ? `Send ${count} ${count === 1 ? 'invite' : 'invites'}` : 'Send invites'}
        </button>
        <button {...stylex.props(authStyles.button, authStyles.buttonFlush)} type="button" onClick={onSkip} disabled={busy}>
          I’ll do this later
        </button>
      </div>
    </form>
  );
};
