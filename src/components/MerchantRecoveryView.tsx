import React, { useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  HeartHandshake,
  PackageCheck,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { apiFetch, fmtUsd, type WorkspaceState } from '../api';

interface MerchantRecoveryViewProps {
  state: WorkspaceState;
  onRefresh: () => Promise<void>;
}

const DEFECT_PRESETS = [
  {
    id: 'chipped_ceramic_mug',
    label: 'Minor Rim Chip on Stoneware Mug ($28.00)',
    title: 'Handcrafted Stoneware Espresso Mug',
    cents: 2800,
    note: 'Small cosmetic chip on the rim; mug still holds liquid fine.',
  },
  {
    id: 'scratched_alu_stand',
    label: 'Surface Scratch on Laptop Stand ($78.00)',
    title: 'Anodized Aluminum Desk Stand',
    cents: 7800,
    note: 'Visible scratch along the side panel from transit packaging.',
  },
  {
    id: 'shattered_glass_lamp',
    label: 'Shattered Glass Lamp ($120.00)',
    title: 'Blown-Glass Pendant Lamp',
    cents: 12000,
    note: 'Glass shade arrived completely shattered and unusable.',
  },
];

export const MerchantRecoveryView: React.FC<MerchantRecoveryViewProps> = ({ state, onRefresh }) => {
  // 1. Failed Payment Recovery state
  const presets = state.payrevive.presets || [];
  const [selectedPresetId, setSelectedPresetId] = useState(presets[0]?.presetId || 'PAYDAY_LIQUIDITY');
  const [recovering, setRecovering] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState<any>(null);
  const [settlementNote, setSettlementNote] = useState('');

  // 2. Instant Partial Refund state
  const [defectPreset, setDefectPreset] = useState(DEFECT_PRESETS[0]);
  const [uploadedPhotoBase64, setUploadedPhotoBase64] = useState<string | undefined>(undefined);
  const [uploadedPhotoMime, setUploadedPhotoMime] = useState<string | undefined>(undefined);
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundResult, setRefundResult] = useState<any>(null);

  // 3. Cancel-Flow Subscriber Saver state
  const [customerName, setCustomerName] = useState('Jordan Vance');
  const [planUsd, setPlanUsd] = useState('99');
  const [usagePct, setUsagePct] = useState(32);
  const [cancelStep, setCancelStep] = useState(1);
  const [cancelMsg, setCancelMsg] = useState(
    'Our budget tightened this month and $99/mo feels steep—thinking about canceling.'
  );
  const [retentionLoading, setRetentionLoading] = useState(false);
  const [retentionResult, setRetentionResult] = useState<any>(null);

  const handleFindRecovery = async () => {
    setRecovering(true);
    setSettlementNote('');
    try {
      const res = await apiFetch('/api/payrevive/recover', {
        method: 'POST',
        body: JSON.stringify({ presetId: selectedPresetId, executeLivePayPal: true }),
      });
      setRecoveryResult(res);
      await onRefresh();
    } finally {
      setRecovering(false);
    }
  };

  const handleConfirmSettlement = async (settled: boolean) => {
    const decisionId = recoveryResult?.decision?.decisionId;
    if (!decisionId) return;
    await apiFetch('/api/payrevive/confirm-settlement', {
      method: 'POST',
      body: JSON.stringify({ decisionId, settled }),
    });
    setSettlementNote(
      settled
        ? 'Payment marked as paid—future recommendations updated.'
        : 'Marked unpaid—recovery preferences updated.'
    );
    await onRefresh();
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const str = String(reader.result || '');
      const comma = str.indexOf(',');
      if (comma > -1) {
        setUploadedPhotoBase64(str.slice(comma + 1));
        setUploadedPhotoMime(file.type || 'image/jpeg');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleIssuePartialRefund = async () => {
    setRefundLoading(true);
    try {
      const res = await apiFetch('/api/cliprefund/evaluate-and-refund', {
        method: 'POST',
        body: JSON.stringify({
          presetId: defectPreset.id,
          itemTitle: defectPreset.title,
          originalOrderCents: defectPreset.cents,
          customerNote: defectPreset.note,
          imageBase64: uploadedPhotoBase64,
          imageMimeType: uploadedPhotoMime,
        }),
      });
      setRefundResult(res);
      await onRefresh();
    } finally {
      setRefundLoading(false);
    }
  };

  const handleRetentionCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setRetentionLoading(true);
    try {
      const res = await apiFetch('/api/churnrescue/intercept', {
        method: 'POST',
        body: JSON.stringify({
          customerName,
          planName: 'Pro Business Subscription',
          currentPlanPriceCents: Math.max(1000, Math.round(Number(planUsd || '99') * 100)),
          featureUtilizationPct: usagePct,
          negotiationStep: cancelStep,
          customerMessage: cancelMsg,
          createDiscountedSubscription: true,
        }),
      });
      setRetentionResult(res);
      await onRefresh();
    } finally {
      setRetentionLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-view-enter">
      {/* Section 1: Failed Customer Payment Recovery */}
      <div className="glass-brutal-panel corner-ticks p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1E293B] pb-4">
          <div>
            <div className="text-xs font-mono uppercase text-[#CCFF00]">
              Declined Checkout Recovery
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
              Recover Failed Customer Payments
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
              Select a declined order to see why it failed, check compliance rules, and send a
              PayPal recovery option only when it makes financial sense.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 5 Columns: Order Selector */}
          <div className="lg:col-span-5 space-y-3">
            <label className="block text-xs font-medium text-slate-300">
              Choose a Declined Customer Order
            </label>
            <div className="space-y-2">
              {presets.map((p) => {
                const active = p.presetId === selectedPresetId;
                return (
                  <button
                    key={p.presetId}
                    type="button"
                    onClick={() => {
                      setSelectedPresetId(p.presetId);
                      setRecoveryResult(null);
                      setSettlementNote('');
                    }}
                    className={`w-full text-left p-3.5 border transition-colors ${
                      active
                        ? 'bg-[#0047FF]/20 border-[#CCFF00] text-white'
                        : 'bg-[#080B13] border-[#1B2234] text-slate-300 hover:border-[#0047FF]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs sm:text-sm font-semibold">{p.title}</span>
                      <span className="text-xs font-mono text-[#CCFF00]">
                        {fmtUsd(p.event.amountCents)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">{p.subtitle}</p>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleFindRecovery}
              disabled={recovering}
              className="btn-acid w-full py-3 text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${recovering ? 'animate-spin' : ''}`} />
              {recovering ? 'Analyzing Declined Payment...' : 'Find Best Recovery Step'}
            </button>
          </div>

          {/* Right 7 Columns: Plain-English Outcome & PayPal Action */}
          <div className="lg:col-span-7 bg-[#070A12] border border-[#1B2234] p-5 space-y-4 min-h-[260px]">
            {!recoveryResult ? (
              <div className="py-12 text-center space-y-2">
                <RefreshCw className="w-7 h-7 text-[#0047FF] mx-auto" />
                <div className="text-sm font-semibold text-white">
                  Select a declined order and click &ldquo;Find Best Recovery Step&rdquo;
                </div>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  AegisPay checks card rules, customer communication preferences, and retry fees
                  before taking any action on PayPal.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div
                  className={`p-4 border ${
                    recoveryResult.decision.verdict === 'EXECUTE_RECOVERY'
                      ? 'bg-emerald-950/30 border-[#CCFF00]'
                      : recoveryResult.decision.verdict === 'BLOCKED_BY_COMPLIANCE'
                        ? 'bg-red-950/40 border-red-500'
                        : 'bg-slate-900 border-slate-600'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-display font-bold text-base text-white flex items-center gap-2">
                      {recoveryResult.decision.verdict === 'EXECUTE_RECOVERY' ? (
                        <>
                          <CheckCircle2 className="w-5 h-5 text-[#CCFF00]" />
                          Recovery Action Sent: {recoveryResult.decision.selectedArmDetails.actionLabel}
                        </>
                      ) : recoveryResult.decision.verdict === 'BLOCKED_BY_COMPLIANCE' ? (
                        <>
                          <ShieldAlert className="w-5 h-5 text-red-400" />
                          Do Not Retry — Blocked by Safety &amp; Compliance Rules
                        </>
                      ) : (
                        'Skipped Retry — Expected Return Is Below Retry Fee'
                      )}
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 bg-[#050507] text-[#CCFF00] border border-[#1E293B]">
                      Expected Net:{' '}
                      {fmtUsd(Math.max(0, recoveryResult.decision.selectedArmDetails.expectedNetGainCents))}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-200 mt-2.5 leading-relaxed">
                    <strong>Why it failed:</strong> {recoveryResult.decision.plainEnglishCause}
                  </p>
                  <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed">
                    <strong>Recommended next step:</strong>{' '}
                    {recoveryResult.decision.plainEnglishRecommendation}
                  </p>
                </div>

                {(recoveryResult.paypalInvoice || recoveryResult.paypalOrder) && (
                  <div className="p-3.5 bg-[#0A1224] border border-[#0047FF] flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs">
                      <div className="font-semibold text-white">
                        {recoveryResult.paypalInvoice
                          ? `PayPal Recovery Invoice Sent (${recoveryResult.paypalInvoice.invoiceId})`
                          : `PayPal Retry Order Ready (${recoveryResult.paypalOrder.orderId})`}
                      </div>
                      <div className="text-slate-400 mt-0.5">
                        Share or inspect directly in PayPal
                      </div>
                    </div>
                    <a
                      href={
                        recoveryResult.paypalInvoice
                          ? recoveryResult.paypalInvoice.payerViewUrl
                          : recoveryResult.paypalOrder.approvalUrl
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="btn-acid px-3.5 py-2 text-xs"
                    >
                      Open in PayPal
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}

                {recoveryResult.decision.verdict === 'EXECUTE_RECOVERY' && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#1E293B] text-xs">
                    <span className="text-slate-400">Did the customer complete this payment?</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleConfirmSettlement(true)}
                        className="btn-ghost-brutal px-3 py-1 text-xs"
                      >
                        Mark Paid
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfirmSettlement(false)}
                        className="btn-ghost-brutal px-3 py-1 text-xs"
                      >
                        Still Unpaid
                      </button>
                    </div>
                  </div>
                )}

                {settlementNote && (
                  <div className="text-xs font-mono text-[#CCFF00]">{settlementNote}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Symmetrical Bottom 2-Column Grid: Instant Partial Refunds + Subscriber Cancel-Flow Saver */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Keep-the-Item Instant Partial Refund */}
        <div className="glass-brutal-panel p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
            <div className="flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-[#CCFF00]" />
              <div>
                <h3 className="font-display text-lg font-bold text-white">
                  Instant Partial Refunds (Keep-the-Item)
                </h3>
                <p className="text-xs text-slate-400">
                  Save return shipping fees when an item arrives with minor cosmetic wear.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">
              Select a Customer Damage Claim (or upload a photo)
            </label>
            <div className="space-y-2">
              {DEFECT_PRESETS.map((dp) => (
                <button
                  key={dp.id}
                  type="button"
                  onClick={() => {
                    setDefectPreset(dp);
                    setRefundResult(null);
                  }}
                  className={`w-full text-left p-3 border text-xs ${
                    defectPreset.id === dp.id
                      ? 'bg-[#0047FF]/20 border-[#CCFF00] text-white'
                      : 'bg-[#080B13] border-[#1B2234] text-slate-300'
                  }`}
                >
                  <div className="font-semibold">{dp.label}</div>
                  <div className="text-slate-400 mt-0.5">{dp.note}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Optional: Upload customer item photo
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:border-0 file:bg-[#0047FF] file:text-white file:font-semibold"
            />
          </div>

          <button
            type="button"
            onClick={handleIssuePartialRefund}
            disabled={refundLoading}
            className="btn-cobalt w-full py-2.5 text-xs sm:text-sm"
          >
            {refundLoading ? 'Calculating Fair Refund...' : 'Calculate & Issue Partial Refund'}
          </button>

          {refundResult?.calculation && (
            <div className="p-4 bg-[#080B13] border border-[#CCFF00]/60 space-y-2 text-xs">
              <div className="flex items-center justify-between font-semibold text-white">
                <span>
                  {refundResult.calculation.approved
                    ? `Approved ${refundResult.calculation.appliedPercentage}% Refund (${fmtUsd(refundResult.calculation.refundCents)})`
                    : 'Claim Declined'}
                </span>
                {refundResult.calculation.merchantNetSavedCents > 0 && (
                  <span className="text-[#CCFF00] font-mono">
                    Saved {fmtUsd(refundResult.calculation.merchantNetSavedCents)} vs. Return
                  </span>
                )}
              </div>
              <p className="text-slate-300 leading-relaxed">
                {refundResult.calculation.explanation}
              </p>
            </div>
          )}
        </div>

        {/* Right: Subscriber Cancel-Flow Retention */}
        <div className="glass-brutal-panel p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
            <div className="flex items-center gap-2">
              <HeartHandshake className="w-5 h-5 text-[#CCFF00]" />
              <div>
                <h3 className="font-display text-lg font-bold text-white">
                  Subscriber Cancel-Flow Saver
                </h3>
                <p className="text-xs text-slate-400">
                  Offer fair loyalty discounts—or automatically hand off legal disputes to support.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleRetentionCheck} className="space-y-3">
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Subscriber</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="input-brutal"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Plan ($/mo)</label>
                <input
                  type="number"
                  min="10"
                  value={planUsd}
                  onChange={(e) => setPlanUsd(e.target.value)}
                  className="input-brutal"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Offer Step (1-3)</label>
                <select
                  value={cancelStep}
                  onChange={(e) => setCancelStep(Number(e.target.value))}
                  className="input-brutal"
                >
                  <option value={1}>Step 1 (20% Off)</option>
                  <option value={2}>Step 2 (35% Off)</option>
                  <option value={3}>Step 3 (50% Max)</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1">
                <span>Monthly Product Usage</span>
                <span className="font-mono text-[#CCFF00]">{usagePct}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={usagePct}
                onChange={(e) => setUsagePct(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Customer Cancellation Note</label>
              <textarea
                rows={2}
                value={cancelMsg}
                onChange={(e) => setCancelMsg(e.target.value)}
                className="input-brutal"
              />
            </div>

            <button
              type="submit"
              disabled={retentionLoading}
              className="btn-acid w-full py-2.5 text-xs sm:text-sm"
            >
              {retentionLoading ? 'Preparing Offer...' : 'Generate Retention Offer'}
            </button>
          </form>

          {retentionResult?.decision && (
            <div className="p-4 bg-[#080B13] border border-[#0047FF] space-y-2 text-xs">
              <div className="font-semibold text-white">
                {retentionResult.decision.circuitBreakerTripped
                  ? 'Paused Automated Discount — Routed to Human Support'
                  : retentionResult.decision.utilizationGuardrailBlocked
                    ? 'Heavy Account Usage — Offered Flexible Billing Date (0% Discount)'
                    : `Loyalty Rate Ready: ${retentionResult.decision.approvedDiscountPct}% Off (${fmtUsd(retentionResult.decision.finalOfferPriceCents)}/mo)`}
              </div>
              <p className="text-slate-300 leading-relaxed">{retentionResult.agentReply}</p>
              {retentionResult.paypalSubscription?.approvalUrl && (
                <a
                  href={retentionResult.paypalSubscription.approvalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[#CCFF00] font-semibold underline pt-1"
                >
                  Open Updated PayPal Subscription
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
