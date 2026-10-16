import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: {
    value: string;
    isPositive?: boolean;
    isNeutral?: boolean;
  };
  accentColor?: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'slate';
  isLoading?: boolean;
  alert?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  accentColor = 'blue',
  isLoading = false,
  alert = false,
}) => {
  const accentStyles = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    slate: 'bg-slate-50 text-slate-600 border-slate-200',
  }[accentColor];

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-4 bg-slate-200 rounded-md w-24 mb-3"></div>
          <div className="w-10 h-10 bg-slate-100 rounded-lg"></div>
        </div>
        <div className="h-7 bg-slate-200 rounded-md w-32 mb-2"></div>
        <div className="h-3 bg-slate-100 rounded-md w-20"></div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-xl p-5 border transition-all duration-200 shadow-xs hover:shadow-sm ${
        alert ? 'border-rose-300 ring-1 ring-rose-500/20 bg-rose-50/20' : 'border-slate-200/80'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{title}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{value}</h3>
            {trend && (
              <span
                className={`text-xs font-semibold px-1.5 py-0.5 rounded-md ${
                  trend.isNeutral
                    ? 'bg-slate-100 text-slate-600'
                    : trend.isPositive
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-rose-50 text-rose-700'
                }`}
              >
                {trend.value}
              </span>
            )}
          </div>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>

        <div className={`p-2.5 rounded-xl border ${accentStyles}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};
