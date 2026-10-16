import React from 'react';
import type { TimeSeriesPoint } from '../../api/types';

interface LatencyChartProps {
  data: TimeSeriesPoint[];
  isLoading?: boolean;
}

export const LatencyChart: React.FC<LatencyChartProps> = ({ data, isLoading = false }) => {
  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center bg-slate-50/50 rounded-xl border border-slate-100 animate-pulse">
        <span className="text-xs text-slate-400">Loading latency data...</span>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
        <span className="text-xs font-medium text-slate-400">No latency measurements yet</span>
        <span className="text-[11px] text-slate-400 mt-1">Latency curves will render once transactions complete</span>
      </div>
    );
  }

  const maxVal = Math.max(
    ...data.map((d) => d.avgLatencyMs || 0),
    100
  );

  const chartHeight = 180;
  const chartWidth = 520;
  const paddingX = 45;
  const paddingY = 20;

  const innerWidth = chartWidth - paddingX * 2;
  const innerHeight = chartHeight - paddingY * 2;

  const stepX = innerWidth / Math.max(data.length - 1, 1);

  // Compute SVG polyline points
  const points = data.map((d, idx) => {
    const x = paddingX + idx * stepX;
    const y = paddingY + innerHeight - ((d.avgLatencyMs || 0) / maxVal) * innerHeight;
    return { x, y, latency: d.avgLatencyMs, time: d.timestamp };
  });

  const polylineStr = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPathStr = points.length > 0
    ? `M ${points[0].x},${paddingY + innerHeight} L ${polylineStr} L ${points[points.length - 1].x},${paddingY + innerHeight} Z`
    : '';

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-700">Average Processing Latency (s)</span>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">Max: {(maxVal / 1000).toFixed(3)}s</span>
      </div>

      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-auto text-slate-300"
        >
          <defs>
            <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const y = paddingY + innerHeight * (1 - pct);
            const labelVal = maxVal * pct;
            return (
              <g key={idx}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={chartWidth - paddingX}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray={pct === 0 ? '0' : '4 4'}
                  strokeWidth="1"
                />
                <text
                  x={paddingX - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[10px] fill-slate-400 font-mono"
                >
                  {(labelVal / 1000).toFixed(2)}s
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          {areaPathStr && <path d={areaPathStr} fill="url(#latencyGradient)" />}

          {/* Line stroke */}
          {polylineStr && (
            <polyline
              fill="none"
              stroke="#2563eb"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={polylineStr}
            />
          )}

          {/* Point markers & labels */}
          {points.map((p, idx) => (
            <g key={idx} className="group">
              <circle
                cx={p.x}
                cy={p.y}
                r="4"
                className="fill-white stroke-blue-600 stroke-2 group-hover:r-5 transition-all"
              />
              <text
                x={p.x}
                y={chartHeight - 4}
                textAnchor="middle"
                className="text-[10px] fill-slate-400 font-mono"
              >
                {p.time}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
};
