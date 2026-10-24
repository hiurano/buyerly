import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Maximize2, Minimize2, Repeat } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import { Button } from '@/ui/Button';
import { BuyerlyToggle } from '@/ui/BuyerlyToggle';
import { Tooltip } from '@/ui/Tooltip';
import { useMediaQuery, TOUCH_HEIGHT_CLASS as TOUCH_HEIGHT } from '@/lib/useMediaQuery';
import {
  RULE_LEVEL_LABELS,
  RULE_TIME_WINDOW_HINTS,
  RULE_TIME_WINDOW_MENU_LABELS,
  checkRuleDraft,
  fetchRuleDraftPreview,
  type RuleAccountPreview,
} from '@/lib/rules';
import { BuyerlyBoltIcon, BuyerlyClockOutlineIcon, BuyerlyLabelIcon, BuyerlyPlusIcon } from '@/icons/BuyerlyIcons';
import { RuleLabelPicker } from './RuleLabelPicker';
import { CHIP_CLASS, ConditionChip, RunOnPicker } from './RuleWindowParts';
import {
  BUDGET_ACTIONS,
  CHECK_INTERVALS,
  DEFAULT_CONDITION,
  MAX_CONDITIONS,
  REPEAT_INTERVALS,
  RULE_LEVELS,
  RULE_WINDOWS,
  actionLabel,
  autoRuleName,
  availableActions,
  describeDraft,
  draftAttachments,
  draftCurrency,
  draftFromPreset,
  draftProblems,
  draftStorageKey,
  draftToPayload,
  emptyDraft,
  formatCheckInterval,
  formatRepeat,
  readStoredDraft,
  sameRunOn,
  withLevel,
  writeStoredDraft,
  type ConditionDraft,
  type RuleDraft,
  type RunOnAccount,
} from './ruleDraft';
import { useScopeStore, scopeStore } from '@/models/scopeStore';
import { useDialogStore } from '@/models/dialogStore';
import { useRulesStore } from '@/models/rulesStore';

const LEVEL_HINTS = {
  adset: 'Each ad set on its own',
  campaign: 'The campaign as a whole',
  ad: 'A single ad, leaving its ad set running',
} as const;

const FIELD_CLASS =
  `h-[24px] ${TOUCH_HEIGHT} w-[64px] rounded-[6px] border border-[var(--color-border-secondary)] bg-transparent px-2 text-[12px] font-medium tabular-nums text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--action-primary)]`;

const LINE_LABEL = 'w-[44px] shrink-0 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-tertiary)]';

type Popover = 'labels' | 'runOn' | null;

/**
 * The rule window (#387), as Linear's New issue: a name, then the rule as it
 * is thought — WHEN the level has all or any of these conditions over this
 * window, THEN this action — then where it runs, its labels and how often,
 * and one sentence saying what it will do. It creates the rule where it runs
 * in one write and edits it the same way. Ctrl/Cmd+Enter saves; Escape closes
 * and keeps an unsaved new rule as a draft for next time.
 */
export const CreateRuleModal: React.FC = () => {
  const isCreateRuleModalOpen = useDialogStore((state) => state.isCreateRuleModalOpen);
  const createRuleTargetLabelId = useDialogStore((state) => state.createRuleTargetLabelId);
  const createRulePrefill = useDialogStore((state) => state.createRulePrefill);
  const editingRuleId = useDialogStore((state) => state.editingRuleId);
  const closeCreateRuleModal = useDialogStore((state) => state.closeCreateRuleModal);
  const addRule = useRulesStore((state) => state.addRule);
  const updateRule = useRulesStore((state) => state.updateRule);
  const rules = useRulesStore((state) => state.rules);
  const ruleLabels = useRulesStore((state) => state.ruleLabels);
  const ruleAccounts = useRulesStore((state) => state.ruleAccounts);
  const rulesLoadState = useRulesStore((state) => state.rulesLoadState);
  const loadRules = useRulesStore((state) => state.loadRules);
  const createRuleLabel = useRulesStore((state) => state.createRuleLabel);
  const workspaceSlug = useScopeStore((state) => state.workspaceSlug);

  const editedRule = editingRuleId ? rules.find((rule) => rule.id === editingRuleId) : undefined;
  const isEditing = Boolean(editedRule);
  const storageKey = draftStorageKey(workspaceSlug ?? 'workspace');
  const phone = useMediaQuery('(max-width: 640px)');

  const [draft, setDraft] = useState<RuleDraft>(emptyDraft);
  const [initialRunOn, setInitialRunOn] = useState<RuleDraft['runOn']>({});
  const [restored, setRestored] = useState(false);
  const [popover, setPopover] = useState<Popover>(null);
  const [expanded, setExpanded] = useState(false);
  const [createMore, setCreateMore] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [serverProblem, setServerProblem] = useState('');
  const [previews, setPreviews] = useState<Record<string, RuleAccountPreview | 'loading' | 'error'>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const update = useCallback((patch: Partial<RuleDraft>) => setDraft((current) => ({ ...current, ...patch })), []);

  // The window works from anywhere (Ads Manager's "Apply rule…" too), so it
  // reads ad accounts and labels itself when Rules has not yet.
  useEffect(() => {
    if (isCreateRuleModalOpen && rulesLoadState === 'idle') void loadRules();
  }, [isCreateRuleModalOpen, loadRules, rulesLoadState]);

  useEffect(() => {
    if (!isCreateRuleModalOpen) return;
    setPopover(null);
    setSubmitError('');
    setServerProblem('');
    setTouched(false);
    setCreateMore(false);
    if (editedRule) {
      const loaded = draftFromPreset(editedRule.preset, editedRule.labelIds);
      setDraft(loaded);
      setInitialRunOn(loaded.runOn);
      setRestored(false);
      return;
    }
    const stored = readStoredDraft(storageKey);
    const start = stored ?? emptyDraft();
    if (createRuleTargetLabelId && !start.labelIds.includes(createRuleTargetLabelId)) {
      start.labelIds = [...start.labelIds, createRuleTargetLabelId];
    }
    // Opened on a selection in Ads Manager: it runs there to begin with.
    if (createRulePrefill) start.runOn = { [createRulePrefill.accountId]: createRulePrefill.scope };
    setDraft(start);
    setInitialRunOn({});
    setRestored(Boolean(stored));
  }, [isCreateRuleModalOpen, editingRuleId, createRuleTargetLabelId, createRulePrefill]);

  const accounts: RunOnAccount[] = useMemo(() => ruleAccounts.map((account) => ({
    account_id: account.account_id,
    name: account.custom_name?.trim() || account.name || account.account_id,
    currency: account.currency,
  })), [ruleAccounts]);
  const currency = draftCurrency(draft, accounts);
  const problems = draftProblems(draft);
  const payload = draftToPayload(draft, ruleLabels.map((label) => label.id));
  const payloadKey = payload ? JSON.stringify({ ...payload, name: '', label_ids: [] }) : '';

  // The server's own checks — a contradiction, a missing ceiling — show
  // while the rule is still being written, not after the click.
  useEffect(() => {
    if (!isCreateRuleModalOpen || !payload) {
      setServerProblem('');
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const { label_ids: _labels, attachments: _attachments, ...rule } = payload;
      void checkRuleDraft(rule)
        .then(() => { if (!cancelled) setServerProblem(''); })
        .catch((error) => { if (!cancelled) setServerProblem(error instanceof Error ? error.message : 'This rule cannot be saved as set.'); });
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [isCreateRuleModalOpen, payloadKey]);

  // What the rule would check on each whole account it runs on, and what matches now.
  const wholeAccounts = Object.entries(draft.runOn).filter(([, scope]) => scope.level === 'account').map(([id]) => id);
  const wholeKey = wholeAccounts.sort().join(',');
  useEffect(() => {
    if (!isCreateRuleModalOpen || !payload || wholeAccounts.length === 0) return undefined;
    let cancelled = false;
    const { label_ids: _labels, attachments: _attachments, ...rule } = payload;
    setPreviews((current) => ({ ...current, ...Object.fromEntries(wholeAccounts.map((id) => [id, 'loading' as const])) }));
    const timer = window.setTimeout(() => {
      for (const accountId of wholeAccounts) {
        void fetchRuleDraftPreview(accountId, rule)
          .then((preview) => { if (!cancelled) setPreviews((current) => ({ ...current, [accountId]: preview })); })
          .catch(() => { if (!cancelled) setPreviews((current) => ({ ...current, [accountId]: 'error' })); });
      }
    }, 450);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [isCreateRuleModalOpen, payloadKey, wholeKey]);

  const previewLine = (() => {
    const ready = wholeAccounts
      .map((id) => previews[id])
      .filter((preview): preview is RuleAccountPreview => Boolean(preview) && typeof preview === 'object');
    if (ready.length === 0 || ready.length !== wholeAccounts.length) return '';
    const noun = RULE_LEVEL_LABELS[draft.level].toLowerCase();
    const total = ready.reduce((sum, preview) => sum + preview.total, 0);
    const matching = ready.reduce((sum, preview) => sum + preview.matching, 0);
    return `Right now ${matching} of ${total} ${noun}${total === 1 ? '' : 's'} match on the whole account${ready.length === 1 ? '' : 's'}.`;
  })();

  const closeWindow = () => {
    // An unsaved new rule comes back next time, as Linear keeps an unsent issue.
    if (!isEditing) writeStoredDraft(storageKey, draft);
    closeCreateRuleModal();
  };

  const discardDraft = () => {
    writeStoredDraft(storageKey, null);
    const fresh = emptyDraft();
    if (createRulePrefill) fresh.runOn = { [createRulePrefill.accountId]: createRulePrefill.scope };
    setDraft(fresh);
    setRestored(false);
    setTouched(false);
    nameRef.current?.focus();
  };

  const blockers = serverProblem ? [...problems, serverProblem] : problems;
  const canSubmit = Boolean(payload) && !serverProblem && !isSubmitting;
  const submitLabel = isSubmitting
    ? (isEditing ? 'Saving…' : 'Creating…')
    : (isEditing ? 'Save changes' : 'Create rule');

  const submit = async () => {
    setTouched(true);
    if (!canSubmit || !payload) return;
    const current = scopeStore.captureScope();
    if (!current()) return;
    setIsSubmitting(true);
    setSubmitError('');
    const runOnChanged = !sameRunOn(initialRunOn, draft.runOn);
    // Editing keeps the rule's own on/off state.
    const edit = editedRule ? {
      id: editedRule.id,
      rule: {
        ...payload,
        enabled: editedRule.preset.enabled,
        ...(runOnChanged ? { attachments: draftAttachments(draft) } : {}),
      },
    } : null;
    try {
      if (edit) {
        await updateRule(edit.id, edit.rule);
        if (!current()) return;
        closeCreateRuleModal();
      } else {
        await addRule({ ...payload, attachments: draftAttachments(draft) });
        if (!current()) return;
        writeStoredDraft(storageKey, null);
        setRestored(false);
        if (createMore) {
          // The next rule starts where this one runs, as Linear keeps the team.
          setDraft({ ...emptyDraft(), runOn: draft.runOn, labelIds: draft.labelIds });
          setTouched(false);
          if (nameRef.current) nameRef.current.focus();
        } else {
          closeCreateRuleModal();
        }
      }
    } catch (error) {
      if (!current()) return;
      setSubmitError(error instanceof Error ? error.message : (isEditing ? 'Could not save the rule.' : 'Could not create the rule.'));
    }
    // Every early return above is out of scope, where this does nothing either.
    if (current()) setIsSubmitting(false);
  };

  const setCondition = (index: number, patch: Partial<ConditionDraft>) =>
    update({ conditions: draft.conditions.map((condition, i) => (i === index ? { ...condition, ...patch } : condition)) });

  const chosenLabels = ruleLabels.filter((label) => draft.labelIds.includes(label.id));
  const runOnEntries = Object.entries(draft.runOn);
  const runOnText = runOnEntries.length === 0
    ? 'Run on'
    : runOnEntries.length === 1
      ? accounts.find((account) => account.account_id === runOnEntries[0][0])?.name ?? runOnEntries[0][0]
      : `${runOnEntries.length} ad accounts`;
  const isBudget = BUDGET_ACTIONS.has(draft.action);
  const noun = RULE_LEVEL_LABELS[draft.level].toLowerCase();
  const title = isEditing ? 'Edit rule' : 'New rule';

  return (
    <Dialog.Root open={isCreateRuleModalOpen} onOpenChange={(open) => !open && closeWindow()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[500] bg-black/40 animate-fade-in" />
        <div className={`pointer-events-none fixed inset-0 z-[501] flex justify-center overflow-y-auto ${phone ? 'items-stretch' : 'items-start p-3 pt-[13vh]'}`}>
          <Dialog.Content
            aria-describedby={undefined}
            onEscapeKeyDown={(event) => {
              // Escape closes an open picker first, then the window.
              if (popover || document.querySelector('[data-rule-window-popover]')) {
                event.preventDefault();
                setPopover(null);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void submit();
              }
            }}
            style={phone ? {
              width: '100%',
              minHeight: '100dvh',
              backgroundColor: 'var(--card-bg)',
            } : {
              width: '100%',
              maxWidth: expanded ? '1040px' : '750px',
              minHeight: expanded ? '70vh' : undefined,
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--color-border-secondary)',
              borderRadius: '21px',
              boxShadow:
                '0px 4px 40px 0px rgba(0,0,0,0.1), 0px 3px 20px 0px rgba(0,0,0,0.125), 0px 3px 12px 0px rgba(0,0,0,0.125), 0px 2px 8px 0px rgba(0,0,0,0.125), 0px 1px 1px 0px rgba(0,0,0,0.125)',
            }}
            className={`pointer-events-auto flex flex-col text-left outline-none ${phone ? '' : 'border animate-scale-in'}`}
          >
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
            <form
              onSubmit={(event) => { event.preventDefault(); void submit(); }}
              className="flex flex-1 flex-col"
            >
              <div className={`flex flex-1 flex-col ${phone ? 'px-4 pt-3' : 'px-5 pt-4'}`}>
                {/* Header: "Rules › New rule", ⤢ and ×. */}
                <div className="flex items-center justify-between pb-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-[24px] items-center rounded-full bg-[var(--item-hover-bg)] px-2.5 text-[12px] font-medium text-[var(--text-tertiary)]">Rules</span>
                    <span className="text-[13px] text-[var(--text-muted)]">›</span>
                    <span className="text-[13px] font-[450] text-[var(--text-primary)]">{title}</span>
                    {restored && (
                      <span className="text-[12px] text-[var(--text-tertiary)]">· Draft</span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5">
                    {!phone && (
                      <Tooltip content={expanded ? 'Collapse' : 'Expand'}>
                        <button
                          type="button"
                          aria-label={expanded ? 'Collapse window' : 'Expand window'}
                          onClick={() => setExpanded((value) => !value)}
                          className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-full text-[var(--text-tertiary)] transition-colors hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] outline-none"
                        >
                          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        </button>
                      </Tooltip>
                    )}
                    <button
                      type="button"
                      aria-label="Close"
                      onClick={closeWindow}
                      className="inline-flex h-[28px] w-[28px] [@media(hover:none)_and_(pointer:coarse)]:h-10 [@media(hover:none)_and_(pointer:coarse)]:w-10 items-center justify-center rounded-full text-[var(--text-tertiary)] transition-colors hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] outline-none"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                        <path d="M2.97 2.97a.75.75 0 0 1 1.06 0L8 6.94l3.97-3.97a.75.75 0 1 1 1.06 1.06L9.06 8l3.97 3.97a.75.75 0 1 1-1.06 1.06L8 9.06l-3.97 3.97a.75.75 0 0 1-1.06-1.06L6.94 8 2.97 4.03a.75.75 0 0 1 0-1.06Z" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* The name: optional; left empty, it is made from the rule and shown as the hint. */}
                <input
                  ref={nameRef}
                  type="text"
                  autoFocus
                  value={draft.name}
                  maxLength={120}
                  onChange={(event) => update({ name: event.target.value })}
                  placeholder={autoRuleName(draft)}
                  aria-label="Rule name"
                  className="mb-3 w-full bg-transparent text-[18px] font-semibold text-[var(--text-primary)] outline-none placeholder:font-semibold placeholder:text-[var(--text-muted)]"
                />

                {/* WHEN [level] has [all] of [conditions] [+ Condition] [window] */}
                <div className="flex flex-wrap items-center gap-1.5 pb-2" role="group" aria-label="When">
                  <span className={LINE_LABEL}>When</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className={CHIP_CLASS} aria-label={`Level: ${RULE_LEVEL_LABELS[draft.level]}`}>
                        {RULE_LEVEL_LABELS[draft.level]}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={4}>
                      {RULE_LEVELS.map((level) => (
                        <DropdownMenuItem key={level} className="!h-auto py-[5px]" onClick={() => setDraft((current) => withLevel(current, level))}>
                          <span className="flex flex-col leading-[17px]">
                            <span>{RULE_LEVEL_LABELS[level]}</span>
                            <span className="text-[12px] text-[var(--text-tertiary)]">{LEVEL_HINTS[level]}</span>
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <span className="text-[12px] text-[var(--text-tertiary)]">has</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className={CHIP_CLASS} aria-label={`Match: ${draft.logic === 'and' ? 'all' : 'any'}`}>
                        {draft.logic === 'and' ? 'all' : 'any'}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={4}>
                      <DropdownMenuItem onClick={() => update({ logic: 'and' })}><span>all — every condition must match</span></DropdownMenuItem>
                      <DropdownMenuItem onClick={() => update({ logic: 'or' })}><span>any — one condition is enough</span></DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <span className="text-[12px] text-[var(--text-tertiary)]">of</span>
                  {draft.conditions.map((condition, index) => (
                    <ConditionChip
                      // eslint-disable-next-line react/no-array-index-key
                      key={index}
                      index={index}
                      condition={condition}
                      currency={currency}
                      removable={draft.conditions.length > 1}
                      showProblem={touched || condition.value.trim() !== ''}
                      onChange={(patch) => setCondition(index, patch)}
                      onRemove={() => update({ conditions: draft.conditions.filter((_, i) => i !== index) })}
                    />
                  ))}
                  {draft.conditions.length < MAX_CONDITIONS && (
                    <button
                      type="button"
                      className={`${CHIP_CLASS} border-dashed`}
                      onClick={() => update({ conditions: [...draft.conditions, { ...DEFAULT_CONDITION, metric: 'leads', operator: 'eq' }] })}
                    >
                      <BuyerlyPlusIcon size={12} />
                      Condition
                    </button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className={CHIP_CLASS} aria-label={`Window: ${RULE_TIME_WINDOW_MENU_LABELS[draft.timeWindow]}`}>
                        <BuyerlyClockOutlineIcon size={12} />
                        {RULE_TIME_WINDOW_MENU_LABELS[draft.timeWindow]}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={4}>
                      <DropdownMenuLabel>Period the conditions read</DropdownMenuLabel>
                      {RULE_WINDOWS.map((value) => {
                        const hint = RULE_TIME_WINDOW_HINTS[value];
                        return (
                          <DropdownMenuItem
                            key={value}
                            data-testid={`rule-window-${value}`}
                            className={hint ? '!h-auto py-[5px]' : ''}
                            onClick={() => update({ timeWindow: value })}
                          >
                            <span className="flex flex-col leading-[17px]">
                              <span>{RULE_TIME_WINDOW_MENU_LABELS[value]}</span>
                              {hint && <span className="text-[12px] text-[var(--text-tertiary)]">{hint}</span>}
                            </span>
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* THEN [action] (by [20]% · up to [300] a day) */}
                <div className="flex flex-wrap items-center gap-1.5 pb-3" role="group" aria-label="Then">
                  <span className={LINE_LABEL}>Then</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className={CHIP_CLASS} aria-label={`Action: ${actionLabel(draft.action, draft.level)}`}>
                        {actionLabel(draft.action, draft.level)}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={4}>
                      {availableActions(draft.level).map((action) => (
                        <DropdownMenuItem key={action} onClick={() => update({ action })}>
                          <span>{actionLabel(action, draft.level)}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {isBudget && (
                    <>
                      <span className="text-[12px] text-[var(--text-tertiary)]">by</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={draft.budgetPercent}
                        aria-label="Change by, percent"
                        onChange={(event) => update({ budgetPercent: event.target.value })}
                        className={FIELD_CLASS}
                      />
                      <span className="text-[12px] text-[var(--text-tertiary)]">%</span>
                      {draft.action === 'increase_budget' && (
                        <>
                          <span className="text-[12px] text-[var(--text-tertiary)]">· up to</span>
                          {currency && <span className="text-[11px] text-[var(--text-tertiary)]">{currency}</span>}
                          <input
                            type="text"
                            inputMode="decimal"
                            value={draft.budgetMax}
                            placeholder="ceiling"
                            aria-label="Daily ceiling"
                            onChange={(event) => update({ budgetMax: event.target.value })}
                            className={`${FIELD_CLASS} w-[80px]`}
                          />
                          <span className="text-[12px] text-[var(--text-tertiary)]">a day</span>
                        </>
                      )}
                    </>
                  )}
                </div>

                {/* Run on · Labels · Check · Repeat */}
                <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--color-border-primary)] pt-3">
                  <div className="relative">
                    <button
                      type="button"
                      className={CHIP_CLASS}
                      aria-expanded={popover === 'runOn'}
                      aria-label={`Run on: ${runOnEntries.length ? runOnText : 'nowhere yet'}`}
                      data-popover-trigger="Run on"
                      onClick={() => setPopover((current) => (current === 'runOn' ? null : 'runOn'))}
                    >
                      <BuyerlyBoltIcon size={12} />
                      <span className={runOnEntries.length ? 'text-[var(--text-primary)]' : ''}>{runOnText}</span>
                    </button>
                    {popover === 'runOn' && (
                      <RunOnPicker
                        accounts={accounts}
                        runOn={draft.runOn}
                        previews={previews}
                        levelNoun={noun}
                        onChange={(runOn) => update({ runOn })}
                        onClose={() => setPopover(null)}
                      />
                    )}
                  </div>

                  {/* Linear's Labels chip: several at once, a new one made in place (#383). */}
                  <div className="relative">
                    <button
                      type="button"
                      className={CHIP_CLASS}
                      data-label-picker-trigger=""
                      aria-expanded={popover === 'labels'}
                      onClick={() => setPopover((current) => (current === 'labels' ? null : 'labels'))}
                    >
                      {chosenLabels.length === 0 ? (
                        <>
                          <BuyerlyLabelIcon size={12} />
                          <span>Labels</span>
                        </>
                      ) : (
                        <>
                          <span className="flex items-center" aria-hidden="true">
                            {chosenLabels.slice(0, 4).map((label, index) => (
                              <span
                                key={label.id}
                                className="block h-[9px] w-[9px] rounded-full"
                                style={{ backgroundColor: label.color, marginLeft: index === 0 ? 0 : -3, boxShadow: '0 0 0 1.5px var(--card-bg)' }}
                              />
                            ))}
                          </span>
                          <span className="text-[var(--text-primary)]">
                            {chosenLabels.length === 1 ? chosenLabels[0].name : `${chosenLabels.length} labels`}
                          </span>
                        </>
                      )}
                    </button>
                    {popover === 'labels' && (
                      <RuleLabelPicker
                        inline
                        placeholder="Add labels…"
                        checked={draft.labelIds}
                        onToggle={(id, on) => update({
                          labelIds: on ? [...draft.labelIds, id] : draft.labelIds.filter((item) => item !== id),
                        })}
                        onCreate={async (labelName) => {
                          try {
                            const label = await createRuleLabel(labelName);
                            setDraft((current) => ({ ...current, labelIds: [...current.labelIds, label.id] }));
                          } catch (error) {
                            setSubmitError(error instanceof Error ? error.message : 'Could not create the label.');
                          }
                        }}
                        onClose={() => setPopover(null)}
                      />
                    )}
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className={CHIP_CLASS} aria-label={`Check: ${formatCheckInterval(draft.checkInterval)}`}>
                        <BuyerlyClockOutlineIcon size={12} />
                        {formatCheckInterval(draft.checkInterval)}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={4}>
                      <DropdownMenuLabel>How often the rule reads the metrics</DropdownMenuLabel>
                      {CHECK_INTERVALS.map((minutes) => (
                        <DropdownMenuItem key={minutes} onClick={() => update({ checkInterval: minutes })}>
                          <span>{formatCheckInterval(minutes)}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className={CHIP_CLASS} aria-label={`Repeat: ${formatRepeat(draft.repeatMinutes)}`}>
                        <Repeat size={12} />
                        {formatRepeat(draft.repeatMinutes)}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={4}>
                      <DropdownMenuLabel>How often it may act on the same {noun}</DropdownMenuLabel>
                      {REPEAT_INTERVALS.map((minutes) => (
                        <DropdownMenuItem key={minutes} onClick={() => update({ repeatMinutes: minutes })}>
                          <span>{formatRepeat(minutes)}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* What the rule will do, how often, when and where — in one sentence. */}
                <p data-testid="rule-summary" className="pt-3 text-[12px] leading-[18px] text-[var(--text-tertiary)]">
                  {describeDraft(draft, accounts)}
                  {previewLine && <> {previewLine}</>}
                </p>
                {(serverProblem || submitError) && (
                  <p role="alert" className="pt-2 text-[12px]" style={{ color: 'var(--rules-action-stop-text)' }}>
                    {submitError || serverProblem}
                  </p>
                )}
              </div>

              {/* Footer: Discard draft · Create more · Create rule. */}
              <div
                className={`mt-4 flex items-center justify-between gap-3 border-t border-[var(--color-border-primary)] ${phone ? 'sticky bottom-0 bg-[var(--card-bg)] px-4 py-3' : 'px-5 py-3'}`}
              >
                <div>
                  {restored && !isEditing && (
                    <button
                      type="button"
                      onClick={discardDraft}
                      className={`h-[28px] ${TOUCH_HEIGHT} rounded-[6px] px-2 text-[12px] text-[var(--text-tertiary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]`}
                    >
                      Discard draft
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {!isEditing && (
                    <label className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                      <BuyerlyToggle checked={createMore} onChange={setCreateMore} label="Create more" />
                      <span aria-hidden="true">Create more</span>
                    </label>
                  )}
                  <Tooltip content={canSubmit ? (navigator.platform.includes('Mac') ? '⌘ Enter' : 'Ctrl Enter') : (blockers[0] ?? '')}>
                    <span className="inline-flex">
                      <Button
                        type="submit"
                        variant="primary"
                        size="compact"
                        className={TOUCH_HEIGHT}
                        disabled={!canSubmit}
                        aria-describedby={canSubmit ? undefined : 'rule-window-blockers'}
                      >
                        {submitLabel}
                      </Button>
                    </span>
                  </Tooltip>
                  {!canSubmit && blockers.length > 0 && (
                    <span id="rule-window-blockers" className="sr-only">{blockers.join('. ')}</span>
                  )}
                </div>
              </div>
            </form>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

