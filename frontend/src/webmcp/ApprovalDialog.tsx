import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as stylex from '@stylexjs/stylex';
import { colors, radii } from '@/styles/tokens.stylex';
import { Button } from '@/ui/Button';
import { withClassName } from '@/ui/withClassName';
import { useApprovalQueue } from './approval';

/**
 * A request can appear while the person is clicking or typing elsewhere. The
 * approving button waits this long, so input already on its way cannot
 * approve a change the person has not read.
 */
const APPROVE_DELAY_MS = 600;

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
  eyebrow: {
    margin: 0,
    fontSize: 12,
    fontWeight: 500,
    color: colors['--text-tertiary'],
  },
  title: {
    marginTop: 4,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    fontSize: 15,
    fontWeight: 600,
    color: colors['--text-primary'],
    overflowWrap: 'anywhere',
  },
  details: {
    marginTop: 8,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    listStyle: 'none',
    padding: 0,
    fontSize: 13,
    lineHeight: '20px',
    color: colors['--text-secondary'],
    overflowWrap: 'anywhere',
  },
  warning: {
    marginTop: 12,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    fontSize: 13,
    lineHeight: '20px',
    color: colors['--rules-action-stop-text'],
  },
  actions: {
    marginTop: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  waiting: {
    marginRight: 'auto',
    fontSize: 12,
    color: colors['--text-tertiary'],
  },
});

/**
 * Buyerly's own confirmation for a change an AI agent asked for, built like
 * ConfirmDialog. Decline takes focus, so Enter and Esc both decline; only a
 * real click or key press on the approving button approves.
 */
export const ApprovalDialog: React.FC = () => {
  const request = useApprovalQueue((state) => state.queue[0]);
  const waiting = useApprovalQueue((state) => Math.max(0, state.queue.length - 1));
  const [armedId, setArmedId] = useState<number | null>(null);
  const declineRef = useRef<HTMLButtonElement>(null);
  const requestId = request?.id;

  useEffect(() => {
    if (requestId === undefined) return;
    const timer = window.setTimeout(() => setArmedId(requestId), APPROVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [requestId]);

  if (!request) return null;
  return (
    <Dialog.Root key={request.id} open onOpenChange={(open) => { if (!open) request.settle('declined'); }}>
      <Dialog.Portal>
        <Dialog.Overlay {...withClassName(stylex.props(styles.overlay), 'animate-fade-in')} />
        <div {...stylex.props(styles.frame)}>
          <Dialog.Content
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              declineRef.current?.focus();
            }}
            {...withClassName(stylex.props(styles.content), 'ui-dialog animate-scale-in')}
          >
            <p {...stylex.props(styles.eyebrow)}>Your AI assistant asks</p>
            <Dialog.Title {...stylex.props(styles.title)}>
              {request.title}
            </Dialog.Title>
            <Dialog.Description asChild>
              <ul {...stylex.props(styles.details)}>
                {request.details.map((line, index) => <li key={index}>{line}</li>)}
              </ul>
            </Dialog.Description>
            {request.warning && (
              <p {...stylex.props(styles.warning)}>
                {request.warning}
              </p>
            )}
            <div {...stylex.props(styles.actions)}>
              {waiting > 0 && (
                <span {...stylex.props(styles.waiting)}>{waiting} more waiting</span>
              )}
              <Button ref={declineRef} onClick={() => request.settle('declined')}>Decline</Button>
              <Button
                variant={request.tone}
                disabled={armedId !== request.id}
                onClick={(event) => {
                  // A script calling click() is not the person.
                  if (event.nativeEvent.isTrusted) request.settle('approved');
                }}
              >
                {request.approveLabel}
              </Button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
