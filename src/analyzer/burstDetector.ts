import type { LagSnapshot, RateSnapshot, RcaResult } from '../types/index.js'

// produce rate가 consume rate의 이 배수 이상이면 PRODUCER_BURST 판정
const BURST_RATIO_THRESHOLD = 2.0

// produce rate가 이 값 이상일 때만 판정 (너무 낮은 traffic은 무시)
const MIN_PRODUCE_RATE = 1.0

export function detectProducerBurst(
  snapshot: LagSnapshot,
  rateSnapshot: RateSnapshot
): RcaResult | null {
  const { partitions: ratePartitions } = rateSnapshot

  if (ratePartitions.length === 0) return null

  // ── topic별로 produce/consume rate 집계 ───────────────────────
  const topicRateMap = new Map<string,{ totalProduce: number; totalConsume: number }>()

  for (const p of ratePartitions) {
    if (!topicRateMap.has(p.topic)) {
      topicRateMap.set(p.topic, { totalProduce: 0, totalConsume: 0 })
    }
    const entry = topicRateMap.get(p.topic)!
    entry.totalProduce += p.produceRate
    entry.totalConsume += p.consumeRate
  }

  // ── topic별 BURST 판정 ────────────────────────────────────────
  for (const [topic, rates] of topicRateMap) {
    const { totalProduce, totalConsume } = rates

    // produce rate가 너무 낮으면 무시 (idle 상태)
    if (totalProduce < MIN_PRODUCE_RATE) continue

    // consume rate가 0이면 비율 계산 대신 직접 판정
    const isBurst =
      totalConsume === 0
        ? totalProduce >= MIN_PRODUCE_RATE
        : totalProduce / totalConsume >= BURST_RATIO_THRESHOLD

    if (!isBurst) continue

    // 해당 topic의 totalLag 계산
    const topicLag = snapshot.partitions
      .filter((p) => p.topic === topic)
      .reduce((sum, p) => sum + p.lag, 0n)

    if (topicLag === 0n) continue

    const produceStr = totalProduce.toFixed(1)
    const consumeStr = totalConsume.toFixed(1)
    const ratio = totalConsume === 0
      ? '∞'
      : (totalProduce / totalConsume).toFixed(1)

    return {
      type: 'PRODUCER_BURST',
      topic,
      description:
        `produce rate ${produceStr} msg/s vs consume rate ${consumeStr} msg/s ` +
        `(${ratio}x 차이) — consumer가 유입 속도를 따라가지 못하는 중`,
      suggestion:
        'consumer 인스턴스 수 또는 파티션 수 증가를 고려해보세요',
      details: [],
    }
  }

  return null
}
/*
판정 로직 정리:

produceRate  10 msg/s
consumeRate   3 msg/s
ratio = 10 / 3 = 3.3x  >=  threshold 2.0x  →  PRODUCER_BURST ✅

produceRate  10 msg/s
consumeRate   6 msg/s
ratio = 10 / 6 = 1.6x  <   threshold 2.0x  →  정상 (일시적 차이)

produceRate   0.5 msg/s  <  MIN_PRODUCE_RATE 1.0  →  idle, 무시 
*/