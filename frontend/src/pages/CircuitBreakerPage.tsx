import React from 'react';
import type { CircuitBreaker, Transaction } from '../api/types';
import { CircuitBreakerPanel } from '../components/circuitBreaker/CircuitBreakerPanel';
import { CircuitBreakerVisualDiagram } from '../components/charts/CircuitBreakerVisualDiagram';
import { Info, CheckCircle2, AlertTriangle } from 'lucide-react';

interface CircuitBreakerPageProps {
  circuitBreaker: CircuitBreaker | null;
  transactions?: Transaction[];
  isLoading: boolean;
  onRefresh: () => void;
}

export const CircuitBreakerPage: React.FC<CircuitBreakerPageProps> = ({
  circuitBreaker,
  transactions = [],
  isLoading,
  onRefresh,
}) => {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="pb-4 border-b border-slate-200/80">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Circuit Breaker System</h2>
        <p className="text-xs text-slate-500 mt-1">
          Downstream fault tolerance mechanism for the remote Posting Service (<code>http://localhost:8080</code>).
        </p>
      </div>

      {/* Main Interactive Panel */}
      <CircuitBreakerPanel
        circuitBreaker={circuitBreaker}
        isLoading={isLoading}
        onRefresh={onRefresh}
      />

      {/* Visual Diagram of Past Downstream Transactions */}
      <CircuitBreakerVisualDiagram
        circuitBreaker={circuitBreaker}
        transactions={transactions}
        isLoading={isLoading}
      />

      {/* Technical Architecture & Operational Guide */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600" />
            Circuit Breaker Design & Guarantees
          </h4>
          <ul className="space-y-2.5 text-xs text-slate-600">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>Thread & Queue Safety:</strong> When OPEN, workers do not block threads making failing HTTP calls; outbox records are postponed with exponential backoff.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>Canary Probing:</strong> Transitions to HALF-OPEN after 15s to send low-volume probe traffic before reopening full downstream capacity.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>Zero Transaction Loss:</strong> Transactions remain safe in the SQLite transactional outbox and are never discarded during circuit trips.
              </span>
            </li>
          </ul>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            How to Test Downstream Failure Scenarios
          </h4>
          <div className="space-y-2 text-xs text-slate-600">
            <p>
              1. <strong>Manual Trip:</strong> Click "Trip to OPEN" above. Notice worker logs will report <code>Circuit breaker is OPEN; postponing transaction</code>.
            </p>
            <p>
              2. <strong>Cooldown:</strong> Wait 15 seconds. Observe automatic transition to <code>HALF_OPEN</code>.
            </p>
            <p>
              3. <strong>Recovery:</strong> Submit a transaction or run a load test. Two successful downstream posts will return the circuit breaker to <code>CLOSED</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
