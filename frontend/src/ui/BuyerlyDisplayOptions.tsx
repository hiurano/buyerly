import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { BuyerlyChevronGlyph } from '@/icons/BuyerlyIcons';
import { colors, type as typeTokens } from '@/styles/tokens.stylex';
import { withClassName } from '@/ui/withClassName';
import { BuyerlyToggle } from './BuyerlyToggle';
import { Tooltip } from './Tooltip';
import { LAYOUT_SHORTCUT } from './useLayoutShortcut';
import displayCss from './BuyerlyDisplayOptions.module.css';

export { displayCss };

const DISPLAY_INTER_STACK =
  '"Inter Variable", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", "Linear Thai", sans-serif';

export const displayStyles = stylex.create({
  /* Linear My Issues Display options contract, shared by Ads Manager, Rules, Accounts, Inbox and Search. */
  popover: {
    position: 'fixed',
    width: 302,
    maxWidth: 'calc(100vw - 16px)',
    zIndex: 9999,
    overflow: 'visible',
    isolation: 'isolate',
    color: colors['--text-primary'],
    backgroundColor: colors['--card-bg'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--display-popover-border, var(--color-border-secondary))',
    borderRadius: 12,
    boxShadow: colors['--dropdown-shadow'],
    fontFamily: typeTokens['--font-regular'],
    fontSize: 12,
    lineHeight: '18px',
    userSelect: 'none',
    animationName: 'buyerlyMenuFadeIn, buyerlyMenuScaleIn',
    animationDuration: '40ms, 250ms',
    animationTimingFunction: 'linear, cubic-bezier(0.25, 0.95, 0.6, 1)',
    animationDelay: '0s, 0s',
    animationDirection: 'normal, normal',
    animationFillMode: 'none, none',
    animationIterationCount: '1, 1',
    animationPlayState: 'running, running',
    transformOrigin: '100% 0',
  },
  popoverClosing: {
    transform: 'scale(0.98)',
    pointerEvents: 'none',
    animationName: 'buyerlyMenuFadeOut',
    animationDuration: '140ms',
    animationTimingFunction: 'cubic-bezier(0.2, 0.65, 0.2, 1)',
    animationFillMode: 'forwards',
  },
  mainSection: {
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 16,
    paddingRight: 16,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 16,
    paddingRight: 16,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: 'var(--display-divider, var(--color-border-primary))',
  },
  tabs: {
    display: 'flex',
    alignItems: 'center',
    width: 268,
    height: 32,
    gap: 2,
    marginTop: 6,
    marginRight: 0,
    marginBottom: 16,
    marginLeft: 0,
    padding: 0,
    borderRadius: 5,
    backgroundColor: colors['--card-bg'],
  },
  tabSlot: {
    display: 'flex',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    alignItems: 'center',
    height: 32,
  },
  tab: {
    position: 'relative',
    display: 'flex',
    width: 'calc(100% - 4px)',
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    margin: 2,
    gap: 6,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 8,
    paddingRight: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 9999,
    color: colors['--sidebar-tab-inactive-text'],
    backgroundColor: colors['--card-bg'],
    fontWeight: 500,
    outlineStyle: 'none',
    cursor: 'pointer',
  },
  tabSelected: {
    color: colors['--sidebar-tab-active-text'],
    backgroundColor: 'var(--display-selected, var(--tab-active-bg))',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: 268,
    height: 32,
    color: colors['--text-tertiary'],
    fontWeight: 500,
  },
  rowControls: {
    display: 'flex',
    alignItems: 'center',
    flexDirection: 'row-reverse',
  },
  select: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: 100,
    height: 24,
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 8,
    paddingRight: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 8,
    color: colors['--text-secondary'],
    backgroundColor: {
      default: colors['--card-bg'],
      ':hover': 'var(--display-control-hover, var(--bg-canvas))',
    },
    boxShadow:
      '0 0 0 1px color-mix(in srgb, var(--text-primary) 10.3%, transparent), 0 3px 6px -2px rgb(0 0 0 / 2%), 0 1px 1px rgb(0 0 0 / 4%)',
    fontWeight: 400,
    outlineStyle: 'none',
    cursor: 'pointer',
  },
  selectOpen: {
    backgroundColor: 'var(--display-control-hover, var(--bg-canvas))',
  },
  orderButton: {
    display: 'grid',
    placeItems: 'center',
    width: 24,
    height: 24,
    marginRight: 4,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 2,
    paddingRight: 2,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 9999,
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--display-control-hover, var(--bg-canvas))',
    },
    backgroundPosition: '0 0',
    outlineStyle: 'none',
    cursor: 'pointer',
  },
  groupOrderButton: {
    marginRight: 0,
  },
  /* Linear's Group ordering panel (measured 11.10): a 49px header with Back and
     the title, then 32px rows: handle, the group, and an eye to hide it. */
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: 49,
    padding: 8,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--display-divider, var(--color-border-primary))',
    color: colors['--text-tertiary'],
    fontWeight: 500,
  },
  groupList: {
    padding: 8,
    maxHeight: 'min(420px, calc(100vh - 160px))',
    overflowY: 'auto',
  },
  groupRow: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    height: 32,
    paddingTop: 4,
    paddingRight: 8,
    paddingBottom: 4,
    paddingLeft: 28,
    borderRadius: 8,
    backgroundColor: {
      default: colors['--card-bg'],
      ':hover': 'var(--display-option-hover, var(--bg-canvas))',
    },
  },
  groupRowDragging: {
    zIndex: 1,
    boxShadow: colors['--dropdown-shadow'],
  },
  groupHandle: {
    position: 'absolute',
    left: 4,
    top: 0,
    display: 'grid',
    placeItems: 'center',
    width: 20,
    height: 32,
    color: colors['--text-tertiary'],
    cursor: 'grab',
    touchAction: 'none',
  },
  groupLabel: {
    display: 'flex',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minWidth: 0,
    alignItems: 'center',
    gap: 6,
    color: colors['--text-secondary'],
    fontSize: 13,
    fontWeight: 450,
    whiteSpace: 'nowrap',
  },
  groupLabelHidden: {
    opacity: 0.5,
  },
  groupIcon: {
    display: 'inline-flex',
    width: 16,
    justifyContent: 'center',
  },
  /* Linear's footer while the view differs from its default. */
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 4,
    padding: 8,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: 'var(--display-divider, var(--color-border-primary))',
  },
  footerButton: {
    height: 24,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 8,
    paddingRight: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 9999,
    color: colors['--text-primary'],
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--display-control-hover, var(--bg-canvas))',
    },
    backgroundPosition: '0 0',
    fontSize: 12,
    fontWeight: 500,
    outlineStyle: 'none',
    cursor: 'pointer',
  },
  /* "Set default for everyone" reads in Linear's accent (#472). */
  footerButtonAccent: {
    color: colors['--display-footer-accent'],
  },
  /* Linear's 7px accent dot on the Display options icon while the view is changed. */
  changedDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 7,
    height: 7,
    borderRadius: '50%',
    backgroundColor: colors['--action-primary'],
    pointerEvents: 'none',
  },
  selectMenu: {
    position: 'fixed',
    zIndex: 10000,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 100,
    width: 'max-content',
    overflow: 'hidden',
    padding: 0,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--display-menu-border, var(--color-border-secondary))',
    borderRadius: 12,
    color: colors['--text-secondary'],
    backgroundColor: colors['--card-bg'],
    boxShadow: colors['--dropdown-shadow'],
  },
  selectOption: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    minWidth: 117,
    height: 24,
    paddingTop: 0,
    paddingRight: 35,
    paddingBottom: 0,
    paddingLeft: 12,
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'currentColor',
    color: colors['--text-secondary'],
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--display-option-hover, var(--bg-canvas))',
      ':focus-visible': 'var(--display-option-hover, var(--bg-canvas))',
    },
    backgroundPosition: '0 0',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    outlineStyle: 'none',
    cursor: 'pointer',
  },
  /* Linear's checkbox dropdown in Display options (Include in priority inbox). */
  checkMenu: {
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 0,
    paddingRight: 0,
  },
  checkOption: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 173,
    height: 32,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 14,
    paddingRight: 14,
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'currentColor',
    color: colors['--text-primary'],
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--display-option-hover, var(--bg-canvas))',
      ':focus-visible': 'var(--display-option-hover, var(--bg-canvas))',
    },
    backgroundPosition: '0 0',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    outlineStyle: 'none',
    cursor: 'pointer',
  },
  checkbox: {
    display: 'inline-flex',
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    alignItems: 'center',
    justifyContent: 'center',
    width: 14,
    height: 14,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--filter-checkbox-border'],
    borderRadius: 3,
    color: '#fff',
  },
  checkboxChecked: {
    borderColor: colors['--filter-checkbox-selected'],
    backgroundColor: colors['--filter-checkbox-selected'],
  },
  checkDivider: {
    height: 1,
    marginTop: 4,
    marginBottom: 4,
    marginLeft: 0,
    marginRight: 0,
    backgroundColor: 'var(--display-menu-border, var(--color-border-secondary))',
  },
  checkIcon: {
    display: 'inline-flex',
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    alignItems: 'center',
    justifyContent: 'center',
    width: 14,
    color: colors['--text-tertiary'],
  },
  sectionTitle: {
    height: 15,
    marginTop: 8,
    marginRight: 0,
    marginBottom: 2,
    marginLeft: 0,
    color: colors['--text-secondary'],
    fontWeight: 500,
    lineHeight: '15px',
  },
  propertiesLabel: {
    display: 'flex',
    height: 15,
    marginTop: 8,
    marginRight: 0,
    marginBottom: 4,
    marginLeft: 0,
    color: colors['--sidebar-tab-inactive-text'],
    fontFamily: DISPLAY_INTER_STACK,
    fontWeight: 500,
    fontFeatureSettings: 'normal',
    lineHeight: 'normal',
  },
  properties: {
    display: 'flex',
    flexWrap: 'wrap',
    width: 268,
    marginTop: 8,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    gap: 1,
    lineHeight: '24px',
  },
  property: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 24,
    marginTop: 0,
    marginRight: 4,
    marginBottom: 4,
    marginLeft: 0,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 8,
    paddingRight: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 9999,
    color: colors['--sidebar-tab-inactive-text'],
    backgroundColor: {
      default: colors['--card-bg'],
      ':hover': 'var(--display-control-hover, var(--bg-canvas))',
    },
    fontFamily: DISPLAY_INTER_STACK,
    fontSize: 12,
    fontWeight: 500,
    fontFeatureSettings: 'normal',
    lineHeight: 'normal',
    textRendering: 'auto',
    outlineStyle: 'none',
    cursor: 'pointer',
  },
  propertyPressed: {
    color: colors['--sidebar-tab-active-text'],
    backgroundColor: {
      default: 'var(--display-property-selected, var(--tab-active-bg))',
      ':hover': 'var(--display-control-hover, var(--bg-canvas))',
    },
  },
  /* The board's columns or rows already show it: off and not clickable, as Linear's. */
  propertyDisabled: {
    backgroundColor: colors['--card-bg'],
    cursor: 'default',
  },
  facetDot: {
    width: 8,
    height: 8,
    borderRadius: 9999,
  },
});

export type DisplayOption = { value: string; label: string };

interface BuyerlySelectProps {
  value: string;
  options: DisplayOption[];
  onChange: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
}

const Chevron = () => (
  <BuyerlyChevronGlyph />
);

const Check = () => (
  <BuyerlyIcon name="check" size={14} />
);

export const BuyerlySelect: React.FC<BuyerlySelectProps> = ({ value, options, onChange, onOpenChange }) => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 5, right: window.innerWidth - rect.right });
  }, [open]);

  useEffect(() => {
    onOpenChange?.(open);
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onOpenChange]);

  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        {...withClassName(
          stylex.props(displayStyles.select, open && displayStyles.selectOpen),
          displayCss.select,
          'buyerly-display-select',
        )}
        data-open={open || undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label}</span>
        <Chevron />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          {...withClassName(stylex.props(displayStyles.selectMenu), 'buyerly-display-select-menu')}
          style={{ top: coords.top, right: coords.right }}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                key={option.value}
                {...withClassName(
                  stylex.props(displayStyles.selectOption),
                  displayCss.selectOption,
                  'buyerly-display-select-option',
                )}
                onClick={() => {
                  onChange(option.value);
                  close();
                }}
              >
                <span>{option.label}</span>
                {isSelected && <Check />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
};

interface BuyerlyMultiSelectProps {
  values: string[];
  options: DisplayOption[];
  onChange: (values: string[]) => void;
  ariaLabel: string;
  /** A last row under a divider, such as Linear's "Add custom filters". */
  footer?: { label: string; icon: React.ReactNode; onSelect: () => void };
}

/**
 * Linear's checkbox dropdown in Display options ("Include in priority inbox"):
 * "All" when everything is ticked, "N selected" otherwise, and the menu stays
 * open while boxes are ticked.
 */
export const BuyerlyMultiSelect: React.FC<BuyerlyMultiSelectProps> = ({ values, options, onChange, ariaLabel, footer }) => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 5, right: window.innerWidth - rect.right });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const label = values.length === options.length ? 'All' : `${values.length} selected`;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        {...withClassName(
          stylex.props(displayStyles.select, open && displayStyles.selectOpen),
          displayCss.select,
          'buyerly-display-select',
        )}
        data-open={open || undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{label}</span>
        <Chevron />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-multiselectable="true"
          aria-label={ariaLabel}
          {...withClassName(
            stylex.props(displayStyles.selectMenu, displayStyles.checkMenu),
            'buyerly-display-select-menu buyerly-display-check-menu',
          )}
          style={{ top: coords.top, right: coords.right }}
        >
          {options.map((option) => {
            const isSelected = values.includes(option.value);
            return (
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                key={option.value}
                {...withClassName(stylex.props(displayStyles.checkOption), 'buyerly-display-check-option')}
                onClick={() => onChange(
                  isSelected
                    ? values.filter((value) => value !== option.value)
                    : options.map((entry) => entry.value).filter((value) => value === option.value || values.includes(value)),
                )}
              >
                <span
                  {...withClassName(
                    stylex.props(displayStyles.checkbox, isSelected && displayStyles.checkboxChecked),
                    displayCss.checkbox,
                    'buyerly-display-checkbox',
                  )}
                  data-checked={isSelected || undefined}
                  aria-hidden="true"
                >
                  {isSelected && <Check />}
                </span>
                <span>{option.label}</span>
              </button>
            );
          })}
          {footer && (
            <>
              <div role="separator" {...withClassName(stylex.props(displayStyles.checkDivider), 'buyerly-display-check-divider')} />
              <button
                type="button"
                role="option"
                aria-selected={false}
                {...withClassName(stylex.props(displayStyles.checkOption), 'buyerly-display-check-option')}
                onClick={() => {
                  setOpen(false);
                  footer.onSelect();
                }}
              >
                <span {...withClassName(stylex.props(displayStyles.checkIcon), 'buyerly-display-check-icon')} aria-hidden="true">{footer.icon}</span>
                <span>{footer.label}</span>
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
};

/** Ordering direction, as Linear's: "Descending" puts the long bar on top, "Ascending" at the bottom. */
const DirectionIcon: React.FC<{ direction: 'asc' | 'desc' }> = ({ direction }) => (
  <BuyerlyIcon name={direction === 'desc' ? 'sort-descending' : 'sort-ascending'} size={16} />
);

const GroupOrderingIcon = () => (
  <BuyerlyIcon name="group-ordering" size={16} />
);

const BackIcon = () => (
  <BuyerlyIcon name="arrow-left" size={14} />
);

const DragHandleIcon = () => (
  <svg width="6" height="10" viewBox="0 0 6 10" aria-hidden="true" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M1 8a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM1 4a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM1 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
  </svg>
);

const EyeIcon: React.FC<{ hidden: boolean }> = ({ hidden }) => (
  <BuyerlyIcon name={hidden ? 'hide' : 'show'} size={14} />
);

export interface DisplayGroupOption {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface GroupOrderingProps {
  groups: DisplayGroupOption[];
  hidden: string[];
  onReorder: (ids: string[]) => void;
  onToggleHidden: (id: string) => void;
}

const SortableGroupRow: React.FC<{ group: DisplayGroupOption; hidden: boolean; onToggleHidden: () => void }> = ({
  group,
  hidden,
  onToggleHidden,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id });
  return (
    <div
      ref={setNodeRef}
      {...withClassName(
        stylex.props(displayStyles.groupRow, isDragging && displayStyles.groupRowDragging),
        'buyerly-display-group-row',
      )}
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <div
        {...withClassName(stylex.props(displayStyles.groupHandle), 'buyerly-display-group-handle')}
        aria-label={`Move ${group.label}`}
        {...attributes}
        {...listeners}
      >
        <DragHandleIcon />
      </div>
      <div
        {...withClassName(
          stylex.props(displayStyles.groupLabel, hidden && displayStyles.groupLabelHidden),
          displayCss.groupLabel,
          'buyerly-display-group-label',
        )}
        data-hidden={hidden || undefined}
      >
        {group.icon && <span {...withClassName(stylex.props(displayStyles.groupIcon), 'buyerly-display-group-icon')} aria-hidden="true">{group.icon}</span>}
        <span>{group.label}</span>
      </div>
      <button
        type="button"
        {...withClassName(
          stylex.props(displayStyles.orderButton, displayStyles.groupOrderButton),
          'buyerly-display-order-button',
        )}
        aria-label={hidden ? 'Show group' : 'Hide group'}
        aria-pressed={hidden}
        onClick={onToggleHidden}
      >
        <EyeIcon hidden={hidden} />
      </button>
    </div>
  );
};

/** Linear's Group ordering panel: drag a group by its handle, hide it with the eye. */
const GroupOrderingPanel: React.FC<GroupOrderingProps & { onBack: () => void }> = ({
  groups,
  hidden,
  onReorder,
  onToggleHidden,
  onBack,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = groups.map((group) => group.id);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };
  return (
    <>
      <section {...withClassName(stylex.props(displayStyles.groupHeader), 'buyerly-display-group-header')}>
        <button
          type="button"
          {...withClassName(
            stylex.props(displayStyles.orderButton, displayStyles.groupOrderButton),
            'buyerly-display-order-button',
          )}
          aria-label="Back"
          onClick={onBack}
        >
          <BackIcon />
        </button>
        <span>Group ordering</span>
      </section>
      <section {...withClassName(stylex.props(displayStyles.groupList), 'buyerly-display-group-list')} aria-label="Group ordering">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {groups.map((group) => (
              <SortableGroupRow
                key={group.id}
                group={group}
                hidden={hidden.includes(group.id)}
                onToggleHidden={() => onToggleHidden(group.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </section>
    </>
  );
};

interface BuyerlyDisplayOptionsProps {
  viewMode: 'list' | 'board';
  onViewModeChange: (mode: 'list' | 'board') => void;
  grouping: string;
  groupingOptions: DisplayOption[];
  onGroupingChange: (value: string) => void;
  subGrouping?: string;
  subGroupingOptions?: DisplayOption[];
  onSubGroupingChange?: (value: string) => void;
  ordering: string;
  orderingOptions: DisplayOption[];
  onOrderingChange: (value: string) => void;
  /** With a handler, Linear's Direction button sits before Ordering. */
  direction?: 'asc' | 'desc';
  onDirectionChange?: (direction: 'asc' | 'desc') => void;
  /** Without it (or with no grouping) the Group ordering button is left out. */
  groupOrdering?: GroupOrderingProps;
  /** The reporting window, in a block of its own as Linear's "Completed issues". */
  period?: string;
  periodOptions?: DisplayOption[];
  onPeriodChange?: (value: string) => void;
  properties: Record<string, string>;
  enabledProperties: Record<string, boolean>;
  onToggleProperty: (value: string) => void;
  showEmptyGroups?: boolean;
  onShowEmptyGroupsChange?: (value: boolean) => void;
  /** Board's "Show empty rows", once Rows is set. */
  showEmptySubGroups?: boolean;
  onShowEmptySubGroupsChange?: (value: boolean) => void;
  /**
   * Properties the board already shows as its columns or rows: greyed out
   * and off, as Linear's Status chip on a board by Status.
   */
  inactiveProperties?: string[];
  showViewModes?: boolean;
  showGrouping?: boolean;
  /** Off where Linear's popover has no List options block, as on Members and Teams: only Display properties. */
  showOptionsTitle?: boolean;
  /** Switches above Display properties, as a team Members tab's "Show members" and the like. */
  toggles?: { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void }[];
  /** Linear's footer once the view differs from its default: Reset brings the default back. */
  onReset?: () => void;
  /** Linear's "Set default for everyone" beside Reset, for admins and owners (#472). */
  onSetDefault?: () => void;
}

export const BuyerlyDisplayOptions: React.FC<BuyerlyDisplayOptionsProps> = ({
  viewMode,
  onViewModeChange,
  grouping,
  groupingOptions,
  onGroupingChange,
  subGrouping,
  subGroupingOptions,
  onSubGroupingChange,
  ordering,
  orderingOptions,
  onOrderingChange,
  direction,
  onDirectionChange,
  groupOrdering,
  period,
  periodOptions,
  onPeriodChange,
  properties,
  enabledProperties,
  onToggleProperty,
  showEmptyGroups,
  onShowEmptyGroupsChange,
  showEmptySubGroups,
  onShowEmptySubGroupsChange,
  inactiveProperties = [],
  showViewModes = true,
  showGrouping = true,
  showOptionsTitle = true,
  toggles = [],
  onReset,
  onSetDefault,
}) => {
  const [panel, setPanel] = useState<'main' | 'groups'>('main');
  const groupingLabel = viewMode === 'board' ? 'Columns' : 'Grouping';
  const subGroupingLabel = viewMode === 'board' ? 'Rows' : 'Sub-grouping';
  const optionsLabel = viewMode === 'board' ? 'Board options' : 'List options';
  const showEmptyLabel = viewMode === 'board' ? 'Show empty columns' : 'Show empty groups';
  const canOrderGroups = Boolean(groupOrdering) && grouping !== 'none' && (groupOrdering?.groups.length ?? 0) > 0;

  useEffect(() => {
    if (!canOrderGroups) setPanel('main');
  }, [canOrderGroups]);

  if (panel === 'groups' && groupOrdering && canOrderGroups) {
    return <GroupOrderingPanel {...groupOrdering} onBack={() => setPanel('main')} />;
  }

  return (
    <>
      <section {...withClassName(stylex.props(displayStyles.mainSection), 'buyerly-display-main-section')}>
        {showViewModes && <div role="tablist" {...withClassName(stylex.props(displayStyles.tabs), 'buyerly-display-tabs')}>
          {(['list', 'board'] as const).map((mode) => {
            const isSelected = viewMode === mode;
            return (
              <div {...withClassName(stylex.props(displayStyles.tabSlot), 'buyerly-display-tab-slot')} key={mode}>
                <Tooltip content="Toggle layout view" shortcut={LAYOUT_SHORTCUT}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    aria-label={mode === 'list' ? 'List' : 'Board'}
                    data-state={isSelected ? 'active' : 'inactive'}
                    tabIndex={isSelected ? 0 : -1}
                    {...withClassName(
                      stylex.props(displayStyles.tab, isSelected && displayStyles.tabSelected),
                      displayCss.tab,
                      'buyerly-display-tab',
                    )}
                    onClick={() => onViewModeChange(mode)}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                        event.preventDefault();
                        onViewModeChange(mode === 'list' ? 'board' : 'list');
                      }
                    }}
                  >
                    {mode === 'list' ? <BuyerlyIcon name="list" size={16} /> : <BuyerlyIcon name="board" size={16} />}
                    <span>{mode === 'list' ? 'List' : 'Board'}</span>
                  </button>
                </Tooltip>
              </div>
            );
          })}
        </div>}

        {showGrouping && <div {...withClassName(stylex.props(displayStyles.row), 'buyerly-display-row')}>
          <span>{groupingLabel}</span>
          <div {...withClassName(stylex.props(displayStyles.rowControls), 'buyerly-display-row-controls')}>
            <BuyerlySelect value={grouping} options={groupingOptions} onChange={onGroupingChange} />
            {canOrderGroups && (
              <Tooltip content="Group ordering">
                <button
                  type="button"
                  {...withClassName(stylex.props(displayStyles.orderButton), 'buyerly-display-order-button')}
                  aria-label="Group ordering"
                  onClick={() => setPanel('groups')}
                >
                  <GroupOrderingIcon />
                </button>
              </Tooltip>
            )}
          </div>
        </div>}

        {showGrouping && subGrouping !== undefined && subGroupingOptions && onSubGroupingChange && (
          <div {...withClassName(stylex.props(displayStyles.row), 'buyerly-display-row')}>
            <span>{subGroupingLabel}</span>
            <BuyerlySelect value={subGrouping} options={subGroupingOptions} onChange={onSubGroupingChange} />
          </div>
        )}

        <div {...withClassName(stylex.props(displayStyles.row), 'buyerly-display-row')}>
          <span>Ordering</span>
          <div {...withClassName(stylex.props(displayStyles.rowControls), 'buyerly-display-row-controls')}>
            <BuyerlySelect value={ordering} options={orderingOptions} onChange={onOrderingChange} />
            {direction && onDirectionChange && ordering !== 'manual' && (
              <Tooltip content={direction === 'asc' ? 'Ascending' : 'Descending'}>
                <button
                  type="button"
                  {...withClassName(stylex.props(displayStyles.orderButton), 'buyerly-display-order-button')}
                  aria-label="Direction"
                  data-direction={direction}
                  onClick={() => onDirectionChange(direction === 'asc' ? 'desc' : 'asc')}
                >
                  <DirectionIcon direction={direction} />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      </section>

      {period !== undefined && periodOptions && onPeriodChange && (
        <section {...withClassName(stylex.props(displayStyles.section), 'buyerly-display-view-section')}>
          <div {...withClassName(stylex.props(displayStyles.row), 'buyerly-display-row')}>
            <span>Period</span>
            <BuyerlySelect value={period} options={periodOptions} onChange={onPeriodChange} />
          </div>
        </section>
      )}

      <section {...withClassName(stylex.props(displayStyles.section), 'buyerly-display-options-section')}>
        {showOptionsTitle && <div {...withClassName(stylex.props(displayStyles.sectionTitle), 'buyerly-display-section-title')}>{optionsLabel}</div>}
        {showEmptyGroups !== undefined && onShowEmptyGroupsChange && (
          <div {...withClassName(stylex.props(displayStyles.row), 'buyerly-display-row')}>
            <span>{showEmptyLabel}</span>
            <BuyerlyToggle
              label={showEmptyLabel}
              checked={showEmptyGroups}
              onChange={onShowEmptyGroupsChange}
            />
          </div>
        )}
        {showEmptySubGroups !== undefined && onShowEmptySubGroupsChange && (
          <div {...withClassName(stylex.props(displayStyles.row), 'buyerly-display-row')}>
            <span>Show empty rows</span>
            <BuyerlyToggle
              label="Show empty rows"
              checked={showEmptySubGroups}
              onChange={onShowEmptySubGroupsChange}
            />
          </div>
        )}
        {toggles.map((toggle) => (
          <div key={toggle.id} {...withClassName(stylex.props(displayStyles.row), 'buyerly-display-row')}>
            <span>{toggle.label}</span>
            <BuyerlyToggle label={toggle.label} checked={toggle.checked} onChange={toggle.onChange} />
          </div>
        ))}
        <div {...withClassName(stylex.props(displayStyles.propertiesLabel), 'buyerly-display-properties-label')}>Display properties</div>
        <div {...withClassName(stylex.props(displayStyles.properties), 'buyerly-display-properties')}>
          {Object.entries(properties).map(([key, label]) => {
            const inactive = inactiveProperties.includes(key);
            const isPressed = !inactive && !!enabledProperties[key];
            return (
              <button
                type="button"
                key={key}
                aria-pressed={isPressed}
                disabled={inactive}
                {...withClassName(
                  stylex.props(
                    displayStyles.property,
                    isPressed && displayStyles.propertyPressed,
                    inactive && displayStyles.propertyDisabled,
                  ),
                  displayCss.property,
                  'buyerly-display-property',
                )}
                onClick={() => onToggleProperty(key)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {(onReset || onSetDefault) && (
        <section {...withClassName(stylex.props(displayStyles.footer), 'buyerly-display-footer')}>
          {onReset && (
            <button
              type="button"
              {...withClassName(stylex.props(displayStyles.footerButton), 'buyerly-display-footer-button')}
              aria-label="Reset to default"
              onClick={onReset}
            >
              Reset
            </button>
          )}
          {onSetDefault && (
            <button
              type="button"
              {...withClassName(
                stylex.props(displayStyles.footerButton, displayStyles.footerButtonAccent),
                'buyerly-display-footer-button buyerly-display-footer-button--accent',
              )}
              onClick={onSetDefault}
            >
              Set default for everyone
            </button>
          )}
        </section>
      )}
    </>
  );
};

/**
 * Linear's mark on the Display options button while the view differs from
 * its default: a 7px accent dot at the icon's top right.
 */
export const DisplayOptionsChangedDot: React.FC<{ show: boolean }> = ({ show }) =>
  show ? (
    <span
      {...withClassName(stylex.props(displayStyles.changedDot), 'buyerly-display-changed-dot')}
      data-display-changed="true"
      aria-hidden="true"
    />
  ) : null;
