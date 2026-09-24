import React from 'react';
import { RuleItem, useAppStore } from '@/store/useAppStore';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/ui/DropdownMenu';
import { LinearCheckIcon, LinearDotsIcon } from '@/icons/LinearIcons';
import { metaAccountLabel } from '@/components/campaigns/liveCampaigns';

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

  const attachedIds = new Set(rule.preset.attached_account_ids);

  /**
   * What unchecking this account would remove. A rule narrowed to campaigns in
   * Ads Manager is still one attachment here, so say so before it is clicked.
   */
  const accountNote = (accountId: string): string => {
    const scope = rule.preset.attached_scopes[accountId];
    if (!scope) return '';
    if (scope.level === 'campaign') {
      return scope.ids.length === 1 ? '1 campaign' : `${scope.ids.length} campaigns`;
    }
    if (scope.level === 'adset') {
      return scope.ids.length === 1 ? '1 ad set' : `${scope.ids.length} ad sets`;
    }
    return 'Whole account';
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${rule.name}`}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-tertiary)] opacity-0 transition-all hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] group-hover/row:opacity-100 data-[state=open]:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
        >
          <LinearDotsIcon size={14} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={4}>
        <DropdownMenuItem onClick={() => openEditRuleModal(rule.id)}>
          <span>Edit rule</span>
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span>Run on ad accounts</span>
            <span className="text-[10px] text-[var(--text-tertiary)]">▶</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {ruleAccounts.length === 0 ? (
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
                    onClick={() => void toggleRuleOnAccount(rule.id, account.account_id)}
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
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => requestDeletion('rule', [rule.id])}>
          <span style={{ color: 'var(--rules-action-stop-text)' }}>Delete rule</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
