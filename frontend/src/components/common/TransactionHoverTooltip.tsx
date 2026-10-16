import React from 'react';

export interface TransactionHoverDetails {
  id: string;
  amt: number | string;
  currency?: string;
  status: string;
  timeTaken: string;
  title?: string;
  note?: string;
}

export interface TransactionHoverCoords {
  x: number;
  y: number;
}

interface TransactionHoverTooltipProps {
  details: TransactionHoverDetails | null;
  coords?: TransactionHoverCoords | null;
  className?: string;
}

export const TransactionHoverTooltip: React.FC<TransactionHoverTooltipProps> = ({
  details,
  coords,
  className = '',
}) => {
  if (!details) return null;

  const isCompleted = details.status === 'COMPLETED';
  const isFailed = details.status === 'FAILED';
  const isProcessing = details.status === 'PROCESSING';

  let positionStyle: React.CSSProperties = {};
  if (coords) {
    const tooltipWidth = 270;
    const tooltipHeight = 175;
    const offset = 14;

    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;

    // Flip horizontal if overflowing right edge
    let left = coords.x + offset;
    if (left + tooltipWidth > viewportW - 12) {
      left = Math.max(12, coords.x - tooltipWidth - offset);
    }

    // Flip vertical if overflowing bottom edge
    let top = coords.y + offset;
    if (top + tooltipHeight > viewportH - 12) {
      top = Math.max(12, coords.y - tooltipHeight - offset);
    }

    positionStyle = {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      zIndex: 9999,
      pointerEvents: 'none',
      width: `${tooltipWidth}px`,
    };
  }

  return (
    <div
      style={positionStyle}
      className={`bg-slate-900/95 text-white p-3 rounded-xl shadow-2xl border border-slate-700/80 backdrop-blur-md text-xs font-mono space-y-1.5 pointer-events-none transition-all duration-75 ${
        coords ? 'animate-in fade-in zoom-in-95 duration-100' : `z-50 ${className}`
      }`}
    >
      {details.title && (
        <div className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider border-b border-slate-800 pb-1 mb-1">
          {details.title}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-400 font-sans text-[11px]">ID:</span>
        <span className="text-indigo-200 font-bold font-mono text-[11px] truncate max-w-[200px]" title={details.id}>
          {details.id}
        </span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-400 font-sans text-[11px]">Amt:</span>
        <span className="text-white font-bold text-[11px]">
          {details.amt} {details.currency || ''}
        </span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-400 font-sans text-[11px]">Status:</span>
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
            isCompleted
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : isFailed
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              : isProcessing
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
          }`}
        >
          {details.status}
        </span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-400 font-sans text-[11px]">Time Taken:</span>
        <span className="text-emerald-400 font-bold text-[11px]">
          {details.timeTaken}
        </span>
      </div>

      {details.note && (
        <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/80 font-sans">
          {details.note}
        </div>
      )}
    </div>
  );
};
