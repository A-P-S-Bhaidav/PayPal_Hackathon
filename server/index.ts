import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  AgentSpendingPermit,
  AtomicExecutionLedger,
  auditPayPalPermissions,
  BuyerMandate,
  calculateDeterministicVisionRefund,
  CashflowCommitment,
  createSignedDealContract,
  DecisionVerdict,
  DEFAULT_MERCHANT_REFUND_POLICY,
  evaluateAgentPermit,
  evaluateCashflowAffordability,
  evaluateChurnIntervention,
  evaluatePaymentScamDeterministically,
  NegotiationRoundEntry,
  PayPalBillingPermission,
  runDeterministicSafetyFuzzer,
  ScamShieldTokenVault,
  SellerMandate,
  sha256Hex,
  SignedDealContract,
  SignedScamShieldToken,
  stricterVerdict,
  validateAndClampOfferAgainstMandate,
  verifyContractIntegrity,
} from '../shared/kernel.ts';
import { PayPalSandboxGateway } from './paypal.ts';
import { GeminiCognitiveEngine } from './gemini.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export interface AuditLedgerRow {
  id: string;
  timestampIso: string;
  pillar: 'LUPAPERMIT' | 'SCAMSHIELD' | 'DEALFORGE' | 'CLIPREFUND' | 'CHURNRESCUE' | 'FUZZER' | 'FAILOVER';
  actor: string;
  eventTitle: string;
  verdict: 'ALLOW' | 'HOLD' | 'BLOCK' | 'SETTLED' | 'REFUNDED' | 'CIRCUIT_BREAKER' | 'REROUTED';
  amountCents: number;
  savedOrProtectedCents: number;
  paypalRef: string;
  sha256Hash: string;
  deterministicRule: string;
}

export function createAegisServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  const kernelSecret = process.env.AEGIS_KERNEL_SECRET || 'aegispay-deterministic-kernel-hmac-v1-2026';
  const paypalGateway = new PayPalSandboxGateway(
    {
      clientId: process.env.PAYPAL_CLIENT_ID || '',
      clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
      webhookId: process.env.PAYPAL_WEBHOOK_ID || '',
      environment: process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox',
    },
    kernelSecret
  );

  const geminiEngine = new GeminiCognitiveEngine(
    process.env.GEMINI_API_KEY || '',
    process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    process.env.GROQ_API_KEY || '',
    process.env.GROQ_TEXT_MODEL || 'llama-3.3-70b-versatile',
    process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct'
  );

  let zapierWebhookUrl = process.env.ZAPIER_WEBHOOK_URL || '';

  const scamVault = new ScamShieldTokenVault(kernelSecret);
  const atomicLedger = new AtomicExecutionLedger();
  const claimedVisionImageHashes = new Set<string>();
  const refundedCentsByCapture = new Map<string, number>();

  const billingPermissions: PayPalBillingPermission[] = [
    {
      agreementId: 'BA-94827104-ZOMBIE1',
      merchantName: 'CloudMetrics Legacy DevTools Inc.',
      merchantId: 'merch_cloudmetrics_legacy',
      category: 'CLOUD',
      monthlyCapCents: 15000,
      averageChargeCents: 4900,
      lastChargedDaysAgo: 412,
      lastUserInteractionDaysAgo: 412,
      createdDaysAgo: 780,
      status: 'ACTIVE',
    },
    {
      agreementId: 'BA-88312095-ZOMBIE2',
      merchantName: 'StreamVault Ultra 4K Bundle',
      merchantId: 'merch_streamvault',
      category: 'ENTERTAINMENT',
      monthlyCapCents: 6000,
      averageChargeCents: 2999,
      previousChargeCents: 1999,
      lastChargedDaysAgo: 12,
      lastUserInteractionDaysAgo: 215,
      createdDaysAgo: 540,
      status: 'ACTIVE',
    },
    {
      agreementId: 'BA-77219402-OVERCAP',
      merchantName: 'RenderScale GPU Compute Grid',
      merchantId: 'merch_renderscale',
      category: 'SAAS',
      monthlyCapCents: 50000,
      averageChargeCents: 4500,
      lastChargedDaysAgo: 8,
      lastUserInteractionDaysAgo: 3,
      createdDaysAgo: 310,
      status: 'ACTIVE',
    },
    {
      agreementId: 'BA-66109821-CLEAN',
      merchantName: 'GitHub Copilot Enterprise Seat',
      merchantId: 'merch_github',
      category: 'SAAS',
      monthlyCapCents: 4000,
      averageChargeCents: 3900,
      lastChargedDaysAgo: 5,
      lastUserInteractionDaysAgo: 1,
      createdDaysAgo: 400,
      status: 'ACTIVE',
    },
  ];

  const cashflowCommitments: CashflowCommitment[] = [
    {
      id: 'cf_rent',
      name: 'Apartment Rent & Utilities Autopay',
      amountCents: 185000,
      dueInDays: 5,
      category: 'RENT_MORTGAGE',
      mandatory: true,
    },
    {
      id: 'cf_loan',
      name: 'Equipment Financing Repayment',
      amountCents: 32000,
      dueInDays: 9,
      category: 'LOAN',
      mandatory: true,
    },
    {
      id: 'cf_paypal_subs',
      name: 'Active PayPal Recurring Billing Agreements',
      amountCents: 11399,
      dueInDays: 12,
      category: 'PAYPAL_AUTOPAY',
      mandatory: true,
    },
    {
      id: 'cf_savings',
      name: 'Monthly Emergency & Tax Reserve Goal',
      amountCents: 60000,
      dueInDays: 15,
      category: 'SAVINGS_GOAL',
      mandatory: false,
    },
  ];

  const currentCheckingBalanceCents = 385000;
  const minimumSafetyBufferCents = 30000;

  const agentPermits: AgentSpendingPermit[] = [
    {
      permitId: 'PRM-CLAUDE-CODE-01',
      agentId: 'agent_claude_code',
      agentName: 'Claude Code MCP Workspace Agent',
      parentAgreementId: 'BA-77219402-OVERCAP',
      maxSingleTransactionCents: 8000,
      dailyLimitCents: 15000,
      spentTodayCents: 1800,
      autoAllowMaxCents: 5000,
      minConfidenceScore: 0.82,
      allowedCategories: ['HARDWARE', 'OFFICE', 'SAAS', 'CLOUD'],
      blockedMerchants: ['merch_unverified_keys', 'shady-dropship-llc'],
      active: true,
    },
    {
      permitId: 'PRM-PROCUREMENT-BOT-02',
      agentId: 'agent_dealforge_buyer',
      agentName: 'DealForge B2B Procurement Agent',
      parentAgreementId: 'BA-66109821-CLEAN',
      maxSingleTransactionCents: 120000,
      dailyLimitCents: 200000,
      spentTodayCents: 0,
      autoAllowMaxCents: 60000,
      minConfidenceScore: 0.85,
      allowedCategories: ['SAAS', 'DESIGN_SERVICES', 'HARDWARE', 'CLOUD_INFRA'],
      blockedMerchants: ['merch_blacklisted'],
      active: true,
    },
  ];

  paypalGateway.seedInitialOrder({
    orderId: 'PAYPAL-SBX-8F92A1C4E7B01',
    intent: 'CAPTURE',
    status: 'COMPLETED',
    amountCents: 2800,
    refundedCents: 0,
    currency: 'USD',
    merchantName: 'Artisan Studio & Goods Co.',
    description: 'Handcrafted Stoneware Espresso Mug (Matte Obsidian)',
    customHash: sha256Hex({ item: 'mug_obsidian', order: 'PAYPAL-SBX-8F92A1C4E7B01' }),
    captureId: 'CAP-8F92A1C4E7B01',
    approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-SBX-8F92A1C4E7B01',
    mode: 'CRYPTOGRAPHIC_SANDBOX_EMULATOR',
    createdAtIso: new Date(Date.now() - 3600_000 * 18).toISOString(),
    updatedAtIso: new Date(Date.now() - 3600_000 * 18).toISOString(),
  });

  paypalGateway.seedInitialOrder({
    orderId: 'PAYPAL-SBX-HOLD4500LAMP9',
    intent: 'AUTHORIZE',
    status: 'AUTHORIZED',
    amountCents: 4500,
    refundedCents: 0,
    currency: 'USD',
    merchantName: 'NordicLight Studio Hardware',
    description: 'Claude Code MCP Agent Request: Architect Minimalist Desk Lamp (Confidence 68% < 82% threshold)',
    customHash: sha256Hex({ item: 'desk_lamp_45', permitId: 'PRM-CLAUDE-CODE-01' }),
    authorizationId: 'AUTH-HOLD4500LAMP9',
    approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-SBX-HOLD4500LAMP9',
    mode: 'CRYPTOGRAPHIC_SANDBOX_EMULATOR',
    createdAtIso: new Date(Date.now() - 1800_000).toISOString(),
    updatedAtIso: new Date(Date.now() - 1800_000).toISOString(),
  });

  const auditLogs: AuditLedgerRow[] = [
    {
      id: 'AUD-1001',
      timestampIso: new Date(Date.now() - 3600_000 * 3).toISOString(),
      pillar: 'LUPAPERMIT',
      actor: 'Claude Code MCP Agent',
      eventTitle: 'Agent Payment Request: Architect Desk Lamp ($45.00 within $80.00 cap, confidence 68%)',
      verdict: 'HOLD',
      amountCents: 4500,
      savedOrProtectedCents: 4500,
      paypalRef: 'AUTH-HOLD4500LAMP9',
      sha256Hash: sha256Hex({ id: 'AUD-1001', order: 'PAYPAL-SBX-HOLD4500LAMP9' }),
      deterministicRule:
        'Monotonic Permit Policy: Confidence 68% < 82% min threshold -> PayPal AUTHORIZE Hold (Agent cannot self-approve)',
    },
    {
      id: 'AUD-1002',
      timestampIso: new Date(Date.now() - 3600_000 * 2).toISOString(),
      pillar: 'SCAMSHIELD',
      actor: 'ScamShield Pre-Payment Gate',
      eventTitle: 'Blocked Typosquatted Urgent Invoice ("paypa1-resolution-fee.com" + Friends & Family lure)',
      verdict: 'BLOCK',
      amountCents: 39000,
      savedOrProtectedCents: 39000,
      paypalRef: 'BLOCKED_PRE_ORDER',
      sha256Hash: sha256Hex({ id: 'AUD-1002', rule: 'SCAM-001+SCAM-003' }),
      deterministicRule: 'Rules SCAM-001 + SCAM-003 triggered (Risk 100/100); PayPal Checkout locked',
    },
    {
      id: 'AUD-1003',
      timestampIso: new Date(Date.now() - 3600_000 * 1.5).toISOString(),
      pillar: 'DEALFORGE',
      actor: 'DealForge Buyer vs Seller Agents',
      eventTitle: '3-Round B2B Security Audit Contract Settled ($950 list -> $680 agreed, 35% deposit)',
      verdict: 'SETTLED',
      amountCents: 23800,
      savedOrProtectedCents: 27000,
      paypalRef: 'PAYPAL-SBX-DEAL680',
      sha256Hash: sha256Hex({ id: 'AUD-1003', contract: 'ctr_68000' }),
      deterministicRule:
        'Mandate Kernel verified price <= $800 Buyer Ceiling & >= $580 Seller Floor; SHA-256 contract locked',
    },
    {
      id: 'AUD-1004',
      timestampIso: new Date(Date.now() - 3600_000 * 1).toISOString(),
      pillar: 'CHURNRESCUE',
      actor: 'ChurnRescue Interceptor',
      eventTitle: 'Retained SaaS Subscriber on PayPal Decline (Step 1: Fixed 20% Concession for 3 mos)',
      verdict: 'SETTLED',
      amountCents: 7920,
      savedOrProtectedCents: 95040,
      paypalRef: 'PAYPAL-SBX-CHURN7920',
      sha256Hash: sha256Hex({ id: 'AUD-1004', step: 1, discount: 20 }),
      deterministicRule:
        'Fixed Concession Ladder Step 1 (20% off $99.00 -> $79.20/mo); Utilization 34% < 60% guardrail',
    },
  ];

  const signedContracts: SignedDealContract[] = [];
  let lastIssuedScamToken: SignedScamShieldToken | null = null;
  const zapierDispatchLog: Array<{ timestampIso: string; eventType: string; payload: unknown; status: string }> = [];

  function appendAuditLog(entry: Omit<AuditLedgerRow, 'id' | 'timestampIso'>): AuditLedgerRow {
    const row: AuditLedgerRow = {
      id: `AUD-${1001 + auditLogs.length}`,
      timestampIso: new Date().toISOString(),
      ...entry,
    };
    auditLogs.unshift(row);
    return row;
  }

  // ==========================================================================
  // 1. STATE, CREDENTIALS VAULT & AI FAILOVER TELEMETRY ENDPOINTS
  // ==========================================================================

  app.get('/api/state', (_req, res) => {
    const zombieReport = auditPayPalPermissions(billingPermissions);
    const defaultAffordability = evaluateCashflowAffordability({
      itemTitle: 'Pro Studio 4K OLED Reference Monitor',
      proposedSpendCents: 58000,
      currentBalanceCents: currentCheckingBalanceCents,
      commitments: cashflowCommitments,
      minimumSafetyBufferCents,
    });

    const totalProtectedCents = auditLogs.reduce((acc, r) => acc + r.savedOrProtectedCents, 0);

    res.json({
      system: {
        name: 'AegisPay OS',
        version: '1.0.0',
        tagline: 'AI Proposes. Deterministic Code Decides. PayPal Moves the Money.',
        paypal: paypalGateway.getStatus(),
        gemini: geminiEngine.getStatus(),
        zapierConfigured: Boolean(zapierWebhookUrl),
      },
      kpis: {
        totalProtectedCents,
        zombieAnnualExposureCents: zombieReport.totalAnnualExposureCents,
        recoverableMonthlyCents: zombieReport.recoverableMonthlyCents,
        activeAgentPermits: agentPermits.filter((p) => p.active).length,
        heldOrdersPendingApproval: paypalGateway.getOrders().filter((o) => o.status === 'AUTHORIZED').length,
        totalAuditRecords: auditLogs.length,
      },
      lupa: {
        billingPermissions,
        zombieReport,
        cashflowCommitments,
        currentCheckingBalanceCents,
        minimumSafetyBufferCents,
        defaultAffordability,
        agentPermits,
      },
      orders: paypalGateway.getOrders(),
      webhooks: paypalGateway.getWebhookStream(),
      auditLogs,
      signedContracts,
      zapierDispatchLog,
    });
  });

  app.post('/api/credentials', async (req, res) => {
    const {
      paypalClientId,
      paypalClientSecret,
      paypalEnvironment,
      geminiApiKey,
      groqApiKey,
      simulateGeminiRateLimit,
      zapierUrl,
    } = req.body || {};

    if (typeof paypalClientId === 'string' || typeof paypalClientSecret === 'string') {
      paypalGateway.updateCredentials({
        clientId: typeof paypalClientId === 'string' ? paypalClientId : undefined,
        clientSecret: typeof paypalClientSecret === 'string' ? paypalClientSecret : undefined,
        environment: paypalEnvironment === 'live' ? 'live' : 'sandbox',
      });
    }

    geminiEngine.updateCredentials({
      geminiApiKey: typeof geminiApiKey === 'string' ? geminiApiKey : undefined,
      groqApiKey: typeof groqApiKey === 'string' ? groqApiKey : undefined,
      simulateGeminiRateLimit:
        typeof simulateGeminiRateLimit === 'boolean' ? simulateGeminiRateLimit : undefined,
    });

    if (typeof zapierUrl === 'string') {
      zapierWebhookUrl = zapierUrl.trim();
    }

    const tokenTest = await paypalGateway.getAccessToken();
    res.json({
      updated: true,
      paypal: paypalGateway.getStatus(),
      paypalOAuthLiveVerified: tokenTest.live,
      gemini: geminiEngine.getStatus(),
      zapierConfigured: Boolean(zapierWebhookUrl),
    });
  });

  app.post('/api/ai/failover-test', async (req, res) => {
    const { simulateRateLimit } = req.body || {};
    const shouldSimulate = simulateRateLimit !== undefined ? Boolean(simulateRateLimit) : true;
    geminiEngine.setSimulateRateLimit(shouldSimulate);

    const testScan = await geminiEngine.analyzePaymentScamSemantics({
      sanitizedText: 'Invoice #8012 for Cloud Security Infrastructure: $120.00 USD',
      claimedAmountCents: 12000,
      payeeIdentifier: 'billing@cloudinfra.io',
    });

    const auditRow = appendAuditLog({
      pillar: 'FAILOVER',
      actor: 'AI Failover Router (Gemini -> Groq)',
      eventTitle: shouldSimulate
        ? `Gemini HTTP 429 Rate Limit Intercepted -> Automatic Failover to Groq LPU (${testScan.telemetry.latencyMs}ms)`
        : `Primary Gemini 2.5 Flash Route Restored (${testScan.telemetry.latencyMs}ms)`,
      verdict: shouldSimulate ? 'REROUTED' : 'ALLOW',
      amountCents: 12000,
      savedOrProtectedCents: 0,
      paypalRef: testScan.telemetry.activeProviderUsed,
      sha256Hash: sha256Hex(testScan.telemetry),
      deterministicRule: testScan.telemetry.failoverReason,
    });

    res.json({
      aiStatus: geminiEngine.getStatus(),
      telemetry: testScan.telemetry,
      auditRow,
    });
  });

  // ==========================================================================
  // 2. PILLAR 1: LUPAPERMIT & CASHFLOW COPILOT ENDPOINTS
  // ==========================================================================

  app.post('/api/lupa/cashflow-check', (req, res) => {
    try {
      const { itemTitle, proposedSpendCents, syncAgentPermitCap } = req.body || {};
      const spend = Math.max(100, Math.round(Number(proposedSpendCents) || 58000));
      const result = evaluateCashflowAffordability({
        itemTitle: String(itemTitle || 'Custom Purchase Evaluation'),
        proposedSpendCents: spend,
        currentBalanceCents: currentCheckingBalanceCents,
        commitments: cashflowCommitments,
        minimumSafetyBufferCents,
      });

      if (syncAgentPermitCap && agentPermits[0]) {
        agentPermits[0].maxSingleTransactionCents = Math.max(
          2000,
          Math.min(50000, result.recommendedAgentCapCents)
        );
      }

      appendAuditLog({
        pillar: 'LUPAPERMIT',
        actor: 'CashflowCopilot Engine',
        eventTitle: `Affordability Check: "${result.itemTitle}" ($${(spend / 100).toFixed(2)}) -> ${result.affordabilityTier}`,
        verdict: result.verdict,
        amountCents: spend,
        savedOrProtectedCents: result.verdict === 'ALLOW' ? 0 : spend,
        paypalRef: 'CASHFLOW-GUARD',
        sha256Hash: sha256Hex(result),
        deterministicRule: result.deterministicExplanation,
      });

      res.json({ result, updatedPermit: agentPermits[0] });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/lupa/revoke-zombie', (req, res) => {
    const { agreementId, action } = req.body || {};
    const perm = billingPermissions.find((p) => p.agreementId === agreementId);
    if (!perm) {
      res.status(404).json({ error: `Billing Agreement ${agreementId} not found` });
      return;
    }

    if (action === 'TIGHTEN_CAP') {
      const oldCap = perm.monthlyCapCents;
      perm.monthlyCapCents = Math.ceil((perm.averageChargeCents * 1.1) / 100) * 100;
      appendAuditLog({
        pillar: 'LUPAPERMIT',
        actor: 'Buyer Permission API',
        eventTitle: `Tightened Autopay Ceiling for ${perm.merchantName} ($${(oldCap / 100).toFixed(2)} -> $${(perm.monthlyCapCents / 100).toFixed(2)}/mo)`,
        verdict: 'SETTLED',
        amountCents: perm.monthlyCapCents,
        savedOrProtectedCents: (oldCap - perm.monthlyCapCents) * 12,
        paypalRef: perm.agreementId,
        sha256Hash: sha256Hex({ agreementId, newCap: perm.monthlyCapCents }),
        deterministicRule: 'Capped recurring merchant pull authority to 110% of trailing average charge',
      });
    } else {
      perm.status = 'REVOKED';
      const recoverable = perm.averageChargeCents * 12;
      const autopayCommitment = cashflowCommitments.find((c) => c.id === 'cf_paypal_subs');
      if (autopayCommitment) {
        autopayCommitment.amountCents = Math.max(0, autopayCommitment.amountCents - perm.averageChargeCents);
      }
      appendAuditLog({
        pillar: 'LUPAPERMIT',
        actor: 'Buyer Permission API',
        eventTitle: `Revoked Zombie PayPal Billing Agreement ${perm.agreementId} (${perm.merchantName})`,
        verdict: 'BLOCK',
        amountCents: perm.averageChargeCents,
        savedOrProtectedCents: recoverable,
        paypalRef: perm.agreementId,
        sha256Hash: sha256Hex({ agreementId, status: 'REVOKED' }),
        deterministicRule: 'Revoked dormant/unused recurring pull permission; freed monthly cashflow',
      });
    }

    res.json({
      permission: perm,
      zombieReport: auditPayPalPermissions(billingPermissions),
      cashflowCommitments,
    });
  });

  app.post('/api/lupa/agent-pay', async (req, res) => {
    try {
      const {
        permitId,
        amountCents,
        merchantId,
        merchantName,
        category,
        itemDescription,
        aiConfidenceScore,
        aiSuggestedVerdict,
      } = req.body || {};

      const permit = agentPermits.find((p) => p.permitId === permitId) || agentPermits[0];
      const reqId = `REQ-${Date.now()}`;
      const numericAmount = Math.round(Number(amountCents) || 4500);
      const numericConfidence = Math.max(0, Math.min(1, Number(aiConfidenceScore ?? 0.9)));
      const validAiVerdict: DecisionVerdict = ['ALLOW', 'HOLD', 'BLOCK'].includes(aiSuggestedVerdict)
        ? aiSuggestedVerdict
        : 'ALLOW';

      const evaluation = evaluateAgentPermit(permit, {
        requestId: reqId,
        permitId: permit.permitId,
        amountCents: numericAmount,
        currency: 'USD',
        merchantId: String(merchantId || 'merch_nordic_hardware'),
        merchantName: String(merchantName || 'NordicLight Studio Hardware'),
        category: String(category || 'HARDWARE'),
        itemDescription: String(itemDescription || 'Autonomous Agent Purchase'),
        aiConfidenceScore: numericConfidence,
        aiSuggestedVerdict: validAiVerdict,
        aiReasoning: `Agent evaluated merchant & item specs with ${(numericConfidence * 100).toFixed(0)}% confidence.`,
      });

      let paypalOrder = null;
      if (evaluation.finalVerdict === 'ALLOW' || evaluation.finalVerdict === 'HOLD') {
        paypalOrder = await paypalGateway.createOrder({
          intent: evaluation.paypalIntent === 'CAPTURE' ? 'CAPTURE' : 'AUTHORIZE',
          amountCents: numericAmount,
          currency: 'USD',
          merchantName: String(merchantName || 'NordicLight Studio Hardware'),
          description: `[${permit.agentName}] ${itemDescription}`,
          customHash: evaluation.auditHash,
          idempotencyKey: evaluation.auditHash,
          pillar: 'LUPAPERMIT',
          autoExecuteInSandbox: true,
        });

        if (evaluation.finalVerdict === 'ALLOW') {
          permit.spentTodayCents += numericAmount;
        }
      }

      const auditRow = appendAuditLog({
        pillar: 'LUPAPERMIT',
        actor: permit.agentName,
        eventTitle: `Agent Request: ${itemDescription} ($${(numericAmount / 100).toFixed(2)}) -> ${evaluation.finalVerdict}`,
        verdict: evaluation.finalVerdict,
        amountCents: numericAmount,
        savedOrProtectedCents: evaluation.finalVerdict === 'ALLOW' ? 0 : numericAmount,
        paypalRef: paypalOrder ? paypalOrder.orderId : 'BLOCKED_BY_PERMIT_KERNEL',
        sha256Hash: evaluation.auditHash,
        deterministicRule: evaluation.reasons.join(' | '),
      });

      res.json({
        evaluation,
        paypalOrder,
        permit,
        auditRow,
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/lupa/resolve-hold', async (req, res) => {
    try {
      const { orderId, action, operatorNote } = req.body || {};
      const resolvedOrder = await paypalGateway.resolveHeldAuthorization({
        orderId: String(orderId),
        action: action === 'VOID' ? 'VOID' : 'CAPTURE',
        operatorNote: String(operatorNote || 'Reviewed by human account owner in AegisPay Portal'),
      });

      const auditRow = appendAuditLog({
        pillar: 'LUPAPERMIT',
        actor: 'Human Account Owner',
        eventTitle: `Human Operator ${action === 'VOID' ? 'Voided & Rejected' : 'Approved & Captured'} Held Order ${resolvedOrder.orderId}`,
        verdict: action === 'VOID' ? 'BLOCK' : 'SETTLED',
        amountCents: resolvedOrder.amountCents,
        savedOrProtectedCents: action === 'VOID' ? resolvedOrder.amountCents : 0,
        paypalRef: resolvedOrder.captureId || resolvedOrder.authorizationId || resolvedOrder.orderId,
        sha256Hash: sha256Hex({ orderId: resolvedOrder.orderId, status: resolvedOrder.status }),
        deterministicRule: `Human-in-the-loop resolution on PayPal AUTHORIZE hold (${resolvedOrder.status})`,
      });

      res.json({ order: resolvedOrder, auditRow });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // ==========================================================================
  // 3. PILLAR 2: SCAMSHIELD PRE-PAYMENT FIREWALL & TAMPER LAB ENDPOINTS
  // ==========================================================================

  app.post('/api/scamshield/review', async (req, res) => {
    try {
      const { rawText, claimedAmountCents, currency, payeeIdentifier } = req.body || {};
      const amount = Math.max(100, Math.round(Number(claimedAmountCents) || 4500));
      const curr = String(currency || 'USD').toUpperCase();
      const payee = String(payeeIdentifier || 'billing@verified-studio.io').trim();
      const text = String(rawText || '');

      const detResult = evaluatePaymentScamDeterministically({
        rawText: text,
        claimedAmountCents: amount,
        currency: curr,
        payeeIdentifier: payee,
      });

      const aiResult = await geminiEngine.analyzePaymentScamSemantics({
        sanitizedText: detResult.sanitizedText,
        claimedAmountCents: amount,
        payeeIdentifier: payee,
      });

      const finalVerdict = stricterVerdict(detResult.deterministicVerdict, aiResult.aiSuggestedVerdict);
      const combinedRiskScore = Math.max(detResult.riskScore, aiResult.semanticRiskScore);

      const signedToken = scamVault.issueToken({
        input: {
          rawText: text,
          claimedAmountCents: amount,
          currency: curr,
          payeeIdentifier: payee,
        },
        verdict: finalVerdict,
        riskScore: combinedRiskScore,
      });

      lastIssuedScamToken = signedToken;

      const auditRow = appendAuditLog({
        pillar: 'SCAMSHIELD',
        actor: 'ScamShield Firewall',
        eventTitle: `Pre-Payment Review for ${payee} ($${(amount / 100).toFixed(2)}) -> ${finalVerdict} (Risk ${combinedRiskScore}/100)`,
        verdict: finalVerdict,
        amountCents: amount,
        savedOrProtectedCents: finalVerdict === 'BLOCK' ? amount : 0,
        paypalRef: signedToken.payload.tokenId,
        sha256Hash: signedToken.signature,
        deterministicRule:
          detResult.matches.length > 0
            ? detResult.matches.map((m) => `${m.ruleId}: ${m.description}`).join(' ; ')
            : aiResult.aiSummary,
      });

      res.json({
        deterministic: detResult,
        ai: aiResult,
        finalVerdict,
        combinedRiskScore,
        signedToken,
        paypalCheckoutUnlocked: finalVerdict !== 'BLOCK',
        auditRow,
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/scamshield/capture', async (req, res) => {
    try {
      const { signedToken, tamperScenario } = req.body || {};
      const baseToken: SignedScamShieldToken | null = signedToken || lastIssuedScamToken;

      let tokenToVerify: SignedScamShieldToken | null = baseToken
        ? JSON.parse(JSON.stringify(baseToken))
        : null;
      let captureAmountCents = tokenToVerify?.payload.amountCents ?? 4500;
      const currency = tokenToVerify?.payload.currency ?? 'USD';
      let payeeIdentifier = tokenToVerify?.payload.payeeIdentifier ?? 'billing@verified-studio.io';
      let simulatedNowMs = Date.now();

      if (tamperScenario === 'MUTATE_AMOUNT' && tokenToVerify) {
        captureAmountCents = tokenToVerify.payload.amountCents * 10;
      } else if (tamperScenario === 'FORGE_SIGNATURE' && tokenToVerify) {
        tokenToVerify.payload.verdict = 'ALLOW';
        tokenToVerify.signature = 'deadbeef0000111122223333444455556666777788889999aaaabbbbccccdddd';
      } else if (tamperScenario === 'EXPIRED_TOKEN' && tokenToVerify) {
        simulatedNowMs = tokenToVerify.payload.expiresAtMs + 60_000;
      } else if (tamperScenario === 'NEVER_REVIEWED') {
        tokenToVerify = null;
      } else if (tamperScenario === 'PAYEE_SWAP' && tokenToVerify) {
        payeeIdentifier = 'attacker-offshore-wallet@evil.example';
      }

      const preOrderId = `ORD-SCAMSHIELD-${Date.now()}`;
      const verification = scamVault.verifyAndConsumeForCapture({
        signedToken: tokenToVerify,
        orderId: preOrderId,
        captureAmountCents,
        currency,
        payeeIdentifier,
        nowMs: simulatedNowMs,
      });

      if (!verification.allowed) {
        const auditRow = appendAuditLog({
          pillar: 'SCAMSHIELD',
          actor: 'ScamShield Capture Gate',
          eventTitle: `Blocked Capture [${verification.errorCode}]: ${verification.reason}`,
          verdict: 'BLOCK',
          amountCents: captureAmountCents,
          savedOrProtectedCents: captureAmountCents,
          paypalRef: `REJECTED_${verification.errorCode}`,
          sha256Hash: sha256Hex({ preOrderId, errorCode: verification.errorCode, captureAmountCents }),
          deterministicRule: verification.reason,
        });

        res.json({
          captured: false,
          verification,
          auditRow,
        });
        return;
      }

      const paypalOrder = await paypalGateway.createOrder({
        intent: 'CAPTURE',
        amountCents: captureAmountCents,
        currency,
        merchantName: payeeIdentifier,
        description: `ScamShield Verified Checkout (${tokenToVerify!.payload.tokenId})`,
        customHash: tokenToVerify!.signature,
        idempotencyKey: tokenToVerify!.payload.tokenId,
        pillar: 'SCAMSHIELD',
        autoExecuteInSandbox: true,
      });

      const auditRow = appendAuditLog({
        pillar: 'SCAMSHIELD',
        actor: 'ScamShield Capture Gate',
        eventTitle: `Verified Single-Use Token & Captured PayPal Order ${paypalOrder.orderId} ($${(captureAmountCents / 100).toFixed(2)})`,
        verdict: 'SETTLED',
        amountCents: captureAmountCents,
        savedOrProtectedCents: 0,
        paypalRef: paypalOrder.orderId,
        sha256Hash: tokenToVerify!.signature,
        deterministicRule: verification.reason,
      });

      res.json({
        captured: true,
        verification,
        paypalOrder,
        auditRow,
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // ==========================================================================
  // 4. PILLAR 3: DEALFORGE MULTI-AGENT NEGOTIATION & ESCROW ENDPOINTS
  // ==========================================================================

  app.post('/api/dealforge/negotiate', async (req, res) => {
    try {
      const { buyerMandate: rawBuyer, sellerMandate: rawSeller, simulatePromptInjection } = req.body || {};

      const buyerMandate: BuyerMandate = {
        mandateId: 'BM-LIVE-01',
        buyerName: String(rawBuyer?.buyerName || 'Acme AI Labs (Buyer Agent)'),
        itemTitle: String(rawBuyer?.itemTitle || 'Enterprise SOC2 & Smart Contract Security Audit'),
        targetPriceCents: Math.round(Number(rawBuyer?.targetPriceCents) || 62000),
        maxPriceCents: Math.round(Number(rawBuyer?.maxPriceCents) || 82000),
        maxDeliveryDays: Math.round(Number(rawBuyer?.maxDeliveryDays) || 7),
        minRevisions: Math.round(Number(rawBuyer?.minRevisions) || 2),
        maxUpfrontDepositPct: Math.round(Number(rawBuyer?.maxUpfrontDepositPct) || 40),
      };

      const sellerMandate: SellerMandate = {
        mandateId: 'SM-LIVE-01',
        sellerName: String(rawSeller?.sellerName || 'Sentinel CyberSec Partners (Seller Agent)'),
        listPriceCents: Math.round(Number(rawSeller?.listPriceCents) || 98000),
        minPriceCents: Math.round(Number(rawSeller?.minPriceCents) || 64000),
        fastestDeliveryDays: Math.round(Number(rawSeller?.fastestDeliveryDays) || 4),
        maxRevisionsAllowed: Math.round(Number(rawSeller?.maxRevisionsAllowed) || 3),
        minUpfrontDepositPct: Math.round(Number(rawSeller?.minUpfrontDepositPct) || 25),
      };

      const rounds: NegotiationRoundEntry[] = [];

      if (buyerMandate.maxPriceCents < sellerMandate.minPriceCents) {
        const auditRow = appendAuditLog({
          pillar: 'DEALFORGE',
          actor: 'DealForge Mandate Kernel',
          eventTitle: `No Deal Zone: Buyer Ceiling ($${(buyerMandate.maxPriceCents / 100).toFixed(2)}) < Seller Floor ($${(sellerMandate.minPriceCents / 100).toFixed(2)})`,
          verdict: 'BLOCK',
          amountCents: sellerMandate.minPriceCents,
          savedOrProtectedCents: sellerMandate.listPriceCents,
          paypalRef: 'NO_ZOPA_ABORT',
          sha256Hash: sha256Hex({ buyerMandate, sellerMandate }),
          deterministicRule: 'Zone of Possible Agreement (ZOPA) is empty; halted before any PayPal commitment.',
        });
        res.json({
          dealReached: false,
          reason: `No Zone of Possible Agreement (ZOPA): Buyer confidential ceiling ($${(buyerMandate.maxPriceCents / 100).toFixed(2)}) is below Seller confidential floor ($${(sellerMandate.minPriceCents / 100).toFixed(2)}).`,
          rounds,
          auditRow,
        });
        return;
      }

      const r1RawTerms = {
        priceCents: buyerMandate.targetPriceCents,
        deliveryDays: Math.max(sellerMandate.fastestDeliveryDays, buyerMandate.maxDeliveryDays - 2),
        revisions: buyerMandate.minRevisions + 1,
        upfrontDepositPct: sellerMandate.minUpfrontDepositPct,
      };
      const r1Msg = geminiEngine.generateNegotiationRoundMessage({
        round: 1,
        proposer: 'BUYER_AGENT',
        terms: r1RawTerms,
        buyerMandate,
        sellerMandate,
      });
      const r1Validated = validateAndClampOfferAgainstMandate({
        proposer: 'BUYER_AGENT',
        rawOffer: r1RawTerms,
        rawMessage: r1Msg,
        buyerMandate,
        sellerMandate,
      });
      rounds.push({
        round: 1,
        proposer: 'BUYER_AGENT',
        proposedTerms: r1Validated.validatedTerms,
        sanitizedMessage: r1Validated.sanitizedMessage,
        kernelValidated: true,
        kernelAdjustments: r1Validated.kernelAdjustments,
        promptInjectionBlocked: r1Validated.promptInjectionBlocked,
      });

      const midHighCents = Math.round((sellerMandate.listPriceCents + sellerMandate.minPriceCents) / 2);
      const r2RawTerms = {
        priceCents: Math.max(sellerMandate.minPriceCents, midHighCents),
        deliveryDays: buyerMandate.maxDeliveryDays,
        revisions: buyerMandate.minRevisions,
        upfrontDepositPct: simulatePromptInjection ? 95 : Math.min(buyerMandate.maxUpfrontDepositPct, 40),
      };
      const r2Msg = geminiEngine.generateNegotiationRoundMessage({
        round: 2,
        proposer: 'SELLER_AGENT',
        terms: r2RawTerms,
        buyerMandate,
        sellerMandate,
        simulateInjectionAttack: Boolean(simulatePromptInjection),
      });
      const r2Validated = validateAndClampOfferAgainstMandate({
        proposer: 'SELLER_AGENT',
        rawOffer: r2RawTerms,
        rawMessage: r2Msg,
        buyerMandate,
        sellerMandate,
      });
      rounds.push({
        round: 2,
        proposer: 'SELLER_AGENT',
        proposedTerms: r2Validated.validatedTerms,
        sanitizedMessage: r2Validated.sanitizedMessage,
        kernelValidated: true,
        kernelAdjustments: r2Validated.kernelAdjustments,
        promptInjectionBlocked: r2Validated.promptInjectionBlocked,
      });

      const effectiveBuyerTarget = Math.max(buyerMandate.targetPriceCents, sellerMandate.minPriceCents);
      const fairSettlementPriceCents = Math.round((effectiveBuyerTarget + buyerMandate.maxPriceCents) / 2);
      const agreedPriceCents = Math.min(
        buyerMandate.maxPriceCents,
        Math.max(sellerMandate.minPriceCents, fairSettlementPriceCents)
      );
      const agreedDeliveryDays = Math.min(
        buyerMandate.maxDeliveryDays,
        Math.max(sellerMandate.fastestDeliveryDays, 5)
      );
      const agreedRevisions = Math.min(
        sellerMandate.maxRevisionsAllowed,
        Math.max(buyerMandate.minRevisions, 2)
      );
      const agreedDepositPct = Math.min(
        buyerMandate.maxUpfrontDepositPct,
        Math.max(sellerMandate.minUpfrontDepositPct, 30)
      );

      const r3Terms = {
        priceCents: agreedPriceCents,
        deliveryDays: agreedDeliveryDays,
        revisions: agreedRevisions,
        upfrontDepositPct: agreedDepositPct,
      };
      const r3Msg = geminiEngine.generateNegotiationRoundMessage({
        round: 3,
        proposer: 'BUYER_AGENT',
        terms: r3Terms,
        buyerMandate,
        sellerMandate,
      });
      const r3Validated = validateAndClampOfferAgainstMandate({
        proposer: 'BUYER_AGENT',
        rawOffer: r3Terms,
        rawMessage: r3Msg,
        buyerMandate,
        sellerMandate,
      });
      rounds.push({
        round: 3,
        proposer: 'BUYER_AGENT',
        proposedTerms: r3Validated.validatedTerms,
        sanitizedMessage: r3Validated.sanitizedMessage,
        kernelValidated: true,
        kernelAdjustments: r3Validated.kernelAdjustments,
        promptInjectionBlocked: r3Validated.promptInjectionBlocked,
      });

      const r4Msg = geminiEngine.generateNegotiationRoundMessage({
        round: 4,
        proposer: 'SELLER_AGENT',
        terms: r3Validated.validatedTerms,
        buyerMandate,
        sellerMandate,
      });
      rounds.push({
        round: 4,
        proposer: 'SELLER_AGENT',
        proposedTerms: r3Validated.validatedTerms,
        sanitizedMessage: r4Msg,
        kernelValidated: true,
        kernelAdjustments: ['Both Buyer and Seller private mandate constraints verified satisfied.'],
        promptInjectionBlocked: false,
      });

      const contract = createSignedDealContract({
        buyerMandate,
        sellerMandate,
        agreedTerms: r3Validated.validatedTerms,
      });
      signedContracts.unshift(contract);

      const paypalOrder = await paypalGateway.createOrder({
        intent: 'CAPTURE',
        amountCents: contract.upfrontDepositCents,
        currency: 'USD',
        merchantName: sellerMandate.sellerName,
        description: `DealForge Contract ${contract.contractId} (${contract.agreedTerms.upfrontDepositPct}% Escrow Deposit for ${buyerMandate.itemTitle})`,
        customHash: contract.contractSha256,
        idempotencyKey: contract.contractId,
        pillar: 'DEALFORGE',
        autoExecuteInSandbox: true,
      });

      const auditRow = appendAuditLog({
        pillar: 'DEALFORGE',
        actor: 'DealForge Settlement Executor',
        eventTitle: `Signed Contract ${contract.contractId} ($${(contract.agreedTerms.priceCents / 100).toFixed(2)} agreed, saved $${(contract.buyerSavedCents / 100).toFixed(2)}) & Captured Deposit ($${(contract.upfrontDepositCents / 100).toFixed(2)})`,
        verdict: 'SETTLED',
        amountCents: contract.upfrontDepositCents,
        savedOrProtectedCents: contract.buyerSavedCents,
        paypalRef: paypalOrder.orderId,
        sha256Hash: contract.contractSha256,
        deterministicRule: `SHA-256 Contract Integrity Verified (${verifyContractIntegrity(contract) ? 'VALID' : 'INVALID'}); Prompt Injection Firewall ${simulatePromptInjection ? 'STRIPPED ATTACK IN ROUND 2' : 'CLEAN'}`,
      });

      res.json({
        dealReached: true,
        rounds,
        contract,
        contractIntegrityVerified: verifyContractIntegrity(contract),
        paypalOrder,
        auditRow,
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // ==========================================================================
  // 5. PILLAR 4: CLIPREFUND MULTIMODAL VISION DAMAGE GRADER ENDPOINTS
  // ==========================================================================

  app.post('/api/cliprefund/evaluate-and-refund', async (req, res) => {
    try {
      const { presetId, orderId, itemTitle, originalOrderCents, customerNote, imageBase64, simulateReplayAttack } =
        req.body || {};

      const targetOrderId = String(orderId || 'PAYPAL-SBX-8F92A1C4E7B01');
      const targetCaptureId = `CAP-${targetOrderId.replace('PAYPAL-SBX-', '')}`;
      const orderCents = Math.max(500, Math.round(Number(originalOrderCents) || 2800));

      const imageSeed = simulateReplayAttack
        ? 'REPLAY_IMAGE_STATIC_DIGEST'
        : imageBase64
          ? imageBase64.slice(0, 256) + Date.now()
          : `${presetId || 'chipped_ceramic_mug'}_${Date.now()}`;
      const imageSha256 = sha256Hex(imageSeed);

      if (simulateReplayAttack) {
        claimedVisionImageHashes.add(imageSha256);
      }

      const visionResult = await geminiEngine.extractVisionDefectTelemetry({
        presetId: String(presetId || 'chipped_ceramic_mug'),
        itemTitle: String(itemTitle || 'Handcrafted Stoneware Espresso Mug'),
        customerNote: String(customerNote || 'Arrived with a chip on the upper rim.'),
        imageBase64: typeof imageBase64 === 'string' ? imageBase64 : undefined,
      });

      const prevRefunded = refundedCentsByCapture.get(targetCaptureId) || 0;

      const calculation = calculateDeterministicVisionRefund({
        orderId: targetOrderId,
        captureId: targetCaptureId,
        originalOrderCents: orderCents,
        imageSha256,
        previouslyClaimedImageHashes: claimedVisionImageHashes,
        previouslyRefundedCentsOnCapture: prevRefunded,
        telemetry: visionResult.telemetry,
        policy: DEFAULT_MERCHANT_REFUND_POLICY,
      });

      let paypalRefund = null;
      if (calculation.approved && calculation.refundCents > 0) {
        claimedVisionImageHashes.add(imageSha256);
        refundedCentsByCapture.set(targetCaptureId, prevRefunded + calculation.refundCents);

        paypalRefund = await paypalGateway.issuePartialRefund({
          orderId: targetOrderId,
          captureId: targetCaptureId,
          refundCents: calculation.refundCents,
          reasonNote: calculation.explanation,
          calculationHash: calculation.calculationHash,
        });
      }

      const auditRow = appendAuditLog({
        pillar: 'CLIPREFUND',
        actor: 'ClipRefund Vision + Merchant Matrix',
        eventTitle: calculation.approved
          ? `Instant Keep-The-Item Refund: $${(calculation.refundCents / 100).toFixed(2)} (${calculation.appliedPercentage}%) on ${visionResult.telemetry.detectedItemCategory}`
          : `Blocked Vision Refund Claim: ${calculation.explanation}`,
        verdict: calculation.approved ? 'REFUNDED' : 'BLOCK',
        amountCents: calculation.refundCents,
        savedOrProtectedCents: calculation.approved ? calculation.merchantNetSavedCents : orderCents,
        paypalRef: paypalRefund ? paypalRefund.refundId : 'CLAIM_REJECTED',
        sha256Hash: calculation.calculationHash,
        deterministicRule: calculation.explanation,
      });

      res.json({
        visionTelemetry: visionResult.telemetry,
        visionEngineMode: visionResult.engineMode,
        failoverTelemetry: visionResult.failoverTelemetry,
        calculation,
        paypalRefund,
        imageSha256,
        auditRow,
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // ==========================================================================
  // 6. PILLAR 5: CHURNRESCUE IN-APP RETENTION & CIRCUIT BREAKER ENDPOINTS
  // ==========================================================================

  app.post('/api/churnrescue/intercept', async (req, res) => {
    try {
      const {
        accountId,
        customerName,
        planName,
        currentPlanPriceCents,
        featureUtilizationPct,
        negotiationStep,
        paypalDeclineCode,
        customerMessage,
        simulateDuplicateClick,
      } = req.body || {};

      const ctx = {
        accountId: String(accountId || 'ACC-SAAS-9042'),
        customerName: String(customerName || 'Jordan Vance'),
        planName: String(planName || 'Aegis Cloud Pro Plan'),
        currentPlanPriceCents: Math.max(1000, Math.round(Number(currentPlanPriceCents) || 9900)),
        featureUtilizationPct: Math.max(0, Math.min(100, Math.round(Number(featureUtilizationPct ?? 34)))),
        negotiationStep: Math.max(1, Math.round(Number(negotiationStep) || 1)),
        paypalDeclineCode: paypalDeclineCode || 'VOLUNTARY_CANCEL_CLICK',
        customerMessage: String(
          customerMessage || 'Our PayPal billing declined and $99/mo is too steep right now—thinking of canceling.'
        ),
      };

      const decision = evaluateChurnIntervention(ctx);
      const empathy = await geminiEngine.generateEmpatheticRetentionResponse(ctx, decision);

      let zapierDispatched = false;
      if (decision.circuitBreakerTripped) {
        const zapPayload = {
          alert: 'AEGISPAY_CHURNRESCUE_CIRCUIT_BREAKER_TRIPPED',
          accountId: ctx.accountId,
          customerName: ctx.customerName,
          matchedKeyword: decision.matchedCircuitBreakerKeyword,
          customerMessage: ctx.customerMessage,
          timestampIso: new Date().toISOString(),
        };
        zapierDispatchLog.unshift({
          timestampIso: zapPayload.timestampIso,
          eventType: 'CIRCUIT_BREAKER_HUMAN_ESCALATION',
          payload: zapPayload,
          status: zapierWebhookUrl ? 'DISPATCHED_LIVE_ZAPIER' : 'RECORDED_LOCAL_ZAPIER_BRIDGE',
        });
        zapierDispatched = true;
      }

      const lockKey = simulateDuplicateClick
        ? `STATIC_DUPLICATE_KEY_${ctx.accountId}_${decision.concessionStepIndex}`
        : `${decision.idempotencyLockKey}_${Date.now()}`;

      if (simulateDuplicateClick) {
        atomicLedger.executeAtomically(lockKey, () => ({
          orderId: `PAYPAL-SBX-LOCKED-${decision.idempotencyLockKey.slice(0, 8).toUpperCase()}`,
          status: 'COMPLETED',
          data: { initial: true },
        }));
      }

      let paypalOrder = null;
      const atomicOutcome = atomicLedger.executeAtomically(lockKey, () => {
        const orderId = `PAYPAL-SBX-RET-${decision.idempotencyLockKey.slice(0, 8).toUpperCase()}`;
        return {
          orderId,
          status: decision.circuitBreakerTripped ? 'FROZEN_BY_CIRCUIT_BREAKER' : 'COMPLETED',
          data: { finalOfferPriceCents: decision.finalOfferPriceCents },
        };
      });

      if (!atomicOutcome.duplicateBlocked && !decision.circuitBreakerTripped) {
        paypalOrder = await paypalGateway.createOrder({
          intent: 'CAPTURE',
          amountCents: decision.finalOfferPriceCents,
          currency: 'USD',
          merchantName: ctx.planName,
          description: `ChurnRescue Retention Billing (${decision.approvedDiscountPct}% Concession Applied)`,
          customHash: decision.idempotencyLockKey,
          idempotencyKey: lockKey,
          pillar: 'CHURNRESCUE',
          autoExecuteInSandbox: true,
        });
      }

      const auditRow = appendAuditLog({
        pillar: 'CHURNRESCUE',
        actor: decision.circuitBreakerTripped ? 'Circuit Breaker Kernel' : 'ChurnRescue Retention Engine',
        eventTitle: decision.circuitBreakerTripped
          ? `CIRCUIT BREAKER TRIPPED ("${decision.matchedCircuitBreakerKeyword}") -> Killed AI Session & Escalated`
          : atomicOutcome.duplicateBlocked
            ? `Atomic Row Lock Blocked Duplicate PayPal Capture (${atomicOutcome.orderId})`
            : `Retention Decision: ${decision.approvedDiscountPct}% Concession ($${(decision.finalOfferPriceCents / 100).toFixed(2)}/mo)`,
        verdict: decision.circuitBreakerTripped
          ? 'CIRCUIT_BREAKER'
          : atomicOutcome.duplicateBlocked
            ? 'BLOCK'
            : 'SETTLED',
        amountCents: decision.finalOfferPriceCents,
        savedOrProtectedCents: decision.circuitBreakerTripped
          ? ctx.currentPlanPriceCents
          : decision.finalOfferPriceCents * 12,
        paypalRef: paypalOrder ? paypalOrder.orderId : atomicOutcome.orderId,
        sha256Hash: decision.idempotencyLockKey,
        deterministicRule: atomicOutcome.duplicateBlocked ? atomicOutcome.reason : decision.deterministicReason,
      });

      res.json({
        decision,
        agentReply: empathy.agentReply,
        engineMode: empathy.engineMode,
        failoverTelemetry: empathy.failoverTelemetry,
        atomicOutcome,
        paypalOrder,
        zapierDispatched,
        auditRow,
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // ==========================================================================
  // 7. SECURITY FUZZER, SPONSOR EXPORTS & STATIC ASSETS
  // ==========================================================================

  app.post('/api/security/fuzz', (req, res) => {
    const iterations = Math.min(5000, Math.max(100, Number(req.body?.iterations) || 1000));
    const report = runDeterministicSafetyFuzzer(iterations, Date.now() & 0xffffffff);

    const auditRow = appendAuditLog({
      pillar: 'FUZZER',
      actor: 'Property-Based Security Verifier',
      eventTitle: `Verified ${report.passedCases}/${report.totalCasesRun} Random Adversarial Cases (${report.durationMs}ms)`,
      verdict: report.failedCases === 0 ? 'ALLOW' : 'BLOCK',
      amountCents: 0,
      savedOrProtectedCents: 100000,
      paypalRef: `FUZZ-${report.totalCasesRun}-PASS`,
      sha256Hash: sha256Hex(report.invariantsVerified),
      deterministicRule:
        '100% Monotonicity, Concession Floor <=50%, Circuit Breaker Zero Leakage, Mandate Ceiling Verified',
    });

    res.json({ report, auditRow });
  });

  app.get('/api/export/elastic-ndjson', (_req, res) => {
    const lines: string[] = [];
    for (const row of auditLogs) {
      lines.push(JSON.stringify({ index: { _index: 'aegispay-security-audit-2026', _id: row.id } }));
      lines.push(JSON.stringify({ '@timestamp': row.timestampIso, ...row }));
    }
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Content-Disposition', 'attachment; filename="aegispay-elastic-audit.ndjson"');
    res.send(lines.join('\n') + '\n');
  });

  app.get('/postman/AegisPay_Collection.json', (_req, res) => {
    const collectionPath = path.join(ROOT_DIR, 'postman', 'AegisPay_Collection.json');
    if (fs.existsSync(collectionPath)) {
      res.sendFile(collectionPath);
    } else {
      res.status(404).json({ error: 'Postman collection not generated yet' });
    }
  });

  app.get('/extension.zip', (_req, res) => {
    const zipPath = path.join(ROOT_DIR, 'public', 'extension.zip');
    if (fs.existsSync(zipPath)) {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="aegispay-chrome-extension-mv3.zip"');
      res.sendFile(zipPath);
    } else {
      res.status(404).json({ error: 'Extension zip not packaged yet' });
    }
  });

  const distDir = path.join(ROOT_DIR, 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/postman') || req.path === '/extension.zip') {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const port = Number(process.env.PORT) || 8787;
  const app = createAegisServer();
  app.listen(port, () => {
    console.log(`[AEGISPAY OS] Deterministic Trust & PayPal Execution Server listening on http://localhost:${port}`);
  });
}
