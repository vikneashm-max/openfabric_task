import React, { useState } from 'react';
import {
  User,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import openfabricLogo from '../assets/openfabric-logo.png';

interface LoginPageProps {
  onLogin: (username: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capsLockActive, setCapsLockActive] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.getModifierState) {
      setCapsLockActive(e.getModifierState('CapsLock'));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUser = username.trim();
    const cleanPass = password;

    if (!cleanUser) {
      setError('Username is required.');
      return;
    }
    if (!cleanPass) {
      setError('Password is required.');
      return;
    }

    setIsLoading(true);

    // Validate credentials (supports user/12345 and admin/admin)
    setTimeout(() => {
      const isValid = (cleanUser === 'user' && cleanPass === '12345') ||
                      (cleanUser === 'admin' && (cleanPass === 'admin' || cleanPass === 'admin123')) ||
                      (cleanUser === 'operator' && cleanPass === 'operator');
      if (isValid) {
        // Strictly persist in sessionStorage so closing the portal automatically logs off
        sessionStorage.setItem('openfabric_user', cleanUser);
        localStorage.removeItem('openfabric_user');
        setIsLoading(false);
        onLogin(cleanUser);
      } else {
        setIsLoading(false);
        setError('Invalid username or password. Default is user / 12345');
      }
    }, 280);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-white selection:bg-blue-600 selection:text-white px-4 py-8">
      {/* Main Login Card with Shadow Elevation */}
      <div className="w-full max-w-md bg-white border border-slate-200/70 shadow-2xl shadow-slate-300/60 rounded-3xl p-8 sm:p-9 transition-all">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl shadow-2xs mb-4">
            <img
              src={openfabricLogo}
              alt="OpenFabric"
              className="h-9 w-auto object-contain"
            />
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Transaction Processing System
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Sign in to access the system monitoring & transaction ledger
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-5 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start gap-2 animate-shake">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block">Authentication Failed</span>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username Field */}
          <div>
            <label
              htmlFor="login-username"
              className="block text-xs font-bold text-slate-700 mb-1.5"
            >
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Enter username"
                className="w-full pl-10 pr-3.5 py-2.5 text-xs font-medium text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="login-password"
                className="block text-xs font-bold text-slate-700"
              >
                Password
              </label>
              {capsLockActive && (
                <span className="text-[10px] font-semibold text-amber-600 flex items-center gap-1">
                  Caps Lock is ON
                </span>
              )}
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Enter password"
                className="w-full pl-10 pr-10 py-2.5 text-xs font-medium text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span>Sign In to Console</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Security Footer */}
        <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-center gap-1.5 text-xs text-slate-400 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Enterprise Gateway Security</span>
        </div>
      </div>
    </div>
  );
};
