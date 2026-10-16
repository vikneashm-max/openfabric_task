import React, { useState } from 'react';
import type { Transaction } from '../../api/types';
import { Modal } from '../common/Modal';
import { StatusBadge } from '../common/StatusBadge';
import { Check, Copy, AlertCircle, Clock, Calendar } from 'lucide-react';


interface TransactionDetailModalProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  transaction,
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!transaction) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const latencyMs = transaction.completedAt
    ? Math.max(0, new Date(transaction.completedAt).getTime() - new Date(transaction.submittedAt).getTime())
    : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Transaction Details"
      subtitle={`ID: ${transaction.id}`}
      maxWidth="lg"
      footer={
        <button
          onClick={onClose}
          className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Close
        </button>
      }
    >
      <div className="space-y-5">
        {/* Top Status & ID Bar */}
        <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Status:</span>
            <StatusBadge status={transaction.status} size="md" />
          </div>
          <button
            onClick={() => copyToClipboard(transaction.id)}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-blue-600 font-medium px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:border-blue-200 transition-colors shadow-2xs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied UUID' : 'Copy UUID'}
          </button>
        </div>

        {/* Amount & Description */}
        <div className="grid grid-cols-2 gap-3.5">
          <div className="p-3 bg-white rounded-xl border border-slate-200/80">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
              Amount
            </span>
            <span className="text-xl font-bold text-slate-900 font-mono">
              {Number(transaction.amount).toFixed(2)} {transaction.currency}
            </span>
          </div>

          <div className="p-3 bg-white rounded-xl border border-slate-200/80">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
              Attempt Count
            </span>
            <span className="text-xl font-bold text-slate-900 font-mono">
              {transaction.attemptCount} / 5
            </span>
          </div>
        </div>

        {/* Description */}
        <div className="p-3.5 bg-white rounded-xl border border-slate-200/80">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
            Description
          </span>
          <p className="text-sm font-medium text-slate-800">{transaction.description}</p>
        </div>

        {/* Timestamps & Latency */}
        <div className="p-3.5 bg-white rounded-xl border border-slate-200/80 space-y-2.5">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
            Timeline & Lifecycle
          </span>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Payload Timestamp:
              </span>
              <span className="font-mono text-slate-800">{transaction.transactionTimestamp}</span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Submitted At:
              </span>
              <span className="font-mono text-slate-800">{transaction.submittedAt}</span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Completed At:
              </span>
              <span className="font-mono text-slate-800">
                {transaction.completedAt || <span className="text-slate-400 italic">In progress / pending</span>}
              </span>
            </div>

            {latencyMs !== null && (
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500 font-medium">Processing Duration:</span>
                <span className="font-mono font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                  {(latencyMs / 1000).toFixed(3)} s
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Last Error (if present) */}
        {transaction.lastError && (
          <div className="p-3.5 bg-rose-50/50 rounded-xl border border-rose-200">
            <div className="flex items-center gap-1.5 text-rose-800 font-medium text-xs mb-1">
              <AlertCircle className="w-4 h-4 text-rose-600" />
              <span>Last Recorded Failure:</span>
            </div>
            <pre className="text-xs text-rose-700 whitespace-pre-wrap font-mono p-2 bg-white rounded-md border border-rose-100">
              {transaction.lastError}
            </pre>
          </div>
        )}
      </div>
    </Modal>
  );
};
