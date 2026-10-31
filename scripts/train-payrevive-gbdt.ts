import fs from 'node:fs';
import path from 'node:path';
import { sha256Hex } from '../shared/kernel';

/**
 * Exact Second-Order Newton Gradient Boosted Decision Tree (XGBoost Formulation) Trainer
 * Reference: Chen & Guestrin (2016), "XGBoost: A Scalable Tree Boosting System", KDD '16.
 *
 * Objective: Binary Logistic Loss with L2 leaf weight regularization (lambda) and split penalty (gamma):
 *   g_i = p_i - y_i
 *   h_i = p_i * (1 - p_i)
 *   w_j* = - (sum_{i in I_j} g_i) / (sum_{i in I_j} h_i + lambda)
 *   Gain = 0.5 * [ G_L^2/(H_L + lambda) + G_R^2/(H_R + lambda) - (G_L + G_R)^2/(H_L + H_R + lambda) ] - gamma
 */

export interface TrainedTreeNode {
  cover: number;
  featureIndex?: number;
  threshold?: number;
  left?: TrainedTreeNode;
  right?: TrainedTreeNode;
  leafValue?: number;
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

function sigmoid(z: number): number {
  if (z >= 0) {
    const ez = Math.exp(-z);
    return 1 / (1 + ez);
  }
  const ez = Math.exp(z);
  return ez / (1 + ez);
}

interface LabeledSample {
  x: number[]; // 8 features
  y: 0 | 1; // whether payment is recoverable under optimal compliant treatment
}

function generateHistoricalDataset(nSamples: number, seed: number): LabeledSample[] {
  const rng = mulberry32(seed);
  const out: LabeledSample[] = [];
  for (let i = 0; i < nSamples; i++) {
    const r = rng();
    // 0: hardDecline, 1: issuerTimeout, 2: instrumentErr, else insufficientFunds
    const isHardDecline = r < 0.14 ? 1 : 0;
    const isIssuerTimeout = !isHardDecline && r < 0.30 ? 1 : 0;
    const isInstrumentError = !isHardDecline && !isIssuerTimeout && r < 0.62 ? 1 : 0;

    const daysUntilPayday = Math.floor(rng() * 15);
    const priorRetryCount30d = rng() < 0.18 ? 3 + Math.floor(rng() * 2) : Math.floor(rng() * 3);
    const historicalCaptureRate = Number((0.18 + rng() * 0.79).toFixed(3));
    const hasPayPalBackupFunding = rng() < 0.62 ? 1 : 0;
    const amountBuckets = [0.65, 1.9, 12.0, 29.0, 49.0, 89.0, 149.0, 240.0, 390.0];
    const amountDollars = amountBuckets[Math.floor(rng() * amountBuckets.length)];

    // Latent historical recoverability with unobserved exogenous noise (idiosyncratic customer shock)
    const unobservedShock = (rng() - 0.5) * 0.9;
    let latentLogit =
      -0.35 +
      1.85 * (historicalCaptureRate - 0.5) -
      0.58 * priorRetryCount30d +
      0.68 * hasPayPalBackupFunding -
      0.075 * daysUntilPayday -
      0.0014 * amountDollars +
      unobservedShock;

    if (isHardDecline) {
      latentLogit = -5.2;
    } else if (isIssuerTimeout) {
      latentLogit += 1.45;
    } else if (isInstrumentError) {
      latentLogit += hasPayPalBackupFunding ? 0.65 : -0.85;
    }
    if (priorRetryCount30d >= 3) {
      latentLogit -= 1.65;
    }

    const pTrue = isHardDecline ? 0.002 : Math.max(0.01, Math.min(0.97, sigmoid(latentLogit)));
    const y: 0 | 1 = rng() < pTrue ? 1 : 0;

    out.push({
      x: [
        isHardDecline,
        isIssuerTimeout,
        isInstrumentError,
        daysUntilPayday,
        priorRetryCount30d,
        historicalCaptureRate,
        hasPayPalBackupFunding,
        amountDollars,
      ],
      y,
    });
  }
  return out;
}

interface BoostHyperparams {
  numTrees: number;
  maxDepth: number;
  learningRate: number;
  lambdaL2: number;
  gammaSplit: number;
  minChildWeight: number;
}

function buildNewtonTree(
  X: number[][],
  g: number[],
  h: number[],
  indices: number[],
  depth: number,
  params: BoostHyperparams
): TrainedTreeNode {
  let G = 0;
  let H = 0;
  for (const idx of indices) {
    G += g[idx];
    H += h[idx];
  }
  const cover = Number(H.toFixed(2));
  const leafWeight = Number(((-G / (H + params.lambdaL2)) * params.learningRate).toFixed(4));

  if (depth >= params.maxDepth || indices.length < 16 || H < params.minChildWeight * 2) {
    return { cover: Math.max(1, cover), leafValue: leafWeight };
  }

  const numFeatures = X[0].length;
  let bestGain = 0;
  let bestFeature = -1;
  let bestThreshold = 0;
  let bestLeft: number[] = [];
  let bestRight: number[] = [];

  const parentScore = (G * G) / (H + params.lambdaL2);

  for (let f = 0; f < numFeatures; f++) {
    // Collect candidate quantiles/unique split thresholds
    const vals = Array.from(new Set(indices.map((i) => X[i][f]))).sort((a, b) => a - b);
    if (vals.length <= 1) continue;

    const candidateThresholds: number[] = [];
    const step = Math.max(1, Math.floor(vals.length / 24));
    for (let k = 0; k < vals.length - 1; k += step) {
      candidateThresholds.push(Number(((vals[k] + vals[k + 1]) / 2).toFixed(4)));
    }

    for (const thr of candidateThresholds) {
      let GL = 0;
      let HL = 0;
      for (const idx of indices) {
        if (X[idx][f] < thr) {
          GL += g[idx];
          HL += h[idx];
        }
      }
      const GR = G - GL;
      const HR = H - HL;
      if (HL < params.minChildWeight || HR < params.minChildWeight) continue;

      const gain =
        0.5 *
          ((GL * GL) / (HL + params.lambdaL2) +
            (GR * GR) / (HR + params.lambdaL2) -
            parentScore) -
        params.gammaSplit;

      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = f;
        bestThreshold = thr;
      }
    }
  }

  if (bestFeature === -1 || bestGain <= 1e-5) {
    return { cover: Math.max(1, cover), leafValue: leafWeight };
  }

  for (const idx of indices) {
    if (X[idx][bestFeature] < bestThreshold) {
      bestLeft.push(idx);
    } else {
      bestRight.push(idx);
    }
  }

  return {
    cover: Math.max(1, cover),
    featureIndex: bestFeature,
    threshold: bestThreshold,
    left: buildNewtonTree(X, g, h, bestLeft, depth + 1, params),
    right: buildNewtonTree(X, g, h, bestRight, depth + 1, params),
  };
}

function predictSingleTree(node: TrainedTreeNode, x: number[]): number {
  if (node.leafValue !== undefined || node.featureIndex === undefined || node.threshold === undefined) {
    return node.leafValue ?? 0;
  }
  return x[node.featureIndex] < node.threshold
    ? predictSingleTree(node.left!, x)
    : predictSingleTree(node.right!, x);
}

function computeRocAuc(yTrue: number[], yProb: number[]): number {
  const pairs = yTrue.map((y, i) => ({ y, p: yProb[i] })).sort((a, b) => b.p - a.p);
  let posCount = 0;
  let negCount = 0;
  for (const item of pairs) {
    if (item.y === 1) posCount++;
    else negCount++;
  }
  if (posCount === 0 || negCount === 0) return 0.5;

  let tp = 0;
  let fp = 0;
  let prevTp = 0;
  let prevFp = 0;
  let auc = 0;
  let i = 0;
  while (i < pairs.length) {
    const currentP = pairs[i].p;
    while (i < pairs.length && pairs[i].p === currentP) {
      if (pairs[i].y === 1) tp++;
      else fp++;
      i++;
    }
    auc += ((fp - prevFp) / negCount) * ((tp + prevTp) / 2 / posCount);
    prevTp = tp;
    prevFp = fp;
  }
  return Number(auc.toFixed(4));
}

function main() {
  const trainSet = generateHistoricalDataset(12_000, 20260401);
  const testSet = generateHistoricalDataset(3_000, 20260919); // Strictly disjoint seed / held-out split

  const posMean = trainSet.reduce((s, r) => s + r.y, 0) / trainSet.length;
  const baseLogOdds = Number(Math.log(posMean / (1 - posMean)).toFixed(4));

  const params: BoostHyperparams = {
    numTrees: 16,
    maxDepth: 3,
    learningRate: 0.28,
    lambdaL2: 1.5,
    gammaSplit: 0.15,
    minChildWeight: 8.0,
  };

  const XTrain = trainSet.map((r) => r.x);
  const margins = new Array<number>(trainSet.length).fill(baseLogOdds);
  const allIdx = trainSet.map((_, i) => i);
  const trees: TrainedTreeNode[] = [];

  for (let t = 0; t < params.numTrees; t++) {
    const g = new Array<number>(trainSet.length);
    const h = new Array<number>(trainSet.length);
    for (let i = 0; i < trainSet.length; i++) {
      const p = sigmoid(margins[i]);
      g[i] = p - trainSet[i].y;
      h[i] = Math.max(1e-6, p * (1 - p));
    }
    const tree = buildNewtonTree(XTrain, g, h, allIdx, 0, params);
    trees.push(tree);
    for (let i = 0; i < trainSet.length; i++) {
      margins[i] += predictSingleTree(tree, XTrain[i]);
    }
  }

  // Evaluate strictly on held-out 3,000-sample test split
  const yTest = testSet.map((r) => r.y);
  const pTest = testSet.map((r) => {
    let m = baseLogOdds;
    for (const tree of trees) m += predictSingleTree(tree, r.x);
    return sigmoid(m);
  });

  const testRocAuc = computeRocAuc(yTest, pTest);
  const testBrierScore = Number(
    (
      yTest.reduce<number>((acc, y, idx) => acc + Math.pow(pTest[idx] - y, 2), 0) / yTest.length
    ).toFixed(4)
  );
  const testLogLoss = Number(
    (
      -yTest.reduce<number>(
        (acc, y, idx) =>
          acc +
          y * Math.log(Math.max(1e-7, pTest[idx])) +
          (1 - y) * Math.log(Math.max(1e-7, 1 - pTest[idx])),
        0
      ) / yTest.length
    ).toFixed(4)
  );

  const artifactHash = sha256Hex({ baseLogOdds, params, trees });

  const outPath = path.resolve(process.cwd(), 'shared', 'payreviveModelArtifact.ts');
  const fileContent = `// AUTO-GENERATED BY scripts/train-payrevive-gbdt.ts — DO NOT HAND-EDIT
// Second-Order Newton Gradient Boosted Decision Tree Ensemble (Chen & Guestrin XGBoost Formulation)
// Trained on N=12,000 samples | Evaluated on Held-Out Test Split N=3,000

export interface GBDTNodeArtifact {
  cover: number;
  featureIndex?: number;
  threshold?: number;
  left?: GBDTNodeArtifact;
  right?: GBDTNodeArtifact;
  leafValue?: number;
}

export const PAYREVIVE_MODEL_METADATA = {
  algorithm: 'Exact Second-Order Newton GBDT (XGBoost Logistic Objective)',
  trainSamples: 12000,
  heldOutTestSamples: 3000,
  numTrees: ${params.numTrees},
  maxDepth: ${params.maxDepth},
  learningRate: ${params.learningRate},
  lambdaL2: ${params.lambdaL2},
  heldOutRocAuc: ${testRocAuc},
  heldOutBrierScore: ${testBrierScore},
  heldOutLogLoss: ${testLogLoss},
  artifactSha256: '${artifactHash}',
} as const;

export const TRAINED_GBDT_BASE_LOG_ODDS = ${baseLogOdds};

export const TRAINED_PAYREVIVE_GBDT_TREES: ReadonlyArray<GBDTNodeArtifact> = ${JSON.stringify(
    trees,
    null,
    2
  )};
`;

  fs.writeFileSync(outPath, fileContent, 'utf8');
  console.log('[GBDT TRAINER] Wrote trained 16-tree ensemble -> shared/payreviveModelArtifact.ts');
  console.log({
    baseLogOdds,
    heldOutRocAuc: testRocAuc,
    heldOutBrierScore: testBrierScore,
    heldOutLogLoss: testLogLoss,
    artifactSha256: artifactHash,
  });
}

main();
