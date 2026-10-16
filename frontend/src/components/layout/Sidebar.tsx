import React from 'react';
import {
  LayoutDashboard,
  Receipt,
  ShieldAlert,
  Gauge,
  FileSpreadsheet,
} from 'lucide-react';
import openfabricLogo from '../../assets/openfabric-logo.png';

export type NavTab = 'dashboard' | 'transactions' | 'circuit-breaker' | 'rate-limit' | 'load-test' | 'csv-batch';

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  queueDepth: number;
  circuitBreakerState: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  queueDepth,
  circuitBreakerState,
}) => {
  const navItems = [
    {
      id: 'dashboard' as NavTab,
      label: 'Monitoring Dashboard',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'transactions' as NavTab,
      label: 'Transaction Ledger',
      icon: <Receipt className="w-4 h-4" />,
    },
    {
      id: 'csv-batch' as NavTab,
      label: 'CSV Scalability Suite',
      icon: <FileSpreadsheet className="w-4 h-4" />,
      badge: 'Visuals',
      badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    },
    {
      id: 'circuit-breaker' as NavTab,
      label: 'Circuit Breaker',
      icon: <ShieldAlert className="w-4 h-4" />,
      badge: circuitBreakerState === 'OPEN' ? 'OPEN' : null,
      badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
    },
    {
      id: 'rate-limit' as NavTab,
      label: 'Rate Limiter',
      icon: <Gauge className="w-4 h-4" />,
    },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200/80 flex flex-col justify-between shrink-0 h-screen sticky top-0">
      <div>
        {/* Brand Logo / Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-100">
          <img
            src={openfabricLogo}
            alt="OpenFabric"
            className="h-8 w-auto object-contain"
          />
          <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase bg-slate-50 px-2 py-0.5 rounded border border-slate-200/60 font-semibold">
            v0.0.1
          </span>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={isActive ? 'text-blue-600' : 'text-slate-400'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${item.badgeColor}`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Info Card */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/50">
        <div className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Redis Backlog</span>
            <span className="font-mono font-bold text-slate-900">{queueDepth} items</span>
          </div>
        </div>

      </div>
    </aside>
  );
};
