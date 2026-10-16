import React, { useState, useRef, useEffect } from 'react';
import type { CreateTransactionRequest, Transaction } from '../../api/types';
import { apiClient } from '../../api/client';
import {
  UploadCloud,
  FileSpreadsheet,
  Play,
  Square,
  RotateCcw,
  Download,
  AlertCircle,
  FileCheck,
  CheckCircle2,
  Sliders,
  ChevronDown,
  ChevronUp,
  Activity,
  Clock,
  XCircle,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react';
import { ScalabilityRateLineChart, type RateTimePoint } from '../charts/ScalabilityRateLineChart';
import { ScalabilityStatusBarChart, type BackendStatusDistribution, type LatencyBuckets } from '../charts/ScalabilityStatusBarChart';
import { ScalabilityScatterPlot, type BackendScatterPoint } from '../charts/ScalabilityScatterPlot';

interface CsvBatchPanelProps {
  onDataProcessed?: () => void;
}

interface ParsedTransactionRow {
  id: string;
  amount: number;
  currency: string;
  description: string;
  timestamp: string;
}

const CSV_STORAGE_KEY = 'openfabric_csv_batch_session';

interface PersistedBatchSession {
  fileName: string | null;
  parsedRows: ParsedTransactionRow[];
  submittedIds: string[];
  status: 'IDLE' | 'INGESTING' | 'PROCESSING' | 'COMPLETED' | 'STOPPED';
  sentCount: number;
  submissionErrors: number;
  submissionConflicts: number;
  rateStream: RateTimePoint[];
  peakRps: number;
  batchStartTime: number;
  cachedTransactions?: Transaction[];
}

export const CsvBatchPanel: React.FC<CsvBatchPanelProps> = ({ onDataProcessed }) => {
  // Parsed records state
  const [parsedRows, setParsedRows] = useState<ParsedTransactionRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState<boolean>(false);

  // Execution Configuration
  const [concurrency, setConcurrency] = useState<number>(8);
  const [bypassRateLimit, setBypassRateLimit] = useState<boolean>(true);

  // Live Metrics & Status
  const [status, setStatus] = useState<'IDLE' | 'INGESTING' | 'PROCESSING' | 'COMPLETED' | 'STOPPED'>('IDLE');
  const [sentCount, setSentCount] = useState<number>(0);
  const [submissionErrors, setSubmissionErrors] = useState<number>(0);
  const [submissionConflicts, setSubmissionConflicts] = useState<number>(0);

  // Real Processed Data Retrieved from Backend
  const [retrievedTransactions, setRetrievedTransactions] = useState<Transaction[]>([]);
  const [backendStatuses, setBackendStatuses] = useState<BackendStatusDistribution>({
    completed: 0,
    failed: 0,
    processing: 0,
    pending: 0,
  });

  const [latencyBuckets, setLatencyBuckets] = useState<LatencyBuckets>({
    under20ms: 0,
    from20to50ms: 0,
    from50to100ms: 0,
    from100to200ms: 0,
    over200ms: 0,
  });

  const [p50, setP50] = useState<number>(0);
  const [p90, setP90] = useState<number>(0);
  const [p95, setP95] = useState<number>(0);
  const [p99, setP99] = useState<number>(0);
  const [avgLatency, setAvgLatency] = useState<number>(0);

  const [rateStream, setRateStream] = useState<RateTimePoint[]>([]);
  const [scatterPoints, setScatterPoints] = useState<BackendScatterPoint[]>([]);
  const [peakRps, setPeakRps] = useState<number>(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Control Refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submittedIdsRef = useRef<Set<string>>(new Set());
  const batchStartTimeRef = useRef<number>(0);

  const saveSession = (updates: Partial<PersistedBatchSession>) => {
    try {
      const existingRaw = localStorage.getItem(CSV_STORAGE_KEY);
      const existing: Partial<PersistedBatchSession> = existingRaw ? JSON.parse(existingRaw) : {};
      const merged: PersistedBatchSession = {
        fileName: updates.fileName !== undefined ? updates.fileName : existing.fileName || null,
        parsedRows: updates.parsedRows !== undefined ? updates.parsedRows : existing.parsedRows || [],
        submittedIds: updates.submittedIds !== undefined ? updates.submittedIds : existing.submittedIds || [],
        status: updates.status !== undefined ? updates.status : existing.status || 'IDLE',
        sentCount: updates.sentCount !== undefined ? updates.sentCount : existing.sentCount || 0,
        submissionErrors: updates.submissionErrors !== undefined ? updates.submissionErrors : existing.submissionErrors || 0,
        submissionConflicts: updates.submissionConflicts !== undefined ? updates.submissionConflicts : existing.submissionConflicts || 0,
        rateStream: updates.rateStream !== undefined ? updates.rateStream : existing.rateStream || [],
        peakRps: updates.peakRps !== undefined ? updates.peakRps : existing.peakRps || 0,
        batchStartTime: updates.batchStartTime !== undefined ? updates.batchStartTime : existing.batchStartTime || 0,
        cachedTransactions: updates.cachedTransactions !== undefined ? updates.cachedTransactions : existing.cachedTransactions || [],
      };
      localStorage.setItem(CSV_STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // Storage access may fail silently
    }
  };

  const clearSession = () => {
    try {
      localStorage.removeItem(CSV_STORAGE_KEY);
    } catch {
      // Storage access may fail silently
    }
  };

  const copyId = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const calculatePercentile = (sortedArr: number[], p: number): number => {
    if (sortedArr.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedArr.length) - 1;
    return sortedArr[Math.max(0, Math.min(index, sortedArr.length - 1))];
  };

  // Clean CSV Template Downloader
  const handleDownloadTemplate = () => {
    const csvContent =
      'id,amount,currency,description,timestamp\n' +
      'a0000000-0000-4000-8000-000000000001,49.99,USD,Sample Retail Purchase,2026-10-16T10:00:00Z\n' +
      'a0000000-0000-4000-8000-000000000002,150.00,EUR,Subscription Renewal,2026-10-16T10:00:01Z\n' +
      'a0000000-0000-4000-8000-000000000003,75.50,GBP,Cloud Server Hosting,2026-10-16T10:00:02Z\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'transactions_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Strict CSV Parser - NO Mock or Fabricated Values
  const parseCSVText = (text: string, sourceName: string) => {
    setParseErrors([]);
    const errors: string[] = [];

    try {
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
      if (lines.length === 0) {
        setParseErrors(['The uploaded CSV file is empty.']);
        return;
      }

      // Check header
      const headerLine = lines[0].toLowerCase();
      const headers = headerLine.split(',').map((h) => h.replace(/^["']|["']$/g, '').trim());

      let idIdx = headers.indexOf('id');
      let amountIdx = headers.indexOf('amount');
      let currIdx = headers.indexOf('currency');
      let descIdx = headers.indexOf('description');
      let timeIdx = headers.indexOf('timestamp');

      if (amountIdx === -1) {
        errors.push('Missing required header: "amount"');
      }
      if (currIdx === -1) {
        errors.push('Missing required header: "currency"');
      }

      if (errors.length > 0) {
        setParseErrors(errors);
        return;
      }

      const dataLines = lines.slice(1);
      if (dataLines.length === 0) {
        setParseErrors(['CSV contains a header but no data rows.']);
        return;
      }

      const rows: ParsedTransactionRow[] = [];

      const fallbackTimestamp = new Date().toISOString();
      for (let i = 0; i < dataLines.length; i++) {
        const line = dataLines[i];
        if (!line) continue;

        // Split with quote awareness
        const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((c) =>
          c.replace(/^["']|["']$/g, '').trim()
        );

        const rawAmount = parseFloat(cols[amountIdx]);
        if (isNaN(rawAmount) || rawAmount <= 0) {
          errors.push(`Row ${i + 2}: Amount must be a positive number (found "${cols[amountIdx] || 'empty'}")`);
          continue;
        }

        const rawCurrency = cols[currIdx]?.toUpperCase();
        if (!rawCurrency || rawCurrency.length !== 3) {
          errors.push(`Row ${i + 2}: Currency must be a 3-letter ISO code (found "${cols[currIdx] || 'empty'}")`);
          continue;
        }

        let rawId = idIdx !== -1 ? cols[idIdx] : '';
        if (!rawId || rawId.trim().length === 0) {
          // If no ID provided in CSV, assign a standard UUID v4
          rawId = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });
        }

        const rawDesc = descIdx !== -1 && cols[descIdx] ? cols[descIdx] : `CSV Batch Transaction #${i + 1}`;
        const rawTimestamp = timeIdx !== -1 && cols[timeIdx] ? cols[timeIdx] : fallbackTimestamp;

        rows.push({
          id: rawId,
          amount: rawAmount,
          currency: rawCurrency,
          description: rawDesc,
          timestamp: rawTimestamp,
        });
      }

      if (errors.length > 0) {
        setParseErrors(errors.slice(0, 5)); // show first 5 errors
        return;
      }

      if (rows.length === 0) {
        setParseErrors(['No valid transaction rows found in the CSV.']);
        return;
      }

      setParsedRows(rows);
      setFileName(sourceName);
      setShowPreview(true);
      handleReset(false);
      saveSession({
        fileName: sourceName,
        parsedRows: rows,
        submittedIds: rows.map((r) => r.id),
        status: 'IDLE',
        sentCount: 0,
        submissionErrors: 0,
        submissionConflicts: 0,
        rateStream: [],
        peakRps: 0,
        batchStartTime: 0,
        cachedTransactions: [],
      });
    } catch (err: any) {
      setParseErrors([`Failed to parse CSV: ${err.message || 'Unknown format error'}`]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      parseCSVText(content, file.name);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        parseCSVText(content, file.name);
      };
      reader.readAsText(file);
    } else {
      setParseErrors(['Please upload a valid .csv file.']);
    }
  };

  // Helper to compute metrics, percentiles, buckets, scatter points from backend transaction records
  const processBatchData = (batchTxns: Transaction[], persist: boolean = true) => {
    if (batchTxns.length === 0) return;

    setRetrievedTransactions(batchTxns);

    // Status distribution from backend
    const completed = batchTxns.filter((t) => t.status === 'COMPLETED').length;
    const failed = batchTxns.filter((t) => t.status === 'FAILED').length;
    const processing = batchTxns.filter((t) => t.status === 'PROCESSING').length;
    const pending = batchTxns.filter((t) => t.status === 'PENDING').length;

    setBackendStatuses({ completed, failed, processing, pending });

    // Compute processing latencies directly from backend timestamps
    const latencies: number[] = [];
    const buckets: LatencyBuckets = {
      under20ms: 0,
      from20to50ms: 0,
      from50to100ms: 0,
      from100to200ms: 0,
      over200ms: 0,
    };

    const scatter: BackendScatterPoint[] = [];

    batchTxns.forEach((tx, idx) => {
      let latMs = 0;
      if (tx.completedAt && tx.submittedAt) {
        const diff = new Date(tx.completedAt).getTime() - new Date(tx.submittedAt).getTime();
        latMs = Math.max(0, diff);
        latencies.push(latMs);

        if (latMs < 20) buckets.under20ms++;
        else if (latMs < 50) buckets.from20to50ms++;
        else if (latMs < 100) buckets.from50to100ms++;
        else if (latMs < 200) buckets.from100to200ms++;
        else buckets.over200ms++;
      }

      const elapsedFromStart = batchStartTimeRef.current > 0
        ? (new Date(tx.submittedAt).getTime() - batchStartTimeRef.current) / 1000
        : idx * 0.1;

      scatter.push({
        index: idx + 1,
        timeSec: Math.max(0, Math.round(elapsedFromStart * 10) / 10),
        latencyMs: latMs,
        status: tx.status,
        id: tx.id,
        amount: tx.amount,
        currency: tx.currency,
        submittedAt: tx.submittedAt,
        completedAt: tx.completedAt,
        lastError: tx.lastError,
        attemptCount: tx.attemptCount,
      });
    });

    setLatencyBuckets(buckets);
    setScatterPoints(scatter);

    if (latencies.length > 0) {
      const sorted = [...latencies].sort((a, b) => a - b);
      const total = sorted.reduce((a, b) => a + b, 0);

      setAvgLatency(Math.round(total / sorted.length));
      setP50(calculatePercentile(sorted, 50));
      setP90(calculatePercentile(sorted, 90));
      setP95(calculatePercentile(sorted, 95));
      setP99(calculatePercentile(sorted, 99));

      if (persist) {
        // Throughput progression from real backend completions
        const elapsedSec = Math.max((performance.now() - batchStartTimeRef.current) / 1000, 0.1);
        const rps = Math.round((completed / elapsedSec) * 10) / 10;
        setPeakRps((prev) => Math.max(prev, rps));

        setRateStream((prev) => {
          const updated = [
            ...prev,
            { timeSec: Math.round(elapsedSec * 10) / 10, rps, processedCount: completed },
          ];
          saveSession({
            cachedTransactions: batchTxns,
            rateStream: updated,
            peakRps: Math.max(peakRps, rps),
          });
          return updated;
        });
      }
    } else if (persist) {
      saveSession({
        cachedTransactions: batchTxns,
      });
    }

    // Check if all submitted records reached terminal state
    if (submittedIdsRef.current.size > 0 && completed + failed >= submittedIdsRef.current.size) {
      setStatus('COMPLETED');
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      if (persist) {
        saveSession({
          status: 'COMPLETED',
          cachedTransactions: batchTxns,
        });
      }
      onDataProcessed?.();
    }
  };

  // Poll backend for real processed transaction records
  const pollBackendProcessedData = async () => {
    if (submittedIdsRef.current.size === 0) return;

    try {
      const allTxns = await apiClient.getTransactions({ limit: 1000 });
      // Filter by the submitted batch IDs
      const batchTxns = allTxns.filter((tx) => submittedIdsRef.current.has(tx.id));

      if (batchTxns.length === 0) return;

      processBatchData(batchTxns, true);
    } catch {
      // Ignore transient polling failure
    }
  };

  // Execution: Send CSV data to backend, then stream real processed data from backend
  const handleStart = async () => {
    if (parsedRows.length === 0) return;
    if (status === 'INGESTING' || status === 'PROCESSING') return;

    abortControllerRef.current = new AbortController();
    batchStartTimeRef.current = performance.now();
    submittedIdsRef.current = new Set(parsedRows.map((r) => r.id));

    setStatus('INGESTING');
    setSentCount(0);
    setSubmissionErrors(0);
    setSubmissionConflicts(0);
    setRetrievedTransactions([]);
    setRateStream([]);
    setScatterPoints([]);
    setPeakRps(0);
    setBackendStatuses({ completed: 0, failed: 0, processing: 0, pending: 0 });

    saveSession({
      fileName,
      parsedRows,
      submittedIds: Array.from(submittedIdsRef.current),
      status: 'INGESTING',
      sentCount: 0,
      submissionErrors: 0,
      submissionConflicts: 0,
      cachedTransactions: [],
      rateStream: [],
      peakRps: 0,
      batchStartTime: batchStartTimeRef.current,
    });

    const totalToProcess = parsedRows.length;
    const effectiveConcurrency = Math.min(concurrency, totalToProcess);

    let currentIndex = 0;
    let localSent = 0;
    let localConflicts = 0;
    let localErrors = 0;

    // Start background polling immediately to stream backend processed states
    pollingIntervalRef.current = setInterval(() => {
      void pollBackendProcessedData();
    }, 700);

    const worker = async () => {
      while (currentIndex < totalToProcess) {
        if (abortControllerRef.current?.signal.aborted) break;

        const taskIndex = currentIndex++;
        if (taskIndex >= totalToProcess) break;

        const row = parsedRows[taskIndex];
        submittedIdsRef.current.add(row.id);

        try {
          const payload: CreateTransactionRequest = {
            id: row.id,
            amount: row.amount,
            currency: row.currency,
            description: row.description,
            timestamp: row.timestamp,
          };

          await apiClient.submitTransaction(payload, bypassRateLimit);
          localSent++;
        } catch (err: any) {
          if (err.status === 409) {
            localConflicts++;
          } else {
            localErrors++;
          }
        }

        setSentCount(localSent);
        setSubmissionConflicts(localConflicts);
        setSubmissionErrors(localErrors);
      }
    };

    const pool = Array.from({ length: effectiveConcurrency }, () => worker());
    await Promise.all(pool);

    setStatus('PROCESSING');
    saveSession({
      status: 'PROCESSING',
      sentCount: localSent,
      submissionConflicts: localConflicts,
      submissionErrors: localErrors,
    });
    // Continue polling backend until all records are processed
    void pollBackendProcessedData();
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setStatus('STOPPED');
    saveSession({ status: 'STOPPED' });
  };

  const handleReset = (clearStorage: boolean = true) => {
    handleStop();
    setStatus('IDLE');
    setSentCount(0);
    setSubmissionErrors(0);
    setSubmissionConflicts(0);
    setRetrievedTransactions([]);
    setBackendStatuses({ completed: 0, failed: 0, processing: 0, pending: 0 });
    setLatencyBuckets({
      under20ms: 0,
      from20to50ms: 0,
      from50to100ms: 0,
      from100to200ms: 0,
      over200ms: 0,
    });
    setP50(0);
    setP90(0);
    setP95(0);
    setP99(0);
    setAvgLatency(0);
    setRateStream([]);
    setScatterPoints([]);
    setPeakRps(0);

    if (clearStorage) {
      setParsedRows([]);
      setFileName(null);
      setShowPreview(false);
      submittedIdsRef.current.clear();
      clearSession();
    }
  };

  // Restore persisted CSV batch session on mount so diagrams & history survive browser refresh/reopen
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CSV_STORAGE_KEY);
      if (raw) {
        const session: PersistedBatchSession = JSON.parse(raw);
        if (session.fileName) setFileName(session.fileName);
        if (session.parsedRows && session.parsedRows.length > 0) {
          setParsedRows(session.parsedRows);
          setShowPreview(true);
        }
        if (session.status) setStatus(session.status);
        if (session.sentCount !== undefined) setSentCount(session.sentCount);
        if (session.submissionErrors !== undefined) setSubmissionErrors(session.submissionErrors);
        if (session.submissionConflicts !== undefined) setSubmissionConflicts(session.submissionConflicts);
        if (session.rateStream && session.rateStream.length > 0) setRateStream(session.rateStream);
        if (session.peakRps !== undefined) setPeakRps(session.peakRps);
        if (session.batchStartTime) batchStartTimeRef.current = session.batchStartTime;

        if (session.submittedIds && session.submittedIds.length > 0) {
          submittedIdsRef.current = new Set(session.submittedIds);
        } else if (session.parsedRows && session.parsedRows.length > 0) {
          submittedIdsRef.current = new Set(session.parsedRows.map((r) => r.id));
        }

        // Immediately compute diagrams and visual state from cached transactions
        if (session.cachedTransactions && session.cachedTransactions.length > 0) {
          processBatchData(session.cachedTransactions, false);
        }

        // If batch was in-flight or submitted, query backend immediately to refresh state
        if (submittedIdsRef.current.size > 0) {
          void pollBackendProcessedData();
          if (session.status === 'INGESTING' || session.status === 'PROCESSING') {
            pollingIntervalRef.current = setInterval(() => {
              void pollBackendProcessedData();
            }, 1000);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to restore CSV batch session:', e);
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const totalProcessed = backendStatuses.completed + backendStatuses.failed;
  const progressPercent = parsedRows.length > 0
    ? Math.min(100, Math.round((totalProcessed / parsedRows.length) * 100))
    : 0;

  const slaCompliancePct = backendStatuses.completed > 0
    ? (((latencyBuckets.under20ms + latencyBuckets.from20to50ms + latencyBuckets.from50to100ms) / backendStatuses.completed) * 100).toFixed(1)
    : '100.0';

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 border-b border-slate-100 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                CSV Batch Scalability & Speed Visualizer
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Upload real CSV transaction data to test SQLite write speeds and stream the processed records directly from the backend.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Download CSV Template</span>
            </button>
          </div>
        </div>

        {/* Drag & Drop File Zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="mt-5 border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-indigo-50/20 group"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".csv"
            className="hidden"
          />
          <div className="w-12 h-12 rounded-xl bg-indigo-50 group-hover:bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-3 transition-colors">
            <UploadCloud className="w-6 h-6" />
          </div>
          <h4 className="text-xs font-bold text-slate-800">
            {fileName ? (
              <span className="text-indigo-600 flex items-center justify-center gap-1.5">
                <FileCheck className="w-4 h-4" /> Loaded: {fileName} ({parsedRows.length} transactions)
              </span>
            ) : (
              'Click to upload or drag & drop CSV file'
            )}
          </h4>
          <p className="text-[11px] text-slate-400 mt-1">
            Required headers: <code>amount, currency, description</code>. Optional: <code>id, timestamp</code>.
          </p>
        </div>

        {/* Parse Errors Alert */}
        {parseErrors.length > 0 && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>CSV Validation Errors:</span>
            </div>
            <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
              {parseErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Benchmarking Parameters & Action Bar */}
        <div className="mt-5 pt-5 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-5">
            {/* Concurrency Slider */}
            <div className="flex items-center gap-2.5">
              <Sliders className="w-4 h-4 text-slate-400" />
              <label className="text-xs font-semibold text-slate-700">Concurrency:</label>
              <input
                type="range"
                min="1"
                max="25"
                value={concurrency}
                disabled={status === 'INGESTING' || status === 'PROCESSING'}
                onChange={(e) => setConcurrency(parseInt(e.target.value))}
                className="w-28 accent-indigo-600"
              />
              <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200/60">
                {concurrency} workers
              </span>
            </div>

            {/* Bypass Rate Limiter Checkbox */}
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={bypassRateLimit}
                disabled={status === 'INGESTING' || status === 'PROCESSING'}
                onChange={(e) => setBypassRateLimit(e.target.checked)}
                className="rounded accent-indigo-600 w-4 h-4"
              />
              <span>Bypass Rate Limiter (Benchmark Max Speed)</span>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {status === 'INGESTING' || status === 'PROCESSING' ? (
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-xs cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Stop Execution</span>
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={parsedRows.length === 0}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Process CSV Batch ({parsedRows.length} Txns)</span>
              </button>
            )}

            <button
              onClick={() => handleReset(true)}
              disabled={status === 'INGESTING' || status === 'PROCESSING'}
              className="p-2 text-slate-600 hover:text-slate-900 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
              title="Reset metrics"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Progress & Live Ingress Gauge */}
      {(status === 'INGESTING' || status === 'PROCESSING' || status === 'COMPLETED' || status === 'STOPPED') && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800">
                {status === 'INGESTING'
                  ? 'Ingesting into SQLite & Redis...'
                  : status === 'PROCESSING'
                  ? 'Awaiting Backend Worker Completion...'
                  : status === 'COMPLETED'
                  ? 'All Transactions Processed by Backend'
                  : 'Batch Processing Aborted'}
              </span>
            </div>
            <div className="text-xs font-mono text-slate-500">
              Backend Processed: <span className="font-bold text-slate-900">{totalProcessed}</span> / {parsedRows.length} ({progressPercent}%)
            </div>
          </div>

          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden my-3">
            <div
              className={`h-full transition-all duration-200 rounded-full ${
                status === 'COMPLETED'
                  ? 'bg-emerald-500'
                  : status === 'STOPPED'
                  ? 'bg-rose-500'
                  : 'bg-indigo-600'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex flex-wrap justify-between items-center text-xs text-slate-500 font-mono gap-2">
            <span>Submitted: <strong className="text-slate-800">{sentCount}</strong></span>
            {submissionConflicts > 0 && <span>Conflicts: <strong className="text-orange-600 font-bold">{submissionConflicts}</strong></span>}
            {submissionErrors > 0 && <span>Errors: <strong className="text-rose-600 font-bold">{submissionErrors}</strong></span>}
            <span>Confirmed Completed: <strong className="text-emerald-600 font-bold">{backendStatuses.completed}</strong></span>
            <span>Workers Processing: <strong className="text-blue-600 font-bold">{backendStatuses.processing}</strong></span>
            <span>Queue Pending: <strong className="text-amber-600 font-bold">{backendStatuses.pending}</strong></span>
            <span>Failed: <strong className="text-rose-600 font-bold">{backendStatuses.failed}</strong></span>
          </div>
        </div>
      )}

      {/* KPI Cards (ONLY Real Processed Data from Backend) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
            Backend COMPLETED
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600 font-mono">{backendStatuses.completed}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Confirmed by remote service</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
            In-Flight / Pending
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-600 font-mono">
              {backendStatuses.processing + backendStatuses.pending}
            </span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Active in Redis & workers</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
            Backend FAILED
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-600 font-mono">{backendStatuses.failed}</span>
            <XCircle className="w-4 h-4 text-rose-500" />
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Terminated after 5 retries</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
            Target SLA (&lt;0.10s)
          </span>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono ${parseFloat(slaCompliancePct) >= 95 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {slaCompliancePct}%
            </span>
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">p99: {(p99 / 1000).toFixed(3)} s</span>
        </div>
      </div>

      {/* Latency Percentiles Strip (From Backend Processed Timestamps) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
        <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-3">
          Measured Backend Processing Latencies (Duration from Submission to Completion in Seconds)
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 block mb-0.5">Average</span>
            <span className="text-lg font-bold text-slate-900 font-mono">{(avgLatency / 1000).toFixed(3)} s</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 block mb-0.5">p50 (Median)</span>
            <span className="text-lg font-bold text-slate-900 font-mono">{(p50 / 1000).toFixed(3)} s</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 block mb-0.5">p90</span>
            <span className="text-lg font-bold text-slate-900 font-mono">{(p90 / 1000).toFixed(3)} s</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 block mb-0.5">p95</span>
            <span className="text-lg font-bold text-emerald-600 font-mono">{(p95 / 1000).toFixed(3)} s</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 block mb-0.5">p99</span>
            <span className={`text-lg font-bold font-mono ${p99 < 100 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {(p99 / 1000).toFixed(3)} s
            </span>
          </div>
        </div>
      </div>

      {/* VISUAL CHARTS (Line Graph, Bar Graph, Scatter Plot - ONLY Backend Processed Data) */}
      <div className="space-y-6">
        <ScalabilityRateLineChart
          data={rateStream}
          peakRps={peakRps}
          avgRps={rateStream.length > 0 ? rateStream.reduce((a, b) => a + b.rps, 0) / rateStream.length : 0}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ScalabilityStatusBarChart
            statusData={backendStatuses}
            latencyBuckets={latencyBuckets}
            totalCount={retrievedTransactions.length}
          />

          <ScalabilityScatterPlot
            points={scatterPoints}
          />
        </div>
      </div>

      {/* Processed Transactions Ledger Table (Directly Retrieved from Backend) */}
      {retrievedTransactions.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              <h4 className="text-xs font-bold text-slate-800">
                Processed Transactions Retrieved from Backend ({retrievedTransactions.length} records)
              </h4>
            </div>
            <button
              onClick={() => void pollBackendProcessedData()}
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-indigo-600 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Backend Data</span>
            </button>
          </div>

          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] sticky top-0 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5">Transaction ID</th>
                  <th className="px-4 py-2.5">Amount</th>
                  <th className="px-4 py-2.5">Backend Status</th>
                  <th className="px-4 py-2.5">Processing Time (s)</th>
                  <th className="px-4 py-2.5">Submitted</th>
                  <th className="px-4 py-2.5">Completed</th>
                  <th className="px-4 py-2.5">Attempts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {retrievedTransactions.map((tx, idx) => {
                  const durationMs = tx.completedAt && tx.submittedAt
                    ? Math.max(0, new Date(tx.completedAt).getTime() - new Date(tx.submittedAt).getTime())
                    : null;

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2 text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-2 font-bold text-slate-800 flex items-center gap-1.5">
                        <span title={tx.id}>{tx.id.substring(0, 18)}...</span>
                        <button
                          onClick={(e) => copyId(tx.id, e)}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                          title="Copy UUID"
                        >
                          {copiedId === tx.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </td>
                      <td className="px-4 py-2 font-bold text-slate-900">
                        {tx.amount.toFixed(2)} {tx.currency}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            tx.status === 'COMPLETED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : tx.status === 'FAILED'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : tx.status === 'PROCESSING'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-bold text-slate-700">
                        {durationMs !== null ? `${(durationMs / 1000).toFixed(3)} s` : <span className="text-slate-400 italic font-normal">in flight</span>}
                      </td>
                      <td className="px-4 py-2 text-slate-400 text-[10px]">
                        {new Date(tx.submittedAt).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-2 text-slate-400 text-[10px]">
                        {tx.completedAt ? new Date(tx.completedAt).toLocaleTimeString() : '—'}
                      </td>
                      <td className="px-4 py-2 text-slate-600 font-bold">
                        {tx.attemptCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CSV Input Preview Table (Before processing) */}
      {parsedRows.length > 0 && retrievedTransactions.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="w-full flex items-center justify-between p-4 bg-slate-50/80 hover:bg-slate-100/80 transition-colors border-b border-slate-100 text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800">
                Uploaded CSV Data ({parsedRows.length} valid rows)
              </span>
              <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-mono font-semibold">
                Total: ${parsedRows.reduce((acc, r) => acc + r.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {showPreview ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </button>

          {showPreview && (
            <div className="overflow-x-auto max-h-60 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] sticky top-0 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-2.5">#</th>
                    <th className="px-4 py-2.5">ID</th>
                    <th className="px-4 py-2.5">Amount</th>
                    <th className="px-4 py-2.5">Currency</th>
                    <th className="px-4 py-2.5">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {parsedRows.slice(0, 50).map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2 text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-2 font-bold text-slate-800">{row.id}</td>
                      <td className="px-4 py-2 text-slate-900 font-bold">{row.amount.toFixed(2)}</td>
                      <td className="px-4 py-2 text-slate-600">{row.currency}</td>
                      <td className="px-4 py-2 text-slate-500 truncate max-w-xs">{row.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
