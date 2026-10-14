import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '@/lib/api';
import type { AnalyticsHierarchyResponse } from '@/lib/types';
import {
  RULE_METRIC_LABELS,
  type RuleAccountPreview,
  type RuleMetric,
  type RuleOperator,
  type RuleScope,
} from '@/lib/rules';
import { TOUCH_HEIGHT_CLASS as TOUCH_HEIGHT } from '@/lib/useMediaQuery';
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

/** A chip of the rule window: Linear's 24px property pill. */
export const CHIP_CLASS =
  `inline-flex h-[24px] ${TOUCH_HEIGHT} items-center gap-1.5 rounded-full border border-[var(--color-border-secondary)] bg-transparent px-2 text-[12px] font-medium text-[var(--text-secondary)] transition-colors outline-none cursor-pointer hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)] aria-expanded:bg-[var(--item-hover-bg)]`;

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
      className="absolute z-[30] flex flex-col"
      style={{
        top: 'calc(100% + 6px)',
        [align]: 0,
        width: `min(${width}px, calc(100vw - 24px))`,
        backgroundColor: 'var(--card-bg)',
        border: '1px solid var(--color-border-secondary)',
        borderRadius: 12,
        boxShadow: 'var(--dropdown-shadow)',
        animation: 'linearPopoverScale 120ms cubic-bezier(0.16, 1, 0.3, 1)',
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
  <div className="flex h-[40px] shrink-0 items-center border-b border-[var(--color-border-primary)] px-3">
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
      className="h-8 min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
    />
  </div>
));
SearchField.displayName = 'SearchField';

const optionClass = (active: boolean) =>
  `relative mx-1.5 flex h-8 ${TOUCH_HEIGHT} cursor-pointer items-center gap-2 rounded-[8px] px-2 text-[13px] text-[var(--text-primary)] ${active ? 'bg-[var(--item-hover-bg)]' : ''}`;

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
      <div id="rule-metric-options" role="listbox" aria-label="Metrics" className="max-h-[300px] overflow-y-auto py-1">
        {sections.map((section) => (
          <div key={section.label} role="group" aria-label={section.label}>
            <div className="px-3.5 pb-0.5 pt-1.5 text-[11px] font-medium text-[var(--text-tertiary)]">{section.label}</div>
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
                  className={optionClass(index === active)}
                >
                  <span className="flex-1 truncate">{RULE_METRIC_LABELS[metric]}</span>
                  {metric === value && <CheckMark />}
                </div>
              );
            })}
          </div>
        ))}
        {flat.length === 0 && <div className="px-3.5 py-3 text-center text-[12px] text-[var(--text-muted)]">No metrics found</div>}
      </div>
    </InlinePopover>
  );
};

const CheckMark = () => (
  <svg width="12" height="10" viewBox="0 0 10 8" fill="currentColor" aria-hidden="true" className="shrink-0 text-[var(--text-secondary)]">
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
  const segment = `inline-flex h-full ${TOUCH_HEIGHT} items-center px-2 text-[12px] font-medium outline-none transition-colors hover:bg-[var(--item-hover-bg)] focus-visible:bg-[var(--item-hover-bg)]`;
  return (
    <div className="relative" data-condition-chip={index}>
      <div
        title={problem ?? undefined}
        data-invalid={problem ? 'true' : undefined}
        className={`inline-flex h-[28px] ${TOUCH_HEIGHT} items-stretch overflow-hidden rounded-[8px] border text-[var(--text-primary)] ${problem ? 'border-[var(--rules-action-stop-text)]' : 'border-[var(--color-border-secondary)]'}`}
      >
        <button
          type="button"
          aria-label={`Metric: ${label}`}
          aria-expanded={metricOpen}
          data-popover-trigger={popoverLabel}
          onClick={() => setMetricOpen((open) => !open)}
          className={segment}
        >
          {label}
        </button>
        <span aria-hidden="true" className="w-px self-stretch bg-[var(--color-border-secondary)]" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Operator: ${RULE_OPERATORS.find((option) => option.value === condition.operator)?.words}`}
              className={`${segment} min-w-[28px] justify-center text-[var(--text-secondary)]`}
            >
              {operatorSymbol(condition.operator)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={4}>
            {RULE_OPERATORS.map((option) => (
              <DropdownMenuItem key={option.value} onClick={() => onChange({ operator: option.value as RuleOperator })}>
                <span className="w-4 text-center">{option.symbol}</span>
                <span className="text-[var(--text-secondary)]">{option.words}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span aria-hidden="true" className="w-px self-stretch bg-[var(--color-border-secondary)]" />
        <label className={`${segment} cursor-text gap-1 hover:bg-transparent`}>
          {unit === 'money' && currency && <span className="text-[11px] text-[var(--text-tertiary)]">{currency}</span>}
          <input
            type="text"
            inputMode="decimal"
            value={condition.value}
            placeholder="0"
            aria-label={`${label} value`}
            aria-invalid={problem ? true : undefined}
            onChange={(event) => onChange({ value: event.target.value.replace(',', '.') })}
            className="w-[56px] min-w-0 border-0 bg-transparent text-[12px] font-medium tabular-nums text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            style={{ width: `${Math.max(3, condition.value.length + 1)}ch` }}
          />
          {unit === 'percent' && <span className="text-[11px] text-[var(--text-tertiary)]">%</span>}
        </label>
        {removable && (
          <>
            <span aria-hidden="true" className="w-px self-stretch bg-[var(--color-border-secondary)]" />
            <button
              type="button"
              aria-label={`Remove condition ${index + 1}`}
              onClick={onRemove}
              className={`${segment} px-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]`}
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
      <div id="rule-run-on-options" role="listbox" aria-label="Ad accounts" aria-multiselectable="true" className="max-h-[320px] overflow-y-auto py-1">
        {listed.map((account, index) => {
          const scope = runOn[account.account_id];
          const list = campaigns[account.account_id];
          return (
            <div key={account.account_id}>
              <div className="flex items-center">
                <div
                  id={`rule-run-on-${account.account_id}`}
                  role="option"
                  aria-selected={Boolean(scope)}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => toggle(account.account_id)}
                  className={`${optionClass(index === active)} min-w-0 flex-1 !mr-0`}
                >
                  <Box on={Boolean(scope)} />
                  <span className="flex min-w-0 flex-1 flex-col leading-4">
                    <span className="truncate">{account.name}</span>
                    {scope && (
                      <span className="truncate text-[11px] text-[var(--text-tertiary)]">
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
                    className={`mr-1.5 h-7 ${TOUCH_HEIGHT} shrink-0 rounded-[6px] px-2 text-[12px] text-[var(--text-tertiary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]`}
                  >
                    Campaigns…
                  </button>
                )}
              </div>
              {openAccount === account.account_id && (
                <div role="group" aria-label={`Campaigns in ${account.name}`} className="pb-1 pl-6">
                  {list === 'loading' && <div className="px-3 py-1.5 text-[12px] text-[var(--text-muted)]">Loading campaigns…</div>}
                  {list === 'error' && <div className="px-3 py-1.5 text-[12px] text-[var(--text-muted)]">Couldn't load campaigns.</div>}
                  {Array.isArray(list) && list.length === 0 && (
                    <div className="px-3 py-1.5 text-[12px] text-[var(--text-muted)]">No campaigns in this ad account.</div>
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
                        className={optionClass(false)}
                      >
                        <Box on={on} />
                        <span className="truncate">{campaign.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {listed.length === 0 && (
          <div className="px-3.5 py-3 text-center text-[12px] text-[var(--text-muted)]">
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
    className="flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-[3px] border"
    style={{
      borderColor: on ? 'var(--checkbox-checked-bg)' : 'var(--checkbox-border-rest)',
      backgroundColor: on ? 'var(--checkbox-checked-bg)' : 'transparent',
      color: '#fff',
    }}
  >
    {on && <svg width="10" height="9" viewBox="0 0 10 8" fill="currentColor"><path d={CHECK_PATH} /></svg>}
  </span>
);
