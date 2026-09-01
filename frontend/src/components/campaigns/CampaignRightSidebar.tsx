import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { CampaignGroup, RuleItem } from '@/store/useAppStore';
import { LinearBoltIcon } from '@/icons/LinearIcons';

const SIDEBAR_FONT =
  '"Inter Variable", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const SIDEBAR_MIN_WIDTH = 350;
const SIDEBAR_MAX_WIDTH = 600;
const SIDEBAR_DEFAULT_WIDTH = 350;
const SIDEBAR_WIDTH_STORAGE_KEY = 'buyerly:campaign-sidebar-width:v2';

const SIDEBAR_TABS = [
  { id: 'groups', label: 'Groups' },
  { id: 'rules', label: 'Rules' },
] as const;

const clampSidebarWidth = (width: number) =>
  Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));

const getInitialSidebarWidth = () => {
  if (typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH;

  const storedWidth = Number.parseFloat(
    window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY) ?? ''
  );

  return Number.isFinite(storedWidth)
    ? clampSidebarWidth(storedWidth)
    : SIDEBAR_DEFAULT_WIDTH;
};

interface SidebarFilterRowProps {
  name: string;
  count: number;
  leading: React.ReactNode;
  isActive: boolean;
  isHovered: boolean;
  onToggle: () => void;
  onClear: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/** Linear sidebar row: stable count column with a hover action inside the content column. */
const SidebarFilterRow: React.FC<SidebarFilterRowProps> = ({
  name,
  count,
  leading,
  isActive,
  isHovered,
  onToggle,
  onClear,
  onMouseEnter,
  onMouseLeave,
}) => (
  <div
    role="button"
    tabIndex={0}
    aria-pressed={isActive}
    onClick={onToggle}
    onMouseEnter={onMouseEnter}
    onMouseLeave={onMouseLeave}
    style={{
      display: 'flex',
      alignItems: 'center',
      height: 42,
      padding: '0 10px',
      borderRadius: 8,
      cursor: 'pointer',
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: isHovered
        ? 'var(--item-hover-bg)'
        : isActive
        ? 'var(--item-active-bg)'
        : 'transparent',
      transition: 'background-color 150ms ease',
    }}
  >
    <div
      data-column-id="content"
      style={{
        display: 'flex',
        minWidth: 0,
        flex: 1,
        alignItems: 'center',
      }}
    >
      {leading}
      <span
        title={name}
        style={{
          minWidth: 0,
          flex: 1,
          overflow: 'hidden',
          color: 'var(--text-primary)',
          fontFamily: SIDEBAR_FONT,
          fontSize: 13,
          fontWeight: 450,
          lineHeight: '16px',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>

      {isHovered && (
        <button
          type="button"
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            if (isActive) onClear();
            else onToggle();
          }}
          style={{
            display: 'flex',
            height: 16,
            flexShrink: 0,
            alignItems: 'center',
            padding: '0 8px 0 35px',
            border: 0,
            outline: 0,
            background: 'transparent',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontFamily: SIDEBAR_FONT,
            fontSize: 13,
            fontWeight: 450,
            lineHeight: '16px',
            whiteSpace: 'nowrap',
            transition: 'color 150ms ease',
          }}
        >
          {isActive ? 'Clear' : 'View'}
        </button>
      )}
    </div>

    <span
      data-column-id="row-count"
      style={{
        flexShrink: 0,
        color: 'var(--text-tertiary)',
        fontFamily: SIDEBAR_FONT,
        fontSize: 13,
        fontWeight: 450,
        lineHeight: '16px',
      }}
    >
      {count}
    </span>
  </div>
);

export const CampaignRightSidebar: React.FC = () => {
  const {
    isRightSidebarOpen,
    activeRightSidebarTab,
    setActiveRightSidebarTab,
    campaignGroups,
    rules,
    campaigns,
    adSets,
    ads,
    campaignAttachedRules,
    campaignFilterTab,
    adsManagerQuickFilter,
    setAdsManagerQuickFilter,
  } = useAppStore();

  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [hoveredTab, setHoveredTab] = useState<'groups' | 'rules' | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(getInitialSidebarWidth);
  const [isResizing, setIsResizing] = useState(false);
  const [isResizeHandleHovered, setIsResizeHandleHovered] = useState(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(sidebarWidth);
  const currentSidebarWidthRef = useRef(sidebarWidth);

  useEffect(() => {
    currentSidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isResizing) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    const finishResize = () => {
      window.localStorage.setItem(
        SIDEBAR_WIDTH_STORAGE_KEY,
        String(currentSidebarWidthRef.current)
      );
      setIsResizing(false);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const nextWidth = clampSidebarWidth(
        resizeStartWidthRef.current + resizeStartXRef.current - event.clientX
      );
      currentSidebarWidthRef.current = nextWidth;
      setSidebarWidth(nextWidth);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishResize);
    window.addEventListener('blur', finishResize);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishResize);
      window.removeEventListener('blur', finishResize);
    };
  }, [isResizing]);

  const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    event.preventDefault();
    resizeStartXRef.current = event.clientX;
    resizeStartWidthRef.current = sidebarWidth;
    currentSidebarWidthRef.current = sidebarWidth;
    setIsResizing(true);
  };

  const getCampaignForAdSet = (campaignId: string) =>
    campaigns.find((campaign) => campaign.id === campaignId);

  const getCampaignForAd = (adSetId: string) => {
    const adSet = adSets.find((candidate) => candidate.id === adSetId);
    return adSet ? getCampaignForAdSet(adSet.campaignId) : undefined;
  };

  // Counts follow the entity currently shown in Ads Manager.
  const getGroupItemCount = (group: CampaignGroup) => {
    if (campaignFilterTab === 'adsets') {
      return adSets.filter((adSet) =>
        getCampaignForAdSet(adSet.campaignId)?.groupIds.includes(group.id)
      ).length;
    }
    if (campaignFilterTab === 'ads') {
      return ads.filter((ad) => getCampaignForAd(ad.adSetId)?.groupIds.includes(group.id)).length;
    }
    return campaigns.filter((campaign) => campaign.groupIds.includes(group.id)).length;
  };

  // Rule assignments are inherited by child ad sets and ads from their campaign.
  const getRuleItemCount = (rule: RuleItem) => {
    const campaignHasRule = (campaignId: string) =>
      (campaignAttachedRules[campaignId] || []).includes(rule.id);

    if (campaignFilterTab === 'adsets') {
      return adSets.filter((adSet) => campaignHasRule(adSet.campaignId)).length;
    }
    if (campaignFilterTab === 'ads') {
      return ads.filter((ad) => {
        const campaign = getCampaignForAd(ad.adSetId);
        return campaign ? campaignHasRule(campaign.id) : false;
      }).length;
    }
    return campaigns.filter((campaign) =>
      campaignHasRule(campaign.id)
    ).length;
  };

  const groupFieldId = 'group';
  const ruleFieldId = 'rule';

  const isQuickFilterActive = (fieldId: string, value: string) => {
    return (
      adsManagerQuickFilter?.entity === campaignFilterTab &&
      adsManagerQuickFilter.fieldId === fieldId &&
      adsManagerQuickFilter.value === value
    );
  };

  const toggleQuickFilter = (sidebarTab: 'groups' | 'rules', fieldId: 'group' | 'rule', value: string) => {
    if (isQuickFilterActive(fieldId, value)) {
      setAdsManagerQuickFilter(null);
      return;
    }
    setAdsManagerQuickFilter({ entity: campaignFilterTab, sidebarTab, fieldId, value });
  };

  if (!isRightSidebarOpen) return null;

  return (
    <div
      style={{
        flex: '0 0 auto',
        width: sidebarWidth,
        height: '100%',
        position: 'relative',
        zIndex: 90,
        display: 'block',
      }}
    >
      <div
        aria-hidden="true"
        data-sidebar-resize-handle="true"
        onPointerDown={handleResizePointerDown}
        onMouseEnter={() => setIsResizeHandleHovered(true)}
        onMouseLeave={() => setIsResizeHandleHovered(false)}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: -3,
          width: 7,
          zIndex: 91,
          cursor: 'col-resize',
          touchAction: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 3,
            width: 1,
            backgroundColor: 'var(--color-border-secondary)',
            opacity: isResizing || isResizeHandleHovered ? 1 : 0,
            transition: 'opacity 250ms',
          }}
        />
      </div>

      <aside
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          width: sidebarWidth,
          height: '100%',
          overflow: 'hidden auto',
          padding: '0px 0px 0px 4px',
        }}
      >
        <div
          data-scroll-container="true"
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: sidebarWidth - 4,
            height: '100%',
            overflow: 'auto',
            scrollbarGutter: 'stable',
          }}
        >
          {/* Linear card keeps the same 10px right inset at every sidebar width. */}
          <div
            style={{
              width: sidebarWidth - 14,
              minHeight: 'calc(100% - 8px)',
              padding: '12px',
              margin: '0px 0px 8px',
              borderRadius: '10px',
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--sidebar-card-border)',
              boxShadow: 'var(--canvas-shadow)',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
              userSelect: 'none',
            }}
          >
            {/* Pill Tab Header (Exact Linear 32px height & 28px pill) */}
            <div
              role="tablist"
              aria-orientation="horizontal"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                width: '100%',
                height: '32px',
                marginBottom: '8px',
                borderRadius: '5px',
                backgroundColor: 'var(--card-bg)',
                transform: 'translateY(-2px)',
              }}
            >
              {SIDEBAR_TABS.map((tab) => {
                const isActive = activeRightSidebarTab === tab.id;
                const isHovered = hoveredTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    className="campaign-sidebar-tab"
                    data-state={isActive ? 'active' : 'inactive'}
                    aria-selected={isActive}
                    onClick={() => setActiveRightSidebarTab(tab.id)}
                    onMouseEnter={() => setHoveredTab(tab.id)}
                    onMouseLeave={() => setHoveredTab(null)}
                    style={{
                      display: 'inline-flex',
                      flex: '1 0 auto',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      height: '28px',
                      margin: '2px',
                      padding: '4px 12px',
                      borderRadius: '9999px',
                      backgroundColor: isActive
                        ? 'var(--sidebar-tab-active-bg)'
                        : isHovered
                        ? 'var(--sidebar-tab-hover-bg)'
                        : 'var(--sidebar-tab-inactive-bg)',
                      color: isActive
                        ? 'var(--sidebar-tab-active-text)'
                        : isHovered
                        ? 'var(--sidebar-tab-hover-text)'
                        : 'var(--sidebar-tab-inactive-text)',
                      fontFamily: SIDEBAR_FONT,
                      fontSize: '12px',
                      fontWeight: 500,
                      border: '1px solid transparent',
                      cursor: 'default',
                      outline: 'none',
                      whiteSpace: 'nowrap',
                      transition:
                        'border 150ms, background-color 150ms, color 150ms, opacity 150ms',
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* List Container */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1px',
              }}
            >
              {/* 1. Groups Tab Content */}
              {activeRightSidebarTab === 'groups' &&
                campaignGroups.map((group) => {
                  const count = getGroupItemCount(group);
                  const isActive = isQuickFilterActive(groupFieldId, group.id);
                  const isHovered = hoveredItemId === group.id;
                  const dotColor = group.color;

                  return (
                    <SidebarFilterRow
                      key={group.id}
                      name={group.name}
                      count={count}
                      isActive={isActive}
                      isHovered={isHovered}
                      onToggle={() => toggleQuickFilter('groups', groupFieldId, group.id)}
                      onClear={() => setAdsManagerQuickFilter(null)}
                      onMouseEnter={() => setHoveredItemId(group.id)}
                      onMouseLeave={() => setHoveredItemId(null)}
                      leading={
                        <span
                          aria-hidden="true"
                          style={{
                            display: 'block',
                            width: 9,
                            height: 9,
                            marginRight: 8,
                            flexShrink: 0,
                            borderRadius: '50%',
                            backgroundColor: dotColor,
                          }}
                        />
                      }
                    />
                  );
                })}

              {/* 2. Rules Tab Content */}
              {activeRightSidebarTab === 'rules' &&
                rules.map((rule) => {
                  const count = getRuleItemCount(rule);
                  const isActive = isQuickFilterActive(ruleFieldId, rule.id);
                  const isHovered = hoveredItemId === rule.id;

                  return (
                    <SidebarFilterRow
                      key={rule.id}
                      name={rule.name}
                      count={count}
                      isActive={isActive}
                      isHovered={isHovered}
                      onToggle={() => toggleQuickFilter('rules', ruleFieldId, rule.id)}
                      onClear={() => setAdsManagerQuickFilter(null)}
                      onMouseEnter={() => setHoveredItemId(rule.id)}
                      onMouseLeave={() => setHoveredItemId(null)}
                      leading={
                        <span
                          aria-hidden="true"
                          style={{
                            display: 'flex',
                            width: 16,
                            height: 16,
                            marginRight: 8,
                            flexShrink: 0,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <LinearBoltIcon size={13} className="text-[#eab308]" />
                        </span>
                      }
                    />
                  );
                })}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};
