import { useState, useEffect, useCallback } from 'react';
import type {
  MonitoringStats,
  SystemHealth,
  Transaction,
  CircuitBreaker,
  RateLimit,
} from './api/types';
import { apiClient } from './api/client';
import { Sidebar, type NavTab } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DashboardPage } from './pages/DashboardPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { CircuitBreakerPage } from './pages/CircuitBreakerPage';
import { RateLimitPage } from './pages/RateLimitPage';
import { CsvBatchPage } from './pages/CsvBatchPage';
import { LoginPage } from './pages/LoginPage';
import { SubmitTransactionModal } from './components/transactions/SubmitTransactionModal';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export function App() {
  // Authentication State: strictly session-scoped so closing portal tab/window automatically logs off
  const [currentUser, setCurrentUser] = useState<string | null>(() => {
    localStorage.removeItem('openfabric_user');
    return sessionStorage.getItem('openfabric_user') || null;
  });

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');

  // Core Data States
  const [stats, setStats] = useState<MonitoringStats | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [circuitBreaker, setCircuitBreaker] = useState<CircuitBreaker | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimit | null>(null);

  // Status & Control States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState<boolean>(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleLogin = (user: string) => {
    sessionStorage.setItem('openfabric_user', user);
    localStorage.removeItem('openfabric_user');
    setCurrentUser(user);
    showToast(`Welcome back, ${user}!`);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('openfabric_user');
    localStorage.removeItem('openfabric_user');
    setCurrentUser(null);
    showToast('Signed out successfully.');
  };

  // Fetch all live data
  const fetchData = useCallback(async () => {
    try {
      const [statsRes, healthRes, txsRes, cbRes, rlRes] = await Promise.allSettled([
        apiClient.getMonitoringStats(),
        apiClient.getSystemHealth(),
        apiClient.getTransactions({ status: statusFilter, search: searchQuery, limit: 500 }),
        apiClient.getCircuitBreaker(),
        apiClient.getRateLimit(),
      ]);

      let anySuccess = false;

      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value);
        anySuccess = true;
      }
      if (healthRes.status === 'fulfilled') {
        setHealth(healthRes.value);
        anySuccess = true;
      }
      if (txsRes.status === 'fulfilled') {
        setTransactions(txsRes.value);
        anySuccess = true;
      }
      if (cbRes.status === 'fulfilled') {
        setCircuitBreaker(cbRes.value);
        anySuccess = true;
      }
      if (rlRes.status === 'fulfilled') {
        setRateLimit(rlRes.value);
        anySuccess = true;
      }

      setIsConnected(anySuccess);
    } catch {
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, searchQuery]);

  // Initial load
  useEffect(() => {
    if (!currentUser) return;
    void (async () => {
      await fetchData();
    })();
  }, [currentUser, fetchData]);

  // Fixed 10s Auto-Refresh Interval to update recent values automatically
  useEffect(() => {
    if (!currentUser) return;

    const timer = setInterval(() => {
      void fetchData();
    }, 10000); // 10 seconds

    return () => clearInterval(timer);
  }, [currentUser, fetchData]);

  const handleManualRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const start = Date.now();
    try {
      await fetchData();
      showToast('Recent values updated successfully', 'success');
    } catch {
      showToast('Failed to refresh data', 'error');
    } finally {
      const remaining = Math.max(0, 500 - (Date.now() - start));
      setTimeout(() => {
        setIsRefreshing(false);
      }, remaining);
    }
  }, [isRefreshing, fetchData]);

  const handleTransactionSubmitted = (tx: Transaction) => {
    // Immediately add the new transaction to local state so visual diagrams update synchronously
    setTransactions((prev) => [tx, ...prev.filter((t) => t.id !== tx.id)]);
    setStats((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        totalTransactions: prev.totalTransactions + 1,
        pendingTransactions: prev.pendingTransactions + 1,
      };
    });
    showToast(`Transaction ${tx.id.substring(0, 8)}... created successfully`);
    // Synchronize with backend immediately and after worker claims & completes record
    void fetchData();
    setTimeout(() => void fetchData(), 500);
    setTimeout(() => void fetchData(), 1500);
  };

  const toastElement = toast ? (
    <div
      className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border text-xs font-medium animate-bounce-subtle ${
        toast.type === 'success'
          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 ring-1 ring-emerald-500/20'
          : 'bg-rose-50 text-rose-800 border-rose-200 ring-1 ring-rose-500/20'
      }`}
    >
      {toast.type === 'success' ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
      ) : (
        <AlertCircle className="w-4 h-4 text-rose-600" />
      )}
      <span>{toast.message}</span>
    </div>
  ) : null;

  if (!currentUser) {
    return (
      <>
        {toastElement}
        <LoginPage onLogin={handleLogin} />
      </>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-800">
      {toastElement}

      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        queueDepth={stats?.redisQueueBacklog || 0}
        circuitBreakerState={circuitBreaker?.state || 'CLOSED'}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <Header
          onOpenSubmitModal={() => setIsSubmitModalOpen(true)}
          onRefresh={handleManualRefresh}
          isRefreshing={isRefreshing}
          isConnected={isConnected}
          alertCount={stats?.activeAlertsCount || 0}
          currentUser={currentUser}
          onLogout={handleLogout}
        />

        {/* Scrollable Page Body */}
        <main className="flex-1 overflow-y-auto p-6 max-w-7xl w-full mx-auto">
          {!isConnected && !isLoading && (
            <div className="mb-6 p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-900 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                <div>
                  <p className="font-bold">Backend Service Unreachable</p>
                  <p className="mt-0.5 text-rose-700">
                    Unable to connect to <code>http://localhost:8081</code>. Please ensure the Spring Boot application is running.
                  </p>
                </div>
              </div>
              <button
                onClick={handleManualRefresh}
                className="px-3 py-1.5 bg-white border border-rose-300 text-rose-800 font-semibold rounded-lg hover:bg-rose-100 transition-colors"
              >
                Retry Connection
              </button>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <DashboardPage
              stats={stats}
              health={health}
              transactions={transactions}
              circuitBreaker={circuitBreaker}
              rateLimit={rateLimit}
              isLoading={isLoading}
              onRefresh={handleManualRefresh}
              onNavigateTab={setActiveTab}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          )}

          {activeTab === 'transactions' && (
            <TransactionsPage
              transactions={transactions}
              isLoading={isLoading}
              onRefresh={handleManualRefresh}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onOpenSubmitModal={() => setIsSubmitModalOpen(true)}
            />
          )}

          {activeTab === 'circuit-breaker' && (
            <CircuitBreakerPage
              circuitBreaker={circuitBreaker}
              transactions={transactions}
              isLoading={isLoading}
              onRefresh={handleManualRefresh}
            />
          )}

          {activeTab === 'rate-limit' && (
            <RateLimitPage
              rateLimit={rateLimit}
              transactions={transactions}
              isLoading={isLoading}
              onRefresh={handleManualRefresh}
            />
          )}

          {(activeTab === 'csv-batch' || activeTab === 'load-test') && (
            <CsvBatchPage onDataProcessed={handleManualRefresh} transactions={transactions} />
          )}
        </main>
      </div>

      {/* Submit Transaction Modal */}
      <SubmitTransactionModal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        onSuccess={handleTransactionSubmitted}
      />
    </div>
  );
}

export default App;
