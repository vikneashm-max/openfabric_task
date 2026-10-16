import React from 'react';
import type { Transaction } from '../api/types';
import { CsvBatchPanel } from '../components/csvUpload/CsvBatchPanel';
import { FileSpreadsheet, Layers, ShieldCheck, Gauge } from 'lucide-react';

interface CsvBatchPageProps {
  onDataProcessed?: () => void;
  transactions?: Transaction[];
}

export const CsvBatchPage: React.FC<CsvBatchPageProps> = ({ onDataProcessed, transactions = [] }) => {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="pb-4 border-b border-slate-200/80">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              CSV Batch Scalability & Speed Visualizer
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Benchmark transaction ingress throughput, measure SLA compliance, and visually track submission rates with line graphs, bar charts, and scatter plots.
            </p>
          </div>
        </div>
      </div>

      {/* Main CSV Benchmark Panel */}
      <CsvBatchPanel onDataProcessed={onDataProcessed} transactions={transactions} />

      {/* Benchmarking & Architectural Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-slate-800 text-xs font-bold">
            <Layers className="w-4 h-4 text-indigo-600" />
            SQLite WAL Concurrency
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            SQLite operates in Write-Ahead Logging (<code>WAL</code>) mode with a 10-second busy timeout. Read transactions do not block writers, allowing high ingestion concurrency across parallel worker pools.
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-slate-800 text-xs font-bold">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Atomic Outbox Claiming
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Ingested transactions are committed to the <code>transaction_outbox</code> table in the same database transaction. Background workers claim records atomically (<code>WHERE status = 'PENDING'</code>) to guarantee zero duplicate remote postings.
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-slate-800 text-xs font-bold">
            <Gauge className="w-4 h-4 text-amber-600" />
            Visual SLA & Scatter Distribution
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            The scatter plot renders every individual transaction latency. The 0.10s red dashed line isolates tail spikes, proving that median and p95 responses remain well under the sub-0.10s target.
          </p>
        </div>
      </div>
    </div>
  );
};
