import type { LagSnapshot, RateSnapshot, RcaResult } from "../types/index.js";
import { detectProducerBurst } from "./burstDetector.js";
import { detectHotPartition } from "./hotPartitionDetector.js";
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
    // ── Detect Producer Burst ─────────────────────────────────────
    const burst = detectProducerBurst(snapshot, rateSnapshot);
    if (burst) results.push(burst);

    // ── Slow Consumer — skip if BURST already detected for same topic ──────
    const slow = detectSlowConsumer(snapshot, rateSnapshot);
    if (
      slow &&
      !results.some(
        (r) => r.topic === slow.topic && r.type === "PRODUCER_BURST",
      )
    ) {
      results.push(slow);
    }
  }

  // ── Detect Hot Partition (By Topic) ──────────────────────────────────────
  const hotPartitions = detectHotPartition(snapshot);
  results.push(...hotPartitions);

  return results;
}
