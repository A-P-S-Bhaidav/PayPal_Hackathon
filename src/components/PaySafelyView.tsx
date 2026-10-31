import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Wallet,
} from 'lucide-react';
import { apiFetch, fmtUsd, type WorkspaceState } from '../api';

interface PaySafelyViewProps {
  state: WorkspaceState;
  onRefresh: () => Promise<void>;
  externalScanTrigger?: number;
}

const SAMPLE_INVOICES = [
  {
    id: 'legit',
    label: 'Legitimate Studio Invoice ($45.00)',
    payee: 'billing@nordic-design.io',
    amountUsd: '45.00',
    text: 'Invoice #1048 from Nordic Design Studio for Q4 Brand Icon Pack delivery. Total due: $45.00 USD via standard PayPal Goods & Services.',
  },
  {
    id: 'scam',
    label: 'Suspicious Urgent Support Scam ($490.00)',
    payee: 'security-refund-desk@paypa1-helpdesk.xyz',
    amountUsd: '490.00',
    text: 'URGENT FINAL NOTICE: Your account has an unauthorized $490.00 charge! Send $490.00 via Friends and Family immediately to cancel or keep this secret!',
  },
  {
    id: 'eur',
    label: 'International Freelancer Note (EUR 120)',
    payee: 'studio@berlin-motion.de',
    amountUsd: '130.00',
    text: 'Hi team, attached is our EUR 120.00 milestone bill for motion graphics review. Thank you!',
  },
];

export const PaySafelyView: React.FC<PaySafelyViewProps> = ({ state, onRefresh }) => {
  const [rawText, setRawText] = useState(SAMPLE_INVOICES[0].text);
  const [payee, setPayee] = useState(SAMPLE_INVOICES[0].payee);
  const [amountUsd, setAmountUsd] = useState(SAMPLE_INVOICES[0].amountUsd);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [checkoutRes, setCheckoutRes] = useState<any>(null);
  const [busySubId, setBusySubId] = useState('');

  // Budget & Spending Rule controls
  const [spendItem, setSpendItem] = useState('4K Studio Monitor');
  const [spendUsd, setSpendUsd] = useState('420');
  const [budgetRes, setBudgetRes] = useState<any>(null);
  const [ruleSentence, setRuleSentence] = useState(
    'Allow purchases up to $250 automatically and cap any single purchase at $600'
  );
  const [ruleStatus, setRuleStatus] = useState('');

  const applySample = (s: (typeof SAMPLE_INVOICES)[number]) => {
    setRawText(s.text);
    setPayee(s.payee);
    setAmountUsd(s.amountUsd);
    setScanResult(null);
    setCheckoutRes(null);
  };

  const handleCheckSafety = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setScanning(true);
    setCheckoutRes(null);
    try {
      const cents = Math.max(100, Math.round(Number(amountUsd || '45') * 100));
      const res = await apiFetch('/api/scamshield/review', {
        method: 'POST',
        body: JSON.stringify({
          rawText,
          claimedAmountCents: cents,
          currency: 'USD',
          payeeIdentifier: payee,
          autoExtractCurrency: true,
        }),
      });
      setScanResult(res);
      await onRefresh();
    } finally {
      setScanning(false);
    }
  };

  const handlePayWithPayPal = async () => {
    if (!scanResult?.signedToken) return;
    setScanning(true);
    try {
      const res = await apiFetch('/api/scamshield/create-paypal-order', {
        method: 'POST',
        body: JSON.stringify({ signedToken: scanResult.signedToken }),
      });
      setCheckoutRes(res);
      await onRefresh();
    } finally {
      setScanning(false);
    }
  };

  const handleSubscriptionAction = async (
    agreementId: string,
    action: 'REVOKE' | 'TIGHTEN_CAP'
  ) => {
    setBusySubId(agreementId);
    try {
      await apiFetch('/api/lupa/revoke-zombie', {
        method: 'POST',
        body: JSON.stringify({ agreementId, action }),
      });
      await onRefresh();
    } finally {
      setBusySubId('');
    }
  };

  const handleBudgetCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/lupa/cashflow-check', {
      method: 'POST',
      body: JSON.stringify({
        itemTitle: spendItem,
        proposedSpendCents: Math.max(100, Math.round(Number(spendUsd || '100') * 100)),
        includeAiAdvice: true,
      }),
    });
    setBudgetRes(res);
    await onRefresh();
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setRuleStatus('Updating rule...');
    try {
      const permitId = state.lupa.agentPermits[0]?.permitId || 'perm_default';
      const res = await apiFetch('/api/lupa/compile-policy', {
        method: 'POST',
        body: JSON.stringify({ sentence: ruleSentence, applyToPermitId: permitId }),
      });
      if (res.updatedPermit) {
        setRuleStatus(
          `Saved: Auto-approve up to ${fmtUsd(res.updatedPermit.autoAllowMaxCents)}, single-order cap ${fmtUsd(res.updatedPermit.maxSingleTransactionCents)}.`
        );
      } else {
        setRuleStatus('Include exact dollar amounts in your rule so AegisPay never guesses.');
      }
      await onRefresh();
    } catch (err) {
      setRuleStatus((err as Error).message);
    }
  };

  const [agentSimNote, setAgentSimNote] = useState('');

  const handleResolveHold = async (orderId: string, action: 'CAPTURE' | 'VOID') => {
    await apiFetch('/api/lupa/resolve-hold', {
      method: 'POST',
      body: JSON.stringify({ orderId, action }),
    });
    setAgentSimNote(
      action === 'CAPTURE'
        ? `Approved & captured held PayPal order ${orderId}.`
        : `Declined & voided held PayPal authorization ${orderId}.`
    );
    await onRefresh();
  };

  const handleSimulateAgentPurchase = async (mode: 'AUTO' | 'HOLD') => {
    const permitId = state.lupa.agentPermits[0]?.permitId || 'perm_default';
    setAgentSimNote('Testing spending rule...');
    try {
      const res = await apiFetch('/api/lupa/agent-pay', {
        method: 'POST',
        body: JSON.stringify(
          mode === 'AUTO'
            ? {
                permitId,
                amountCents: 3200,
                merchantName: 'CloudFigma Pro Tools',
                category: 'SAAS_TOOLS',
                itemDescription: 'Monthly Team Seat ($32.00)',
                aiConfidenceScore: 0.95,
              }
            : {
                permitId,
                amountCents: 4500,
                merchantName: 'NordicLight Studio Hardware',
                category: 'HARDWARE',
                itemDescription: 'USB-C Key Light ($45.00 - Uncertain Match)',
                aiConfidenceScore: 0.72,
              }
        ),
      });
      setAgentSimNote(
        `Decision: ${res.evaluation.finalVerdict} (${res.paypalOrder?.orderId || 'No order'}).`
      );
      await onRefresh();
    } catch (err) {
      setAgentSimNote((err as Error).message);
    }
  };

  const handleCreateVaultSetupToken = async () => {
    setAgentSimNote('Minting PayPal Vault v3 Setup Token...');
    try {
      const res = await apiFetch('/api/lupa/vault/setup-token', {
        method: 'POST',
        body: JSON.stringify({
          agentName: 'Workspace Auto-Pay Rule',
          maxSingleCents: state.lupa.agentPermits[0]?.maxSingleTransactionCents || 5000,
        }),
      });
      setAgentSimNote(
        `Linked PayPal Vault v3 Setup Token: ${res.vaultToken?.setupTokenId || 'Created'}`
      );
      await onRefresh();
    } catch (err) {
      setAgentSimNote((err as Error).message);
    }
  };

  const heldOrders = state.orders.filter((o) => o.status === 'AUTHORIZED');

  return (
    <div className="space-y-6 animate-view-enter">
      {/* Top Symmetrical 2-Column Layout: Left = Invoice Checker, Right = Result & PayPal Checkout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 glass-brutal-panel corner-ticks p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E293B] pb-3">
            <div>
              <div className="text-xs font-mono uppercase text-[#CCFF00]">Step 1 • Before Paying</div>
              <h2 className="font-display text-xl font-bold text-white">
                Check an Invoice, Email, or Payment Request
              </h2>
            </div>
          </div>

          {/* 1-Click Sample Pills */}
          <div className="space-y-1.5">
            <div className="text-xs text-slate-400">Load a quick example:</div>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_INVOICES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => applySample(s)}
                  className="btn-ghost-brutal px-3 py-1.5 text-xs"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleCheckSafety} className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Recipient Email or Merchant
                </label>
                <input
                  type="text"
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  className="input-brutal"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Requested Amount (USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={amountUsd}
                  onChange={(e) => setAmountUsd(e.target.value)}
                  className="input-brutal"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Paste Invoice Message, Payment Note, or Link
              </label>
              <textarea
                rows={4}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                className="input-brutal"
                placeholder="Paste the message or invoice details sent to you..."
                required
              />
            </div>

            <button type="submit" disabled={scanning} className="btn-acid w-full py-3 text-sm">
              <ShieldCheck className="w-4 h-4" />
              {scanning ? 'Checking Payment Safety...' : 'Check Payment Safety'}
            </button>
          </form>
        </div>

        {/* Right 5 Columns: Plain-English Safety Result & PayPal Checkout */}
        <div className="lg:col-span-5 glass-brutal-panel p-6 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="border-b border-[#1E293B] pb-3">
              <div className="text-xs font-mono uppercase text-[#CCFF00]">
                Step 2 • Safety Decision
              </div>
              <h3 className="font-display text-xl font-bold text-white">
                Verification &amp; PayPal Checkout
              </h3>
            </div>

            {!scanResult ? (
              <div className="p-6 bg-[#070A12] border border-[#1B2234] text-center space-y-2 my-4">
                <Lock className="w-7 h-7 text-[#0047FF] mx-auto" />
                <div className="text-sm font-semibold text-white">
                  PayPal Checkout Stays Locked Until Checked
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Click &ldquo;Check Payment Safety&rdquo; on the left. If the request looks safe,
                  your verified PayPal checkout link unlocks right here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div
                  className={`p-4 border ${
                    scanResult.finalVerdict === 'ALLOW'
                      ? 'bg-emerald-950/30 border-[#CCFF00]'
                      : scanResult.finalVerdict === 'HOLD'
                        ? 'bg-amber-950/30 border-amber-400'
                        : 'bg-red-950/40 border-red-500'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display font-bold text-base text-white flex items-center gap-2">
                      {scanResult.finalVerdict === 'ALLOW' ? (
                        <>
                          <CheckCircle2 className="w-5 h-5 text-[#CCFF00]" />
                          Safe to Pay
                        </>
                      ) : scanResult.finalVerdict === 'HOLD' ? (
                        <>
                          <AlertTriangle className="w-5 h-5 text-amber-300" />
                          Double-Check Before Paying
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="w-5 h-5 text-red-400" />
                          Unsafe Request — Payment Blocked
                        </>
                      )}
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 bg-[#050507] text-slate-200 border border-[#1E293B]">
                      Risk {scanResult.combinedRiskScore}/100
                    </span>
                  </div>

                  <p className="text-xs text-slate-200 mt-2 leading-relaxed">
                    {scanResult.ai?.aiSummary}
                  </p>

                  {scanResult.extractedMetadata?.conversionNote && (
                    <div className="mt-2 text-[11px] font-mono text-[#CCFF00]">
                      {scanResult.extractedMetadata.conversionNote}
                    </div>
                  )}
                </div>

                {scanResult.deterministic?.matches?.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-slate-300">Warning Signs Found:</div>
                    {scanResult.deterministic.matches.map((m: any) => (
                      <div
                        key={m.ruleId}
                        className="p-2.5 bg-red-950/30 border border-red-500/40 text-xs text-red-200"
                      >
                        {m.description}
                      </div>
                    ))}
                  </div>
                )}

                {scanResult.paypalCheckoutUnlocked && (
                  <div className="space-y-3 pt-2">
                    <button
                      type="button"
                      onClick={handlePayWithPayPal}
                      disabled={scanning}
                      className="btn-cobalt w-full py-3 text-sm"
                    >
                      Proceed to PayPal Checkout ({fmtUsd(scanResult.signedToken.payload.amountCents)})
                    </button>

                    {checkoutRes?.approvalUrl && (
                      <div className="p-3.5 bg-[#091124] border border-[#0047FF] flex items-center justify-between gap-3">
                        <div className="text-xs">
                          <div className="font-semibold text-white">PayPal Order Ready</div>
                          <div className="font-mono text-[11px] text-slate-400">
                            Order ID: {checkoutRes.orderId}
                          </div>
                        </div>
                        <a
                          href={checkoutRes.approvalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-acid px-3.5 py-2 text-xs shrink-0"
                        >
                          Open PayPal
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="text-[11px] text-slate-400 border-t border-[#1E293B] pt-3">
            Amount and recipient are locked after safety verification so checkout details cannot be
            altered mid-payment.
          </div>
        </div>
      </div>

      {/* Symmetrical Bottom 2-Column Grid: Subscription Cleanup + Budget & Team Limits */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Recurring PayPal Subscriptions Cleanup */}
        <div className="glass-brutal-panel p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
            <div>
              <div className="text-xs font-mono uppercase text-[#CCFF00]">
                Subscription &amp; Autopay Cleanup
              </div>
              <h3 className="font-display text-lg font-bold text-white">
                Recurring PayPal Billing Permissions
              </h3>
            </div>
            <span className="text-xs font-mono text-[#CCFF00]">
              Save {fmtUsd(state.kpis.recoverableMonthlyCents)}/mo
            </span>
          </div>

          <div className="space-y-3">
            {state.lupa.billingPermissions.map((perm) => {
              const audit = state.lupa.zombieReport.audits.find(
                (a) => a.agreementId === perm.agreementId
              );
              return (
                <div
                  key={perm.agreementId}
                  className="p-3.5 bg-[#080B13] border border-[#1B2234] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{perm.merchantName}</span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 border ${
                          perm.status === 'REVOKED'
                            ? 'border-slate-600 text-slate-400'
                            : audit?.isZombie
                              ? 'border-amber-400/60 text-amber-300 bg-amber-950/30'
                              : 'border-emerald-500/40 text-emerald-300'
                        }`}
                      >
                        {perm.status === 'REVOKED'
                          ? 'CANCELED'
                          : audit?.isZombie
                            ? 'UNUSED / HIGH LIMIT'
                            : 'ACTIVE'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Avg {fmtUsd(perm.averageChargeCents)}/mo • Limit{' '}
                      {fmtUsd(perm.monthlyCapCents)}/mo
                    </div>
                    {audit?.reasons?.[0] && perm.status === 'ACTIVE' && (
                      <div className="text-[11px] text-amber-200/90">{audit.reasons[0]}</div>
                    )}
                  </div>

                  {perm.status === 'ACTIVE' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busySubId === perm.agreementId}
                        onClick={() => handleSubscriptionAction(perm.agreementId, 'TIGHTEN_CAP')}
                        className="btn-ghost-brutal px-2.5 py-1.5 text-xs"
                      >
                        Lower Limit
                      </button>
                      <button
                        type="button"
                        disabled={busySubId === perm.agreementId}
                        onClick={() => handleSubscriptionAction(perm.agreementId, 'REVOKE')}
                        className="btn-acid px-3 py-1.5 text-xs"
                      >
                        Cancel Autopay
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Monthly Budget Check & Spending Rules */}
        <div className="glass-brutal-panel p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-[#CCFF00]" />
              <h3 className="font-display text-lg font-bold text-white">
                Can I Afford This Purchase?
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-300">
              Balance: {fmtUsd(state.lupa.currentCheckingBalanceCents)}
            </span>
          </div>

          <form onSubmit={handleBudgetCheck} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <input
              type="text"
              value={spendItem}
              onChange={(e) => setSpendItem(e.target.value)}
              className="input-brutal sm:col-span-6"
              placeholder="Item name"
            />
            <input
              type="number"
              min="1"
              value={spendUsd}
              onChange={(e) => setSpendUsd(e.target.value)}
              className="input-brutal sm:col-span-3"
              placeholder="USD"
            />
            <button type="submit" className="btn-cobalt sm:col-span-3 py-2 text-xs">
              Check Budget
            </button>
          </form>

          {budgetRes?.result && (
            <div className="p-3.5 bg-[#080B13] border border-[#0047FF]/60 space-y-1.5 text-xs">
              <div className="font-semibold text-white">
                Result: {budgetRes.result.verdict === 'ALLOW' ? 'Fits Your Budget' : 'Exceeds Safe Free Cashflow'}
              </div>
              <p className="text-slate-300">{budgetRes.result.deterministicExplanation}</p>
            </div>
          )}

          <div className="border-t border-[#1E293B] pt-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#CCFF00]" />
                <span className="font-display font-bold text-sm text-white">
                  Set Plain-English Spending Limits
                </span>
              </div>
              {state.lupa.agentPermits[0] && (
                <span className="text-[11px] font-mono text-slate-400">
                  Auto: {fmtUsd(state.lupa.agentPermits[0].autoAllowMaxCents)} • Cap:{' '}
                  {fmtUsd(state.lupa.agentPermits[0].maxSingleTransactionCents)}
                </span>
              )}
            </div>
            <form onSubmit={handleSaveRule} className="space-y-2.5">
              <input
                type="text"
                value={ruleSentence}
                onChange={(e) => setRuleSentence(e.target.value)}
                className="input-brutal"
              />
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn-cobalt px-3.5 py-2 text-xs">
                  Save Spending Limit
                </button>
                <button
                  type="button"
                  onClick={() => handleSimulateAgentPurchase('AUTO')}
                  className="btn-ghost-brutal px-3 py-2 text-xs"
                >
                  Test $32 Auto-Pay
                </button>
                <button
                  type="button"
                  onClick={() => handleSimulateAgentPurchase('HOLD')}
                  className="btn-ghost-brutal px-3 py-2 text-xs"
                >
                  Test $45 Hold for Review
                </button>
                <button
                  type="button"
                  onClick={handleCreateVaultSetupToken}
                  className="btn-ghost-brutal px-3 py-2 text-xs"
                >
                  Link PayPal Vault
                </button>
              </div>
            </form>
            {ruleStatus && <div className="text-xs text-[#CCFF00] font-mono">{ruleStatus}</div>}
            {agentSimNote && <div className="text-xs text-slate-300 font-mono">{agentSimNote}</div>}
          </div>

          {heldOrders.length > 0 && (
            <div className="border-t border-[#1E293B] pt-4 space-y-2">
              <div className="text-xs font-mono uppercase text-amber-300">
                Purchases Waiting for Your Approval ({heldOrders.length})
              </div>
              {heldOrders.map((ho) => (
                <div
                  key={ho.orderId}
                  className="p-3 bg-[#080B13] border border-amber-400/50 flex items-center justify-between gap-2"
                >
                  <div className="text-xs">
                    <div className="font-semibold text-white">
                      {ho.merchantName} ({fmtUsd(ho.amountCents)})
                    </div>
                    <div className="text-slate-400 font-mono text-[11px]">{ho.orderId}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleResolveHold(ho.orderId, 'CAPTURE')}
                      className="btn-acid px-2.5 py-1 text-xs"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResolveHold(ho.orderId, 'VOID')}
                      className="btn-ghost-brutal px-2.5 py-1 text-xs"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
