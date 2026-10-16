import React, { useState } from 'react';
import type { RateLimit } from '../../api/types';
import { apiClient } from '../../api/client';
import { Gauge, Sliders, CheckCircle2, AlertOctagon, Info } from 'lucide-react';

interface RateLimitPanelProps {
  rateLimit: RateLimit | null;
  isLoading: boolean;
  onRefresh: () => void;
}

export const RateLimitPanel: React.FC<RateLimitPanelProps> = ({
  rateLimit,
  isLoading,
  onRefresh,
}) => {
  const [newLimit, setNewLimit] = useState(rateLimit?.limitPerSecond?.toString() || '100');
  const [isUpdating, setIsUpdating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!rateLimit && isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-48 mb-4"></div>
        <div className="h-20 bg-slate-100 rounded-xl mb-4"></div>
      </div>
    );
  }

  const rl = rateLimit || {
    enabled: true,
    limitPerSecond: 100,
    currentRps: 0,
    totalAccepted: 0,
    totalRejected: 0,
    isThrottled: false,
  };

  const handleUpdateLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    const limitNum = parseFloat(newLimit);
    if (isNaN(limitNum) || limitNum <= 0) return;

    setIsUpdating(true);
    setStatusMessage(null);
    try {
      await apiClient.updateRateLimit(limitNum);
      setStatusMessage(`Rate limit successfully updated to ${limitNum} req/s`);
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update rate limit';
      setStatusMessage(`Failed to update limit: ${msg}`);
    } finally {
      setIsUpdating(false);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const usagePercent = Math.min(100, Math.round((rl.currentRps / Math.max(rl.limitPerSecond, 1)) * 100));

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-100 gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              Ingress Rate Limiting
            </h3>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
                rl.isThrottled
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {rl.isThrottled ? 'THROTTLED (Rejecting)' : 'NORMAL (Accepting)'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Token-bucket algorithm protecting <code>POST /api/transactions</code> from saturation.
          </p>
        </div>

        {/* Quick stats pills */}
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono">
            <span className="text-slate-400">Current: </span>
            <span className="font-bold text-slate-900">{rl.currentRps.toFixed(1)} req/s</span>
          </div>
          <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono">
            <span className="text-slate-400">Cap: </span>
            <span className="font-bold text-slate-900">{rl.limitPerSecond} req/s</span>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div className="mt-4 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-xs flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-600 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Live Utilization Meter */}
      <div className="my-6 p-5 bg-slate-50/70 rounded-xl border border-slate-200/80">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-slate-600" />
            <span className="text-xs font-semibold text-slate-800">Throughput Utilization</span>
          </div>
          <span className="text-xs font-mono font-bold text-slate-700">{usagePercent}% Capacity</span>
        </div>

        <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 rounded-full ${
              usagePercent > 90
                ? 'bg-rose-500'
                : usagePercent > 70
                ? 'bg-amber-500'
                : 'bg-blue-600'
            }`}
            style={{ width: `${Math.max(usagePercent, 3)}%` }}
          />
        </div>

        <div className="flex justify-between items-center mt-2 text-[11px] text-slate-400 font-mono">
          <span>0 req/s</span>
          <span>{rl.limitPerSecond / 2} req/s</span>
          <span>{rl.limitPerSecond} req/s</span>
        </div>
      </div>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-white rounded-xl border border-slate-200/80">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
            Total Accepted Requests
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600 font-mono">
              {rl.totalAccepted.toLocaleString()}
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Processed through validation pipeline</p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200/80">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
            Rejected (HTTP 429)
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-600 font-mono">
              {rl.totalRejected.toLocaleString()}
            </span>
            <AlertOctagon className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Too Many Requests with Retry-After: 1</p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200/80">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
            Burst Capacity
          </span>
          <span className="text-2xl font-bold text-slate-900 font-mono">
            {Math.round(rl.limitPerSecond * 1.5)}
          </span>
          <p className="text-[11px] text-slate-500 mt-1">Max burst allowance (1.5x limit)</p>
        </div>
      </div>

      {/* Dynamic Limit Adjustment Form */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80">
        <form onSubmit={handleUpdateLimit} className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5 mb-1.5">
              <Sliders className="w-3.5 h-3.5 text-blue-600" />
              Adjust Ingress Rate Limit (Requests / Second)
            </label>
            <input
              type="number"
              min="1"
              max="5000"
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              placeholder="e.g. 50, 100, 500"
            />
          </div>

          <button
            type="submit"
            disabled={isUpdating}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 shadow-xs"
          >
            {isUpdating ? 'Applying...' : 'Apply New Limit'}
          </button>
        </form>
        <p className="text-[11px] text-slate-400 mt-2">
          Note: Low limits (e.g. 10 req/s) allow testing rate-limit enforcement and HTTP 429 response handling in the Load Testing page.
        </p>
      </div>
    </div>
  );
};
