import React, { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { apiRequest } from '@/lib/api';
import { deleteWorkspace, updateWorkspace } from '@/lib/workspaces';
import type { Workspace } from '@/lib/types';
import { useWorkspaceSession } from '@/lib/workspaceSession';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { Button } from '@/ui/Button';
import { FormCheckbox } from '@/ui/FormCheckbox';
import { Input } from '@/ui/Input';
import { Tooltip } from '@/ui/Tooltip';
import { WorkspaceAvatar } from '@/ui/WorkspaceAvatar';
import { toast } from '@/ui/toast';
import { ChoiceDialog, errorMessage } from './MemberDialogs';

const styles = stylex.create({
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  form: {
    marginTop: 16,
  },
  label: {
    marginBottom: 8,
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  labelSpaced: {
    marginTop: 16,
  },
  error: {
    margin: 0,
    marginTop: 8,
    fontSize: 12,
    color: colors['--toast-error-icon'],
  },
  errorSpaced: {
    marginTop: 12,
  },
  fullWidth: {
    width: '100%',
  },
  spaced: {
    marginTop: 16,
  },
  warning: {
    marginTop: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    fontSize: 13,
    lineHeight: '20px',
    color: colors['--text-secondary'],
  },
  paragraph: {
    margin: 0,
  },
  name: {
    fontWeight: 600,
    color: colors['--text-primary'],
  },
});

interface WorkspaceSectionProps {
  workspace: Workspace;
  onUserChanged: () => void | Promise<unknown>;
}

/** What the URL field shows before the slug, as Linear's "linear.app/". */
const urlPrefix = () => `${window.location.host}/`;

/**
 * Linear's Settings → Administration → Workspace, without what Buyerly has no
 * use for (Time & region, Member onboarding): Logo, Name and URL in one card,
 * then Danger zone. The name saves when the field loses focus; the URL is
 * read-only and changes through Linear's "Change workspace URL" dialog.
 */
export const WorkspaceSection: React.FC<WorkspaceSectionProps> = ({ workspace, onUserChanged }) => {
  const { user, workspaceMoved } = useWorkspaceSession();
  const [name, setName] = useState(workspace.name);
  const [uploading, setUploading] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setName(workspace.name), [workspace.name]);

  const saveName = async () => {
    const next = name.trim();
    if (!next) {
      setName(workspace.name);
      toast.show({ tone: 'info', title: 'Workspace name can’t be empty' });
      return;
    }
    if (next === workspace.name) return;
    try {
      await updateWorkspace(workspace.id, { name: next });
      await onUserChanged();
      toast.show({ tone: 'success', title: 'Workspace name updated' });
    } catch (error) {
      setName(workspace.name);
      toast.show({ tone: 'error', title: 'Couldn’t rename the workspace', description: errorMessage(error, 'Please try again.') });
    }
  };

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const { logo_url: logoUrl } = await apiRequest<{ logo_url: string }>('/api/onboarding/workspace/logo', {
        method: 'POST',
        body: form,
      });
      await updateWorkspace(workspace.id, { logo_url: logoUrl });
      await onUserChanged();
    } catch (error) {
      // Linear: an error toast titled "File upload" with the reason.
      toast.show({ tone: 'error', title: 'File upload', description: errorMessage(error, 'Please try again.') });
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const isOwner = workspace.role === 'owner';
  const onlyWorkspace = user.workspaces.length < 2;
  const cannotDelete = !isOwner || onlyWorkspace;

  return (
    <>
      <div className="preferences-title-container">
        <h1 className="preferences-page-title">Workspace</h1>
      </div>

      <div className="preferences-section">
        <section className="preferences-card-container preferences-card-container--divided">
          <div className="preferences-row-item">
            <div className="preferences-row-copy">
              <span className="preferences-row-title">Logo</span>
              <span className="preferences-row-desc">Recommended size is 256x256px</span>
            </div>
            <Tooltip content="Upload logo" side="left">
              <button
                type="button"
                className="preferences-workspace-logo"
                aria-label="Logo"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                <WorkspaceAvatar workspace={workspace} size="regular" px={32} />
                <span className="preferences-workspace-logo-overlay" aria-hidden="true">
                  {/* A brush over the logo on hover, as Linear's. */}
                  <BuyerlyIcon name="brush" size={16} />
                </span>
              </button>
            </Tooltip>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              {...stylex.props(styles.srOnly)}
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadLogo(file);
              }}
            />
          </div>

          <div className="preferences-row-item preferences-row-item--column-on-mobile">
            <div className="preferences-row-copy">
              <label htmlFor="workspace-name" className="preferences-row-title">Name</label>
            </div>
            <Input
              id="workspace-name"
              className="preferences-row-input preferences-row-input--wide"
              value={name}
              placeholder={workspace.name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => void saveName()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') setName(workspace.name);
              }}
            />
          </div>

          <div className="preferences-row-item preferences-row-item--column-on-mobile">
            <div className="preferences-row-copy">
              <label htmlFor="workspace-url" className="preferences-row-title">URL</label>
            </div>
            <div className="preferences-url-field preferences-row-input--wide">
              <span className="preferences-url-prefix" aria-hidden="true">{urlPrefix()}</span>
              <input
                id="workspace-url"
                readOnly
                value={workspace.slug}
                className="preferences-url-input"

                onClick={() => setUrlOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setUrlOpen(true);
                  }
                }}
              />
              <span className="preferences-url-accessory" aria-hidden="true">
                <BuyerlyIcon name="edit" size={14} />
              </span>
            </div>
          </div>
        </section>
      </div>

      <div className="preferences-section">
        <div className="preferences-section-header">
          <h3 className="preferences-section-title">Danger zone</h3>
        </div>
        <section className="preferences-card-container">
          <div className={`preferences-row-item preferences-row-item--single${cannotDelete ? ' preferences-row-item--disabled' : ''}`}>
            <div className="preferences-row-copy">
              <span className="preferences-row-title">Delete workspace</span>
              <span className="preferences-row-desc">
                {!isOwner
                  ? 'Only the workspace owner can delete it'
                  : onlyWorkspace
                    ? 'This is your only workspace: create another one before deleting it'
                    : 'Permanently delete this workspace and all its data'}
              </span>
            </div>
            <button
              type="button"
              className="preferences-row-ghost-button preferences-row-ghost-button--danger"
              disabled={cannotDelete}
              onClick={() => setDeleteOpen(true)}
            >
              Delete workspace
            </button>
          </div>
        </section>
      </div>

      <ChangeWorkspaceUrlDialog
        open={urlOpen}
        workspace={workspace}
        onClose={() => setUrlOpen(false)}
        onMoved={workspaceMoved}
      />
      <DeleteWorkspaceDialog
        open={deleteOpen}
        workspace={workspace}
        onClose={() => setDeleteOpen(false)}
        onDeleted={onUserChanged}
      />
    </>
  );
};

/**
 * Linear's "Change workspace URL": what changing it does, "Enter the new
 * workspace URL" over the field with the address prefix, Cancel and a red
 * Update; "Workspace URL updated" once it is saved. Linear redirects old
 * links; Buyerly does not, so the warning says they stop working.
 */
const ChangeWorkspaceUrlDialog: React.FC<{
  open: boolean;
  workspace: Workspace;
  onClose: () => void;
  onMoved: (slug: string) => Promise<void>;
}> = ({ open, workspace, onClose, onMoved }) => {
  const [value, setValue] = useState(workspace.slug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setValue(workspace.slug);
    setError('');
  }, [open, workspace.slug]);

  const submit = async () => {
    const next = value.trim();
    if (!next || next === workspace.slug) {
      onClose();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const updated = await updateWorkspace(workspace.id, { slug: next });
      onClose();
      await onMoved(updated.slug);
      toast.show({ tone: 'success', title: 'Workspace URL updated' });
    } catch (submitError) {
      setError(errorMessage(submitError, 'Please try again.'));
    }
    setBusy(false);
  };

  return (
    <ChoiceDialog
      open={open}
      title="Change workspace URL"
      description="This will change all your URLs. Links to the old address will stop working."
      busy={busy}
      onClose={onClose}
      footer={(
        <>
          <Button touchHeight onClick={onClose} disabled={busy}>Cancel</Button>
          <Button touchHeight variant="danger" onClick={() => void submit()} disabled={busy}>
            Update
          </Button>
        </>
      )}
    >
      <form
        {...stylex.props(styles.form)}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="workspace-url-new" {...stylex.props(styles.label)}>
          Enter the new workspace URL
        </label>
        <div className="preferences-url-field">
          <span className="preferences-url-prefix" aria-hidden="true">{urlPrefix()}</span>
          <input
            id="workspace-url-new"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            maxLength={60}
            value={value}
            placeholder={workspace.slug}
            disabled={busy}
            onChange={(event) => setValue(event.target.value)}
            className="preferences-url-input preferences-url-input--editable"

          />
        </div>
        {error && <p role="alert" {...stylex.props(styles.error)}>{error}</p>}
      </form>
    </ChoiceDialog>
  );
};

/**
 * Linear's "Verify workspace deletion request": the workspace's name in bold,
 * that the deletion is irreversible and what it removes, a confirmation field,
 * an "I acknowledge…" box and a full-width red "Delete my workspace". Linear
 * mails a code and deletes after 48 hours; Buyerly deletes at once, so the
 * field asks for the workspace's name instead.
 */
const DeleteWorkspaceDialog: React.FC<{
  open: boolean;
  workspace: Workspace;
  onClose: () => void;
  onDeleted: () => void | Promise<unknown>;
}> = ({ open, workspace, onClose, onDeleted }) => {
  const [typed, setTyped] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTyped('');
    setAcknowledged(false);
    setError('');
  }, [open]);

  const matches = typed.trim() === workspace.name;

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteWorkspace(workspace.id);
      onClose();
      toast.show({ tone: 'info', title: 'Workspace deleted', description: `${workspace.name} and all its data were deleted.` });
      await onDeleted();
    } catch (deleteError) {
      setError(errorMessage(deleteError, 'Please try again.'));
    }
    setBusy(false);
  };

  return (
    <ChoiceDialog
      open={open}
      wide
      title="Verify workspace deletion request"
      busy={busy}
      onClose={onClose}
      footer={(
        <Button
          touchHeight
          xstyle={styles.fullWidth}
          variant="danger"
          disabled={busy || !matches || !acknowledged}
          onClick={() => void remove()}
        >
          Delete my workspace
        </Button>
      )}
    >
      <div {...stylex.props(styles.warning)}>
        <p {...stylex.props(styles.paragraph)}>
          If you are sure you want to proceed with the deletion of the workspace{' '}
          <strong {...stylex.props(styles.name)}>{workspace.name}</strong>, please continue below.
        </p>
        <p {...stylex.props(styles.paragraph)}>
          Keep in mind this operation is irreversible and will result in a complete deletion of all the data associated with the workspace.
        </p>
        <p {...stylex.props(styles.paragraph)}>
          Data including but not limited to members, ad accounts, rules and alerts will be permanently deleted.
        </p>
      </div>
      <label htmlFor="workspace-delete-name" {...stylex.props(styles.label, styles.labelSpaced)}>
        Enter the workspace name to confirm
      </label>
      <Input
        id="workspace-delete-name"
        autoFocus
        autoComplete="off"
        {...stylex.props(styles.fullWidth)}
        placeholder={workspace.name}
        value={typed}
        disabled={busy}
        onChange={(event) => setTyped(event.target.value)}
      />
      <FormCheckbox
        xstyle={styles.spaced}
        checked={acknowledged}
        disabled={busy}
        onChange={setAcknowledged}
        label="I acknowledge that all of the workspace data will be deleted and want to proceed."
      />
      {error && <p role="alert" {...stylex.props(styles.error, styles.errorSpaced)}>{error}</p>}
    </ChoiceDialog>
  );
};
