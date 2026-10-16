import React, { useState } from 'react';
import type { CreateTransactionRequest, Transaction } from '../../api/types';
import { apiClient } from '../../api/client';
import { Modal } from '../common/Modal';
import { RefreshCw, Send, CheckCircle2, AlertCircle } from 'lucide-react';

interface SubmitTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (tx: Transaction) => void;
}

export const SubmitTransactionModal: React.FC<SubmitTransactionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  const [id, setId] = useState(() => generateUUID());
  const [amount, setAmount] = useState('250.00');
  const [currency, setCurrency] = useState('USD');
  const [description, setDescription] = useState('Order checkout payment');
  const [timestamp, setTimestamp] = useState(() => new Date().toISOString());

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const resetForm = () => {
    setId(generateUUID());
    setAmount('250.00');
    setCurrency('USD');
    setDescription('Order checkout payment');
    setTimestamp(new Date().toISOString());
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    try {
      const payload: CreateTransactionRequest = {
        id: id.trim(),
        amount: parseFloat(amount),
        currency: currency.trim().toUpperCase(),
        description: description.trim(),
        timestamp: timestamp.trim(),
      };

      const result = await apiClient.submitTransaction(payload);
      setSuccessMsg(`Transaction submitted successfully (Status: ${result.status})`);
      onSuccess(result);
      setTimeout(() => {
        onClose();
        resetForm();
      }, 1200);
    } catch (err: any) {
      if (err.status === 409) {
        setErrorMsg(`Conflict (HTTP 409): ${err.message || 'Transaction ID already exists with different data'}`);
      } else if (err.status === 429) {
        setErrorMsg(`Rate Limited (HTTP 429): ${err.message || 'Rate limit exceeded. Please retry.'}`);
      } else {
        setErrorMsg(`Error (${err.status || 'Failed'}): ${err.message || 'Failed to submit transaction'}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Submit New Transaction"
      subtitle="Creates a transaction record and dispatches work via transactional outbox"
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-end gap-2.5 w-full">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-xs"
          >
            {isSubmitting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>{isSubmitting ? 'Submitting...' : 'Submit Transaction'}</span>
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Submission Rejected</p>
              <p className="mt-0.5">{errorMsg}</p>
            </div>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{successMsg}</span>
          </div>
        )}

        {/* Transaction ID */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-slate-700">Transaction UUID</label>
            <button
              type="button"
              onClick={() => setId(generateUUID())}
              className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Generate New
            </button>
          </div>
          <input
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            required
            className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            placeholder="550e8400-e29b-41d4-a716-446655440000"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Tip: Submit the same UUID with identical data to verify idempotency (returns 202 without duplicate queueing), or different data to verify 409 Conflict rejection.
          </p>
        </div>

        {/* Amount & Currency */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Amount</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              placeholder="100.00"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="USD">USD ($)</option>
              <option value="INR">INR (₹)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            maxLength={255}
            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            placeholder="Order description"
          />
        </div>

        {/* Timestamp */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-slate-700">ISO-8601 Timestamp</label>
            <button
              type="button"
              onClick={() => setTimestamp(new Date().toISOString())}
              className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
            >
              Now
            </button>
          </div>
          <input
            type="text"
            value={timestamp}
            onChange={(e) => setTimestamp(e.target.value)}
            required
            className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      </form>
    </Modal>
  );
};
