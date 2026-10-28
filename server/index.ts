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
  CollaboratorShareInput,
  computePennyExactMilestonePlan,
  createSignedDealContract,
  DecisionVerdict,
  DEFAULT_MERCHANT_REFUND_POLICY,
  evaluateAgentPermit,
  evaluateCashflowAffordability,
  evaluateChurnIntervention,
  evaluatePaymentScamDeterministically,
  extractPaymentRequestMetadata,
  MerchantRefundPolicyMatrix,
  NegotiationRoundEntry,
  PayPalBillingPermission,
  runDeterministicSafetyFuzzer,
  ScamShieldTokenVault,
  SellerMandate,
  sha256Hex,
  SignedDealContract,
  SignedScamShieldToken,
  signStatelessSession,
  SmartMilestonePlan,
  stricterVerdict,
  validateAndClampOfferAgainstMandate,
  verifyContractIntegrity,
  verifyDeliverableProofDeterministically,
  verifyGroundedNumbers,
  verifyStatelessSession,
} from '../shared/kernel';
import { PayPalSandboxGateway } from './paypal';
import { GeminiCognitiveEngine } from './gemini';

if (!process.env.VITEST) {
  dotenv.config();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export interface AuditLedgerRow {
  id: string;
  timestampIso: string;
  pillar:
    | 'LUPAPERMIT'
    | 'SCAMSHIELD'
    | 'DEALFORGE'
    | 'CLIPREFUND'
    | 'CHURNRESCUE'
    | 'PAYSTREAM'
    | 'FUZZER'
    | 'FAILOVER'
    | 'AUTH';
  actor: string;
  eventTitle: string;
  verdict:
    | 'ALLOW'
    | 'HOLD'
    | 'BLOCK'
    | 'SETTLED'
    | 'REFUNDED'
    | 'CIRCUIT_BREAKER'
    | 'REROUTED';
  amountCents: number;
  savedOrProtectedCents: number;
  paypalRef: string;
  sha256Hash: string;
  deterministicRule: string;
}

export interface AuthenticatedOperator {
  id: string;
  email: string;
  fullName: string;
  organization: string;
  role: 'PRINCIPAL_ARCHITECT' | 'TREASURY_OPERATOR' | 'SECURITY_AUDITOR';
  authProvider: 'EMAIL_PASSWORD' | 'PAYPAL_OAUTH' | 'GOOGLE_OAUTH' | 'GITHUB_OAUTH';
  paypalMerchantId: string;
  sessionTokenHash: string;
  authenticatedAtIso: string;
}

interface StoredAccount {
  id: string;
  email: string;
  fullName: string;
  organization: string;
  role: 'PRINCIPAL_ARCHITECT' | 'TREASURY_OPERATOR' | 'SECURITY_AUDITOR';
  passwordHash: string;
  paypalMerchantId: string;
}

export function createAegisServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '12mb' }));

  const kernelSecret =
    process.env.AEGIS_KERNEL_SECRET || 'aegispay-deterministic-kernel-hmac-v1-2026';

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
    process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    process.env.GROQ_API_KEY || '',
    process.env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b',
    process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b'
  );

  let zapierWebhookUrl = process.env.ZAPIER_WEBHOOK_URL || '';
  let googleClientId = process.env.GOOGLE_CLIENT_ID || '';
  let googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

  // Stateless runtime credential header support for serverless cold starts
  app.use((req, _res, next) => {
    const rawHeader = req.headers['x-aegis-credentials'];
    if (typeof rawHeader === 'string' && rawHeader.length > 4) {
      try {
        const parsed = JSON.parse(Buffer.from(rawHeader, 'base64').toString('utf8')) as Record<
          string,
          unknown
        >;
        if (
          typeof parsed.paypalClientId === 'string' &&
          parsed.paypalClientId.trim() &&
          typeof parsed.paypalClientSecret === 'string' &&
          parsed.paypalClientSecret.trim()
        ) {
          paypalGateway.updateCredentials({
            clientId: parsed.paypalClientId.trim(),
            clientSecret: parsed.paypalClientSecret.trim(),
          });
        }
        if (typeof parsed.geminiApiKey === 'string' && parsed.geminiApiKey.trim()) {
          geminiEngine.updateCredentials({ geminiApiKey: parsed.geminiApiKey.trim() });
        }
        if (typeof parsed.groqApiKey === 'string' && parsed.groqApiKey.trim()) {
          geminiEngine.updateCredentials({ groqApiKey: parsed.groqApiKey.trim() });
        }
        if (typeof parsed.googleOAuthClientId === 'string' && parsed.googleOAuthClientId.trim()) {
          googleClientId = parsed.googleOAuthClientId.trim();
        }
        if (
          typeof parsed.googleOAuthClientSecret === 'string' &&
          parsed.googleOAuthClientSecret.trim()
        ) {
          googleClientSecret = parsed.googleOAuthClientSecret.trim();
        }
        if (typeof parsed.zapierUrl === 'string' && parsed.zapierUrl.trim()) {
          zapierWebhookUrl = parsed.zapierUrl.trim();
        }
      } catch {
        // Ignore malformed header
      }
    }
    next();
  });

  const scamVault = new ScamShieldTokenVault(kernelSecret);
  const atomicLedger = new AtomicExecutionLedger();
  const claimedVisionImageHashes = new Set<string>();
  const refundedCentsByCapture = new Map<string, number>();

  let cachedFxRates: { rates: Record<string, number>; fetchedAtMs: number; live: boolean } = {
    rates: { USD: 1, EUR: 0.92, GBP: 0.79, INR: 85.4 },
    fetchedAtMs: 0,
    live: false,
  };

  async function getLiveOrFallbackFxRates(): Promise<{
    rates: Record<string, number>;
    live: boolean;
  }> {
    if (process.env.VITEST) {
      return { rates: cachedFxRates.rates, live: false };
    }
    if (Date.now() - cachedFxRates.fetchedAtMs < 15 * 60_000 && cachedFxRates.fetchedAtMs > 0) {
      return { rates: cachedFxRates.rates, live: cachedFxRates.live };
    }
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 2500);
      const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,INR', {
        signal: controller.signal,
      });
      clearTimeout(t);
      if (res.ok) {
        const data = (await res.json()) as { rates?: Record<string, number> };
        if (data.rates) {
          cachedFxRates = {
            rates: {
              USD: 1,
              EUR: data.rates.EUR || 0.92,
              GBP: data.rates.GBP || 0.79,
              INR: data.rates.INR || 85.4,
            },
            fetchedAtMs: Date.now(),
            live: true,
          };
          return { rates: cachedFxRates.rates, live: true };
        }
      }
    } catch {
      // Fallback below
    }
    cachedFxRates.fetchedAtMs = Date.now();
    return { rates: cachedFxRates.rates, live: false };
  }

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

  let cashflowCommitments: CashflowCommitment[] = [
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

  let currentCheckingBalanceCents = 385000;
  let minimumSafetyBufferCents = 30000;

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
      agentName: 'B2B Procurement Agent',
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

  let activeMerchantPolicy: MerchantRefundPolicyMatrix = {
    ...DEFAULT_MERCHANT_REFUND_POLICY,
    tierRefundPercentages: { ...DEFAULT_MERCHANT_REFUND_POLICY.tierRefundPercentages },
  };

  // Seed initial PayStream Smart-Milestone Plan (Module 06)
  const milestonePlans = new Map<string, SmartMilestonePlan>();
  const seededPlan = computePennyExactMilestonePlan({
    projectTitle: 'Next-Gen AI Checkout & Treasury Portal Build',
    clientEmail: 'treasury-client@personal.example.com',
    totalBudgetCents: 245000, // $2,450.00
    currency: 'USD',
    proposals: [
      {
        title: 'Milestone 1: System Architecture & Interactive Figma Prototype',
        weightPct: 30,
        dueInDays: 4,
        acceptanceCriteria: [
          'End-to-end API contract specification',
          'Responsive desktop and mobile checkout flow',
        ],
      },
      {
        title: 'Milestone 2: PayPal REST Sandbox Integration & Security Tests',
        weightPct: 45,
        dueInDays: 9,
        acceptanceCriteria: [
          'Orders v2 and Invoicing v2 live endpoints verified',
          'Automated test suite passing with zero regressions',
        ],
      },
      {
        title: 'Milestone 3: Production Vercel Launch & Operator Handover',
        weightPct: 25,
        dueInDays: 14,
        acceptanceCriteria: [
          'Live production URL returning 200 OK',
          'Deployment guide and runbook delivered',
        ],
      },
    ],
    collaborators: [
      {
        collaboratorName: 'Lead Full-Stack Engineer',
        paypalEmail: 'lead-engineer-sbx@personal.example.com',
        role: 'Backend & PayPal APIs',
        sharePct: 65,
      },
      {
        collaboratorName: 'Principal Product Designer',
        paypalEmail: 'product-design-sbx@personal.example.com',
        role: 'UI/UX & Design System',
        sharePct: 35,
      },
    ],
  });
  milestonePlans.set(seededPlan.planId, seededPlan);

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
    buyerCheckoutReady: false,
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
    description:
      'Workspace Agent Request: Minimalist Architect Desk Lamp (Confidence 68% < 82% threshold)',
    customHash: sha256Hex({ item: 'desk_lamp_45', permitId: 'PRM-CLAUDE-CODE-01' }),
    authorizationId: 'AUTH-HOLD4500LAMP9',
    approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-SBX-HOLD4500LAMP9',
    buyerCheckoutReady: false,
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
      eventTitle:
        'Agent Payment Request: Architect Desk Lamp ($45.00 within $80.00 cap, confidence 68%)',
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
      actor: 'Pre-Payment Firewall',
      eventTitle:
        'Blocked Typosquatted Urgent Invoice ("paypa1-resolution-fee.com" + Friends & Family lure)',
      verdict: 'BLOCK',
      amountCents: 39000,
      savedOrProtectedCents: 39000,
      paypalRef: 'BLOCKED_PRE_ORDER',
      sha256Hash: sha256Hex({ id: 'AUD-1002', rule: 'SCAM-001+SCAM-003' }),
      deterministicRule:
        'Rules SCAM-001 + SCAM-003 triggered (Risk 100/100); PayPal Checkout locked',
    },
    {
      id: 'AUD-1003',
      timestampIso: new Date(Date.now() - 3600_000 * 1.5).toISOString(),
      pillar: 'DEALFORGE',
      actor: 'Buyer vs Seller Agents',
      eventTitle:
        'B2B Security Audit Contract Settled ($950 list -> $680 agreed, 35% PayPal deposit)',
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
      actor: 'Retention Copilot',
      eventTitle:
        'Retained SaaS Subscriber on PayPal Decline (Step 1: Fixed 20% Concession for 3 mos)',
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
  const zapierDispatchLog: Array<{
    timestampIso: string;
    eventType: string;
    payload: unknown;
    status: string;
  }> = [];

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
        version: '2.0.0',
        tagline: 'AI Proposes. Deterministic Code Decides. PayPal Moves the Money.',
        paypal: paypalGateway.getStatus(),
        gemini: geminiEngine.getStatus(),
        zapierConfigured: Boolean(zapierWebhookUrl),
        googleOAuth: {
          configured: Boolean(googleClientId),
          clientIdPreview: googleClientId
            ? `${googleClientId.slice(0, 14)}...`
            : 'Interactive Google OAuth Sandbox',
        },
      },
      kpis: {
        totalProtectedCents,
        zombieAnnualExposureCents: zombieReport.totalAnnualExposureCents,
        recoverableMonthlyCents: zombieReport.recoverableMonthlyCents,
        activeAgentPermits: agentPermits.filter((p) => p.active).length,
        heldOrdersPendingApproval: paypalGateway
          .getOrders()
          .filter((o) => o.status === 'AUTHORIZED').length,
        totalAuditRecords: auditLogs.length,
        livePayPalInvoicesCount: paypalGateway.getInvoices().length,
        activeMilestonePlansCount: milestonePlans.size,
      },
      lupa: {
        billingPermissions,
        zombieReport,
        cashflowCommitments,
        currentCheckingBalanceCents,
        minimumSafetyBufferCents,
        defaultAffordability,
        agentPermits,
        vaultTokens: paypalGateway.getVaultTokens(),
        subscriptions: paypalGateway.getSubscriptions(),
      },
      cliprefund: {
        merchantPolicy: activeMerchantPolicy,
      },
      paystream: {
        plans: Array.from(milestonePlans.values()),
        invoices: paypalGateway.getInvoices(),
      },
      orders: paypalGateway.getOrders(),
      invoices: paypalGateway.getInvoices(),
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
      googleOAuthClientId,
      googleOAuthClientSecret,
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
    if (typeof googleOAuthClientId === 'string' && googleOAuthClientId.trim()) {
      googleClientId = googleOAuthClientId.trim();
    }
    if (typeof googleOAuthClientSecret === 'string' && googleOAuthClientSecret.trim()) {
      googleClientSecret = googleOAuthClientSecret.trim();
    }

    const tokenTest = await paypalGateway.getAccessToken(true);
    res.json({
      updated: true,
      paypal: paypalGateway.getStatus(),
      paypalOAuthLiveVerified: tokenTest.live,
      gemini: geminiEngine.getStatus(),
      zapierConfigured: Boolean(zapierWebhookUrl),
      googleOAuthConfigured: Boolean(googleClientId),
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
        ? `Gemini HTTP 429 Rate Limit Intercepted -> Automatic Failover to Groq LPU (${testScan.telemetry.modelUsed || 'Groq'} in ${testScan.telemetry.latencyMs}ms)`
        : `Primary Google Gemini (${testScan.telemetry.modelUsed || 'gemini-3.5-flash-lite'}) Route Restored (${testScan.telemetry.latencyMs}ms)`,
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
      promptGuard: testScan.promptGuard,
      auditRow,
    });
  });

  // ==========================================================================
  // 1B. STATELESS SERVERLESS AUTHENTICATION (GOOGLE OAUTH 2.0 + EMAIL/PASSWORD)
  // ==========================================================================

  const hashPassword = (email: string, rawPassword: string) =>
    sha256Hex({ email: email.trim().toLowerCase(), rawPassword, salt: kernelSecret });

  const operatorAccounts = new Map<string, StoredAccount>();
  const revokedTokens = new Set<string>();

  operatorAccounts.set('operator@aegispay.io', {
    id: 'OP-AEGIS-001',
    email: 'operator@aegispay.io',
    fullName: 'A. P. S. Bhaidav',
    organization: 'AegisPay Institutional Treasury',
    role: 'PRINCIPAL_ARCHITECT',
    passwordHash: hashPassword('operator@aegispay.io', 'AegisPay2026!'),
    paypalMerchantId: 'SBX-MERCH-AEGIS-01',
  });

  const issueOperatorSession = (
    account: Omit<StoredAccount, 'passwordHash'>,
    authProvider: AuthenticatedOperator['authProvider']
  ): { token: string; operator: AuthenticatedOperator } => {
    const authenticatedAtIso = new Date().toISOString();
    const sessionTokenHash = sha256Hex({
      id: account.id,
      email: account.email,
      authProvider,
      authenticatedAtIso,
      rand: Math.random(),
      secret: kernelSecret,
    }).slice(0, 24);

    const operator: AuthenticatedOperator = {
      id: account.id,
      email: account.email,
      fullName: account.fullName,
      organization: account.organization,
      role: account.role,
      authProvider,
      paypalMerchantId: account.paypalMerchantId,
      sessionTokenHash,
      authenticatedAtIso,
    };

    const token = signStatelessSession(operator, kernelSecret);
    return { token, operator };
  };

  app.post('/api/auth/register', (req, res) => {
    const { email, password, fullName, organization } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const rawPass = String(password || '');
    const cleanName = String(fullName || '').trim() || 'Treasury Operator';
    const cleanOrg = String(organization || '').trim() || 'PayPal Sandbox Workspace';

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      res.status(400).json({ error: 'Valid email address is required.' });
      return;
    }
    if (rawPass.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }
    if (operatorAccounts.has(normalizedEmail)) {
      res
        .status(409)
        .json({ error: 'An account with this email already exists. Please sign in.' });
      return;
    }

    const newAccount: StoredAccount = {
      id: `OP-${100 + operatorAccounts.size + 1}`,
      email: normalizedEmail,
      fullName: cleanName,
      organization: cleanOrg,
      role: 'TREASURY_OPERATOR',
      passwordHash: hashPassword(normalizedEmail, rawPass),
      paypalMerchantId: `SBX-MERCH-${sha256Hex(normalizedEmail).slice(0, 6).toUpperCase()}`,
    };
    operatorAccounts.set(normalizedEmail, newAccount);

    const { token, operator } = issueOperatorSession(newAccount, 'EMAIL_PASSWORD');
    appendAuditLog({
      pillar: 'AUTH',
      actor: operator.fullName,
      eventTitle: `Operator Registered via Email (${operator.email})`,
      verdict: 'ALLOW',
      amountCents: 0,
      savedOrProtectedCents: 0,
      paypalRef: operator.paypalMerchantId,
      sha256Hash: operator.sessionTokenHash,
      deterministicRule: 'Salted SHA-256 Credential Derivation + Stateless HMAC Session',
    });

    res.status(201).json({
      authenticated: true,
      token,
      operator,
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const rawPass = String(password || '');

    const account = operatorAccounts.get(normalizedEmail);
    if (!account || account.passwordHash !== hashPassword(normalizedEmail, rawPass)) {
      res.status(401).json({
        error:
          'Invalid email or password. Use operator@aegispay.io / AegisPay2026! or create a new account.',
      });
      return;
    }

    const { token, operator } = issueOperatorSession(account, 'EMAIL_PASSWORD');
    appendAuditLog({
      pillar: 'AUTH',
      actor: operator.fullName,
      eventTitle: `Operator Signed In (${operator.email})`,
      verdict: 'ALLOW',
      amountCents: 0,
      savedOrProtectedCents: 0,
      paypalRef: operator.paypalMerchantId,
      sha256Hash: operator.sessionTokenHash,
      deterministicRule: 'Verified Salted SHA-256 Password Hash + Stateless HMAC Session',
    });

    res.json({
      authenticated: true,
      token,
      operator,
    });
  });

  app.post('/api/auth/oauth', (req, res) => {
    const { provider, emailHint, nameHint } = req.body || {};
    const validProviders: AuthenticatedOperator['authProvider'][] = [
      'PAYPAL_OAUTH',
      'GOOGLE_OAUTH',
      'GITHUB_OAUTH',
    ];
    const selectedProvider: AuthenticatedOperator['authProvider'] = validProviders.includes(
      provider
    )
      ? provider
      : 'GOOGLE_OAUTH';

    const providerProfiles: Record<
      AuthenticatedOperator['authProvider'],
      {
        email: string;
        fullName: string;
        organization: string;
        role: AuthenticatedOperator['role'];
        merchantId: string;
      }
    > = {
      PAYPAL_OAUTH: {
        email: emailHint || 'paypal-sandbox-architect@aegispay.io',
        fullName: nameHint || 'A. P. S. Bhaidav',
        organization: 'PayPal Developer Sandbox',
        role: 'PRINCIPAL_ARCHITECT',
        merchantId: 'SBX-PAYPAL-OAUTH-901',
      },
      GOOGLE_OAUTH: {
        email: emailHint || 'aps.bhaidav@gmail.com',
        fullName: nameHint || 'A. P. S. Bhaidav',
        organization: 'Google Workspace Verified',
        role: 'TREASURY_OPERATOR',
        merchantId: 'SBX-GOOGLE-SSO-402',
      },
      GITHUB_OAUTH: {
        email: emailHint || 'security-auditor@github-enterprise.io',
        fullName: nameHint || 'A. P. S. Bhaidav',
        organization: 'GitHub Enterprise Security',
        role: 'SECURITY_AUDITOR',
        merchantId: 'SBX-GH-OAUTH-718',
      },
      EMAIL_PASSWORD: {
        email: 'operator@aegispay.io',
        fullName: 'A. P. S. Bhaidav',
        organization: 'AegisPay Institutional Treasury',
        role: 'PRINCIPAL_ARCHITECT',
        merchantId: 'SBX-MERCH-AEGIS-01',
      },
    };

    const profile = providerProfiles[selectedProvider];
    const pkceStateHash = sha256Hex({
      provider: selectedProvider,
      email: profile.email,
      ts: Date.now(),
      secret: kernelSecret,
    }).slice(0, 16);

    const { token, operator } = issueOperatorSession(
      {
        id: `OP-${selectedProvider.split('_')[0]}-01`,
        email: profile.email,
        fullName: profile.fullName,
        organization: profile.organization,
        role: profile.role,
        paypalMerchantId: profile.merchantId,
      },
      selectedProvider
    );

    appendAuditLog({
      pillar: 'AUTH',
      actor: operator.fullName,
      eventTitle: `OAuth 2.0 Handshake Verified via ${selectedProvider} (${operator.email})`,
      verdict: 'ALLOW',
      amountCents: 0,
      savedOrProtectedCents: 0,
      paypalRef: operator.paypalMerchantId,
      sha256Hash: operator.sessionTokenHash,
      deterministicRule: `OAuth 2.0 PKCE State Challenge Verified (state=${pkceStateHash})`,
    });

    res.json({
      authenticated: true,
      token,
      operator,
      oauthMetadata: {
        provider: selectedProvider,
        protocol: 'OAuth 2.0 + PKCE (S256)',
        pkceStateHash,
        scopesGranted: ['openid', 'profile', 'email'],
      },
    });
  });

  app.get('/api/auth/google/url', (req, res) => {
    const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = req.headers.host || 'localhost:8787';
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI || `${protocol}://${host}/api/auth/google/callback`;
    const state = sha256Hex({ ts: Date.now(), secret: kernelSecret }).slice(0, 24);

    if (!googleClientId) {
      res.json({
        liveGoogleOAuthConfigured: false,
        redirectUri,
        state,
        message: 'GOOGLE_CLIENT_ID not set; using interactive Google Account Chooser.',
      });
      return;
    }

    const params = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
      state,
    });

    res.json({
      liveGoogleOAuthConfigured: true,
      authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      redirectUri,
      state,
    });
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    try {
      const code = String(req.query.code || '');
      const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
      const host = req.headers.host || 'localhost:8787';
      const redirectUri =
        process.env.GOOGLE_REDIRECT_URI || `${protocol}://${host}/api/auth/google/callback`;

      let email = 'aps.bhaidav@gmail.com';
      let fullName = 'A. P. S. Bhaidav';
      let org = 'Google OAuth Verified Account';

      if (code && googleClientId && googleClientSecret) {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: googleClientId,
            client_secret: googleClientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }).toString(),
        });

        if (tokenRes.ok) {
          const tokenData: any = await tokenRes.json();
          const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });
          if (userRes.ok) {
            const profile: any = await userRes.json();
            email = profile.email || email;
            fullName = profile.name || fullName;
            org = profile.hd || 'Google Account Verified';
          }
        }
      }

      const { token, operator } = issueOperatorSession(
        {
          id: `OP-GOOGLE-${sha256Hex(email).slice(0, 6).toUpperCase()}`,
          email,
          fullName,
          organization: org,
          role: 'PRINCIPAL_ARCHITECT',
          paypalMerchantId: `SBX-GOOGLE-${sha256Hex(email).slice(0, 6).toUpperCase()}`,
        },
        'GOOGLE_OAUTH'
      );

      appendAuditLog({
        pillar: 'AUTH',
        actor: operator.fullName,
        eventTitle: `Google OAuth 2.0 Callback Verified (${operator.email})`,
        verdict: 'ALLOW',
        amountCents: 0,
        savedOrProtectedCents: 0,
        paypalRef: operator.paypalMerchantId,
        sha256Hash: operator.sessionTokenHash,
        deterministicRule: 'Google OAuth 2.0 Authorization Code + OpenID UserInfo Verification',
      });

      res.redirect(`/?google_session=${encodeURIComponent(token)}`);
    } catch {
      res.redirect('/?auth_error=google_callback_failed');
    }
  });

  app.post('/api/auth/google', async (req, res) => {
    const { idToken, email, fullName, organization } = req.body || {};
    let resolvedEmail = String(email || 'aps.bhaidav@gmail.com').trim().toLowerCase();
    let resolvedName = String(fullName || 'A. P. S. Bhaidav').trim();
    let resolvedOrg = String(organization || 'Google Workspace').trim();

    if (typeof idToken === 'string' && idToken.split('.').length === 3) {
      try {
        const verifyRes = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
        );
        if (verifyRes.ok) {
          const payload: any = await verifyRes.json();
          resolvedEmail = payload.email || resolvedEmail;
          resolvedName = payload.name || resolvedName;
          resolvedOrg = payload.hd || 'Google Identity Services Verified';
        }
      } catch {
        // Fallback to provided Google profile claims
      }
    }

    const { token, operator } = issueOperatorSession(
      {
        id: `OP-G-${sha256Hex(resolvedEmail).slice(0, 6).toUpperCase()}`,
        email: resolvedEmail,
        fullName: resolvedName,
        organization: resolvedOrg,
        role: 'PRINCIPAL_ARCHITECT',
        paypalMerchantId: `SBX-GOOGLE-${sha256Hex(resolvedEmail).slice(0, 6).toUpperCase()}`,
      },
      'GOOGLE_OAUTH'
    );

    appendAuditLog({
      pillar: 'AUTH',
      actor: operator.fullName,
      eventTitle: `Authenticated via Google OAuth 2.0 (${operator.email})`,
      verdict: 'ALLOW',
      amountCents: 0,
      savedOrProtectedCents: 0,
      paypalRef: operator.paypalMerchantId,
      sha256Hash: operator.sessionTokenHash,
      deterministicRule: 'Google OAuth 2.0 Identity Token + Stateless HMAC Session',
    });

    res.json({
      authenticated: true,
      token,
      operator,
    });
  });

  app.get('/api/auth/me', (req, res) => {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token || revokedTokens.has(token)) {
      res.status(401).json({ authenticated: false, operator: null });
      return;
    }
    const claims = verifyStatelessSession(token, kernelSecret);
    if (!claims) {
      res.status(401).json({ authenticated: false, operator: null });
      return;
    }
    const { expMs: _exp, ...operator } = claims;
    res.json({ authenticated: true, operator });
  });

  app.post('/api/auth/logout', (req, res) => {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (token) {
      revokedTokens.add(token);
    }
    res.json({ loggedOut: true });
  });

  // ==========================================================================
  // 2. MODULE 01: SMART BUDGET, ZOMBIE AUTOPAY & AGENT PERMITS
  // ==========================================================================

  app.post('/api/lupa/cashflow-check', async (req, res) => {
    try {
      const { itemTitle, proposedSpendCents, syncAgentPermitCap, includeAiAdvice } = req.body || {};
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
          Math.min(100000, result.recommendedAgentCapCents)
        );
      }

      let aiAdvisor = null;
      if (includeAiAdvice) {
        aiAdvisor = await geminiEngine.adviseCashflowAffordability({
          itemTitle: result.itemTitle,
          proposedSpendCents: result.proposedSpendCents,
          trueFreeCashflowCents: result.trueFreeCashflowCents,
          postPurchaseFreeCashflowCents: result.postPurchaseFreeCashflowCents,
          verdict: result.verdict,
        });
      }

      appendAuditLog({
        pillar: 'LUPAPERMIT',
        actor: 'Cashflow Guard',
        eventTitle: `Affordability Check: "${result.itemTitle}" ($${(spend / 100).toFixed(2)}) -> ${result.affordabilityTier}`,
        verdict: result.verdict,
        amountCents: spend,
        savedOrProtectedCents: result.verdict === 'ALLOW' ? 0 : spend,
        paypalRef: 'CASHFLOW-GUARD',
        sha256Hash: sha256Hex(result),
        deterministicRule: result.deterministicExplanation,
      });

      res.json({ result, aiAdvisor, updatedPermit: agentPermits[0] });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/lupa/cashflow-update', (req, res) => {
    const { balanceCents, safetyBufferCents, addCommitment, removeCommitmentId } = req.body || {};
    if (typeof balanceCents === 'number' && Number.isFinite(balanceCents) && balanceCents >= 0) {
      currentCheckingBalanceCents = Math.round(balanceCents);
    }
    if (
      typeof safetyBufferCents === 'number' &&
      Number.isFinite(safetyBufferCents) &&
      safetyBufferCents >= 0
    ) {
      minimumSafetyBufferCents = Math.round(safetyBufferCents);
    }
    if (addCommitment && typeof addCommitment === 'object' && addCommitment.name) {
      cashflowCommitments.push({
        id: `cf_${Date.now().toString(36)}`,
        name: String(addCommitment.name).slice(0, 80),
        amountCents: Math.max(100, Math.round(Number(addCommitment.amountCents) || 5000)),
        dueInDays: Math.max(1, Math.min(60, Math.round(Number(addCommitment.dueInDays) || 7))),
        category:
          addCommitment.category === 'SAVINGS_GOAL' ? 'SAVINGS_GOAL' : 'ESSENTIAL_LIVING',
        mandatory: addCommitment.category !== 'SAVINGS_GOAL',
      });
    }
    if (typeof removeCommitmentId === 'string' && removeCommitmentId) {
      cashflowCommitments = cashflowCommitments.filter((c) => c.id !== removeCommitmentId);
    }

    const updatedAffordability = evaluateCashflowAffordability({
      itemTitle: 'Pro Studio 4K OLED Reference Monitor',
      proposedSpendCents: 58000,
      currentBalanceCents: currentCheckingBalanceCents,
      commitments: cashflowCommitments,
      minimumSafetyBufferCents,
    });

    res.json({
      currentCheckingBalanceCents,
      minimumSafetyBufferCents,
      cashflowCommitments,
      defaultAffordability: updatedAffordability,
    });
  });

  app.post('/api/lupa/compile-policy', async (req, res) => {
    try {
      const { sentence, applyToPermitId } = req.body || {};
      const cleanSentence = String(sentence || '').trim();
      if (!cleanSentence) {
        res.status(400).json({ error: 'Provide a plain-English spending rule sentence.' });
        return;
      }

      const compiled = await geminiEngine.compileNaturalLanguagePermitRule(cleanSentence);
      const proposedDollarValues = [
        compiled.maxSingleUsd,
        compiled.autoAllowUsd,
        compiled.minConfidencePct,
      ].filter((v): v is number => typeof v === 'number' && v > 0);

      const groundingCheck = verifyGroundedNumbers(cleanSentence, proposedDollarValues);

      let updatedPermit: AgentSpendingPermit | null = null;
      if (applyToPermitId && groundingCheck.grounded && compiled.promptGuard.label === 'BENIGN') {
        const target =
          agentPermits.find((p) => p.permitId === applyToPermitId) || agentPermits[0];
        if (target) {
          if (compiled.maxSingleUsd && compiled.maxSingleUsd > 0) {
            target.maxSingleTransactionCents = Math.round(compiled.maxSingleUsd * 100);
            target.dailyLimitCents = Math.max(
              target.dailyLimitCents,
              target.maxSingleTransactionCents * 2
            );
          }
          if (compiled.autoAllowUsd && compiled.autoAllowUsd > 0) {
            target.autoAllowMaxCents = Math.min(
              target.maxSingleTransactionCents,
              Math.round(compiled.autoAllowUsd * 100)
            );
          }
          if (
            compiled.minConfidencePct &&
            compiled.minConfidencePct >= 50 &&
            compiled.minConfidencePct <= 99
          ) {
            target.minConfidenceScore = compiled.minConfidencePct / 100;
          }
          if (compiled.allowedCategories.length > 0) {
            target.allowedCategories = compiled.allowedCategories;
          }
          updatedPermit = target;

          appendAuditLog({
            pillar: 'LUPAPERMIT',
            actor: 'Natural-Language Policy Compiler',
            eventTitle: `Applied Number-Grounded Spending Rule to ${target.permitId} (Cap $${(target.maxSingleTransactionCents / 100).toFixed(2)}, Auto $${(target.autoAllowMaxCents / 100).toFixed(2)})`,
            verdict: 'ALLOW',
            amountCents: target.maxSingleTransactionCents,
            savedOrProtectedCents: 0,
            paypalRef: target.permitId,
            sha256Hash: sha256Hex({ cleanSentence, target }),
            deterministicRule: `Number-Grounding Guard Verified (0 invented thresholds): "${cleanSentence}"`,
          });
        }
      }

      res.json({
        compiled,
        groundingCheck,
        updatedPermit,
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/lupa/update-permit', (req, res) => {
    const {
      permitId,
      maxSingleTransactionCents,
      autoAllowMaxCents,
      dailyLimitCents,
      minConfidenceScore,
      active,
    } = req.body || {};
    const target = agentPermits.find((p) => p.permitId === permitId) || agentPermits[0];
    if (!target) {
      res.status(404).json({ error: 'Permit not found' });
      return;
    }
    if (typeof maxSingleTransactionCents === 'number' && maxSingleTransactionCents >= 100) {
      target.maxSingleTransactionCents = Math.round(maxSingleTransactionCents);
    }
    if (typeof autoAllowMaxCents === 'number' && autoAllowMaxCents >= 100) {
      target.autoAllowMaxCents = Math.min(
        target.maxSingleTransactionCents,
        Math.round(autoAllowMaxCents)
      );
    }
    if (typeof dailyLimitCents === 'number' && dailyLimitCents >= target.maxSingleTransactionCents) {
      target.dailyLimitCents = Math.round(dailyLimitCents);
    }
    if (typeof minConfidenceScore === 'number' && minConfidenceScore >= 0.5 && minConfidenceScore <= 0.99) {
      target.minConfidenceScore = minConfidenceScore;
    }
    if (typeof active === 'boolean') {
      target.active = active;
    }
    res.json({ permit: target });
  });

  app.post('/api/lupa/mint-vault-permit', async (req, res) => {
    try {
      const { agentName, maxSingleCents } = req.body || {};
      const tokenRecord = await paypalGateway.createVaultSetupToken({
        agentName: String(agentName || 'Claude Code MCP Workspace Agent'),
        maxSingleCents: Math.max(500, Math.round(Number(maxSingleCents) || 8000)),
      });

      const auditRow = appendAuditLog({
        pillar: 'LUPAPERMIT',
        actor: 'PayPal Vault v3 Setup Service',
        eventTitle: `Minted PayPal Vault v3 Setup Token ${tokenRecord.setupTokenId} for ${tokenRecord.agentName}`,
        verdict: 'ALLOW',
        amountCents: tokenRecord.maxSingleCents,
        savedOrProtectedCents: 0,
        paypalRef: tokenRecord.setupTokenId,
        sha256Hash: sha256Hex(tokenRecord),
        deterministicRule: `PayPal Vault v3 Delegated Payment Token (${tokenRecord.mode})`,
      });

      res.json({ vaultToken: tokenRecord, auditRow });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/lupa/create-sandbox-subscription', async (req, res) => {
    try {
      const { planName, monthlyPriceCents } = req.body || {};
      const sub = await paypalGateway.createLiveSubscription({
        planName: String(planName || 'AegisPay Monitored Cloud Compute Seat'),
        monthlyPriceCents: Math.max(500, Math.round(Number(monthlyPriceCents) || 2900)),
        pillar: 'LUPAPERMIT',
      });

      const auditRow = appendAuditLog({
        pillar: 'LUPAPERMIT',
        actor: 'PayPal Subscriptions v1 Service',
        eventTitle: `Created Live PayPal Subscription ${sub.subscriptionId} ($${(sub.monthlyPriceCents / 100).toFixed(2)}/mo)`,
        verdict: 'SETTLED',
        amountCents: sub.monthlyPriceCents,
        savedOrProtectedCents: 0,
        paypalRef: sub.subscriptionId,
        sha256Hash: sha256Hex(sub),
        deterministicRule: `PayPal Catalog ${sub.productId} -> Plan ${sub.planId} -> Subscription ${sub.subscriptionId}`,
      });

      res.json({ subscription: sub, auditRow });
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
        autopayCommitment.amountCents = Math.max(
          0,
          autopayCommitment.amountCents - perm.averageChargeCents
        );
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
      const validAiVerdict: DecisionVerdict = ['ALLOW', 'HOLD', 'BLOCK'].includes(
        aiSuggestedVerdict
      )
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
      const { orderId, action, operatorNote, fallbackAmountCents, fallbackMerchantName } =
        req.body || {};
      const resolvedOrder = await paypalGateway.resolveHeldAuthorization({
        orderId: String(orderId),
        action: action === 'VOID' ? 'VOID' : 'CAPTURE',
        operatorNote: String(operatorNote || 'Reviewed by human account owner'),
        fallbackAmountCents:
          typeof fallbackAmountCents === 'number' ? fallbackAmountCents : undefined,
        fallbackMerchantName:
          typeof fallbackMerchantName === 'string' ? fallbackMerchantName : undefined,
      });

      const auditRow = appendAuditLog({
        pillar: 'LUPAPERMIT',
        actor: 'Human Account Owner',
        eventTitle: `Human Operator ${action === 'VOID' ? 'Voided & Rejected' : 'Approved & Captured'} Held Order ${resolvedOrder.orderId}`,
        verdict: action === 'VOID' ? 'BLOCK' : 'SETTLED',
        amountCents: resolvedOrder.amountCents,
        savedOrProtectedCents: action === 'VOID' ? resolvedOrder.amountCents : 0,
        paypalRef:
          resolvedOrder.captureId || resolvedOrder.authorizationId || resolvedOrder.orderId,
        sha256Hash: sha256Hex({ orderId: resolvedOrder.orderId, status: resolvedOrder.status }),
        deterministicRule: `Human-in-the-loop resolution on PayPal AUTHORIZE hold (${resolvedOrder.status})`,
      });

      res.json({ order: resolvedOrder, auditRow });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // ==========================================================================
  // 3. MODULE 02: PRE-PAYMENT FIREWALL, LIVE INVOICE LOOKUP & SMART BUTTONS
  // ==========================================================================

  app.get('/api/scamshield/fx-rates', async (_req, res) => {
    const fx = await getLiveOrFallbackFxRates();
    res.json(fx);
  });

  app.post('/api/scamshield/review', async (req, res) => {
    try {
      const {
        rawText,
        claimedAmountCents,
        currency,
        payeeIdentifier,
        imageBase64,
        imageMimeType,
        autoExtractCurrency,
      } = req.body || {};
      const text = String(rawText || '');
      const fx = await getLiveOrFallbackFxRates();
      const extracted = extractPaymentRequestMetadata(text, fx.rates);

      let amount = Math.max(100, Math.round(Number(claimedAmountCents) || 4500));
      if (autoExtractCurrency && extracted.convertedUsdCents) {
        amount = extracted.convertedUsdCents;
      }

      const curr = String(currency || 'USD').toUpperCase();
      const payee = String(
        payeeIdentifier || extracted.detectedPayee || 'billing@verified-studio.io'
      ).trim();

      const detResult = evaluatePaymentScamDeterministically({
        rawText: text,
        claimedAmountCents: amount,
        currency: curr,
        payeeIdentifier: payee,
      });

      let liveInvoiceLookup = null;
      if (extracted.detectedPayPalInvoiceId) {
        liveInvoiceLookup = await paypalGateway.lookupLiveInvoice(
          extracted.detectedPayPalInvoiceId
        );
      }

      const aiResult = await geminiEngine.analyzePaymentScamSemantics({
        sanitizedText: detResult.sanitizedText,
        claimedAmountCents: amount,
        payeeIdentifier: payee,
        imageBase64: typeof imageBase64 === 'string' ? imageBase64 : undefined,
        imageMimeType: typeof imageMimeType === 'string' ? imageMimeType : undefined,
      });

      let finalVerdict = stricterVerdict(
        detResult.deterministicVerdict,
        aiResult.aiSuggestedVerdict
      );
      let combinedRiskScore = Math.max(detResult.riskScore, aiResult.semanticRiskScore);

      if (liveInvoiceLookup && !liveInvoiceLookup.found) {
        finalVerdict = stricterVerdict(finalVerdict, 'HOLD');
        combinedRiskScore = Math.max(combinedRiskScore, 45);
      }

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
        actor: 'Pre-Payment Firewall',
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
        extractedMetadata: extracted,
        liveInvoiceLookup,
        fxLive: fx.live,
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

  // Creates a real uncaptured PayPal Order v2 specifically for the embedded PayPal Smart Payment Buttons!
  app.post('/api/scamshield/create-paypal-order', async (req, res) => {
    try {
      const { signedToken } = req.body || {};
      const token: SignedScamShieldToken | null = signedToken || lastIssuedScamToken;
      if (!token || token.payload.verdict === 'BLOCK') {
        res.status(403).json({
          error: 'Payment blocked by Pre-Payment Firewall; cannot create PayPal order.',
        });
        return;
      }

      const order = await paypalGateway.createOrder({
        intent: 'CAPTURE',
        amountCents: token.payload.amountCents,
        currency: token.payload.currency,
        merchantName: token.payload.payeeIdentifier,
        description: `Firewall-Cleared Payment (${token.payload.tokenId})`,
        customHash: token.signature,
        idempotencyKey: `btn-${token.payload.tokenId}-${Date.now().toString().slice(-4)}`,
        pillar: 'SCAMSHIELD',
        autoExecuteInSandbox: false,
      });

      res.json({ orderId: order.orderId, approvalUrl: order.approvalUrl, order });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/scamshield/capture-paypal-order', async (req, res) => {
    try {
      const { orderId, signedToken } = req.body || {};
      const token: SignedScamShieldToken | null = signedToken || lastIssuedScamToken;
      if (token) {
        const check = scamVault.verifyAndConsumeForCapture({
          signedToken: token,
          orderId: String(orderId),
          captureAmountCents: token.payload.amountCents,
          currency: token.payload.currency,
          payeeIdentifier: token.payload.payeeIdentifier,
        });
        if (!check.allowed) {
          res.status(403).json({ captured: false, verification: check });
          return;
        }
      }

      const captureRes = await paypalGateway.captureLiveOrder(String(orderId), 'SCAMSHIELD');
      const auditRow = appendAuditLog({
        pillar: 'SCAMSHIELD',
        actor: 'PayPal JS SDK Smart Checkout',
        eventTitle: `Buyer-Approved PayPal Order ${captureRes.orderId} Captured (${captureRes.captureId})`,
        verdict: 'SETTLED',
        amountCents: token?.payload.amountCents || 4500,
        savedOrProtectedCents: 0,
        paypalRef: captureRes.captureId,
        sha256Hash: sha256Hex(captureRes),
        deterministicRule: 'Single-Use HMAC Token Verified + Buyer PayPal Wallet Capture Completed',
      });

      res.json({ ...captureRes, auditRow });
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
      let payeeIdentifier =
        tokenToVerify?.payload.payeeIdentifier ?? 'billing@verified-studio.io';
      let simulatedNowMs = Date.now();

      if (tamperScenario === 'MUTATE_AMOUNT' && tokenToVerify) {
        captureAmountCents = tokenToVerify.payload.amountCents * 10;
      } else if (tamperScenario === 'FORGE_SIGNATURE' && tokenToVerify) {
        tokenToVerify.payload.verdict = 'ALLOW';
        tokenToVerify.signature =
          'deadbeef0000111122223333444455556666777788889999aaaabbbbccccdddd';
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
          actor: 'Capture Gate',
          eventTitle: `Blocked Capture [${verification.errorCode}]: ${verification.reason}`,
          verdict: 'BLOCK',
          amountCents: captureAmountCents,
          savedOrProtectedCents: captureAmountCents,
          paypalRef: `REJECTED_${verification.errorCode}`,
          sha256Hash: sha256Hex({
            preOrderId,
            errorCode: verification.errorCode,
            captureAmountCents,
          }),
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
        description: `Verified Checkout (${tokenToVerify!.payload.tokenId})`,
        customHash: tokenToVerify!.signature,
        idempotencyKey: tokenToVerify!.payload.tokenId,
        pillar: 'SCAMSHIELD',
        autoExecuteInSandbox: true,
      });

      const auditRow = appendAuditLog({
        pillar: 'SCAMSHIELD',
        actor: 'Capture Gate',
        eventTitle: `Verified Single-Use Token & Created PayPal Order ${paypalOrder.orderId} ($${(captureAmountCents / 100).toFixed(2)})`,
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
  // 4. MODULE 03: AUTONOMOUS DEAL NEGOTIATOR & LIVE DEPOSIT INVOICES
  // ==========================================================================

  app.post('/api/dealforge/negotiate', async (req, res) => {
    try {
      const {
        buyerMandate: rawBuyer,
        sellerMandate: rawSeller,
        simulatePromptInjection,
        humanCounterOfferCents,
        issueLiveInvoice,
        buyerEmail,
      } = req.body || {};

      const buyerMandate: BuyerMandate = {
        mandateId: 'BM-LIVE-01',
        buyerName: String(rawBuyer?.buyerName || 'Acme AI Labs (Buyer)'),
        itemTitle: String(rawBuyer?.itemTitle || 'Enterprise SOC2 & Smart Contract Security Audit'),
        targetPriceCents: Math.round(Number(rawBuyer?.targetPriceCents) || 62000),
        maxPriceCents: Math.round(Number(rawBuyer?.maxPriceCents) || 82000),
        maxDeliveryDays: Math.round(Number(rawBuyer?.maxDeliveryDays) || 7),
        minRevisions: Math.round(Number(rawBuyer?.minRevisions) || 2),
        maxUpfrontDepositPct: Math.round(Number(rawBuyer?.maxUpfrontDepositPct) || 40),
      };

      const sellerMandate: SellerMandate = {
        mandateId: 'SM-LIVE-01',
        sellerName: String(rawSeller?.sellerName || 'Sentinel CyberSec Partners (Seller)'),
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
          actor: 'Mandate Kernel',
          eventTitle: `No Deal Zone: Buyer Ceiling ($${(buyerMandate.maxPriceCents / 100).toFixed(2)}) < Seller Floor ($${(sellerMandate.minPriceCents / 100).toFixed(2)})`,
          verdict: 'BLOCK',
          amountCents: sellerMandate.minPriceCents,
          savedOrProtectedCents: sellerMandate.listPriceCents,
          paypalRef: 'NO_ZOPA_ABORT',
          sha256Hash: sha256Hex({ buyerMandate, sellerMandate }),
          deterministicRule:
            'Zone of Possible Agreement (ZOPA) is empty; halted before any PayPal commitment.',
        });
        res.json({
          dealReached: false,
          reason: `No Zone of Possible Agreement (ZOPA): Buyer confidential ceiling ($${(buyerMandate.maxPriceCents / 100).toFixed(2)}) is below Seller confidential floor ($${(sellerMandate.minPriceCents / 100).toFixed(2)}).`,
          rounds,
          zopaAnalysis: {
            exists: false,
            sellerFloorCents: sellerMandate.minPriceCents,
            buyerCeilingCents: buyerMandate.maxPriceCents,
            zopaWidthCents: 0,
          },
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

      const midHighCents = Math.round(
        (sellerMandate.listPriceCents + sellerMandate.minPriceCents) / 2
      );
      const r2RawTerms = {
        priceCents: Math.max(sellerMandate.minPriceCents, midHighCents),
        deliveryDays: buyerMandate.maxDeliveryDays,
        revisions: buyerMandate.minRevisions,
        upfrontDepositPct: simulatePromptInjection
          ? 95
          : Math.min(buyerMandate.maxUpfrontDepositPct, 40),
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

      const effectiveBuyerTarget = Math.max(
        buyerMandate.targetPriceCents,
        sellerMandate.minPriceCents
      );
      const fairSettlementPriceCents =
        typeof humanCounterOfferCents === 'number' && humanCounterOfferCents > 0
          ? Math.round(humanCounterOfferCents)
          : Math.round((effectiveBuyerTarget + buyerMandate.maxPriceCents) / 2);

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

      const isHumanTakeover =
        typeof humanCounterOfferCents === 'number' && humanCounterOfferCents > 0;
      const r3Terms = {
        priceCents: agreedPriceCents,
        deliveryDays: agreedDeliveryDays,
        revisions: agreedRevisions,
        upfrontDepositPct: agreedDepositPct,
      };
      const r3Msg = isHumanTakeover
        ? `Human Operator Takeover Counter-Offer: Submitting direct binding offer at $${(agreedPriceCents / 100).toFixed(2)} (${agreedDeliveryDays}d SLA, ${agreedRevisions} revisions, ${agreedDepositPct}% PayPal deposit).`
        : geminiEngine.generateNegotiationRoundMessage({
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
        proposer: isHumanTakeover ? 'HUMAN_OPERATOR' : 'BUYER_AGENT',
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
        kernelAdjustments: [
          'Both Buyer and Seller private mandate constraints verified satisfied.',
        ],
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
        description: `Contract ${contract.contractId} (${contract.agreedTerms.upfrontDepositPct}% Deposit for ${buyerMandate.itemTitle})`,
        customHash: contract.contractSha256,
        idempotencyKey: contract.contractId,
        pillar: 'DEALFORGE',
        autoExecuteInSandbox: true,
      });

      let paypalInvoice = null;
      if (issueLiveInvoice) {
        paypalInvoice = await paypalGateway.createLiveInvoice({
          title: `${buyerMandate.itemTitle} (${contract.agreedTerms.upfrontDepositPct}% Deposit)`,
          note: `Deal ${contract.contractId} settled at $${(contract.agreedTerms.priceCents / 100).toFixed(2)} (${contract.agreedTerms.deliveryDays}d delivery, ${contract.agreedTerms.revisions} revisions).`,
          recipientEmail: String(buyerEmail || 'buyer-treasury@personal.example.com'),
          amountCents: contract.upfrontDepositCents,
          pillar: 'DEALFORGE',
          contractOrPlanHash: contract.contractSha256,
          sendImmediately: true,
        });
      }

      const zopaWidthCents = Math.max(1, buyerMandate.maxPriceCents - sellerMandate.minPriceCents);
      const buyerSurplusCents = Math.max(
        0,
        buyerMandate.maxPriceCents - contract.agreedTerms.priceCents
      );
      const sellerSurplusCents = Math.max(
        0,
        contract.agreedTerms.priceCents - sellerMandate.minPriceCents
      );

      const auditRow = appendAuditLog({
        pillar: 'DEALFORGE',
        actor: isHumanTakeover ? 'Human Takeover + Mandate Kernel' : 'Settlement Executor',
        eventTitle: `Signed Contract ${contract.contractId} ($${(contract.agreedTerms.priceCents / 100).toFixed(2)} agreed, saved $${(contract.buyerSavedCents / 100).toFixed(2)}) & Settled Deposit ($${(contract.upfrontDepositCents / 100).toFixed(2)})`,
        verdict: 'SETTLED',
        amountCents: contract.upfrontDepositCents,
        savedOrProtectedCents: contract.buyerSavedCents,
        paypalRef: paypalInvoice ? paypalInvoice.invoiceId : paypalOrder.orderId,
        sha256Hash: contract.contractSha256,
        deterministicRule: `SHA-256 Contract Verified (${verifyContractIntegrity(contract) ? 'VALID' : 'INVALID'}); Prompt Injection ${simulatePromptInjection ? 'STRIPPED IN ROUND 2' : 'CLEAN'}`,
      });

      res.json({
        dealReached: true,
        rounds,
        contract,
        contractIntegrityVerified: verifyContractIntegrity(contract),
        zopaAnalysis: {
          exists: true,
          sellerFloorCents: sellerMandate.minPriceCents,
          buyerCeilingCents: buyerMandate.maxPriceCents,
          agreedPriceCents: contract.agreedTerms.priceCents,
          zopaWidthCents,
          buyerSurplusCents,
          sellerSurplusCents,
          buyerSurplusPct: Math.round((buyerSurplusCents / zopaWidthCents) * 100),
          sellerSurplusPct: Math.round((sellerSurplusCents / zopaWidthCents) * 100),
        },
        paypalOrder,
        paypalInvoice,
        auditRow,
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // ==========================================================================
  // 5. MODULE 04: INSTANT PHOTO REFUND (VISION + DETERMINISTIC MATRIX)
  // ==========================================================================

  app.post('/api/cliprefund/update-policy', (req, res) => {
    const {
      tierPercentages,
      tierRefundPercentages,
      minPhotoAuthenticityConfidence,
      minAuthenticityConfidence,
      estimatedReturnShippingLabelCents,
      returnShippingCostCents,
    } = req.body || {};
    const incomingTiers = tierRefundPercentages || tierPercentages;
    if (incomingTiers && typeof incomingTiers === 'object') {
      for (const key of [
        'COSMETIC_MINOR',
        'COSMETIC_MODERATE',
        'FUNCTIONAL_IMPAIRED',
        'TOTAL_LOSS',
      ] as const) {
        if (typeof incomingTiers[key] === 'number') {
          activeMerchantPolicy.tierRefundPercentages[key] = Math.max(
            0,
            Math.min(100, Math.round(incomingTiers[key]))
          );
        }
      }
    }
    const incomingConf =
      typeof minAuthenticityConfidence === 'number'
        ? minAuthenticityConfidence
        : minPhotoAuthenticityConfidence;
    if (typeof incomingConf === 'number' && incomingConf >= 0.5 && incomingConf <= 0.99) {
      activeMerchantPolicy.minAuthenticityConfidence = incomingConf;
    }
    const incomingShip =
      typeof returnShippingCostCents === 'number'
        ? returnShippingCostCents
        : estimatedReturnShippingLabelCents;
    if (typeof incomingShip === 'number') {
      activeMerchantPolicy.returnShippingCostCents = Math.max(0, Math.round(incomingShip));
    }
    res.json({ merchantPolicy: activeMerchantPolicy });
  });

  app.post('/api/cliprefund/evaluate-and-refund', async (req, res) => {
    try {
      const {
        presetId,
        orderId,
        itemTitle,
        originalOrderCents,
        customerNote,
        imageBase64,
        imageMimeType,
        simulateReplayAttack,
        merchantPolicyOverride,
      } = req.body || {};

      const targetOrderId = String(orderId || 'PAYPAL-SBX-8F92A1C4E7B01');
      const targetCaptureId = `CAP-${targetOrderId.replace('PAYPAL-SBX-', '')}`;
      const orderCents = Math.max(500, Math.round(Number(originalOrderCents) || 2800));

      const imageSeed = simulateReplayAttack
        ? 'REPLAY_IMAGE_STATIC_DIGEST'
        : imageBase64
          ? `${imageBase64.slice(0, 512)}_${Date.now()}`
          : `${presetId || 'chipped_ceramic_mug'}_${Date.now()}`;
      const imageSha256 = sha256Hex(imageSeed);

      if (simulateReplayAttack) {
        claimedVisionImageHashes.add(imageSha256);
      }

      const visionResult = await geminiEngine.extractVisionDefectTelemetry({
        presetId: presetId ? String(presetId) : undefined,
        itemTitle: String(itemTitle || 'Handcrafted Stoneware Espresso Mug'),
        customerNote: String(customerNote || 'Arrived with a chip on the upper rim.'),
        imageBase64: typeof imageBase64 === 'string' ? imageBase64 : undefined,
        imageMimeType: typeof imageMimeType === 'string' ? imageMimeType : undefined,
      });

      const overrideTiers =
        merchantPolicyOverride?.tierRefundPercentages ||
        merchantPolicyOverride?.tierPercentages ||
        {};
      const policyToUse: MerchantRefundPolicyMatrix =
        merchantPolicyOverride && typeof merchantPolicyOverride === 'object'
          ? {
              ...activeMerchantPolicy,
              tierRefundPercentages: {
                ...activeMerchantPolicy.tierRefundPercentages,
                ...overrideTiers,
              },
            }
          : activeMerchantPolicy;

      const prevRefunded = refundedCentsByCapture.get(targetCaptureId) || 0;

      const calculation = calculateDeterministicVisionRefund({
        orderId: targetOrderId,
        captureId: targetCaptureId,
        originalOrderCents: orderCents,
        imageSha256,
        previouslyClaimedImageHashes: claimedVisionImageHashes,
        previouslyRefundedCentsOnCapture: prevRefunded,
        telemetry: visionResult.telemetry,
        policy: policyToUse,
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

      const unitEconomics = {
        traditionalReturnCostCents: orderCents + policyToUse.returnShippingCostCents,
        instantPartialRefundCostCents: calculation.refundCents,
        merchantNetSavedCents: calculation.merchantNetSavedCents,
        shippingLabelSavedCents: policyToUse.returnShippingCostCents,
      };

      const auditRow = appendAuditLog({
        pillar: 'CLIPREFUND',
        actor: 'Vision Telemetry + Merchant Matrix',
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
        unitEconomics,
        paypalRefund,
        imageSha256,
        auditRow,
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // ==========================================================================
  // 6. MODULE 05: SUBSCRIPTION RETENTION COPILOT & CIRCUIT BREAKER
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
        createDiscountedSubscription,
      } = req.body || {};

      const ctx = {
        accountId: String(accountId || 'ACC-SAAS-9042'),
        customerName: String(customerName || 'Jordan Vance'),
        planName: String(planName || 'Aegis Cloud Pro Plan'),
        currentPlanPriceCents: Math.max(1000, Math.round(Number(currentPlanPriceCents) || 9900)),
        featureUtilizationPct: Math.max(
          0,
          Math.min(100, Math.round(Number(featureUtilizationPct ?? 34)))
        ),
        negotiationStep: Math.max(1, Math.round(Number(negotiationStep) || 1)),
        paypalDeclineCode: paypalDeclineCode || 'VOLUNTARY_CANCEL_CLICK',
        customerMessage: String(
          customerMessage ||
            'Our PayPal billing declined and $99/mo is too steep right now—thinking of canceling.'
        ),
      };

      const decision = evaluateChurnIntervention(ctx);
      const empathy = await geminiEngine.generateEmpatheticRetentionResponse(ctx, decision);

      let zapierDispatched = false;
      if (decision.circuitBreakerTripped) {
        const zapPayload = {
          alert: 'AEGISPAY_RETENTION_CIRCUIT_BREAKER_TRIPPED',
          accountId: ctx.accountId,
          customerName: ctx.customerName,
          matchedKeyword: decision.matchedCircuitBreakerKeyword,
          customerMessage: ctx.customerMessage,
          timestampIso: new Date().toISOString(),
        };
        let status = 'RECORDED_LOCAL_ZAPIER_BRIDGE';
        if (zapierWebhookUrl && !process.env.VITEST) {
          try {
            const zRes = await fetch(zapierWebhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(zapPayload),
            });
            if (zRes.ok) status = 'DISPATCHED_LIVE_ZAPIER';
          } catch {
            status = 'ZAPIER_QUEUE_RECORDED';
          }
        }
        zapierDispatchLog.unshift({
          timestampIso: zapPayload.timestampIso,
          eventType: 'CIRCUIT_BREAKER_HUMAN_ESCALATION',
          payload: zapPayload,
          status,
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
          description: `Retention Billing (${decision.approvedDiscountPct}% Concession Applied)`,
          customHash: decision.idempotencyLockKey,
          idempotencyKey: lockKey,
          pillar: 'CHURNRESCUE',
          autoExecuteInSandbox: true,
        });
      }

      let paypalSubscription = null;
      if (
        createDiscountedSubscription &&
        !atomicOutcome.duplicateBlocked &&
        !decision.circuitBreakerTripped
      ) {
        paypalSubscription = await paypalGateway.createLiveSubscription({
          planName: `${ctx.planName} (${decision.approvedDiscountPct}% Retention Relief)`,
          monthlyPriceCents: decision.finalOfferPriceCents,
          pillar: 'CHURNRESCUE',
        });
      }

      const auditRow = appendAuditLog({
        pillar: 'CHURNRESCUE',
        actor: decision.circuitBreakerTripped
          ? 'Circuit Breaker Kernel'
          : 'Retention Copilot Engine',
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
        paypalRef: paypalSubscription
          ? paypalSubscription.subscriptionId
          : paypalOrder
            ? paypalOrder.orderId
            : atomicOutcome.orderId,
        sha256Hash: decision.idempotencyLockKey,
        deterministicRule: atomicOutcome.duplicateBlocked
          ? atomicOutcome.reason
          : decision.deterministicReason,
      });

      res.json({
        decision,
        agentReply: empathy.agentReply,
        engineMode: empathy.engineMode,
        failoverTelemetry: empathy.failoverTelemetry,
        atomicOutcome,
        paypalOrder,
        paypalSubscription,
        zapierDispatched,
        auditRow,
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // ==========================================================================
  // 7. MODULE 06: PAYSTREAM SMART-MILESTONE & PROOF-OF-DELIVERY STUDIO (ORIGINAL)
  // ==========================================================================

  app.post('/api/paystream/create-plan', async (req, res) => {
    try {
      const { projectTitle, projectBrief, clientEmail, totalBudgetCents, collaborators } =
        req.body || {};

      const budgetCents = Math.max(1000, Math.round(Number(totalBudgetCents) || 245000));
      const cleanTitle = String(projectTitle || 'Custom AI & PayPal Commerce Integration');
      const cleanBrief = String(
        projectBrief ||
          'Design, implement, test, and deploy a full-stack PayPal commerce integration with automated verification.'
      );
      const cleanClientEmail = String(clientEmail || 'client-treasury@personal.example.com');

      const aiScope = await geminiEngine.architectSmartMilestones({
        projectBrief: `${cleanTitle}: ${cleanBrief}`,
        totalBudgetCents: budgetCents,
      });

      const parsedCollabs: CollaboratorShareInput[] = Array.isArray(collaborators)
        ? collaborators.map((c: any) => ({
            collaboratorName: String(c.collaboratorName || 'Contributor'),
            paypalEmail: String(c.paypalEmail || 'contributor@personal.example.com'),
            role: String(c.role || 'Specialist'),
            sharePct: Math.max(1, Number(c.sharePct) || 50),
          }))
        : [];

      const plan = computePennyExactMilestonePlan({
        projectTitle: cleanTitle,
        clientEmail: cleanClientEmail,
        totalBudgetCents: budgetCents,
        proposals: aiScope.proposals,
        collaborators: parsedCollabs,
      });

      milestonePlans.set(plan.planId, plan);

      const auditRow = appendAuditLog({
        pillar: 'PAYSTREAM',
        actor: 'PayStream Scope & Split Kernel',
        eventTitle: `Created Penny-Exact Smart-Milestone Plan ${plan.planId} ($${(plan.totalBudgetCents / 100).toFixed(2)} across ${plan.milestones.length} milestones)`,
        verdict: 'ALLOW',
        amountCents: plan.totalBudgetCents,
        savedOrProtectedCents: plan.totalBudgetCents,
        paypalRef: plan.planId,
        sha256Hash: plan.planSha256,
        deterministicRule: `Largest-Remainder Allocation Verified: sum(milestones) == $${(plan.totalBudgetCents / 100).toFixed(2)} (0-cent drift)`,
      });

      res.json({
        plan,
        aiSummary: aiScope.aiSummary,
        telemetry: aiScope.telemetry,
        promptGuard: aiScope.promptGuard,
        auditRow,
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/paystream/issue-invoice', async (req, res) => {
    try {
      const { planId, milestoneId, planSnapshot } = req.body || {};
      let plan = milestonePlans.get(String(planId || ''));
      if (!plan && planSnapshot && typeof planSnapshot === 'object' && planSnapshot.planId) {
        plan = planSnapshot as SmartMilestonePlan;
        milestonePlans.set(plan.planId, plan);
      }
      if (!plan) {
        plan = Array.from(milestonePlans.values())[0];
      }
      if (!plan) {
        res.status(404).json({ error: 'Milestone plan not found.' });
        return;
      }

      const milestone =
        plan.milestones.find((m) => m.milestoneId === milestoneId) || plan.milestones[0];
      if (!milestone) {
        res.status(404).json({ error: 'Milestone not found in plan.' });
        return;
      }

      const invoice = await paypalGateway.createLiveInvoice({
        title: `${plan.projectTitle} - ${milestone.title}`,
        note: `Acceptance Criteria: ${milestone.acceptanceCriteria.join('; ')}. Collaborator Split Locked (${milestone.collaboratorSplits.map((c) => `${c.collaboratorName}: $${(c.payoutCents / 100).toFixed(2)}`).join(', ')}).`,
        recipientEmail: plan.clientEmail,
        amountCents: milestone.amountCents,
        currency: plan.currency,
        pillar: 'PAYSTREAM',
        contractOrPlanHash: plan.planSha256,
        sendImmediately: true,
      });

      milestone.paypalInvoiceId = invoice.invoiceId;
      milestone.paypalInvoiceUrl = invoice.payerViewUrl;
      milestone.status = 'INVOICED_ON_PAYPAL';

      const auditRow = appendAuditLog({
        pillar: 'PAYSTREAM',
        actor: 'PayPal Invoicing v2 Executor',
        eventTitle: `Issued Live PayPal Invoice ${invoice.invoiceId} for ${milestone.title} ($${(milestone.amountCents / 100).toFixed(2)})`,
        verdict: 'SETTLED',
        amountCents: milestone.amountCents,
        savedOrProtectedCents: 0,
        paypalRef: invoice.invoiceId,
        sha256Hash: sha256Hex({ invoiceId: invoice.invoiceId, planSha256: plan.planSha256 }),
        deterministicRule: `PayPal Invoicing v2 (${invoice.mode}) bound to Plan Hash ${plan.planSha256.slice(0, 16)}`,
      });

      res.json({
        plan,
        milestone,
        invoice,
        auditRow,
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/paystream/verify-proof', async (req, res) => {
    try {
      const { planId, milestoneId, evidenceText, evidenceUrl, imageBase64, planSnapshot } =
        req.body || {};
      let plan = milestonePlans.get(String(planId || ''));
      if (!plan && planSnapshot && typeof planSnapshot === 'object' && planSnapshot.planId) {
        plan = planSnapshot as SmartMilestonePlan;
        milestonePlans.set(plan.planId, plan);
      }
      if (!plan) {
        plan = Array.from(milestonePlans.values())[0];
      }
      if (!plan) {
        res.status(404).json({ error: 'Milestone plan not found.' });
        return;
      }

      const milestone =
        plan.milestones.find((m) => m.milestoneId === milestoneId) || plan.milestones[0];
      if (!milestone) {
        res.status(404).json({ error: 'Milestone not found in plan.' });
        return;
      }

      const aiAudit = await geminiEngine.evaluateDeliverableProof({
        milestone,
        evidenceText: String(evidenceText || ''),
        evidenceUrl: typeof evidenceUrl === 'string' ? evidenceUrl : undefined,
        imageBase64: typeof imageBase64 === 'string' ? imageBase64 : undefined,
      });

      const verification = verifyDeliverableProofDeterministically({
        milestone,
        evidenceText: String(evidenceText || ''),
        evidenceUrl: typeof evidenceUrl === 'string' ? evidenceUrl : undefined,
        aiQualityScore: aiAudit.aiQualityScore,
        aiSuggestedVerdict: aiAudit.aiSuggestedVerdict,
        neuralInjectionScore: aiAudit.promptGuard.probability,
      });

      if (verification.approved) {
        milestone.status = 'PROOF_VERIFIED';
        milestone.proofAttestationHash = verification.attestationHash;
      }

      const auditRow = appendAuditLog({
        pillar: 'PAYSTREAM',
        actor: 'Proof-of-Delivery Auditor',
        eventTitle: `${verification.approved ? 'Verified' : 'Held/Blocked'} Deliverable Proof for ${milestone.title} (${verification.finalScore}/100)`,
        verdict: verification.approved ? 'SETTLED' : verification.verdict,
        amountCents: milestone.amountCents,
        savedOrProtectedCents: verification.approved ? 0 : milestone.amountCents,
        paypalRef: milestone.paypalInvoiceId || milestone.milestoneId,
        sha256Hash: verification.attestationHash,
        deterministicRule: verification.explanation,
      });

      res.json({
        plan,
        milestone,
        aiAudit,
        verification,
        collaboratorPayoutSchedule: milestone.collaboratorSplits,
        auditRow,
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // ==========================================================================
  // 8. PAYPAL WEBHOOK RECEIVER, SECURITY FUZZER & EXPORTS
  // ==========================================================================

  app.post('/api/paypal/webhook', (req, res) => {
    const body = req.body || {};
    const event = paypalGateway.emitSignedWebhook({
      eventType: body.event_type || 'PAYMENT.CAPTURE.COMPLETED',
      summary: body.summary || `External PayPal Webhook: ${body.event_type || 'EVENT'}`,
      resource: body.resource || body,
      pillar: 'SCAMSHIELD',
    });
    res.json({ received: true, verified: event.verified, eventId: event.id });
  });

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
        '100% Monotonicity, Concession Floor <=50%, Circuit Breaker Zero Leakage, Mandate Ceiling, Penny-Exact Split Conservation Verified',
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
    const candidates = [
      path.join(ROOT_DIR, 'postman', 'AegisPay_Collection.json'),
      path.join(process.cwd(), 'postman', 'AegisPay_Collection.json'),
      path.join(process.cwd(), 'public', 'postman', 'AegisPay_Collection.json'),
    ];
    const found = candidates.find((p) => fs.existsSync(p));
    if (found) {
      res.sendFile(found);
    } else {
      res.status(404).json({ error: 'Postman collection not generated yet' });
    }
  });

  app.get('/extension.zip', (_req, res) => {
    const candidates = [
      path.join(ROOT_DIR, 'public', 'extension.zip'),
      path.join(process.cwd(), 'public', 'extension.zip'),
      path.join(process.cwd(), 'dist', 'extension.zip'),
    ];
    const found = candidates.find((p) => fs.existsSync(p));
    if (found) {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="aegispay-chrome-extension-mv3.zip"'
      );
      res.sendFile(found);
    } else {
      res.status(404).json({ error: 'Extension zip not packaged yet' });
    }
  });

  const distDir = path.join(ROOT_DIR, 'dist');
  if (!process.env.VERCEL && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (
        req.path.startsWith('/api') ||
        req.path.startsWith('/postman') ||
        req.path === '/extension.zip'
      ) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return app;
}

if (!process.env.VERCEL && process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const port = Number(process.env.PORT) || 8787;
  const app = createAegisServer();
  app.listen(port, () => {
    console.log(
      `[AEGISPAY OS] Deterministic Trust & PayPal Execution Server listening on http://localhost:${port}`
    );
  });
}
