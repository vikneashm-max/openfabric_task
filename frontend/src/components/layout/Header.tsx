import React from 'react';
import { Plus, RefreshCw, Radio, Bell, User, LogOut } from 'lucide-react';

interface HeaderProps {
  onOpenSubmitModal: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  refreshInterval: number; // in seconds, 0 = paused
  onRefreshIntervalChange: (sec: number) => void;
  isConnected?: boolean;
  alertCount: number;
  currentUser?: string | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSubmitModal,
  onRefresh,
  isRefreshing,
  refreshInterval,
  onRefreshIntervalChange,
  alertCount,
  currentUser,
  onLogout,
}) => {
  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
      {/* Title & Connection Status */}
      <div className="flex items-center gap-3">
        <h1 className="text-base font-bold text-slate-900 tracking-tight">
          Transaction Processing System
        </h1>
        <span className="text-xs px-2 py-0.5 rounded-md font-mono font-medium bg-slate-100 text-slate-600 border border-slate-200/60 hidden sm:inline-block">
          SQLite WAL • Redis Queue
        </span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Alerts Pill */}
        {alertCount > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold">
            <Bell className="w-3.5 h-3.5 text-amber-600" />
            <span>{alertCount} Alerts</span>
          </div>
        )}

        {/* Auto Refresh Selector */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
          <Radio className={`w-3.5 h-3.5 ${refreshInterval > 0 ? 'text-emerald-600 animate-pulse' : 'text-slate-400'}`} />
          <span className="hidden md:inline font-medium">Auto-refresh:</span>
          <select
            value={refreshInterval}
            onChange={(e) => onRefreshIntervalChange(Number(e.target.value))}
            className="bg-transparent font-medium text-slate-700 focus:outline-none cursor-pointer"
          >
            <option value={0}>Paused</option>
            <option value={2}>2s</option>
            <option value={5}>5s</option>
            <option value={10}>10s</option>
          </select>
        </div>

        {/* Manual Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 text-slate-600 hover:text-blue-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
          title="Manual Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
        </button>

        {/* Submit Transaction Button */}
        <button
          onClick={onOpenSubmitModal}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Transaction</span>
        </button>

        {/* User Pill & Sign Out */}
        {currentUser && (
          <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">
              <User className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden md:inline">{currentUser}</span>
            </div>
            {onLogout && (
              <button
                onClick={onLogout}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
