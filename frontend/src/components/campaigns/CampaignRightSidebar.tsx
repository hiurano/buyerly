import React, { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { LinearPriorityBarsIcon, LinearProjectCubeIcon } from '@/icons/LinearIcons';

const RULE_COLORS: Record<string, string> = {
  'rul-01': 'lch(48 59.31 288.43)', // #5f6ad3 (Role: Backend & Bots)
  'rul-02': 'rgb(155, 81, 224)',     // #9b51e0 (Этап 1: Ядро)
  'rul-03': 'rgb(39, 174, 96)',      // #27ae60 (Трек: Продажи)
  'rul-04': 'rgb(242, 153, 74)',     // #f2994a (Этап 3: Админка)
};

export const CampaignRightSidebar: React.FC = () => {
  const {
    isRightSidebarOpen,
    activeRightSidebarTab,
    setActiveRightSidebarTab,
    rules,
    campaigns,
    campaignAttachedRules,
    selectedFilterRuleId,
    setSelectedFilterRuleId,
    selectedFilterPlatform,
    setSelectedFilterPlatform,
  } = useAppStore();

  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);

  if (!isRightSidebarOpen) return null;

  return (
    <div
      style={{
        flex: '0 0 auto',
        width: '350px',
        height: '100%',
        position: 'relative',
        zIndex: 90,
        display: 'block',
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
          padding: '8px 8px 8px 4px',
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
            {/* Segmented Tab Pills Header */}
            <div style={{ margin: '-2px 0 10px 0' }}>
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
                  <span>Labels</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeRightSidebarTab === 'priority'}
                  data-state={activeRightSidebarTab === 'priority' ? 'active' : 'inactive'}
                  onClick={() => setActiveRightSidebarTab('priority')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '28px',
                    padding: '4px 12px',
                    margin: '2px',
                    borderRadius: '9999px',
                    backgroundColor: activeRightSidebarTab === 'priority' ? 'lch(20.418 1.429 272)' : 'lch(13.861 1.043 272)',
                    color: activeRightSidebarTab === 'priority' ? 'lch(100 0 272)' : 'lch(63.304 1.425 272)',
                    fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
                    fontSize: '12px',
                    fontWeight: 500,
                    border: '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'border 0.15s, background-color 0.15s, color 0.15s, opacity 0.15s',
                    outline: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (activeRightSidebarTab !== 'priority') {
                      e.currentTarget.style.backgroundColor = 'lch(16.5 1.2 272)';
                      e.currentTarget.style.color = 'lch(90.451 1.2 272)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeRightSidebarTab !== 'priority') {
                      e.currentTarget.style.backgroundColor = 'lch(13.861 1.043 272)';
                      e.currentTarget.style.color = 'lch(63.304 1.425 272)';
                    }
                  }}
                >
                  <span>Priority</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeRightSidebarTab === 'platforms'}
                  data-state={activeRightSidebarTab === 'platforms' ? 'active' : 'inactive'}
                  onClick={() => setActiveRightSidebarTab('platforms')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '28px',
                    padding: '4px 12px',
                    margin: '2px',
                    borderRadius: '9999px',
                    backgroundColor: activeRightSidebarTab === 'platforms' ? 'lch(20.418 1.429 272)' : 'lch(13.861 1.043 272)',
                    color: activeRightSidebarTab === 'platforms' ? 'lch(100 0 272)' : 'lch(63.304 1.425 272)',
                    fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
                    fontSize: '12px',
                    fontWeight: 500,
                    border: '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'border 0.15s, background-color 0.15s, color 0.15s, opacity 0.15s',
                    outline: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (activeRightSidebarTab !== 'platforms') {
                      e.currentTarget.style.backgroundColor = 'lch(16.5 1.2 272)';
                      e.currentTarget.style.color = 'lch(90.451 1.2 272)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeRightSidebarTab !== 'platforms') {
                      e.currentTarget.style.backgroundColor = 'lch(13.861 1.043 272)';
                      e.currentTarget.style.color = 'lch(63.304 1.425 272)';
                    }
                  }}
                >
                  <span>Projects</span>
                </button>
              </div>
            </div>

            {/* Tab 1: Labels / Rules List */}
            {activeRightSidebarTab === 'rules' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', width: '310px' }}>
                {rules.map((rule) => {
                  const count = Object.values(campaignAttachedRules).filter((rIds) =>
                    rIds.includes(rule.id)
                  ).length;
                  const isSelected = selectedFilterRuleId === rule.id;
                  const isHovered = hoveredRowId === rule.id;
                  const dotColor = RULE_COLORS[rule.id] || 'lch(48 59.31 288.43)';

                  return (
                    <div key={rule.id} data-contextual-menu="true">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedFilterRuleId(rule.id)}
                        onMouseEnter={() => setHoveredRowId(rule.id)}
                        onMouseLeave={() => setHoveredRowId(null)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          width: '310px',
                          height: '42px',
                          padding: '0 10px',
                          borderRadius: '8px',
                          backgroundColor: isSelected ? 'lch(13.058 1.3 272)' : isHovered ? 'lch(13.058 1.3 272)' : 'transparent',
                          color: 'lch(100 0 272)',
                          cursor: 'default',
                          userSelect: 'none',
                          overflow: 'hidden',
                          position: 'relative',
                          transition: 'background-color 0.1s ease',
                        }}
                      >
                        <div
                          data-column-id="user"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            flex: '1 1 auto',
                            overflow: 'hidden',
                            position: 'relative',
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
                              backgroundColor: dotColor,
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
                              fontSize: '13px',
                              fontWeight: 450,
                              color: 'lch(100 0 272)',
                              whiteSpace: 'nowrap',
                              textOverflow: 'ellipsis',
                              overflow: 'hidden',
                            }}
                          >
                            {rule.name}
                          </span>

                          {/* "See issues" Hover Action Button with Linear smooth gradient mask */}
                          {isHovered && (
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFilterRuleId(rule.id);
                              }}
                              style={{
                                display: 'flex',
                                position: 'absolute',
                                top: 0,
                                right: 0,
                                bottom: 0,
                                height: '100%',
                                minWidth: '104px',
                                padding: '0 8px 0 35px',
                                margin: 0,
                                alignItems: 'center',
                                justifyContent: 'flex-end',
                                backgroundColor: 'lch(13.058 1.3 272)',
                                border: 'none',
                                borderRadius: '2px',
                                cursor: 'pointer',
                                maskImage: 'linear-gradient(to right, rgba(0, 0, 0, 0), rgb(0, 0, 0) 25px)',
                                WebkitMaskImage: 'linear-gradient(to right, rgba(0, 0, 0, 0), rgb(0, 0, 0) 25px)',
                                transition: 'color 0.15s ease',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
                                  fontSize: '12px',
                                  fontWeight: 450,
                                  color: 'lch(100 0 272)',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = 'lch(58.717 70 288.421)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = 'lch(100 0 272)';
                                }}
                              >
                                See issues
                              </span>
                            </button>
                          )}
                        </div>

                        {/* Right Count Badge */}
                        <div
                          data-column-id="row-count"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            minWidth: '24px',
                            height: '24px',
                            marginLeft: 'auto',
                          }}
                        >
                          <span
                            data-animated-number="true"
                            style={{
                              fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
                              fontSize: '13px',
                              fontWeight: 450,
                              color: 'lch(63.304 1.425 272)',
                              fontVariantNumeric: 'tabular-nums',
                              textAlign: 'right',
                            }}
                          >
                            {count}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tab 2: Priority List */}
            {activeRightSidebarTab === 'priority' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', width: '310px' }}>
                {[
                  { id: 'urgent', name: 'Urgent', icon: 'urgent', count: 1 },
                  { id: 'high', name: 'High', icon: 'high', count: 2 },
                  { id: 'medium', name: 'Medium', icon: 'medium', count: 1 },
                  { id: 'low', name: 'Low', icon: 'low', count: 0 },
                ].map((item) => {
                  const isHovered = hoveredRowId === item.id;
                  return (
                    <div key={item.id} data-contextual-menu="true">
                      <div
                        role="button"
                        tabIndex={0}
                        onMouseEnter={() => setHoveredRowId(item.id)}
                        onMouseLeave={() => setHoveredRowId(null)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          width: '310px',
                          height: '42px',
                          padding: '0 10px',
                          borderRadius: '8px',
                          backgroundColor: isHovered ? 'lch(13.058 1.3 272)' : 'transparent',
                          color: 'lch(100 0 272)',
                          cursor: 'default',
                          userSelect: 'none',
                          overflow: 'hidden',
                          position: 'relative',
                          transition: 'background-color 0.1s ease',
                        }}
                      >
                        <div
                          data-column-id="priority"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            flex: '1 1 auto',
                            overflow: 'hidden',
                            position: 'relative',
                          }}
                        >
                          <LinearPriorityBarsIcon
                            level={item.icon as 'urgent' | 'high' | 'medium' | 'low'}
                            size={16}
                            className="text-[#99999d]"
                          />
                          <span
                            style={{
                              fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
                              fontSize: '13px',
                              fontWeight: 450,
                              color: 'lch(100 0 272)',
                              whiteSpace: 'nowrap',
                              textOverflow: 'ellipsis',
                              overflow: 'hidden',
                            }}
                          >
                            {item.name}
                          </span>

                          {/* "See issues" Hover Action Button */}
                          {isHovered && (
                            <button
                              type="button"
                              tabIndex={-1}
                              style={{
                                display: 'flex',
                                position: 'absolute',
                                top: 0,
                                right: 0,
                                bottom: 0,
                                height: '100%',
                                minWidth: '104px',
                                padding: '0 8px 0 35px',
                                margin: 0,
                                alignItems: 'center',
                                justifyContent: 'flex-end',
                                backgroundColor: 'lch(13.058 1.3 272)',
                                border: 'none',
                                borderRadius: '2px',
                                cursor: 'pointer',
                                maskImage: 'linear-gradient(to right, rgba(0, 0, 0, 0), rgb(0, 0, 0) 25px)',
                                WebkitMaskImage: 'linear-gradient(to right, rgba(0, 0, 0, 0), rgb(0, 0, 0) 25px)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
                                  fontSize: '12px',
                                  fontWeight: 450,
                                  color: 'lch(100 0 272)',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = 'lch(58.717 70 288.421)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = 'lch(100 0 272)';
                                }}
                              >
                                See issues
                              </span>
                            </button>
                          )}
                        </div>

                        <div
                          data-column-id="row-count"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            minWidth: '24px',
                            height: '24px',
                            marginLeft: 'auto',
                          }}
                        >
                          <span
                            data-animated-number="true"
                            style={{
                              fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
                              fontSize: '13px',
                              fontWeight: 450,
                              color: 'lch(63.304 1.425 272)',
                              fontVariantNumeric: 'tabular-nums',
                              textAlign: 'right',
                            }}
                          >
                            {item.count}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tab 3: Projects / Platforms List */}
            {activeRightSidebarTab === 'platforms' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', width: '310px' }}>
                {[
                  { id: 'Meta', name: 'Meta Ads', color: 'lch(48 59.31 288.43)' },
                  { id: 'TikTok', name: 'TikTok Ads', color: 'rgb(39, 174, 96)' },
                  { id: 'Google', name: 'Google Ads', color: 'rgb(242, 153, 74)' },
                ].map((platform) => {
                  const count = campaigns.filter((c) => c.platform === platform.id).length;
                  const isSelected = selectedFilterPlatform === platform.id;
                  const isHovered = hoveredRowId === platform.id;

                  return (
                    <div key={platform.id} data-contextual-menu="true">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedFilterPlatform(platform.id)}
                        onMouseEnter={() => setHoveredRowId(platform.id)}
                        onMouseLeave={() => setHoveredRowId(null)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          width: '310px',
                          height: '42px',
                          padding: '0 10px',
                          borderRadius: '8px',
                          backgroundColor: isSelected ? 'lch(13.058 1.3 272)' : isHovered ? 'lch(13.058 1.3 272)' : 'transparent',
                          color: 'lch(100 0 272)',
                          cursor: 'default',
                          userSelect: 'none',
                          overflow: 'hidden',
                          position: 'relative',
                          transition: 'background-color 0.1s ease',
                        }}
                      >
                        <div
                          data-column-id="project"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            flex: '1 1 auto',
                            overflow: 'hidden',
                            position: 'relative',
                          }}
                        >
                          {/* Linear Project Hexagonal Cube Icon */}
                          <div style={{ color: platform.color, display: 'flex', alignItems: 'center' }}>
                            <LinearProjectCubeIcon size={16} />
                          </div>
                          <span
                            style={{
                              fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
                              fontSize: '13px',
                              fontWeight: 450,
                              color: 'lch(100 0 272)',
                              whiteSpace: 'nowrap',
                              textOverflow: 'ellipsis',
                              overflow: 'hidden',
                            }}
                          >
                            {platform.name}
                          </span>

                          {/* "See issues" Hover Action Button */}
                          {isHovered && (
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFilterPlatform(platform.id);
                              }}
                              style={{
                                display: 'flex',
                                position: 'absolute',
                                top: 0,
                                right: 0,
                                bottom: 0,
                                height: '100%',
                                minWidth: '104px',
                                padding: '0 8px 0 35px',
                                margin: 0,
                                alignItems: 'center',
                                justifyContent: 'flex-end',
                                backgroundColor: 'lch(13.058 1.3 272)',
                                border: 'none',
                                borderRadius: '2px',
                                cursor: 'pointer',
                                maskImage: 'linear-gradient(to right, rgba(0, 0, 0, 0), rgb(0, 0, 0) 25px)',
                                WebkitMaskImage: 'linear-gradient(to right, rgba(0, 0, 0, 0), rgb(0, 0, 0) 25px)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
                                  fontSize: '12px',
                                  fontWeight: 450,
                                  color: 'lch(100 0 272)',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = 'lch(58.717 70 288.421)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = 'lch(100 0 272)';
                                }}
                              >
                                See issues
                              </span>
                            </button>
                          )}
                        </div>

                        <div
                          data-column-id="row-count"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            minWidth: '24px',
                            height: '24px',
                            marginLeft: 'auto',
                          }}
                        >
                          <span
                            data-animated-number="true"
                            style={{
                              fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
                              fontSize: '13px',
                              fontWeight: 450,
                              color: 'lch(63.304 1.425 272)',
                              fontVariantNumeric: 'tabular-nums',
                              textAlign: 'right',
                            }}
                          >
                            {count}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
};
