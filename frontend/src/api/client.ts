import type {
  CircuitBreaker,
  CreateTransactionRequest,
  MonitoringStats,
  RateLimit,
  SystemHealth,
  Transaction
} from './types';


const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

class ApiError extends Error {
  status: number;
  data: any;

  constructor(status: number, message: string, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = API_BASE_URL ? `${API_BASE_URL}${endpoint}` : endpoint;

  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);

    let data: any = null;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const errorMessage =
        (typeof data === 'object' && data && (data.error || data.message)) ||
        `Request failed with status ${response.status}`;
      throw new ApiError(response.status, errorMessage, data);
    }

    return data as T;
  } catch (error: any) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(0, error.message || 'Network error occurred. Ensure backend is running at http://localhost:8081');
  }
}

export const apiClient = {
  // Monitoring & Health
  async getMonitoringStats(): Promise<MonitoringStats> {
    return request<MonitoringStats>('/api/monitoring/stats');
  },

  async getSystemHealth(): Promise<SystemHealth> {
    return request<SystemHealth>('/api/monitoring/health');
  },

  // Transactions
  async getTransactions(params?: {
    status?: string;
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<Transaction[]> {
    const query = new URLSearchParams();
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.page !== undefined) query.set('page', params.page.toString());
    if (params?.limit !== undefined) query.set('limit', params.limit.toString());
    if (params?.search) query.set('search', params.search);

    const qs = query.toString();
    const endpoint = `/api/transactions${qs ? `?${qs}` : ''}`;
    return request<Transaction[]>(endpoint);
  },

  async getTransactionById(id: string): Promise<Transaction> {
    return request<Transaction>(`/api/transactions/${id}`);
  },

  async submitTransaction(
    payload: CreateTransactionRequest,
    bypassRateLimit: boolean = false
  ): Promise<Transaction> {
    const headers: Record<string, string> = {};
    if (bypassRateLimit) {
      headers['X-Bypass-Rate-Limit'] = 'true';
    }

    return request<Transaction>('/api/transactions', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  },

  // Circuit Breaker
  async getCircuitBreaker(): Promise<CircuitBreaker> {
    return request<CircuitBreaker>('/api/circuit-breaker');
  },

  async resetCircuitBreaker(): Promise<CircuitBreaker> {
    return request<CircuitBreaker>('/api/circuit-breaker/reset', {
      method: 'POST',
    });
  },

  async tripCircuitBreaker(): Promise<CircuitBreaker> {
    return request<CircuitBreaker>('/api/circuit-breaker/trip', {
      method: 'POST',
    });
  },

  // Rate Limiting
  async getRateLimit(): Promise<RateLimit> {
    return request<RateLimit>('/api/rate-limit');
  },

  async updateRateLimit(limitPerSecond: number): Promise<RateLimit> {
    return request<RateLimit>('/api/rate-limit/config', {
      method: 'POST',
      body: JSON.stringify({ limitPerSecond }),
    });
  },
};
