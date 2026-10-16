import React, { useState, useMemo } from 'react';
import { TransactionHoverTooltip } from '../common/TransactionHoverTooltip';
import { formatTimeTaken } from '../../utils/transactionFormat';

export interface BackendScatterPoint {
  index: number;
  timeSec: number;
  latencyMs: number;
  status: 'COMPLETED' | 'FAILED' | 'PROCESSING' | 'PENDING' | string;
  id: string;
  amount: number;
  currency: string;
  submittedAt: string;
  completedAt?: string | null;
  lastError?: string | null;
  attemptCount: number;
}

interface ScalabilityScatterPlotProps {
  points: BackendScatterPoint[];
  maxPointsToRender?: number;
}

export const ScalabilityScatterPlot: React.FC<ScalabilityScatterPlotProps> = ({
  points,
  maxPointsToRender = 1000,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<BackendScatterPoint | null>(null);
  const [hoverCoords, setHoverCoords] = useState<{ x: number; y: number } | null>(null);
  const [filterOutliersOnly, setFilterOutliersOnly] = useState(false);

  // Filter or sample points if huge
  const displayedPoints = useMemo(() => {
    let pts = points;
    if (filterOutliersOnly) {
      pts = pts.filter((p) => p.latencyMs >= 100);
    }
    if (pts.length <= maxPointsToRender) {
      return pts;
    }
    // Downsample evenly while preserving outliers
    const step = Math.ceil(pts.length / maxPointsToRender);
    return pts.filter((p, i) => i % step === 0 || p.latencyMs >= 100);
  }, [points, filterOutliersOnly, maxPointsToRender]);

  if (!points || points.length === 0) {
    return (
      <div className="h-72 flex flex-col items-center justify-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 p-6">
        <span className="text-xs font-semibold text-slate-400">No Processed Transactions Retrieved Yet</span>
        <span className="text-[11px] text-slate-400 mt-1">
          Upload a CSV file and process it to retrieve actual backend execution latencies
        </span>
      </div>
    );
  }

  const maxLatency = Math.max(
    ...points.map((p) => p.latencyMs),
    120 // ensure 100ms line is comfortably visible
  );

  const maxIndex = Math.max(points[points.length - 1]?.index || 1, 1);

  const chartHeight = 260;
  const chartWidth = 640;
  const paddingLeft = 55;
  const paddingRight = 25;
  const paddingTop = 25;
  const paddingBottom = 40;

  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;

  // 100ms target line Y
  const slaTargetY = paddingTop + innerHeight - (100 / maxLatency) * innerHeight;

  const getStatusColor = (status: string) => {
    if (status === 'COMPLETED') return '#10b981'; // Emerald
    if (status === 'FAILED') return '#f43f5e'; // Rose
    if (status === 'PROCESSING') return '#3b82f6'; // Blue
    return '#f59e0b'; // Amber (PENDING)
  };

  const outlierCount = points.filter((p) => p.latencyMs >= 100).length;

  return (
    <div className="w-full bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-slate-900">
              Backend Processing Latency Scatter Plot
            </h4>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Actual duration (<code>completedAt - submittedAt</code>) recorded in SQLite per transaction.
          </p>
        </div>

        {/* Legend & Outlier Filter */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-2 font-medium text-slate-600">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block"></span> COMPLETED
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block"></span> FAILED
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-blue-500 inline-block"></span> PROCESSING
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block"></span> PENDING
            </span>
          </div>

          <button
            onClick={() => setFilterOutliersOnly(!filterOutliersOnly)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              filterOutliersOnly
                ? 'bg-rose-50 text-rose-700 border-rose-300 font-bold'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Outliers (&ge; 0.10s): {outlierCount}
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full overflow-hidden">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto select-none">
          {/* Horizontal Grid Lines */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((pct, idx) => {
            const y = paddingTop + innerHeight * (1 - pct);
            const val = Math.round(maxLatency * pct);
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
                  {(val / 1000).toFixed(2)}s
                </text>
              </g>
            );
          })}

          {/* 0.10s SLA Target Line */}
          {slaTargetY >= paddingTop && slaTargetY <= paddingTop + innerHeight && (
            <g>
              <line
                x1={paddingLeft}
                y1={slaTargetY}
                x2={chartWidth - paddingRight}
                y2={slaTargetY}
                stroke="#ef4444"
                strokeDasharray="4 4"
                strokeWidth="1.5"
              />
              <text
                x={chartWidth - paddingRight - 4}
                y={slaTargetY - 4}
                textAnchor="end"
                className="text-[9px] fill-rose-600 font-mono font-bold"
              >
                0.10s Target Line
              </text>
            </g>
          )}

          {/* Plotted Scatter Circles */}
          {displayedPoints.map((p) => {
            const x = paddingLeft + (p.index / maxIndex) * innerWidth;
            const y = paddingTop + innerHeight - (p.latencyMs / maxLatency) * innerHeight;
            const isOutlier = p.latencyMs >= 100;
            const isHovered = hoveredPoint?.id === p.id;
            const color = getStatusColor(p.status);

            return (
              <circle
                key={p.id}
                cx={x}
                cy={y}
                r={isHovered ? 6 : isOutlier ? 4 : 3}
                fill={color}
                fillOpacity={isHovered ? 1 : 0.85}
                stroke={isHovered ? '#0f172a' : isOutlier ? '#b91c1c' : '#ffffff'}
                strokeWidth={isHovered ? 2 : isOutlier ? 1.5 : 0.5}
                className="cursor-pointer transition-transform duration-100"
                onMouseEnter={(e) => {
                  setHoveredPoint(p);
                  setHoverCoords({ x: e.clientX, y: e.clientY });
                }}
                onMouseMove={(e) => {
                  setHoverCoords({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => {
                  setHoveredPoint(null);
                  setHoverCoords(null);
                }}
              />
            );
          })}

          {/* X-axis Labels */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((pct, idx) => {
            const x = paddingLeft + innerWidth * pct;
            const reqNum = Math.round(maxIndex * pct);
            return (
              <text
                key={idx}
                x={x}
                y={chartHeight - 12}
                textAnchor={pct === 0 ? 'start' : pct === 1.0 ? 'end' : 'middle'}
                className="text-[10px] fill-slate-400 font-mono"
              >
                #{reqNum}
              </text>
            );
          })}
        </svg>

        {/* Floating Tooltip displaying (id, amt, status, time taken) dynamically anchored to cursor */}
        {hoveredPoint && (
          <TransactionHoverTooltip
            coords={hoverCoords}
            details={{
              id: hoveredPoint.id,
              amt: hoveredPoint.amount,
              currency: hoveredPoint.currency,
              status: hoveredPoint.status,
              timeTaken: formatTimeTaken(hoveredPoint),
              title: `Scatter Point #${hoveredPoint.index}`,
              note: hoveredPoint.lastError ? `Error: ${hoveredPoint.lastError}` : undefined,
            }}
          />
        )}
      </div>
    </div>
  );
};
