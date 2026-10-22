import React from 'react';
import type { MetaAccount } from '@/lib/types';
import { Initials } from '@/components/preferences/MembersSection';
import { BuyerlyCheckIcon } from '@/icons/BuyerlyIcons';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/ui/DropdownMenu';
import { Tooltip } from '@/ui/Tooltip';
import type { AccountMember } from './accountsData';

const memberLabel = (member: AccountMember) => member.full_name || member.username;

/** The empty lead, as Linear's: a dashed circle. */
const NoLeadIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2" />
  </svg>
);

interface AccountLeadPickerProps {
  account: MetaAccount;
  members: AccountMember[];
  canEdit: boolean;
  onChange: (leadUserId: number | null) => void;
  /** `cell` is the list's 28px avatar button; `property` shows the name beside it on the account's page. */
  variant: 'cell' | 'property';
}

/** Linear's project Lead picker for an ad account: the member responsible for it, or nobody. */
export const AccountLeadPicker: React.FC<AccountLeadPickerProps> = ({ account, members, canEdit, onChange, variant }) => {
  const lead = members.find((member) => member.user_id === account.lead_user_id) ?? null;
  const avatar = lead
    ? <Initials label={memberLabel(lead)} avatarUrl={lead.avatar_url} size={16} />
    : <span className="text-[var(--text-tertiary)]"><NoLeadIcon /></span>;
  const trigger = (
    <button
      type="button"
      disabled={!canEdit}
      aria-label={lead ? `Lead: ${memberLabel(lead)}` : 'Set lead'}
      className={variant === 'cell' ? 'account-lead-cell' : 'account-lead-property'}
      onClick={(event) => event.stopPropagation()}
    >
      {avatar}
      {variant === 'property' && (
        <span className={lead ? 'truncate' : 'truncate text-[var(--text-tertiary)]'}>{lead ? memberLabel(lead) : 'No lead'}</span>
      )}
    </button>
  );
  if (!canEdit) {
    return variant === 'cell' && lead ? <Tooltip content={`Lead: ${memberLabel(lead)}`}>{trigger}</Tooltip> : trigger;
  }
  return (
    <DropdownMenu>
      <Tooltip content={lead ? `Lead: ${memberLabel(lead)}` : 'Set lead'} disabled={variant === 'property'}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="start" sideOffset={4} style={{ width: 220 }} onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem onSelect={() => onChange(null)}>
          <span className="flex min-w-0 items-center gap-2">
            <span className="text-[var(--text-tertiary)]"><NoLeadIcon /></span>
            <span>No lead</span>
          </span>
          {!lead && <BuyerlyCheckIcon size={14} />}
        </DropdownMenuItem>
        {members.length > 0 && <DropdownMenuSeparator />}
        {members.map((member) => (
          <DropdownMenuItem key={member.user_id} onSelect={() => onChange(member.user_id)}>
            <span className="flex min-w-0 items-center gap-2">
              <Initials label={memberLabel(member)} avatarUrl={member.avatar_url} size={16} />
              <span className="truncate">{memberLabel(member)}</span>
            </span>
            {lead?.user_id === member.user_id && <BuyerlyCheckIcon size={14} />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
