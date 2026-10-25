import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
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
import { useMediaQuery } from '@/lib/useMediaQuery';
import { withClassName } from '@/ui/withClassName';
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
import { BuyerlyRuleChip, ConditionChip, RunOnPicker } from './RuleWindowParts';
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

/** On a touch screen a control a finger taps is at least 40px tall. */
const TOUCH = '@media (hover: none) and (pointer: coarse)';

const colorTransition = {
  transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
  transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
  transitionDuration: '150ms',
} as const;

const styles = stylex.create({
  overlay: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 500,
    backgroundColor: 'rgb(0 0 0 / 0.4)',
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
    overflowY: 'auto',
    alignItems: 'flex-start',
    paddingTop: '13vh',
    paddingRight: 12,
    paddingBottom: 12,
    paddingLeft: 12,
  },
  framePhone: {
    alignItems: 'stretch',
    paddingTop: null,
    paddingRight: null,
    paddingBottom: null,
    paddingLeft: null,
  },
  content: {
    pointerEvents: 'auto',
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'left',
    outline: '2px solid transparent',
    outlineOffset: 2,
    width: '100%',
    maxWidth: 750,
    backgroundColor: colors['--card-bg'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    borderRadius: 21,
    boxShadow:
      '0px 4px 40px 0px rgba(0,0,0,0.1), 0px 3px 20px 0px rgba(0,0,0,0.125), 0px 3px 12px 0px rgba(0,0,0,0.125), 0px 2px 8px 0px rgba(0,0,0,0.125), 0px 1px 1px 0px rgba(0,0,0,0.125)',
  },
  contentExpanded: {
    maxWidth: 1040,
    minHeight: '70vh',
  },
  contentPhone: {
    maxWidth: null,
    minHeight: '100dvh',
    borderWidth: null,
    borderStyle: null,
    borderColor: null,
    borderRadius: null,
    boxShadow: null,
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    marginTop: -1,
    marginRight: -1,
    marginBottom: -1,
    marginLeft: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  form: {
    display: 'flex',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    flexDirection: 'column',
  },
  body: {
    display: 'flex',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    flexDirection: 'column',
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 16,
  },
  bodyPhone: {
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 12,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  crumbs: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  crumbTeam: {
    display: 'inline-flex',
    height: 24,
    alignItems: 'center',
    borderRadius: 9999,
    backgroundColor: colors['--item-hover-bg'],
    paddingLeft: 10,
    paddingRight: 10,
    fontSize: 12,
    fontWeight: 500,
    color: colors['--text-tertiary'],
  },
  crumbSeparator: {
    fontSize: 13,
    color: colors['--text-muted'],
  },
  crumbTitle: {
    fontSize: 13,
    fontWeight: 450,
    color: colors['--text-primary'],
  },
  windowButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  windowButton: {
    ...colorTransition,
    display: 'inline-flex',
    height: 28,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
    },
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
    outline: '2px solid transparent',
    outlineOffset: 2,
  },
  closeButton: {
    height: {
      default: 28,
      [TOUCH]: 40,
    },
    width: {
      default: 28,
      [TOUCH]: 40,
    },
  },
  name: {
    marginBottom: 12,
    width: '100%',
    backgroundColor: 'transparent',
    fontSize: 18,
    fontWeight: 600,
    color: colors['--text-primary'],
    outline: '2px solid transparent',
    outlineOffset: 2,
    '::placeholder': {
      fontWeight: 600,
      color: colors['--text-muted'],
    },
  },
  line: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  whenLine: {
    paddingBottom: 8,
  },
  thenLine: {
    paddingBottom: 12,
  },
  settingsLine: {
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderColor: colors['--color-border-primary'],
    paddingTop: 12,
  },
  lineLabel: {
    width: 44,
    flexShrink: 0,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: colors['--text-tertiary'],
  },
  word: {
    fontSize: 12,
    color: colors['--text-tertiary'],
  },
  currency: {
    fontSize: 11,
    color: colors['--text-tertiary'],
  },
  hintedItem: {
    height: 'auto',
    paddingTop: 5,
    paddingBottom: 5,
  },
  hintedText: {
    display: 'flex',
    flexDirection: 'column',
    lineHeight: '17px',
  },
  field: {
    height: {
      default: 24,
      [TOUCH]: 40,
    },
    width: 64,
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: {
      default: colors['--color-border-secondary'],
      ':focus': colors['--action-primary'],
    },
    backgroundColor: 'transparent',
    paddingLeft: 8,
    paddingRight: 8,
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
  fieldWide: {
    width: 80,
  },
  anchor: {
    position: 'relative',
  },
  chosen: {
    color: colors['--text-primary'],
  },
  dots: {
    display: 'flex',
    alignItems: 'center',
  },
  dot: {
    display: 'block',
    height: 9,
    width: 9,
    borderRadius: 9999,
  },
  summary: {
    paddingTop: 12,
    fontSize: 12,
    lineHeight: '18px',
    color: colors['--text-tertiary'],
  },
  problem: {
    paddingTop: 8,
    fontSize: 12,
    color: colors['--rules-action-stop-text'],
  },
  footer: {
    marginTop: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderColor: colors['--color-border-primary'],
    paddingTop: 12,
    paddingRight: 20,
    paddingBottom: 12,
    paddingLeft: 20,
  },
  footerPhone: {
    position: 'sticky',
    bottom: 0,
    backgroundColor: colors['--card-bg'],
    paddingRight: 16,
    paddingLeft: 16,
  },
  discard: {
    height: {
      default: 28,
      [TOUCH]: 40,
    },
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
  submitRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  createMore: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: colors['--text-secondary'],
  },
  submitAnchor: {
    display: 'inline-flex',
  },
});

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
        <Dialog.Overlay {...stylex.props(styles.overlay)} />
        <div {...stylex.props(styles.frame, phone && styles.framePhone)}>
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
            {...withClassName(
              stylex.props(styles.content, expanded && styles.contentExpanded, phone && styles.contentPhone),
              phone ? undefined : 'animate-scale-in',
            )}
          >
            <Dialog.Title {...stylex.props(styles.srOnly)}>{title}</Dialog.Title>
            <form
              onSubmit={(event) => { event.preventDefault(); void submit(); }}
              {...stylex.props(styles.form)}
            >
              <div {...stylex.props(styles.body, phone && styles.bodyPhone)}>
                {/* Header: "Rules › New rule", ⤢ and ×. */}
                <div {...stylex.props(styles.header)}>
                  <div {...stylex.props(styles.crumbs)}>
                    <span {...stylex.props(styles.crumbTeam)}>Rules</span>
                    <span {...stylex.props(styles.crumbSeparator)}>›</span>
                    <span {...stylex.props(styles.crumbTitle)}>{title}</span>
                    {restored && (
                      <span {...stylex.props(styles.word)}>· Draft</span>
                    )}
                  </div>
                  <div {...stylex.props(styles.windowButtons)}>
                    {!phone && (
                      <Tooltip content={expanded ? 'Collapse' : 'Expand'}>
                        <button
                          type="button"
                          aria-label={expanded ? 'Collapse window' : 'Expand window'}
                          onClick={() => setExpanded((value) => !value)}
                          {...stylex.props(styles.windowButton)}
                        >
                          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        </button>
                      </Tooltip>
                    )}
                    <button
                      type="button"
                      aria-label="Close"
                      onClick={closeWindow}
                      {...stylex.props(styles.windowButton, styles.closeButton)}
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
                  {...stylex.props(styles.name)}
                />

                {/* WHEN [level] has [all] of [conditions] [+ Condition] [window] */}
                <div {...stylex.props(styles.line, styles.whenLine)} role="group" aria-label="When">
                  <span {...stylex.props(styles.lineLabel)}>When</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <BuyerlyRuleChip aria-label={`Level: ${RULE_LEVEL_LABELS[draft.level]}`}>
                        {RULE_LEVEL_LABELS[draft.level]}
                      </BuyerlyRuleChip>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={4}>
                      {RULE_LEVELS.map((level) => (
                        <DropdownMenuItem key={level} xstyle={styles.hintedItem} onClick={() => setDraft((current) => withLevel(current, level))}>
                          <span {...stylex.props(styles.hintedText)}>
                            <span>{RULE_LEVEL_LABELS[level]}</span>
                            <span {...stylex.props(styles.word)}>{LEVEL_HINTS[level]}</span>
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <span {...stylex.props(styles.word)}>has</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <BuyerlyRuleChip aria-label={`Match: ${draft.logic === 'and' ? 'all' : 'any'}`}>
                        {draft.logic === 'and' ? 'all' : 'any'}
                      </BuyerlyRuleChip>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={4}>
                      <DropdownMenuItem onClick={() => update({ logic: 'and' })}><span>all — every condition must match</span></DropdownMenuItem>
                      <DropdownMenuItem onClick={() => update({ logic: 'or' })}><span>any — one condition is enough</span></DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <span {...stylex.props(styles.word)}>of</span>
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
                    <BuyerlyRuleChip
                      dashed
                      onClick={() => update({ conditions: [...draft.conditions, { ...DEFAULT_CONDITION, metric: 'leads', operator: 'eq' }] })}
                    >
                      <BuyerlyPlusIcon size={12} />
                      Condition
                    </BuyerlyRuleChip>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <BuyerlyRuleChip aria-label={`Window: ${RULE_TIME_WINDOW_MENU_LABELS[draft.timeWindow]}`}>
                        <BuyerlyClockOutlineIcon size={12} />
                        {RULE_TIME_WINDOW_MENU_LABELS[draft.timeWindow]}
                      </BuyerlyRuleChip>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={4}>
                      <DropdownMenuLabel>Period the conditions read</DropdownMenuLabel>
                      {RULE_WINDOWS.map((value) => {
                        const hint = RULE_TIME_WINDOW_HINTS[value];
                        return (
                          <DropdownMenuItem
                            key={value}
                            data-testid={`rule-window-${value}`}
                            xstyle={hint ? styles.hintedItem : undefined}
                            onClick={() => update({ timeWindow: value })}
                          >
                            <span {...stylex.props(styles.hintedText)}>
                              <span>{RULE_TIME_WINDOW_MENU_LABELS[value]}</span>
                              {hint && <span {...stylex.props(styles.word)}>{hint}</span>}
                            </span>
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* THEN [action] (by [20]% · up to [300] a day) */}
                <div {...stylex.props(styles.line, styles.thenLine)} role="group" aria-label="Then">
                  <span {...stylex.props(styles.lineLabel)}>Then</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <BuyerlyRuleChip aria-label={`Action: ${actionLabel(draft.action, draft.level)}`}>
                        {actionLabel(draft.action, draft.level)}
                      </BuyerlyRuleChip>
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
                      <span {...stylex.props(styles.word)}>by</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={draft.budgetPercent}
                        aria-label="Change by, percent"
                        onChange={(event) => update({ budgetPercent: event.target.value })}
                        {...stylex.props(styles.field)}
                      />
                      <span {...stylex.props(styles.word)}>%</span>
                      {draft.action === 'increase_budget' && (
                        <>
                          <span {...stylex.props(styles.word)}>· up to</span>
                          {currency && <span {...stylex.props(styles.currency)}>{currency}</span>}
                          <input
                            type="text"
                            inputMode="decimal"
                            value={draft.budgetMax}
                            placeholder="ceiling"
                            aria-label="Daily ceiling"
                            onChange={(event) => update({ budgetMax: event.target.value })}
                            {...stylex.props(styles.field, styles.fieldWide)}
                          />
                          <span {...stylex.props(styles.word)}>a day</span>
                        </>
                      )}
                    </>
                  )}
                </div>

                {/* Run on · Labels · Check · Repeat */}
                <div {...stylex.props(styles.line, styles.settingsLine)}>
                  <div {...stylex.props(styles.anchor)}>
                    <BuyerlyRuleChip
                      aria-expanded={popover === 'runOn'}
                      aria-label={`Run on: ${runOnEntries.length ? runOnText : 'nowhere yet'}`}
                      data-popover-trigger="Run on"
                      onClick={() => setPopover((current) => (current === 'runOn' ? null : 'runOn'))}
                    >
                      <BuyerlyBoltIcon size={12} />
                      <span {...stylex.props(runOnEntries.length > 0 && styles.chosen)}>{runOnText}</span>
                    </BuyerlyRuleChip>
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
                  <div {...stylex.props(styles.anchor)}>
                    <BuyerlyRuleChip
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
                          <span {...stylex.props(styles.dots)} aria-hidden="true">
                            {chosenLabels.slice(0, 4).map((label, index) => (
                              <span
                                key={label.id}
                                {...stylex.props(styles.dot)}
                                style={{ backgroundColor: label.color, marginLeft: index === 0 ? 0 : -3, boxShadow: '0 0 0 1.5px var(--card-bg)' }}
                              />
                            ))}
                          </span>
                          <span {...stylex.props(styles.chosen)}>
                            {chosenLabels.length === 1 ? chosenLabels[0].name : `${chosenLabels.length} labels`}
                          </span>
                        </>
                      )}
                    </BuyerlyRuleChip>
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
                      <BuyerlyRuleChip aria-label={`Check: ${formatCheckInterval(draft.checkInterval)}`}>
                        <BuyerlyClockOutlineIcon size={12} />
                        {formatCheckInterval(draft.checkInterval)}
                      </BuyerlyRuleChip>
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
                      <BuyerlyRuleChip aria-label={`Repeat: ${formatRepeat(draft.repeatMinutes)}`}>
                        <Repeat size={12} />
                        {formatRepeat(draft.repeatMinutes)}
                      </BuyerlyRuleChip>
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
                <p data-testid="rule-summary" {...stylex.props(styles.summary)}>
                  {describeDraft(draft, accounts)}
                  {previewLine && <> {previewLine}</>}
                </p>
                {(serverProblem || submitError) && (
                  <p role="alert" {...stylex.props(styles.problem)}>
                    {submitError || serverProblem}
                  </p>
                )}
              </div>

              {/* Footer: Discard draft · Create more · Create rule. */}
              <div {...stylex.props(styles.footer, phone && styles.footerPhone)}>
                <div>
                  {restored && !isEditing && (
                    <button
                      type="button"
                      onClick={discardDraft}
                      {...stylex.props(styles.discard)}
                    >
                      Discard draft
                    </button>
                  )}
                </div>
                <div {...stylex.props(styles.submitRow)}>
                  {!isEditing && (
                    <label {...stylex.props(styles.createMore)}>
                      <BuyerlyToggle checked={createMore} onChange={setCreateMore} label="Create more" />
                      <span aria-hidden="true">Create more</span>
                    </label>
                  )}
                  <Tooltip content={canSubmit ? (navigator.platform.includes('Mac') ? '⌘ Enter' : 'Ctrl Enter') : (blockers[0] ?? '')}>
                    <span {...stylex.props(styles.submitAnchor)}>
                      <Button
                        type="submit"
                        variant="primary"
                        size="compact"
                        touchHeight
                        disabled={!canSubmit}
                        aria-describedby={canSubmit ? undefined : 'rule-window-blockers'}
                      >
                        {submitLabel}
                      </Button>
                    </span>
                  </Tooltip>
                  {!canSubmit && blockers.length > 0 && (
                    <span id="rule-window-blockers" {...stylex.props(styles.srOnly)}>{blockers.join('. ')}</span>
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

