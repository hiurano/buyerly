import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { LinearToggle } from '../../ui/LinearToggle';

type Tab = 'rules' | 'properties';

const DOT_COLORS = [
  '#5f6ad3',
  '#27ae60',
  '#f2994a',
  '#eab308',
  '#e53935',
  '#00bcd4',
];

export function CampaignDetailsDrawer() {
  const [activeTab, setActiveTab] = useState<Tab>('rules');
  const drawerRef = useRef<HTMLDivElement>(null);

  const {
    activeDetailsCampaignId,
    closeCampaignDetails,
    campaigns,
    rules,
    campaignAttachedRules,
    toggleRuleForCampaign,
  } = useAppStore();

  const campaign = campaigns.find((c) => c.id === activeDetailsCampaignId);
  const attachedRuleIds = activeDetailsCampaignId
    ? campaignAttachedRules[activeDetailsCampaignId] || []
    : [];

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCampaignDetails();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeCampaignDetails]);

  if (!campaign) return null;

  return (
    <div
      ref={drawerRef}
      style={{
        flex: '0 0 auto',
        width: '350px',
        height: '100%',
        position: 'relative',
        zIndex: 90,
      }}
    >
      <aside
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          inset: 0,
          width: '350px',
          height: '100%',
          overflowY: 'auto',
          paddingLeft: '4px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '336px',
            padding: '12px',
            marginBottom: '8px',
            borderRadius: '8px',
            background: '#1b1a1a',
            border: '1px solid #222224',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
              minHeight: '24px',
            }}
          >
            <span
              style={{
                fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
                fontSize: '13px',
                fontWeight: 500,
                color: '#fefeff',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: '1 1 auto',
                marginRight: '8px',
              }}
            >
              {campaign.name}
            </span>
            <button
              onClick={closeCampaignDetails}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                flex: '0 0 auto',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                borderRadius: '4px',
                color: '#717375',
                padding: 0,
                transition: 'color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#fefeff';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#717375';
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
              aria-label="Close details"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M1 1L11 11M11 1L1 11"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* Segmented Tab Pills */}
          <div
            role="tablist"
            aria-orientation="horizontal"
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '2px',
              height: '32px',
              marginBottom: '10px',
            }}
          >
            <TabPill
              label="Rules"
              active={activeTab === 'rules'}
              onClick={() => setActiveTab('rules')}
            />
            <TabPill
              label="Properties"
              active={activeTab === 'properties'}
              onClick={() => setActiveTab('properties')}
            />
          </div>

          {/* Tab Content */}
          {activeTab === 'rules' && (
            <RulesTab
              rules={rules}
              attachedRuleIds={attachedRuleIds}
              campaignId={campaign.id}
              toggleRuleForCampaign={toggleRuleForCampaign}
            />
          )}
          {activeTab === 'properties' && (
            <PropertiesTab campaign={campaign} />
          )}
        </div>
      </aside>
    </div>
  );
}

/* ---- Tab Pill ---- */
function TabPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-state={active ? 'active' : 'inactive'}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '28px',
        padding: '4px 12px',
        margin: '2px',
        borderRadius: '9999px',
        border: '1px solid transparent',
        background: active ? '#313132' : '#222225',
        color: active ? '#fefeff' : '#99999d',
        fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
        fontSize: '12px',
        fontWeight: 500,
        cursor: 'default',
        transition: 'background 0.15s, color 0.15s',
        outline: 'none',
      }}
    >
      {label}
    </button>
  );
}

/* ---- Rules Tab ---- */
function RulesTab({
  rules,
  attachedRuleIds,
  campaignId,
  toggleRuleForCampaign,
}: {
  rules: { id: string; name: string; condition: string; }[];
  attachedRuleIds: string[];
  campaignId: string;
  toggleRuleForCampaign: (campaignId: string, ruleId: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1px',
      }}
    >
      {rules.map((rule, i) => {
        const isOn = attachedRuleIds.includes(rule.id);
        return (
          <RuleRow
            key={rule.id}
            dotColor={DOT_COLORS[i % DOT_COLORS.length]}
            name={rule.name}
            condition={rule.condition}
            isOn={isOn}
            onToggle={() => toggleRuleForCampaign(campaignId, rule.id)}
          />
        );
      })}
    </div>
  );
}

/* ---- Rule Row ---- */
function RuleRow({
  dotColor,
  name,
  condition,
  isOn,
  onToggle,
}: {
  dotColor: string;
  name: string;
  condition: string;
  isOn: boolean;
  onToggle: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        height: '42px',
        padding: '0 10px',
        borderRadius: '8px',
        background: hovered ? '#222524' : '#1b1a1a',
        cursor: 'default',
        userSelect: 'none',
        overflow: 'hidden',
        transition: 'background 0.1s',
        gap: '8px',
      }}
    >
      {/* 9px color dot */}
      <div
        aria-hidden="true"
        style={{
          width: '9px',
          height: '9px',
          minWidth: '9px',
          minHeight: '9px',
          borderRadius: '50%',
          background: dotColor,
          flexShrink: 0,
        }}
      />
      {/* Name + condition */}
      <div
        style={{
          flex: '1 1 auto',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: '1px',
        }}
      >
        <span
          style={{
            fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
            fontSize: '13px',
            fontWeight: 450,
            color: '#fefeff',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: '16px',
          }}
        >
          {name}
        </span>
        <span
          style={{
            fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
            fontSize: '11px',
            fontWeight: 400,
            color: '#717375',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: '14px',
          }}
        >
          {condition}
        </span>
      </div>
      {/* Toggle */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        style={{ flexShrink: 0 }}
      >
        <LinearToggle
          checked={isOn}
          onChange={() => onToggle()}
          tooltipContent={isOn ? "Disable rule" : "Enable rule"}
        />
      </div>
    </div>
  );
}

/* ---- Properties Tab ---- */
function PropertiesTab({
  campaign,
}: {
  campaign: {
    platform: string;
    budget: string;
    leadsCount: number;
    cpa: string;
    spend: string;
    roi: string;
    status: string;
  };
}) {
  const properties = [
    { label: 'Platform', value: campaign.platform },
    { label: 'Daily Budget', value: campaign.budget },
    { label: 'Leads (CPA)', value: `${campaign.leadsCount} leads (${campaign.cpa})` },
    { label: 'Spend', value: campaign.spend },
    { label: 'ROI', value: campaign.roi },
    { label: 'Status', value: campaign.status === 'active' ? '🟢 Active' : '⏸ Paused' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
      {properties.map(({ label, value }) => (
        <div
          key={label}
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '34px',
            padding: '0 10px',
            borderRadius: '6px',
            gap: '8px',
          }}
        >
          <span
            style={{
              fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
              fontSize: '12px',
              fontWeight: 400,
              color: '#717375',
              width: '90px',
              flexShrink: 0,
            }}
          >
            {label}
          </span>
          <span
            style={{
              fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
              fontSize: '13px',
              fontWeight: 450,
              color: '#fefeff',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}
