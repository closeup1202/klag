import type { LagSnapshot, RcaResult } from '../types/index.js'
import { detectHotPartition } from './hotPartitionDetector.js'

/**
 * 분석 오케스트레이터
 * 앞으로 detector가 추가될수록 이 파일에만 추가하면 돼요
 *
 * Week 2: HOT_PARTITION
 * Week 4: PRODUCER_BURST (예정)
 * Week 5: SLOW_CONSUMER, REBALANCE (예정)
 */
export function analyze(snapshot: LagSnapshot): RcaResult[] {
  const results: RcaResult[] = []

  // ── Hot Partition 감지 ────────────────────────────────────────
  const hotPartition = detectHotPartition(snapshot)
  if (hotPartition) results.push(hotPartition)

  // 앞으로 여기에 detector 추가
  // const burst = detectProducerBurst(snapshot)
  // if (burst) results.push(burst)

  return results
}