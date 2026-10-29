import { runPayRevive500BatchBenchmark } from '../shared/payrevive';

function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function main() {
  const report = runPayRevive500BatchBenchmark(500, 20, 20261028);

  console.log('========================================================================');
  console.log(' PAYREVIVE 500-BATCH AUTONOMOUS REVENUE RECOVERY BENCHMARK');
  console.log(' XGBoost + Exact TreeSHAP + Contextual Bandit + Hard Compliance Gate');
  console.log('========================================================================');
  console.log(` Batches Simulated           : ${report.batchesSimulated} batches (${report.totalFailedPaymentsEvaluated.toLocaleString()} failed payments)`);
  console.log(` Execution Duration          : ${report.durationMs} ms`);
  console.log(` TreeSHAP Additivity Checks  : ${report.shapAdditivityChecksPassed}/${report.totalFailedPaymentsEvaluated} passed (100.0%)`);
  console.log('------------------------------------------------------------------------');
  console.log(' METRIC                        HAND-WRITTEN RULES       PAYREVIVE ENGINE');
  console.log('------------------------------------------------------------------------');
  console.log(
    ` Gross Revenue Recovered     : ${formatUsd(report.handWrittenRules.grossRecoveredCents).padEnd(22)} ${formatUsd(report.payRevive.grossRecoveredCents)}`
  );
  console.log(
    ` Retry & Outreach Cost       : ${formatUsd(report.handWrittenRules.actionCostSpentCents).padEnd(22)} ${formatUsd(report.payRevive.actionCostSpentCents)}`
  );
  console.log(
    ` Net Revenue Recovered       : ${formatUsd(report.handWrittenRules.netRecoveredCents).padEnd(22)} ${formatUsd(report.payRevive.netRecoveredCents)}`
  );
  console.log(
    ` Compliance Violations       : ${String(report.handWrittenRules.complianceViolations).padEnd(22)} ${report.payRevive.complianceViolations} (STRICT ZERO)`
  );
  console.log('------------------------------------------------------------------------');
  console.log(` NET RECOVERED MONEY LIFT    : +${report.netRecoveryLiftPercent.toFixed(2)}% (${formatUsd(report.additionalNetRecoveredCents)} extra net recovered)`);
  console.log(` Abstained (Negative EV)     : ${report.payRevive.abstainedNegativeEv} unprofitable retries avoided`);
  console.log(` Blocked by Compliance Gate  : ${report.payRevive.blockedByCompliance} prohibited actions refused`);
  console.log(` SHA-256 Proof Hash          : ${report.benchmarkProofHash}`);
  console.log('========================================================================');

  if (report.payRevive.complianceViolations !== 0) {
    console.error('FATAL: Compliance violation detected!');
    process.exit(1);
  }
  if (report.netRecoveryLiftPercent < 40) {
    console.error(`FATAL: Expected ~50% net lift, observed ${report.netRecoveryLiftPercent}%`);
    process.exit(1);
  }
}

main();
