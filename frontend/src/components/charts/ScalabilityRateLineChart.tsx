import React, { useState } from 'react';

export interface RateTimePoint {
  timeSec: number;
  rps: number;
  instantLatencyMs?: number;
}

interface ScalabilityRateLineChartProps {
  data: RateTimePoint[];
  peakRps: number;
  avgRps: number;
  isLoading?: boolean;
}

export const ScalabilityRateLineChart: React.FC<ScalabilityRateLineChartProps> = ({
  data,
  peakRps,
  avgRps,
  isLoading = false,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<RateTimePoint | null>(null);

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center bg-slate-50/50 rounded-xl border border-slate-100 animate-pulse">
        <span className="text-xs text-slate-400">Loading throughput metrics...</span>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
        <span className="text-xs font-semibold text-slate-400">No Rate Data Recorded Yet</span>
        <span className="text-[11px] text-slate-400 mt-1">Upload a CSV and start the test to stream live throughput (RPS)</span>
      </div>
    );
  }

  const maxRps = Math.max(peakRps, ...data.map((d) => d.rps), 10);
  const chartHeight = 220;
  const chartWidth = 600;
  const paddingLeft = 50;
  const paddingRight = 25;
  const paddingTop = 25;
  const paddingBottom = 35;

  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;

  const maxTime = Math.max(data[data.length - 1]?.timeSec || 1, 1);

  // Compute SVG Points
  const points = data.map((d) => {
    const x = paddingLeft + (d.timeSec / maxTime) * innerWidth;
    const y = paddingTop + innerHeight - (d.rps / maxRps) * innerHeight;
    return { ...d, x, y };
  });

  const polylineStr = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPathStr = points.length > 0
    ? `M ${points[0].x.toFixed(1)},${(paddingTop + innerHeight).toFixed(1)} L ${polylineStr} L ${points[points.length - 1].x.toFixed(1)},${(paddingTop + innerHeight).toFixed(1)} Z`
    : '';

  // Calculate average line Y
  const avgLineY = paddingTop + innerHeight - (avgRps / maxRps) * innerHeight;

  return (
    <div className="w-full bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
      {/* Header Info */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-slate-900">Backend Processing Rate Progression (Txns / Sec)</h4>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Real-time throughput curve computed from completed transactions retrieved from backend SQLite
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-200/60 font-semibold">
            <span>Peak:</span>
            <span className="font-bold">{peakRps.toFixed(1)} req/s</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg border border-slate-200 font-semibold">
            <span>Average:</span>
            <span className="font-bold">{avgRps.toFixed(1)} req/s</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-auto select-none"
        >
          <defs>
            <linearGradient id="rateGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.45" />
              <stop offset="70%" stopColor="#6366f1" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="lineStrokeGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4f46e5" />
              <stop offset="100%" stopColor="#7c3aed" />
            </linearGradient>
          </defs>

          {/* Grid lines & Y-axis labels */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((pct, idx) => {
            const y = paddingTop + innerHeight * (1 - pct);
            const val = Math.round(maxRps * pct);
            return (
              <g key={idx}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke="#f1f5f9"
                  strokeDasharray={pct === 0 ? '0' : '4 4'}
                  strokeWidth="1"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="text-[10px] fill-slate-400 font-mono font-medium"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Average RPS Horizontal Guideline */}
          {avgRps > 0 && avgLineY >= paddingTop && avgLineY <= paddingTop + innerHeight && (
            <g>
              <line
                x1={paddingLeft}
                y1={avgLineY}
                x2={chartWidth - paddingRight}
                y2={avgLineY}
                stroke="#94a3b8"
                strokeDasharray="3 3"
                strokeWidth="1.5"
              />
              <text
                x={chartWidth - paddingRight - 4}
                y={avgLineY - 4}
                textAnchor="end"
                className="text-[9px] fill-slate-500 font-mono font-semibold"
              >
                Avg {avgRps.toFixed(1)} req/s
              </text>
            </g>
          )}

          {/* Area Gradient Fill */}
          {areaPathStr && <path d={areaPathStr} fill="url(#rateGradient)" />}

          {/* Main Rate Polyline */}
          {polylineStr && (
            <polyline
              fill="none"
              stroke="url(#lineStrokeGradient)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={polylineStr}
            />
          )}

          {/* Sampled Point Circles for Interaction */}
          {points.map((p, idx) => {
            // Render at most 30 circles to keep DOM lean
            const shouldRenderCircle = points.length <= 40 || idx % Math.ceil(points.length / 30) === 0 || idx === points.length - 1;
            if (!shouldRenderCircle) return null;

            const isHovered = hoveredPoint?.timeSec === p.timeSec;

            return (
              <g key={idx}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isHovered ? 6 : 3.5}
                  className="fill-white stroke-indigo-600 stroke-2 cursor-pointer transition-all duration-150"
                  onMouseEnter={() => setHoveredPoint(p)}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              </g>
            );
          })}

          {/* X-axis Time Labels */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((pct, idx) => {
            const x = paddingLeft + innerWidth * pct;
            const timeVal = (maxTime * pct).toFixed(1);
            return (
              <text
                key={idx}
                x={x}
                y={chartHeight - 10}
                textAnchor={pct === 0 ? 'start' : pct === 1.0 ? 'end' : 'middle'}
                className="text-[10px] fill-slate-400 font-mono"
              >
                {timeVal}s
              </text>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredPoint && (
          <div
            className="absolute z-20 pointer-events-none bg-slate-900 text-white text-[11px] px-2.5 py-1.5 rounded-lg shadow-xl font-mono border border-slate-700"
            style={{
              left: `${(hoveredPoint.timeSec / maxTime) * 80 + 10}%`,
              top: '15px',
            }}
          >
            <div className="font-bold text-indigo-300">{hoveredPoint.rps.toFixed(1)} req/sec</div>
            <div className="text-slate-400 text-[10px]">Elapsed: {hoveredPoint.timeSec.toFixed(2)}s</div>
          </div>
        )}
      </div>
    </div>
  );
};
