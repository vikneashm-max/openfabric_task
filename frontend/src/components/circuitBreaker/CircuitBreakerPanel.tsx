import React, { useState } from 'react';
import type { CircuitBreaker } from '../../api/types';
import { apiClient } from '../../api/client';
import { StatusBadge } from '../common/StatusBadge';
import { ShieldCheck, ShieldAlert, Shield, RotateCcw, AlertTriangle, Info } from 'lucide-react';


interface CircuitBreakerPanelProps {
  circuitBreaker: CircuitBreaker | null;
  isLoading: boolean;
  onRefresh: () => void;
}

export const CircuitBreakerPanel: React.FC<CircuitBreakerPanelProps> = ({
  circuitBreaker,
  isLoading,
  onRefresh,
}) => {
  const [isActing, setIsActing] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  if (!circuitBreaker && isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-48 mb-4"></div>
        <div className="h-20 bg-slate-100 rounded-xl mb-4"></div>
      </div>
    );
  }

  const cb = circuitBreaker || {
    state: 'CLOSED',
    failureCount: 0,
    failureThreshold: 5,
    successCount: 0,
    halfOpenSuccessThreshold: 2,
    resetTimeoutSeconds: 15,
    lastStateChange: '',
    lastFailureReason: null,
    isAvailable: true,
  };

  const handleReset = async () => {
    setIsActing(true);
    setActionMessage(null);
    try {
      await apiClient.resetCircuitBreaker();
      setActionMessage('Circuit breaker reset to CLOSED');
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setActionMessage(`Failed to reset: ${msg}`);
    } finally {
      setIsActing(false);
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handleTrip = async () => {
    setIsActing(true);
    setActionMessage(null);
    try {
      await apiClient.tripCircuitBreaker();
      setActionMessage('Circuit breaker manually tripped to OPEN');
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setActionMessage(`Failed to trip: ${msg}`);
    } finally {
      setIsActing(false);
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-100 gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              Circuit Breaker Protection
            </h3>
            <StatusBadge status={cb.state} size="md" />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Monitors downstream Posting Service (<code>http://localhost:8080</code>) to prevent cascade failures.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            disabled={isActing || cb.state === 'CLOSED'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-40 transition-colors shadow-2xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to CLOSED</span>
          </button>

          <button
            onClick={handleTrip}
            disabled={isActing || cb.state === 'OPEN'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 disabled:opacity-40 transition-colors shadow-2xs"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Trip to OPEN</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="mt-4 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-xs flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-600 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* State Machine Visualizer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
        {/* CLOSED State Card */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            cb.state === 'CLOSED'
              ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500/20'
              : 'bg-slate-50/50 border-slate-200/80 opacity-60'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              1. CLOSED
            </span>
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-xs text-slate-600 font-medium">Normal Flow</p>
          <p className="text-[11px] text-slate-500 mt-1">
            Worker pushes transactions downstream. Trips if {cb.failureThreshold} consecutive failures occur.
          </p>
          <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-500">Failures:</span>
            <span className="font-semibold text-slate-800">
              {cb.failureCount} / {cb.failureThreshold}
            </span>
          </div>
        </div>

        {/* OPEN State Card */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            cb.state === 'OPEN'
              ? 'bg-rose-50/70 border-rose-300 ring-2 ring-rose-500/20'
              : 'bg-slate-50/50 border-slate-200/80 opacity-60'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              2. OPEN
            </span>
            <ShieldAlert className="w-5 h-5 text-rose-600" />
          </div>
          <p className="text-xs text-slate-600 font-medium">Service Isolated</p>
          <p className="text-[11px] text-slate-500 mt-1">
            Downstream posting is suspended. Workers postpone execution to allow downstream recovery.
          </p>
          <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-500">Cooldown:</span>
            <span className="font-semibold text-slate-800">{cb.resetTimeoutSeconds}s timeout</span>
          </div>
        </div>

        {/* HALF_OPEN State Card */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            cb.state === 'HALF_OPEN'
              ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-500/20'
              : 'bg-slate-50/50 border-slate-200/80 opacity-60'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              3. HALF-OPEN
            </span>
            <Shield className="w-5 h-5 text-amber-600" />
          </div>
          <p className="text-xs text-slate-600 font-medium">Canary Probing</p>
          <p className="text-[11px] text-slate-500 mt-1">
            Testing canary requests. Closes after {cb.halfOpenSuccessThreshold} consecutive successes.
          </p>
          <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-500">Canaries:</span>
            <span className="font-semibold text-slate-800">
              {cb.successCount} / {cb.halfOpenSuccessThreshold}
            </span>
          </div>
        </div>
      </div>

      {/* Circuit Breaker Status Details */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
        <div>
          <span className="text-[11px] text-slate-500 block uppercase font-sans font-medium">
            Threshold
          </span>
          <span className="font-bold text-slate-800">{cb.failureThreshold} Consecutive Errors</span>
        </div>

        <div>
          <span className="text-[11px] text-slate-500 block uppercase font-sans font-medium">
            Reset Cooldown
          </span>
          <span className="font-bold text-slate-800">{cb.resetTimeoutSeconds} Seconds</span>
        </div>

        <div>
          <span className="text-[11px] text-slate-500 block uppercase font-sans font-medium">
            Last Transition
          </span>
          <span className="font-bold text-slate-800">
            {cb.lastStateChange ? new Date(cb.lastStateChange).toLocaleTimeString() : '—'}
          </span>
        </div>

        <div>
          <span className="text-[11px] text-slate-500 block uppercase font-sans font-medium">
            Downstream Traffic
          </span>
          <span className={`font-bold ${cb.isAvailable ? 'text-emerald-600' : 'text-rose-600'}`}>
            {cb.isAvailable ? 'ALLOWED' : 'BLOCKED (Cooling)'}
          </span>
        </div>
      </div>

      {/* Failure reason if any */}
      {cb.lastFailureReason && (
        <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs">
          <span className="font-semibold text-rose-800 block mb-0.5">Last Tripped Failure Cause:</span>
          <p className="font-mono text-rose-700">{cb.lastFailureReason}</p>
        </div>
      )}
    </div>
  );
};
