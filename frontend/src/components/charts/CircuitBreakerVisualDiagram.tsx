import React, { useMemo, useState } from 'react';
import type { CircuitBreaker, Transaction } from '../../api/types';
import {
  Activity,
  Zap,
  Clock,
  Sparkles,
  BarChart2
} from 'lucide-react';
import { TransactionHoverTooltip, type TransactionHoverDetails } from '../common/TransactionHoverTooltip';
import { formatTimeTaken } from '../../utils/transactionFormat';

interface CircuitBreakerVisualDiagramProps {
  circuitBreaker: CircuitBreaker | null;
  transactions?: Transaction[];
  isLoading?: boolean;
}

export const CircuitBreakerVisualDiagram: React.FC<CircuitBreakerVisualDiagramProps> = ({
  circuitBreaker,
  transactions = [],
  isLoading = false,
}) => {
  const [hoveredDetails, setHoveredDetails] = useState<TransactionHoverDetails | null>(null);
  const [hoverCoords, setHoverCoords] = useState<{ x: number; y: number } | null>(null);

  // Compute downstream metrics from past transactions
  const metrics = useMemo(() => {
    const total = transactions.length;
    let completed = 0;
    let failed = 0;
    const latencies: number[] = [];

    let fastCount = 0; // < 100ms
    let normalCount = 0; // 100ms - 500ms
    let slowCount = 0; // > 500ms

    transactions.forEach((tx) => {
      if (tx.status === 'COMPLETED') completed++;
      if (tx.status === 'FAILED') failed++;

      if (tx.completedAt && tx.submittedAt) {
        const diff = Math.max(0, new Date(tx.completedAt).getTime() - new Date(tx.submittedAt).getTime());
        latencies.push(diff);

        if (diff < 100) fastCount++;
        else if (diff <= 500) normalCount++;
        else slowCount++;
      }
    });

    const failureRate = total > 0 ? (failed / total) * 100 : 0;
    const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

    return {
      total,
      completed,
      failed,
      failureRate,
      avgLatency,
      fastCount,
      normalCount,
      slowCount,
      latencies,
    };
  }, [transactions]);

  // Downstream execution timeline points from past transactions
  const dispatchPoints = useMemo(() => {
    const sample = transactions.slice(0, 30);
    return sample.map((tx, idx) => {
      let lat = 20;
      if (tx.completedAt && tx.submittedAt) {
        lat = Math.max(0, new Date(tx.completedAt).getTime() - new Date(tx.submittedAt).getTime());
      }
      return {
        index: idx + 1,
        latencyMs: lat,
        status: tx.status,
        id: tx.id,
        tx,
      };
    });
  }, [transactions]);

  const handlePointHover = (p: { index: number; latencyMs: number; status: string; id: string; tx: Transaction }) => {
    const tx = p.tx;
    setHoveredDetails({
      id: tx.id,
      amt: tx.amount,
      currency: tx.currency,
      status: tx.status,
      timeTaken: formatTimeTaken(tx),
      title: `Downstream Execution #${p.index}`,
      note: `Recorded downstream latency: ${p.latencyMs > 1000 ? `${(p.latencyMs / 1000).toFixed(2)}s` : `${p.latencyMs}ms`}`,
    });
  };

  const handleCategoryHover = (category: 'fast' | 'normal' | 'slow' | 'trip') => {
    let match: Transaction | undefined;
    if (category === 'fast') {
      match = transactions.find((tx) => {
        if (!tx.completedAt || !tx.submittedAt) return false;
        const diff = new Date(tx.completedAt).getTime() - new Date(tx.submittedAt).getTime();
        return diff < 100;
      });
    } else if (category === 'normal') {
      match = transactions.find((tx) => {
        if (!tx.completedAt || !tx.submittedAt) return false;
        const diff = new Date(tx.completedAt).getTime() - new Date(tx.submittedAt).getTime();
        return diff >= 100 && diff <= 500;
      });
    } else if (category === 'slow') {
      match = transactions.find((tx) => {
        if (!tx.completedAt || !tx.submittedAt) return false;
        const diff = new Date(tx.completedAt).getTime() - new Date(tx.submittedAt).getTime();
        return diff > 500;
      });
    } else if (category === 'trip') {
      match = transactions.find((tx) => tx.status === 'FAILED') || transactions[0];
    }

    if (!match && transactions.length > 0) match = transactions[0];

    if (match) {
      setHoveredDetails({
        id: match.id,
        amt: match.amount,
        currency: match.currency,
        status: match.status,
        timeTaken: formatTimeTaken(match),
        title: category === 'trip' ? 'Trip Threshold Meter' : `${category.toUpperCase()} Latency Sample`,
      });
    }
  };

  if (isLoading && transactions.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-1/3 mb-3"></div>
        <div className="h-32 bg-slate-100 rounded-xl"></div>
      </div>
    );
  }

  const chartHeight = 140;
  const chartWidth = 560;
  const paddingX = 40;
  const paddingY = 20;
  const innerWidth = chartWidth - paddingX * 2;
  const innerHeight = chartHeight - paddingY * 2;

  const maxDispLat = Math.max(...dispatchPoints.map((p) => p.latencyMs), 200);
  const stepX = innerWidth / Math.max(dispatchPoints.length - 1, 1);

  const points = dispatchPoints.map((p, idx) => {
    const x = paddingX + idx * stepX;
    const y = paddingY + innerHeight - (p.latencyMs / maxDispLat) * innerHeight;
    return { ...p, x, y };
  });

  const polylineStr = points.map((p) => `${p.x},${p.y}`).join(' ');

  const isTrip = circuitBreaker?.state === 'OPEN';

  return (
    <div className="relative bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Floating Hover Details for any point or bar in the diagram dynamically anchored to cursor */}
      {hoveredDetails && (
        <TransactionHoverTooltip details={hoveredDetails} coords={hoverCoords} />
      )}

      {/* Header */}
      <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-400/20">
              <BarChart2 className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
              Visual Representation of Downstream Executions
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                Remote Service POST Visualizer
              </span>
            </h3>
          </div>
          <p className="text-xs text-indigo-200/70 mt-1">
            Visual inspection of past transaction dispatches to downstream Posting Service (<code>http://localhost:8080</code>).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="px-3 py-1.5 rounded-xl bg-white/10 backdrop-blur-xs border border-white/10 text-center">
            <span className="text-[10px] text-slate-300 block uppercase font-medium">Dispatches</span>
            <span className="text-sm font-bold font-mono text-white">{metrics.total} calls</span>
          </div>
          <div className={`px-3 py-1.5 rounded-xl border text-center ${
            isTrip ? 'bg-rose-500/20 border-rose-400/30' : 'bg-emerald-500/15 border border-emerald-400/20'
          }`}>
            <span className="text-[10px] text-emerald-300 block uppercase font-medium">Failure Rate</span>
            <span className={`text-sm font-bold font-mono ${isTrip ? 'text-rose-400' : 'text-emerald-400'}`}>
              {metrics.failureRate.toFixed(1)}% / 50% limit
            </span>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Visual Trip Threshold Progress Bar & Downstream Buckets */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Failure Threshold Visual Meter Bar */}
          <div
            className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5 cursor-pointer hover:border-amber-300 transition-colors"
            onMouseEnter={() => handleCategoryHover('trip')}
            onMouseLeave={() => setHoveredDetails(null)}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                Downstream Trip Threshold Gauge
              </span>
              <span className="font-mono text-[11px] text-slate-500">
                Current: <strong className="text-emerald-600">{metrics.failureRate.toFixed(1)}%</strong> • Trip: <strong>50.0%</strong>
              </span>
            </div>

            {/* Threshold Bar with 50% Marker */}
            <div className="relative h-4 w-full bg-slate-200 rounded-full overflow-hidden shadow-inner">
              {/* Trip Threshold line at 50% */}
              <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-rose-600 z-10" title="50% Trip Threshold" />
              {/* Safe Zone (0-50%) */}
              <div
                style={{ width: `${Math.min(100, (metrics.failureRate / 50) * 50)}%` }}
                className={`h-full transition-all ${
                  metrics.failureRate >= 50 ? 'bg-rose-600' : 'bg-emerald-500'
                }`}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>0% (Safe)</span>
              <span className="text-rose-600 font-bold">50% TRIP LIMIT</span>
              <span>100%</span>
            </div>
          </div>

          {/* Latency Distribution Breakdown */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              Downstream Response Latency Categories
            </span>
            <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono">
              <div
                className="p-2 rounded-lg bg-white border border-slate-200 cursor-pointer hover:border-emerald-400 transition-colors"
                onMouseEnter={(e) => {
                  setHoverCoords({ x: e.clientX, y: e.clientY });
                  handleCategoryHover('fast');
                }}
                onMouseMove={(e) => {
                  setHoverCoords({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => {
                  setHoveredDetails(null);
                  setHoverCoords(null);
                }}
              >
                <span className="text-[10px] text-slate-400 block font-sans">Fast (&lt;100ms)</span>
                <span className="text-xs font-bold text-emerald-600">{metrics.fastCount}</span>
              </div>
              <div
                className="p-2 rounded-lg bg-white border border-slate-200 cursor-pointer hover:border-blue-400 transition-colors"
                onMouseEnter={(e) => {
                  setHoverCoords({ x: e.clientX, y: e.clientY });
                  handleCategoryHover('normal');
                }}
                onMouseMove={(e) => {
                  setHoverCoords({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => {
                  setHoveredDetails(null);
                  setHoverCoords(null);
                }}
              >
                <span className="text-[10px] text-slate-400 block font-sans">Normal (100-500ms)</span>
                <span className="text-xs font-bold text-blue-600">{metrics.normalCount}</span>
              </div>
              <div
                className="p-2 rounded-lg bg-white border border-slate-200 cursor-pointer hover:border-amber-400 transition-colors"
                onMouseEnter={(e) => {
                  setHoverCoords({ x: e.clientX, y: e.clientY });
                  handleCategoryHover('slow');
                }}
                onMouseMove={(e) => {
                  setHoverCoords({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => {
                  setHoveredDetails(null);
                  setHoverCoords(null);
                }}
              >
                <span className="text-[10px] text-slate-400 block font-sans">Elevated (&gt;500ms)</span>
                <span className="text-xs font-bold text-amber-600">{metrics.slowCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Visual SVG Dispatch Timeline Diagram */}
        <div className="border border-slate-200/80 rounded-xl p-4 bg-slate-50/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Activity className="w-3.5 h-3.5 text-indigo-600" />
              <span>Downstream Transaction Latency Progression</span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">Hover points for (id, amt, status, time taken)</span>
          </div>

          <div className="relative w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-auto text-slate-300"
            >
              {/* Grid lines */}
              {[0, 0.5, 1].map((pct, idx) => {
                const y = paddingY + innerHeight * (1 - pct);
                const val = maxDispLat * pct;
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
                      {val > 1000 ? `${(val / 1000).toFixed(1)}s` : `${Math.round(val)}ms`}
                    </text>
                  </g>
                );
              })}

              {/* Stroke */}
              {polylineStr && (
                <polyline
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={polylineStr}
                />
              )}

              {/* Point Markers */}
              {points.map((p, idx) => (
                <circle
                  key={idx}
                  cx={p.x}
                  cy={p.y}
                  r="4"
                  onMouseEnter={(e) => {
                    setHoverCoords({ x: e.clientX, y: e.clientY });
                    handlePointHover(p);
                  }}
                  onMouseMove={(e) => {
                    setHoverCoords({ x: e.clientX, y: e.clientY });
                  }}
                  onMouseLeave={() => {
                    setHoveredDetails(null);
                    setHoverCoords(null);
                  }}
                  className={`cursor-pointer transition-all ${
                    p.status === 'COMPLETED'
                      ? 'fill-emerald-500 stroke-white stroke-1 hover:r-6'
                      : 'fill-rose-500 stroke-white stroke-1 hover:r-6'
                  }`}
                />
              ))}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
