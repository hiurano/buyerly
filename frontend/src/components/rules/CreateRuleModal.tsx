import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAppStore } from '@/store/useAppStore';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/ui/DropdownMenu';

export const CreateRuleModal: React.FC = () => {
  const {
    isCreateRuleModalOpen,
    createRuleTargetGroupId,
    closeCreateRuleModal,
    addRule,
    ruleGroups,
  } = useAppStore();

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [applyTo, setApplyTo] = useState<string>('All active campaigns');
  const [action, setAction] = useState<string>('Turn off campaigns');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [timeRange, setTimeRange] = useState<string>('37 months (Maximum)');
  const [schedule, setSchedule] = useState<string>('Continuously');
  
  // Conditions State
  const [metric, setMetric] = useState<string>('Cost per result');
  const [operator, setOperator] = useState<string>('is greater than');
  const [value, setValue] = useState<string>('$30');
  
  const [createMore, setCreateMore] = useState(false);

  // Sync default target group when modal opens
  useEffect(() => {
    if (isCreateRuleModalOpen) {
      setName('');
      setDescription('');
      setSelectedGroupId(createRuleTargetGroupId || (ruleGroups[0]?.id ?? ''));
      setApplyTo('All active campaigns');
      setAction('Turn off campaigns');
      setMetric('Cost per result');
      setOperator('is greater than');
      setValue('$30');
    }
  }, [isCreateRuleModalOpen, createRuleTargetGroupId, ruleGroups]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const conditionText = `IF ${metric} ${operator === 'is greater than' ? '>' : operator === 'is less than' ? '<' : '=='} ${value}`;
    const actionText = action.toUpperCase();

    addRule(
      {
        name: name.trim(),
        condition: conditionText,
        action: actionText,
        campaignName: applyTo,
        scope: `Meta Ads • ${schedule}`,
        status: 'active',
        lastRun: 'Just created',
      },
      selectedGroupId || undefined
    );

    if (createMore) {
      setName('');
      setDescription('');
    } else {
      closeCreateRuleModal();
    }
  };

  const selectedGroup = ruleGroups.find((g) => g.id === selectedGroupId);

  return (
    <Dialog.Root open={isCreateRuleModalOpen} onOpenChange={(open) => !open && closeCreateRuleModal()}>
      <Dialog.Portal>
        {/* Backdrop Overlay */}
        <Dialog.Overlay className="fixed inset-0 z-[500] bg-black/40 backdrop-blur-none animate-fade-in" />

        {/* Dialog Centering Container */}
        <div className="fixed inset-0 z-[501] flex items-start justify-center pt-[13vh] p-3 pointer-events-none overflow-y-auto">
          <Dialog.Content
            style={{
              width: '750px',
              maxWidth: '750px',
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--color-border-secondary)',
              borderRadius: '22px',
              boxShadow:
                '0px 4px 40px 0px rgba(0,0,0,0.1), 0px 3px 20px 0px rgba(0,0,0,0.125), 0px 3px 12px 0px rgba(0,0,0,0.125), 0px 2px 8px 0px rgba(0,0,0,0.125), 0px 1px 1px 0px rgba(0,0,0,0.125)',
            }}
            className="pointer-events-auto border flex flex-col outline-none animate-scale-in select-none text-left"
          >
            <form onSubmit={handleSubmit} className="flex flex-col p-5">
              {/* 1. Modal Header (Breadcrumb & Close) */}
              <div className="flex items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <div className="inline-flex h-[24px] items-center gap-1.5 rounded-full bg-[var(--item-hover-bg)] px-2.5 text-[12px] font-medium text-[var(--text-tertiary)]">
                    <span>Rules</span>
                  </div>
                  <span className="text-[13px] text-[var(--text-muted)]">›</span>
                  <span className="text-[13px] font-[450] text-[var(--text-primary)]">New rule</span>
                </div>

                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Close"
                    className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-full text-[var(--text-tertiary)] transition-colors hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] outline-none cursor-pointer"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M2.97 2.97a.75.75 0 0 1 1.06 0L8 6.94l3.97-3.97a.75.75 0 1 1 1.06 1.06L9.06 8l3.97 3.97a.75.75 0 1 1-1.06 1.06L8 9.06l-3.97 3.97a.75.75 0 0 1-1.06-1.06L6.94 8 2.97 4.03a.75.75 0 0 1 0-1.06Z" />
                    </svg>
                  </button>
                </Dialog.Close>
              </div>

              {/* 2. Rule Name Input */}
              <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Rule name"
                className="w-full bg-transparent text-[18px] font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none mb-2"
              />

              {/* 3. Description / Notes Input */}
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add description (optional)…"
                rows={2}
                className="w-full resize-none bg-transparent text-[14px] text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] outline-none mb-4"
              />

              {/* 4. Property Pills Row (Linear Pill Bar) */}
              <div className="flex flex-wrap items-center gap-1.5 pb-4 border-b border-[var(--color-border-primary)]">
                {/* Apply rule to Pill */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-[24px] items-center gap-1.5 rounded-full bg-[var(--item-hover-bg)] hover:bg-[var(--item-active-bg)] px-2.5 text-[12px] font-medium text-[var(--text-tertiary)] transition-colors outline-none cursor-pointer"
                    >
                      <span className="text-[var(--text-tertiary)]">Apply to:</span>
                      <span className="text-[var(--text-primary)]">{applyTo}</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={4}>
                    <DropdownMenuItem onClick={() => setApplyTo('All active campaigns')}>
                      <span>All active campaigns</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setApplyTo('All active ad sets')}>
                      <span>All active ad sets</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setApplyTo('All active ads')}>
                      <span>All active ads</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Action Pill */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-[24px] items-center gap-1.5 rounded-full bg-[var(--item-hover-bg)] hover:bg-[var(--item-active-bg)] px-2.5 text-[12px] font-medium text-[var(--text-tertiary)] transition-colors outline-none cursor-pointer"
                    >
                      <span className="text-[var(--text-tertiary)]">Action:</span>
                      <span className="text-[var(--text-primary)]">{action}</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={4}>
                    <DropdownMenuItem onClick={() => setAction('Turn off campaigns')}>
                      <span>Turn off campaigns</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setAction('Turn on campaigns')}>
                      <span>Turn on campaigns</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setAction('Increase daily budget by')}>
                      <span>Increase daily budget by</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setAction('Decrease daily budget by')}>
                      <span>Decrease daily budget by</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setAction('Send notification only')}>
                      <span>Send notification only</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Group Pill */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-[24px] items-center gap-1.5 rounded-full bg-[var(--item-hover-bg)] hover:bg-[var(--item-active-bg)] px-2.5 text-[12px] font-medium text-[var(--text-tertiary)] transition-colors outline-none cursor-pointer"
                    >
                      <span className="text-[var(--text-tertiary)]">Group:</span>
                      <span className="text-[var(--text-primary)]">{selectedGroup ? selectedGroup.name : 'All rules'}</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={4}>
                    <DropdownMenuItem onClick={() => setSelectedGroupId('')}>
                      <span>All rules (Unassigned)</span>
                    </DropdownMenuItem>
                    {ruleGroups.map((group) => (
                      <DropdownMenuItem key={group.id} onClick={() => setSelectedGroupId(group.id)}>
                        <span>{group.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Time Range Pill */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-[24px] items-center gap-1.5 rounded-full bg-[var(--item-hover-bg)] hover:bg-[var(--item-active-bg)] px-2.5 text-[12px] font-medium text-[var(--text-tertiary)] transition-colors outline-none cursor-pointer"
                    >
                      <span className="text-[var(--text-tertiary)]">Time:</span>
                      <span className="text-[var(--text-primary)]">{timeRange}</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={4}>
                    <DropdownMenuItem onClick={() => setTimeRange('37 months (Maximum)')}>
                      <span>37 months (Maximum)</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTimeRange('Today')}>
                      <span>Today</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTimeRange('Yesterday')}>
                      <span>Yesterday</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTimeRange('Last 3 days, including today')}>
                      <span>Last 3 days, including today</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTimeRange('Last 7 days, including today')}>
                      <span>Last 7 days, including today</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTimeRange('Last 14 days, including today')}>
                      <span>Last 14 days, including today</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTimeRange('Last 30 days, including today')}>
                      <span>Last 30 days, including today</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Schedule Pill */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-[24px] items-center gap-1.5 rounded-full bg-[var(--item-hover-bg)] hover:bg-[var(--item-active-bg)] px-2.5 text-[12px] font-medium text-[var(--text-tertiary)] transition-colors outline-none cursor-pointer"
                    >
                      <span className="text-[var(--text-tertiary)]">Schedule:</span>
                      <span className="text-[var(--text-primary)]">{schedule}</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={4}>
                    <DropdownMenuItem onClick={() => setSchedule('Continuously')}>
                      <span>Continuously (Every 30m)</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSchedule('Daily')}>
                      <span>Daily (00:00 - 01:00)</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSchedule('Custom')}>
                      <span>Custom schedule</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* 5. Conditions Builder Section */}
              <div className="py-3.5 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-[var(--text-secondary)]">Conditions</span>
                  <span className="text-[11px] text-[var(--text-tertiary)]">All conditions must match</span>
                </div>

                <div className="flex items-center gap-2 bg-[var(--bg-canvas)] border border-[var(--color-border-primary)] rounded-[10px] p-2">
                  {/* Metric Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-[28px] items-center justify-between rounded-[6px] bg-[var(--item-hover-bg)] hover:bg-[var(--item-active-bg)] px-2.5 text-[12px] font-medium text-[var(--text-primary)] outline-none cursor-pointer"
                      >
                        <span>{metric}</span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={4}>
                      <DropdownMenuItem onClick={() => setMetric('Cost per result')}>
                        <span>Cost per result</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMetric('Spent')}>
                        <span>Spent</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMetric('Lifetime spent')}>
                        <span>Lifetime spent</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMetric('Results')}>
                        <span>Results</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMetric('Website purchase ROAS')}>
                        <span>Website purchase ROAS</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMetric('Frequency')}>
                        <span>Frequency</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMetric('Impressions')}>
                        <span>Impressions</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMetric('CPM')}>
                        <span>CPM</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMetric('CTR')}>
                        <span>CTR</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMetric('CPC')}>
                        <span>CPC</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Operator Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-[28px] items-center justify-between rounded-[6px] bg-[var(--item-hover-bg)] hover:bg-[var(--item-active-bg)] px-2.5 text-[12px] font-medium text-[var(--text-primary)] outline-none cursor-pointer"
                      >
                        <span>{operator}</span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={4}>
                      <DropdownMenuItem onClick={() => setOperator('is greater than')}>
                        <span>is greater than (&gt;)</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setOperator('is less than')}>
                        <span>is less than (&lt;)</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setOperator('is between')}>
                        <span>is between</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Value Input */}
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="$30"
                    className="h-[28px] w-[100px] rounded-[6px] bg-[var(--item-hover-bg)] px-2.5 text-[12px] font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none border border-transparent focus:border-[#5e6ad2]"
                  />
                </div>
              </div>

              {/* 6. Modal Footer Actions */}
              <div className="flex items-center justify-end pt-3 border-t border-[var(--color-border-primary)] mt-2">
                {/* Right: Create more & Submit */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[12px] text-[var(--text-tertiary)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={createMore}
                      onChange={(e) => setCreateMore(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-white/20 bg-transparent text-[#5e6ad2] focus:ring-0 cursor-pointer"
                    />
                    <span>Create more</span>
                  </label>

                  <button
                    type="submit"
                    disabled={!name.trim()}
                    className="inline-flex h-[28px] items-center justify-center rounded-[6px] bg-[#5e6ad2] hover:bg-[#6875e5] disabled:opacity-50 disabled:cursor-not-allowed px-3.5 text-[12px] font-medium text-white shadow-sm transition-colors outline-none cursor-pointer"
                  >
                    Create rule
                  </button>
                </div>
              </div>
            </form>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
