import React, { useState, useRef } from 'react';
import type { LoadTestConfig, LoadTestMetrics, CreateTransactionRequest } from '../../api/types';
import { apiClient } from '../../api/client';
import { Play, Square, RotateCcw, Activity, Zap, CheckCircle2, AlertOctagon, XCircle, Clock } from 'lucide-react';

export const LoadTestPanel: React.FC = () => {
  const [config, setConfig] = useState<LoadTestConfig>({
    totalRequests: 100,
    concurrency: 5,
    amountMin: 10,
    amountMax: 500,
    currency: 'USD',
    descriptionPrefix: 'LOAD_TEST',
  });

  const [metrics, setMetrics] = useState<LoadTestMetrics>({
    totalSent: 0,
    succeeded: 0,
    conflicts: 0,
    rateLimited: 0,
    errors: 0,
    rps: 0,
    minLatencyMs: 0,
    maxLatencyMs: 0,
    avgLatencyMs: 0,
    p50LatencyMs: 0,
    p90LatencyMs: 0,
    p95LatencyMs: 0,
    p99LatencyMs: 0,
    durationMs: 0,
    status: 'IDLE',
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const latenciesRef = useRef<number[]>([]);
  const startTimeRef = useRef<number>(0);

  const calculatePercentile = (sortedArr: number[], p: number): number => {
    if (sortedArr.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedArr.length) - 1;
    return sortedArr[Math.max(0, Math.min(index, sortedArr.length - 1))];
  };

  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  const handleStart = async () => {
    if (metrics.status === 'RUNNING') return;

    abortControllerRef.current = new AbortController();
    latenciesRef.current = [];
    startTimeRef.current = performance.now();

    setMetrics({
      totalSent: 0,
      succeeded: 0,
      conflicts: 0,
      rateLimited: 0,
      errors: 0,
      rps: 0,
      minLatencyMs: 0,
      maxLatencyMs: 0,
      avgLatencyMs: 0,
      p50LatencyMs: 0,
      p90LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      durationMs: 0,
      status: 'RUNNING',
    });

    let sent = 0;
    let succeeded = 0;
    let conflicts = 0;
    let rateLimited = 0;
    let errors = 0;

    const totalToRun = config.totalRequests;
    const concurrency = Math.min(config.concurrency, totalToRun);

    // Worker queue runner
    let currentIndex = 0;

    const runWorker = async (workerId: number) => {
      while (currentIndex < totalToRun) {
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        const taskIndex = currentIndex++;
        const reqStart = performance.now();

        const amountVal = parseFloat(
          (config.amountMin + Math.random() * (config.amountMax - config.amountMin)).toFixed(2)
        );

        const payload: CreateTransactionRequest = {
          id: generateUUID(),
          amount: amountVal,
          currency: config.currency,
          description: `${config.descriptionPrefix} [Worker #${workerId} Req #${taskIndex + 1}]`,
          timestamp: new Date().toISOString(),
        };

        try {
          await apiClient.submitTransaction(payload);
          succeeded++;
        } catch (err: any) {
          if (err.status === 409) {
            conflicts++;
          } else if (err.status === 429) {
            rateLimited++;
          } else {
            errors++;
          }
        }

        const reqEnd = performance.now();
        const latency = Math.round(reqEnd - reqStart);
        latenciesRef.current.push(latency);
        sent++;

        // Update live stats every 3 requests or at the end
        if (sent % 3 === 0 || sent === totalToRun) {
          const elapsedSec = Math.max((performance.now() - startTimeRef.current) / 1000, 0.001);
          const currentRps = Math.round((sent / elapsedSec) * 10) / 10;

          const sorted = [...latenciesRef.current].sort((a, b) => a - b);
          const totalLat = sorted.reduce((acc, curr) => acc + curr, 0);

          setMetrics((prev) => ({
            ...prev,
            totalSent: sent,
            succeeded,
            conflicts,
            rateLimited,
            errors,
            rps: currentRps,
            minLatencyMs: sorted[0] || 0,
            maxLatencyMs: sorted[sorted.length - 1] || 0,
            avgLatencyMs: Math.round(totalLat / sorted.length) || 0,
            p50LatencyMs: calculatePercentile(sorted, 50),
            p90LatencyMs: calculatePercentile(sorted, 90),
            p95LatencyMs: calculatePercentile(sorted, 95),
            p99LatencyMs: calculatePercentile(sorted, 99),
            durationMs: Math.round(performance.now() - startTimeRef.current),
          }));
        }
      }
    };

    // Spawn concurrent workers
    const workers = Array.from({ length: concurrency }, (_, i) => runWorker(i + 1));
    await Promise.all(workers);

    const finalDuration = Math.round(performance.now() - startTimeRef.current);
    const finalElapsedSec = Math.max(finalDuration / 1000, 0.001);
    const finalRps = Math.round((sent / finalElapsedSec) * 10) / 10;
    const sorted = [...latenciesRef.current].sort((a, b) => a - b);
    const totalLat = sorted.reduce((acc, curr) => acc + curr, 0);

    const isAborted = abortControllerRef.current?.signal.aborted;

    setMetrics({
      totalSent: sent,
      succeeded,
      conflicts,
      rateLimited,
      errors,
      rps: finalRps,
      minLatencyMs: sorted[0] || 0,
      maxLatencyMs: sorted[sorted.length - 1] || 0,
      avgLatencyMs: sorted.length > 0 ? Math.round(totalLat / sorted.length) : 0,
      p50LatencyMs: calculatePercentile(sorted, 50),
      p90LatencyMs: calculatePercentile(sorted, 90),
      p95LatencyMs: calculatePercentile(sorted, 95),
      p99LatencyMs: calculatePercentile(sorted, 99),
      durationMs: finalDuration,
      status: isAborted ? 'STOPPED' : 'COMPLETED',
    });
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleReset = () => {
    handleStop();
    setMetrics({
      totalSent: 0,
      succeeded: 0,
      conflicts: 0,
      rateLimited: 0,
      errors: 0,
      rps: 0,
      minLatencyMs: 0,
      maxLatencyMs: 0,
      avgLatencyMs: 0,
      p50LatencyMs: 0,
      p90LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      durationMs: 0,
      status: 'IDLE',
    });
  };

  const progressPercent = config.totalRequests > 0
    ? Math.min(100, Math.round((metrics.totalSent / config.totalRequests) * 100))
    : 0;

  return (
    <div className="space-y-6">
      {/* Configuration Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-100 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-600" />
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Load Testing Generator
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Safely exercises the transaction ingress pipeline with configurable concurrency. Traffic is tagged with <code>LOAD_TEST</code>.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {metrics.status === 'RUNNING' ? (
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-xs"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Stop Test</span>
              </button>
            ) : (
              <button
                onClick={handleStart}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Start Load Test</span>
              </button>
            )}

            <button
              onClick={handleReset}
              disabled={metrics.status === 'RUNNING'}
              className="p-2 text-slate-600 hover:text-slate-900 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-2xs"
              title="Reset Results"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Form Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Total Requests</label>
            <input
              type="number"
              min="10"
              max="2000"
              step="10"
              value={config.totalRequests}
              disabled={metrics.status === 'RUNNING'}
              onChange={(e) => setConfig({ ...config, totalRequests: parseInt(e.target.value) || 10 })}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-60"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">Limit: 10 – 2000 requests</span>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Concurrency (Workers)</label>
            <input
              type="number"
              min="1"
              max="50"
              value={config.concurrency}
              disabled={metrics.status === 'RUNNING'}
              onChange={(e) => setConfig({ ...config, concurrency: parseInt(e.target.value) || 1 })}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-60"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">Simultaneous async workers</span>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Amount Range ($)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={config.amountMin}
                disabled={metrics.status === 'RUNNING'}
                onChange={(e) => setConfig({ ...config, amountMin: parseFloat(e.target.value) || 1 })}
                className="w-full px-2.5 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg disabled:opacity-60"
                placeholder="Min"
              />
              <span className="text-slate-400 text-xs">to</span>
              <input
                type="number"
                min="1"
                value={config.amountMax}
                disabled={metrics.status === 'RUNNING'}
                onChange={(e) => setConfig({ ...config, amountMax: parseFloat(e.target.value) || 100 })}
                className="w-full px-2.5 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg disabled:opacity-60"
                placeholder="Max"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Currency</label>
            <select
              value={config.currency}
              disabled={metrics.status === 'RUNNING'}
              onChange={(e) => setConfig({ ...config, currency: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="INR">INR (₹)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Progress & Live Execution Bar */}
      {(metrics.status === 'RUNNING' || metrics.status === 'COMPLETED' || metrics.status === 'STOPPED') && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800">
                {metrics.status === 'RUNNING'
                  ? 'Executing Load Test...'
                  : metrics.status === 'COMPLETED'
                  ? 'Load Test Completed'
                  : 'Load Test Aborted'}
              </span>
            </div>
            <div className="text-xs font-mono text-slate-500">
              <span className="font-bold text-slate-900">{metrics.totalSent}</span> / {config.totalRequests} ({progressPercent}%)
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden my-3">
            <div
              className={`h-full transition-all duration-200 rounded-full ${
                metrics.status === 'COMPLETED'
                  ? 'bg-emerald-500'
                  : metrics.status === 'STOPPED'
                  ? 'bg-rose-500'
                  : 'bg-blue-600'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-[11px] text-slate-500 font-mono">
            <span>Duration: {(metrics.durationMs / 1000).toFixed(2)}s</span>
            <span>Live Throughput: <strong className="text-slate-900">{metrics.rps} req/s</strong></span>
          </div>
        </div>
      )}

      {/* Result Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
            Successful (202 Accepted)
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600 font-mono">
              {metrics.succeeded}
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Queued in transactional outbox</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
            Rate Limited (429)
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-600 font-mono">
              {metrics.rateLimited}
            </span>
            <AlertOctagon className="w-4 h-4 text-amber-500" />
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Throttled by token bucket</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
            Conflicts (409)
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-orange-600 font-mono">
              {metrics.conflicts}
            </span>
            <Clock className="w-4 h-4 text-orange-500" />
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">UUID reuse collisions</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
            Network / Server Errors
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-600 font-mono">
              {metrics.errors}
            </span>
            <XCircle className="w-4 h-4 text-rose-500" />
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">5xx / Network exceptions</span>
        </div>
      </div>

      {/* Latency Percentiles Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-600" />
          Response Latency Distribution
        </h4>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-center">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Average</span>
            <span className="text-lg font-bold text-slate-800 font-mono">{metrics.avgLatencyMs} ms</span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">p50 (Median)</span>
            <span className="text-lg font-bold text-slate-800 font-mono">{metrics.p50LatencyMs} ms</span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">p90</span>
            <span className="text-lg font-bold text-slate-800 font-mono">{metrics.p90LatencyMs} ms</span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">p95</span>
            <span className="text-lg font-bold text-slate-800 font-mono">{metrics.p95LatencyMs} ms</span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">p99</span>
            <span className="text-lg font-bold text-slate-800 font-mono">{metrics.p99LatencyMs} ms</span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Min / Max</span>
            <span className="text-xs font-bold text-slate-700 font-mono block mt-1">
              {metrics.minLatencyMs} / {metrics.maxLatencyMs} ms
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
