import React, { useState } from 'react';
import type { Transaction } from '../../api/types';
import { StatusBadge } from '../common/StatusBadge';
import { TransactionDetailModal } from './TransactionDetailModal';
import { Search, Copy, Check, Eye, AlertCircle, RefreshCw } from 'lucide-react';


interface TransactionTableProps {
  transactions: Transaction[];
  isLoading: boolean;
  onRefresh: () => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const TransactionTable: React.FC<TransactionTableProps> = ({
  transactions,
  isLoading,
  onRefresh,
  statusFilter,
  onStatusFilterChange,
  searchQuery,
  onSearchChange,
}) => {
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyId = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const statusOptions = ['ALL', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Table Header & Controls */}
      <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by ID, description, currency..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
          />
        </div>

        {/* Filter Tabs & Refresh */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <div className="flex items-center p-1 bg-slate-100/80 rounded-lg border border-slate-200/60 text-xs">
            {statusOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => onStatusFilterChange(opt)}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  statusFilter === opt
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-1.5 text-slate-600 hover:text-blue-600 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors shadow-2xs"
            title="Refresh Transactions"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Table Body */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
              <th className="py-3 px-4">Transaction ID</th>
              <th className="py-3 px-4">Amount</th>
              <th className="py-3 px-4">Description</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-center">Attempts</th>
              <th className="py-3 px-4">Submitted At</th>
              <th className="py-3 px-4">Processing Time (s)</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && transactions.length === 0 ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <tr key={idx} className="animate-pulse">
                  <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-28"></div></td>
                  <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-16"></div></td>
                  <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-36"></div></td>
                  <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-20"></div></td>
                  <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-8 mx-auto"></div></td>
                  <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-24"></div></td>
                  <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-14"></div></td>
                  <td className="py-3 px-4 text-right"><div className="h-4 bg-slate-200 rounded w-8 ml-auto"></div></td>
                </tr>
              ))
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center">
                  <div className="flex flex-col items-center justify-center text-slate-400">
                    <AlertCircle className="w-8 h-8 stroke-1 text-slate-300 mb-2" />
                    <p className="text-sm font-medium text-slate-600">No transactions found</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {statusFilter !== 'ALL' || searchQuery
                        ? 'Try clearing the active filters or search query'
                        : 'Submit a new transaction or start load testing to view activity'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              transactions.map((tx) => {
                const latency = tx.completedAt
                  ? Math.max(0, new Date(tx.completedAt).getTime() - new Date(tx.submittedAt).getTime())
                  : null;

                return (
                  <tr
                    key={tx.id}
                    onClick={() => setSelectedTx(tx)}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                  >
                    {/* Transaction ID */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 font-mono text-slate-800 font-medium">
                        <span title={tx.id}>
                          {tx.id.substring(0, 8)}...{tx.id.substring(tx.id.length - 4)}
                        </span>
                        <button
                          onClick={(e) => copyId(tx.id, e)}
                          className="text-slate-400 hover:text-blue-600 p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100"
                          title="Copy Full UUID"
                        >
                          {copiedId === tx.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Amount */}
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                      {Number(tx.amount).toFixed(2)}{' '}
                      <span className="text-[10px] text-slate-500 font-normal">{tx.currency}</span>
                    </td>

                    {/* Description */}
                    <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={tx.description}>
                      {tx.description}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      <StatusBadge status={tx.status} size="sm" />
                    </td>

                    {/* Attempts */}
                    <td className="py-3 px-4 text-center font-mono">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded-md text-[11px] font-semibold ${
                          tx.attemptCount > 1
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'text-slate-600'
                        }`}
                      >
                        {tx.attemptCount}
                      </span>
                    </td>

                    {/* Submitted At */}
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                      {tx.submittedAt ? new Date(tx.submittedAt).toLocaleTimeString() : '—'}
                    </td>

                    {/* Processing Latency */}
                    <td className="py-3 px-4">
                      {latency !== null ? (
                        <span className="text-slate-700 font-mono text-[11px] font-medium bg-slate-100 px-1.5 py-0.5 rounded">
                          {(latency / 1000).toFixed(3)}s
                        </span>
                      ) : tx.status === 'PROCESSING' ? (
                        <span className="text-blue-600 font-medium italic text-[11px] animate-pulse">Running</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTx(tx);
                        }}
                        className="text-slate-400 hover:text-blue-600 p-1 rounded-md hover:bg-slate-100 transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer info */}
      <div className="p-3 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span>Showing {transactions.length} recent transactions</span>
        <span>Click any row for payload and lifecycle inspection</span>
      </div>

      {/* Detail Modal */}
      <TransactionDetailModal
        transaction={selectedTx}
        isOpen={selectedTx !== null}
        onClose={() => setSelectedTx(null)}
      />
    </div>
  );
};
