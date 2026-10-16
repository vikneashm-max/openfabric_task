export function formatTimeTaken(tx?: { submittedAt?: string; completedAt?: string | null; status?: string } | null): string {
  if (!tx) return 'N/A';
  if (tx.completedAt && tx.submittedAt) {
    const ms = Math.max(0, new Date(tx.completedAt).getTime() - new Date(tx.submittedAt).getTime());
    if (ms < 1000) return `${ms} ms`;
    return `${(ms / 1000).toFixed(3)} s`;
  }
  if (tx.status === 'PENDING') return 'Pending in queue (0s)';
  if (tx.status === 'PROCESSING') return 'Processing in worker...';
  if (tx.status === 'FAILED') return 'Failed during execution';
  return 'N/A';
}
