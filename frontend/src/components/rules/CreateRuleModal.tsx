import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAppStore } from '@/store/useAppStore';
import type { RuleItem } from '@/store/useAppStore';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/ui/DropdownMenu';
import { Button } from '@/ui/Button';
import { FormCheckbox } from '@/ui/FormCheckbox';
import {
  RULE_LEVEL_LABELS,
  RULE_METRIC_LABELS,
  RULE_TIME_WINDOW_LABELS,
} from '@/lib/rules';
import type {
  RuleAction,
  RuleConditionPayload,
  RuleExecutionLevel,
  RuleMetric,
  RuleOperator,
  RuleTimeWindow,
} from '@/lib/rules';

/**
 * Every option here mirrors what `api/schemas/rules.py` accepts. The form
 * cannot offer a metric, operator, window or interval the backend would reject.
 */
const ACTIONS: RuleAction[] = [
  'turn_off',
  'turn_on',
  'notify_only',
  'increase_budget',
  'decrease_budget',
];

const ACTION_DESCRIPTIONS: Record<RuleAction, string> = {
  turn_off: 'Turn it off',
  turn_on: 'Turn it on',
  notify_only: 'Send a notification only',
  increase_budget: 'Increase the daily budget',
  decrease_budget: 'Decrease the daily budget',
};

const METRICS: RuleMetric[] = [
  'spend',
  'cpl',
  'cpreg',
  'cpp',
  'cpc',
  'ctr',
  'leads',
  'registrations',
  'purchases',
];

/** Counts cannot be fractional — the backend rejects a non-integer value. */
const COUNT_METRICS: ReadonlySet<RuleMetric> = new Set([
  'leads',
  'registrations',
  'purchases',
]);

const OPERATORS: { value: RuleOperator; label: string }[] = [
  { value: 'gt', label: 'is greater than (>)' },
  { value: 'gte', label: 'is at least (≥)' },
  { value: 'lt', label: 'is less than (<)' },
  { value: 'lte', label: 'is at most (≤)' },
  { value: 'eq', label: 'equals (=)' },
];

const TIME_WINDOWS: RuleTimeWindow[] = ['today', 'yesterday', 'last_3d', 'last_7d'];

const LEVELS: RuleExecutionLevel[] = ['adset', 'campaign', 'ad'];

const LEVEL_DESCRIPTIONS: Record<RuleExecutionLevel, string> = {
  adset: 'Each ad set on its own',
  campaign: 'The campaign as a whole',
  ad: 'A single ad, leaving its ad set running',
};

/**
 * Budget changes stay on ad sets: a campaign running Campaign Budget
 * Optimization owns its budget, and Meta rejects a budget write aimed at the
 * ad set underneath it.
 */
const BUDGET_ACTIONS: ReadonlySet<RuleAction> = new Set([
  'increase_budget',
  'decrease_budget',
]);

const CHECK_INTERVALS = [5, 15, 30, 60, 180, 720, 1440];

function formatInterval(minutes: number): string {
  if (minutes < 60) return `Every ${minutes}m`;
  if (minutes < 1440) return `Every ${minutes / 60}h`;
  return 'Once a day';
}

interface ConditionDraft {
  metric: RuleMetric;
  operator: RuleOperator;
  value: string;
}

const EMPTY_CONDITION: ConditionDraft = { metric: 'cpl', operator: 'gt', value: '' };

const PILL_CLASS =
  'inline-flex h-[24px] items-center gap-1.5 rounded-full bg-[var(--item-hover-bg)] hover:bg-[var(--item-active-bg)] px-2.5 text-[12px] font-medium text-[var(--text-tertiary)] transition-colors outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]';

const FIELD_CLASS =
  'h-[28px] rounded-[6px] bg-[var(--item-hover-bg)] px-2.5 text-[12px] font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none border border-transparent focus:border-[var(--action-primary)]';

export const CreateRuleModal: React.FC = () => {
  const {
    isCreateRuleModalOpen,
    createRuleTargetGroupId,
    editingRuleId,
    closeCreateRuleModal,
    addRule,
    updateRule,
    rules,
    ruleGroups,
  } = useAppStore();

  const editedRule = editingRuleId
    ? rules.find((rule) => rule.id === editingRuleId)
    : undefined;
  const isEditing = Boolean(editedRule);

  const [name, setName] = useState('');
  const [action, setAction] = useState<RuleAction>('turn_off');
  const [level, setLevel] = useState<RuleExecutionLevel>('adset');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [timeWindow, setTimeWindow] = useState<RuleTimeWindow>('today');
  const [checkInterval, setCheckInterval] = useState(5);
  const [conditionLogic, setConditionLogic] = useState<'and' | 'or'>('and');
  const [conditions, setConditions] = useState<ConditionDraft[]>([EMPTY_CONDITION]);
  const [budgetChangePercent, setBudgetChangePercent] = useState('20');
  const [budgetMaxDaily, setBudgetMaxDaily] = useState('');
  const [createMore, setCreateMore] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const modalTitle = isEditing ? 'Edit rule' : 'New rule';
  const submitLabel = isSubmitting
    ? isEditing
      ? 'Saving…'
      : 'Creating…'
    : isEditing
    ? 'Save changes'
    : 'Create rule';

  const isBudgetAction = BUDGET_ACTIONS.has(action);
  const availableActions = ACTIONS.filter(
    (candidate) => level === 'adset' || !BUDGET_ACTIONS.has(candidate),
  );

  const describeAction = (candidate: RuleAction): string => {
    const target = RULE_LEVEL_LABELS[level].toLowerCase();
    if (candidate === 'turn_off') return `Turn off the ${target}`;
    if (candidate === 'turn_on') return `Turn on the ${target}`;
    return ACTION_DESCRIPTIONS[candidate];
  };

  /** Switching to campaign level drops an action that level cannot perform. */
  const changeLevel = (next: RuleExecutionLevel) => {
    setLevel(next);
    if (next !== 'adset' && BUDGET_ACTIONS.has(action)) {
      setAction('turn_off');
    }
  };

  const resetForm = () => {
    setName('');
    setAction('turn_off');
    setLevel('adset');
    setTimeWindow('today');
    setCheckInterval(5);
    setConditionLogic('and');
    setConditions([EMPTY_CONDITION]);
    setBudgetChangePercent('20');
    setBudgetMaxDaily('');
    setSubmitError('');
  };

  /** Fill the form from an existing rule so an edit round-trips every field. */
  const loadRuleIntoForm = (rule: RuleItem) => {
    const preset = rule.preset;
    setName(preset.name);
    setAction(preset.action);
    setLevel(preset.level);
    setTimeWindow(preset.conditions[0]?.time_window ?? 'today');
    setCheckInterval(preset.check_interval_minutes);
    setConditionLogic(preset.condition_logic);
    setConditions(
      preset.conditions.length === 0
        ? [EMPTY_CONDITION]
        : preset.conditions.map((condition) => ({
            metric: condition.metric,
            operator: condition.operator,
            value: String(condition.value),
          })),
    );
    setBudgetChangePercent(String(preset.budget_change_percent || 20));
    setBudgetMaxDaily(
      preset.budget_max_daily > 0 ? String(preset.budget_max_daily) : '',
    );
    setSubmitError('');
  };

  useEffect(() => {
    if (!isCreateRuleModalOpen) return;
    if (editedRule) {
      loadRuleIntoForm(editedRule);
      setSelectedGroupId(editedRule.groupId || '');
    } else {
      resetForm();
      setSelectedGroupId(createRuleTargetGroupId || '');
    }
    // Creating several in a row makes no sense while editing one rule.
    setCreateMore(false);
  }, [isCreateRuleModalOpen, createRuleTargetGroupId, editingRuleId]);

  const updateCondition = (index: number, patch: Partial<ConditionDraft>) => {
    setConditions((current) =>
      current.map((condition, i) => (i === index ? { ...condition, ...patch } : condition)),
    );
  };

  const addCondition = () => {
    setConditions((current) => [...current, { ...EMPTY_CONDITION }]);
  };

  const removeCondition = (index: number) => {
    setConditions((current) =>
      current.length === 1 ? current : current.filter((_, i) => i !== index),
    );
  };

  /** Returns the payload conditions, or null when a value is missing or invalid. */
  const buildConditions = (): RuleConditionPayload[] | null => {
    const built: RuleConditionPayload[] = [];
    for (const condition of conditions) {
      const value = Number(condition.value);
      if (condition.value.trim() === '' || Number.isNaN(value) || value < 0) return null;
      if (COUNT_METRICS.has(condition.metric) && !Number.isInteger(value)) return null;
      built.push({
        metric: condition.metric,
        operator: condition.operator,
        value,
        time_window: timeWindow,
      });
    }
    return built;
  };

  const builtConditions = buildConditions();
  const budgetPercent = Number(budgetChangePercent);
  const budgetCeiling = Number(budgetMaxDaily);
  const budgetIsValid =
    !isBudgetAction ||
    (budgetPercent > 0 &&
      budgetPercent <= 100 &&
      (action !== 'increase_budget' || budgetCeiling > 0));
  const canSubmit =
    name.trim().length > 0 && builtConditions !== null && budgetIsValid && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !builtConditions) return;

    setIsSubmitting(true);
    setSubmitError('');
    const payload = {
      name: name.trim(),
      action,
      level,
      // Editing keeps the rule's own on/off state; a new rule starts on.
      enabled: editedRule ? editedRule.preset.enabled : true,
      conditions: builtConditions,
      condition_logic: conditionLogic,
      cooldown_minutes: editedRule ? editedRule.preset.cooldown_minutes : 0,
      check_interval_minutes: checkInterval,
      // Non-budget actions must send exactly zero for both budget fields.
      budget_change_percent: isBudgetAction ? budgetPercent : 0,
      budget_max_daily: action === 'increase_budget' ? budgetCeiling : 0,
    };

    try {
      if (editedRule) {
        await updateRule(editedRule.id, payload);
        closeCreateRuleModal();
      } else {
        await addRule(payload, selectedGroupId || undefined);
        if (createMore) {
          resetForm();
        } else {
          closeCreateRuleModal();
        }
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : isEditing
          ? 'Could not save the rule.'
          : 'Could not create the rule.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedGroup = ruleGroups.find((g) => g.id === selectedGroupId);

  return (
    <Dialog.Root open={isCreateRuleModalOpen} onOpenChange={(open) => !open && closeCreateRuleModal()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[500] bg-black/40 backdrop-blur-none animate-fade-in" />

        <div className="fixed inset-0 z-[501] flex items-start justify-center pt-[13vh] p-3 pointer-events-none overflow-y-auto">
          <Dialog.Content
            style={{
              width: '750px',
              maxWidth: '750px',
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--color-border-secondary)',
              borderRadius: '22px',
              boxShadow:
                '0px 4px 40px 0px rgba(0,0,0,0.1), 0px 3px 20px 0px rgba(0,0,0,0.125), 0px 3px 12px 0px rgba(0,0,0,0.125), 0px 2px 8px 0px rgba(0,0,0,0.125), 0px 1px 1px 0px rgba(0,0,0,0.125)',
            }}
            className="pointer-events-auto border flex flex-col outline-none animate-scale-in select-none text-left"
          >
            <Dialog.Title className="sr-only">{modalTitle}</Dialog.Title>
            <form onSubmit={handleSubmit} className="flex flex-col p-5">
              {/* 1. Modal Header (Breadcrumb & Close) */}
              <div className="flex items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <div className="inline-flex h-[24px] items-center gap-1.5 rounded-full bg-[var(--item-hover-bg)] px-2.5 text-[12px] font-medium text-[var(--text-tertiary)]">
                    <span>Rules</span>
                  </div>
                  <span className="text-[13px] text-[var(--text-muted)]">›</span>
                  <span className="text-[13px] font-[450] text-[var(--text-primary)]">{modalTitle}</span>
                </div>

                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Close"
                    className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-full text-[var(--text-tertiary)] transition-colors hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] outline-none cursor-pointer"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M2.97 2.97a.75.75 0 0 1 1.06 0L8 6.94l3.97-3.97a.75.75 0 1 1 1.06 1.06L9.06 8l3.97 3.97a.75.75 0 1 1-1.06 1.06L8 9.06l-3.97 3.97a.75.75 0 0 1-1.06-1.06L6.94 8 2.97 4.03a.75.75 0 0 1 0-1.06Z" />
                    </svg>
                  </button>
                </Dialog.Close>
              </div>

              {/* 2. Rule Name */}
              <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Rule name"
                aria-label="Rule name"
                className="w-full bg-transparent text-[18px] font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none mb-4"
              />

              {/* 3. Property Pills Row */}
              <div className="flex flex-wrap items-center gap-1.5 pb-4 border-b border-[var(--color-border-primary)]">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={PILL_CLASS}>
                      <span className="text-[var(--text-tertiary)]">Applies to:</span>
                      <span className="text-[var(--text-primary)]">
                        {RULE_LEVEL_LABELS[level]}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={4}>
                    {LEVELS.map((value) => (
                      <DropdownMenuItem key={value} onClick={() => changeLevel(value)}>
                        <span>
                          {RULE_LEVEL_LABELS[value]} — {LEVEL_DESCRIPTIONS[value]}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={PILL_CLASS}>
                      <span className="text-[var(--text-tertiary)]">Action:</span>
                      <span className="text-[var(--text-primary)]">{describeAction(action)}</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={4}>
                    {availableActions.map((value) => (
                      <DropdownMenuItem key={value} onClick={() => setAction(value)}>
                        <span>{describeAction(value)}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Group membership is changed from the rule row; editing here
                    would need a second write the save button does not make. */}
                {!isEditing && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={PILL_CLASS}>
                      <span className="text-[var(--text-tertiary)]">Group:</span>
                      <span className="text-[var(--text-primary)]">
                        {selectedGroup ? selectedGroup.name : 'Unassigned'}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={4}>
                    <DropdownMenuItem onClick={() => setSelectedGroupId('')}>
                      <span>Unassigned</span>
                    </DropdownMenuItem>
                    {ruleGroups.map((group) => (
                      <DropdownMenuItem key={group.id} onClick={() => setSelectedGroupId(group.id)}>
                        <span>{group.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={PILL_CLASS}>
                      <span className="text-[var(--text-tertiary)]">Window:</span>
                      <span className="text-[var(--text-primary)]">
                        {RULE_TIME_WINDOW_LABELS[timeWindow]}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={4}>
                    {TIME_WINDOWS.map((value) => (
                      <DropdownMenuItem key={value} onClick={() => setTimeWindow(value)}>
                        <span>{RULE_TIME_WINDOW_LABELS[value]}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={PILL_CLASS}>
                      <span className="text-[var(--text-tertiary)]">Check:</span>
                      <span className="text-[var(--text-primary)]">{formatInterval(checkInterval)}</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={4}>
                    {CHECK_INTERVALS.map((value) => (
                      <DropdownMenuItem key={value} onClick={() => setCheckInterval(value)}>
                        <span>{formatInterval(value)}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* 4. Budget parameters — only meaningful for a budget action */}
              {isBudgetAction && (
                <div className="flex flex-wrap items-center gap-3 py-3.5 border-b border-[var(--color-border-primary)]">
                  <label className="flex items-center gap-2">
                    <span className="text-[12px] text-[var(--text-secondary)]">Change by</span>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      step="1"
                      value={budgetChangePercent}
                      onChange={(e) => setBudgetChangePercent(e.target.value)}
                      className={`${FIELD_CLASS} w-[90px]`}
                    />
                    <span className="text-[12px] text-[var(--text-tertiary)]">%</span>
                  </label>

                  {action === 'increase_budget' && (
                    <label className="flex items-center gap-2">
                      <span className="text-[12px] text-[var(--text-secondary)]">
                        Daily ceiling
                      </span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={budgetMaxDaily}
                        onChange={(e) => setBudgetMaxDaily(e.target.value)}
                        placeholder="Required"
                        className={`${FIELD_CLASS} w-[120px]`}
                      />
                      <span className="text-[12px] text-[var(--text-tertiary)]">
                        in the account currency
                      </span>
                    </label>
                  )}
                </div>
              )}

              {/* 5. Conditions Builder */}
              <div className="py-3.5 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-[var(--text-secondary)]">
                    Conditions
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className={PILL_CLASS}>
                        <span className="text-[var(--text-primary)]">
                          {conditionLogic === 'and'
                            ? 'All conditions must match'
                            : 'Any condition may match'}
                        </span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={4}>
                      <DropdownMenuItem onClick={() => setConditionLogic('and')}>
                        <span>All conditions must match</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setConditionLogic('or')}>
                        <span>Any condition may match</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex flex-col gap-2">
                  {conditions.map((condition, index) => (
                    <div
                      key={index}
                      className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[var(--color-border-primary)] bg-[var(--bg-canvas)] p-2"
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={`${FIELD_CLASS} inline-flex items-center justify-between hover:bg-[var(--item-active-bg)]`}
                          >
                            <span>{RULE_METRIC_LABELS[condition.metric]}</span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" sideOffset={4}>
                          {METRICS.map((value) => (
                            <DropdownMenuItem
                              key={value}
                              onClick={() => updateCondition(index, { metric: value })}
                            >
                              <span>{RULE_METRIC_LABELS[value]}</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={`${FIELD_CLASS} inline-flex items-center justify-between hover:bg-[var(--item-active-bg)]`}
                          >
                            <span>
                              {OPERATORS.find((op) => op.value === condition.operator)?.label}
                            </span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" sideOffset={4}>
                          {OPERATORS.map((operator) => (
                            <DropdownMenuItem
                              key={operator.value}
                              onClick={() => updateCondition(index, { operator: operator.value })}
                            >
                              <span>{operator.label}</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <input
                        type="number"
                        min="0"
                        step={COUNT_METRICS.has(condition.metric) ? '1' : 'any'}
                        value={condition.value}
                        onChange={(e) => updateCondition(index, { value: e.target.value })}
                        placeholder="Value"
                        aria-label={`${RULE_METRIC_LABELS[condition.metric]} value`}
                        className={`${FIELD_CLASS} w-[110px]`}
                      />

                      {conditions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeCondition(index)}
                          aria-label={`Remove condition ${index + 1}`}
                          className="ml-auto inline-flex h-[28px] items-center rounded-[6px] px-2 text-[12px] text-[var(--text-tertiary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addCondition}
                  disabled={conditions.length >= 20}
                  className="self-start text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + Add condition
                </button>
              </div>

              {submitError && (
                <p
                  role="alert"
                  className="mb-2 text-[12px]"
                  style={{ color: 'var(--rules-action-stop-text)' }}
                >
                  {submitError}
                </p>
              )}

              {/* 6. Modal Footer Actions */}
              <div className="flex items-center justify-end pt-3 border-t border-[var(--color-border-primary)] mt-2">
                <div className="flex items-center gap-3">
                  {!isEditing && (
                    <FormCheckbox
                      checked={createMore}
                      onChange={setCreateMore}
                      label="Create more"
                    />
                  )}

                  <Button
                    type="submit"
                    variant="primary"
                    size="compact"
                    disabled={!canSubmit}
                  >
                    {submitLabel}
                  </Button>
                </div>
              </div>
            </form>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
