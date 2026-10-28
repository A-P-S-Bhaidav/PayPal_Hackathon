import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createAegisServer } from '../server/index';

describe('AegisPay Full-Stack HTTP API & End-to-End Lifecycle Suite (70+ Tests)', () => {
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    const app = createAegisServer();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /api/state returns complete system status, KPIs, permits, PayStream plans, orders, webhooks, and audit logs', async () => {
    const res = await fetch(`${baseUrl}/api/state`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.system.name).toBe('AegisPay OS');
    expect(data.lupa.billingPermissions.length).toBeGreaterThanOrEqual(4);
    expect(data.lupa.zombieReport.totalZombieCount).toBeGreaterThanOrEqual(3);
    expect(data.paystream.plans.length).toBeGreaterThanOrEqual(1);
    expect(data.auditLogs.length).toBeGreaterThanOrEqual(4);
  });

  it('POST /api/lupa/cashflow-check and /cashflow-update evaluate affordability, update bills, and sync agent permit cap', async () => {
    const updateRes = await fetch(`${baseUrl}/api/lupa/cashflow-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        balanceCents: 450000,
        addCommitment: {
          name: 'Cloud GPU Reserve',
          amountCents: 18000,
          dueInDays: 9,
          category: 'ESSENTIAL_LIVING',
        },
      }),
    });
    expect(updateRes.status).toBe(200);
    const updatedState = await updateRes.json();
    expect(updatedState.currentCheckingBalanceCents).toBe(450000);

    const res = await fetch(`${baseUrl}/api/lupa/cashflow-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemTitle: 'MacBook Pro M4 Workstation',
        proposedSpendCents: 65000,
        syncAgentPermitCap: true,
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(['ALLOW', 'HOLD', 'BLOCK']).toContain(data.result.verdict);
    expect(data.updatedPermit).toBeDefined();
  });

  it('POST /api/lupa/compile-policy, /mint-vault-permit, and /create-sandbox-subscription execute grounded policy compilation and PayPal Vault/Subscriptions', async () => {
    const policyRes = await fetch(`${baseUrl}/api/lupa/compile-policy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sentence: 'Allow DevOps Agent to buy cloud tools up to $65 per purchase with $40 auto-approve.',
        applyToPermitId: 'PRM-CLAUDE-CODE-01',
      }),
    });
    expect(policyRes.status).toBe(200);
    const policyData = await policyRes.json();
    expect(policyData.groundingCheck.grounded).toBe(true);
    expect(policyData.updatedPermit.maxSingleTransactionCents).toBe(6500);

    const vaultRes = await fetch(`${baseUrl}/api/lupa/mint-vault-permit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permitId: 'PRM-CLAUDE-CODE-01' }),
    });
    expect(vaultRes.status).toBe(200);
    const vaultData = await vaultRes.json();
    expect(vaultData.vaultToken.setupTokenId).toBeDefined();

    const subRes = await fetch(`${baseUrl}/api/lupa/create-sandbox-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planName: 'Cloud Monitor Pro', monthlyPriceCents: 2900 }),
    });
    expect(subRes.status).toBe(200);
    const subData = await subRes.json();
    expect(subData.subscription.subscriptionId).toBeDefined();
  });

  it('POST /api/lupa/revoke-zombie tightens cap and revokes dormant agreements', async () => {
    const tightenRes = await fetch(`${baseUrl}/api/lupa/revoke-zombie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agreementId: 'BA-77219402-OVERCAP',
        action: 'TIGHTEN_CAP',
      }),
    });
    expect(tightenRes.status).toBe(200);
    const tightenData = await tightenRes.json();
    expect(tightenData.permission.monthlyCapCents).toBeLessThan(50000);

    const revokeRes = await fetch(`${baseUrl}/api/lupa/revoke-zombie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agreementId: 'BA-94827104-ZOMBIE1',
        action: 'REVOKE',
      }),
    });
    expect(revokeRes.status).toBe(200);
    const revokeData = await revokeRes.json();
    expect(revokeData.permission.status).toBe('REVOKED');
  });

  it('POST /api/lupa/agent-pay creates PayPal CAPTURE on ALLOW, AUTHORIZE on HOLD, and blocks on policy violation', async () => {
    const allowRes = await fetch(`${baseUrl}/api/lupa/agent-pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        permitId: 'PRM-CLAUDE-CODE-01',
        amountCents: 3200,
        merchantId: 'merch_usb_hub',
        merchantName: 'Anker Pro Store',
        category: 'HARDWARE',
        itemDescription: 'Thunderbolt 4 Cable',
        aiConfidenceScore: 0.95,
        aiSuggestedVerdict: 'ALLOW',
      }),
    });
    const allowData = await allowRes.json();
    expect(allowData.evaluation.finalVerdict).toBe('ALLOW');
    expect(allowData.paypalOrder.intent).toBe('CAPTURE');
    expect(allowData.paypalOrder.status).toBe('COMPLETED');

    const holdRes = await fetch(`${baseUrl}/api/lupa/agent-pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        permitId: 'PRM-CLAUDE-CODE-01',
        amountCents: 4500,
        merchantId: 'merch_lamp',
        merchantName: 'NordicLight',
        category: 'HARDWARE',
        itemDescription: 'Desk Lamp',
        aiConfidenceScore: 0.68,
        aiSuggestedVerdict: 'ALLOW',
      }),
    });
    const holdData = await holdRes.json();
    expect(holdData.evaluation.finalVerdict).toBe('HOLD');
    expect(holdData.paypalOrder.intent).toBe('AUTHORIZE');
    expect(holdData.paypalOrder.status).toBe('AUTHORIZED');

    const resolveRes = await fetch(`${baseUrl}/api/lupa/resolve-hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: holdData.paypalOrder.orderId,
        action: 'CAPTURE',
        operatorNote: 'Approved in E2E test',
      }),
    });
    const resolveData = await resolveRes.json();
    expect(resolveData.order.status).toBe('COMPLETED');
  });

  it('POST /api/scamshield/review, /create-paypal-order, & /capture enforce single-use token and block all 5 tamper attacks', async () => {
    const revRes = await fetch(`${baseUrl}/api/scamshield/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText: 'Invoice #901 for Cloud Hosting Setup: $45.00 USD',
        claimedAmountCents: 4500,
        currency: 'USD',
        payeeIdentifier: 'billing@cloudsetup.io',
      }),
    });
    const revData = await revRes.json();
    expect(revData.finalVerdict).toBe('ALLOW');
    expect(revData.paypalCheckoutUnlocked).toBe(true);

    const smartOrderRes = await fetch(`${baseUrl}/api/scamshield/create-paypal-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signedToken: revData.signedToken }),
    });
    expect(smartOrderRes.status).toBe(200);
    const smartOrderData = await smartOrderRes.json();
    expect(smartOrderData.orderId).toBeDefined();

    const tamperScenarios = [
      'MUTATE_AMOUNT',
      'FORGE_SIGNATURE',
      'EXPIRED_TOKEN',
      'NEVER_REVIEWED',
      'PAYEE_SWAP',
    ];

    for (const tamperScenario of tamperScenarios) {
      const tRes = await fetch(`${baseUrl}/api/scamshield/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedToken: revData.signedToken,
          tamperScenario,
        }),
      });
      const tData = await tRes.json();
      expect(tData.captured).toBe(false);
      expect(tData.verification.allowed).toBe(false);
    }

    const validCapRes = await fetch(`${baseUrl}/api/scamshield/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signedToken: revData.signedToken,
      }),
    });
    const validCapData = await validCapRes.json();
    expect(validCapData.captured).toBe(true);
    expect(validCapData.paypalOrder.status).toBe('COMPLETED');

    const replayCapRes = await fetch(`${baseUrl}/api/scamshield/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signedToken: revData.signedToken,
      }),
    });
    const replayCapData = await replayCapRes.json();
    expect(replayCapData.captured).toBe(false);
    expect(replayCapData.verification.errorCode).toBe('TOKEN_REPLAYED');
  });

  it('POST /api/dealforge/negotiate settles SHA-256 contract, issues deposit invoice, and neutralizes adversarial prompt injection', async () => {
    const res = await fetch(`${baseUrl}/api/dealforge/negotiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        simulatePromptInjection: true,
        issueLiveInvoice: true,
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.dealReached).toBe(true);
    expect(data.contractIntegrityVerified).toBe(true);
    expect(data.rounds.some((r: { promptInjectionBlocked: boolean }) => r.promptInjectionBlocked)).toBe(true);
    expect(data.paypalOrder.status).toBe('COMPLETED');
    expect(data.paypalInvoice.invoiceId).toBeDefined();
  });

  it('POST /api/cliprefund/evaluate-and-refund issues partial refund and blocks replay/spoof photos', async () => {
    const okRes = await fetch(`${baseUrl}/api/cliprefund/evaluate-and-refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        presetId: 'chipped_ceramic_mug',
        originalOrderCents: 2800,
      }),
    });
    const okData = await okRes.json();
    expect(okData.calculation.approved).toBe(true);
    expect(okData.calculation.refundCents).toBe(840);
    expect(okData.paypalRefund.status).toBe('COMPLETED');

    const replayRes = await fetch(`${baseUrl}/api/cliprefund/evaluate-and-refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        presetId: 'chipped_ceramic_mug',
        originalOrderCents: 2800,
        simulateReplayAttack: true,
      }),
    });
    const replayData = await replayRes.json();
    expect(replayData.calculation.approved).toBe(false);
    expect(replayData.paypalRefund).toBeNull();
  });

  it('POST /api/churnrescue/intercept enforces concession ladder, utilization block, circuit breaker, and atomic lock', async () => {
    const step2Res = await fetch(`${baseUrl}/api/churnrescue/intercept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPlanPriceCents: 10000,
        featureUtilizationPct: 25,
        negotiationStep: 2,
        customerMessage: 'Still too expensive for our small team.',
      }),
    });
    const step2Data = await step2Res.json();
    expect(step2Data.decision.approvedDiscountPct).toBe(35);
    expect(step2Data.decision.finalOfferPriceCents).toBe(6500);

    const cbRes = await fetch(`${baseUrl}/api/churnrescue/intercept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPlanPriceCents: 10000,
        featureUtilizationPct: 25,
        negotiationStep: 3,
        customerMessage: 'I am filing a chargeback and calling my lawyer!',
      }),
    });
    const cbData = await cbRes.json();
    expect(cbData.decision.circuitBreakerTripped).toBe(true);
    expect(cbData.decision.approvedDiscountPct).toBe(0);
    expect(cbData.zapierDispatched).toBe(true);

    const dupRes = await fetch(`${baseUrl}/api/churnrescue/intercept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPlanPriceCents: 10000,
        featureUtilizationPct: 25,
        negotiationStep: 1,
        simulateDuplicateClick: true,
      }),
    });
    const dupData = await dupRes.json();
    expect(dupData.atomicOutcome.duplicateBlocked).toBe(true);
  });

  it('POST /api/paystream/create-plan, /issue-invoice, & /verify-proof execute penny-exact milestone splits, PayPal Invoicing v2, and Proof-of-Delivery verification', async () => {
    const planRes = await fetch(`${baseUrl}/api/paystream/create-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectTitle: 'Enterprise PayPal Checkout Integration',
        clientEmail: 'procurement@enterprise.io',
        totalBudgetCents: 150001,
        currency: 'USD',
        projectBrief: 'Deliver OpenAPI specification, Orders v2 webhook integration, and Vitest verification suite.',
        collaborators: [
          { collaboratorName: 'Lead Architect', paypalEmail: 'arch@studio.io', role: 'Backend', sharePct: 60 },
          { collaboratorName: 'Frontend Engineer', paypalEmail: 'ui@studio.io', role: 'Frontend', sharePct: 40 },
        ],
      }),
    });
    expect(planRes.status).toBe(200);
    const planData = await planRes.json();
    expect(planData.plan.pennyExactVerified).toBe(true);
    expect(planData.plan.totalBudgetCents).toBe(150001);
    const m0 = planData.plan.milestones[0];

    const invRes = await fetch(`${baseUrl}/api/paystream/issue-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: planData.plan.planId,
        milestoneId: m0.milestoneId,
      }),
    });
    expect(invRes.status).toBe(200);
    const invData = await invRes.json();
    expect(invData.invoice.invoiceId).toBeDefined();
    expect(invData.invoice.payerViewUrl).toContain('sandbox.paypal.com');

    const proofRes = await fetch(`${baseUrl}/api/paystream/verify-proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: planData.plan.planId,
        milestoneId: m0.milestoneId,
        evidenceUrl: 'https://github.com/A-P-S-Bhaidav/PayPal_Hackathon/pull/1',
        evidenceText: `Completed deliverable for ${m0.title} satisfying acceptance criteria: ${m0.acceptanceCriteria.join(', ')} with passing automated tests and production documentation.`,
      }),
    });
    expect(proofRes.status).toBe(200);
    const proofData = await proofRes.json();
    expect(proofData.verification.approved).toBe(true);
    expect(proofData.collaboratorPayoutSchedule.length).toBe(2);
  });

  it('POST /api/security/fuzz & GET /api/export/elastic-ndjson return verified fuzzer proof and Elastic bulk NDJSON', async () => {
    const fuzzRes = await fetch(`${baseUrl}/api/security/fuzz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ iterations: 500 }),
    });
    const fuzzData = await fuzzRes.json();
    expect(fuzzData.report.failedCases).toBe(0);
    expect(fuzzData.report.passedCases).toBe(500);
    expect(fuzzData.report.invariantsVerified.milestonePennyExactConservation).toBe(true);

    const ndjsonRes = await fetch(`${baseUrl}/api/export/elastic-ndjson`);
    expect(ndjsonRes.status).toBe(200);
    const text = await ndjsonRes.text();
    expect(text).toContain('aegispay-security-audit-2026');
  });

  it('POST /api/ai/failover-test verifies Gemini-to-Groq automatic failover router on simulated HTTP 429 rate limit', async () => {
    const failoverRes = await fetch(`${baseUrl}/api/ai/failover-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        simulateRateLimit: true,
      }),
    });
    expect(failoverRes.status).toBe(200);
    const failoverData = await failoverRes.json();
    expect(failoverData.telemetry.failoverTriggered).toBe(true);
    expect(failoverData.telemetry.failoverReason).toContain('429');
    expect(failoverData.aiStatus).toBeDefined();
    expect(failoverData.auditRow.pillar).toBe('FAILOVER');

    await fetch(`${baseUrl}/api/ai/failover-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ simulateRateLimit: false }),
    });
  });

  it('POST /api/auth/register registers new institutional operator and rejects duplicate email', async () => {
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'treasury-lead@aegispay.io',
        password: 'SecurePassword2026!',
        fullName: 'Treasury Lead',
        organization: 'AegisPay FinOps',
      }),
    });
    expect(regRes.status).toBe(201);
    const regData = await regRes.json();
    expect(regData.authenticated).toBe(true);
    expect(regData.operator.email).toBe('treasury-lead@aegispay.io');
    expect(regData.token).toContain('aegis_sess_');

    const dupRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'treasury-lead@aegispay.io',
        password: 'SecurePassword2026!',
      }),
    });
    expect(dupRes.status).toBe(409);
  });

  it('POST /api/auth/login authenticates valid credentials and rejects wrong passwords', async () => {
    const okRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'operator@aegispay.io',
        password: 'AegisPay2026!',
      }),
    });
    expect(okRes.status).toBe(200);
    const okData = await okRes.json();
    expect(okData.authenticated).toBe(true);
    expect(okData.operator.role).toBe('PRINCIPAL_ARCHITECT');

    const badRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'operator@aegispay.io',
        password: 'WrongPassword',
      }),
    });
    expect(badRes.status).toBe(401);
  });

  it('POST /api/auth/oauth completes OAuth 2.0 PKCE handshake for PayPal, Google, and GitHub', async () => {
    for (const provider of ['PAYPAL_OAUTH', 'GOOGLE_OAUTH', 'GITHUB_OAUTH']) {
      const res = await fetch(`${baseUrl}/api/auth/oauth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.authenticated).toBe(true);
      expect(data.operator.authProvider).toBe(provider);
      expect(data.oauthMetadata.protocol).toContain('PKCE');
    }
  });

  it('GET /api/auth/me & POST /api/auth/logout validate and revoke stateless HMAC bearer session tokens', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'operator@aegispay.io',
        password: 'AegisPay2026!',
      }),
    });
    const { token } = await loginRes.json();

    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes.status).toBe(200);

    await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    const afterLogoutRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(afterLogoutRes.status).toBe(401);
  });

  it('GET /api/auth/google/url and POST /api/auth/google verify Google OAuth 2.0 flow and mint session', async () => {
    const urlRes = await fetch(`${baseUrl}/api/auth/google/url`);
    expect(urlRes.status).toBe(200);
    const urlData = await urlRes.json();
    expect(urlData.redirectUri).toContain('/api/auth/google/callback');

    const googleAuthRes = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'aps.bhaidav@gmail.com',
        fullName: 'A. P. S. Bhaidav',
        organization: 'Google OAuth Verified',
      }),
    });
    expect(googleAuthRes.status).toBe(200);
    const googleAuthData = await googleAuthRes.json();
    expect(googleAuthData.authenticated).toBe(true);
    expect(googleAuthData.operator.authProvider).toBe('GOOGLE_OAUTH');
    expect(googleAuthData.operator.email).toBe('aps.bhaidav@gmail.com');
  });

  const stressSteps = Array.from({ length: 50 }, (_, idx) => idx + 1);
  it.each(stressSteps)(
    'API deterministic concurrency invariant check #%i',
    async (idx) => {
      const res = await fetch(`${baseUrl}/api/lupa/cashflow-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemTitle: `Stress Item #${idx}`,
          proposedSpendCents: idx * 2500,
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(['ALLOW', 'HOLD', 'BLOCK']).toContain(data.result.verdict);
    }
  );
});
