import React from 'react';
import { CheckCircle2, Clock, AlertTriangle, XCircle, ShieldCheck, ShieldAlert, Shield } from 'lucide-react';
import type { TransactionStatus, CircuitBreakerState } from '../../api/types';

interface StatusBadgeProps {
  status: TransactionStatus | CircuitBreakerState | 'UP' | 'DOWN' | 'DEGRADED' | string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
}) => {
  const normalized = (status || '').toUpperCase();

  let colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';
  let icon = <Clock className="w-3.5 h-3.5" />;
  let label = normalized;

  switch (normalized) {
    case 'COMPLETED':
    case 'UP':
      colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-600/10';
      icon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
      break;

    case 'PROCESSING':
      colorClasses = 'bg-blue-50 text-blue-700 border-blue-200 ring-1 ring-blue-600/10';
      icon = <Clock className="w-3.5 h-3.5 text-blue-600 animate-spin" />;
      break;

    case 'PENDING':
      colorClasses = 'bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-amber-600/10';
      icon = <Clock className="w-3.5 h-3.5 text-amber-600" />;
      break;

    case 'FAILED':
    case 'DOWN':
      colorClasses = 'bg-rose-50 text-rose-700 border-rose-200 ring-1 ring-rose-600/10';
      icon = <XCircle className="w-3.5 h-3.5 text-rose-600" />;
      break;

    case 'DEGRADED':
      colorClasses = 'bg-orange-50 text-orange-700 border-orange-200 ring-1 ring-orange-600/10';
      icon = <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />;
      break;

    case 'CLOSED':
      colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-1 ring-emerald-600/20';
      icon = <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />;
      label = 'CLOSED (Normal)';
      break;

    case 'OPEN':
      colorClasses = 'bg-rose-50 text-rose-700 border-rose-300 ring-1 ring-rose-600/20';
      icon = <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />;
      label = 'OPEN (Tripped)';
      break;

    case 'HALF_OPEN':
      colorClasses = 'bg-amber-50 text-amber-700 border-amber-300 ring-1 ring-amber-600/20';
      icon = <Shield className="w-3.5 h-3.5 text-amber-600" />;
      label = 'HALF_OPEN (Testing)';
      break;
  }

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-medium',
    lg: 'text-sm px-3 py-1.5 gap-2 font-semibold',
  }[size];

  return (
    <span
      className={`inline-flex items-center rounded-full border transition-colors ${colorClasses} ${sizeClasses}`}
    >
      {showIcon && icon}
      <span>{label}</span>
    </span>
  );
};
