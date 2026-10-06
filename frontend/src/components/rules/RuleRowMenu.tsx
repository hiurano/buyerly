import React from 'react';
import { RuleItem, useAppStore } from '@/store/useAppStore';
import { ruleStatesTitle } from './RuleStatesDialog';
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
import { LinearCheckIcon, LinearDotsIcon } from '@/icons/LinearIcons';
import { metaAccountLabel } from '@/components/campaigns/liveCampaigns';
import { useIsTouchScreen } from '@/lib/useMediaQuery';
import { formatAccountScope } from '@/lib/rules';

interface RuleRowMenuProps {
  rule: RuleItem;
}

/**
 * Row actions for one rule: edit it, choose which ad accounts it runs on, or
 * delete it. Built from the shared menu primitives rather than a new popover.
 */
export const RuleRowMenu: React.FC<RuleRowMenuProps> = ({ rule }) => {
  const { openEditRuleModal, toggleRuleOnAccount, requestDeletion, ruleAccounts } =
    useAppStore();

  const touch = useIsTouchScreen();
  const attachedIds = new Set(rule.preset.attached_account_ids);

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
      <div className="px-3.5 py-2 text-[12px] text-[var(--text-muted)]">
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
              // Inline on a touch screen the menu stays open, so several accounts take one visit.
              if (touch) event.preventDefault();
              void toggleRuleOnAccount(rule.id, account.account_id);
            }}
          >
            <span className="truncate">{metaAccountLabel(account)}</span>
            <span className="flex shrink-0 items-center gap-2">
              {note && (
                <span className="text-[11px] text-[var(--text-tertiary)]">
                  {note}
                </span>
              )}
              {isAttached && (
                <LinearCheckIcon size={16} className="text-[var(--text-secondary)]" />
              )}
            </span>
          </DropdownMenuItem>
        );
      })
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${rule.name}`}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-tertiary)] opacity-0 transition-all hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] group-hover/row:opacity-100 data-[state=open]:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)] [@media(hover:none)]:opacity-100 [@media(hover:none)_and_(pointer:coarse)]:h-10 [@media(hover:none)_and_(pointer:coarse)]:w-8"
        >
          <LinearDotsIcon size={14} />
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
              <span className="text-[10px] text-[var(--text-tertiary)]">▶</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>{accountItems}</DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        <DropdownMenuSeparator />

        {/* Where the rule stands on each campaign it checks (#322). */}
        <DropdownMenuItem onClick={() => useAppStore.getState().openRuleStates(rule.id)}>
          <span>{ruleStatesTitle(rule)}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => requestDeletion('rule', [rule.id])}>
          <span style={{ color: 'var(--rules-action-stop-text)' }}>Delete rule</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
