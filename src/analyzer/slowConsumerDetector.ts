import type { LagSnapshot, RateSnapshot, RcaResult } from '../types/index.js'

const MIN_PRODUCE_RATE = 1.0
const STALLED_CONSUME_RATE = 0.1  // 사실상 멈춘 것으로 판단

export function detectSlowConsumer(
  snapshot: LagSnapshot,
  rateSnapshot: RateSnapshot
): RcaResult | null {
  const { partitions: ratePartitions } = rateSnapshot

  if (ratePartitions.length === 0) return null

  const topicRateMap = new Map<string,{ totalProduce: number; totalConsume: number }>()

  for (const p of ratePartitions) {
    if (!topicRateMap.has(p.topic)) {
      topicRateMap.set(p.topic, { totalProduce: 0, totalConsume: 0 })
    }
    const entry = topicRateMap.get(p.topic)!
    entry.totalProduce += p.produceRate
    entry.totalConsume += p.consumeRate
  }

  for (const [topic, rates] of topicRateMap) {
    const { totalProduce, totalConsume } = rates

    // produce가 활발한데 consume이 거의 0 → stalled consumer
    if (totalProduce < MIN_PRODUCE_RATE) continue
    if (totalConsume >= STALLED_CONSUME_RATE) continue

    // PRODUCER_BURST랑 겹치지 않게 — burst는 burstDetector가 담당
    // 여기선 consume이 완전히 멈춘 케이스만
    const topicLag = snapshot.partitions
      .filter((p) => p.topic === topic)
      .reduce((sum, p) => sum + p.lag, 0n)

    if (topicLag === 0n) continue

    const produceStr = totalProduce.toFixed(1)

    return {
      type: 'SLOW_CONSUMER',
      topic,
      description:
        `consumer has stalled — produce rate ${produceStr} msg/s but consume rate is near 0` +
        ` — messages are accumulating with no consumption`,
      suggestion:
        'Check if consumer process is alive, look for errors in consumer logs, or check for long GC pauses',
      details: [],
    }
  }

  return null
}