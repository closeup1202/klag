import type { LagSnapshot, RateSnapshot, RcaResult } from "../types/index.js";
import { detectProducerBurst } from "./burstDetector.js";
import { detectHotPartition } from "./hotPartitionDetector.js";
import { detectOffsetNotMoving } from "./offsetNotMovingDetector.js";
import { detectRebalancing } from "./rebalancingDetector.js";
import { detectSlowConsumer } from "./slowConsumerDetector.js";

/**
 * Analysis orchestrator
 */
export function analyze(
  snapshot: LagSnapshot,
  rateSnapshot?: RateSnapshot, // optional — also works when rate was not collected
): RcaResult[] {
  const results: RcaResult[] = [];

  // ── Rebalancing ─────────────────────────────────────
  const rebalancing = detectRebalancing(snapshot);
  if (rebalancing) results.push(rebalancing);

  if (rateSnapshot) {
    // PRODUCER_BURST and SLOW_CONSUMER have mutually exclusive consume rate thresholds,
    // so they cannot fire for the same topic simultaneously — no dedup needed.
    // OFFSET_NOT_MOVING is mutually exclusive with SLOW_CONSUMER via produce rate threshold.
    results.push(...detectProducerBurst(snapshot, rateSnapshot));
    results.push(...detectSlowConsumer(snapshot, rateSnapshot));
    results.push(...detectOffsetNotMoving(snapshot, rateSnapshot));
  }

  // ── Detect Hot Partition (By Topic) ──────────────────────────────────────
  results.push(...detectHotPartition(snapshot));

  return results;
}
