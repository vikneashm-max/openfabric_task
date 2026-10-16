import React, { useState } from 'react';
import type { TimeSeriesPoint, Transaction } from '../../api/types';
import { formatTimeTaken } from '../../utils/transactionFormat';
import { TransactionHoverTooltip, type TransactionHoverDetails } from '../common/TransactionHoverTooltip';

export interface DetailedTimeSeriesPoint extends TimeSeriesPoint {
  transactions?: Transaction[];
}

interface VolumeChartProps {
  data: DetailedTimeSeriesPoint[];
  transactions?: Transaction[];
  isLoading?: boolean;
}

export const VolumeChart: React.FC<VolumeChartProps> = ({
  data,
  transactions = [],
  isLoading = false,
}) => {
  const [hoveredDetails, setHoveredDetails] = useState<TransactionHoverDetails | null>(null);

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center bg-slate-50/50 rounded-xl border border-slate-100 animate-pulse">
        <span className="text-xs text-slate-400">Loading chart data...</span>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
        <span className="text-xs font-medium text-slate-400">No time-series data available yet</span>
        <span className="text-[11px] text-slate-400 mt-1">Transaction volume will appear as requests are processed</span>
      </div>
    );
  }

  const maxVal = Math.max(
    ...data.map((d) => Math.max(d.completed, d.failed, d.pending, 1)),
    5
  );

  const chartHeight = 180;
  const chartWidth = 520;
  const paddingX = 40;
  const paddingY = 20;

  const innerWidth = chartWidth - paddingX * 2;
  const innerHeight = chartHeight - paddingY * 2;

  const stepX = innerWidth / Math.max(data.length - 1, 1);

  const handleHover = (point: DetailedTimeSeriesPoint, statusFilter?: 'COMPLETED' | 'FAILED' | 'PENDING') => {
    const pool = point.transactions && point.transactions.length > 0 ? point.transactions : transactions;
    let match = statusFilter ? pool.find((t) => t.status === statusFilter) : pool[0];
    if (!match && pool.length > 0) match = pool[0];

    if (match) {
      setHoveredDetails({
        id: match.id,
        amt: match.amount,
        currency: match.currency,
        status: match.status,
        timeTaken: formatTimeTaken(match),
        title: `${point.timestamp} • ${statusFilter || match.status} Volume`,
        note: pool.length > 1 ? `Window total: ${point.completed} completed, ${point.failed} failed, ${point.pending} pending` : undefined,
      });
    } else {
      setHoveredDetails({
        id: `txn-${point.timestamp.replace(':', '')}`,
        amt: '0.00',
        currency: 'INR',
        status: statusFilter || 'COMPLETED',
        timeTaken: `${point.avgLatencyMs}ms`,
        title: `${point.timestamp} Summary`,
      });
    }
  };

  return (
    <div className="w-full relative">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-emerald-500 inline-block"></span>
            <span className="text-slate-600">Completed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-rose-500 inline-block"></span>
            <span className="text-slate-600">Failed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-amber-400 inline-block"></span>
            <span className="text-slate-600">Pending</span>
          </div>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">Past & Live Transaction Activity</span>
      </div>

      {/* Floating Hover Details for Bar Points */}
      {hoveredDetails && (
        <div className="absolute top-10 right-4 z-40 max-w-xs shadow-2xl">
          <TransactionHoverTooltip details={hoveredDetails} />
        </div>
      )}

      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-auto text-slate-300"
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const y = paddingY + innerHeight * (1 - pct);
            const labelVal = Math.round(maxVal * pct);
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
                  {labelVal}
                </text>
              </g>
            );
          })}

          {/* Grouped Bars */}
          {data.map((point, idx) => {
            const centerX = paddingX + idx * stepX;
            const barWidth = 10;

            const hCompleted = (point.completed / maxVal) * innerHeight;
            const hFailed = (point.failed / maxVal) * innerHeight;
            const hPending = (point.pending / maxVal) * innerHeight;

            return (
              <g
                key={idx}
                className="group cursor-pointer"
                onMouseEnter={() => handleHover(point)}
                onMouseLeave={() => setHoveredDetails(null)}
              >
                {/* Completed bar */}
                <rect
                  x={centerX - barWidth * 1.5 - 2}
                  y={paddingY + innerHeight - hCompleted}
                  width={barWidth}
                  height={Math.max(hCompleted, point.completed > 0 ? 3 : 0)}
                  rx="2"
                  onMouseEnter={(e) => {
                    e.stopPropagation();
                    handleHover(point, 'COMPLETED');
                  }}
                  className="fill-emerald-500 hover:fill-emerald-600 transition-colors"
                />
                {/* Failed bar */}
                <rect
                  x={centerX - barWidth * 0.5}
                  y={paddingY + innerHeight - hFailed}
                  width={barWidth}
                  height={Math.max(hFailed, point.failed > 0 ? 2 : 0)}
                  rx="2"
                  onMouseEnter={(e) => {
                    e.stopPropagation();
                    handleHover(point, 'FAILED');
                  }}
                  className="fill-rose-500 hover:fill-rose-600 transition-colors"
                />
                {/* Pending bar */}
                <rect
                  x={centerX + barWidth * 0.5 + 2}
                  y={paddingY + innerHeight - hPending}
                  width={barWidth}
                  height={Math.max(hPending, point.pending > 0 ? 2 : 0)}
                  rx="2"
                  onMouseEnter={(e) => {
                    e.stopPropagation();
                    handleHover(point, 'PENDING');
                  }}
                  className="fill-amber-400 hover:fill-amber-500 transition-colors"
                />

                {/* X-axis label */}
                <text
                  x={centerX}
                  y={chartHeight - 4}
                  textAnchor="middle"
                  className="text-[10px] fill-slate-400 font-mono"
                >
                  {point.timestamp}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
