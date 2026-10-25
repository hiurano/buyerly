import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { apiRequest } from '@/lib/api';
import type { AnalyticsHierarchyResponse } from '@/lib/types';
import {
  RULE_METRIC_LABELS,
  type RuleAccountPreview,
  type RuleMetric,
  type RuleOperator,
  type RuleScope,
} from '@/lib/rules';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import {
  METRIC_SECTIONS,
  RULE_OPERATORS,
  conditionProblem,
  metricUnit,
  operatorSymbol,
  type ConditionDraft,
  type RunOnAccount,
} from './ruleDraft';

/** On a touch screen a control a finger taps is at least 40px tall. */
const TOUCH = '@media (hover: none) and (pointer: coarse)';

const truncate = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

const colorTransition = {
  transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
  transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
  transitionDuration: '150ms',
} as const;

const styles = stylex.create({
  chip: {
    ...colorTransition,
    display: 'inline-flex',
    height: {
      default: 24,
      [TOUCH]: 40,
    },
    alignItems: 'center',
    gap: 6,
    borderRadius: 9999,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    backgroundColor: {
      default: 'transparent',
      ':hover': colors['--item-hover-bg'],
      ':is([aria-expanded="true"])': colors['--item-hover-bg'],
    },
    paddingLeft: 8,
    paddingRight: 8,
    fontSize: 12,
    fontWeight: 500,
    color: {
      default: colors['--text-secondary'],
      ':hover': colors['--text-primary'],
    },
    outline: '2px solid transparent',
    outlineOffset: 2,
    cursor: 'pointer',
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
  },
  chipDashed: {
    borderStyle: 'dashed',
  },
  popover: {
    position: 'absolute',
    zIndex: 30,
    display: 'flex',
    flexDirection: 'column',
    top: 'calc(100% + 6px)',
    backgroundColor: colors['--card-bg'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    borderRadius: 12,
    boxShadow: colors['--dropdown-shadow'],
    animationName: 'buyerlyPopoverScale',
    animationDuration: '120ms',
    animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
  },
  search: {
    display: 'flex',
    height: 40,
    flexShrink: 0,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderColor: colors['--color-border-primary'],
    paddingLeft: 12,
    paddingRight: 12,
  },
  searchInput: {
    height: 32,
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    borderWidth: 0,
    backgroundColor: 'transparent',
    fontSize: 13,
    color: colors['--text-primary'],
    outline: '2px solid transparent',
    outlineOffset: 2,
    '::placeholder': {
      color: colors['--text-tertiary'],
    },
  },
  option: {
    position: 'relative',
    marginLeft: 6,
    marginRight: 6,
    display: 'flex',
    height: {
      default: 32,
      [TOUCH]: 40,
    },
    cursor: 'pointer',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    paddingLeft: 8,
    paddingRight: 8,
    fontSize: 13,
    color: colors['--text-primary'],
  },
  optionActive: {
    backgroundColor: colors['--item-hover-bg'],
  },
  listbox: {
    overflowY: 'auto',
    paddingTop: 4,
    paddingBottom: 4,
  },
  metricList: {
    maxHeight: 300,
  },
  accountList: {
    maxHeight: 320,
  },
  sectionLabel: {
    paddingTop: 6,
    paddingRight: 14,
    paddingBottom: 2,
    paddingLeft: 14,
    fontSize: 11,
    fontWeight: 500,
    color: colors['--text-tertiary'],
  },
  optionLabel: {
    ...truncate,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
  },
  empty: {
    paddingTop: 12,
    paddingRight: 14,
    paddingBottom: 12,
    paddingLeft: 14,
    textAlign: 'center',
    fontSize: 12,
    color: colors['--text-muted'],
  },
  checkMark: {
    flexShrink: 0,
    color: colors['--text-secondary'],
  },
  condition: {
    position: 'relative',
  },
  conditionBox: {
    display: 'inline-flex',
    height: {
      default: 28,
      [TOUCH]: 40,
    },
    alignItems: 'stretch',
    overflow: 'hidden',
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    color: colors['--text-primary'],
  },
  conditionBoxInvalid: {
    borderColor: colors['--rules-action-stop-text'],
  },
  segment: {
    ...colorTransition,
    display: 'inline-flex',
    height: {
      default: '100%',
      [TOUCH]: 40,
    },
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 8,
    fontSize: 12,
    fontWeight: 500,
    outline: '2px solid transparent',
    outlineOffset: 2,
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
      ':focus-visible': colors['--item-hover-bg'],
    },
  },
  operator: {
    minWidth: 28,
    justifyContent: 'center',
    color: colors['--text-secondary'],
  },
  valueSegment: {
    cursor: 'text',
    gap: 4,
    backgroundColor: {
      default: null,
      ':hover': 'transparent',
      ':focus-visible': colors['--item-hover-bg'],
    },
  },
  remove: {
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
    },
  },
  divider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors['--color-border-secondary'],
  },
  operatorSymbol: {
    width: 16,
    textAlign: 'center',
  },
  secondary: {
    color: colors['--text-secondary'],
  },
  unit: {
    fontSize: 11,
    color: colors['--text-tertiary'],
  },
  valueInput: {
    width: 56,
    minWidth: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    fontSize: 12,
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
    color: colors['--text-primary'],
    outline: '2px solid transparent',
    outlineOffset: 2,
    '::placeholder': {
      color: colors['--text-muted'],
    },
  },
  accountRow: {
    display: 'flex',
    alignItems: 'center',
  },
  accountOption: {
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    marginRight: 0,
  },
  accountText: {
    display: 'flex',
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    flexDirection: 'column',
    lineHeight: '16px',
  },
  accountName: truncate,
  accountScope: {
    ...truncate,
    fontSize: 11,
    color: colors['--text-tertiary'],
  },
  campaignsButton: {
    marginRight: 6,
    height: {
      default: 28,
      [TOUCH]: 40,
    },
    flexShrink: 0,
    borderRadius: 6,
    paddingLeft: 8,
    paddingRight: 8,
    fontSize: 12,
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
    },
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
  },
  campaigns: {
    paddingBottom: 4,
    paddingLeft: 24,
  },
  campaignsNote: {
    paddingTop: 6,
    paddingRight: 12,
    paddingBottom: 6,
    paddingLeft: 12,
    fontSize: 12,
    color: colors['--text-muted'],
  },
  box: {
    display: 'flex',
    height: 14,
    width: 14,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--checkbox-border-rest'],
    backgroundColor: 'transparent',
    color: '#fff',
  },
  boxOn: {
    borderColor: colors['--checkbox-checked-bg'],
    backgroundColor: colors['--checkbox-checked-bg'],
  },
});

/** A chip of the rule window: Linear's 24px property pill. */
export const BuyerlyRuleChip = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** "+ Condition": a chip that adds rather than sets. */
  dashed?: boolean;
}>(({ dashed = false, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} {...props} {...stylex.props(styles.chip, dashed && styles.chipDashed)} />
));
BuyerlyRuleChip.displayName = 'BuyerlyRuleChip';

const CHECK_PATH =
  'M3.46975 5.70757L1.88358 4.1225C1.65832 3.8974 1.29423 3.8974 1.06897 4.1225C0.843675 4.34765 0.843675 4.7116 1.06897 4.93674L3.0648 6.93117C3.29006 7.15628 3.65414 7.15628 3.8794 6.93117L8.93103 1.88306C9.15633 1.65792 9.15633 1.29397 8.93103 1.06883C8.70578 0.843736 8.34172 0.843724 8.11646 1.06879L3.46975 5.70757Z';

/**
 * A menu that opens under its chip inside the rule window. It stays in the
 * dialog rather than a portal, so the dialog's focus trap keeps the search
 * field typable; an outside press or Escape closes it.
 */
const InlinePopover: React.FC<React.PropsWithChildren<{
  label: string;
  width: number;
  onClose: () => void;
  align?: 'left' | 'right';
}>> = ({ label, width, onClose, align = 'left', children }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (rootRef.current?.contains(target)) return;
      if (target?.closest?.(`[data-popover-trigger="${label}"]`)) return;
      onClose();
    };
    document.addEventListener('mousedown', onPointerDown, true);
    return () => document.removeEventListener('mousedown', onPointerDown, true);
  }, [label, onClose]);
  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={label}
      data-rule-window-popover=""
      onClick={(event) => event.stopPropagation()}
      {...stylex.props(styles.popover)}
      style={{
        [align]: 0,
        width: `min(${width}px, calc(100vw - 24px))`,
      }}
    >
      {children}
    </div>
  );
};

const SearchField = React.forwardRef<HTMLInputElement, {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  activeId?: string;
  listId: string;
}>(({ value, placeholder, onChange, onKeyDown, activeId, listId }, ref) => (
  <div {...stylex.props(styles.search)}>
    <input
      ref={ref}
      type="text"
      value={value}
      placeholder={placeholder}
      aria-label={placeholder}
      aria-controls={listId}
      aria-activedescendant={activeId}
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      {...stylex.props(styles.searchInput)}
    />
  </div>
));
SearchField.displayName = 'SearchField';

/** Metric: search and sections — money, counts, rates (#387). */
export const MetricMenu: React.FC<{
  value: RuleMetric;
  onPick: (metric: RuleMetric) => void;
  onClose: () => void;
  label: string;
}> = ({ value, onPick, onClose, label }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  const needle = query.trim().toLocaleLowerCase();
  const sections = METRIC_SECTIONS
    .map((section) => ({
      ...section,
      metrics: section.metrics.filter((metric) => RULE_METRIC_LABELS[metric].toLocaleLowerCase().includes(needle)),
    }))
    .filter((section) => section.metrics.length > 0);
  const flat = sections.flatMap((section) => section.metrics);
  const [active, setActive] = useState(() => Math.max(0, flat.indexOf(value)));
  useEffect(() => setActive(0), [needle]);
  const pick = (metric: RuleMetric | undefined) => {
    if (!metric) return;
    onPick(metric);
    onClose();
  };
  return (
    <InlinePopover label={label} width={240} onClose={onClose}>
      <SearchField
        ref={inputRef}
        value={query}
        placeholder="Filter metrics…"
        listId="rule-metric-options"
        activeId={flat[active] ? `rule-metric-${flat[active]}` : undefined}
        onChange={setQuery}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (flat.length) setActive((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            pick(flat[active]);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
      />
      <div id="rule-metric-options" role="listbox" aria-label="Metrics" {...stylex.props(styles.listbox, styles.metricList)}>
        {sections.map((section) => (
          <div key={section.label} role="group" aria-label={section.label}>
            <div {...stylex.props(styles.sectionLabel)}>{section.label}</div>
            {section.metrics.map((metric) => {
              const index = flat.indexOf(metric);
              return (
                <div
                  key={metric}
                  id={`rule-metric-${metric}`}
                  role="option"
                  aria-selected={metric === value}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(metric)}
                  {...stylex.props(styles.option, index === active && styles.optionActive)}
                >
                  <span {...stylex.props(styles.optionLabel)}>{RULE_METRIC_LABELS[metric]}</span>
                  {metric === value && <CheckMark />}
                </div>
              );
            })}
          </div>
        ))}
        {flat.length === 0 && <div {...stylex.props(styles.empty)}>No metrics found</div>}
      </div>
    </InlinePopover>
  );
};

const CheckMark = () => (
  <svg width="12" height="10" viewBox="0 0 10 8" fill="currentColor" aria-hidden="true" {...stylex.props(styles.checkMark)}>
    <path d={CHECK_PATH} />
  </svg>
);

/**
 * One condition as a chip in the style of Linear's filters (#387):
 * "metric │ operator │ value ×", each part its own control. The value shows
 * its unit; a missing or wrong value is marked in the chip itself.
 */
export const ConditionChip: React.FC<{
  index: number;
  condition: ConditionDraft;
  currency?: string;
  removable: boolean;
  showProblem: boolean;
  onChange: (patch: Partial<ConditionDraft>) => void;
  onRemove: () => void;
}> = ({ index, condition, currency, removable, showProblem, onChange, onRemove }) => {
  const [metricOpen, setMetricOpen] = useState(false);
  const label = RULE_METRIC_LABELS[condition.metric];
  const problem = showProblem ? conditionProblem(condition) : null;
  const unit = metricUnit(condition.metric);
  const popoverLabel = `Metric for condition ${index + 1}`;
  return (
    <div {...stylex.props(styles.condition)} data-condition-chip={index}>
      <div
        title={problem ?? undefined}
        data-invalid={problem ? 'true' : undefined}
        {...stylex.props(styles.conditionBox, Boolean(problem) && styles.conditionBoxInvalid)}
      >
        <button
          type="button"
          aria-label={`Metric: ${label}`}
          aria-expanded={metricOpen}
          data-popover-trigger={popoverLabel}
          onClick={() => setMetricOpen((open) => !open)}
          {...stylex.props(styles.segment)}
        >
          {label}
        </button>
        <span aria-hidden="true" {...stylex.props(styles.divider)} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Operator: ${RULE_OPERATORS.find((option) => option.value === condition.operator)?.words}`}
              {...stylex.props(styles.segment, styles.operator)}
            >
              {operatorSymbol(condition.operator)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={4}>
            {RULE_OPERATORS.map((option) => (
              <DropdownMenuItem key={option.value} onClick={() => onChange({ operator: option.value as RuleOperator })}>
                <span {...stylex.props(styles.operatorSymbol)}>{option.symbol}</span>
                <span {...stylex.props(styles.secondary)}>{option.words}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span aria-hidden="true" {...stylex.props(styles.divider)} />
        <label {...stylex.props(styles.segment, styles.valueSegment)}>
          {unit === 'money' && currency && <span {...stylex.props(styles.unit)}>{currency}</span>}
          <input
            type="text"
            inputMode="decimal"
            value={condition.value}
            placeholder="0"
            aria-label={`${label} value`}
            aria-invalid={problem ? true : undefined}
            onChange={(event) => onChange({ value: event.target.value.replace(',', '.') })}
            {...stylex.props(styles.valueInput)}
            style={{ width: `${Math.max(3, condition.value.length + 1)}ch` }}
          />
          {unit === 'percent' && <span {...stylex.props(styles.unit)}>%</span>}
        </label>
        {removable && (
          <>
            <span aria-hidden="true" {...stylex.props(styles.divider)} />
            <button
              type="button"
              aria-label={`Remove condition ${index + 1}`}
              onClick={onRemove}
              {...stylex.props(styles.segment, styles.remove)}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M2.97 2.97a.75.75 0 0 1 1.06 0L8 6.94l3.97-3.97a.75.75 0 1 1 1.06 1.06L9.06 8l3.97 3.97a.75.75 0 1 1-1.06 1.06L8 9.06l-3.97 3.97a.75.75 0 0 1-1.06-1.06L6.94 8 2.97 4.03a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </button>
          </>
        )}
      </div>
      {metricOpen && (
        <MetricMenu
          label={popoverLabel}
          value={condition.metric}
          onPick={(metric) => onChange({ metric })}
          onClose={() => setMetricOpen(false)}
        />
      )}
    </div>
  );
};

interface CampaignOption { id: string; name: string }

/**
 * Run on (#387): the ad accounts a rule works on, with search; in each, the
 * whole account or chosen campaigns. A whole account shows what the rule
 * would check there and what matches now, before anything is saved.
 */
export const RunOnPicker: React.FC<{
  accounts: RunOnAccount[];
  runOn: Record<string, RuleScope>;
  previews: Record<string, RuleAccountPreview | 'loading' | 'error'>;
  levelNoun: string;
  onChange: (runOn: Record<string, RuleScope>) => void;
  onClose: () => void;
}> = ({ accounts, runOn, previews, levelNoun, onChange, onClose }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [openAccount, setOpenAccount] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Record<string, CampaignOption[] | 'loading' | 'error'>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const needle = query.trim().toLocaleLowerCase();
  const listed = useMemo(() => accounts.filter((account) =>
    `${account.name} ${account.account_id}`.toLocaleLowerCase().includes(needle)), [accounts, needle]);
  useEffect(() => setActive(0), [needle]);

  const toggle = (accountId: string) => {
    const next = { ...runOn };
    if (next[accountId]) delete next[accountId];
    else next[accountId] = { level: 'account', ids: [] };
    onChange(next);
  };

  const loadCampaigns = (accountId: string) => {
    setOpenAccount((current) => (current === accountId ? null : accountId));
    if (campaigns[accountId] && campaigns[accountId] !== 'error') return;
    setCampaigns((current) => ({ ...current, [accountId]: 'loading' }));
    void apiRequest<AnalyticsHierarchyResponse>(
      `/api/analytics/hierarchy?parent_id=${encodeURIComponent(accountId)}&level=campaign&period=today`,
    )
      .then((response) => setCampaigns((current) => ({
        ...current,
        [accountId]: response.items
          .map((item) => ({ id: item.entity_id, name: item.entity_name || item.entity_id }))
          .sort((left, right) => left.name.localeCompare(right.name)),
      })))
      .catch(() => setCampaigns((current) => ({ ...current, [accountId]: 'error' })));
  };

  const toggleCampaign = (accountId: string, campaignId: string) => {
    const scope = runOn[accountId];
    const ids = scope?.level === 'campaign' ? scope.ids : [];
    const nextIds = ids.includes(campaignId) ? ids.filter((id) => id !== campaignId) : [...ids, campaignId];
    const next = { ...runOn };
    // No campaign left means the whole account again, never "nothing".
    next[accountId] = nextIds.length ? { level: 'campaign', ids: nextIds } : { level: 'account', ids: [] };
    onChange(next);
  };

  const scopeText = (scope: RuleScope | undefined) => {
    if (!scope) return '';
    if (scope.level === 'account') return 'Whole account';
    const noun = scope.level === 'campaign' ? 'campaign' : 'ad set';
    return `${scope.ids.length} ${noun}${scope.ids.length === 1 ? '' : 's'}`;
  };

  const previewText = (accountId: string) => {
    const preview = previews[accountId];
    if (runOn[accountId]?.level !== 'account' || !preview) return '';
    if (preview === 'loading') return 'Checking…';
    if (preview === 'error') return '';
    return `Checks ${preview.total} ${levelNoun}${preview.total === 1 ? '' : 's'} · ${preview.matching} match now`;
  };

  return (
    <InlinePopover label="Run on" width={360} onClose={onClose}>
      <SearchField
        ref={inputRef}
        value={query}
        placeholder="Search ad accounts…"
        listId="rule-run-on-options"
        activeId={listed[active] ? `rule-run-on-${listed[active].account_id}` : undefined}
        onChange={setQuery}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (listed.length) setActive((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + listed.length) % listed.length);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (listed[active]) toggle(listed[active].account_id);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
      />
      <div id="rule-run-on-options" role="listbox" aria-label="Ad accounts" aria-multiselectable="true" {...stylex.props(styles.listbox, styles.accountList)}>
        {listed.map((account, index) => {
          const scope = runOn[account.account_id];
          const list = campaigns[account.account_id];
          return (
            <div key={account.account_id}>
              <div {...stylex.props(styles.accountRow)}>
                <div
                  id={`rule-run-on-${account.account_id}`}
                  role="option"
                  aria-selected={Boolean(scope)}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => toggle(account.account_id)}
                  {...stylex.props(styles.option, index === active && styles.optionActive, styles.accountOption)}
                >
                  <Box on={Boolean(scope)} />
                  <span {...stylex.props(styles.accountText)}>
                    <span {...stylex.props(styles.accountName)}>{account.name}</span>
                    {scope && (
                      <span {...stylex.props(styles.accountScope)}>
                        {[scopeText(scope), previewText(account.account_id)].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                </div>
                {scope && scope.level !== 'adset' && (
                  <button
                    type="button"
                    aria-expanded={openAccount === account.account_id}
                    aria-label={`Choose campaigns in ${account.name}`}
                    onClick={() => loadCampaigns(account.account_id)}
                    {...stylex.props(styles.campaignsButton)}
                  >
                    Campaigns…
                  </button>
                )}
              </div>
              {openAccount === account.account_id && (
                <div role="group" aria-label={`Campaigns in ${account.name}`} {...stylex.props(styles.campaigns)}>
                  {list === 'loading' && <div {...stylex.props(styles.campaignsNote)}>Loading campaigns…</div>}
                  {list === 'error' && <div {...stylex.props(styles.campaignsNote)}>Couldn't load campaigns.</div>}
                  {Array.isArray(list) && list.length === 0 && (
                    <div {...stylex.props(styles.campaignsNote)}>No campaigns in this ad account.</div>
                  )}
                  {Array.isArray(list) && list.map((campaign) => {
                    const on = scope?.level === 'campaign' && scope.ids.includes(campaign.id);
                    return (
                      <div
                        key={campaign.id}
                        role="option"
                        aria-selected={on}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => toggleCampaign(account.account_id, campaign.id)}
                        {...stylex.props(styles.option)}
                      >
                        <Box on={on} />
                        <span {...stylex.props(styles.accountName)}>{campaign.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {listed.length === 0 && (
          <div {...stylex.props(styles.empty)}>
            {accounts.length === 0 ? 'No ad accounts in this workspace yet' : 'No ad accounts found'}
          </div>
        )}
      </div>
    </InlinePopover>
  );
};

const Box: React.FC<{ on: boolean }> = ({ on }) => (
  <span
    aria-hidden="true"
    {...stylex.props(styles.box, on && styles.boxOn)}
  >
    {on && <svg width="10" height="9" viewBox="0 0 10 8" fill="currentColor"><path d={CHECK_PATH} /></svg>}
  </span>
);
