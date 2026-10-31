import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Lock, Mail, Play, ShieldCheck } from 'lucide-react';
import { AegisBrandMark, apiFetch } from '../api';

interface AuthGateProps {
  initialMode?: 'login' | 'register';
  authErrorBanner?: string;
  onAuthenticated: () => Promise<void>;
  onBackToLanding: () => void;
  onLaunchDemo: () => Promise<void>;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  initialMode = 'login',
  authErrorBanner,
  onAuthenticated,
  onBackToLanding,
  onLaunchDemo,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [organization, setOrganization] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(authErrorBanner || '');

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch<{
        liveGoogleOAuthConfigured: boolean;
        authUrl?: string;
        message?: string;
      }>('/api/auth/google/url');
      if (data.liveGoogleOAuthConfigured && data.authUrl) {
        window.location.href = data.authUrl;
        return;
      }
      setError(
        data.message ||
          'Google Sign-In is not configured on this local server. Please sign in with Email or open the Guided Demo Workspace below.'
      );
    } catch (err) {
      setError((err as Error).message || 'Could not start Google Sign-In.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'register') {
        await apiFetch('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, fullName, organization }),
        });
      } else {
        await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
      }
      await onAuthenticated();
    } catch (err) {
      setError((err as Error).message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = async () => {
    setError('');
    setLoading(true);
    try {
      await onLaunchDemo();
    } catch (err) {
      setError((err as Error).message || 'Could not launch demo workspace.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-midnight-grid text-slate-100 flex flex-col justify-between px-4 sm:px-8 py-8">
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between">
        <button
          type="button"
          onClick={onBackToLanding}
          className="btn-ghost-brutal px-3.5 py-2 text-xs sm:text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </button>

        <div className="flex items-center gap-2.5">
          <AegisBrandMark size={28} />
          <span className="font-display font-bold text-white">AegisPay</span>
        </div>
      </div>

      <div className="w-full max-w-5xl mx-auto my-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 5 Columns: Clear Context & Guided Demo Option */}
        <div className="lg:col-span-5 glass-brutal-panel corner-ticks p-6 sm:p-8 flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 text-xs font-mono uppercase text-[#CCFF00] px-2.5 py-1 bg-[#0047FF]/20 border border-[#0047FF]/60">
              <ShieldCheck className="w-4 h-4" />
              Private Account Workspace
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white leading-tight">
              Sign in to manage your PayPal safety &amp; billing
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Every account gets its own isolated workspace for invoice checks, subscription
              limits, failed-payment recovery, and milestone PayPal invoices.
            </p>
          </div>

          <div className="p-4 bg-[#070A12] border border-[#1E293B] space-y-3">
            <div className="text-xs font-mono uppercase text-[#CCFF00]">
              Want to explore right away?
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Open an isolated guest workspace pre-loaded with sample orders and a 5-step
              interactive walkthrough.
            </p>
            <button
              type="button"
              onClick={handleQuickDemo}
              disabled={loading}
              className="btn-acid w-full py-2.5 text-xs sm:text-sm"
            >
              <Play className="w-4 h-4 fill-current" />
              Launch Guided Demo Workspace
            </button>
          </div>
        </div>

        {/* Right 7 Columns: Google OAuth + Email Sign In / Register */}
        <div className="lg:col-span-7 glass-brutal-panel p-6 sm:p-8 space-y-5">
          <div className="grid grid-cols-2 gap-2 p-1 bg-[#07090F] border border-[#1B2234]">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className={`py-2 text-xs sm:text-sm font-display font-bold transition-colors ${
                mode === 'login'
                  ? 'bg-[#0047FF] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
              }}
              className={`py-2 text-xs sm:text-sm font-display font-bold transition-colors ${
                mode === 'register'
                  ? 'bg-[#0047FF] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3.5 bg-red-950/50 border border-red-500/60 text-xs text-red-200 leading-relaxed"
            >
              {error}
            </div>
          )}

          {/* Google OAuth Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-3 px-4 bg-white text-[#050507] font-display font-bold text-sm border-2 border-white hover:bg-slate-100 transition-all flex items-center justify-center gap-3 shadow-[3px_3px_0px_#0047FF]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-[#1B2234]" />
            <span className="px-3 text-[11px] font-mono uppercase text-slate-400">
              Or continue with email
            </span>
            <div className="flex-grow border-t border-[#1B2234]" />
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-3.5">
            {mode === 'register' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Morgan"
                    className="input-brutal"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Business or Team Name
                  </label>
                  <input
                    type="text"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="Morgan Design Studio"
                    className="input-brutal"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="input-brutal pl-9"
                />
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Password {mode === 'register' && '(minimum 8 characters)'}
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="input-brutal pl-9"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-cobalt w-full py-3 text-sm mt-2"
            >
              {loading
                ? 'Signing In...'
                : mode === 'register'
                  ? 'Create Account & Open Workspace'
                  : 'Sign In to Workspace'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      <div className="text-center text-xs text-slate-500 font-mono">
        Protected by encrypted HttpOnly session cookies &amp; per-account workspace isolation.
      </div>
    </div>
  );
};
