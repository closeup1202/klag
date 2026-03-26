import type { LagSnapshot, RateSnapshot, RcaResult } from '../types/index.js'
import { detectHotPartition } from './hotPartitionDetector.js'
import { detectProducerBurst } from './burstDetector.js'

/**
 * Analysis orchestrator
 *
 * Week 2: HOT_PARTITION
 * Week 3: PRODUCER_BURST  ← added
 * Week 5: SLOW_CONSUMER, REBALANCE (planned)
 */
export function analyze(
  snapshot: LagSnapshot,
  rateSnapshot?: RateSnapshot  // optional — also works when rate was not collected
): RcaResult[] {
  const results: RcaResult[] = []

  // ── Detect Producer Burst ─────────────────────────────────────
  if (rateSnapshot) {
    const burst = detectProducerBurst(snapshot, rateSnapshot)
    if (burst) results.push(burst)
  }

  // ── Detect Hot Partition ──────────────────────────────────────
  const hotPartition = detectHotPartition(snapshot)
  if (hotPartition) results.push(hotPartition)

  return results
}