import React, { useState } from 'react';
import { useAppStore, RuleItem } from '@/store/useAppStore';
import { LinearToggle } from '@/ui/LinearToggle';

const RULE_COLORS = [
  'lch(48 59.31 288.43)', // #5f6ad3 (Purple-blue)
  'rgb(155, 81, 224)',     // #9b51e0 (Purple)
  'rgb(39, 174, 96)',      // #27ae60 (Green)
  'rgb(242, 153, 74)',     // #f2994a (Orange)
  'rgb(234, 179, 8)',      // #eab308 (Yellow)
  'rgb(47, 128, 237)',     // #2f80ed (Blue)
];

const RULE_TEMPLATES: Array<Omit<RuleItem, 'id' | 'identifier'>> = [
  {
    name: 'Auto-Stop High CPA (> $25)',
    condition: 'IF CPA > $25 & Spend > $40',
    action: 'PAUSE ADSET',
    scope: 'Meta Ads • All Campaigns',
    status: 'active',
    lastRun: 'Just now',
  },
  {
    name: 'Scale Winner Budget (+20% daily)',
    condition: 'IF ROI > 140% & Leads ≥ 5',
    action: 'BUDGET +20%',
    scope: 'TikTok Ads • Broad',
    status: 'active',
    lastRun: 'Just now',
  },
  {
    name: 'Kill Zero-Conversions ($50 spend)',
    condition: 'IF Spend > $50 & Leads == 0',
    action: 'PAUSE CAMPAIGN',
    scope: 'Google Ads • Search',
    status: 'active',
    lastRun: 'Just now',
  },
  {
    name: 'Duplicate Winner AdSet (Auto-Scale)',
    condition: 'IF Conversions > 10 & CPA < $12',
    action: 'DUPLICATE ADSET',
    scope: 'Meta Ads • CBO',
    status: 'active',
    lastRun: 'Just now',
  },
];

export const CampaignRightSidebar: React.FC = () => {
  const {
    isRightSidebarOpen,
    activeRightSidebarTab,
    setActiveRightSidebarTab,
    rules,
    campaigns,
    focusedCampaignId,
    campaignAttachedRules,
    toggleRuleForCampaign,
    addRule,
  } = useAppStore();

  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState(0);

  const currentCampaign =
    campaigns.find((c) => c.id === focusedCampaignId) || campaigns[0];

  const attachedRuleIds = currentCampaign
    ? campaignAttachedRules[currentCampaign.id] || []
    : [];

  const handleCreateRule = () => {
    const template = RULE_TEMPLATES[selectedTemplateIndex];
    addRule(template);
    if (currentCampaign) {
      const nextIndex = rules.length + 1;
      const newRuleId = `rul-${String(nextIndex).padStart(2, '0')}`;
      toggleRuleForCampaign(currentCampaign.id, newRuleId);
    }
    setIsAddModalOpen(false);
  };

  const isPositiveRoi = currentCampaign ? currentCampaign.roi.startsWith('+') : true;

  return (
    <div
      style={{
        flex: '0 0 auto',
        width: '350px',
        height: '100%',
        position: 'relative',
        zIndex: 90,
        display: 'block',
        marginLeft: isRightSidebarOpen ? '0px' : '-350px',
        transform: isRightSidebarOpen ? 'none' : 'translateX(350px)',
        transition: 'margin-left 250ms cubic-bezier(0.16, 1, 0.3, 1), transform 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        pointerEvents: isRightSidebarOpen ? 'auto' : 'none',
      }}
    >
      <aside
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          width: '350px',
          height: '100%',
          overflow: 'hidden auto',
          padding: '0px 0px 8px 4px',
        }}
      >
        <div
          data-scroll-container="true"
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '346px',
            height: '100%',
            overflow: 'auto',
            scrollbarGutter: 'stable',
          }}
        >
          {/* Inner Card Container */}
          <div
            style={{
              width: '336px',
              minHeight: 'calc(100% - 8px)',
              padding: '12px',
              margin: '0px 0px 8px',
              borderRadius: '10px',
              backgroundColor: 'lch(9.232 0.85 272)', // #141416
              border: '1px solid lch(13.553 1.93 272)', // #1e1e21
              boxShadow: '0px 0.5px 1px 1px lch(0% 0 0 / 0.3)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Minimal Campaign Title (Clean, no platforms, no status badges) */}
            <div style={{ padding: '0 2px 10px 2px' }}>
              <h3
                title={currentCampaign?.name}
                style={{
                  fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'lch(90.451% 1.2 272 / 1)',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  margin: 0,
                }}
              >
                {currentCampaign?.name || 'Campaign'}
              </h3>
            </div>

            {/* 2-Tab Segmented Header: [ Правила ] | [ Сводка ] */}
            <div style={{ margin: '0 0 10px 0' }}>
              <div
                role="tablist"
                aria-orientation="horizontal"
                style={{
                  display: 'flex',
                  gap: '2px',
                  width: '310px',
                  height: '32px',
                  margin: '-2px 0',
                  backgroundColor: 'lch(9.232 0.85 272)',
                  borderRadius: '5px',
                  alignItems: 'center',
                }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeRightSidebarTab === 'rules'}
                  data-state={activeRightSidebarTab === 'rules' ? 'active' : 'inactive'}
                  onClick={() => setActiveRightSidebarTab('rules')}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '28px',
                    padding: '4px 12px',
                    margin: '2px',
                    borderRadius: '9999px',
                    backgroundColor: activeRightSidebarTab === 'rules' ? 'lch(20.418 1.429 272)' : 'lch(13.861 1.043 272)',
                    color: activeRightSidebarTab === 'rules' ? 'lch(100 0 272)' : 'lch(63.304 1.425 272)',
                    fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
                    fontSize: '12px',
                    fontWeight: 500,
                    border: '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'border 0.15s, background-color 0.15s, color 0.15s, opacity 0.15s',
                    outline: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (activeRightSidebarTab !== 'rules') {
                      e.currentTarget.style.backgroundColor = 'lch(16.5 1.2 272)';
                      e.currentTarget.style.color = 'lch(90.451 1.2 272)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeRightSidebarTab !== 'rules') {
                      e.currentTarget.style.backgroundColor = 'lch(13.861 1.043 272)';
                      e.currentTarget.style.color = 'lch(63.304 1.425 272)';
                    }
                  }}
                >
                  <span>Rules</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeRightSidebarTab === 'overview'}
                  data-state={activeRightSidebarTab === 'overview' ? 'active' : 'inactive'}
                  onClick={() => setActiveRightSidebarTab('overview')}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '28px',
                    padding: '4px 12px',
                    margin: '2px',
                    borderRadius: '9999px',
                    backgroundColor: activeRightSidebarTab === 'overview' ? 'lch(20.418 1.429 272)' : 'lch(13.861 1.043 272)',
                    color: activeRightSidebarTab === 'overview' ? 'lch(100 0 272)' : 'lch(63.304 1.425 272)',
                    fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
                    fontSize: '12px',
                    fontWeight: 500,
                    border: '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'border 0.15s, background-color 0.15s, color 0.15s, opacity 0.15s',
                    outline: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (activeRightSidebarTab !== 'overview') {
                      e.currentTarget.style.backgroundColor = 'lch(16.5 1.2 272)';
                      e.currentTarget.style.color = 'lch(90.451 1.2 272)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeRightSidebarTab !== 'overview') {
                      e.currentTarget.style.backgroundColor = 'lch(13.861 1.043 272)';
                      e.currentTarget.style.color = 'lch(63.304 1.425 272)';
                    }
                  }}
                >
                  <span>Overview</span>
                </button>
              </div>
            </div>

            {/* TAB 1: ПРАВИЛА (СИНХРОНИЗИРОВАНЫ С ВЫБРАННОЙ СВЯЗКОЙ) */}
            {activeRightSidebarTab === 'rules' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', width: '310px' }}>
                {rules.map((rule, idx) => {
                  const isAttached = attachedRuleIds.includes(rule.id);
                  const isHovered = hoveredRowId === rule.id;
                  const dotColor = RULE_COLORS[idx % RULE_COLORS.length];

                  return (
                    <div key={rule.id} data-contextual-menu="true">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (currentCampaign) {
                            toggleRuleForCampaign(currentCampaign.id, rule.id);
                          }
                        }}
                        onMouseEnter={() => setHoveredRowId(rule.id)}
                        onMouseLeave={() => setHoveredRowId(null)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          width: '310px',
                          height: '42px',
                          padding: '0 10px',
                          borderRadius: '8px',
                          backgroundColor: isHovered ? 'lch(13.058 1.3 272)' : 'transparent',
                          color: isAttached ? 'lch(100 0 272)' : 'lch(61.803% 1.2 272 / 1)',
                          cursor: 'pointer',
                          userSelect: 'none',
                          overflow: 'hidden',
                          position: 'relative',
                          transition: 'background-color 0.1s ease',
                          gap: '8px',
                        }}
                      >
                        {/* 9px Colored Dot */}
                        <div
                          aria-hidden="true"
                          style={{
                            width: '9px',
                            height: '9px',
                            minWidth: '9px',
                            minHeight: '9px',
                            borderRadius: '50%',
                            backgroundColor: isAttached ? dotColor : '#3f3f46',
                            flexShrink: 0,
                            transition: 'background-color 0.15s ease',
                          }}
                        />

                        {/* Rule Name */}
                        <div
                          style={{
                            flex: '1 1 auto',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                          }}
                        >
                          <span
                            style={{
                              fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
                              fontSize: '13px',
                              fontWeight: 450,
                              lineHeight: '16px',
                              color: isAttached ? 'lch(100 0 272)' : '#71717a',
                              whiteSpace: 'nowrap',
                              textOverflow: 'ellipsis',
                              overflow: 'hidden',
                            }}
                          >
                            {rule.name}
                          </span>
                        </div>

                        {/* Inline LinearToggle Switch for this campaign */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            if (currentCampaign) {
                              toggleRuleForCampaign(currentCampaign.id, rule.id);
                            }
                          }}
                          style={{ flexShrink: 0 }}
                        >
                          <LinearToggle
                            checked={isAttached}
                            onChange={() => {
                              if (currentCampaign) {
                                toggleRuleForCampaign(currentCampaign.id, rule.id);
                              }
                            }}
                            tooltipContent={isAttached ? 'Detach rule' : 'Attach rule'}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* + Add Rule Button */}
                <div style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(true)}
                    style={{
                      width: '100%',
                      height: '32px',
                      padding: '0 10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      borderRadius: '6px',
                      border: '1px dashed lch(13.553 1.93 272)',
                      backgroundColor: 'transparent',
                      color: 'lch(63.304 1.425 272)',
                      fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'background-color 0.15s, color 0.15s, border-color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'lch(13.058 1.3 272)';
                      e.currentTarget.style.color = 'lch(100 0 272)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'lch(63.304 1.425 272)';
                      e.currentTarget.style.borderColor = 'lch(13.553 1.93 272)';
                    }}
                  >
                    <span style={{ fontSize: '14px', lineHeight: 1 }}>+</span>
                    <span>Add rule...</span>
                  </button>
                </div>

                {/* Quick Add Rule Inline Modal / Popover */}
                {isAddModalOpen && (
                  <div
                    style={{
                      marginTop: '8px',
                      padding: '10px',
                      borderRadius: '8px',
                      backgroundColor: 'lch(12 1 272)',
                      border: '1px solid lch(18 1.5 272)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span
                        style={{
                          fontFamily: '"Inter Variable", sans-serif',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#e4e5e8',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        Choose Template
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsAddModalOpen(false)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#71717a',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '2px',
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <line x1="3" y1="3" x2="13" y2="13" />
                          <line x1="13" y1="3" x2="3" y2="13" />
                        </svg>
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {RULE_TEMPLATES.map((tmpl, tIdx) => {
                        const isChosen = selectedTemplateIndex === tIdx;
                        return (
                          <div
                            key={tIdx}
                            onClick={() => setSelectedTemplateIndex(tIdx)}
                            style={{
                              padding: '6px 8px',
                              borderRadius: '6px',
                              backgroundColor: isChosen ? 'lch(20.418 1.429 272)' : 'transparent',
                              border: isChosen ? '1px solid rgba(234, 179, 8, 0.4)' : '1px solid transparent',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px',
                            }}
                          >
                            <span
                              style={{
                                fontFamily: '"Inter Variable", sans-serif',
                                fontSize: '12px',
                                fontWeight: 500,
                                color: isChosen ? '#ffffff' : '#a1a1aa',
                              }}
                            >
                              {tmpl.name}
                            </span>
                            <span
                              style={{
                                fontFamily: '"Inter Variable", sans-serif',
                                fontSize: '10px',
                                color: '#71717a',
                              }}
                            >
                              {tmpl.condition}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                      <button
                        type="button"
                        onClick={handleCreateRule}
                        style={{
                          flex: 1,
                          height: '26px',
                          borderRadius: '4px',
                          backgroundColor: '#eab308',
                          color: '#000000',
                          border: 'none',
                          fontFamily: '"Inter Variable", sans-serif',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Add Rule
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddModalOpen(false)}
                        style={{
                          height: '26px',
                          padding: '0 8px',
                          borderRadius: '4px',
                          backgroundColor: 'transparent',
                          color: '#a1a1aa',
                          border: '1px solid #27272a',
                          fontFamily: '"Inter Variable", sans-serif',
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: СВОДКА (ЧИСТЫЕ МЕТРИКИ ВЫБРАННОЙ СВЯЗКИ) */}
            {activeRightSidebarTab === 'overview' && currentCampaign && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '310px' }}>
                {/* Campaign Metrics Card */}
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: 'lch(11 0.8 272)',
                    border: '1px solid lch(13.553 1.93 272)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <span
                    style={{
                      fontFamily: '"Inter Variable", sans-serif',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'lch(63.304 1.425 272)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Campaign Telemetry
                  </span>

                  {/* Daily Budget */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#a1a1aa' }}>Daily Budget</span>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#fefeff', fontVariantNumeric: 'tabular-nums' }}>
                      {currentCampaign.budget}
                    </span>
                  </div>

                  {/* Leads & CPA */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#a1a1aa' }}>Leads (CPA)</span>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#fefeff', fontVariantNumeric: 'tabular-nums' }}>
                      {currentCampaign.leadsCount} leads <span style={{ color: '#94969b', fontSize: '11px' }}>(${currentCampaign.cpa})</span>
                    </span>
                  </div>

                  {/* Spend */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#a1a1aa' }}>Total Spend</span>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#fefeff', fontVariantNumeric: 'tabular-nums' }}>
                      {currentCampaign.spend}
                    </span>
                  </div>

                  {/* ROI */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#a1a1aa' }}>ROI</span>
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: isPositiveRoi ? '#4ade80' : '#ef4444',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {currentCampaign.roi}
                    </span>
                  </div>
                </div>

                {/* Funnel Telemetry */}
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: 'lch(11 0.8 272)',
                    border: '1px solid lch(13.553 1.93 272)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <span
                    style={{
                      fontFamily: '"Inter Variable", sans-serif',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'lch(63.304 1.425 272)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Funnel Rates
                  </span>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#a1a1aa' }}>Avg CTR</span>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: '#fefeff' }}>2.84%</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#a1a1aa' }}>Avg CPC</span>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: '#fefeff' }}>$0.42</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#a1a1aa' }}>Avg CPM</span>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: '#fefeff' }}>$11.20</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
};
