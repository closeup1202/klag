import type { LagSnapshot, RateSnapshot, RcaResult } from '../types/index.js'

// Classify as PRODUCER_BURST if produce rate is this multiple of consume rate or higher
const BURST_RATIO_THRESHOLD = 2.0

// Only classify when produce rate is at or above this value (ignore very low traffic)
const MIN_PRODUCE_RATE = 1.0

export function detectProducerBurst(
  snapshot: LagSnapshot,
  rateSnapshot: RateSnapshot
): RcaResult | null {
  const { partitions: ratePartitions } = rateSnapshot

  if (ratePartitions.length === 0) return null

  // ── Aggregate produce/consume rate per topic ──────────────────
  const topicRateMap = new Map<string,{ totalProduce: number; totalConsume: number }>()

  for (const p of ratePartitions) {
    if (!topicRateMap.has(p.topic)) {
      topicRateMap.set(p.topic, { totalProduce: 0, totalConsume: 0 })
    }
    const entry = topicRateMap.get(p.topic)!
    entry.totalProduce += p.produceRate
    entry.totalConsume += p.consumeRate
  }

  // ── Detect BURST per topic ────────────────────────────────────
  for (const [topic, rates] of topicRateMap) {
    const { totalProduce, totalConsume } = rates

    // Ignore if produce rate is too low (idle)
    if (totalProduce < MIN_PRODUCE_RATE) continue

    // If consume rate is 0, detect directly instead of computing ratio
    const isBurst =
      totalConsume === 0
        ? totalProduce >= MIN_PRODUCE_RATE
        : totalProduce / totalConsume >= BURST_RATIO_THRESHOLD

    if (!isBurst) continue

    // Calculate totalLag for the topic
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
        `(${ratio}x difference) — consumer is falling behind ingestion rate`,
      suggestion:
        'Consider increasing consumer instances or partition count',
      details: [],
    }
  }

  return null
}
/*
Decision logic summary:

produceRate  10 msg/s
consumeRate   3 msg/s
ratio = 10 / 3 = 3.3x  >=  threshold 2.0x  →  PRODUCER_BURST ✅

produceRate  10 msg/s
consumeRate   6 msg/s
ratio = 10 / 6 = 1.6x  <   threshold 2.0x  →  normal (temporary difference)

produceRate   0.5 msg/s  <  MIN_PRODUCE_RATE 1.0  →  idle, ignored
*/
