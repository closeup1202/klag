import type { LagSnapshot, RateSnapshot, RcaResult } from '../types/index.js'
import { detectHotPartition } from './hotPartitionDetector.js'
import { detectProducerBurst } from './burstDetector.js'

/**
 * 분석 오케스트레이터
 *
 * Week 2: HOT_PARTITION
 * Week 3: PRODUCER_BURST  ← 추가
 * Week 5: SLOW_CONSUMER, REBALANCE (예정)
 */
export function analyze(
  snapshot: LagSnapshot,
  rateSnapshot?: RateSnapshot  // optional — rate 수집 안 했을 때도 동작
): RcaResult[] {
  const results: RcaResult[] = []

  // ── Producer Burst 감지 ───────────────────────────────────────
  if (rateSnapshot) {
    const burst = detectProducerBurst(snapshot, rateSnapshot)
    if (burst) results.push(burst)
  }

  // ── Hot Partition 감지 ────────────────────────────────────────
  const hotPartition = detectHotPartition(snapshot)
  if (hotPartition) results.push(hotPartition)

  return results
}