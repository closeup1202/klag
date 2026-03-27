import type { LagSnapshot, RateSnapshot, RcaResult } from '../types/index.js'
import { detectHotPartition } from './hotPartitionDetector.js'
import { detectProducerBurst } from './burstDetector.js'
import { detectSlowConsumer } from './slowConsumerDetector.js'
import { detectRebalancing } from './rebalancingDetector.js'

/**
 * Analysis orchestrator
 */
export function analyze(
  snapshot: LagSnapshot,
  rateSnapshot?: RateSnapshot  // optional — also works when rate was not collected
): RcaResult[] {
  const results: RcaResult[] = []

    // ── Rebalancing ─────────────────────────────────────
  const rebalancing = detectRebalancing(snapshot)
  if (rebalancing) results.push(rebalancing)

  if (rateSnapshot) {
    // ── Detect Producer Burst ─────────────────────────────────────
    const burst = detectProducerBurst(snapshot, rateSnapshot)
    if (burst) results.push(burst)

    // ── Slow Consumer ──────────────────────────────────────
    const slow = detectSlowConsumer(snapshot, rateSnapshot)
    if (slow) results.push(slow)
  }

  // ── Detect Hot Partition (By Topic) ──────────────────────────────────────
  const hotPartitions = detectHotPartition(snapshot)
  results.push(...hotPartitions)

  return results
}