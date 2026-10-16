import React from 'react';
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

interface AlertBannerProps {
  alerts: string[];
  type?: 'warning' | 'error' | 'info';
  onDismiss?: (index: number) => void;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  alerts,
  type = 'warning',
  onDismiss,
}) => {
  if (!alerts || alerts.length === 0) return null;

  const styles = {
    warning: {
      container: 'bg-amber-50 border-amber-200 text-amber-900',
      icon: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />,
      badge: 'bg-amber-200/60 text-amber-900',
    },
    error: {
      container: 'bg-rose-50 border-rose-200 text-rose-900',
      icon: <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />,
      badge: 'bg-rose-200/60 text-rose-900',
    },
    info: {
      container: 'bg-blue-50 border-blue-200 text-blue-900',
      icon: <Info className="w-5 h-5 text-blue-600 shrink-0" />,
      badge: 'bg-blue-200/60 text-blue-900',
    },
  }[type];

  return (
    <div className={`rounded-xl border p-4 shadow-xs ${styles.container}`}>
      <div className="flex items-start gap-3">
        {styles.icon}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold tracking-tight">System Alerts Detected</h4>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${styles.badge}`}>
              {alerts.length} Active
            </span>
          </div>
          <ul className="mt-2 space-y-1">
            {alerts.map((alert, idx) => (
              <li key={idx} className="text-xs flex items-center justify-between text-slate-700">
                <span className="font-medium flex items-center gap-1.5">
                  {alert}
                </span>
                {onDismiss && (
                  <button
                    onClick={() => onDismiss(idx)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 rounded-md"
                    title="Dismiss alert"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
