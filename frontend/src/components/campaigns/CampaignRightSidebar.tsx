import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { LinearPriorityBarsIcon } from '@/icons/LinearIcons';

const RULE_COLORS: Record<string, string> = {
  'rul-01': '#5f6ad3', // Purple-blue (Role: Backend & Bots)
  'rul-02': '#9b51e0', // Purple (Этап 1: Ядро)
  'rul-03': '#27ae60', // Green (Трек: Продажи)
  'rul-04': '#f2994a', // Orange (Этап 3: Админка)
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
          padding: '0px 0px 0px 4px',
        }}
      >
        <div
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
              borderRadius: '8px',
              background: '#1b1a1a',
              border: '1px solid #222224',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Segmented Tab Pills Header */}
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
                  background: '#1b1a1a',
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
                    background: activeRightSidebarTab === 'rules' ? '#313132' : '#222225',
                    color: activeRightSidebarTab === 'rules' ? '#fefeff' : '#99999d',
                    fontSize: '12px',
                    fontWeight: 500,
                    border: '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    outline: 'none',
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
                    background: activeRightSidebarTab === 'priority' ? '#313132' : '#222225',
                    color: activeRightSidebarTab === 'priority' ? '#fefeff' : '#99999d',
                    fontSize: '12px',
                    fontWeight: 500,
                    border: '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    outline: 'none',
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
                    background: activeRightSidebarTab === 'platforms' ? '#313132' : '#222225',
                    color: activeRightSidebarTab === 'platforms' ? '#fefeff' : '#99999d',
                    fontSize: '12px',
                    fontWeight: 500,
                    border: '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    outline: 'none',
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
                  const dotColor = RULE_COLORS[rule.id] || '#5f6ad3';

                  return (
                    <div key={rule.id} data-contextual-menu="true">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedFilterRuleId(rule.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          width: '310px',
                          height: '42px',
                          padding: '0 10px',
                          borderRadius: '8px',
                          background: isSelected ? '#222524' : '#1b1a1a',
                          color: '#fefeff',
                          cursor: 'pointer',
                          userSelect: 'none',
                          overflow: 'hidden',
                          position: 'relative',
                          transition: 'background-color 0.1s ease',
                        }}
                        className="hover:bg-[#222524]"
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            flex: '1 1 auto',
                            overflow: 'hidden',
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
                            }}
                          />
                          <span
                            style={{
                              fontSize: '13px',
                              fontWeight: 450,
                              color: '#fefeff',
                              whiteSpace: 'nowrap',
                              textOverflow: 'ellipsis',
                              overflow: 'hidden',
                            }}
                          >
                            {rule.name}
                          </span>
                        </div>

                        {/* Right Count Badge */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            width: '24px',
                            height: '24px',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '13px',
                              fontWeight: 450,
                              color: '#99999d',
                            }}
                          >
                            <span>{count}</span>
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
                ].map((item) => (
                  <div key={item.id} data-contextual-menu="true">
                    <div
                      role="button"
                      tabIndex={0}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        width: '310px',
                        height: '42px',
                        padding: '0 10px',
                        borderRadius: '8px',
                        background: '#1b1a1a',
                        color: '#fefeff',
                        cursor: 'pointer',
                        userSelect: 'none',
                        overflow: 'hidden',
                        position: 'relative',
                        transition: 'background-color 0.1s ease',
                      }}
                      className="hover:bg-[#222524]"
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          flex: '1 1 auto',
                          overflow: 'hidden',
                        }}
                      >
                        <LinearPriorityBarsIcon
                          level={item.icon as 'urgent' | 'high' | 'medium' | 'low'}
                          size={14}
                          className="text-[#99999d]"
                        />
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 450,
                            color: '#fefeff',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            overflow: 'hidden',
                          }}
                        >
                          {item.name}
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          width: '24px',
                          height: '24px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 450,
                            color: '#99999d',
                          }}
                        >
                          <span>{item.count}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tab 3: Projects / Platforms List */}
            {activeRightSidebarTab === 'platforms' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', width: '310px' }}>
                {[
                  { id: 'Meta', name: 'Meta Ads', color: '#5f6ad3' },
                  { id: 'TikTok', name: 'TikTok Ads', color: '#27ae60' },
                  { id: 'Google', name: 'Google Ads', color: '#f2994a' },
                ].map((platform) => {
                  const count = campaigns.filter((c) => c.platform === platform.id).length;
                  const isSelected = selectedFilterPlatform === platform.id;

                  return (
                    <div key={platform.id} data-contextual-menu="true">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedFilterPlatform(platform.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          width: '310px',
                          height: '42px',
                          padding: '0 10px',
                          borderRadius: '8px',
                          background: isSelected ? '#222524' : '#1b1a1a',
                          color: '#fefeff',
                          cursor: 'pointer',
                          userSelect: 'none',
                          overflow: 'hidden',
                          position: 'relative',
                          transition: 'background-color 0.1s ease',
                        }}
                        className="hover:bg-[#222524]"
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            flex: '1 1 auto',
                            overflow: 'hidden',
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
                              backgroundColor: platform.color,
                            }}
                          />
                          <span
                            style={{
                              fontSize: '13px',
                              fontWeight: 450,
                              color: '#fefeff',
                              whiteSpace: 'nowrap',
                              textOverflow: 'ellipsis',
                              overflow: 'hidden',
                            }}
                          >
                            {platform.name}
                          </span>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            width: '24px',
                            height: '24px',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '13px',
                              fontWeight: 450,
                              color: '#99999d',
                            }}
                          >
                            <span>{count}</span>
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
