import React from 'react';
import type { RateLimit, Transaction } from '../api/types';
import { RateLimitPanel } from '../components/rateLimit/RateLimitPanel';
import { RateLimitVisualDiagram } from '../components/charts/RateLimitVisualDiagram';
import { Info, Code } from 'lucide-react';

interface RateLimitPageProps {
  rateLimit: RateLimit | null;
  transactions?: Transaction[];
  isLoading: boolean;
  onRefresh: () => void;
}

export const RateLimitPage: React.FC<RateLimitPageProps> = ({
  rateLimit,
  transactions = [],
  isLoading,
  onRefresh,
}) => {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="pb-4 border-b border-slate-200/80">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">API Ingress Rate Limiting</h2>
        <p className="text-xs text-slate-500 mt-1">
          High-performance token-bucket rate limiter safeguarding <code>POST /api/transactions</code> against traffic spikes.
        </p>
      </div>

      {/* Main Panel */}
      <RateLimitPanel rateLimit={rateLimit} isLoading={isLoading} onRefresh={onRefresh} />

      {/* Visual Diagram of Ingress Load vs Rate Limit */}
      <RateLimitVisualDiagram
        rateLimit={rateLimit}
        transactions={transactions}
        isLoading={isLoading}
      />

      {/* Technical Architecture & 429 Format Explanation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600" />
            Token-Bucket Algorithm Mechanics
          </h4>
          <ul className="space-y-2 text-xs text-slate-600">
            <li>
              <strong>Smooth Token Refill:</strong> Tokens refill continuously based on nanosecond-resolution elapsed time (rate: <code>N tokens/second</code>).
            </li>
            <li>
              <strong>Burst Allowance:</strong> Accommodates traffic bursts up to <strong>1.5x</strong> of configured limit without rejecting legitimate spikes.
            </li>
            <li>
              <strong>Low Overhead:</strong> Enforced at servlet filter tier with atomic primitives, ensuring sub-millisecond overhead per request.
            </li>
          </ul>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Code className="w-4 h-4 text-slate-700" />
            HTTP 429 Response Specification
          </h4>
          <p className="text-xs text-slate-500">
            When rate limits are exceeded, the API responds with HTTP 429 and standard headers:
          </p>
          <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl text-[11px] font-mono overflow-x-auto">
{`HTTP/1.1 429 Too Many Requests
Retry-After: 1
X-RateLimit-Limit: 100.0
Content-Type: application/json

{
  "status": 429,
  "error": "Rate limit exceeded. Maximum 100 req/sec allowed.",
  "limitPerSecond": 100.0,
  "rejectedCount": 14
}`}
          </pre>
        </div>
      </div>
    </div>
  );
};
