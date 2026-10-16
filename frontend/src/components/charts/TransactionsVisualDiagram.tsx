import React, { useMemo, useState } from 'react';
import type { Transaction } from '../../api/types';
import { formatTimeTaken } from '../../utils/transactionFormat';
import { TransactionHoverTooltip, type TransactionHoverDetails } from '../common/TransactionHoverTooltip';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  Activity,
  BarChart3,
  Sparkles
} from 'lucide-react';

interface TransactionsVisualDiagramProps {
  transactions: Transaction[];
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  isLoading?: boolean;
}

export const TransactionsVisualDiagram: React.FC<TransactionsVisualDiagramProps> = ({
  transactions,
  statusFilter,
  onStatusFilterChange,
  isLoading = false,
}) => {
  const [hoveredTxDetails, setHoveredTxDetails] = useState<TransactionHoverDetails | null>(null);
  const [hoverCoords, setHoverCoords] = useState<{ x: number; y: number } | null>(null);

  const handleHover = (
    bucket: { timeLabel: string; completed: number; failed: number; pending: number; total: number; avgLatency: number; transactions: Transaction[] },
    statusType?: 'COMPLETED' | 'FAILED' | 'PENDING'
  ) => {
    const pool = bucket.transactions && bucket.transactions.length > 0 ? bucket.transactions : transactions;
    let match = statusType ? pool.find((t) => t.status === statusType) : pool[0];
    if (!match && pool.length > 0) match = pool[0];

    if (match) {
      setHoveredTxDetails({
        id: match.id,
        amt: match.amount,
        currency: match.currency,
        status: match.status,
        timeTaken: formatTimeTaken(match),
        title: `${bucket.timeLabel} • ${statusType || match.status} Transaction`,
        note: bucket.total > 1 ? `Bucket Total: ${bucket.completed} completed, ${bucket.failed} failed, ${bucket.pending} in-flight` : undefined,
      });
    } else {
      setHoveredTxDetails({
        id: `txn-${bucket.timeLabel.replace(':', '')}`,
        amt: '0.00',
        currency: 'INR',
        status: statusType || 'COMPLETED',
        timeTaken: `${bucket.avgLatency}ms`,
        title: `${bucket.timeLabel} Window`,
      });
    }
  };

  // Compute status distribution
  const stats = useMemo(() => {
    const total = transactions.length;
    let completed = 0;
    let failed = 0;
    let processing = 0;
    let pending = 0;
    const latencies: number[] = [];

    transactions.forEach((tx) => {
      if (tx.status === 'COMPLETED') completed++;
      else if (tx.status === 'FAILED') failed++;
      else if (tx.status === 'PROCESSING') processing++;
      else pending++;

      if (tx.status === 'COMPLETED' && tx.completedAt && tx.submittedAt) {
        const diff = new Date(tx.completedAt).getTime() - new Date(tx.submittedAt).getTime();
        latencies.push(Math.max(0, diff));
      }
    });

    latencies.sort((a, b) => a - b);
    const medianLatency = latencies.length > 0 ? latencies[Math.floor(latencies.length / 2)] : 0;
    const avgLatency = latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;

    const successPct = total > 0 ? Math.round((completed / total) * 100) : 100;

    return {
      total,
      completed,
      failed,
      processing,
      pending,
      medianLatency,
      avgLatency,
      successPct,
    };
  }, [transactions]);

  // Compute time-series buckets for the visual timeline diagram
  const timelineBuckets = useMemo(() => {
    if (transactions.length === 0) return [];

    const sorted = [...transactions].sort(
      (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
    );

    const minTime = new Date(sorted[0].submittedAt).getTime();
    const maxTime = new Date(sorted[sorted.length - 1].submittedAt).getTime();
    const span = Math.max(maxTime - minTime, 60000);
    const numBuckets = 8;
    const bucketSize = span / numBuckets;

    return Array.from({ length: numBuckets }, (_, i) => {
      const bStart = minTime + i * bucketSize;
      const bEnd = i === numBuckets - 1 ? maxTime + 1000 : minTime + (i + 1) * bucketSize;

      const inB = sorted.filter((tx) => {
        const t = new Date(tx.submittedAt).getTime();
        return t >= bStart && t <= bEnd;
      });

      const completed = inB.filter((tx) => tx.status === 'COMPLETED').length;
      const failed = inB.filter((tx) => tx.status === 'FAILED').length;
      const pending = inB.filter((tx) => tx.status === 'PENDING' || tx.status === 'PROCESSING').length;

      const compLatencies = inB
        .filter((tx) => tx.status === 'COMPLETED' && tx.completedAt && tx.submittedAt)
        .map((tx) => Math.max(0, new Date(tx.completedAt!).getTime() - new Date(tx.submittedAt).getTime()));

      const avgLatency = compLatencies.length > 0
        ? Math.round(compLatencies.reduce((a, b) => a + b, 0) / compLatencies.length)
        : 0;

      const date = new Date(bStart);
      const timeLabel = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

      return {
        timeLabel,
        completed,
        failed,
        pending,
        total: inB.length,
        avgLatency,
        transactions: inB,
      };
    });
  }, [transactions]);

  if (isLoading && transactions.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs animate-pulse">
        <div className="h-5 bg-slate-200 rounded w-1/4 mb-4"></div>
        <div className="h-32 bg-slate-100 rounded-xl"></div>
      </div>
    );
  }

  const maxBucketCount = Math.max(...timelineBuckets.map((b) => b.total), 5);
  const maxLatency = Math.max(...timelineBuckets.map((b) => b.avgLatency), 100);

  const chartHeight = 160;
  const chartWidth = 560;
  const paddingX = 40;
  const paddingY = 20;
  const innerWidth = chartWidth - paddingX * 2;
  const innerHeight = chartHeight - paddingY * 2;
  const stepX = innerWidth / Math.max(timelineBuckets.length - 1, 1);

  // Polyline points for average latency curve
  const latencyPoints = timelineBuckets.map((b, idx) => {
    const x = paddingX + idx * stepX;
    const y = paddingY + innerHeight - (b.avgLatency / maxLatency) * innerHeight;
    return { x, y, latency: b.avgLatency, timeLabel: b.timeLabel };
  });

  const latencyPolyline = latencyPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Top Banner Header */}
      <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-400/20">
              <BarChart3 className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
              Visual Representation of Past Transactions
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                Live Ledger Sync
              </span>
            </h3>
          </div>
          <p className="text-xs text-indigo-200/70 mt-1">
            Visual audit distribution of all past transactions stored in SQLite outbox with real-time latency curve.
          </p>
        </div>

        {/* Quick KPI Badges */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="px-3 py-1.5 rounded-xl bg-white/10 backdrop-blur-xs border border-white/10 text-center">
            <span className="text-[10px] text-slate-300 block uppercase font-medium">Audited</span>
            <span className="text-sm font-bold font-mono text-white">{stats.total} txns</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-400/20 text-center">
            <span className="text-[10px] text-emerald-300 block uppercase font-medium">Success SLA</span>
            <span className="text-sm font-bold font-mono text-emerald-400">{stats.successPct}%</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-blue-500/15 border border-blue-400/20 text-center">
            <span className="text-[10px] text-blue-300 block uppercase font-medium">Avg Latency</span>
            <span className="text-sm font-bold font-mono text-blue-300">
              {stats.avgLatency > 1000 ? `${(stats.avgLatency / 1000).toFixed(2)}s` : `${stats.avgLatency}ms`}
            </span>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Visual Status Breakdown Bar & Interactive Filter Pills */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              Status Composition Across All Recorded History
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              {stats.completed} Completed • {stats.failed} Failed • {stats.pending + stats.processing} In-flight
            </span>
          </div>

          {/* Color-coded proportional bar */}
          <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
            {stats.completed > 0 && (
              <div
                style={{ width: `${(stats.completed / Math.max(stats.total, 1)) * 100}%` }}
                className="bg-emerald-500 h-full transition-all"
                title={`Completed: ${stats.completed}`}
              />
            )}
            {stats.failed > 0 && (
              <div
                style={{ width: `${(stats.failed / Math.max(stats.total, 1)) * 100}%` }}
                className="bg-rose-500 h-full transition-all"
                title={`Failed: ${stats.failed}`}
              />
            )}
            {stats.processing > 0 && (
              <div
                style={{ width: `${(stats.processing / Math.max(stats.total, 1)) * 100}%` }}
                className="bg-blue-500 h-full transition-all"
                title={`Processing: ${stats.processing}`}
              />
            )}
            {stats.pending > 0 && (
              <div
                style={{ width: `${(stats.pending / Math.max(stats.total, 1)) * 100}%` }}
                className="bg-amber-400 h-full transition-all"
                title={`Pending: ${stats.pending}`}
              />
            )}
          </div>

          {/* Interactive Filter Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3">
            <button
              onClick={() => onStatusFilterChange(statusFilter === 'ALL' ? 'ALL' : 'ALL')}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'border-indigo-400 bg-indigo-50/50 shadow-xs'
                  : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-600">ALL RECORDS</span>
                <span className="text-xs font-bold text-slate-800 font-mono">{stats.total}</span>
              </div>
              <span className="text-[10px] text-slate-400">100% of ledger</span>
            </button>

            <button
              onClick={() => onStatusFilterChange(statusFilter === 'COMPLETED' ? 'ALL' : 'COMPLETED')}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                statusFilter === 'COMPLETED'
                  ? 'border-emerald-400 bg-emerald-50/50 shadow-xs'
                  : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> COMPLETED
                </span>
                <span className="text-xs font-bold text-emerald-800 font-mono">{stats.completed}</span>
              </div>
              <span className="text-[10px] text-slate-400">
                {stats.total > 0 ? `${Math.round((stats.completed / stats.total) * 100)}%` : '0%'} confirmed
              </span>
            </button>

            <button
              onClick={() => onStatusFilterChange(statusFilter === 'FAILED' ? 'ALL' : 'FAILED')}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                statusFilter === 'FAILED'
                  ? 'border-rose-400 bg-rose-50/50 shadow-xs'
                  : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-rose-700 flex items-center gap-1">
                  <XCircle className="w-3 h-3 text-rose-600" /> FAILED
                </span>
                <span className="text-xs font-bold text-rose-800 font-mono">{stats.failed}</span>
              </div>
              <span className="text-[10px] text-slate-400">
                {stats.total > 0 ? `${Math.round((stats.failed / stats.total) * 100)}%` : '0%'} errors
              </span>
            </button>

            <button
              onClick={() => onStatusFilterChange(statusFilter === 'PENDING' ? 'ALL' : 'PENDING')}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                statusFilter === 'PENDING'
                  ? 'border-amber-400 bg-amber-50/50 shadow-xs'
                  : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-amber-700 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-600" /> IN-FLIGHT
                </span>
                <span className="text-xs font-bold text-amber-800 font-mono">
                  {stats.pending + stats.processing}
                </span>
              </div>
              <span className="text-[10px] text-slate-400">Awaiting dispatch</span>
            </button>
          </div>
        </div>

        {/* Visual SVG Timeline Diagram: Volume Bars + Latency Curve */}
        <div className="border border-slate-200/80 rounded-xl p-4 bg-slate-50/50 relative">
          {/* Floating Tooltip displaying ID, Amt, Status, Time Taken dynamically anchored to cursor */}
          {hoveredTxDetails && (
            <TransactionHoverTooltip details={hoveredTxDetails} coords={hoverCoords} />
          )}

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                <Activity className="w-3.5 h-3.5 text-indigo-600" />
                <span>Historical Volume & Processing Latency Progression</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block"></span>
                  Completed Volume
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-blue-600 inline-block"></span>
                  Avg Latency Curve
                </span>
              </div>
            </div>
          </div>

          <div className="relative w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-auto text-slate-300"
            >
              <defs>
                <linearGradient id="txLatencyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {[0, 0.5, 1].map((pct, idx) => {
                const y = paddingY + innerHeight * (1 - pct);
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
                      {Math.round(maxBucketCount * pct)}
                    </text>
                  </g>
                );
              })}

              {/* Volume Bars */}
              {timelineBuckets.map((bucket, idx) => {
                const centerX = paddingX + idx * stepX;
                const barWidth = 14;
                const hCompleted = (bucket.completed / maxBucketCount) * innerHeight;
                const hFailed = (bucket.failed / maxBucketCount) * innerHeight;

                return (
                  <g
                    key={idx}
                    onMouseEnter={(e) => {
                      setHoverCoords({ x: e.clientX, y: e.clientY });
                      handleHover(bucket);
                    }}
                    onMouseMove={(e) => {
                      setHoverCoords({ x: e.clientX, y: e.clientY });
                    }}
                    onMouseLeave={() => {
                      setHoveredTxDetails(null);
                      setHoverCoords(null);
                    }}
                    className="cursor-pointer group"
                  >
                    {/* Completed bar */}
                    <rect
                      x={centerX - barWidth / 2}
                      y={paddingY + innerHeight - hCompleted}
                      width={barWidth}
                      height={Math.max(hCompleted, bucket.completed > 0 ? 3 : 0)}
                      rx="3"
                      onMouseEnter={(e) => {
                        e.stopPropagation();
                        setHoverCoords({ x: e.clientX, y: e.clientY });
                        handleHover(bucket, 'COMPLETED');
                      }}
                      onMouseMove={(e) => {
                        setHoverCoords({ x: e.clientX, y: e.clientY });
                      }}
                      className="fill-emerald-500 group-hover:fill-emerald-600 transition-colors"
                    />
                    {/* Failed bar stacked if any */}
                    {bucket.failed > 0 && (
                      <rect
                        x={centerX - barWidth / 2}
                        y={paddingY + innerHeight - hCompleted - hFailed}
                        width={barWidth}
                        height={Math.max(hFailed, 3)}
                        rx="3"
                        onMouseEnter={(e) => {
                          e.stopPropagation();
                          setHoverCoords({ x: e.clientX, y: e.clientY });
                          handleHover(bucket, 'FAILED');
                        }}
                        onMouseMove={(e) => {
                          setHoverCoords({ x: e.clientX, y: e.clientY });
                        }}
                        className="fill-rose-500 group-hover:fill-rose-600 transition-colors"
                      />
                    )}

                    {/* Time Label */}
                    <text
                      x={centerX}
                      y={chartHeight - 4}
                      textAnchor="middle"
                      className="text-[10px] fill-slate-400 font-mono"
                    >
                      {bucket.timeLabel}
                    </text>
                  </g>
                );
              })}

              {/* Latency Curve Stroke */}
              {latencyPolyline && (
                <polyline
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={latencyPolyline}
                />
              )}

              {/* Point Markers */}
              {latencyPoints.map((p, idx) => (
                <circle
                  key={idx}
                  cx={p.x}
                  cy={p.y}
                  r="4"
                  onMouseEnter={(e) => {
                    setHoverCoords({ x: e.clientX, y: e.clientY });
                    const b = timelineBuckets[idx];
                    if (b) handleHover(b, 'COMPLETED');
                  }}
                  onMouseMove={(e) => {
                    setHoverCoords({ x: e.clientX, y: e.clientY });
                  }}
                  onMouseLeave={() => {
                    setHoveredTxDetails(null);
                    setHoverCoords(null);
                  }}
                  className="fill-white stroke-blue-600 stroke-2 hover:r-6 cursor-pointer transition-all"
                />
              ))}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
