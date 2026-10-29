import { canonicalJson, sha256Hex } from './kernel';

// ============================================================================
// PAYREVIVE: AUTONOMOUS AI FAILED-PAYMENT REVENUE RECOVERY ENGINE
// Architecture:
//   1. XGBoost-Style Gradient Boosted Decision Trees (12-Tree Ensemble)
//   2. Exact Path-Dependent TreeSHAP Feature Attribution (Verified Additivity)
//   3. Cost-Aware Contextual Bandit Action Selector (Net EV > 0 Mandate)
//   4. Hard Deterministic Compliance Gate (Zero Refused Actions Executed)
//   5. 500-Batch Monte Carlo Benchmark vs Hand-Written Static Rule System
// ============================================================================

export type PaymentDeclineCode =
  | 'INSUFFICIENT_FUNDS'
  | 'ISSUER_TIMEOUT'
  | 'EXPIRED_CARD'
  | 'VELOCITY_EXCEEDED'
  | 'STOLEN_OR_FRAUD_CARD'
  | 'REVOKED_AUTHORIZATION';

export type RecoveryRootCause =
  | 'LIQUIDITY_PAYDAY_GAP'
  | 'TRANSIENT_ISSUER_TIMEOUT'
  | 'DEGRADED_FUNDING_INSTRUMENT'
  | 'COMPLIANCE_HARD_DECLINE'
  | 'LOW_INTENT_EXHAUSTED_RETRIES';

export type RecoveryActionId =
  | 'IMMEDIATE_JITTER_RETRY'
  | 'PAYDAY_SCHEDULED_SMART_RETRY'
  | 'PAYPAL_BACKUP_FUNDING_SWITCH'
  | 'SPLIT_TWO_PART_INVOICE'
  | 'FEE_WAIVER_GRACE_LINK'
  | 'ABANDON_NO_ACTION';

export interface FailedPaymentEvent {
  eventId: string;
  customerEmail: string;
  merchantOrderRef: string;
  amountCents: number;
  currency: 'USD' | 'EUR' | 'GBP';
  declineCode: PaymentDeclineCode;
  daysUntilPayday: number; // 0..14
  priorRetryCount30d: number; // 0..6
  historicalCaptureRate: number; // 0..1
  hasPayPalBackupFunding: boolean;
  issuerLatencyMs: number;
  accountTenureDays: number;
  customerOptedOutComms: boolean;
  localCustomerHour: number; // 0..23
  hasOpenPayPalDispute: boolean;
}

export interface ShapFeatureContribution {
  featureKey: string;
  featureLabel: string;
  featureValueDisplay: string;
  shapLogOdds: number;
  direction: 'POSITIVE_RECOVERY' | 'NEGATIVE_RISK' | 'NEUTRAL';
}

export interface XGBoostShapDiagnosis {
  baseLogOdds: number;
  rawMarginLogOdds: number;
  recoverabilityProbability: number;
  additivityDelta: number;
  additivityVerified: boolean;
  predictedRootCause: RecoveryRootCause;
  rootCauseSummary: string;
  shapContributions: ShapFeatureContribution[];
}

export interface ComplianceCheckResult {
  allowed: boolean;
  ruleId: string;
  reason: string;
  blockedFlags: string[];
}

export interface BanditArmEvaluation {
  actionId: RecoveryActionId;
  actionLabel: string;
  paypalMechanism: 'PAYPAL_ORDERS_V2_RETRY' | 'PAYPAL_INVOICING_V2_LINK' | 'NONE';
  requiresCustomerOutreach: boolean;
  actionCostCents: number;
  estimatedSuccessProbability: number;
  expectedGrossRecoveryCents: number;
  expectedNetGainCents: number;
  ucbScoreCents: number;
  compliance: ComplianceCheckResult;
  eligibleAndWorthCost: boolean;
}

export interface PayReviveDecision {
  decisionId: string;
  timestampIso: string;
  event: FailedPaymentEvent;
  diagnosis: XGBoostShapDiagnosis;
  banditRawTopAction: RecoveryActionId;
  selectedAction: RecoveryActionId;
  selectedArmDetails: BanditArmEvaluation;
  allArms: BanditArmEvaluation[];
  verdict: 'EXECUTE_RECOVERY' | 'ABSTAIN_NOT_WORTH_COST' | 'BLOCKED_BY_COMPLIANCE';
  complianceBlockedTopChoice: boolean;
  auditHash: string;
  deterministicRationale: string;
}

// ----------------------------------------------------------------------------
// 1. FEATURE EXTRACTION (8-Dimensional Payment Telemetry Vector)
// ----------------------------------------------------------------------------

export const PAYREVIVE_FEATURE_META: ReadonlyArray<{
  key: string;
  label: string;
}> = [
  { key: 'isHardDecline', label: 'Hard Decline Flag (Fraud / Revoked)' },
  { key: 'isIssuerTimeout', label: 'Issuer Network Latency / Timeout' },
  { key: 'isInstrumentError', label: 'Expired Card / Velocity Limit' },
  { key: 'daysUntilPayday', label: 'Days Until Estimated Payday' },
  { key: 'priorRetryCount30d', label: '30-Day Prior Retry Count' },
  { key: 'historicalCaptureRate', label: 'Historical PayPal Capture Rate' },
  { key: 'hasPayPalBackupFunding', label: 'Linked PayPal Wallet / ACH Backup' },
  { key: 'amountDollars', label: 'Failed Payment Amount (USD)' },
];

export function extractPayReviveFeatures(e: FailedPaymentEvent): {
  values: number[];
  displays: string[];
} {
  const isHard =
    e.declineCode === 'STOLEN_OR_FRAUD_CARD' || e.declineCode === 'REVOKED_AUTHORIZATION' ? 1 : 0;
  const isTimeout = e.declineCode === 'ISSUER_TIMEOUT' || e.issuerLatencyMs >= 1800 ? 1 : 0;
  const isInstErr =
    e.declineCode === 'EXPIRED_CARD' || e.declineCode === 'VELOCITY_EXCEEDED' ? 1 : 0;
  const amountDollars = Math.max(0.01, e.amountCents / 100);

  return {
    values: [
      isHard,
      isTimeout,
      isInstErr,
      e.daysUntilPayday,
      e.priorRetryCount30d,
      e.historicalCaptureRate,
      e.hasPayPalBackupFunding ? 1 : 0,
      amountDollars,
    ],
    displays: [
      isHard ? e.declineCode : 'None (Soft Decline)',
      `${e.issuerLatencyMs}ms (${e.declineCode === 'ISSUER_TIMEOUT' ? 'Timeout' : 'Normal'})`,
      isInstErr ? e.declineCode : 'Card Active',
      `${e.daysUntilPayday}d`,
      `${e.priorRetryCount30d} / 3 cap`,
      `${Math.round(e.historicalCaptureRate * 100)}%`,
      e.hasPayPalBackupFunding ? 'Linked' : 'None',
      `$${amountDollars.toFixed(2)}`,
    ],
  };
}

// ----------------------------------------------------------------------------
// 2. XGBOOST-STYLE GRADIENT BOOSTED TREES + EXACT TREESHAP ENGINE
// ----------------------------------------------------------------------------

interface GBDTNode {
  cover: number;
  leafValue?: number;
  featureIndex?: number;
  threshold?: number;
  left?: GBDTNode;
  right?: GBDTNode;
}

const GBDT_BASE_LOG_ODDS = -0.15;

// 12 calibrated gradient-boosted regression trees over the 8 payment telemetry features
const PAYREVIVE_GBDT_TREES: ReadonlyArray<GBDTNode> = [
  // Tree 1: Hard decline detector (dominant negative log-odds)
  {
    cover: 1000,
    featureIndex: 0,
    threshold: 0.5,
    left: {
      cover: 840,
      featureIndex: 4,
      threshold: 2.5,
      left: { cover: 720, leafValue: 0.28 },
      right: { cover: 120, leafValue: -0.95 },
    },
    right: { cover: 160, leafValue: -3.4 },
  },
  // Tree 2: Issuer timeout + historical reliability boost
  {
    cover: 1000,
    featureIndex: 1,
    threshold: 0.5,
    left: { cover: 780, leafValue: -0.08 },
    right: {
      cover: 220,
      featureIndex: 5,
      threshold: 0.55,
      left: { cover: 50, leafValue: 0.35 },
      right: { cover: 170, leafValue: 1.18 },
    },
  },
  // Tree 3: Instrument error x PayPal Backup Funding interaction
  {
    cover: 1000,
    featureIndex: 2,
    threshold: 0.5,
    left: { cover: 740, leafValue: 0.06 },
    right: {
      cover: 260,
      featureIndex: 6,
      threshold: 0.5,
      left: { cover: 105, leafValue: -0.52 },
      right: { cover: 155, leafValue: 0.92 },
    },
  },
  // Tree 4: Payday timing gap on liquidity declines
  {
    cover: 1000,
    featureIndex: 3,
    threshold: 1.5,
    left: { cover: 360, leafValue: 0.34 },
    right: {
      cover: 640,
      featureIndex: 3,
      threshold: 7.5,
      left: { cover: 420, leafValue: 0.14 },
      right: { cover: 220, leafValue: -0.36 },
    },
  },
  // Tree 5: Historical capture rate loyalty signal
  {
    cover: 1000,
    featureIndex: 5,
    threshold: 0.7,
    left: {
      cover: 390,
      featureIndex: 5,
      threshold: 0.35,
      left: { cover: 130, leafValue: -0.78 },
      right: { cover: 260, leafValue: -0.18 },
    },
    right: { cover: 610, leafValue: 0.56 },
  },
  // Tree 6: Prior retry fatigue curve
  {
    cover: 1000,
    featureIndex: 4,
    threshold: 0.5,
    left: { cover: 520, leafValue: 0.26 },
    right: {
      cover: 480,
      featureIndex: 4,
      threshold: 1.5,
      left: { cover: 290, leafValue: -0.05 },
      right: { cover: 190, leafValue: -0.68 },
    },
  },
  // Tree 7: Backup PayPal Wallet availability across soft declines
  {
    cover: 1000,
    featureIndex: 6,
    threshold: 0.5,
    left: { cover: 460, leafValue: -0.22 },
    right: {
      cover: 540,
      featureIndex: 0,
      threshold: 0.5,
      left: { cover: 460, leafValue: 0.44 },
      right: { cover: 80, leafValue: -0.6 },
    },
  },
  // Tree 8: High-ticket invoice pressure vs split potential
  {
    cover: 1000,
    featureIndex: 7,
    threshold: 250,
    left: {
      cover: 680,
      featureIndex: 7,
      threshold: 4.5,
      left: { cover: 90, leafValue: -0.25 },
      right: { cover: 590, leafValue: 0.16 },
    },
    right: {
      cover: 320,
      featureIndex: 5,
      threshold: 0.65,
      left: { cover: 120, leafValue: -0.48 },
      right: { cover: 200, leafValue: 0.22 },
    },
  },
  // Tree 9: Liquidity crunch + backup wallet synergy
  {
    cover: 1000,
    featureIndex: 3,
    threshold: 3.5,
    left: { cover: 540, leafValue: 0.12 },
    right: {
      cover: 460,
      featureIndex: 6,
      threshold: 0.5,
      left: { cover: 220, leafValue: -0.31 },
      right: { cover: 240, leafValue: 0.24 },
    },
  },
  // Tree 10: Timeout fast-recovery booster when retries are fresh
  {
    cover: 1000,
    featureIndex: 1,
    threshold: 0.5,
    left: { cover: 780, leafValue: -0.04 },
    right: {
      cover: 220,
      featureIndex: 4,
      threshold: 1.5,
      left: { cover: 175, leafValue: 0.52 },
      right: { cover: 45, leafValue: -0.15 },
    },
  },
  // Tree 11: Hard decline reinforcement
  {
    cover: 1000,
    featureIndex: 0,
    threshold: 0.5,
    left: { cover: 840, leafValue: 0.11 },
    right: { cover: 160, leafValue: -1.85 },
  },
  // Tree 12: High capture history + moderate amount boost
  {
    cover: 1000,
    featureIndex: 5,
    threshold: 0.82,
    left: { cover: 620, leafValue: -0.07 },
    right: {
      cover: 380,
      featureIndex: 7,
      threshold: 500,
      left: { cover: 310, leafValue: 0.31 },
      right: { cover: 70, leafValue: 0.05 },
    },
  },
];

function sigmoid(z: number): number {
  if (z >= 20) return 0.999999998;
  if (z <= -20) return 0.000000002;
  return 1 / (1 + Math.exp(-z));
}

function collectTreeFeatures(node: GBDTNode, acc: Set<number>): void {
  if (node.featureIndex !== undefined && node.left && node.right) {
    acc.add(node.featureIndex);
    collectTreeFeatures(node.left, acc);
    collectTreeFeatures(node.right, acc);
  }
}

function conditionalTreeExpectation(
  node: GBDTNode,
  x: number[],
  activeMask: ReadonlySet<number>
): number {
  if (node.leafValue !== undefined || node.featureIndex === undefined || !node.left || !node.right) {
    return node.leafValue ?? 0;
  }
  if (activeMask.has(node.featureIndex)) {
    const branch = x[node.featureIndex] <= (node.threshold ?? 0) ? node.left : node.right;
    return conditionalTreeExpectation(branch, x, activeMask);
  }
  const leftVal = conditionalTreeExpectation(node.left, x, activeMask);
  const rightVal = conditionalTreeExpectation(node.right, x, activeMask);
  return (node.left.cover * leftVal + node.right.cover * rightVal) / node.cover;
}

const FACTORIAL = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];

/**
 * Exact path-dependent TreeSHAP computation over the 12-tree GBDT ensemble.
 * Guarantees local accuracy: baseLogOdds + sum(phi_i) === rawMarginLogOdds.
 */
export function diagnosePaymentFailureXGBoost(event: FailedPaymentEvent): XGBoostShapDiagnosis {
  const { values: x, displays } = extractPayReviveFeatures(event);
  const numFeatures = PAYREVIVE_FEATURE_META.length;
  const shapValues = new Array<number>(numFeatures).fill(0);

  let expectedEnsembleBase = GBDT_BASE_LOG_ODDS;
  let exactEnsembleMargin = GBDT_BASE_LOG_ODDS;

  for (const tree of PAYREVIVE_GBDT_TREES) {
    const featureSet = new Set<number>();
    collectTreeFeatures(tree, featureSet);
    const treeFeatures = Array.from(featureSet);
    const m = treeFeatures.length;

    const emptySet = new Set<number>();
    const fullSet = new Set<number>(treeFeatures);
    expectedEnsembleBase += conditionalTreeExpectation(tree, x, emptySet);
    exactEnsembleMargin += conditionalTreeExpectation(tree, x, fullSet);

    if (m === 0) continue;

    // Precompute coalition values for all 2^m subsets (m <= 3 -> <= 8 coalitions per tree)
    const coalitionValues = new Float64Array(1 << m);
    for (let mask = 0; mask < 1 << m; mask++) {
      const subset = new Set<number>();
      for (let bit = 0; bit < m; bit++) {
        if ((mask & (1 << bit)) !== 0) {
          subset.add(treeFeatures[bit]);
        }
      }
      coalitionValues[mask] = conditionalTreeExpectation(tree, x, subset);
    }

    for (let bit = 0; bit < m; bit++) {
      const featIdx = treeFeatures[bit];
      let phi = 0;
      for (let mask = 0; mask < 1 << m; mask++) {
        if ((mask & (1 << bit)) !== 0) continue;
        // Count |S|
        let sSize = 0;
        let tmp = mask;
        while (tmp > 0) {
          sSize += tmp & 1;
          tmp >>= 1;
        }
        const weight = (FACTORIAL[sSize] * FACTORIAL[m - sSize - 1]) / FACTORIAL[m];
        const withFeature = coalitionValues[mask | (1 << bit)];
        const withoutFeature = coalitionValues[mask];
        phi += weight * (withFeature - withoutFeature);
      }
      shapValues[featIdx] += phi;
    }
  }

  const shapSum = shapValues.reduce((acc, v) => acc + v, 0);
  const additivityDelta = Math.abs(expectedEnsembleBase + shapSum - exactEnsembleMargin);
  const recoverabilityProbability = Number(sigmoid(exactEnsembleMargin).toFixed(4));

  let predictedRootCause: RecoveryRootCause = 'LIQUIDITY_PAYDAY_GAP';
  let rootCauseSummary = '';

  if (
    event.declineCode === 'STOLEN_OR_FRAUD_CARD' ||
    event.declineCode === 'REVOKED_AUTHORIZATION'
  ) {
    predictedRootCause = 'COMPLIANCE_HARD_DECLINE';
    rootCauseSummary = `Permanent compliance hard decline (${event.declineCode}); re-debit strictly prohibited.`;
  } else if (event.declineCode === 'ISSUER_TIMEOUT' || event.issuerLatencyMs >= 1800) {
    predictedRootCause = 'TRANSIENT_ISSUER_TIMEOUT';
    rootCauseSummary = `Transient issuer gateway timeout (${event.issuerLatencyMs}ms); high immediate retry recoverability.`;
  } else if (event.declineCode === 'EXPIRED_CARD' || event.declineCode === 'VELOCITY_EXCEEDED') {
    predictedRootCause = 'DEGRADED_FUNDING_INSTRUMENT';
    rootCauseSummary = `Primary card ${event.declineCode.toLowerCase().replace(/_/g, ' ')}; standard card retry will fail unless switched to PayPal Backup Funding.`;
  } else if (event.priorRetryCount30d >= 3 || event.historicalCaptureRate < 0.35) {
    predictedRootCause = 'LOW_INTENT_EXHAUSTED_RETRIES';
    rootCauseSummary = `Exhausted retry window (${event.priorRetryCount30d} prior attempts) or chronically low capture rate.`;
  } else {
    predictedRootCause = 'LIQUIDITY_PAYDAY_GAP';
    rootCauseSummary = `Temporary balance shortfall (${event.daysUntilPayday}d until predicted payday liquidity window).`;
  }

  const shapContributions: ShapFeatureContribution[] = PAYREVIVE_FEATURE_META.map((meta, idx) => {
    const val = Number(shapValues[idx].toFixed(4));
    const direction: ShapFeatureContribution['direction'] =
      val > 0.015 ? 'POSITIVE_RECOVERY' : val < -0.015 ? 'NEGATIVE_RISK' : 'NEUTRAL';
    return {
      featureKey: meta.key,
      featureLabel: meta.label,
      featureValueDisplay: displays[idx],
      shapLogOdds: val,
      direction,
    };
  }).sort((a, b) => Math.abs(b.shapLogOdds) - Math.abs(a.shapLogOdds));

  return {
    baseLogOdds: Number(expectedEnsembleBase.toFixed(4)),
    rawMarginLogOdds: Number(exactEnsembleMargin.toFixed(4)),
    recoverabilityProbability,
    additivityDelta: Number(additivityDelta.toExponential(3)),
    additivityVerified: additivityDelta < 1e-6,
    predictedRootCause,
    rootCauseSummary,
    shapContributions,
  };
}

// ----------------------------------------------------------------------------
// 3. HARD DETERMINISTIC COMPLIANCE GATE
// ----------------------------------------------------------------------------

export const RECOVERY_ACTION_CATALOG: ReadonlyArray<{
  actionId: RecoveryActionId;
  actionLabel: string;
  paypalMechanism: BanditArmEvaluation['paypalMechanism'];
  requiresCustomerOutreach: boolean;
  actionCostCents: number;
}> = [
  {
    actionId: 'IMMEDIATE_JITTER_RETRY',
    actionLabel: 'Immediate Jittered PayPal Capture Retry',
    paypalMechanism: 'PAYPAL_ORDERS_V2_RETRY',
    requiresCustomerOutreach: false,
    actionCostCents: 18,
  },
  {
    actionId: 'PAYDAY_SCHEDULED_SMART_RETRY',
    actionLabel: 'Payday-Aligned Smart Capture Schedule',
    paypalMechanism: 'PAYPAL_ORDERS_V2_RETRY',
    requiresCustomerOutreach: false,
    actionCostCents: 22,
  },
  {
    actionId: 'PAYPAL_BACKUP_FUNDING_SWITCH',
    actionLabel: 'PayPal Wallet / ACH Backup Funding Link',
    paypalMechanism: 'PAYPAL_INVOICING_V2_LINK',
    requiresCustomerOutreach: true,
    actionCostCents: 55,
  },
  {
    actionId: 'SPLIT_TWO_PART_INVOICE',
    actionLabel: '50/50 Two-Part PayPal Installment Invoice',
    paypalMechanism: 'PAYPAL_INVOICING_V2_LINK',
    requiresCustomerOutreach: true,
    actionCostCents: 125,
  },
  {
    actionId: 'FEE_WAIVER_GRACE_LINK',
    actionLabel: 'Late-Fee Waiver + 48h PayPal Grace Link',
    paypalMechanism: 'PAYPAL_INVOICING_V2_LINK',
    requiresCustomerOutreach: true,
    actionCostCents: 240,
  },
  {
    actionId: 'ABANDON_NO_ACTION',
    actionLabel: 'Abstain (Do Not Retry — Protect Margin & Compliance)',
    paypalMechanism: 'NONE',
    requiresCustomerOutreach: false,
    actionCostCents: 0,
  },
];

export function evaluatePayReviveCompliance(
  event: FailedPaymentEvent,
  actionId: RecoveryActionId
): ComplianceCheckResult {
  if (actionId === 'ABANDON_NO_ACTION') {
    return {
      allowed: true,
      ruleId: 'COMP-SAFE-ABSTAIN',
      reason: 'Zero-action abstention is always compliant.',
      blockedFlags: [],
    };
  }

  const blockedFlags: string[] = [];

  // Rule C1: Hard Declines (Card Network & PayPal Mandate Law — Zero Retry / Zero Dunning)
  if (
    event.declineCode === 'STOLEN_OR_FRAUD_CARD' ||
    event.declineCode === 'REVOKED_AUTHORIZATION'
  ) {
    blockedFlags.push(`HARD_DECLINE_${event.declineCode}`);
  }

  // Rule C2: Active Open PayPal Dispute Freeze
  if (event.hasOpenPayPalDispute) {
    blockedFlags.push('ACTIVE_PAYPAL_DISPUTE_FREEZE');
  }

  const spec = RECOVERY_ACTION_CATALOG.find((a) => a.actionId === actionId)!;

  // Rule C3: Card-Network 30-Day Automated Re-Debit Ceiling (Max 3 retries)
  if (!spec.requiresCustomerOutreach && event.priorRetryCount30d >= 3) {
    blockedFlags.push('MAX_3_AUTO_RETRIES_EXCEEDED_30D');
  }

  // Rule C4: Excessive total contact/retry cap (>= 4 attempts blocks all actions)
  if (event.priorRetryCount30d >= 4) {
    blockedFlags.push('GLOBAL_ATTEMPT_CAP_EXCEEDED');
  }

  // Rule C5: TCPA / GDPR Communication Opt-Out & Quiet Hours (21:00 - 07:59 local)
  if (spec.requiresCustomerOutreach) {
    if (event.customerOptedOutComms) {
      blockedFlags.push('CUSTOMER_COMMUNICATION_OPT_OUT');
    }
    if (event.localCustomerHour >= 21 || event.localCustomerHour < 8) {
      blockedFlags.push(`QUIET_HOURS_RESTRICTION_${event.localCustomerHour}H`);
    }
  }

  if (blockedFlags.length > 0) {
    return {
      allowed: false,
      ruleId: `COMP-BLOCK-${blockedFlags[0]}`,
      reason: `Refused by compliance gate: ${blockedFlags.join(', ')}`,
      blockedFlags,
    };
  }

  return {
    allowed: true,
    ruleId: 'COMP-ALLOW-VERIFIED',
    reason: 'Passed card-network retry ceiling, mandate validity, dispute check, and TCPA/GDPR rules.',
    blockedFlags: [],
  };
}

// ----------------------------------------------------------------------------
// 4. COST-AWARE CONTEXTUAL BANDIT ACTION SELECTOR
// ----------------------------------------------------------------------------

export interface BanditPosteriorEntry {
  alpha: number;
  beta: number;
  pulls: number;
}

export class PayReviveContextualBandit {
  private readonly posteriors = new Map<string, BanditPosteriorEntry>();
  private totalDecisions = 0;

  constructor() {
    this.seedCalibratedPriors();
  }

  private key(cause: RecoveryRootCause, actionId: RecoveryActionId): string {
    return `${cause}::${actionId}`;
  }

  private seedCalibratedPriors(): void {
    const priors: Record<RecoveryRootCause, Record<RecoveryActionId, [number, number]>> = {
      TRANSIENT_ISSUER_TIMEOUT: {
        IMMEDIATE_JITTER_RETRY: [34, 8],
        PAYDAY_SCHEDULED_SMART_RETRY: [18, 14],
        PAYPAL_BACKUP_FUNDING_SWITCH: [16, 14],
        SPLIT_TWO_PART_INVOICE: [10, 18],
        FEE_WAIVER_GRACE_LINK: [9, 19],
        ABANDON_NO_ACTION: [1, 99],
      },
      LIQUIDITY_PAYDAY_GAP: {
        IMMEDIATE_JITTER_RETRY: [6, 30],
        PAYDAY_SCHEDULED_SMART_RETRY: [31, 10],
        PAYPAL_BACKUP_FUNDING_SWITCH: [19, 15],
        SPLIT_TWO_PART_INVOICE: [27, 11],
        FEE_WAIVER_GRACE_LINK: [15, 17],
        ABANDON_NO_ACTION: [1, 99],
      },
      DEGRADED_FUNDING_INSTRUMENT: {
        IMMEDIATE_JITTER_RETRY: [2, 38],
        PAYDAY_SCHEDULED_SMART_RETRY: [3, 37],
        PAYPAL_BACKUP_FUNDING_SWITCH: [33, 9],
        SPLIT_TWO_PART_INVOICE: [11, 23],
        FEE_WAIVER_GRACE_LINK: [14, 21],
        ABANDON_NO_ACTION: [1, 99],
      },
      LOW_INTENT_EXHAUSTED_RETRIES: {
        IMMEDIATE_JITTER_RETRY: [3, 35],
        PAYDAY_SCHEDULED_SMART_RETRY: [5, 31],
        PAYPAL_BACKUP_FUNDING_SWITCH: [9, 26],
        SPLIT_TWO_PART_INVOICE: [10, 24],
        FEE_WAIVER_GRACE_LINK: [13, 21],
        ABANDON_NO_ACTION: [1, 99],
      },
      COMPLIANCE_HARD_DECLINE: {
        IMMEDIATE_JITTER_RETRY: [1, 99],
        PAYDAY_SCHEDULED_SMART_RETRY: [1, 99],
        PAYPAL_BACKUP_FUNDING_SWITCH: [1, 99],
        SPLIT_TWO_PART_INVOICE: [1, 99],
        FEE_WAIVER_GRACE_LINK: [1, 99],
        ABANDON_NO_ACTION: [1, 99],
      },
    };

    for (const cause of Object.keys(priors) as RecoveryRootCause[]) {
      for (const actionId of Object.keys(priors[cause]) as RecoveryActionId[]) {
        const [alpha, beta] = priors[cause][actionId];
        this.posteriors.set(this.key(cause, actionId), {
          alpha,
          beta,
          pulls: alpha + beta,
        });
      }
    }
  }

  public estimateActionSuccessProbability(
    event: FailedPaymentEvent,
    diagnosis: XGBoostShapDiagnosis,
    actionId: RecoveryActionId
  ): { meanProb: number; ucbProb: number } {
    if (actionId === 'ABANDON_NO_ACTION') {
      return { meanProb: 0, ucbProb: 0 };
    }
    const post = this.posteriors.get(this.key(diagnosis.predictedRootCause, actionId)) || {
      alpha: 2,
      beta: 8,
      pulls: 10,
    };
    const armPriorMean = post.alpha / (post.alpha + post.beta);

    // Combine XGBoost base recoverability with contextual bandit arm affinity & feature modifiers
    let modifier = 1.0;
    if (actionId === 'PAYPAL_BACKUP_FUNDING_SWITCH') {
      modifier *= event.hasPayPalBackupFunding ? 1.24 : 0.48;
    }
    if (actionId === 'SPLIT_TWO_PART_INVOICE') {
      modifier *= event.amountCents >= 18000 ? 1.22 : 0.72;
    }
    if (actionId === 'PAYDAY_SCHEDULED_SMART_RETRY') {
      modifier *= event.daysUntilPayday >= 1 && event.daysUntilPayday <= 10 ? 1.18 : 0.84;
    }
    if (actionId === 'IMMEDIATE_JITTER_RETRY' && event.declineCode === 'INSUFFICIENT_FUNDS') {
      modifier *= event.daysUntilPayday === 0 ? 0.92 : 0.28;
    }

    const blended = Math.min(
      0.96,
      Math.max(0.005, (0.42 * diagnosis.recoverabilityProbability + 0.58 * armPriorMean) * modifier)
    );
    const totalN = Math.max(10, this.totalDecisions + 50);
    const bonus = Math.min(0.08, Math.sqrt((0.35 * Math.log(totalN)) / Math.max(1, post.pulls)));

    return {
      meanProb: Number(blended.toFixed(4)),
      ucbProb: Number(Math.min(0.98, blended + bonus).toFixed(4)),
    };
  }

  public updateOutcome(
    cause: RecoveryRootCause,
    actionId: RecoveryActionId,
    recovered: boolean
  ): void {
    this.totalDecisions += 1;
    if (actionId === 'ABANDON_NO_ACTION') return;
    const k = this.key(cause, actionId);
    const entry = this.posteriors.get(k) || { alpha: 2, beta: 2, pulls: 4 };
    entry.pulls += 1;
    if (recovered) {
      entry.alpha += 1;
    } else {
      entry.beta += 1;
    }
    this.posteriors.set(k, entry);
  }

  public evaluateAndDecide(event: FailedPaymentEvent): PayReviveDecision {
    const diagnosis = diagnosePaymentFailureXGBoost(event);

    const allArms: BanditArmEvaluation[] = RECOVERY_ACTION_CATALOG.map((spec) => {
      const { meanProb, ucbProb } = this.estimateActionSuccessProbability(
        event,
        diagnosis,
        spec.actionId
      );
      const expectedGrossRecoveryCents = Math.round(meanProb * event.amountCents);
      const expectedNetGainCents = expectedGrossRecoveryCents - spec.actionCostCents;
      const ucbScoreCents = Math.round(ucbProb * event.amountCents) - spec.actionCostCents;
      const compliance = evaluatePayReviveCompliance(event, spec.actionId);

      const eligibleAndWorthCost =
        spec.actionId !== 'ABANDON_NO_ACTION' && compliance.allowed && expectedNetGainCents > 0;

      return {
        actionId: spec.actionId,
        actionLabel: spec.actionLabel,
        paypalMechanism: spec.paypalMechanism,
        requiresCustomerOutreach: spec.requiresCustomerOutreach,
        actionCostCents: spec.actionCostCents,
        estimatedSuccessProbability: meanProb,
        expectedGrossRecoveryCents,
        expectedNetGainCents,
        ucbScoreCents,
        compliance,
        eligibleAndWorthCost,
      };
    });

    // Unconstrained bandit top choice (ignoring compliance, to detect compliance blocks!)
    const positiveRawArms = allArms
      .filter((a) => a.actionId !== 'ABANDON_NO_ACTION' && a.expectedNetGainCents > 0)
      .sort((a, b) => b.ucbScoreCents - a.ucbScoreCents);
    const banditRawTopAction: RecoveryActionId =
      positiveRawArms.length > 0 ? positiveRawArms[0].actionId : 'ABANDON_NO_ACTION';

    // Compliant & positive-EV arms sorted by Bandit UCB Expected Net Gain
    const compliantWorthwhileArms = allArms
      .filter((a) => a.eligibleAndWorthCost)
      .sort((a, b) => b.ucbScoreCents - a.ucbScoreCents);

    const abandonArm = allArms.find((a) => a.actionId === 'ABANDON_NO_ACTION')!;

    let selectedArmDetails: BanditArmEvaluation = abandonArm;
    let verdict: PayReviveDecision['verdict'] = 'ABSTAIN_NOT_WORTH_COST';
    let complianceBlockedTopChoice = false;
    let deterministicRationale = '';

    const rawTopArmObj = allArms.find((a) => a.actionId === banditRawTopAction);
    if (rawTopArmObj && !rawTopArmObj.compliance.allowed) {
      complianceBlockedTopChoice = true;
    }

    if (compliantWorthwhileArms.length > 0) {
      selectedArmDetails = compliantWorthwhileArms[0];
      verdict = 'EXECUTE_RECOVERY';
      deterministicRationale = complianceBlockedTopChoice
        ? `Compliance Gate blocked ${banditRawTopAction} (${rawTopArmObj?.compliance.ruleId}); Bandit rerouted to compliant positive-EV arm ${selectedArmDetails.actionId} (Net EV +$${(selectedArmDetails.expectedNetGainCents / 100).toFixed(2)}).`
        : `Approved ${selectedArmDetails.actionId}: Diagnosis=${diagnosis.predictedRootCause}, Net EV +$${(selectedArmDetails.expectedNetGainCents / 100).toFixed(2)} exceeds $${(selectedArmDetails.actionCostCents / 100).toFixed(2)} action cost and passed all compliance checks.`;
    } else {
      // Check if all non-abandon arms were blocked by compliance vs simply negative EV
      const anyAllowedNonAbandon = allArms.some(
        (a) => a.actionId !== 'ABANDON_NO_ACTION' && a.compliance.allowed
      );
      if (!anyAllowedNonAbandon || complianceBlockedTopChoice) {
        verdict = 'BLOCKED_BY_COMPLIANCE';
        const primaryBlockReason =
          rawTopArmObj && !rawTopArmObj.compliance.allowed
            ? rawTopArmObj.compliance.reason
            : allArms[0].compliance.reason;
        deterministicRationale = `Blocked by Compliance Gate: ${primaryBlockReason}. Zero recovery actions executed.`;
      } else {
        verdict = 'ABSTAIN_NOT_WORTH_COST';
        const bestNet = Math.max(
          ...allArms
            .filter((a) => a.actionId !== 'ABANDON_NO_ACTION')
            .map((a) => a.expectedNetGainCents)
        );
        deterministicRationale = `Abstained: Best candidate net expected value ($${(bestNet / 100).toFixed(2)}) does not justify action cost on $${(event.amountCents / 100).toFixed(2)} payment.`;
      }
    }

    const timestampIso = new Date().toISOString();
    const decisionId = `PRV-${sha256Hex({ eventId: event.eventId, timestampIso }).slice(0, 10).toUpperCase()}`;
    const auditHash = sha256Hex(
      canonicalJson({
        decisionId,
        eventId: event.eventId,
        predictedRootCause: diagnosis.predictedRootCause,
        recoverabilityProbability: diagnosis.recoverabilityProbability,
        selectedAction: selectedArmDetails.actionId,
        verdict,
      })
    );

    return {
      decisionId,
      timestampIso,
      event,
      diagnosis,
      banditRawTopAction,
      selectedAction: selectedArmDetails.actionId,
      selectedArmDetails,
      allArms,
      verdict,
      complianceBlockedTopChoice,
      auditHash,
      deterministicRationale,
    };
  }
}

// ----------------------------------------------------------------------------
// 5. PRESET SCENARIOS FOR INTERACTIVE UI & TESTING
// ----------------------------------------------------------------------------

export const PAYREVIVE_SAMPLE_EVENTS: ReadonlyArray<{
  presetId: string;
  title: string;
  subtitle: string;
  event: FailedPaymentEvent;
}> = [
  {
    presetId: 'PAYDAY_LIQUIDITY',
    title: 'SaaS Annual Renewal — Payday Liquidity Gap ($189.00)',
    subtitle: 'Soft insufficient funds 3 days before payday; strong 88% capture history',
    event: {
      eventId: 'EVT-SBX-901',
      customerEmail: 'ops@northstar-analytics.io',
      merchantOrderRef: 'PP-SUB-88410',
      amountCents: 18900,
      currency: 'USD',
      declineCode: 'INSUFFICIENT_FUNDS',
      daysUntilPayday: 3,
      priorRetryCount30d: 1,
      historicalCaptureRate: 0.88,
      hasPayPalBackupFunding: false,
      issuerLatencyMs: 310,
      accountTenureDays: 420,
      customerOptedOutComms: false,
      localCustomerHour: 14,
      hasOpenPayPalDispute: false,
    },
  },
  {
    presetId: 'EXPIRED_CARD_WALLET_SWITCH',
    title: 'Expired Primary Card with Linked PayPal ACH ($240.00)',
    subtitle: 'Standard card retries fail; Bandit switches to PayPal Backup Funding Link',
    event: {
      eventId: 'EVT-SBX-902',
      customerEmail: 'treasury@aurora-design.co',
      merchantOrderRef: 'PP-ORD-77219',
      amountCents: 24000,
      currency: 'USD',
      declineCode: 'EXPIRED_CARD',
      daysUntilPayday: 6,
      priorRetryCount30d: 1,
      historicalCaptureRate: 0.91,
      hasPayPalBackupFunding: true,
      issuerLatencyMs: 280,
      accountTenureDays: 610,
      customerOptedOutComms: false,
      localCustomerHour: 11,
      hasOpenPayPalDispute: false,
    },
  },
  {
    presetId: 'ISSUER_GATEWAY_TIMEOUT',
    title: 'Issuer Gateway 2,640ms Timeout ($96.00)',
    subtitle: 'Transient network drop; Bandit selects low-cost $0.18 Immediate Jitter Retry',
    event: {
      eventId: 'EVT-SBX-903',
      customerEmail: 'billing@vectorcloud.dev',
      merchantOrderRef: 'PP-CAP-55103',
      amountCents: 9600,
      currency: 'USD',
      declineCode: 'ISSUER_TIMEOUT',
      daysUntilPayday: 5,
      priorRetryCount30d: 0,
      historicalCaptureRate: 0.94,
      hasPayPalBackupFunding: true,
      issuerLatencyMs: 2640,
      accountTenureDays: 515,
      customerOptedOutComms: true,
      localCustomerHour: 23,
      hasOpenPayPalDispute: false,
    },
  },
  {
    presetId: 'COMPLIANCE_HARD_DECLINE',
    title: 'Revoked Mandate / Stolen Card Hard Decline ($310.00)',
    subtitle: 'Compliance Gate deterministically blocks all retry and dunning actions',
    event: {
      eventId: 'EVT-SBX-904',
      customerEmail: 'flagged@cardholder-alert.net',
      merchantOrderRef: 'PP-ORD-11908',
      amountCents: 31000,
      currency: 'USD',
      declineCode: 'STOLEN_OR_FRAUD_CARD',
      daysUntilPayday: 2,
      priorRetryCount30d: 0,
      historicalCaptureRate: 0.76,
      hasPayPalBackupFunding: true,
      issuerLatencyMs: 190,
      accountTenureDays: 180,
      customerOptedOutComms: false,
      localCustomerHour: 13,
      hasOpenPayPalDispute: false,
    },
  },
  {
    presetId: 'NEGATIVE_EV_MICRO_PAYMENT',
    title: 'Micro-Usage Overage ($0.45) — Not Worth Retry Cost',
    subtitle: 'Expected recovery ($0.14) < $0.18 retry cost; Bandit abstains automatically',
    event: {
      eventId: 'EVT-SBX-905',
      customerEmail: 'free-tier@sandbox-user.org',
      merchantOrderRef: 'PP-MIC-00412',
      amountCents: 45,
      currency: 'USD',
      declineCode: 'INSUFFICIENT_FUNDS',
      daysUntilPayday: 11,
      priorRetryCount30d: 2,
      historicalCaptureRate: 0.32,
      hasPayPalBackupFunding: false,
      issuerLatencyMs: 260,
      accountTenureDays: 25,
      customerOptedOutComms: false,
      localCustomerHour: 15,
      hasOpenPayPalDispute: false,
    },
  },
];

// ----------------------------------------------------------------------------
// 6. 500-BATCH SIMULATION BENCHMARK (PAYREVIVE vs HAND-WRITTEN STATIC RULES)
// ----------------------------------------------------------------------------

export interface PayReviveBatchCurvePoint {
  batchNumber: number;
  payReviveCumulativeNetCents: number;
  ruleSystemCumulativeNetCents: number;
  liftPercentAtBatch: number;
}

export interface PayReviveBenchmarkReport {
  batchesSimulated: number;
  batchSize: number;
  totalFailedPaymentsEvaluated: number;
  seed: number;
  durationMs: number;
  payRevive: {
    grossRecoveredCents: number;
    actionCostSpentCents: number;
    netRecoveredCents: number;
    recoveriesSucceeded: number;
    actionsExecuted: number;
    abstainedNegativeEv: number;
    blockedByCompliance: number;
    complianceViolations: number;
    actionBreakdown: Record<RecoveryActionId, number>;
  };
  handWrittenRules: {
    grossRecoveredCents: number;
    actionCostSpentCents: number;
    netRecoveredCents: number;
    recoveriesSucceeded: number;
    actionsExecuted: number;
    complianceViolations: number;
  };
  netRecoveryLiftPercent: number;
  additionalNetRecoveredCents: number;
  shapAdditivityChecksPassed: number;
  curveCheckpoints: PayReviveBatchCurvePoint[];
  benchmarkProofHash: string;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ground-truth latent recovery probability in the payment network environment
 * for a given event and chosen recovery action.
 */
function latentTrueRecoveryProbability(
  event: FailedPaymentEvent,
  actionId: RecoveryActionId
): number {
  if (actionId === 'ABANDON_NO_ACTION') return 0;
  if (
    event.declineCode === 'STOLEN_OR_FRAUD_CARD' ||
    event.declineCode === 'REVOKED_AUTHORIZATION' ||
    event.hasOpenPayPalDispute
  ) {
    return 0;
  }

  const loyalty = 0.55 + 0.45 * event.historicalCaptureRate;

  switch (event.declineCode) {
    case 'ISSUER_TIMEOUT': {
      if (actionId === 'IMMEDIATE_JITTER_RETRY') return Math.min(0.92, 0.84 * loyalty);
      if (actionId === 'PAYDAY_SCHEDULED_SMART_RETRY') return 0.58 * loyalty;
      if (actionId === 'PAYPAL_BACKUP_FUNDING_SWITCH') return 0.54 * loyalty;
      return 0.42 * loyalty;
    }
    case 'INSUFFICIENT_FUNDS': {
      if (actionId === 'IMMEDIATE_JITTER_RETRY') {
        // Immediate retry when broke before payday almost always fails!
        return event.daysUntilPayday === 0 ? 0.56 * loyalty : 0.14 * loyalty;
      }
      if (actionId === 'PAYDAY_SCHEDULED_SMART_RETRY') {
        return event.amountCents > 32000 ? 0.46 * loyalty : 0.78 * loyalty;
      }
      if (actionId === 'SPLIT_TWO_PART_INVOICE') {
        return event.amountCents >= 18000 ? 0.81 * loyalty : 0.49 * loyalty;
      }
      if (actionId === 'PAYPAL_BACKUP_FUNDING_SWITCH') {
        return event.hasPayPalBackupFunding ? 0.71 * loyalty : 0.22 * loyalty;
      }
      if (actionId === 'FEE_WAIVER_GRACE_LINK') {
        return 0.44 * loyalty;
      }
      return 0;
    }
    case 'EXPIRED_CARD':
    case 'VELOCITY_EXCEEDED': {
      if (actionId === 'IMMEDIATE_JITTER_RETRY' || actionId === 'PAYDAY_SCHEDULED_SMART_RETRY') {
        // Retrying an expired or velocity-locked card without switching instrument fails ~94% of time
        return event.declineCode === 'EXPIRED_CARD' ? 0.03 : 0.16 * loyalty;
      }
      if (actionId === 'PAYPAL_BACKUP_FUNDING_SWITCH') {
        return event.hasPayPalBackupFunding ? 0.85 * loyalty : 0.42 * loyalty;
      }
      if (actionId === 'FEE_WAIVER_GRACE_LINK') {
        return 0.36 * loyalty;
      }
      return 0.25 * loyalty;
    }
    default:
      return 0;
  }
}

/**
 * Good Hand-Written Production Rule System Baseline:
 * Uses static fields available to rule-based dunning (declineCode, priorRetryCount30d),
 * without XGBoost payday prediction or Bandit backup-instrument selection.
 */
function selectHandWrittenRuleAction(event: FailedPaymentEvent): RecoveryActionId {
  if (
    event.declineCode === 'STOLEN_OR_FRAUD_CARD' ||
    event.declineCode === 'REVOKED_AUTHORIZATION' ||
    event.hasOpenPayPalDispute ||
    event.priorRetryCount30d >= 3
  ) {
    return 'ABANDON_NO_ACTION';
  }
  if (event.declineCode === 'ISSUER_TIMEOUT') {
    return 'IMMEDIATE_JITTER_RETRY';
  }
  const commsAllowed =
    !event.customerOptedOutComms && event.localCustomerHour >= 8 && event.localCustomerHour < 21;
  if (event.declineCode === 'INSUFFICIENT_FUNDS') {
    if (event.priorRetryCount30d <= 1) return 'IMMEDIATE_JITTER_RETRY';
    return commsAllowed ? 'FEE_WAIVER_GRACE_LINK' : 'IMMEDIATE_JITTER_RETRY';
  }
  if (event.declineCode === 'EXPIRED_CARD') {
    return commsAllowed ? 'PAYPAL_BACKUP_FUNDING_SWITCH' : 'IMMEDIATE_JITTER_RETRY';
  }
  if (event.declineCode === 'VELOCITY_EXCEEDED') {
    if (event.priorRetryCount30d === 0) return 'IMMEDIATE_JITTER_RETRY';
    return commsAllowed ? 'FEE_WAIVER_GRACE_LINK' : 'IMMEDIATE_JITTER_RETRY';
  }
  return 'ABANDON_NO_ACTION';
}

export function runPayRevive500BatchBenchmark(
  batches = 500,
  batchSize = 20,
  seed = 20261028
): PayReviveBenchmarkReport {
  const startedAt = Date.now();
  const rng = mulberry32(seed);
  const bandit = new PayReviveContextualBandit();

  let prGross = 0;
  let prCost = 0;
  let prSuccesses = 0;
  let prExecuted = 0;
  let prAbstained = 0;
  let prComplianceBlocked = 0;
  let prComplianceViolations = 0;
  let shapAdditivityChecksPassed = 0;

  const actionBreakdown: Record<RecoveryActionId, number> = {
    IMMEDIATE_JITTER_RETRY: 0,
    PAYDAY_SCHEDULED_SMART_RETRY: 0,
    PAYPAL_BACKUP_FUNDING_SWITCH: 0,
    SPLIT_TWO_PART_INVOICE: 0,
    FEE_WAIVER_GRACE_LINK: 0,
    ABANDON_NO_ACTION: 0,
  };

  let ruleGross = 0;
  let ruleCost = 0;
  let ruleSuccesses = 0;
  let ruleExecuted = 0;
  let ruleComplianceViolations = 0;

  const curveCheckpoints: PayReviveBatchCurvePoint[] = [];

  const declinePool: Array<{ code: PaymentDeclineCode; weight: number }> = [
    { code: 'INSUFFICIENT_FUNDS', weight: 0.38 },
    { code: 'EXPIRED_CARD', weight: 0.21 },
    { code: 'ISSUER_TIMEOUT', weight: 0.16 },
    { code: 'VELOCITY_EXCEEDED', weight: 0.11 },
    { code: 'STOLEN_OR_FRAUD_CARD', weight: 0.08 },
    { code: 'REVOKED_AUTHORIZATION', weight: 0.06 },
  ];

  const amountBuckets = [65, 190, 2900, 4900, 8900, 14900, 22900, 38900];

  for (let b = 1; b <= batches; b++) {
    for (let i = 0; i < batchSize; i++) {
      const rDecline = rng();
      let accW = 0;
      let declineCode: PaymentDeclineCode = 'INSUFFICIENT_FUNDS';
      for (const item of declinePool) {
        accW += item.weight;
        if (rDecline <= accW) {
          declineCode = item.code;
          break;
        }
      }

      const amountCents = amountBuckets[Math.floor(rng() * amountBuckets.length)];
      const daysUntilPayday = Math.floor(rng() * 12);
      const priorRetryCount30d = rng() < 0.16 ? 3 : Math.floor(rng() * 3);
      const historicalCaptureRate = Number((0.25 + rng() * 0.72).toFixed(2));
      const hasPayPalBackupFunding = rng() < 0.64;
      const issuerLatencyMs =
        declineCode === 'ISSUER_TIMEOUT'
          ? 1900 + Math.floor(rng() * 1800)
          : 140 + Math.floor(rng() * 450);
      const customerOptedOutComms = rng() < 0.14;
      const localCustomerHour = Math.floor(rng() * 24);
      const hasOpenPayPalDispute = rng() < 0.05;

      const event: FailedPaymentEvent = {
        eventId: `SIM-${b}-${i}`,
        customerEmail: `subscriber-${b}-${i}@sandbox.io`,
        merchantOrderRef: `PP-SIM-${b * 100 + i}`,
        amountCents,
        currency: 'USD',
        declineCode,
        daysUntilPayday,
        priorRetryCount30d,
        historicalCaptureRate,
        hasPayPalBackupFunding,
        issuerLatencyMs,
        accountTenureDays: 30 + Math.floor(rng() * 700),
        customerOptedOutComms,
        localCustomerHour,
        hasOpenPayPalDispute,
      };

      // 1. Evaluate PayRevive
      const decision = bandit.evaluateAndDecide(event);
      if (decision.diagnosis.additivityVerified) {
        shapAdditivityChecksPassed += 1;
      }

      const prAction = decision.selectedAction;
      actionBreakdown[prAction] += 1;

      const prComplianceCheck = evaluatePayReviveCompliance(event, prAction);
      if (!prComplianceCheck.allowed) {
        prComplianceViolations += 1;
      }

      if (decision.verdict === 'BLOCKED_BY_COMPLIANCE') {
        prComplianceBlocked += 1;
      } else if (decision.verdict === 'ABSTAIN_NOT_WORTH_COST') {
        prAbstained += 1;
      } else {
        prExecuted += 1;
        prCost += decision.selectedArmDetails.actionCostCents;
        const pTrue = latentTrueRecoveryProbability(event, prAction);
        const recovered = rng() < pTrue;
        bandit.updateOutcome(decision.diagnosis.predictedRootCause, prAction, recovered);
        if (recovered) {
          prSuccesses += 1;
          prGross += event.amountCents;
        }
      }

      // 2. Evaluate Hand-Written Static Rule System on exact same event
      const ruleAction = selectHandWrittenRuleAction(event);
      if (ruleAction !== 'ABANDON_NO_ACTION') {
        const ruleComp = evaluatePayReviveCompliance(event, ruleAction);
        if (!ruleComp.allowed) {
          ruleComplianceViolations += 1;
        }
        const ruleSpec = RECOVERY_ACTION_CATALOG.find((a) => a.actionId === ruleAction)!;
        ruleExecuted += 1;
        ruleCost += ruleSpec.actionCostCents;
        const pRuleTrue = latentTrueRecoveryProbability(event, ruleAction);
        if (rng() < pRuleTrue) {
          ruleSuccesses += 1;
          ruleGross += event.amountCents;
        }
      }
    }

    if (b === 1 || b % 25 === 0 || b === batches) {
      const prNetNow = prGross - prCost;
      const ruleNetNow = ruleGross - ruleCost;
      const liftNow =
        ruleNetNow > 0 ? Number((((prNetNow - ruleNetNow) / ruleNetNow) * 100).toFixed(2)) : 0;
      curveCheckpoints.push({
        batchNumber: b,
        payReviveCumulativeNetCents: prNetNow,
        ruleSystemCumulativeNetCents: ruleNetNow,
        liftPercentAtBatch: liftNow,
      });
    }
  }

  const prNet = prGross - prCost;
  const ruleNet = ruleGross - ruleCost;
  const netRecoveryLiftPercent =
    ruleNet > 0 ? Number((((prNet - ruleNet) / ruleNet) * 100).toFixed(2)) : 0;

  const totalFailedPaymentsEvaluated = batches * batchSize;
  const durationMs = Math.max(1, Date.now() - startedAt);

  const benchmarkProofHash = sha256Hex(
    canonicalJson({
      batches,
      batchSize,
      seed,
      prNet,
      ruleNet,
      netRecoveryLiftPercent,
      prComplianceViolations,
    })
  );

  return {
    batchesSimulated: batches,
    batchSize,
    totalFailedPaymentsEvaluated,
    seed,
    durationMs,
    payRevive: {
      grossRecoveredCents: prGross,
      actionCostSpentCents: prCost,
      netRecoveredCents: prNet,
      recoveriesSucceeded: prSuccesses,
      actionsExecuted: prExecuted,
      abstainedNegativeEv: prAbstained,
      blockedByCompliance: prComplianceBlocked,
      complianceViolations: prComplianceViolations,
      actionBreakdown,
    },
    handWrittenRules: {
      grossRecoveredCents: ruleGross,
      actionCostSpentCents: ruleCost,
      netRecoveredCents: ruleNet,
      recoveriesSucceeded: ruleSuccesses,
      actionsExecuted: ruleExecuted,
      complianceViolations: ruleComplianceViolations,
    },
    netRecoveryLiftPercent,
    additionalNetRecoveredCents: prNet - ruleNet,
    shapAdditivityChecksPassed,
    curveCheckpoints,
    benchmarkProofHash,
  };
}
