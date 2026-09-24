import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, CircleCheck, Redo2, Undo2 } from 'lucide-react';
import { LinearCloseIcon } from '@/icons/LinearIcons';
import { TOAST_DURATION_MS, useToastStore, type ToastItem, type ToastTone } from '@/ui/toast';

const TONE_ICON: Record<ToastTone, React.ReactNode> = {
  success: <CircleCheck size={16} className="text-[var(--toast-success-icon)]" />,
  error: <CircleAlert size={16} className="text-[var(--toast-error-icon)]" />,
  undo: <Undo2 size={16} className="text-[var(--text-secondary)]" />,
  redo: <Redo2 size={16} className="text-[var(--text-secondary)]" />,
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
    if (item.tone === 'error' || held) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => dismiss(item.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - startedAt;
    };
  }, [dismiss, held, item.id, item.tone]);

  return (
    <div
      role={item.tone === 'error' ? 'alert' : undefined}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      className="toast-enter pointer-events-auto flex items-start gap-2 rounded-[var(--canvas-border-radius)] bg-[var(--toast-bg)] p-[var(--toast-padding)] text-[13px] leading-[19.5px] shadow-[var(--toast-shadow)]"
    >
      <span className="flex h-[19.5px] w-4 shrink-0 items-center justify-center" aria-hidden="true">
        {TONE_ICON[item.tone]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[var(--text-tertiary)]">
          <span className="font-medium text-[var(--text-primary)]">{item.title}</span>
          {item.message && <> {item.message}</>}
        </p>
        {item.description && (
          <p className="m-0 mt-0.5 text-[var(--text-secondary)]">{item.description}</p>
        )}
        {item.action && (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick();
              dismiss(item.id);
            }}
            className="mt-1.5 rounded-[4px] p-0 text-[13px] font-medium text-[var(--action-primary)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => dismiss(item.id)}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-[var(--text-tertiary)] outline-none transition-colors hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
      >
        <LinearCloseIcon size={12} />
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
      className="pointer-events-none fixed bottom-[var(--toast-offset-bottom)] right-[var(--toast-offset-right)] z-[var(--layer-toast)] flex w-[var(--toast-width)] max-w-[calc(100vw-32px)] flex-col gap-[var(--toast-gap)] outline-none"
    >
      {toasts.map((item) => <ToastCard key={item.id} item={item} />)}
    </section>,
    document.body,
  );
};
