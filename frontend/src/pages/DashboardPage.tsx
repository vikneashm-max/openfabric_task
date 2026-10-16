import React from 'react';
import type { MonitoringStats, SystemHealth, Transaction, CircuitBreaker, RateLimit } from '../api/types';
import { StatCard } from '../components/common/StatCard';
import { AlertBanner } from '../components/common/AlertBanner';
import { VolumeChart } from '../components/charts/VolumeChart';
import { LatencyChart } from '../components/charts/LatencyChart';
import { TransactionTable } from '../components/transactions/TransactionTable';
import { HealthStatusCard } from '../components/monitoring/HealthStatusCard';
import {
  TrendingUp,
  Clock,
  CheckCircle2,
  Layers,
  Activity,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Gauge,
  FileSpreadsheet
} from 'lucide-react';
import type { NavTab } from '../components/layout/Sidebar';

interface DashboardPageProps {
  stats: MonitoringStats | null;
  health: SystemHealth | null;
  transactions: Transaction[];
  circuitBreaker: CircuitBreaker | null;
  rateLimit: RateLimit | null;
  isLoading: boolean;
  onRefresh: () => void;
  onNavigateTab: (tab: NavTab) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  stats,
  health,
  transactions,
  circuitBreaker,
  rateLimit,
  isLoading,
  onRefresh,
  onNavigateTab,
  statusFilter,
  onStatusFilterChange,
  searchQuery,
  onSearchChange,
}) => {
  const s = stats || {
    totalTransactions: 0,
    pendingTransactions: 0,
    processingTransactions: 0,
    completedTransactions: 0,
    failedTransactions: 0,
    redisQueueBacklog: 0,
    throughputPerMinute: 0,
    averageLatencyMs: 0,
    successRatePercent: 100,
    failureRatePercent: 0,
    activeAlertsCount: 0,
    alerts: [],
    timeSeries: [],
  };

  return (
    <div className="space-y-6">
      {/* Alert Banners (if any) */}
      <AlertBanner alerts={s.alerts} type="warning" />

      {/* Top KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Transactions */}
        <StatCard
          title="Total Transactions"
          value={s.totalTransactions.toLocaleString()}
          subtitle={`${s.completedTransactions} completed • ${s.failedTransactions} failed`}
          icon={<TrendingUp className="w-5 h-5" />}
          accentColor="blue"
          isLoading={isLoading && !stats}
        />

        {/* Throughput */}
        <StatCard
          title="Throughput Rate"
          value={`${s.throughputPerMinute} / min`}
          subtitle={`Current Ingress: ${rateLimit?.currentRps.toFixed(1) || '0.0'} req/s`}
          icon={<Activity className="w-5 h-5" />}
          accentColor="purple"
          isLoading={isLoading && !stats}
        />

        {/* Processing Latency */}
        <StatCard
          title="Avg Processing Latency"
          value={`${(s.averageLatencyMs / 1000).toFixed(3)} s`}
          subtitle="Outbox pick-up to remote POST"
          icon={<Clock className="w-5 h-5" />}
          accentColor={s.averageLatencyMs > 4000 ? 'rose' : 'slate'}
          alert={s.averageLatencyMs > 4000}
          isLoading={isLoading && !stats}
        />

        {/* Success Rate */}
        <StatCard
          title="Success Rate"
          value={`${s.successRatePercent}%`}
          subtitle={`${s.failureRatePercent}% failure rate`}
          icon={<CheckCircle2 className="w-5 h-5" />}
          accentColor={s.failureRatePercent > 10 ? 'rose' : 'emerald'}
          alert={s.failureRatePercent > 10}
          trend={{
            value: s.failureRatePercent === 0 ? 'Optimal' : `${s.failureRatePercent}% errors`,
            isPositive: s.failureRatePercent <= 5,
          }}
          isLoading={isLoading && !stats}
        />
      </div>

      {/* Secondary Status Row: Pending + Queue + Circuit Breaker + Rate Limit */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pending & Processing */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium uppercase tracking-wider block">
              In-Flight Work
            </span>
            <div className="text-xl font-bold text-slate-900 font-mono mt-0.5">
              {s.pendingTransactions + s.processingTransactions}
            </div>
            <span className="text-[11px] text-slate-400">
              {s.pendingTransactions} pending • {s.processingTransactions} processing
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-100">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        {/* Redis Backlog */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium uppercase tracking-wider block">
              Redis Queue Backlog
            </span>
            <div className="text-xl font-bold text-slate-900 font-mono mt-0.5">
              {s.redisQueueBacklog} items
            </div>
            <span className="text-[11px] text-slate-400">transaction:queue depth</span>
          </div>
          <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
            <Layers className="w-4 h-4" />
          </div>
        </div>

        {/* Circuit Breaker Status Snippet */}
        <div
          onClick={() => onNavigateTab('circuit-breaker')}
          className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between cursor-pointer hover:border-blue-300 transition-colors group"
        >
          <div>
            <span className="text-xs text-slate-500 font-medium uppercase tracking-wider block">
              Circuit Breaker
            </span>
            <div className="text-sm font-bold text-slate-900 mt-0.5">
              {circuitBreaker?.state || 'CLOSED'}
            </div>
            <span className="text-[11px] text-blue-600 group-hover:underline flex items-center gap-0.5 mt-0.5">
              Manage protection <ArrowRight className="w-2.5 h-2.5" />
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 text-slate-600 border border-slate-200 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
            {circuitBreaker?.state === 'OPEN' ? <ShieldAlert className="w-4 h-4 text-rose-600" /> : <ShieldCheck className="w-4 h-4" />}
          </div>
        </div>

        {/* Rate Limiting Status Snippet */}
        <div
          onClick={() => onNavigateTab('rate-limit')}
          className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between cursor-pointer hover:border-blue-300 transition-colors group"
        >
          <div>
            <span className="text-xs text-slate-500 font-medium uppercase tracking-wider block">
              Rate Limit Ingress
            </span>
            <div className="text-sm font-bold text-slate-900 mt-0.5">
              {rateLimit?.limitPerSecond || 100} req/s
            </div>
            <span className="text-[11px] text-blue-600 group-hover:underline flex items-center gap-0.5 mt-0.5">
              Configure rate <ArrowRight className="w-2.5 h-2.5" />
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 text-slate-600 border border-slate-200 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
            <Gauge className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* CSV Scalability Quick Action Banner */}
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 rounded-2xl p-5 text-white shadow-sm border border-indigo-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-indigo-300 shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
              <span>CSV Scalability Suite & Ingress Visualizer</span>
              <span className="text-[10px] bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 px-2 py-0.5 rounded-full font-semibold uppercase">
                New
              </span>
            </h3>
            <p className="text-xs text-indigo-200/80 mt-0.5">
              Upload multi-transaction CSV files to stress-test SQLite write performance and observe live line graphs, status distributions, and latency scatter plots.
            </p>
          </div>
        </div>
        <button
          onClick={() => onNavigateTab('csv-batch')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0 self-start sm:self-auto cursor-pointer"
        >
          <span>Launch Scalability Suite</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Transaction Volume Over Time</h3>
          <p className="text-xs text-slate-500 mb-4">Completed, failed, and pending transactions in 5-minute buckets</p>
          <VolumeChart data={s.timeSeries} isLoading={isLoading && !stats} />
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Processing Time & Latency (s)</h3>
          <p className="text-xs text-slate-500 mb-4">Duration from client submission through worker completion</p>
          <LatencyChart data={s.timeSeries} isLoading={isLoading && !stats} />
        </div>
      </div>

      {/* Bottom Grid: Recent Transactions Table & System Infrastructure Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">Recent Activity Stream</h3>
            <button
              onClick={() => onNavigateTab('transactions')}
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 hover:underline"
            >
              View Full Ledger <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <TransactionTable
            transactions={transactions.slice(0, 8)}
            isLoading={isLoading}
            onRefresh={onRefresh}
            statusFilter={statusFilter}
            onStatusFilterChange={onStatusFilterChange}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
          />
        </div>

        <div>
          <h3 className="text-sm font-bold text-slate-900 tracking-tight mb-3">Health Status</h3>
          <HealthStatusCard health={health} isLoading={isLoading} onRefresh={onRefresh} />
        </div>
      </div>
    </div>
  );
};
