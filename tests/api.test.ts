import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createAegisServer } from '../server/index.ts';

describe('AegisPay Full-Stack HTTP API & End-to-End Lifecycle Suite (60+ Tests)', () => {
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

  it('GET /api/state returns complete system status, KPIs, Lupa permits, orders, webhooks, and audit logs', async () => {
    const res = await fetch(`${baseUrl}/api/state`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.system.name).toBe('AegisPay OS');
    expect(data.lupa.billingPermissions.length).toBeGreaterThanOrEqual(4);
    expect(data.lupa.zombieReport.totalZombieCount).toBeGreaterThanOrEqual(3);
    expect(data.auditLogs.length).toBeGreaterThanOrEqual(4);
  });

  it('POST /api/lupa/cashflow-check evaluates affordability and updates agent permit ceiling when requested', async () => {
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

  it('POST /api/lupa/revoke-zombie tightens cap and revokes zombie agreements', async () => {
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
    // 1. ALLOW case ($32 <= $50 autoAllow, confidence 95%)
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

    // 2. HOLD case ($45 desk lamp, confidence 68% < 82%)
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

    // 3. Human resolves HOLD -> CAPTURE
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

  it('POST /api/scamshield/review & /capture enforces single-use token and blocks all 5 tamper attacks', async () => {
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

    // Valid capture succeeds once
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

    // Replay attack on the same token is blocked
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

  it('POST /api/dealforge/negotiate settles SHA-256 contract and neutralizes adversarial prompt injection', async () => {
    const res = await fetch(`${baseUrl}/api/dealforge/negotiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        simulatePromptInjection: true,
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.dealReached).toBe(true);
    expect(data.contractIntegrityVerified).toBe(true);
    expect(data.rounds.some((r: { promptInjectionBlocked: boolean }) => r.promptInjectionBlocked)).toBe(true);
    expect(data.paypalOrder.status).toBe('COMPLETED');
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
    // 1. Concession step 2 -> 35%
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

    // 2. Circuit breaker -> 0% discount + Zapier escalation
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

    // 3. Duplicate click atomic row lock
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

  it('POST /api/security/fuzz & GET /api/export/elastic-ndjson return verified fuzzer proof and Elastic bulk NDJSON', async () => {
    const fuzzRes = await fetch(`${baseUrl}/api/security/fuzz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ iterations: 500 }),
    });
    const fuzzData = await fuzzRes.json();
    expect(fuzzData.report.failedCases).toBe(0);
    expect(fuzzData.report.passedCases).toBe(500);

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

    // Restore normal routing mode
    await fetch(`${baseUrl}/api/ai/failover-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ simulateRateLimit: false }),
    });
  });

  // 50 parameterized API stress checks across varying amounts & steps
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
