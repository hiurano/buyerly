import React, { useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as stylex from '@stylexjs/stylex';
import { colors, radii } from '@/styles/tokens.stylex';
import { Button } from '@/ui/Button';
import { withClassName } from '@/ui/withClassName';

interface ConfirmDialogProps {
  open: boolean;
  /** A question naming what is affected, e.g. `Delete 3 rules?`. */
  title: string;
  /** The consequence, and the way back if there is one; some Linear dialogs ask only the question. */
  description?: string;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  /** Linear opens a session's confirmations near the top of the screen. */
  placement?: 'center' | 'top';
  onConfirm: () => void;
  onCancel: () => void;
}

const styles = stylex.create({
  overlay: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 500,
    backgroundColor: 'rgb(0 0 0 / 0.5)',
  },
  frame: {
    pointerEvents: 'none',
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 501,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 16,
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 16,
  },
  frameTop: {
    alignItems: 'flex-start',
    paddingTop: '27vh',
  },
  content: {
    pointerEvents: 'auto',
    width: '100%',
    maxWidth: 480,
    borderRadius: radii['--canvas-border-radius'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    backgroundColor: colors['--card-bg'],
    paddingTop: 24,
    paddingRight: 24,
    paddingBottom: 24,
    paddingLeft: 24,
    textAlign: 'left',
    outline: '2px solid transparent',
    outlineOffset: 2,
    boxShadow: colors['--dialog-elevation-shadow'],
  },
  title: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    color: colors['--text-primary'],
  },
  description: {
    marginTop: 8,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    fontSize: 13,
    lineHeight: '20px',
    color: colors['--text-secondary'],
  },
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
  actions: {
    marginTop: 20,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  },
});

/**
 * Linear's confirmation: a small modal with the question, its consequence, and
 * Cancel beside the confirming button. The confirming button takes focus, so
 * Enter confirms and Esc cancels without reaching for the pointer.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel,
  tone = 'danger',
  busy = false,
  placement = 'center',
  onConfirm,
  onCancel,
}) => {
  const confirmRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay {...stylex.props(styles.overlay)} />
        <div {...stylex.props(styles.frame, placement === 'top' && styles.frameTop)}>
          <Dialog.Content
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              confirmRef.current?.focus();
            }}
            {...withClassName(stylex.props(styles.content), 'ui-dialog animate-scale-in')}
          >
            <Dialog.Title {...stylex.props(styles.title)}>
              {title}
            </Dialog.Title>
            {description ? (
              <Dialog.Description {...stylex.props(styles.description)}>
                {description}
              </Dialog.Description>
            ) : (
              <Dialog.Description {...stylex.props(styles.srOnly)}>{title}</Dialog.Description>
            )}
            <div {...stylex.props(styles.actions)}>
              <Button touchHeight onClick={onCancel} disabled={busy}>Cancel</Button>
              <Button ref={confirmRef} touchHeight variant={tone} onClick={onConfirm} disabled={busy}>
                {confirmLabel}
              </Button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
