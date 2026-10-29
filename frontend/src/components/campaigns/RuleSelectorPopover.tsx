import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { BuyerlyCheckGlyph } from '@/icons/BuyerlyIcons';
import type { RuleExecutionLevel, RuleScope } from '@/lib/rules';
import { explainRulePrecedence } from '@/lib/rulePrecedence';
import type { PrecedenceLine } from '@/lib/rulePrecedence';
import { fetchEntityRuleStates, inheritedRuleIds, RULE_LEVELS_UNDER } from '@/lib/rules';
import type { RuleEntityStatePayload } from '@/lib/rules';
import { RuleStateLine } from '@/components/rules/RuleStateLine';
import { rulesStore, useRulesStore, type RuleItem } from '@/models/rulesStore';
import { useDialogStore } from '@/models/dialogStore';
import { colors } from '@/styles/tokens.stylex';
import { pickerStyles } from './pickerStyles';

const TOUCH = '@media (hover: none) and (pointer: coarse)';

const styles = stylex.create({
  // 44px rows under a finger.
  optionTouch: {
    height: {
      default: 32,
      [TOUCH]: 44,
    },
  },
  optionLocked: {
    cursor: 'not-allowed',
    opacity: 0.55,
  },
  boltSlot: {
    display: 'flex',
    width: 16,
    height: 16,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bolt: {
    color: '#eab308',
  },
  scopeNote: {
    marginLeft: 8,
    flexShrink: 0,
    color: colors['--text-tertiary'],
    fontSize: 11,
    lineHeight: '20px',
    whiteSpace: 'nowrap',
  },
  listbox: {
    minHeight: 0,
  },
  newRule: {
    display: 'flex',
    height: {
      default: 36,
      [TOUCH]: 44,
    },
    flexShrink: 0,
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderColor: colors['--color-border-primary'],
    paddingLeft: 14,
    paddingRight: 14,
    textAlign: 'left',
    fontSize: 13,
    color: {
      default: colors['--text-secondary'],
      ':hover': colors['--text-primary'],
    },
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
  },
  newRuleIcon: {
    color: colors['--text-tertiary'],
  },
  section: {
    flexShrink: 0,
    overflowY: 'auto',
    paddingTop: 8,
    paddingRight: 14,
    paddingBottom: 10,
    paddingLeft: 14,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: colors['--color-border-primary'],
  },
  precedence: {
    maxHeight: 196,
    fontSize: 11,
    lineHeight: '15px',
    color: colors['--text-tertiary'],
  },
  precedenceTitle: {
    fontWeight: 500,
    color: colors['--text-secondary'],
  },
  precedenceGap: {
    marginTop: 4,
  },
  plainList: {
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    listStyle: 'none',
  },
  precedenceRule: {
    overflow: 'hidden',
    color: colors['--text-secondary'],
    fontSize: 12,
    fontWeight: 400,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  precedenceRuleWins: {
    color: colors['--text-primary'],
    fontWeight: 500,
  },
  precedenceNote: {
    marginTop: 6,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
  },
  states: {
    maxHeight: 184,
  },
  statesTitle: {
    marginBottom: 6,
    color: colors['--text-tertiary'],
    fontSize: 11,
    fontWeight: 500,
    lineHeight: '16px',
  },
  statesMessage: {
    color: colors['--text-muted'],
    fontSize: 12,
    lineHeight: '16px',
  },
  statesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  stateRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  stateRuleName: {
    overflow: 'hidden',
    color: colors['--text-primary'],
    fontSize: 12,
    lineHeight: '16px',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  error: {
    flexShrink: 0,
    paddingTop: 8,
    paddingRight: 14,
    paddingBottom: 8,
    paddingLeft: 14,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: colors['--color-border-primary'],
    color: colors['--rules-action-stop-text'],
    fontSize: 12,
    lineHeight: '16px',
  },
});

/** The level this picker attaches rules to. */
export type RuleTargetLevel = 'campaign' | 'adset';

/** Levels a rule can act on from a row of this level: the row itself and what sits under it. */
const LEVELS_UNDER = RULE_LEVELS_UNDER;

const LEVEL_HEADINGS: Record<RuleExecutionLevel, string> = {
  campaign: 'On this campaign',
  adset: 'On each ad set',
  ad: 'On each ad',
};

interface PrecedenceGroup {
  level: RuleExecutionLevel;
  lines: PrecedenceLine[];
}

interface RuleSelectorPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  /** The control it opened from; without one it sits centred, as a menu does. */
  anchorRect: DOMRect | null;
  /** The ad account the rows belong to: rules attach per account. */
  accountId: string;
  level: RuleTargetLevel;
  /** One row's id, or every selected row of the level. */
  entityIds: string[];
  /** The key that opened it, shown in the field. */
  shortcut?: string;
  /** Parent campaign of a single ad set, whose campaign-wide rules reach it too. */
  campaignId?: string;
}

/** Fingers get taller rows and no keyboard popping up over the list. */
const isCoarsePointer = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(hover: none) and (pointer: coarse)').matches;

/**
 * Rule picker follows the same interaction contract as Linear's label picker:
 * selected items first, multi-select without closing, search and keyboard navigation.
 * Over several rows, a rule on only some of them shows as mixed, and picking it
 * aims it at all of them.
 */
export const RuleSelectorPopover: React.FC<RuleSelectorPopoverProps> = ({
  isOpen,
  onClose,
  anchorRect,
  accountId,
  level,
  entityIds,
  shortcut,
  campaignId,
}) => {
  const rules = useRulesStore((state) => state.rules);
  const campaignAttachedRules = useRulesStore((state) => state.campaignAttachedRules);
  const adSetAttachedRules = useRulesStore((state) => state.adSetAttachedRules);
  const toggleRuleForEntities = useRulesStore((state) => state.toggleRuleForEntities);
  const scopesByAccount = useRulesStore((state) => state.attachedRuleScopes);
  const orderByAccount = useRulesStore((state) => state.attachedRuleOrder);
  const attachmentError = useRulesStore((state) => state.attachmentError);
  const clearAttachmentError = useRulesStore((state) => state.clearAttachmentError);
  const rulesLoadState = useRulesStore((state) => state.rulesLoadState);
  const loadRules = useRulesStore((state) => state.loadRules);
  const openCreateRuleModal = useDialogStore((state) => state.openCreateRuleModal);
  const attachedRuleScopes = useMemo(() => scopesByAccount[accountId] ?? {}, [scopesByAccount, accountId]);
  const attachedRuleOrder = useMemo(() => orderByAccount[accountId] ?? [], [orderByAccount, accountId]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const coarse = isCoarsePointer();

  const attachedByEntity =
    level === 'campaign' ? campaignAttachedRules : adSetAttachedRules;
  /** Rule id → how many of these rows it is aimed at. */
  const coverage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entityId of entityIds) {
      for (const ruleId of attachedByEntity[entityId] || []) {
        counts.set(ruleId, (counts.get(ruleId) ?? 0) + 1);
      }
    }
    return counts;
  }, [attachedByEntity, entityIds]);
  const filteredRules = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return rules.filter(
      (rule) =>
        rule.name.toLowerCase().includes(query) ||
        rule.identifier.toLowerCase().includes(query) ||
        rule.condition.toLowerCase().includes(query)
    );
  }, [rules, searchQuery]);

  // One row's rules that reach it through the ad account or its campaign
  // (#300): listed with its own, so the picker answers "what checks this row".
  const inherited = useMemo(() => {
    if (entityIds.length !== 1) return new Set<string>();
    const ruleLevels = Object.fromEntries(rules.map((rule) => [rule.id, rule.preset.level]));
    return new Set(inheritedRuleIds(attachedRuleScopes, attachedRuleOrder, ruleLevels, level, campaignId));
  }, [entityIds.length, rules, attachedRuleScopes, attachedRuleOrder, level, campaignId]);
  const checksThisRow = (rule: RuleItem) => coverage.has(rule.id) || inherited.has(rule.id);
  const attachedRules = filteredRules.filter(checksThisRow);
  const unattachedRules = filteredRules.filter((rule) => !checksThisRow(rule));
  const orderedRules = [...attachedRules, ...unattachedRules];

  /**
   * For one row: which of the running rules that reach it would act if they
   * all matched in the same check (#323). Rules only compete on the same
   * entity, so they are grouped by the level they act on.
   */
  const precedence = useMemo((): PrecedenceGroup[] => {
    if (entityIds.length !== 1) return [];
    const [entityId] = entityIds;
    const reaches = (scope: RuleScope | undefined) =>
      Boolean(scope) &&
      (scope!.level === 'account' ||
        (scope!.level === level && scope!.ids.includes(entityId)) ||
        (level === 'adset' && scope!.level === 'campaign' && Boolean(campaignId) &&
          scope!.ids.includes(campaignId!)));
    const byId = new Map(rules.map((rule) => [rule.id, rule]));
    const running = attachedRuleOrder
      .map((id) => byId.get(id))
      .filter((rule): rule is RuleItem =>
        Boolean(rule) && rule!.status === 'active' && !rule!.needsReview &&
        reaches(attachedRuleScopes[rule!.id]));
    return LEVELS_UNDER[level]
      .map((ruleLevel) => ({
        level: ruleLevel,
        lines: explainRulePrecedence(
          running
            .filter((rule) => (rule.preset.level ?? 'adset') === ruleLevel)
            .map((rule) => ({ id: rule.id, name: rule.name, action: rule.actionKind })),
        ),
      }))
      .filter((group) => group.lines.length > 0);
  }, [entityIds, level, campaignId, rules, attachedRuleOrder, attachedRuleScopes]);
  const precedenceLineCount = precedence.reduce((count, group) => count + group.lines.length, 0);
  const anyGivesWay = precedence.some((group) => group.lines.some((line) => line.role === 'gives_way'));

  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery('');
    setActiveIndex(-1);
    clearAttachmentError();
    if (isCoarsePointer()) return;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(focusTimer);
  }, [isOpen, clearAttachmentError]);

  // Where each rule stands on this one row (#322): read when the picker opens,
  // so the answer is as fresh as the rules' last check.
  const singleEntityId = entityIds.length === 1 ? entityIds[0] : null;
  const [entityStates, setEntityStates] = useState<RuleEntityStatePayload[] | 'error' | null>(null);
  useEffect(() => {
    if (!isOpen || !singleEntityId) return;
    let cancelled = false;
    setEntityStates(null);
    fetchEntityRuleStates(level, singleEntityId)
      .then((rows) => {
        if (!cancelled) setEntityStates(rows);
      })
      .catch(() => {
        if (!cancelled) setEntityStates('error');
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, level, singleEntityId]);

  // Rules that check this very row but have no snapshot on it yet: just
  // attached, or paused before their first check. Rules acting on the ad sets
  // or ads under the row keep their status on those rows instead.
  const uncheckedRules = Array.isArray(entityStates) && singleEntityId
    ? rules.filter(
        (rule) =>
          checksThisRow(rule) &&
          rule.preset.level === level &&
          !entityStates.some((row) => row.rule_id === rule.presetId),
      )
    : [];
  const uncheckedStateRow = (rule: RuleItem): RuleEntityStatePayload => ({
    rule_id: rule.presetId,
    rule_name: rule.name,
    account_id: '',
    account_name: '',
    entity_level: level,
    entity_id: singleEntityId ?? '',
    entity_name: '',
    campaign_id: campaignId ?? '',
    state: rule.status === 'paused' ? 'rule_paused' : 'unchecked',
    detail: rule.status === 'paused' ? '' : `Buyerly checks it every ${rule.preset.check_interval_minutes} min`,
    wait_until: '',
    yielded_to_rule_id: null,
    yielded_to_rule_name: '',
    checked_at: '',
    acted_at: '',
  });

  // Ads Manager can be opened before the Rules screen ever was; the list is
  // read when a picker first needs it, not on every visit.
  useEffect(() => {
    if (!isOpen) return;
    const { rulesLoadState: state } = rulesStore;
    if (state === 'idle' || state === 'error') void loadRules();
  }, [isOpen, loadRules]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (activeIndex >= orderedRules.length) setActiveIndex(-1);
  }, [activeIndex, orderedRules.length]);

  if (!isOpen || entityIds.length === 0) return null;

  const popoverWidth = 279;
  const rowHeight = coarse ? 44 : 32;
  const precedenceHeight = precedence.length > 0 ? Math.min(52 + precedenceLineCount * 34, 196) : 0;
  const statesHeight = singleEntityId && attachedRules.length > 0 ? 184 : 0;
  const estimatedHeight =
    Math.min(44 + orderedRules.length * rowHeight + 16, 395) + precedenceHeight + statesHeight;
  const margin = 8;
  let left: number;
  let top: number;

  if (anchorRect) {
    left = anchorRect.left;
    top = anchorRect.bottom + 6;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - popoverWidth - margin;
    }
    if (top + estimatedHeight > window.innerHeight - margin) {
      top = Math.max(margin, anchorRect.top - estimatedHeight - 6);
    }
  } else {
    left = (window.innerWidth - popoverWidth) / 2;
    top = Math.round(window.innerHeight * 0.13);
  }
  left = Math.max(margin, left);

  const thisNoun = level === 'campaign' ? 'campaign' : 'ad set';
  const otherNoun = level === 'campaign' ? 'ad sets' : 'campaigns';
  const nouns = (count: number) => `${count} ${thisNoun}${count === 1 ? '' : 's'}`;

  /**
   * What this rule is currently aimed at. A rule aimed at another level cannot
   * be re-aimed from here, so the note says where it lives instead.
   */
  const scopeNote = (rule: RuleItem): string => {
    const scope = attachedRuleScopes[rule.id];
    if (!scope) return '';
    if (scope.level === 'account') return 'Whole account';
    if (inherited.has(rule.id) && scope.level === 'campaign') return 'Its campaign';
    if (scope.level !== level) return `Specific ${otherNoun}`;
    const covered = coverage.get(rule.id) ?? 0;
    if (covered === 0) {
      return `${scope.ids.length} other ${thisNoun}${scope.ids.length === 1 ? '' : 's'}`;
    }
    if (covered < entityIds.length) return `${covered} of ${entityIds.length} selected`;
    if (scope.ids.length === covered) {
      return entityIds.length === 1 ? `This ${thisNoun}` : `These ${nouns(covered)}`;
    }
    return nouns(scope.ids.length);
  };

  const isLocked = (rule: RuleItem): boolean => {
    const scope = attachedRuleScopes[rule.id];
    return Boolean(scope) && scope.level !== level;
  };

  const toggleRule = (rule: RuleItem) => {
    void toggleRuleForEntities(accountId, level, entityIds, rule.id);
    if (!coarse) window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) =>
        orderedRules.length === 0 ? -1 : index < 0 ? 0 : (index + 1) % orderedRules.length
      );
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) =>
        orderedRules.length === 0
          ? -1
          : index < 0
          ? orderedRules.length - 1
          : (index - 1 + orderedRules.length) % orderedRules.length
      );
      return;
    }

    if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      toggleRule(orderedRules[activeIndex]);
    }
  };

  const optionId = (rule: RuleItem) => `${listId}-rule-${rule.id}`;

  const renderOption = (rule: RuleItem, index: number) => {
    const covered = coverage.get(rule.id) ?? 0;
    // A rule on the whole ad account (or the ad set's campaign) checks this row
    // too: ticked, but changed on the Rules screen.
    const isSelected = covered === entityIds.length || inherited.has(rule.id);
    const isMixed = covered > 0 && !isSelected;
    const isActive = activeIndex === index;
    const locked = isLocked(rule);
    const note = scopeNote(rule);

    return (
      <li
        id={optionId(rule)}
        key={rule.id}
        role="option"
        aria-selected={isSelected}
        aria-checked={isMixed ? 'mixed' : isSelected}
        aria-disabled={locked}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => toggleRule(rule)}
        {...stylex.props(pickerStyles.option, styles.optionTouch, locked && styles.optionLocked)}
      >
        <div aria-hidden="true" {...stylex.props(pickerStyles.highlight, isActive && pickerStyles.highlightActive)} />

        <div {...stylex.props(pickerStyles.checkSlot)}>
          <div {...stylex.props(pickerStyles.check, (isSelected || isMixed) && pickerStyles.checkSelected)}>
            {isSelected && (
              <BuyerlyCheckGlyph />
            )}
            {isMixed && (
              <svg width="8" height="2" viewBox="0 0 8 2" fill="currentColor" aria-hidden="true">
                <rect width="8" height="1.5" rx="0.75" />
              </svg>
            )}
          </div>
        </div>

        <div {...stylex.props(pickerStyles.label)}>
          <div {...stylex.props(styles.boltSlot)}>
            <BuyerlyIcon name="rules" size={13} className={stylex.props(styles.bolt).className} />
          </div>
          <span {...stylex.props(pickerStyles.name)}>
            {rule.name}
          </span>
          {note && (
            <span {...stylex.props(styles.scopeNote)}>
              {note}
            </span>
          )}
        </div>
      </li>
    );
  };

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={entityIds.length === 1 ? `Rules for this ${thisNoun}` : `Rules for ${nouns(entityIds.length)}`}
      tabIndex={-1}
      data-animated-popover-container="true"
      data-menu-active="true"
      {...stylex.props(pickerStyles.popover)}
      style={{
        left,
        top,
        // Status and "If they all match" under the list can outgrow a phone; the list gives way.
        maxHeight: `calc(100dvh - ${top + margin}px)`,
        transformOrigin: anchorRect
          ? `${Math.min(
            popoverWidth - 2,
            Math.max(2, anchorRect.left - left + anchorRect.width / 2)
          )}px 18px`
          : 'center top',
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <form
        autoComplete="off"
        onSubmit={(event) => event.preventDefault()}
        {...stylex.props(pickerStyles.search)}
      >
        <span {...stylex.props(pickerStyles.srOnly)} role="status" aria-live="polite">
          {searchQuery ? `${orderedRules.length} matching rules` : 'Showing all rules'}
        </span>
        <input
          ref={inputRef}
          type="search"
          value={searchQuery}
          placeholder="Change or add rules…"
          aria-label="Change or add rules…"
          aria-controls={listId}
          aria-activedescendant={
            activeIndex >= 0 ? optionId(orderedRules[activeIndex]) : undefined
          }
          autoComplete="off"
          spellCheck={false}
          maxLength={80}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={handleInputKeyDown}
          {...stylex.props(pickerStyles.input)}
        />
        {shortcut && (
          <kbd {...stylex.props(pickerStyles.shortcut)}>
            {shortcut}
          </kbd>
        )}
      </form>

      <div
        id={listId}
        role="listbox"
        aria-multiselectable="true"
        {...stylex.props(pickerStyles.listbox, styles.listbox)}
      >
        <ul role="presentation" {...stylex.props(pickerStyles.list)}>
          {attachedRules.map((rule, index) => renderOption(rule, index))}

          {attachedRules.length > 0 && unattachedRules.length > 0 && (
            <li role="separator" {...stylex.props(pickerStyles.separator)}>
              <div {...stylex.props(pickerStyles.separatorLine)} />
            </li>
          )}

          {unattachedRules.map((rule, index) =>
            renderOption(rule, attachedRules.length + index)
          )}

          {orderedRules.length === 0 && (
            <li {...stylex.props(pickerStyles.empty)}>
              {rules.length > 0
                ? 'No rules found'
                : rulesLoadState === 'ready'
                  ? 'No rules yet.'
                  : rulesLoadState === 'error'
                    ? "Couldn't load rules"
                    : 'Loading rules…'}
            </li>
          )}
        </ul>
      </div>

      {/* A new rule that runs on what is selected here, made without leaving Campaigns (#387). */}
      {accountId && (
        <button
          type="button"
          onClick={() => {
            onClose();
            openCreateRuleModal(undefined, { accountId, scope: { level, ids: [...entityIds] } });
          }}
          {...stylex.props(styles.newRule)}
        >
          <BuyerlyIcon name="add" size={14} {...stylex.props(styles.newRuleIcon)} />
          New rule…
        </button>
      )}

      {precedence.length > 0 && (
        <section
          aria-label="If these rules all match"
          {...stylex.props(styles.section, styles.precedence)}
        >
          <div {...stylex.props(styles.precedenceTitle)}>If they all match</div>
          {precedence.map((group) => (
            <div key={group.level} {...stylex.props(styles.precedenceGap)}>
              {(precedence.length > 1 || group.level !== level) && (
                <div {...stylex.props(styles.precedenceGap)}>{LEVEL_HEADINGS[group.level]}</div>
              )}
              <ul {...stylex.props(styles.plainList)}>
                {group.lines.map((line) => (
                  <li key={line.rule.id} data-precedence-role={line.role} {...stylex.props(styles.precedenceGap)}>
                    <div {...stylex.props(styles.precedenceRule, line.role === 'wins' && styles.precedenceRuleWins)}>
                      {line.rule.name}
                    </div>
                    <div>{line.note}</div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p {...stylex.props(styles.precedenceNote)}>
            One change per check: turn off, then budget −, budget +, turn on; equal ones in the
            order shown. Alerts always fire.
            {anyGivesWay && ' While a stronger rule waits to repeat, weaker ones wait too.'}
          </p>
        </section>
      )}

      {singleEntityId && (attachedRules.length > 0 || (Array.isArray(entityStates) && entityStates.length > 0)) && (
        <section
          aria-label={`Rule status on this ${thisNoun}`}
          data-rule-states="true"
          {...stylex.props(styles.section, styles.states)}
        >
          <div {...stylex.props(styles.statesTitle)}>
            Status on this {thisNoun}
          </div>
          {entityStates === null && (
            <div {...stylex.props(styles.statesMessage)}>Loading…</div>
          )}
          {entityStates === 'error' && (
            <div {...stylex.props(styles.statesMessage)}>
              Couldn't load the rules' status
            </div>
          )}
          {Array.isArray(entityStates) && entityStates.length === 0 && uncheckedRules.length === 0 && (
            <div {...stylex.props(styles.statesMessage)}>
              Not checked yet
            </div>
          )}
          {Array.isArray(entityStates) && (entityStates.length > 0 || uncheckedRules.length > 0) && (
            <ul {...stylex.props(styles.plainList, styles.statesList)}>
              {[...entityStates, ...uncheckedRules.map(uncheckedStateRow)].map((row) => (
                <li key={`${row.account_id}:${row.rule_id}`} {...stylex.props(styles.stateRow)}>
                  <span
                    title={row.rule_name}
                    {...stylex.props(styles.stateRuleName)}
                  >
                    {row.rule_name}
                  </span>
                  <RuleStateLine row={row} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {attachmentError && (
        <div
          role="alert"
          {...stylex.props(styles.error)}
        >
          {attachmentError}
        </div>
      )}
    </div>,
    document.body
  );
};
