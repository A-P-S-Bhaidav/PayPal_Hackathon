import React from 'react';

export interface OperatorProfile {
  id: string;
  email: string;
  fullName: string;
  organization: string;
  role: 'PRINCIPAL_ARCHITECT' | 'TREASURY_OPERATOR' | 'SECURITY_AUDITOR' | 'DEMO_OPERATOR';
  authProvider: string;
  paypalMerchantId: string;
  authenticatedAtIso: string;
}

export interface WorkspaceState {
  system: {
    name: string;
    version: string;
    tagline: string;
    paypal: {
      hasLiveSandboxCredentials: boolean;
      publicClientId: string;
      clientIdPreview: string;
      appId: string;
      webhookVerificationConfigured: boolean;
      environment: 'sandbox' | 'live';
      activeMode: 'LIVE_PAYPAL_SANDBOX_API' | 'CRYPTOGRAPHIC_SANDBOX_EMULATOR';
      totalOrdersTracked: number;
      totalInvoicesTracked: number;
      totalVaultTokens: number;
      totalSubscriptionsTracked: number;
      totalWebhooksVerified: number;
    };
    gemini: {
      hasLiveGeminiKey: boolean;
      hasLiveGroqKey: boolean;
      primaryModel: string;
      failoverTextModel: string;
      failoverVisionModel: string;
      simulateRateLimit: boolean;
      activeMode: string;
      totalFailoversTriggered: number;
    };
    zapierConfigured: boolean;
    googleOAuth: {
      configured: boolean;
      clientIdPreview: string;
    };
    security: {
      rateLimits: Record<string, { tierName: string; windowMs: number; maxRequests: number }>;
      storage: {
        engine: string;
        encryptionAndHashing: string;
        tenantIsolation: string;
        registeredUsersCount: number;
        isolatedWorkspacesCount: number;
        activeTenantId: string | null;
      };
    };
  };
  operator: OperatorProfile | null;
  workspace: {
    tenantId: string;
    tutorialCompleted: boolean;
  };
  kpis: {
    totalProtectedCents: number;
    zombieAnnualExposureCents: number;
    recoverableMonthlyCents: number;
    activeAgentPermits: number;
    heldOrdersPendingApproval: number;
    totalAuditRecords: number;
    livePayPalInvoicesCount: number;
    activeMilestonePlansCount: number;
    payreviveDecisionsCount: number;
  };
  lupa: {
    billingPermissions: Array<{
      agreementId: string;
      merchantName: string;
      category: string;
      monthlyCapCents: number;
      averageChargeCents: number;
      lastChargedDaysAgo: number;
      lastUserInteractionDaysAgo: number;
      status: string;
    }>;
    zombieReport: {
      audits: Array<{
        agreementId: string;
        merchantName: string;
        isZombie: boolean;
        riskLevel: string;
        reasons: string[];
        recommendedAction: string;
        annualizedExposureCents: number;
      }>;
      totalZombieCount: number;
      totalAnnualExposureCents: number;
      recoverableMonthlyCents: number;
    };
    cashflowCommitments: Array<{
      id: string;
      name: string;
      amountCents: number;
      dueInDays: number;
      category: string;
      mandatory: boolean;
    }>;
    currentCheckingBalanceCents: number;
    minimumSafetyBufferCents: number;
    defaultAffordability: {
      itemTitle: string;
      proposedSpendCents: number;
      trueFreeCashflowCents: number;
      postPurchaseFreeCashflowCents: number;
      verdict: 'ALLOW' | 'HOLD' | 'BLOCK';
      recommendedAgentCapCents: number;
      deterministicExplanation: string;
    };
    agentPermits: Array<{
      permitId: string;
      agentId: string;
      agentName: string;
      maxSingleTransactionCents: number;
      dailyLimitCents: number;
      spentTodayCents: number;
      autoAllowMaxCents: number;
      minConfidenceScore: number;
      allowedCategories: string[];
      active: boolean;
    }>;
    vaultTokens: Array<{
      setupTokenId: string;
      agentName: string;
      maxSingleCents: number;
      status: string;
      approvalUrl: string;
      mode: string;
    }>;
    subscriptions: Array<{
      subscriptionId: string;
      planName: string;
      monthlyPriceCents: number;
      status: string;
      approvalUrl: string;
      mode: string;
    }>;
  };
  cliprefund: {
    merchantPolicy: {
      merchantName: string;
      returnShippingCostCents: number;
      tierRefundPercentages: Record<string, number>;
      minAuthenticityConfidence: number;
    };
  };
  paystream: {
    plans: Array<{
      planId: string;
      projectTitle: string;
      clientEmail: string;
      currency: string;
      totalBudgetCents: number;
      pennyExactVerified: boolean;
      planSha256: string;
      milestones: Array<{
        milestoneIndex: number;
        milestoneId: string;
        title: string;
        normalizedSharePct: number;
        amountCents: number;
        dueInDays: number;
        acceptanceCriteria: string[];
        status: string;
        paypalInvoiceId?: string;
        paypalInvoiceUrl?: string;
        collaboratorSplits: Array<{
          collaboratorName: string;
          paypalEmail: string;
          role: string;
          normalizedSharePct: number;
          payoutCents: number;
        }>;
      }>;
    }>;
    invoices: Array<{
      invoiceId: string;
      invoiceNumber: string;
      status: string;
      amountCents: number;
      recipientEmail: string;
      title: string;
      payerViewUrl: string;
      mode: string;
    }>;
  };
  payrevive: {
    modelCard?: {
      modelId: string;
      algorithm: string;
      numTrees: number;
      heldOutRocAuc: number;
      heldOutBrierScore: number;
      heldOutLogLoss: number;
      trainingSamples: number;
      heldOutTestSamples: number;
    };
    presets: Array<{
      presetId: string;
      label: string;
      summary: string;
      event: Record<string, any>;
    }>;
    actionCatalog: Array<Record<string, any>>;
    decisions: Array<Record<string, any>>;
    lastBenchmark: Record<string, any> | null;
  };
  orders: Array<{
    orderId: string;
    intent: string;
    status: string;
    paypalServerStatus: string;
    settlementStage: string;
    amountCents: number;
    currency: string;
    merchantName: string;
    description: string;
    approvalUrl: string;
    mode: string;
    createdAtIso: string;
  }>;
  invoices: Array<{
    invoiceId: string;
    invoiceNumber: string;
    status: string;
    amountCents: number;
    recipientEmail: string;
    title: string;
    payerViewUrl: string;
    mode: string;
    createdAtIso: string;
  }>;
  webhooks: Array<{
    id: string;
    event_type: string;
    summary: string;
    transmission_id: string;
    transmission_sig: string;
    verified: boolean;
    verificationMethod: string;
    create_time: string;
  }>;
  auditLogs: Array<{
    id: string;
    timestampIso: string;
    pillar: string;
    actor: string;
    eventTitle: string;
    verdict: string;
    amountCents: number;
    savedOrProtectedCents: number;
    paypalRef: string;
    sha256Hash: string;
    deterministicRule: string;
  }>;
}

export function fmtUsd(cents: number): string {
  const safe = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe / 100);
}

/**
 * Secure API helper: uses HttpOnly session cookies (`credentials: 'include'`)
 * and sends `X-Requested-With: AegisPay-Client` for CSRF defense.
 * Zero session tokens are ever written to `localStorage`!
 */
export async function apiFetch<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('X-Requested-With', 'AegisPay-Client');
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`) as Error & {
      status?: number;
      data?: unknown;
    };
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export const AegisBrandMark: React.FC<{ size?: number }> = ({ size = 34 }) =>
  React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 64 64',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      'aria-hidden': 'true',
      className: 'shrink-0',
    },
    React.createElement('rect', {
      x: '3',
      y: '3',
      width: '58',
      height: '58',
      rx: '6',
      fill: '#050507',
      stroke: '#0047FF',
      strokeWidth: '3',
    }),
    React.createElement('path', {
      d: 'M32 11L50 19V33C50 43.8 42.3 51.6 32 55C21.7 51.6 14 43.8 14 33V19L32 11Z',
      fill: '#0047FF',
      fillOpacity: '0.22',
      stroke: '#0047FF',
      strokeWidth: '2.6',
    }),
    React.createElement('path', {
      d: 'M23 34L29.5 40.5L42 26',
      stroke: '#CCFF00',
      strokeWidth: '4.2',
      strokeLinecap: 'square',
    }),
    React.createElement('rect', {
      x: '6',
      y: '6',
      width: '6',
      height: '6',
      fill: '#CCFF00',
    })
  );

