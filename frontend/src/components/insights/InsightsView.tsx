import React, { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';

type TimeRange = 'today' | '7d' | '14d' | '30d';
type MetricView = 'spend_revenue' | 'cpa_leads' | 'roi';

export const InsightsView: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [metricView, setMetricView] = useState<MetricView>('spend_revenue');

  const { campaigns } = useAppStore();

  // Mock performance dynamic points for 7 Days
  const chartData = [
    { day: 'Mon', spend: 1420, revenue: 3200, leads: 163, cpa: 8.71, roi: 125 },
    { day: 'Tue', spend: 1650, revenue: 4100, leads: 194, cpa: 8.50, roi: 148 },
    { day: 'Wed', spend: 1890, revenue: 4600, leads: 220, cpa: 8.59, roi: 143 },
    { day: 'Thu', spend: 2100, revenue: 5300, leads: 245, cpa: 8.57, roi: 152 },
    { day: 'Fri', spend: 2400, revenue: 6100, leads: 278, cpa: 8.63, roi: 154 },
    { day: 'Sat', spend: 2350, revenue: 5800, leads: 268, cpa: 8.76, roi: 146 },
    { day: 'Sun', spend: 2430, revenue: 5360, leads: 280, cpa: 8.67, roi: 120 },
  ];

  const maxVal = Math.max(...chartData.map((d) => d.revenue)) * 1.15;
  const chartHeight = 180;
  const chartWidth = 700;

  const getPoints = (key: 'spend' | 'revenue') => {
    return chartData.map((d, i) => {
      const x = (i / (chartData.length - 1)) * (chartWidth - 40) + 20;
      const y = chartHeight - (d[key] / maxVal) * (chartHeight - 30) - 15;
      return { x, y, val: d[key] };
    });
  };

  const spendPoints = getPoints('spend');
  const revenuePoints = getPoints('revenue');

  const makeSmoothPath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpX = (p0.x + p1.x) / 2;
      d += ` C ${cpX} ${p0.y}, ${cpX} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    return d;
  };

  const spendPath = makeSmoothPath(spendPoints);
  const revenuePath = makeSmoothPath(revenuePoints);

  const makeAreaPath = (points: { x: number; y: number }[], pathString: string) => {
    if (points.length === 0) return '';
    const lastX = points[points.length - 1].x;
    const firstX = points[0].x;
    return `${pathString} L ${lastX} ${chartHeight} L ${firstX} ${chartHeight} Z`;
  };

  const spendArea = makeAreaPath(spendPoints, spendPath);
  const revenueArea = makeAreaPath(revenuePoints, revenuePath);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-transparent select-none">
      {/* 1. Header (44px, Linear header tier) */}
      <header
        style={{
          height: '44px',
          paddingLeft: '24px',
          paddingRight: '24px',
          borderBottom: '1px solid lch(9.84% 1.48 272)',
        }}
        className="flex shrink-0 items-center justify-between"
      >
        {/* Breadcrumbs (Left) */}
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#94969b]">
          <span className="hover:text-white cursor-pointer transition-colors">Buyerly</span>
          <span className="text-[#52525b]">›</span>
          <span className="text-[#ffffff]">Insights</span>
        </div>

        {/* Time Interval Segmented Switcher (Right) */}
        <div
          style={{
            height: '28px',
            backgroundColor: 'lch(9.232 0.85 272)',
            borderRadius: '9999px',
            padding: '2px',
            gap: '2px',
          }}
          className="flex items-center"
        >
          {(['today', '7d', '14d', '30d'] as TimeRange[]).map((range) => {
            const isSelected = timeRange === range;
            const labelMap: Record<TimeRange, string> = {
              today: 'Today',
              '7d': '7D',
              '14d': '14D',
              '30d': '30D',
            };
            return (
              <button
                key={range}
                type="button"
                onClick={() => setTimeRange(range)}
                style={{
                  height: '24px',
                  padding: '0 10px',
                  borderRadius: '9999px',
                  backgroundColor: isSelected ? 'lch(20.418 1.429 272)' : 'transparent',
                  color: isSelected ? '#ffffff' : 'lch(63.304 1.425 272)',
                  fontSize: '12px',
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                }}
                className="flex items-center justify-center outline-none hover:text-white"
              >
                {labelMap[range]}
              </button>
            );
          })}
        </div>
      </header>

      {/* 2. Main Scrollable Canvas Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-[1140px] space-y-6">
          {/* A. KPI Summary Cards Strip (4 Metrics) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. Total Spend */}
            <div
              style={{
                backgroundColor: 'lch(9.232 0.85 272)',
                border: '1px solid lch(13.553 1.93 272)',
                borderRadius: '8px',
                padding: '16px 18px',
              }}
              className="flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-medium text-[#94969b]">Total Spend</span>
                <span className="text-[11px] font-semibold text-[#4ade80] bg-[#4ade80]/10 px-1.5 py-0.5 rounded border border-[#4ade80]/20">
                  ↑ +12.4%
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[24px] font-semibold text-white font-mono tracking-tight">$14,240</span>
                <span className="text-[11px] text-[#71717a]">vs prev 7d</span>
              </div>
            </div>

            {/* 2. Revenue */}
            <div
              style={{
                backgroundColor: 'lch(9.232 0.85 272)',
                border: '1px solid lch(13.553 1.93 272)',
                borderRadius: '8px',
                padding: '16px 18px',
              }}
              className="flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-medium text-[#94969b]">Revenue</span>
                <span className="text-[11px] font-semibold text-[#4ade80] bg-[#4ade80]/10 px-1.5 py-0.5 rounded border border-[#4ade80]/20">
                  ↑ +24.8%
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[24px] font-semibold text-white font-mono tracking-tight">$34,460</span>
                <span className="text-[11px] text-[#71717a]">approved</span>
              </div>
            </div>

            {/* 3. Net ROI */}
            <div
              style={{
                backgroundColor: 'lch(9.232 0.85 272)',
                border: '1px solid lch(13.553 1.93 272)',
                borderRadius: '8px',
                padding: '16px 18px',
              }}
              className="flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-medium text-[#94969b]">Net ROI</span>
                <span className="text-[11px] font-semibold text-[#4ade80] bg-[#4ade80]/10 px-1.5 py-0.5 rounded border border-[#4ade80]/20">
                  ↑ +18.2%
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[24px] font-semibold text-[#4ade80] font-mono tracking-tight">+142%</span>
                <span className="text-[11px] text-[#71717a]">blended</span>
              </div>
            </div>

            {/* 4. Avg CPA */}
            <div
              style={{
                backgroundColor: 'lch(9.232 0.85 272)',
                border: '1px solid lch(13.553 1.93 272)',
                borderRadius: '8px',
                padding: '16px 18px',
              }}
              className="flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-medium text-[#94969b]">Avg CPA</span>
                <span className="text-[11px] font-semibold text-[#4ade80] bg-[#4ade80]/10 px-1.5 py-0.5 rounded border border-[#4ade80]/20">
                  ↓ -8.5%
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[24px] font-semibold text-white font-mono tracking-tight">$8.70</span>
                <span className="text-[11px] text-[#71717a]">per lead</span>
              </div>
            </div>
          </div>

          {/* B. Performance Dynamics Chart Card */}
          <div
            style={{
              backgroundColor: 'lch(9.232 0.85 272)',
              border: '1px solid lch(13.553 1.93 272)',
              borderRadius: '8px',
              padding: '20px 24px',
            }}
            className="flex flex-col"
          >
            {/* Chart Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-[14px] font-semibold text-white">Performance Dynamics</h3>
                <p className="text-[12px] text-[#94969b] mt-0.5">Daily spend and revenue trends across active campaigns</p>
              </div>

              {/* Metric Selector Pills & Legend */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 text-[12px] text-[#94969b]">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#5e6ad2]" />
                    <span>Spend ($14.2k)</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#27ae60]" />
                    <span>Revenue ($34.4k)</span>
                  </span>
                </div>

                <div
                  style={{
                    height: '26px',
                    backgroundColor: 'lch(13.861 1.043 272)',
                    borderRadius: '6px',
                    padding: '2px',
                  }}
                  className="flex items-center"
                >
                  <button
                    type="button"
                    onClick={() => setMetricView('spend_revenue')}
                    style={{
                      height: '22px',
                      padding: '0 8px',
                      borderRadius: '4px',
                      backgroundColor: metricView === 'spend_revenue' ? 'lch(20.418 1.429 272)' : 'transparent',
                      color: metricView === 'spend_revenue' ? '#ffffff' : '#94969b',
                      fontSize: '11px',
                      fontWeight: 500,
                    }}
                    className="outline-none"
                  >
                    Spend & Rev
                  </button>
                  <button
                    type="button"
                    onClick={() => setMetricView('cpa_leads')}
                    style={{
                      height: '22px',
                      padding: '0 8px',
                      borderRadius: '4px',
                      backgroundColor: metricView === 'cpa_leads' ? 'lch(20.418 1.429 272)' : 'transparent',
                      color: metricView === 'cpa_leads' ? '#ffffff' : '#94969b',
                      fontSize: '11px',
                      fontWeight: 500,
                    }}
                    className="outline-none"
                  >
                    CPA & Leads
                  </button>
                  <button
                    type="button"
                    onClick={() => setMetricView('roi')}
                    style={{
                      height: '22px',
                      padding: '0 8px',
                      borderRadius: '4px',
                      backgroundColor: metricView === 'roi' ? 'lch(20.418 1.429 272)' : 'transparent',
                      color: metricView === 'roi' ? '#ffffff' : '#94969b',
                      fontSize: '11px',
                      fontWeight: 500,
                    }}
                    className="outline-none"
                  >
                    ROI %
                  </button>
                </div>
              </div>
            </div>

            {/* SVG Dark Canvas Chart */}
            <div className="relative w-full overflow-hidden" style={{ height: `${chartHeight + 30}px` }}>
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight + 25}`}
                className="w-full h-full overflow-visible"
                preserveAspectRatio="none"
              >
                <defs>
                  {/* Purple Spend Gradient */}
                  <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5e6ad2" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#5e6ad2" stopOpacity="0.0" />
                  </linearGradient>
                  {/* Green Revenue Gradient */}
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#27ae60" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#27ae60" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal Guide Lines */}
                {[0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                  const y = chartHeight * ratio - 5;
                  return (
                    <line
                      key={idx}
                      x1="0"
                      y1={y}
                      x2={chartWidth}
                      y2={y}
                      stroke="rgba(255, 255, 255, 0.05)"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />
                  );
                })}

                {/* Area Fills */}
                <path d={revenueArea} fill="url(#revenueGrad)" />
                <path d={spendArea} fill="url(#spendGrad)" />

                {/* Stroke Lines */}
                <path d={revenuePath} fill="none" stroke="#27ae60" strokeWidth="2" strokeLinecap="round" />
                <path d={spendPath} fill="none" stroke="#5e6ad2" strokeWidth="2" strokeLinecap="round" />

                {/* Data Points */}
                {revenuePoints.map((p, idx) => (
                  <circle
                    key={`rev-pt-${idx}`}
                    cx={p.x}
                    cy={p.y}
                    r={3}
                    fill="#27ae60"
                    stroke="#09090b"
                    strokeWidth="2"
                  />
                ))}

                {spendPoints.map((p, idx) => (
                  <circle
                    key={`sp-pt-${idx}`}
                    cx={p.x}
                    cy={p.y}
                    r={3}
                    fill="#5e6ad2"
                    stroke="#09090b"
                    strokeWidth="2"
                  />
                ))}

                {/* Day Labels at bottom */}
                {chartData.map((d, idx) => {
                  const x = (idx / (chartData.length - 1)) * (chartWidth - 40) + 20;
                  return (
                    <text
                      key={d.day}
                      x={x}
                      y={chartHeight + 18}
                      textAnchor="middle"
                      fill="#71717a"
                      fontSize="11"
                      fontFamily="Inter Variable, sans-serif"
                    >
                      {d.day}
                    </text>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* C. Campaigns Breakdown Table */}
          <div
            style={{
              backgroundColor: 'lch(9.232 0.85 272)',
              border: '1px solid lch(13.553 1.93 272)',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
            className="flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b border-[#1e1e21]">
              <h3 className="text-[14px] font-semibold text-white">Campaigns Breakdown</h3>
              <span className="text-[12px] text-[#94969b]">{campaigns.length} campaigns active</span>
            </div>

            <div className="divide-y divide-[#1e1e21]/60">
              {campaigns.map((cmp) => {
                const isPositiveRoi = cmp.roi.startsWith('+');
                return (
                  <div
                    key={cmp.id}
                    className="flex items-center justify-between px-4 py-3 transition-colors duration-100 hover:bg-white/[0.02]"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-[13px] font-medium text-white truncate max-w-[340px]">
                        {cmp.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-8 text-[12px] font-mono shrink-0">
                      <div className="text-right w-20">
                        <span className="text-[#a1a1aa] block text-[10px] uppercase font-sans mb-0.5">Spend</span>
                        <span className="text-white font-medium">{cmp.spend.replace(' spend', '')}</span>
                      </div>

                      <div className="text-right w-24">
                        <span className="text-[#a1a1aa] block text-[10px] uppercase font-sans mb-0.5">Leads (CPA)</span>
                        <span className="text-white font-medium">
                          {cmp.leadsCount} <span className="text-[#94969b] text-[11px]">({cmp.cpa})</span>
                        </span>
                      </div>

                      <div className="text-right w-16">
                        <span className="text-[#a1a1aa] block text-[10px] uppercase font-sans mb-0.5">ROI</span>
                        <span className={`font-semibold ${isPositiveRoi ? 'text-[#4ade80]' : 'text-[#ef4444]'}`}>
                          {cmp.roi}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
