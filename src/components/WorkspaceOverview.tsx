import React from 'react';
import {
  ArrowRight,
  Compass,
  ExternalLink,
  FileText,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { fmtUsd, type WorkspaceState } from '../api';
import type { WorkspaceSectionId } from '../webmcp';

interface WorkspaceOverviewProps {
  state: WorkspaceState;
  onNavigate: (section: WorkspaceSectionId) => void;
  onStartTour: () => void;
}

export const WorkspaceOverview: React.FC<WorkspaceOverviewProps> = ({
  state,
  onNavigate,
  onStartTour,
}) => {
  const freeBudgetCents = state.lupa.defaultAffordability.trueFreeCashflowCents;
  const unusedSubsCount = state.lupa.zombieReport.totalZombieCount;

  return (
    <div className="space-y-6 animate-view-enter">
      {/* Symmetrical Welcome & Guided Tour Banner */}
      <div className="glass-brutal-panel corner-ticks p-6 sm:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-1.5 max-w-2xl">
          <div className="text-xs font-mono uppercase tracking-wider text-[#CCFF00]">
            Welcome back, {state.operator?.fullName || 'Account Owner'}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            What would you like to do with PayPal today?
          </h1>
          <p className="text-sm text-slate-300">
            Pick a task below to check an invoice before paying, recover a declined customer order,
            or send a milestone PayPal invoice. New here? Start the 60-second interactive tour.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button type="button" onClick={onStartTour} className="btn-acid px-5 py-2.5 text-xs sm:text-sm">
            <Compass className="w-4 h-4" />
            Start Interactive Tour
          </button>
          <button
            type="button"
            onClick={() => onNavigate('protect')}
            className="btn-cobalt px-5 py-2.5 text-xs sm:text-sm"
          >
            Check an Invoice
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Symmetrical 4-Column Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-brutal-panel p-5 flex flex-col justify-between">
          <div className="text-xs text-slate-400">Available Safe Spending Budget</div>
          <div className="font-display text-2xl sm:text-3xl font-bold text-white tabular-nums mt-2">
            {fmtUsd(Math.max(0, freeBudgetCents))}
          </div>
          <div className="text-[11px] text-[#CCFF00] font-mono mt-2">
            After bills &amp; safety reserve
          </div>
        </div>

        <div className="glass-brutal-panel p-5 flex flex-col justify-between">
          <div className="text-xs text-slate-400">Unused Subscriptions Found</div>
          <div className="font-display text-2xl sm:text-3xl font-bold text-white tabular-nums mt-2">
            {unusedSubsCount}
          </div>
          <div className="text-[11px] text-[#CCFF00] font-mono mt-2">
            Save {fmtUsd(state.kpis.recoverableMonthlyCents)}/mo by canceling
          </div>
        </div>

        <div className="glass-brutal-panel p-5 flex flex-col justify-between">
          <div className="text-xs text-slate-400">Money Saved &amp; Protected</div>
          <div className="font-display text-2xl sm:text-3xl font-bold text-[#CCFF00] tabular-nums mt-2">
            {fmtUsd(state.kpis.totalProtectedCents)}
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-2">
            Across {state.kpis.totalAuditRecords} workspace actions
          </div>
        </div>

        <div className="glass-brutal-panel p-5 flex flex-col justify-between">
          <div className="text-xs text-slate-400">Active PayPal Invoices &amp; Orders</div>
          <div className="font-display text-2xl sm:text-3xl font-bold text-white tabular-nums mt-2">
            {state.orders.length + state.invoices.length}
          </div>
          <div className="text-[11px] text-[#CCFF00] font-mono mt-2">
            {state.system.paypal.hasLiveSandboxCredentials
              ? 'PayPal Sandbox Connected'
              : 'Local Sandbox Active'}
          </div>
        </div>
      </div>

      {/* Symmetrical 3-Card Primary Workflow Launcher */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="glass-brutal-panel corner-ticks p-6 flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="w-10 h-10 bg-[#0047FF]/20 border border-[#0047FF] flex items-center justify-center text-[#CCFF00]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h2 className="font-display text-lg font-bold text-white">1. Pay Safely</h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Check unfamiliar payment requests for scam signs before paying, manage monthly budget
              limits, and cancel forgotten PayPal subscriptions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('protect')}
            className="btn-ghost-brutal w-full py-2.5 text-xs sm:text-sm"
          >
            Open Payment Protection
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="glass-brutal-panel corner-ticks p-6 flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="w-10 h-10 bg-[#0047FF]/20 border border-[#0047FF] flex items-center justify-center text-[#CCFF00]">
              <RefreshCw className="w-5 h-5" />
            </div>
            <h2 className="font-display text-lg font-bold text-white">2. Recover &amp; Retain</h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Find out why a customer payment declined and send the right PayPal recovery link,
              resolve minor shipping defects with partial refunds, and save canceling subscribers.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('merchant')}
            className="btn-ghost-brutal w-full py-2.5 text-xs sm:text-sm"
          >
            Open Revenue Recovery
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="glass-brutal-panel corner-ticks p-6 flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="w-10 h-10 bg-[#0047FF]/20 border border-[#0047FF] flex items-center justify-center text-[#CCFF00]">
              <FileText className="w-5 h-5" />
            </div>
            <h2 className="font-display text-lg font-bold text-white">3. Get Paid</h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Split client projects into clear milestones and team payouts, send live PayPal
              invoices, and negotiate fair deposit terms with vendors.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('getpaid')}
            className="btn-ghost-brutal w-full py-2.5 text-xs sm:text-sm"
          >
            Open Milestone Invoicing
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Symmetrical 2-Column Recent PayPal Orders & Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="glass-brutal-panel p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-[#CCFF00]" />
              <h3 className="font-display font-bold text-base text-white">Recent PayPal Orders</h3>
            </div>
            <span className="text-xs font-mono text-slate-400">{state.orders.length} total</span>
          </div>

          {state.orders.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">
              No PayPal orders created in this session yet. Try checking an invoice in{' '}
              <button
                type="button"
                onClick={() => onNavigate('protect')}
                className="text-[#CCFF00] underline"
              >
                Pay Safely
              </button>{' '}
              or recovering a declined sale in{' '}
              <button
                type="button"
                onClick={() => onNavigate('merchant')}
                className="text-[#CCFF00] underline"
              >
                Recover &amp; Retain
              </button>
              .
            </p>
          ) : (
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {state.orders.slice(0, 6).map((o) => (
                <div
                  key={o.orderId}
                  className="p-3 bg-[#080B13] border border-[#1B2234] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">
                      {o.merchantName} — {fmtUsd(o.amountCents)}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 truncate">
                      {o.orderId} • {o.status}
                    </div>
                  </div>
                  <a
                    href={o.approvalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost-brutal px-2.5 py-1 text-[11px] shrink-0"
                  >
                    Open in PayPal
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-brutal-panel p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#CCFF00]" />
              <h3 className="font-display font-bold text-base text-white">
                Recent PayPal Invoices
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-400">{state.invoices.length} sent</span>
          </div>

          {state.invoices.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">
              No PayPal invoices sent yet. Head to{' '}
              <button
                type="button"
                onClick={() => onNavigate('getpaid')}
                className="text-[#CCFF00] underline"
              >
                Get Paid
              </button>{' '}
              to create a milestone schedule and send a shareable PayPal invoice link.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {state.invoices.slice(0, 6).map((inv) => (
                <div
                  key={inv.invoiceId}
                  className="p-3 bg-[#080B13] border border-[#1B2234] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">
                      {inv.title} — {fmtUsd(inv.amountCents)}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 truncate">
                      {inv.invoiceId} • To: {inv.recipientEmail}
                    </div>
                  </div>
                  <a
                    href={inv.payerViewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost-brutal px-2.5 py-1 text-[11px] shrink-0"
                  >
                    View Invoice
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
