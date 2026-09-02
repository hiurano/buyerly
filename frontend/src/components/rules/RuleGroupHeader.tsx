import React from 'react';
import { LinearDataListGroupHeader } from '@/ui/LinearDataList';

interface RuleGroupHeaderProps {
  groupId: string;
  groupName: string;
  count: number;
  dotColor?: string;
  accentLch?: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onAddRule?: () => void;
}

export const RuleGroupHeader: React.FC<RuleGroupHeaderProps> = ({
  groupName,
  count,
  dotColor,
  isCollapsed,
  onToggleCollapse,
  onAddRule,
}) => (
  <LinearDataListGroupHeader
    title={groupName}
    count={count}
    dotColor={dotColor}
    isCollapsed={isCollapsed}
    onToggleCollapse={onToggleCollapse}
    actionLabel="Create rule in group"
    onAction={onAddRule}
  />
);
