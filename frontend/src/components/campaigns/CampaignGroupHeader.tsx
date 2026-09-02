import React from 'react';
import { LinearDataListGroupHeader } from '@/ui/LinearDataList';

interface CampaignGroupHeaderProps {
  groupId: string;
  groupName: string;
  count: number;
  dotColor: string;
  accentLch: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const CampaignGroupHeader: React.FC<CampaignGroupHeaderProps> = ({
  groupName,
  count,
  dotColor,
  isCollapsed,
  onToggleCollapse,
}) => (
  <LinearDataListGroupHeader
    title={groupName}
    count={count}
    dotColor={dotColor}
    isCollapsed={isCollapsed}
    onToggleCollapse={onToggleCollapse}
    actionLabel="Create new campaign"
    onAction={() => {}}
  />
);
