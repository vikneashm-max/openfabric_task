import React, { useState } from 'react';

export interface BackendStatusDistribution {
  completed: number;
  failed: number;
  processing: number;
  pending: number;
}

export interface LatencyBuckets {
  under20ms: number;
  from20to50ms: number;
  from50to100ms: number;
  from100to200ms: number;
  over200ms: number;
}

interface ScalabilityStatusBarChartProps {
  statusData: BackendStatusDistribution;
  latencyBuckets: LatencyBuckets;
  totalCount: number;
}

export const ScalabilityStatusBarChart: React.FC<ScalabilityStatusBarChartProps> = ({
  statusData,
  latencyBuckets,
  totalCount,
}) => {
  const [activeView, setActiveView] = useState<'status' | 'latency'>('status');

  const statusBars = [
    {
      label: 'COMPLETED',
      count: statusData.completed,
      fill: '#10b981',
      textColor: 'text-emerald-700',
      desc: 'Processed & confirmed by remote service',
    },
    {
      label: 'FAILED',
      count: statusData.failed,
      fill: '#f43f5e',
      textColor: 'text-rose-700',
      desc: 'Terminal error after retries',
    },
    {
      label: 'PROCESSING',
      count: statusData.processing,
      fill: '#3b82f6',
      textColor: 'text-blue-700',
      desc: 'Claimed by worker; remote POST in-flight',
    },
    {
      label: 'PENDING',
      count: statusData.pending,
      fill: '#f59e0b',
      textColor: 'text-amber-700',
      desc: 'Committed to SQLite outbox; awaiting worker',
    },
  ];

  const latencyBars = [
    {
      label: '< 0.02 s',
      count: latencyBuckets.under20ms,
      fill: '#059669',
      desc: 'Ultra-fast database & worker execution',
    },
    {
      label: '0.02 - 0.05 s',
      count: latencyBuckets.from20to50ms,
      fill: '#10b981',
      desc: 'Optimal end-to-end processing',
    },
    {
      label: '0.05 - 0.10 s',
      count: latencyBuckets.from50to100ms,
      fill: '#3b82f6',
      desc: 'Within 0.10s target SLA',
    },
    {
      label: '0.10 - 0.20 s',
      count: latencyBuckets.from100to200ms,
      fill: '#f59e0b',
      desc: 'Remote posting service delay',
    },
    {
      label: '> 0.20 s',
      count: latencyBuckets.over200ms,
      fill: '#f43f5e',
      desc: 'Retry backoff or downstream latency spike',
    },
  ];

  const currentBars = activeView === 'status' ? statusBars : latencyBars;
  const maxCount = Math.max(...currentBars.map((b) => b.count), 1);

  const chartHeight = 200;
  const chartWidth = 540;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;

  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;
  const barSlotWidth = innerWidth / currentBars.length;
  const barWidth = Math.min(barSlotWidth * 0.55, 42);

  // SLA compliance calculation (based on processed completed records)
  const slaCount = latencyBuckets.under20ms + latencyBuckets.from20to50ms + latencyBuckets.from50to100ms;
  const totalCompleted = statusData.completed;
  const slaPct = totalCompleted > 0 ? ((slaCount / totalCompleted) * 100).toFixed(1) : '100.0';

  return (
    <div className="w-full bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
      {/* Header with View Toggle */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              {activeView === 'status' ? 'Backend Processing Statuses' : 'Backend Processing Latency Tiers'}
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {activeView === 'status'
                ? 'Actual database records retrieved from backend'
                : `Target: < 0.10 s (${slaPct}% SLA compliant)`}
            </p>
          </div>

          {/* Toggle Buttons */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/80 text-xs font-semibold">
            <button
              onClick={() => setActiveView('status')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                activeView === 'status'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Backend Status
            </button>
            <button
              onClick={() => setActiveView('latency')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                activeView === 'latency'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Latency Tiers
            </button>
          </div>
        </div>

        {/* SVG Bar Chart */}
        <div className="relative w-full">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto select-none">
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1.0].map((pct, idx) => {
              const y = paddingTop + innerHeight * (1 - pct);
              const val = Math.round(maxCount * pct);
              return (
                <g key={idx}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={chartWidth - paddingRight}
                    y2={y}
                    stroke="#f1f5f9"
                    strokeDasharray={pct === 0 ? '0' : '3 3'}
                    strokeWidth="1"
                  />
                  <text
                    x={paddingLeft - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    className="text-[10px] fill-slate-400 font-mono"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Bars */}
            {currentBars.map((bar, idx) => {
              const barHeight = maxCount > 0 ? (bar.count / maxCount) * innerHeight : 0;
              const x = paddingLeft + idx * barSlotWidth + (barSlotWidth - barWidth) / 2;
              const y = paddingTop + innerHeight - barHeight;

              return (
                <g key={idx} className="group cursor-pointer">
                  {/* The bar */}
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={Math.max(barHeight, bar.count > 0 ? 3 : 0)}
                    rx="4"
                    fill={bar.fill}
                    className="transition-all duration-300 hover:opacity-85"
                  />

                  {/* Value on top of bar */}
                  {bar.count > 0 && (
                    <text
                      x={x + barWidth / 2}
                      y={y - 5}
                      textAnchor="middle"
                      className="text-[10px] font-mono font-bold fill-slate-700"
                    >
                      {bar.count}
                    </text>
                  )}

                  {/* X-axis label */}
                  <text
                    x={x + barWidth / 2}
                    y={chartHeight - 14}
                    textAnchor="middle"
                    className="text-[10px] fill-slate-600 font-medium"
                  >
                    {bar.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Summary Footer Pill */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
        <span className="text-slate-500">
          Backend Records Retrieved: <strong className="text-slate-900 font-mono">{totalCount}</strong>
        </span>
        {activeView === 'latency' && (
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
              parseFloat(slaPct) >= 95
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            SLA (&lt;0.10s): {slaPct}%
          </span>
        )}
      </div>
    </div>
  );
};
