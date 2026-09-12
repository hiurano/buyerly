import React from 'react';
import type { AuditEventItem } from '@/lib/audit';
import {
  auditEventTarget,
  auditEventTitle,
  formatAuditRelativeTime,
  humanizeAuditValue,
} from '@/lib/audit';
import { BuyerlyLogoAvatar } from '@/icons/LinearIcons';
import { LinearDataListRow } from '@/ui/LinearDataList';

interface InboxItemRowProps {
  item: AuditEventItem;
  isSelected: boolean;
  onSelect: () => void;
}

export const InboxItemRow: React.FC<InboxItemRowProps> = ({ item, isSelected, onSelect }) => (
  <LinearDataListRow
    role="button"
    tabIndex={0}
    selected={isSelected}
    aria-selected={undefined}
    aria-pressed={isSelected}
    onClick={onSelect}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelect();
      }
    }}
    aria-label={`Open ${auditEventTitle(item)} for ${auditEventTarget(item)}`}
    className="min-h-[72px] cursor-pointer px-3 py-2"
  >
    <BuyerlyLogoAvatar size={32} shape="circle" />
    <div className="ml-2.5 min-w-0 flex-1">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="truncate text-[14px] font-medium text-[var(--text-primary)]">
          {auditEventTitle(item)}
        </span>
        <span className="shrink-0 text-[12px] text-[var(--text-muted)]">
          {formatAuditRelativeTime(item.created_at)}
        </span>
      </div>
      <div className="mt-1 flex min-w-0 items-center justify-between gap-3">
        <span className="truncate text-[13px] text-[var(--text-tertiary)]">
          {item.message || auditEventTarget(item)}
        </span>
        <span className="shrink-0 text-[12px] font-medium text-[var(--text-tertiary)]">
          {humanizeAuditValue(item.display_status)}
        </span>
      </div>
    </div>
  </LinearDataListRow>
);
