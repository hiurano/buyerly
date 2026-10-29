import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { colors, layout, radii, space } from '@/styles/tokens.stylex';
import { Button } from '@/ui/Button';
import { withClassName } from '@/ui/withClassName';
import { TOAST_DURATION_MS, useToastStore, type ToastItem, type ToastTone } from '@/ui/toast';

const styles = stylex.create({
  region: {
    pointerEvents: 'none',
    position: 'fixed',
    bottom: space['--toast-offset-bottom'],
    right: space['--toast-offset-right'],
    zIndex: layout['--layer-toast'],
    display: 'flex',
    width: layout['--toast-width'],
    maxWidth: 'calc(100vw - 32px)',
    flexDirection: 'column',
    gap: space['--toast-gap'],
    outline: '2px solid transparent',
    outlineOffset: 2,
  },
  card: {
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: radii['--canvas-border-radius'],
    backgroundColor: colors['--toast-bg'],
    padding: space['--toast-padding'],
    fontSize: 13,
    lineHeight: '19.5px',
    boxShadow: colors['--toast-shadow'],
  },
  iconSlot: {
    display: 'flex',
    height: 19.5,
    width: 16,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  success: { color: colors['--toast-success-icon'] },
  error: { color: colors['--toast-error-icon'] },
  neutral: { color: colors['--text-secondary'] },
  warning: { color: colors['--toast-warning-icon'] },
  text: {
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
  },
  message: {
    margin: 0,
    color: colors['--text-tertiary'],
  },
  title: {
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  description: {
    marginTop: 2,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    color: colors['--text-secondary'],
  },
  actionButton: {
    marginTop: 6,
  },
  actionLink: {
    marginTop: 6,
    borderRadius: 4,
    padding: 0,
    fontSize: 13,
    fontWeight: 500,
    color: colors['--action-primary'],
    outline: '2px solid transparent',
    outlineOffset: 2,
    textDecorationLine: {
      default: null,
      ':hover': 'underline',
    },
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
  },
  dismiss: {
    display: 'flex',
    height: 20,
    width: 20,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
    },
    outline: '2px solid transparent',
    outlineOffset: 2,
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
    transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    transitionDuration: '150ms',
  },
});

const TONE_ICON: Record<ToastTone, React.ReactNode> = {
  success: <BuyerlyIcon name="success" size={16} {...stylex.props(styles.success)} />,
  error: <BuyerlyIcon name="error" size={16} {...stylex.props(styles.error)} />,
  undo: <BuyerlyIcon name="undo" size={16} {...stylex.props(styles.neutral)} />,
  redo: <BuyerlyIcon name="redo" size={16} {...stylex.props(styles.neutral)} />,
  info: <BuyerlyIcon name="info" size={16} {...stylex.props(styles.neutral)} />,
  warning: <BuyerlyIcon name="warning" size={16} {...stylex.props(styles.warning)} />,
};

/**
 * One toast. It leaves after `TOAST_DURATION_MS`, but never while the pointer
 * or keyboard focus is on it; an error stays until it is dismissed, because it
 * reports something that did not happen.
 */
const ToastCard: React.FC<{ item: ToastItem }> = ({ item }) => {
  const dismiss = useToastStore((state) => state.dismiss);
  const [held, setHeld] = useState(false);
  const remaining = useRef(TOAST_DURATION_MS);

  useEffect(() => {
    if (item.tone === 'error' || item.persistent || held) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => dismiss(item.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - startedAt;
    };
  }, [dismiss, held, item.id, item.persistent, item.tone]);

  return (
    <div
      role={item.tone === 'error' || item.tone === 'warning' ? 'alert' : undefined}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      {...withClassName(stylex.props(styles.card), 'toast-enter')}
    >
      <span {...stylex.props(styles.iconSlot)} aria-hidden="true">
        {TONE_ICON[item.tone]}
      </span>
      <div {...stylex.props(styles.text)}>
        <p {...stylex.props(styles.message)}>
          <span {...stylex.props(styles.title)}>{item.title}</span>
          {item.message && <> {item.message}</>}
        </p>
        {item.description && (
          <p {...stylex.props(styles.description)}>{item.description}</p>
        )}
        {item.action?.button && (
          <Button
            size="compact"
            onClick={() => {
              item.action?.onClick();
              dismiss(item.id);
            }}
            xstyle={styles.actionButton}
          >
            {item.action.label}
          </Button>
        )}
        {item.action && !item.action.button && (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick();
              dismiss(item.id);
            }}
            {...stylex.props(styles.actionLink)}
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => dismiss(item.id)}
        {...stylex.props(styles.dismiss)}
      >
        <BuyerlyIcon name="close" size={12} />
      </button>
    </div>
  );
};

/**
 * Linear's notification region: bottom right, newest at the bottom, announced
 * politely to screen readers. Alt+T moves focus into it.
 */
export const ToastRegion: React.FC = () => {
  const toasts = useToastStore((state) => state.toasts);
  const regionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyT') {
        const first = regionRef.current?.querySelector<HTMLElement>('button');
        if (!first) return;
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return createPortal(
    <section
      ref={regionRef}
      aria-label="Notifications alt+T"
      aria-live="polite"
      aria-relevant="additions text"
      tabIndex={-1}
      {...stylex.props(styles.region)}
    >
      {toasts.map((item) => <ToastCard key={item.id} item={item} />)}
    </section>,
    document.body,
  );
};
