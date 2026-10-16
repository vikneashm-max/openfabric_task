export type TransactionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface Transaction {
  id: string;
  amount: number;
  currency: string;
  description: string;
  transactionTimestamp: string;
  status: TransactionStatus;
  submittedAt: string;
  completedAt?: string | null;
  lastError?: string | null;
  attemptCount: number;
}

export interface CreateTransactionRequest {
  id: string;
  amount: number;
  currency: string;
  description: string;
  timestamp: string;
}

export interface TimeSeriesPoint {
  timestamp: string;
  completed: number;
  failed: number;
  pending: number;
  avgLatencyMs: number;
}

export interface MonitoringStats {
  totalTransactions: number;
  pendingTransactions: number;
  processingTransactions: number;
  completedTransactions: number;
  failedTransactions: number;
  redisQueueBacklog: number;
  throughputPerMinute: number;
  averageLatencyMs: number;
  successRatePercent: number;
  failureRatePercent: number;
  activeAlertsCount: number;
  alerts: string[];
  timeSeries: TimeSeriesPoint[];
}

export interface ComponentHealth {
  name: string;
  status: 'UP' | 'DOWN' | 'DEGRADED';
  latencyMs?: number;
  message?: string;
  details?: Record<string, any>;
}

export interface SystemHealth {
  overallStatus: 'UP' | 'DOWN' | 'DEGRADED';
  timestamp: string;
  uptimeSeconds: number;
  components: ComponentHealth[];
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreaker {
  state: CircuitBreakerState;
  failureCount: number;
  failureThreshold: number;
  successCount: number;
  halfOpenSuccessThreshold: number;
  resetTimeoutSeconds: number;
  lastStateChange: string;
  lastFailureReason?: string | null;
  isAvailable: boolean;
}

export interface RateLimit {
  enabled: boolean;
  limitPerSecond: number;
  currentRps: number;
  totalAccepted: number;
  totalRejected: number;
  isThrottled: boolean;
}

export interface LoadTestConfig {
  totalRequests: number;
  concurrency: number;
  amountMin: number;
  amountMax: number;
  currency: string;
  descriptionPrefix: string;
}

export interface LoadTestMetrics {
  totalSent: number;
  succeeded: number;
  conflicts: number;
  rateLimited: number;
  errors: number;
  rps: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p90LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  durationMs: number;
  status: 'IDLE' | 'RUNNING' | 'COMPLETED' | 'STOPPED';
}
