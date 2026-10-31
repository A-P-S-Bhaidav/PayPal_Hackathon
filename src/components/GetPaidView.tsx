import React, { useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  Handshake,
  Send,
  Users,
} from 'lucide-react';
import { apiFetch, fmtUsd, type WorkspaceState } from '../api';

interface GetPaidViewProps {
  state: WorkspaceState;
  onRefresh: () => Promise<void>;
}

export const GetPaidView: React.FC<GetPaidViewProps> = ({ state, onRefresh }) => {
  // Milestone Invoicing state
  const [projectTitle, setProjectTitle] = useState('E-Commerce Storefront & PayPal Redesign');
  const [clientEmail, setClientEmail] = useState('client-accounts@personal.example.com');
  const [budgetUsd, setBudgetUsd] = useState('2450');
  const [leadShare, setLeadShare] = useState(70);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [issuingMilestoneId, setIssuingMilestoneId] = useState('');
  const [proofLink, setProofLink] = useState(
    'https://github.com/example/storefront/releases/tag/v1.0 — System architecture & UI approved'
  );
  const [proofFeedback, setProofFeedback] = useState('');

  // Vendor Deal Assistant state
  const [dealTitle, setDealTitle] = useState('Annual Cloud Security Review');
  const [targetUsd, setTargetUsd] = useState('620');
  const [maxUsd, setMaxUsd] = useState('820');
  const [vendorAskUsd, setVendorAskUsd] = useState('980');
  const [vendorFloorUsd, setVendorFloorUsd] = useState('640');
  const [negotiating, setNegotiating] = useState(false);
  const [dealResult, setDealResult] = useState<any>(null);

  const activePlan = state.paystream.plans[0] || null;

  const handleCreateMilestonePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingPlan(true);
    setProofFeedback('');
    try {
      const safeLead = Math.max(10, Math.min(90, leadShare));
      await apiFetch('/api/paystream/create-plan', {
        method: 'POST',
        body: JSON.stringify({
          projectTitle,
          clientEmail,
          totalBudgetCents: Math.max(1000, Math.round(Number(budgetUsd || '2450') * 100)),
          collaborators: [
            {
              collaboratorName: 'Lead Developer',
              paypalEmail: 'lead-dev-sbx@personal.example.com',
              role: 'Engineering',
              sharePct: safeLead,
            },
            {
              collaboratorName: 'Product Designer',
              paypalEmail: 'designer-sbx@personal.example.com',
              role: 'Design',
              sharePct: 100 - safeLead,
            },
          ],
        }),
      });
      await onRefresh();
    } finally {
      setCreatingPlan(false);
    }
  };

  const handleSendInvoice = async (planId: string, milestoneId: string) => {
    setIssuingMilestoneId(milestoneId);
    try {
      await apiFetch('/api/paystream/issue-invoice', {
        method: 'POST',
        body: JSON.stringify({ planId, milestoneId }),
      });
      await onRefresh();
    } finally {
      setIssuingMilestoneId('');
    }
  };

  const handleVerifyDeliverable = async (planId: string, milestoneId: string) => {
    setProofFeedback('Checking delivery link...');
    try {
      const res = await apiFetch('/api/paystream/verify-proof', {
        method: 'POST',
        body: JSON.stringify({
          planId,
          milestoneId,
          evidenceText: proofLink,
        }),
      });
      setProofFeedback(res.verification?.explanation || 'Deliverable reviewed.');
      await onRefresh();
    } catch (err) {
      setProofFeedback((err as Error).message);
    }
  };

  const handleRunDealAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    setNegotiating(true);
    try {
      const res = await apiFetch('/api/dealforge/negotiate', {
        method: 'POST',
        body: JSON.stringify({
          buyerMandate: {
            buyerName: state.operator?.organization || 'Buyer Team',
            itemTitle: dealTitle,
            targetPriceCents: Math.round(Number(targetUsd || '620') * 100),
            maxPriceCents: Math.round(Number(maxUsd || '820') * 100),
            maxDeliveryDays: 7,
            minRevisions: 2,
            maxUpfrontDepositPct: 40,
          },
          sellerMandate: {
            sellerName: 'Verified Service Partner',
            listPriceCents: Math.round(Number(vendorAskUsd || '980') * 100),
            minPriceCents: Math.round(Number(vendorFloorUsd || '640') * 100),
            fastestDeliveryDays: 4,
            maxRevisionsAllowed: 3,
            minUpfrontDepositPct: 25,
          },
          issueLiveInvoice: true,
          buyerEmail: clientEmail,
        }),
      });
      setDealResult(res);
      await onRefresh();
    } finally {
      setNegotiating(false);
    }
  };

  return (
    <div className="space-y-6 animate-view-enter">
      {/* Top Symmetrical 2-Column Milestone Planner & Live PayPal Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 glass-brutal-panel corner-ticks p-6 space-y-4">
          <div className="border-b border-[#1E293B] pb-3">
            <div className="text-xs font-mono uppercase text-[#CCFF00]">
              Client Projects &amp; Agencies
            </div>
            <h2 className="font-display text-xl font-bold text-white">
              Create Milestone Invoices &amp; Team Splits
            </h2>
          </div>

          <form onSubmit={handleCreateMilestonePlan} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Project Title</label>
              <input
                type="text"
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                className="input-brutal"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Client Billing Email
                </label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  className="input-brutal"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Total Project Budget (USD)
                </label>
                <input
                  type="number"
                  min="50"
                  step="0.01"
                  value={budgetUsd}
                  onChange={(e) => setBudgetUsd(e.target.value)}
                  className="input-brutal"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                <span className="inline-flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-[#CCFF00]" />
                  Team Revenue Split
                </span>
                <span className="font-mono text-[#CCFF00]">
                  Lead {leadShare}% / Designer {100 - leadShare}%
                </span>
              </div>
              <input
                type="range"
                min={20}
                max={80}
                value={leadShare}
                onChange={(e) => setLeadShare(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <button
              type="submit"
              disabled={creatingPlan}
              className="btn-acid w-full py-3 text-sm"
            >
              <FileText className="w-4 h-4" />
              {creatingPlan ? 'Building Schedule...' : 'Create Milestone Schedule'}
            </button>
          </form>
        </div>

        {/* Right 7 Columns: Active Milestone Phases + Send PayPal Invoice */}
        <div className="lg:col-span-7 glass-brutal-panel p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E293B] pb-3">
            <div>
              <div className="text-xs font-mono uppercase text-[#CCFF00]">
                Active Project Schedule
              </div>
              <h3 className="font-display text-xl font-bold text-white">
                {activePlan ? activePlan.projectTitle : 'No Milestone Schedule Yet'}
              </h3>
            </div>
            {activePlan && (
              <span className="text-xs font-mono px-2.5 py-1 bg-[#080B13] border border-[#CCFF00]/50 text-[#CCFF00]">
                Total: {fmtUsd(activePlan.totalBudgetCents)} (Exact to the Cent)
              </span>
            )}
          </div>

          {!activePlan ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Click &ldquo;Create Milestone Schedule&rdquo; on the left to split your project into
              PayPal invoices.
            </div>
          ) : (
            <div className="space-y-3">
              {activePlan.milestones.map((m) => (
                <div
                  key={m.milestoneId}
                  className="p-4 bg-[#080B13] border border-[#1B2234] space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-white">{m.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Due in {m.dueInDays} days •{' '}
                        {m.collaboratorSplits
                          .map((c) => `${c.collaboratorName}: ${fmtUsd(c.payoutCents)}`)
                          .join(' + ')}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display font-bold text-lg text-[#CCFF00] tabular-nums">
                        {fmtUsd(m.amountCents)}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">{m.status}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#161E2E]">
                    <button
                      type="button"
                      disabled={issuingMilestoneId === m.milestoneId}
                      onClick={() => handleSendInvoice(activePlan.planId, m.milestoneId)}
                      className="btn-cobalt px-3.5 py-1.5 text-xs"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {issuingMilestoneId === m.milestoneId
                        ? 'Sending...'
                        : m.paypalInvoiceId
                          ? 'Resend PayPal Invoice'
                          : 'Send PayPal Invoice'}
                    </button>

                    {m.paypalInvoiceUrl && (
                      <a
                        href={m.paypalInvoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-acid px-3 py-1.5 text-xs"
                      >
                        View PayPal Invoice
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => handleVerifyDeliverable(activePlan.planId, m.milestoneId)}
                      className="btn-ghost-brutal px-3 py-1.5 text-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Verify Delivery Link
                    </button>
                  </div>
                </div>
              ))}

              <div className="pt-2 space-y-1.5">
                <label className="block text-xs text-slate-400">
                  Delivery link or completion summary (used when clicking Verify Delivery Link):
                </label>
                <input
                  type="text"
                  value={proofLink}
                  onChange={(e) => setProofLink(e.target.value)}
                  className="input-brutal"
                />
                {proofFeedback && (
                  <div className="text-xs font-mono text-[#CCFF00] pt-1">{proofFeedback}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Section: Automated Vendor Deal & Deposit Agreement */}
      <div className="glass-brutal-panel p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-[#1E293B] pb-3">
          <Handshake className="w-5 h-5 text-[#CCFF00]" />
          <div>
            <h3 className="font-display text-lg font-bold text-white">
              Vendor Quote &amp; Deposit Agreement Assistant
            </h3>
            <p className="text-xs text-slate-400">
              Set your target budget and maximum cap—AegisPay finds a fair middle ground with the
              vendor and generates the deposit PayPal invoice.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleRunDealAssistant}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
        >
          <div className="lg:col-span-2">
            <label className="block text-xs text-slate-300 mb-1">Service or Scope</label>
            <input
              type="text"
              value={dealTitle}
              onChange={(e) => setDealTitle(e.target.value)}
              className="input-brutal"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">Your Target ($)</label>
            <input
              type="number"
              value={targetUsd}
              onChange={(e) => setTargetUsd(e.target.value)}
              className="input-brutal"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">Your Max Cap ($)</label>
            <input
              type="number"
              value={maxUsd}
              onChange={(e) => setMaxUsd(e.target.value)}
              className="input-brutal"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">Vendor Quote ($)</label>
            <input
              type="number"
              value={vendorAskUsd}
              onChange={(e) => setVendorAskUsd(e.target.value)}
              className="input-brutal"
            />
          </div>
          <button type="submit" disabled={negotiating} className="btn-cobalt py-2.5 text-xs">
            {negotiating ? 'Matching Terms...' : 'Agree & Send Deposit'}
          </button>
        </form>

        {dealResult && (
          <div className="p-4 bg-[#080B13] border border-[#0047FF] flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
            {dealResult.dealReached ? (
              <>
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-white">
                    Agreed at {fmtUsd(dealResult.contract.agreedTerms.priceCents)} (Saved{' '}
                    {fmtUsd(dealResult.contract.buyerSavedCents)} off vendor quote)
                  </div>
                  <div className="text-slate-300">
                    Upfront PayPal Deposit ({dealResult.contract.agreedTerms.upfrontDepositPct}%):{' '}
                    <strong>{fmtUsd(dealResult.contract.upfrontDepositCents)}</strong> • Remaining
                    on completion: {fmtUsd(dealResult.contract.escrowCompletionCents)}
                  </div>
                </div>
                {(dealResult.paypalInvoice?.payerViewUrl ||
                  dealResult.paypalOrder?.approvalUrl) && (
                  <a
                    href={
                      dealResult.paypalInvoice?.payerViewUrl || dealResult.paypalOrder?.approvalUrl
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="btn-acid px-3.5 py-2 text-xs shrink-0"
                  >
                    Open Deposit in PayPal
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </>
            ) : (
              <div className="text-amber-300">{dealResult.reason}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
