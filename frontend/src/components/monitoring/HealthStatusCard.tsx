import React from 'react';
import type { SystemHealth } from '../../api/types';
import { StatusBadge } from '../common/StatusBadge';
import { Server, Database, Layers, Radio, Activity, RefreshCw } from 'lucide-react';

interface HealthStatusCardProps {
  health: SystemHealth | null;
  isLoading: boolean;
  onRefresh: () => void;
}

export const HealthStatusCard: React.FC<HealthStatusCardProps> = ({
  health,
  isLoading,
  onRefresh,
}) => {
  const getComponentIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('database') || lower.includes('sqlite')) {
      return <Database className="w-4 h-4 text-blue-600" />;
    }
    if (lower.includes('redis') || lower.includes('queue')) {
      return <Layers className="w-4 h-4 text-rose-600" />;
    }
    if (lower.includes('remote') || lower.includes('gateway') || lower.includes('posting')) {
      return <Radio className="w-4 h-4 text-purple-600" />;
    }
    return <Server className="w-4 h-4 text-emerald-600" />;
  };

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  };

  if (!health && isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs animate-pulse">
        <div className="h-5 bg-slate-200 rounded w-40 mb-3"></div>
        <div className="space-y-3">
          <div className="h-10 bg-slate-100 rounded-lg"></div>
          <div className="h-10 bg-slate-100 rounded-lg"></div>
        </div>
      </div>
    );
  }

  const h = health || {
    overallStatus: 'UP',
    timestamp: '',
    uptimeSeconds: 0,
    components: [],
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
      <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-slate-900 tracking-tight">System Infrastructure Health</h3>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={h.overallStatus} size="sm" />
          <button
            onClick={onRefresh}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-md transition-colors"
            title="Refresh Health"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      <div className="space-y-2.5">
        {h.components.map((comp, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
                {getComponentIcon(comp.name)}
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-800 block">{comp.name}</span>
                {comp.message && (
                  <span className="text-[11px] text-slate-500 block truncate max-w-[200px] sm:max-w-xs">
                    {comp.message}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {comp.latencyMs !== undefined && comp.latencyMs !== null && (
                <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                  {(comp.latencyMs / 1000).toFixed(3)}s
                </span>
              )}
              <StatusBadge status={comp.status} size="sm" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
        <span>Application Uptime:</span>
        <span className="font-semibold text-slate-800">{formatUptime(h.uptimeSeconds)}</span>
      </div>
    </div>
  );
};
