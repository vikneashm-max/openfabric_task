import React from 'react';
import { Plus, RefreshCw, Bell, User, LogOut } from 'lucide-react';

interface HeaderProps {
  onOpenSubmitModal: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  isConnected?: boolean;
  alertCount: number;
  currentUser?: string | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSubmitModal,
  onRefresh,
  isRefreshing,
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

        {/* Fixed 10s Auto-Refresh Indicator */}
        <div
          className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-2xs select-none"
          title="System automatically updates recent values every 10 seconds"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[11px] font-medium text-slate-600 hidden sm:inline">Auto-refresh:</span>
          <span className="font-mono font-bold text-emerald-700 text-[11px]">10s</span>
        </div>

        {/* Manual Refresh Button */}
        <button
          id="manual-refresh-btn"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-blue-700 bg-white hover:bg-blue-50/60 border border-slate-200 hover:border-blue-300 rounded-lg transition-all shadow-2xs active:scale-95 disabled:opacity-60 cursor-pointer"
          title="Update recent values immediately"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
          <span className="font-medium hidden sm:inline">Refresh</span>
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
