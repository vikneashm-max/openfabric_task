import React from 'react';
import type { Transaction } from '../api/types';
import { TransactionTable } from '../components/transactions/TransactionTable';
import { TransactionsVisualDiagram } from '../components/charts/TransactionsVisualDiagram';
import { Plus, RefreshCw } from 'lucide-react';

interface TransactionsPageProps {
  transactions: Transaction[];
  isLoading: boolean;
  onRefresh: () => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenSubmitModal: () => void;
}

export const TransactionsPage: React.FC<TransactionsPageProps> = ({
  transactions,
  isLoading,
  onRefresh,
  statusFilter,
  onStatusFilterChange,
  searchQuery,
  onSearchChange,
  onOpenSubmitModal,
}) => {
  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200/80 gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Transaction Ledger</h2>
          <p className="text-xs text-slate-500 mt-1">
            Real-time audit record of all transactions processed via SQLite and transactional outbox.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={onOpenSubmitModal}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Submit Transaction</span>
          </button>
        </div>
      </div>

      {/* Visual Diagram of Past Transactions */}
      <TransactionsVisualDiagram
        transactions={transactions}
        statusFilter={statusFilter}
        onStatusFilterChange={onStatusFilterChange}
        isLoading={isLoading}
      />

      {/* Full Transaction Table */}
      <TransactionTable
        transactions={transactions}
        isLoading={isLoading}
        onRefresh={onRefresh}
        statusFilter={statusFilter}
        onStatusFilterChange={onStatusFilterChange}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
      />
    </div>
  );
};
