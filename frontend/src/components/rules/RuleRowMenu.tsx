import React, { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { rowMarker } from '@/ui/markers.stylex';
import { ruleStatesTitle } from './RuleStatesDialog';
import { AttachRulePreviewDialog } from './AttachRulePreviewDialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/ui/DropdownMenu';
import { BuyerlyCheckIcon, BuyerlyDotsIcon } from '@/icons/BuyerlyIcons';
import { metaAccountLabel } from '@/components/campaigns/liveCampaigns';
import { useIsTouchScreen } from '@/lib/useMediaQuery';
import { formatAccountScope } from '@/lib/rules';
import { useDialogStore, dialogStore } from '@/models/dialogStore';
import { useRulesStore, RuleItem } from '@/models/rulesStore';

const TOUCH = '@media (hover: none) and (pointer: coarse)';

const styles = stylex.create({
  empty: {
    paddingTop: 8,
    paddingRight: 14,
    paddingBottom: 8,
    paddingLeft: 14,
    fontSize: 12,
    color: colors['--text-muted'],
  },
  accountName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  accountEnd: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: 8,
  },
  note: {
    fontSize: 11,
    color: colors['--text-tertiary'],
  },
  check: {
    color: colors['--text-secondary'],
  },
  // Shows while its row is hovered, its menu open or it has focus; always on a touch screen.
  trigger: {
    display: 'flex',
    height: {
      default: 24,
      [TOUCH]: 40,
    },
    width: {
      default: 24,
      [TOUCH]: 32,
    },
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
    },
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
    opacity: {
      default: 0,
      [stylex.when.ancestor(':hover', rowMarker)]: 1,
      ':is([data-state="open"])': 1,
      ':focus-visible': 1,
      '@media (hover: none)': 1,
    },
    transitionProperty: 'all',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    transitionDuration: '150ms',
    outline: {
      default: null,
      ':focus-visible': '2px solid transparent',
    },
    outlineOffset: {
      default: null,
      ':focus-visible': 2,
    },
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
  },
  arrow: {
    fontSize: 10,
    color: colors['--text-tertiary'],
  },
  danger: {
    color: colors['--rules-action-stop-text'],
  },
});

interface RuleRowMenuProps {
  rule: RuleItem;
}

/**
 * Row actions for one rule: edit it, choose which ad accounts it runs on, or
 * delete it. Built from the shared menu primitives rather than a new popover.
 */
export const RuleRowMenu: React.FC<RuleRowMenuProps> = ({ rule }) => {
  const openEditRuleModal = useDialogStore((state) => state.openEditRuleModal);
  const requestDeletion = useDialogStore((state) => state.requestDeletion);
  const toggleRuleOnAccount = useRulesStore((state) => state.toggleRuleOnAccount);
  const ruleAccounts = useRulesStore((state) => state.ruleAccounts);

  const touch = useIsTouchScreen();
  const attachedIds = new Set(rule.preset.attached_account_ids);
  const [previewAccount, setPreviewAccount] = useState<{ id: string; label: string } | null>(null);

  /**
   * What unchecking this account would remove. A rule narrowed to campaigns in
   * Ads Manager is still one attachment here, so say so before it is clicked.
   */
  const accountNote = (accountId: string): string => {
    const scope = rule.preset.attached_scopes[accountId];
    return scope ? formatAccountScope(scope) : '';
  };

  const accountItems =
    ruleAccounts.length === 0 ? (
      <div {...stylex.props(styles.empty)}>
        No ad accounts imported yet
      </div>
    ) : (
      ruleAccounts.map((account) => {
        const isAttached = attachedIds.has(account.account_id);
        const note = accountNote(account.account_id);
        return (
          <DropdownMenuItem
            key={account.account_id}
            role="menuitemcheckbox"
            aria-checked={isAttached}
            onSelect={(event) => {
              if (!isAttached) {
                // Attaching covers the whole ad account: show what it will
                // check before anything is written (#200).
                setPreviewAccount({ id: account.account_id, label: metaAccountLabel(account) });
                return;
              }
              // Inline on a touch screen the menu stays open, so several accounts take one visit.
              if (touch) event.preventDefault();
              void toggleRuleOnAccount(rule.id, account.account_id);
            }}
          >
            <span {...stylex.props(styles.accountName)}>{metaAccountLabel(account)}</span>
            <span {...stylex.props(styles.accountEnd)}>
              {note && (
                <span {...stylex.props(styles.note)}>
                  {note}
                </span>
              )}
              {isAttached && (
                <BuyerlyCheckIcon size={16} {...stylex.props(styles.check)} />
              )}
            </span>
          </DropdownMenuItem>
        );
      })
    );

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${rule.name}`}
          {...stylex.props(styles.trigger)}
        >
          <BuyerlyDotsIcon size={14} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={4} style={touch ? { width: '260px' } : undefined}>
        <DropdownMenuItem onClick={() => openEditRuleModal(rule.id)}>
          <span>Edit rule</span>
        </DropdownMenuItem>

        {touch ? (
          // A finger can't hover a submenu open, so the accounts are listed in place.
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Run on ad accounts</DropdownMenuLabel>
            {accountItems}
          </>
        ) : (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span>Run on ad accounts</span>
              <span {...stylex.props(styles.arrow)}>▶</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>{accountItems}</DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        <DropdownMenuSeparator />

        {/* Where the rule stands on each campaign it checks (#322). */}
        <DropdownMenuItem onClick={() => dialogStore.openRuleStates(rule.id)}>
          <span>{ruleStatesTitle(rule)}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => requestDeletion('rule', [rule.id])}>
          <span {...stylex.props(styles.danger)}>Delete rule</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {previewAccount && (
      <AttachRulePreviewDialog
        open
        presetId={rule.presetId}
        ruleName={rule.name}
        accountId={previewAccount.id}
        accountLabel={previewAccount.label}
        onCancel={() => setPreviewAccount(null)}
        onConfirm={() => {
          const accountId = previewAccount.id;
          setPreviewAccount(null);
          void toggleRuleOnAccount(rule.id, accountId);
        }}
      />
    )}
    </>
  );
};
