import React, { useMemo, useState } from 'react';
import type { RateLimit, Transaction } from '../../api/types';
import {
  Gauge,
  Activity,
  ShieldCheck,
  Sparkles,
  BarChart2
} from 'lucide-react';
import { TransactionHoverTooltip, type TransactionHoverDetails } from '../common/TransactionHoverTooltip';
import { formatTimeTaken } from '../../utils/transactionFormat';

interface RateLimitVisualDiagramProps {
  rateLimit: RateLimit | null;
  transactions?: Transaction[];
  isLoading?: boolean;
}

export const RateLimitVisualDiagram: React.FC<RateLimitVisualDiagramProps> = ({
  rateLimit,
  transactions = [],
  isLoading = false,
}) => {
  const [hoveredDetails, setHoveredDetails] = useState<TransactionHoverDetails | null>(null);

  const limitPerSec = rateLimit?.limitPerSecond || 100;
  const burstAllowance = limitPerSec * 1.5;

  // Compute ingress rate progression from past transactions
  const { ratePoints, peakRate, avgRate } = useMemo(() => {
    if (transactions.length === 0) {
      return { ratePoints: [], peakRate: 0, avgRate: 0 };
    }

    const sorted = [...transactions].sort(
      (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
    );

    const t0 = new Date(sorted[0].submittedAt).getTime();
    const tEnd = new Date(sorted[sorted.length - 1].submittedAt).getTime();
    const durationSec = Math.max(1, (tEnd - t0) / 1000);

    const numPoints = 10;
    const stepSec = Math.max(1, durationSec / numPoints);

    const pts: { timeSec: number; rps: number; repTx: Transaction; count: number }[] = [];
    let maxRps = 0;

    for (let i = 1; i <= numPoints; i++) {
      const upTo = t0 + i * stepSec * 1000;
      const inInterval = sorted.filter((tx) => {
        const t = new Date(tx.submittedAt).getTime();
        return t > upTo - stepSec * 1000 && t <= upTo;
      });
      const countInInterval = inInterval.length;

      const rps = Math.round((countInInterval / stepSec) * 10) / 10;
      maxRps = Math.max(maxRps, rps);
      const repTx = inInterval[0] || sorted[Math.min(i - 1, sorted.length - 1)];

      pts.push({
        timeSec: Math.round(i * stepSec * 10) / 10,
        rps: rps > 0 ? rps : Math.max(1, Math.round((sorted.length / durationSec) * 10) / 10),
        repTx,
        count: countInInterval,
      });
    }

    const avg = pts.length > 0 ? Math.round((pts.reduce((a, b) => a + b.rps, 0) / pts.length) * 10) / 10 : 0;

    return {
      ratePoints: pts,
      peakRate: Math.max(maxRps, avg),
      avgRate: avg,
    };
  }, [transactions]);

  const handlePointHover = (p: { timeSec: number; rps: number; repTx: Transaction; count: number }) => {
    const tx = p.repTx;
    if (tx) {
      setHoveredDetails({
        id: tx.id,
        amt: tx.amount,
        currency: tx.currency,
        status: tx.status,
        timeTaken: formatTimeTaken(tx),
        title: `Ingress Point (+${p.timeSec}s)`,
        note: `Recorded rate: ${p.rps} req/s (${p.count} txns in window)`,
      });
    }
  };

  const handleMeterHover = () => {
    const latestTx = transactions[0];
    if (latestTx) {
      setHoveredDetails({
        id: latestTx.id,
        amt: latestTx.amount,
        currency: latestTx.currency,
        status: latestTx.status,
        timeTaken: formatTimeTaken(latestTx),
        title: 'Rate Limit Capacity Meter',
        note: `Load: ${avgRate} req/s / ${limitPerSec} req/s SLA (${capacityPct}%)`,
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

  const chartHeight = 160;
  const chartWidth = 560;
  const paddingX = 45;
  const paddingY = 25;
  const innerWidth = chartWidth - paddingX * 2;
  const innerHeight = chartHeight - paddingY * 2;

  const yMax = Math.max(limitPerSec * 1.2, burstAllowance * 1.1, peakRate * 1.3, 100);

  const stepX = innerWidth / Math.max(ratePoints.length - 1, 1);
  const points = ratePoints.map((p, idx) => {
    const x = paddingX + idx * stepX;
    const y = paddingY + innerHeight - (p.rps / yMax) * innerHeight;
    return { ...p, x, y };
  });

  const polylineStr = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPathStr = points.length > 0
    ? `M ${points[0].x},${paddingY + innerHeight} L ${polylineStr} L ${points[points.length - 1].x},${paddingY + innerHeight} Z`
    : '';

  // Limit line Y coordinate
  const limitY = paddingY + innerHeight - (limitPerSec / yMax) * innerHeight;
  const burstY = paddingY + innerHeight - (burstAllowance / yMax) * innerHeight;

  const capacityPct = Math.min(100, Math.round((avgRate / limitPerSec) * 100));

  return (
    <div className="relative bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Floating Hover Details for any point or bar in the diagram */}
      {hoveredDetails && (
        <div className="absolute top-16 right-6 z-40 max-w-xs shadow-2xl">
          <TransactionHoverTooltip details={hoveredDetails} />
        </div>
      )}

      {/* Header */}
      <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-400/20">
              <BarChart2 className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
              Visual Representation of Ingress Load vs Rate Limit
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                Token Bucket Visualizer
              </span>
            </h3>
          </div>
          <p className="text-xs text-indigo-200/70 mt-1">
            Visual comparison of past transactions submission throughput against token-bucket threshold ceiling.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="px-3 py-1.5 rounded-xl bg-white/10 backdrop-blur-xs border border-white/10 text-center">
            <span className="text-[10px] text-slate-300 block uppercase font-medium">Configured Limit</span>
            <span className="text-sm font-bold font-mono text-white">{limitPerSec} req/s</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-400/20 text-center">
            <span className="text-[10px] text-emerald-300 block uppercase font-medium">Headroom</span>
            <span className="text-sm font-bold font-mono text-emerald-400">
              {Math.max(0, limitPerSec - avgRate).toFixed(1)} req/s
            </span>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Visual Ingress Capacity Meter & Threshold Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5 cursor-pointer hover:border-indigo-300 transition-colors"
            onMouseEnter={handleMeterHover}
            onMouseLeave={() => setHoveredDetails(null)}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-indigo-600" />
                Ingress Rate Limit Utilization
              </span>
              <span className="font-mono text-[11px] text-slate-500">
                Avg: <strong className="text-blue-600">{avgRate} req/s</strong> / {limitPerSec} req/s ({capacityPct}%)
              </span>
            </div>

            <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden shadow-inner">
              <div
                style={{ width: `${capacityPct}%` }}
                className={`h-full transition-all ${
                  capacityPct > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              />
            </div>

            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>0% load</span>
              <span className="text-emerald-600 font-medium">Normal Operating Window</span>
              <span>100% capacity</span>
            </div>
          </div>

          <div
            className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2 cursor-pointer hover:border-emerald-300 transition-colors"
            onMouseEnter={handleMeterHover}
            onMouseLeave={() => setHoveredDetails(null)}
          >
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Token-Bucket SLA Compliance
            </span>
            <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono">
              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-sans">Accepted</span>
                <span className="text-xs font-bold text-emerald-600">{transactions.length}</span>
              </div>
              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-sans">Rejected (429)</span>
                <span className="text-xs font-bold text-slate-600">{rateLimit?.totalRejected || 0}</span>
              </div>
              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-sans">Peak Rate</span>
                <span className="text-xs font-bold text-indigo-600">{peakRate} rps</span>
              </div>
            </div>
          </div>
        </div>

        {/* Visual SVG Ingress Timeline Diagram vs Rate Limit Line */}
        <div className="border border-slate-200/80 rounded-xl p-4 bg-slate-50/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3 text-xs">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-indigo-600" />
                Historical Ingress Rate vs Rate Limit Threshold
              </span>
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-indigo-600 inline-block"></span>
                  Past Ingress (req/s)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 border-t border-rose-500 border-dashed inline-block"></span>
                  Limit ({limitPerSec} req/s)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 border-t border-amber-500 border-dotted inline-block"></span>
                  Burst Ceiling ({burstAllowance} req/s)
                </span>
              </div>
            </div>

            <span className="text-[11px] text-slate-400 font-mono">Hover points for (id, amt, status, time taken)</span>
          </div>

          <div className="relative w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-auto text-slate-300"
            >
              <defs>
                <linearGradient id="ingressGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {[0, 0.5, 1].map((pct, idx) => {
                const y = paddingY + innerHeight * (1 - pct);
                const val = Math.round(yMax * pct);
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
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Burst ceiling line (amber dotted) */}
              <line
                x1={paddingX}
                y1={burstY}
                x2={chartWidth - paddingX}
                y2={burstY}
                stroke="#f59e0b"
                strokeDasharray="2 3"
                strokeWidth="1.5"
              />
              <text
                x={chartWidth - paddingX - 4}
                y={burstY - 3}
                textAnchor="end"
                className="text-[9px] fill-amber-600 font-mono font-bold"
              >
                Burst Limit {burstAllowance} rps
              </text>

              {/* Configured Limit line (rose dashed) */}
              <line
                x1={paddingX}
                y1={limitY}
                x2={chartWidth - paddingX}
                y2={limitY}
                stroke="#f43f5e"
                strokeDasharray="4 4"
                strokeWidth="1.5"
              />
              <text
                x={chartWidth - paddingX - 4}
                y={limitY - 3}
                textAnchor="end"
                className="text-[9px] fill-rose-600 font-mono font-bold"
              >
                Limit {limitPerSec} rps
              </text>

              {/* Area path */}
              {areaPathStr && <path d={areaPathStr} fill="url(#ingressGradient)" />}

              {/* Polyline */}
              {polylineStr && (
                <polyline
                  fill="none"
                  stroke="#4f46e5"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={polylineStr}
                />
              )}

              {/* Points */}
              {points.map((p, idx) => (
                <circle
                  key={idx}
                  cx={p.x}
                  cy={p.y}
                  r="4"
                  onMouseEnter={() => handlePointHover(p)}
                  onMouseLeave={() => setHoveredDetails(null)}
                  className="fill-white stroke-indigo-600 stroke-2 cursor-pointer hover:r-6 transition-all"
                />
              ))}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
